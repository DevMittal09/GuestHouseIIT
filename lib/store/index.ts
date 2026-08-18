import { supabaseConfigured } from "@/lib/supabase/client";
import { MockStore } from "./mock";
import { SupabaseStore } from "./supabase";
import type { DataStore } from "./types";

let store: DataStore | null = null;

/**
 * Returns the active data store: Supabase when NEXT_PUBLIC_SUPABASE_URL (+ a
 * key) is set in .env.local, otherwise a zero-setup local mock backed by
 * .local-db.json (delete that file to reset demo data).
 */
export function getStore(): DataStore {
  if (!store) {
    store = supabaseConfigured() ? new SupabaseStore() : new MockStore();
  }
  return store;
}

export type { DataStore } from "./types";
