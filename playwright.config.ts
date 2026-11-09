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
process.env.E2E_TEST_SECRET ??= "e2e-test-secret-0123456789";

const PORT = Number(process.env.E2E_PORT ?? 3100);
const DB = process.env.E2E_DB ?? "./.e2e-db.json";

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
      ALLOW_MOCK_STORE: "true",
      MAIL_DRY_RUN: "true",
      // Empty beats `.env.local`, which points at the shared database: the
      // journeys must never touch it. `ALLOW_MOCK_STORE` is what lets a
      // production build run on the JSON file instead.
      DATABASE_URL: "",
      /*
       * **Google is switched off here, explicitly, the same way
       * `DATABASE_URL` is.**
       *
       * Not merely "left unset": `next start` loads `.env.local`, and a
       * developer whose `.env.local` holds real Google credentials was
       * getting a *different suite* from CI, which has no `.env.local` at
       * all. On that machine the sign-in door became Google's,
       * `/mock-login` closed, and one journey navigated out to
       * `accounts.google.com` **carrying the owner's real client id** - which
       * also means Google saw traffic from a test run.
       *
       * Blanking both makes the harness hermetic: one door, the account
       * picker, on every machine. `envProblems` exempts them under
       * `ALLOW_MOCK_STORE` so the production startup check still passes.
       * `AGENTS.md` has said *don't set these in CI* since 30 Oct 2026; this
       * is what it takes to actually hold.
       */
      GOOGLE_CLIENT_ID: "",
      GOOGLE_CLIENT_SECRET: "",
      APP_URL: `http://127.0.0.1:${PORT}`,
      CRON_SECRET: "e2e-cron-secret-0123456789",
      E2E_TEST_SECRET: process.env.E2E_TEST_SECRET,
      ID_ENCRYPTION_KEY: "BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc=",
    },
  },
});
