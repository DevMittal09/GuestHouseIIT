import path from "path";
import { defineConfig } from "vitest/config";

/**
 * Unit and store tests (`tests/**`). Run with `npm test`.
 *
 * - `TZ=UTC` on purpose: the app must behave as institute time whatever the
 *   process zone is (`lib/tz.ts`), and a UTC host is where that bug bit.
 * - Store tests use the mock store on a throwaway file (`MOCK_DB_PATH`, set per
 *   test file), never the developer's `.local-db.json`.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      // The package throws unless bundled for the server; tests are server code.
      "server-only": path.resolve(__dirname, "tests/stubs/server-only.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    env: { TZ: "UTC", NEXT_PUBLIC_SUPABASE_URL: "" },
    // Store tests share one JSON file per worker; keep files isolated.
    pool: "forks",
    // Store tests do real file I/O and run in parallel; the defaults (5 s /
    // 10 s) are too tight on a busy Windows machine.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
