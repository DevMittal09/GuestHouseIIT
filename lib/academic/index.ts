import type { Profile } from "@/lib/types";
import { academicRecordKindFor } from "./fields";
import { HttpAcademicSource, type AcademicDbConfig } from "./http-source";
import { MockAcademicSource } from "./mock-source";
import type { AcademicRecord, AcademicSource } from "./types";

export {
  AcademicSourceUnavailableError,
  type AcademicRecord,
  type AcademicRecordKind,
  type AcademicSource,
} from "./types";

/**
 * Picks the academic database from the environment, like `getStore()`,
 * `getMailer()` and `getDirectory()`:
 *
 * | Condition             | Source                | Records come from               |
 * | --------------------- | --------------------- | ------------------------------- |
 * | `ACADEMIC_DB_URL` set | `HttpAcademicSource`  | the institute's academic database |
 * | otherwise             | `MockAcademicSource`  | `lib/academic/mock-source.ts`   |
 *
 * `.env.example` documents the variables.
 */
export function getAcademicSource(): AcademicSource {
  const config = academicDbConfig();
  return config ? new HttpAcademicSource(config) : new MockAcademicSource();
}

/** True while the records shown are the dummy ones — the card says so. */
export function isMockAcademicSource(): boolean {
  return !process.env.ACADEMIC_DB_URL?.trim();
}

function academicDbConfig(): AcademicDbConfig | null {
  const url = process.env.ACADEMIC_DB_URL?.trim();
  if (!url) return null;
  return { url, token: process.env.ACADEMIC_DB_TOKEN?.trim() || null };
}

export type AcademicLookup =
  | { status: "found"; record: AcademicRecord }
  /** The database answered and has no record for this email. */
  | { status: "not_found" }
  /** The database could not be asked. Logged; the page falls back to the portal profile. */
  | { status: "unavailable" }
  /** An account the academic database does not describe: manager, caretaker, FA, developer. */
  | { status: "not_applicable" };

/**
 * Answers are kept for a while because the portal re-renders every page every
 * five seconds (`components/auto-refresh.tsx`), and a booking form left open
 * would otherwise ask the academic database twelve times a minute. An outage
 * is kept for less, so the card recovers soon after the database does.
 *
 * In-process: each server instance keeps its own, which is fine for a cache —
 * nothing depends on two instances agreeing.
 */
const ANSWER_TTL_MS = 10 * 60_000;
const OUTAGE_TTL_MS = 60_000;
const MAX_CACHED = 5000;
const cache = new Map<string, { expires: number; lookup: AcademicLookup }>();

/**
 * This person's academic record. Never throws: a missing or unreachable
 * database must not stop anyone booking, so the caller gets a status and
 * shows the portal profile instead.
 */
export async function academicRecordFor(profile: Profile): Promise<AcademicLookup> {
  const kind = academicRecordKindFor(profile.role);
  if (!kind) return { status: "not_applicable" };

  const email = profile.email.trim().toLowerCase();
  const key = `${kind}:${email}`;
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.lookup;

  let lookup: AcademicLookup;
  try {
    const record = await getAcademicSource().find(kind, email);
    lookup = record ? { status: "found", record } : { status: "not_found" };
  } catch (e) {
    // The kind, not the email: the log should not become a list of who booked.
    console.error(`[academic] ${kind} lookup failed:`, e instanceof Error ? e.message : e);
    lookup = { status: "unavailable" };
  }

  if (cache.size >= MAX_CACHED) cache.clear();
  cache.set(key, {
    expires: Date.now() + (lookup.status === "unavailable" ? OUTAGE_TTL_MS : ANSWER_TTL_MS),
    lookup,
  });
  return lookup;
}
