import { rm } from "node:fs/promises";
import path from "node:path";

/**
 * Start every run from an empty throwaway database.
 *
 * Seeded demo data is rebuilt on first load, so there is nothing to preserve.
 */
export default async function globalSetup(): Promise<void> {
  const db = process.env.E2E_DB ?? "./.e2e-db.json";
  await rm(path.resolve(db), { force: true });
}
