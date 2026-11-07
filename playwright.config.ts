import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests (Phase 9): the journeys the office actually cares about,
 * driven through a real browser against a real build.
 *
 * The server is started by Playwright itself, in production mode, against the
 * **mock store on a throwaway database file** (`MOCK_DB_PATH`) - a test run
 * can never touch a developer's `.local-db.json`, let alone the hosted
 * project.
 *
 * Sign-in uses the test-only `/api/auth/test-sign-in` route, gated by the
 * `E2E_TEST_SECRET` env var: it accepts an email and the secret, looks up
 * the profile, and starts a session without a password.
 */
const PORT = Number(process.env.E2E_PORT ?? 3100);
const DB = process.env.E2E_DB ?? "./.e2e-db.json";

/**
 * The shared secret `/api/auth/test-sign-in` is gated on.
 *
 * It has to reach **two** processes: the server Playwright spawns (through
 * `webServer.env` below) and the **test runner itself**, because `signIn()` in
 * `e2e/helpers.ts` reads `process.env.E2E_TEST_SECRET` to put in the request
 * body. `webServer.env` only applies to the child, so setting it there alone
 * left every journey failing on "E2E_TEST_SECRET is not set" before it had
 * opened a page. Assigning it here covers both: this module is evaluated in
 * the runner.
 */
const TEST_SECRET = process.env.E2E_TEST_SECRET ?? "e2e-test-secret-0123456789";
process.env.E2E_TEST_SECRET = TEST_SECRET;

export default defineConfig({
  testDir: "./e2e",
  // Wipes the throwaway database first — see the file for why.
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    // The public site has to work on the phone the guidelines are read on.
    { name: "phone", use: { ...devices["Pixel 5"], viewport: { width: 320, height: 720 } }, testMatch: /public-site\.spec\.ts/ },
  ],
  webServer: {
    command: `npx next start -p ${PORT}`,
    url: `http://127.0.0.1:${PORT}/sign-in`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      NODE_ENV: "production",
      MOCK_DB_PATH: DB,
      // **Google off, explicitly.** Next loads `.env.local` for `next start`
      // too, so a developer who has put real Google credentials there used to
      // change what this suite was testing: `googleOauth()` became non-null,
      // the account picker closed (`mockLoginEnabled()`), and every journey
      // failed at sign-in with no hint why. An empty value in the process
      // environment beats `.env.local`, which is the same trick
      // `NEXT_PUBLIC_SUPABASE_URL=` uses to select the mock store.
      GOOGLE_CLIENT_ID: "",
      GOOGLE_CLIENT_SECRET: "",
      // **And the hosted project off, for the same reason and a worse one.**
      // `.env.local` points at the real Supabase project, and `next start`
      // reads it: without these the suite would select `PostgresStore` and
      // write to the production database, and `getDocumentStore()` would put
      // every e2e ID document into the production `documents` bucket.
      // `ALLOW_MOCK_STORE` only tells `assertEnv()` not to insist on them -
      // it does not unset them.
      DATABASE_URL: "",
      SUPABASE_URL: "",
      NEXT_PUBLIC_SUPABASE_URL: "",
      SUPABASE_SERVICE_ROLE_KEY: "",
      ALLOW_MOCK_STORE: "true",
      MAIL_DRY_RUN: "true",
      APP_URL: `http://127.0.0.1:${PORT}`,
      CRON_SECRET: "e2e-cron-secret-0123456789",
      E2E_TEST_SECRET: TEST_SECRET,
      ID_ENCRYPTION_KEY: "BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc=",
    },
  },
});
