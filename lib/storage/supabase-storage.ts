import "server-only";
import type { PreparedUpload } from "@/lib/uploads";

/**
 * Where ID documents live.
 *
 * The portal reads and writes SQL through `pg` (`lib/db/client.ts`), but the
 * **documents stay in Supabase Storage**, in the private `documents` bucket
 * migration 1 created and `public = false` as migration 31 forces it. Three
 * reasons it is not a folder on disk:
 *
 *   * the bucket already holds the production documents, so moving them is a
 *     separate data migration with its own failure modes;
 *   * a signed URL with an expiry, and a bucket nothing can list, is a better
 *     answer than a path under `process.cwd()` that a mis-set reverse proxy
 *     can serve directly;
 *   * on a host with an ephemeral filesystem (Vercel, a container rebuilt on
 *     deploy) a local folder loses every upload, silently, on the next push.
 *
 * It is the one place in the codebase that still talks to Supabase's own API,
 * and it talks to **Storage only** - never PostgREST, never Auth, never
 * Realtime. The service-role key is used server-side and never reaches a
 * browser; `NEXT_PUBLIC_SUPABASE_URL` is accepted for the deployments that
 * already set it, but `SUPABASE_URL` is preferred so the project URL need not
 * be in the client bundle at all.
 *
 * With neither variable set (a fresh clone, the test suites) the caller falls
 * back to the local folder - see `localDocumentStore` in `lib/storage/local.ts`.
 */

export const DOCUMENT_BUCKET = "documents";

export function storageUrl(): string | null {
  return process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? null;
}

export function storageKey(): string | null {
  return process.env.SUPABASE_SERVICE_ROLE_KEY ?? null;
}

export function supabaseStorageConfigured(): boolean {
  return Boolean(storageUrl() && storageKey());
}

export interface DocumentStore {
  save(file: PreparedUpload, folder: string): Promise<string>;
  signedUrl(storedPath: string, seconds: number): Promise<string | null>;
  remove(storedPath: string): Promise<void>;
}

type StorageClient = {
  storage: {
    from: (bucket: string) => {
      upload: (
        path: string,
        body: Uint8Array,
        options: { contentType: string; upsert: boolean }
      ) => Promise<{ error: { message: string } | null }>;
      createSignedUrl: (
        path: string,
        seconds: number
      ) => Promise<{ data: { signedUrl: string } | null; error: { message: string } | null }>;
      remove: (paths: string[]) => Promise<{ error: { message: string } | null }>;
    };
  };
};

let client: StorageClient | null = null;

/**
 * Loaded on demand, so a deployment that never uploads a document (and the
 * unit suites, which run on the mock store) never constructs it.
 */
async function getClient(): Promise<StorageClient> {
  if (client) return client;
  const url = storageUrl();
  const key = storageKey();
  if (!url || !key) throw new Error("Supabase Storage is not configured");
  const { createClient } = await import("@supabase/supabase-js");
  client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  }) as unknown as StorageClient;
  return client;
}

export class SupabaseDocumentStore implements DocumentStore {
  async save(file: PreparedUpload, folder: string): Promise<string> {
    const path = `${folder}/${file.name}`;
    const db = await getClient();
    const { error } = await db.storage.from(DOCUMENT_BUCKET).upload(path, file.bytes, {
      contentType: file.type,
      upsert: false,
    });
    if (error) throw new Error(`Upload failed: ${error.message}`);
    return path;
  }

  async signedUrl(storedPath: string, seconds: number): Promise<string | null> {
    const db = await getClient();
    const { data, error } = await db.storage
      .from(DOCUMENT_BUCKET)
      .createSignedUrl(storedPath, seconds);
    if (error || !data) return null;
    return data.signedUrl;
  }

  async remove(storedPath: string): Promise<void> {
    const db = await getClient();
    await db.storage.from(DOCUMENT_BUCKET).remove([storedPath]);
  }
}
