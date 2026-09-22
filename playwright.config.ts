import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests (Phase 9): the journeys the office actually cares about,
 * driven through a real browser against a real build.
 *
 * The server is started by Playwright itself, in production mode, against the
 * **mock store on a throwaway database file** (`MOCK_DB_PATH`) — a test run
 * can never touch a developer's `.local-db.json`, let alone the hosted
 * project.
 *
 * Each test signs in the way a person does — the LDAP form, against the dummy
 * directory — because the developer sign-in door does not exist in a
 * production build, which is exactly what these tests are running against.
 */
const PORT = Number(process.env.E2E_PORT ?? 3100);
const DB = process.env.E2E_DB ?? "./.e2e-db.json";

export default defineConfig({
  testDir: "./e2e",
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
      NEXT_PUBLIC_SUPABASE_URL: "",
      ALLOW_MOCK_STORE: "true",
      MAIL_DRY_RUN: "true",
      APP_URL: `http://127.0.0.1:${PORT}`,
      CRON_SECRET: "e2e-cron-secret-0123456789",
      ID_ENCRYPTION_KEY: "BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc=",
    },
  },
});
