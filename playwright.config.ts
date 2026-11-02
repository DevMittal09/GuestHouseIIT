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
      APP_URL: `http://127.0.0.1:${PORT}`,
      CRON_SECRET: "e2e-cron-secret-0123456789",
      E2E_TEST_SECRET: "e2e-test-secret-0123456789",
      ID_ENCRYPTION_KEY: "BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc=",
    },
  },
});
