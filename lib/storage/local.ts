import "server-only";
import fs from "node:fs";
import path from "node:path";
import type { PreparedUpload } from "@/lib/uploads";
import type { DocumentStore } from "./supabase-storage";

/**
 * The fallback: a folder under the working directory, used when Supabase
 * Storage is not configured. That is a fresh clone, the unit suites and the
 * Playwright run - never a deployment holding real documents, because the
 * folder does not survive a redeploy on an ephemeral host and nothing stops a
 * mis-set reverse proxy serving it.
 *
 * `assertEnv()` refuses to start a production server with no storage
 * configured, so this path cannot be reached by accident in production.
 */
export const UPLOAD_DIR = path.join(process.cwd(), ".uploads");

export const localDocumentStore: DocumentStore = {
  async save(file: PreparedUpload, folder: string): Promise<string> {
    const dir = path.join(UPLOAD_DIR, folder);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, file.name), Buffer.from(file.bytes));
    return `${folder}/${file.name}`;
  },
  async signedUrl(storedPath: string): Promise<string | null> {
    const onDisk = path.join(UPLOAD_DIR, storedPath);
    return fs.existsSync(onDisk) ? `/api/documents/${storedPath}` : null;
  },
  async remove(storedPath: string): Promise<void> {
    try {
      fs.rmSync(path.join(UPLOAD_DIR, storedPath), { force: true });
    } catch {
      /* already gone */
    }
  },
};
