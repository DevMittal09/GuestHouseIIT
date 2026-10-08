import {
  ACADEMIC_RECORD_FIELDS,
  type AcademicRecord,
  type AcademicRecordKind,
} from "./types";

/**
 * The institute's records as the guest house office pasted them in
 * (migration 28, 7 Oct 2026).
 *
 * The academic database the portal was designed to read does not exist yet
 * and nobody could say when it would, so the office asked to keep the records
 * themselves. This is the shape of a stored row, the CSV it is pasted from,
 * and the plan an import turns into - all pure, so the console can show what
 * an import would do before it does it.
 *
 * A stored row *is* an {@link AcademicRecord} with the housekeeping columns
 * beside it, so nothing downstream has to know where a record came from: the
 * Requester details card, the Assistant Warden's family check and the booking
 * form's locked parent names read the same type they always did.
 */
export type StoredAcademicRecord = {
  id: string;
  /** The institute email the record is found by, as the office typed it. */
  email: string;
  record: AcademicRecord;
  imported_by: string | null;
  created_at: string;
  updated_at: string;
};

export type NewAcademicRecordInput = {
  email: string;
  record: AcademicRecord;
  imported_by: string | null;
};

export const ACADEMIC_RECORD_KINDS: AcademicRecordKind[] = [
  "student",
  "employee",
  "office",
  "student_rep",
  "alumni_office",
  "warden",
];

export const ACADEMIC_RECORD_KIND_LABELS: Record<AcademicRecordKind, string> = {
  student: "Students",
  employee: "Faculty and staff",
  office: "Institute offices",
  student_rep: "Student representatives",
  alumni_office: "Alumni office",
  warden: "Wardens",
};

/**
 * The CSV columns for each kind, in order - the header the console shows and
 * the order a pasted line is read in.
 *
 * It is `ACADEMIC_RECORD_FIELDS` with `email` pulled to the front, because
 * the email is the key: it is what `AcademicSource.find` asks by, and a line
 * without one cannot be stored at all. Everything after it is optional, and a
 * short line is read as "the rest is not on record" rather than refused -
 * real records have gaps, and the office should not have to type eight commas
 * to say so.
 */
export function csvColumnsFor(kind: AcademicRecordKind): string[] {
  const fields = ACADEMIC_RECORD_FIELDS[kind] as readonly string[];
  return ["email", ...fields.filter((f) => f !== "email")];
}

/** "email, roll_number, name, …" - the header line the console offers to copy. */
export function csvHeaderFor(kind: AcademicRecordKind): string {
  return csvColumnsFor(kind).join(", ");
}

/** The columns a person reads: "Email, Roll number, Father's name, …". */
export function columnLabel(column: string): string {
  const words = column.replace(/_/g, " ");
  const label = words.charAt(0).toUpperCase() + words.slice(1);
  return label
    .replace(/\bId\b/, "ID")
    .replace(/\bfather name\b/i, "Father's name")
    .replace(/\bmother name\b/i, "Mother's name")
    .replace(/\bguardian name\b/i, "Guardian's name")
    .replace(/\bhead name\b/i, "Head's name")
    .replace(/\bhead email\b/i, "Head's email");
}

const EMAIL = /^[^@\s,]+@[^@\s,.]+(\.[^@\s,.]+)+$/;

export const MAX_IMPORT_ROWS = 2000;

export type AcademicImportPlan = {
  kind: AcademicRecordKind;
  /** Rows for people the table does not hold yet. */
  added: NewAcademicRecordInput[];
  /** Rows that change a record already stored. */
  updated: { id: string; input: NewAcademicRecordInput }[];
  /** Rows identical to what is stored. */
  unchanged: number;
  /**
   * Why the paste was refused, line by line. **Non-empty means nothing is
   * imported**: a half-applied paste of a thousand students is worse than a
   * rejected one, because nobody can tell which half landed. Same rule as
   * `planProjectImport` and the LDAP username import.
   */
  problems: string[];
};

/**
 * Split one CSV line. Handles the quoting a spreadsheet produces - a quoted
 * field may contain commas and doubled quotes - because the office pastes
 * straight out of Excel, where a department called "Physics, Applied" is an
 * ordinary thing to have.
 */
export function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"' && field.trim() === "") {
      quoted = true;
      field = "";
      continue;
    }
    if (c === "," || c === "\t" || c === ";") {
      out.push(field);
      field = "";
      continue;
    }
    field += c;
  }
  out.push(field);
  return out.map((f) => f.trim());
}

