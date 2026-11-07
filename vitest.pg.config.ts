import path from "path";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

/**
 * The PostgreSQL suite (`tests-pg/`), run with `npm run test:pg`.
 *
 * `npm test` runs on the mock store and needs no database; this one drives
 * the real server actions against **`PostgresStore` on a real PostgreSQL**,
 * which is the production store and which nothing tested until 7 Nov 2026 -
 * four write faults reached the owner in one day for want of it.
 *
 * The database is **created fresh on every run** by `tests-pg/global-setup.ts`
 * from `scripts/init-postgres.sql`, and is never the one the app uses:
 *
 *   - `PG_TEST_URL` if set (CI sets it to a service container), otherwise
 *   - `DATABASE_URL` from the environment or `.env.local` with the database
 *     name replaced by `gh_test`.
 *
 * `assertTestDatabase` refuses any URL whose database name does not contain
 * "test", so a typo cannot drop a real database.
 */
const env = { ...loadEnv("test", process.cwd(), ""), ...process.env };

function testDatabaseUrl(): string {
  if (env.PG_TEST_URL) return env.PG_TEST_URL;
  if (!env.DATABASE_URL) {
    throw new Error("test:pg needs PG_TEST_URL or DATABASE_URL (in .env.local) to find a PostgreSQL server");
  }
  const url = new URL(env.DATABASE_URL);
  url.pathname = "/gh_test";
  return url.toString();
}

const url = testDatabaseUrl();
const name = new URL(url).pathname.replace(/^\//, "");
if (!/test/i.test(name)) {
  throw new Error(`test:pg refuses to run against database "${name}": its name must contain "test"`);
}
// `test.env` reaches the workers only; the global setup runs here.
process.env.PG_TEST_URL = url;

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      "server-only": path.resolve(__dirname, "tests/stubs/server-only.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["tests-pg/**/*.pg.test.ts"],
    globalSetup: ["tests-pg/global-setup.ts"],
    setupFiles: ["tests-pg/setup.ts"],
    // One database, so one file at a time; each file starts from no bookings.
    fileParallelism: false,
    pool: "forks",
    testTimeout: 60_000,
    hookTimeout: 120_000,
    env: {
      TZ: "UTC",
      DATABASE_URL: url,
      PG_TEST_URL: url,
      // Nothing leaves the machine: the outbox is real, the transport is not.
      MAIL_DRY_RUN: "true",
      MAIL_REDIRECT_ALL_TO: "",
      NODE_ENV: "test",
    },
  },
});
