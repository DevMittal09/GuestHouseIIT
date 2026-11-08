#!/usr/bin/env node
/**
 * Put **the office's own reference data** into a PostgreSQL database: the two
 * guest houses, their rooms, and the tariff sheet.
 *
 *   npm run seed:reference              # apply
 *   npm run seed:reference -- --dry-run # print what is missing, write nothing
 *
 * Written on 8 Nov 2026, when the owner's `guesthouse_dev` was found to hold
 * the nine meal rates and **no room rate at all**. Nothing in the repository
 * had ever seeded rates into PostgreSQL: `scripts/init-postgres.sql` carried
 * the sheet, but resolved the guest house ids with a subselect against a
 * table it had just created empty, and `where (s.item <> 'room' or s.gh is
 * not null)` then dropped every room row. The guest houses used to arrive
 * afterwards from `supabase/seed.sql`, which went with Supabase. So the
 * booking form's tariff panel read "no rates published" and no invoice could
 * be issued.
 *
 * **The SQL is `scripts/seed-reference-data.sql`** - one home for the rate
 * sheet. This file only loads `.env.local`, reports what the database is
 * missing, and runs it. It is idempotent: guest houses are matched by their
 * fixed ids, rooms are written only into a guest house that has none, and a
 * rate is written only where none with the same scope and effective date
 * exists (`tariffs_guard` refuses an update or a delete of a rate in force,
 * so this only ever inserts).
 *
 * Run order on a fresh database:
 *   psql "$DATABASE_URL" -f scripts/init-postgres.sql
 *   npm run seed:reference
 *   npm run seed:personas
 */

import fs from "node:fs";
import path from "node:path";
import { Client } from "pg";

/** `.env.local`, with inline `# comments` stripped from unquoted values. */
function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const m = /^\s*([\w.-]+)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    const [, key] = m;
    let value = m[2].trim();
    if (/^(['"]).*\1$/.test(value)) value = value.slice(1, -1);
    else value = value.replace(/\s+#.*$/, "").trim();
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

const SQL_FILE = "scripts/seed-reference-data.sql";
const dryRun = process.argv.slice(2).includes("--dry-run");

/** What the three tables hold, for the before/after report. */
async function census(client) {
  const { rows } = await client.query(`
    select
      (select count(*) from public.guest_houses) as guest_houses,
      (select count(*) from public.rooms where is_active) as rooms,
      (select count(*) from public.tariffs) as tariffs,
      (select count(*) from public.tariffs where item = 'room') as room_rates,
      (select count(*) from public.tariffs where item in ('breakfast','lunch','dinner')) as meal_rates,
      (select count(*) from public.tariffs where item = 'extra_bed') as extra_bed_rates`);
  return rows[0];
}

function report(label, c) {
  console.log(
    `${label}: ${c.guest_houses} guest houses, ${c.rooms} active rooms, ` +
      `${c.tariffs} rates (${c.room_rates} room, ${c.meal_rates} meal, ${c.extra_bed_rates} extra bed)`
  );
}

async function main() {
  loadEnv(path.join(process.cwd(), ".env.local"));
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL is not set. Put it in .env.local or the environment.");
    process.exit(1);
  }
  const sql = fs.readFileSync(path.join(process.cwd(), SQL_FILE), "utf8");

  const client = new Client({
    connectionString,
    ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined,
  });
  await client.connect();
  console.log(`Database: ${connectionString.replace(/:\/\/[^:]+:[^@]*@/, "://***@")}`);

  try {
    const before = await census(client);
    report("Before", before);

    if (dryRun) {
      console.log(`\nDry run: ${SQL_FILE} not run. Nothing was written.`);
      return;
    }

    await client.query(sql);
    const after = await census(client);
    report("After ", after);

    const added = after.tariffs - before.tariffs;
    console.log(
      added > 0
        ? `\n${added} rate(s) added from ${SQL_FILE}.`
        : `\nNothing to add - the database already had the whole sheet.`
    );
    if (Number(after.extra_bed_rates) === 0) {
      console.log(
        "Note: there is no extra_bed rate, here or in the office's sheet. An invoice\n" +
          "for a stay with an extra bed cannot be issued until the office supplies the\n" +
          "figure and the manager adds it at Console -> Tariffs & Invoicing."
      );
    }
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
