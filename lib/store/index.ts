import { databaseConfigured } from "@/lib/db/client";
import { MockStore } from "./mock";
import { PostgresStore } from "./postgres";
import type { DataStore } from "./types";

let store: DataStore | null = null;

/**
 * Returns the active data store: PostgreSQL when DATABASE_URL is set,
 * otherwise a zero-setup local mock backed by .local-db.json (delete that
 * file to reset demo data).
 */
export function getStore(): DataStore {
  if (!store) {
    store = databaseConfigured() ? new PostgresStore() : new MockStore();
  }
  return store;
}

export type { DataStore } from "./types";
