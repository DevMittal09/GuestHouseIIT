import { getStore } from "@/lib/store";
import { MockAcademicSource } from "./mock-source";
import {
  AcademicSourceUnavailableError,
  type AcademicFind,
  type AcademicRecord,
  type AcademicRecordKind,
  type AcademicSource,
} from "./types";

/**
 * The records the guest house office pasted in itself (migration 28, 7 Oct
 * 2026) - the portal's own copy, and the source every lookup goes through
 * while the institute's academic database is unconnected.
 *
 * The office asked for "student guest details from your own database" because
 * the real one does not exist yet and nobody could say when it would, while
 * the booking form needs a student's parents *now*: from this round it locks
 * Father and Mother to the names on record, and there has to be a record to
 * lock them to.
 *
 * **The dummy records are still behind it.** A row the office has imported
 * wins; where there is none, the demo personas fall through to
 * `MockAcademicSource` exactly as they did before, so a fresh install, the
 * test suite and the demo keep working with nothing imported. A real student
 * who is not in the import matches neither and is correctly reported as
 * having no record - which is what leaves their parents' names editable.
 *
 * A table that is not there yet (migration 28 unapplied) is not an outage: it
 * falls through to the dummy records, the same answer the portal gave
 * yesterday. A table that *is* there and cannot be read is an outage, and is
 * reported as one - `academicRecordFor` catches it and the card falls back to
 * the portal profile, because a database the portal cannot reach must never
 * stop a booking.
 */
export class StoreAcademicSource implements AcademicSource {
  readonly description = "the portal's own academic records";

  private readonly fallback = new MockAcademicSource();

  async find(kind: AcademicRecordKind, email: string): Promise<AcademicFind | null> {
    let imported: AcademicRecord | null = null;
    try {
      imported = await getStore().findAcademicRecord(kind, email);
    } catch (e) {
      if (isMissingTable(e)) return this.fallback.find(kind, email);
      throw new AcademicSourceUnavailableError(e);
    }
    if (imported) return { record: imported, origin: "imported" };
    return this.fallback.find(kind, email);
  }
}

/** Migration 28 not applied: Postgres 42P01, PostgREST PGRST205. */
function isMissingTable(e: unknown): boolean {
  const code = (e as { code?: string } | null)?.code;
  if (code === "42P01" || code === "PGRST205") return true;
  // The mock store self-heals a missing key, so this is Supabase-only.
  return false;
}