function blank(value: string | undefined): string | null {
  const text = (value ?? "").trim();
  if (!text) return null;
  // The office's spreadsheets use these for "we do not have it".
  if (/^(-|--|n\/?a|nil|none|null)$/i.test(text)) return null;
  return text;
}

/** Build a record of `kind` from a line's fields, in `csvColumnsFor` order. */
function recordFromFields(
  kind: AcademicRecordKind,
  email: string,
  fields: string[]
): AcademicRecord {
  const columns = csvColumnsFor(kind);
  const values: Record<string, string | null> = { email };
  columns.forEach((column, i) => {
    if (column === "email") return;
    values[column] = blank(fields[i]);
  });
  // `kind` plus every field of that kind, so the object is exactly the record
  // type - no stray columns from another kind can ride along.
  const record = { kind } as Record<string, unknown>;
  for (const field of ACADEMIC_RECORD_FIELDS[kind] as readonly string[]) {
    record[field] = field === "email" ? email : (values[field] ?? null);
  }
  return record as AcademicRecord;
}

/** Whether two records say the same thing, field by field. */
export function sameRecord(a: AcademicRecord, b: AcademicRecord): boolean {
  if (a.kind !== b.kind) return false;
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  return (ACADEMIC_RECORD_FIELDS[a.kind] as readonly string[]).every(
    (field) => (left[field] ?? null) === (right[field] ?? null)
  );
}

/**
 * What a pasted CSV would do to the table, without doing it.
 *
 * All or nothing, and the console shows the plan before it is applied: an
 * import that silently dropped the lines it could not read would leave the
 * office believing a student is on record when they are not, and the booking
 * form would then ask that student to type their parents' names while locking
 * everybody else's.
 */
export function planAcademicImport(
  kind: AcademicRecordKind,
  text: string,
  existing: StoredAcademicRecord[],
  importedBy: string | null
): AcademicImportPlan {
  const byEmail = new Map(
    existing.filter((r) => r.record.kind === kind).map((r) => [r.email.trim().toLowerCase(), r])
  );
  const columns = csvColumnsFor(kind);
  const problems: string[] = [];
  const seen = new Map<string, number>();
  const added: NewAcademicRecordInput[] = [];
  const updated: AcademicImportPlan["updated"] = [];
  let unchanged = 0;
  let rows = 0;

  text.split(/\r?\n/).forEach((raw, i) => {
    const n = i + 1;
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;
    const fields = splitCsvLine(line);
    // The header the console offers to copy, pasted back with the data.
    if (fields[0]?.toLowerCase() === "email") return;
    rows += 1;
    if (rows > MAX_IMPORT_ROWS) {
      if (rows === MAX_IMPORT_ROWS + 1) {
        problems.push(
          `More than ${MAX_IMPORT_ROWS} rows in one paste - split the list and import it in parts.`
        );
      }
      return;
    }
    const email = (fields[0] ?? "").trim();
    if (!email) {
      problems.push(`Line ${n}: no email address - the first column is the institute email.`);
      return;
    }
    if (!EMAIL.test(email) || email.length > 254) {
      problems.push(`Line ${n}: "${email}" is not an email address.`);
      return;
    }
    if (fields.length > columns.length) {
      problems.push(
        `Line ${n}: ${fields.length} columns, but a ${kind} record has ${columns.length} - expected "${csvHeaderFor(kind)}".`
      );
      return;
    }
    const key = email.toLowerCase();
    const earlier = seen.get(key);
    if (earlier !== undefined) {
      problems.push(`Line ${n}: ${email} is also given on line ${earlier}.`);
      return;
    }
    seen.set(key, n);

    const record = recordFromFields(kind, email, fields);
    const current = byEmail.get(key);
    const input: NewAcademicRecordInput = { email, record, imported_by: importedBy };
    if (!current) added.push(input);
    else if (!sameRecord(current.record, record)) updated.push({ id: current.id, input });
    else unchanged += 1;
  });

  if (rows === 0 && problems.length === 0) {
    problems.push("Nothing to import - paste one record per line.");
  }
  if (problems.length > 0) return { kind, added: [], updated: [], unchanged, problems };
  return { kind, added, updated, unchanged, problems };
}

/** "12 added, 3 updated, 40 unchanged" - what an import did, for the toast and the audit log. */
export function describeImport(plan: Pick<AcademicImportPlan, "added" | "updated" | "unchanged">): string {
  const parts = [
    plan.added.length > 0 ? `${plan.added.length} added` : null,
    plan.updated.length > 0 ? `${plan.updated.length} updated` : null,
    plan.unchanged > 0 ? `${plan.unchanged} unchanged` : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : "nothing changed";
}
