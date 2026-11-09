import { execFileSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { Client } from "pg";

/**
 * Build the PostgreSQL test database from nothing, once per run:
 * drop and create it, load `scripts/init-postgres.sql` (the schema a real
 * install is created from), add two guest houses with rooms and rates, and
 * seed the 29 personas with `scripts/seed-personas.mjs` - the same script an
 * install uses, so the suite tests what is deployed rather than a fixture.
 *
 * The URL comes from `vitest.pg.config.ts`, which has already refused any
 * database whose name does not contain "test".
 */
export default async function setup(): Promise<void> {
  const url = process.env.PG_TEST_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error("PG_TEST_URL is not set - run through `npm run test:pg`");
  const target = new URL(url);
  const name = target.pathname.replace(/^\//, "");
  if (!/test/i.test(name) || !/^[a-z0-9_]+$/i.test(name)) {
    throw new Error(`refusing to rebuild database "${name}"`);
  }

  const admin = new URL(url);
  admin.pathname = "/postgres";
  const a = new Client({ connectionString: admin.toString() });
  await a.connect();
  await a.query(`drop database if exists ${name} with (force)`);
  await a.query(`create database ${name}`);
  await a.end();

  const c = new Client({ connectionString: url });
  await c.connect();
  try {
    await c.query(fs.readFileSync(path.resolve("scripts/init-postgres.sql"), "utf8"));
    await seedGuestHouses(c);
  } finally {
    await c.end();
  }

  execFileSync(process.execPath, [path.resolve("scripts/seed-personas.mjs")], {
    env: { ...process.env, DATABASE_URL: url },
    stdio: "pipe",
  });
}

/**
 * Bageshri (no kitchen) and Hamsanandi (a kitchen), four double rooms each,
 * and a rate for everything an invoice prices - from 1 Jan 2026, so every
 * stay the tests make is priced. Written here rather than in the persona
 * seeder, which deliberately never touches guest houses.
 */
async function seedGuestHouses(c: Client): Promise<void> {
  const houses: [string, boolean, string][] = [
    ["Bageshri", false, "B"],
    ["Hamsanandi", true, "H"],
  ];
  for (const [name, meals, prefix] of houses) {
    const {
      rows: [gh],
    } = await c.query(
      "insert into guest_houses (name, serves_meals) values ($1, $2) returning id",
      [name, meals]
    );
    for (let n = 1; n <= 4; n++) {
      await c.query(
        "insert into rooms (guest_house_id, room_number, room_type) values ($1, $2, 'double_sharing')",
        [gh.id, `${prefix}-10${n}`]
      );
    }
    for (const [i, category] of ["I", "II", "III"].entries()) {
      await c.query("insert into tariffs (guest_house_id, item, tariff_category, rate, effective_from) values ($1, 'room', $2, $3, '2026-01-01')", [gh.id, category, (meals ? 1500 : 1000) + i * 500]);
    }
    const rates: [string, string | null, number][] = [
      ["room", "double_sharing", meals ? 1500 : 1000],
      ["extra_bed", "double_sharing", 300],
      ...(meals
        ? ([
            ["breakfast", null, 100],
            ["lunch", null, 150],
            ["dinner", null, 150],
          ] as [string, null, number][])
        : []),
    ];
    for (const [item, roomType, rate] of rates) {
      await c.query(
        "insert into tariffs (guest_house_id, item, room_type, rate, effective_from) values ($1, $2, $3, $4, '2026-01-01')",
        [gh.id, item, roomType, rate]
      );
    }
  }
}
