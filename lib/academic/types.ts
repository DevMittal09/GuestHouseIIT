/**
 * What the institute's academic database says about a person.
 *
 * Six kinds of record, one per kind of account, each with the fields the
 * guest house office asked to see at the top of New Booking (21 Sep 2026).
 * `.memories/12-academic-records.md` has the list and how to connect the real
 * database.
 *
 * Every field except `kind` is nullable. Real records have gaps, and a gap is
 * shown as "Not on record", never filled in from somewhere else.
 */
export type AcademicRecordKind =
  | "student"
  | "employee"
  | "office"
  | "student_rep"
  | "alumni_office"
  | "warden";

export type StudentRecord = {
  kind: "student";
  roll_number: string | null;
  name: string | null;
  program: string | null;
  department: string | null;
  email: string | null;
  phone: string | null;
  father_name: string | null;
  mother_name: string | null;
  /** Shown only when the database has neither parent's name. */
  guardian_name: string | null;
  hostel: string | null;
};

/** Faculty and non-faculty staff. */
export type EmployeeRecord = {
  kind: "employee";
  employee_id: string | null;
  name: string | null;
  department: string | null;
  /** Faculty or non-faculty, and the post, as the database words it. */
  employee_type: string | null;
  phone: string | null;
  email: string | null;
  /** Named as the office asked for it; whether it is a landline or a room is unconfirmed. */
  office_number: string | null;
};

/** An institute office: Admin, Academics, Director's Office, Registrar, Student Section, EWD, IAR… */
export type OfficeRecord = {
  kind: "office";
  department: string | null;
  email: string | null;
  phone: string | null;
  /** The Head of Department or head of the office — the office's "Copy to". */
  head_name: string | null;
  head_email: string | null;
};

/** A student representative: a club, a fest council. */
export type StudentRepRecord = {
  kind: "student_rep";
  /** e.g. "Fest Council — Petrichor", as the database words it. */
  representative_type: string | null;
  email: string | null;
  phone: string | null;
  faculty_in_charge_email: string | null;
};

export type AlumniOfficeRecord = {
  kind: "alumni_office";
  department: string | null;
  email: string | null;
  phone: string | null;
};

/** A Warden or Assistant Warden. */
export type WardenRecord = {
  kind: "warden";
  name: string | null;
  phone: string | null;
  email: string | null;
  hostel: string | null;
};

export type AcademicRecord =
  | StudentRecord
  | EmployeeRecord
  | OfficeRecord
  | StudentRepRecord
  | AlumniOfficeRecord
  | WardenRecord;

type FieldsOf<K extends AcademicRecordKind> = Exclude<
  keyof Extract<AcademicRecord, { kind: K }>,
  "kind"
>;

/**
 * Every field of every kind, by name. The real source reads a response
 * through this list, so a field added to a type above and not here is a
 * compile error rather than a column that is silently never filled.
 */
export const ACADEMIC_RECORD_FIELDS: { [K in AcademicRecordKind]: readonly FieldsOf<K>[] } = {
  student: [
    "roll_number",
    "name",
    "program",
    "department",
    "email",
    "phone",
    "father_name",
    "mother_name",
    "guardian_name",
    "hostel",
  ],
  employee: ["employee_id", "name", "department", "employee_type", "phone", "email", "office_number"],
  office: ["department", "email", "phone", "head_name", "head_email"],
  student_rep: ["representative_type", "email", "phone", "faculty_in_charge_email"],
  alumni_office: ["department", "email", "phone"],
  warden: ["name", "phone", "email", "hostel"],
};

/**
 * The academic database, reduced to the one question the portal asks. Two
 * implementations, picked from the environment by `getAcademicSource()` the
 * way `lib/store/index.ts` picks a data store and `lib/ldap/` a directory.
 */
export interface AcademicSource {
  /** Human-readable, for logs: "mock academic records" or the database URL. */
  readonly description: string;
  /**
   * The record of this kind for this institute email (already lowercased and
   * trimmed), or `null` when the database has none. Throws
   * `AcademicSourceUnavailableError` when the database cannot answer.
   */
  find(kind: AcademicRecordKind, email: string): Promise<AcademicRecord | null>;
}

/** The academic database could not be asked — down, misconfigured, timed out, or answered nonsense. */
export class AcademicSourceUnavailableError extends Error {
  constructor(cause: unknown) {
    super(`Academic database unavailable: ${cause instanceof Error ? cause.message : String(cause)}`);
    this.name = "AcademicSourceUnavailableError";
  }
}
