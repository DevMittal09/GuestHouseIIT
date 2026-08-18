import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

export function supabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  );
}

let client: SupabaseClient<Database> | null = null;

/**
 * Server-side Supabase client. Uses the service-role key when available
 * (all data access happens through server actions with app-level auth checks);
 * falls back to the anon key + RLS.
 */
export function getSupabase(): SupabaseClient<Database> {
  if (!client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const key =
      process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    client = createClient<Database>(url, key, { auth: { persistSession: false } });
  }
  return client;
}
