import "server-only";
import { localDocumentStore } from "./local";
import {
  SupabaseDocumentStore,
  supabaseStorageConfigured,
  type DocumentStore,
} from "./supabase-storage";

let store: DocumentStore | null = null;

/**
 * Which document store this deployment uses - the same shape of decision as
 * `getStore()` and `getMailer()`: Supabase Storage when the project URL and
 * the service-role key are set, the local folder otherwise.
 */
export function getDocumentStore(): DocumentStore {
  if (!store) {
    store = supabaseStorageConfigured() ? new SupabaseDocumentStore() : localDocumentStore;
  }
  return store;
}

export { supabaseStorageConfigured } from "./supabase-storage";
export type { DocumentStore } from "./supabase-storage";
