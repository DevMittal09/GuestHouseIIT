import { getStore } from "@/lib/store";
import {
  studentToRecord,
  employeeToRecord,
  officeToRecord,
  fccToRecord,
  wardenToRecord,
} from "@/lib/institute/academic-adapter";
import { MockAcademicSource } from "./mock-source";
import {
  AcademicSourceUnavailableError,
  type AcademicFind,
  type AcademicRecord,
  type AcademicRecordKind,
  type AcademicSource,
} from "./types";

/**
 * Reads from the institute_* tables (migration 35, 2 Nov 2026) and converts
 * each row into the AcademicRecord shape the rest of the portal expects.
 *
 * Replaces the old academic_records table (migration 28). The dummy records
 * are still behind it: a row the office has imported wins; where there is
 * none, the demo personas fall through to MockAcademicSource.
 *
 * A table that is not there yet (migration 35 unapplied) falls through to
 * the dummy records. A table that *is* there and cannot be read is an outage.
 */
export class StoreAcademicSource implements AcademicSource {
  readonly description = "the portal's institute records";

  private readonly fallback = new MockAcademicSource();

  async find(kind: AcademicRecordKind, email: string): Promise<AcademicFind | null> {
    let record: AcademicRecord | null = null;
    try {
      record = await this.findInInstituteTable(kind, email);
    } catch (e) {
      if (isMissingTable(e)) return this.fallback.find(kind, email);
      throw new AcademicSourceUnavailableError(e);
    }
    if (record) return { record, origin: "imported" };
    return this.fallback.find(kind, email);
  }

  private async findInInstituteTable(
    kind: AcademicRecordKind,
    email: string
  ): Promise<AcademicRecord | null> {
    const store = getStore();
    switch (kind) {
      case "student": {
        const row = await store.findStudent(email);
        return row ? studentToRecord(row) : null;
      }
      case "employee": {
        const row = await store.findEmployee(email);
        return row ? employeeToRecord(row) : null;
      }
      case "office": {
        const row = await store.findOffice(email);
        return row ? officeToRecord(row) : null;
      }
      case "student_rep": {
        const row = await store.findFCC(email);
        return row ? fccToRecord(row) : null;
      }
      case "alumni_office":
        return null;
      case "warden": {
        const row = await store.findWarden(email);
        if (!row) return null;
        let hostelName: string | null = null;
        if (row.hostel_id) {
          const hostels = await store.listInstituteHostels();
          hostelName = hostels.find((h) => h.hostel_id === row.hostel_id)?.hostel_name ?? null;
        }
        return wardenToRecord(row, hostelName);
      }
    }
  }
}

/** Migration 35 not applied: Postgres 42P01, PostgREST PGRST205. */
function isMissingTable(e: unknown): boolean {
  const code = (e as { code?: string } | null)?.code;
  if (code === "42P01" || code === "PGRST205") return true;
  return false;
}
