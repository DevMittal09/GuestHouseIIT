import { rm } from "node:fs/promises";
import path from "node:path";

/**
 * Start every run from an empty throwaway database.
 *
 * The mock store keeps the sign-in throttle in the database it writes
 * (`rate_limits`, `RATE_LIMITS.signIn`: 8 attempts per uid per 15 minutes).
 * Without this, running the suite twice inside that window signs the same
 * dummy accounts in often enough to lock them out, and the journeys fail on a
 * sign-in that has nothing wrong with it — a failure that looks like a bug in
 * the portal and is not. Seeded demo data is rebuilt on first load, so there
 * is nothing to preserve.
 */
export default async function globalSetup(): Promise<void> {
  const db = process.env.E2E_DB ?? "./.e2e-db.json";
  await rm(path.resolve(db), { force: true });
}
