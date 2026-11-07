import { splitCsvLine } from "@/lib/csv";
import {
  STUDENT_COLUMNS,
  EMPLOYEE_COLUMNS,
  OFFICE_COLUMNS,
  FCC_COLUMNS,
  HOSTEL_COLUMNS,
  WARDEN_COLUMNS,
  KNOWN_STUDENT_COLUMNS,
  KNOWN_EMPLOYEE_COLUMNS,
  KNOWN_OFFICE_COLUMNS,
  KNOWN_FCC_COLUMNS,
  KNOWN_HOSTEL_COLUMNS,
  KNOWN_WARDEN_COLUMNS,
  type InstituteTableKind,
  type NewStudentInput,
  type NewEmployeeInput,
  type NewOfficeInput,
  type NewFCCInput,
  type NewHostelInput,
  type NewWardenInput,
} from "./types";

type InputForKind = {
  student: NewStudentInput;
  employee: NewEmployeeInput;
  office: NewOfficeInput;
  fcc: NewFCCInput;
  hostel: NewHostelInput;
  warden: NewWardenInput;
};

export type InstituteImportPlan<K extends InstituteTableKind = InstituteTableKind> = {
  kind: K;
  added: InputForKind[K][];
  updated: { id: string; input: InputForKind[K] }[];
  unchanged: number;
  /** Whether the first row was recognised as a header. */
  hadHeader: boolean;
  /** The DB columns the paste was read as, in order. */
  columns: string[];
  /** Header cells that were not recognised (ignored during import). */
  skippedHeaders: string[];
  problems: string[];
};

export const MAX_IMPORT_ROWS = 2000;

const EMAIL = /^[^@\s,]+@[^@\s,.]+(\.[^@\s,.]+)+$/;

function columnsFor(kind: InstituteTableKind): readonly string[] {
  switch (kind) {
    case "student": return STUDENT_COLUMNS;
    case "employee": return EMPLOYEE_COLUMNS;
    case "office": return OFFICE_COLUMNS;
    case "fcc": return FCC_COLUMNS;
    case "hostel": return HOSTEL_COLUMNS;
    case "warden": return WARDEN_COLUMNS;
  }
}

function aliasesFor(kind: InstituteTableKind): Record<string, string[]> {
  switch (kind) {
    case "student": return KNOWN_STUDENT_COLUMNS;
    case "employee": return KNOWN_EMPLOYEE_COLUMNS;
    case "office": return KNOWN_OFFICE_COLUMNS;
    case "fcc": return KNOWN_FCC_COLUMNS;
    case "hostel": return KNOWN_HOSTEL_COLUMNS;
    case "warden": return KNOWN_WARDEN_COLUMNS;
  }
}

export function csvColumnsFor(kind: InstituteTableKind): readonly string[] {
  return columnsFor(kind);
}

export function csvHeaderFor(kind: InstituteTableKind): string {
  return columnsFor(kind).join(", ");
}

export function columnLabel(column: string): string {
  const words = column.replace(/_/g, " ");
  const label = words.charAt(0).toUpperCase() + words.slice(1);
  return label
    .replace(/\bId\b/, "ID")
    .replace(/\bfather name\b/i, "Father's name")
    .replace(/\bmother name\b/i, "Mother's name")
    .replace(/\bguardian name\b/i, "Guardian's name")
    .replace(/\bhead name\b/i, "Head's name")
    .replace(/\bhead email\b/i, "Head's email")
    .replace(/\bfcc\b/i, "FCC");
}

/** The key column for each kind - always the first column. */
function emailColumnFor(kind: InstituteTableKind): string {
  return columnsFor(kind)[0];
}

function blank(value: string | undefined): string | null {
  const text = (value ?? "").trim();
  if (!text) return null;
  if (/^(-|--|n\/?a|nil|none|null)$/i.test(text)) return null;
  return text;
}

// ---- Header detection -------------------------------------------------------

/** Which DB column a header cell names, or null when nothing recognises it. */
export function columnForKind(kind: InstituteTableKind, header: string): string | null {
  const text = header.trim().toLowerCase().replace(/\s+/g, " ");
  if (!text) return null;
  const aliases = aliasesFor(kind);
  for (const [column, names] of Object.entries(aliases)) {
    if (names.includes(text)) return column;
  }
  return null;
}

type HeaderResult = {
  /** The DB columns, in the order the header names them. null = skip that position. */
  mapping: (string | null)[];
  /** The header cells that were not recognised. */
  skipped: string[];
};

/**
 * Read a line as a header, or null when it is data.
 *
 * A header must start with a cell that resolves to the key column (email or
 * equivalent) and have at least half of its cells recognised. Unknown cells
 * are recorded as skip positions rather than rejecting the header.
 */
export function headerColumnsForKind(
  kind: InstituteTableKind,
  fields: string[],
): HeaderResult | null {
  if (fields.length === 0) return null;
  const emailCol = emailColumnFor(kind);
  const first = columnForKind(kind, fields[0]);
  if (first !== emailCol) return null;

  const mapping: (string | null)[] = [];
  const skipped: string[] = [];
  const seen = new Set<string>();
  let recognised = 0;

  for (let i = 0; i < fields.length; i++) {
    const col = columnForKind(kind, fields[i]);
    if (col && !seen.has(col)) {
      mapping.push(col);
      seen.add(col);
      recognised++;
    } else if (col && seen.has(col)) {
      mapping.push(null);
      skipped.push(fields[i].trim());
    } else {
      mapping.push(null);
      if (fields[i].trim()) skipped.push(fields[i].trim());
    }
  }

  if (recognised < 2) return null;
  return { mapping, skipped };
}

// ---- Building records -------------------------------------------------------

function buildInputPositional(
  kind: InstituteTableKind,
  fields: string[],
  importedBy: string | null,
): InputForKind[typeof kind] {
  const columns = columnsFor(kind);
  const record: Record<string, string | null> = {};
  columns.forEach((col, i) => {
    record[col] = i === 0 ? (fields[i] ?? "").trim() : blank(fields[i]);
  });
  record["imported_by"] = importedBy;
  return record as unknown as InputForKind[typeof kind];
}

function buildInputFromHeader(
  kind: InstituteTableKind,
  fields: string[],
  mapping: (string | null)[],
  importedBy: string | null,
): InputForKind[typeof kind] {
  const columns = columnsFor(kind);
  const record: Record<string, string | null> = {};
  for (const col of columns) record[col] = null;

  for (let i = 0; i < mapping.length && i < fields.length; i++) {
    const col = mapping[i];
    if (!col) continue;
    record[col] = i === 0 ? (fields[i] ?? "").trim() : blank(fields[i]);
  }
  record["imported_by"] = importedBy;
  return record as unknown as InputForKind[typeof kind];
}

function sameRow(
  kind: InstituteTableKind,
  existing: Record<string, unknown>,
  input: Record<string, unknown>,
): boolean {
  const columns = columnsFor(kind);
  for (const col of columns) {
    if ((existing[col] ?? null) !== (input[col] ?? null)) return false;
  }
  return true;
}

type ExistingRow = { id: string; [key: string]: unknown };

export function planInstituteImport<K extends InstituteTableKind>(
  kind: K,
  text: string,
  existing: ExistingRow[],
  importedBy: string | null,
): InstituteImportPlan<K> {
  const columns = columnsFor(kind);
  const emailCol = emailColumnFor(kind);
  const byEmail = new Map(
    existing.map((r) => [
      String(r[emailCol] ?? "").trim().toLowerCase(),
      r,
    ]),
  );

  const problems: string[] = [];
  const seen = new Map<string, number>();
  const added: InputForKind[K][] = [];
  const updated: { id: string; input: InputForKind[K] }[] = [];
  let unchanged = 0;
  let rows = 0;
  let hadHeader = false;
  let headerMapping: (string | null)[] | null = null;
  let skippedHeaders: string[] = [];

  const needsEmail = kind !== "hostel";

  text.split(/\r?\n/).forEach((raw, i) => {
    const n = i + 1;
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;
    const fields = splitCsvLine(line);

    // First non-blank, non-comment line: try as a header.
    if (rows === 0 && !hadHeader) {
      // Old check: skip the line if it starts with the key column name exactly.
      if (fields[0]?.toLowerCase() === emailCol) {
        const detected = headerColumnsForKind(kind, fields);
        if (detected) {
          hadHeader = true;
          headerMapping = detected.mapping;
          skippedHeaders = detected.skipped;
        }
        return;
      }
    }

    rows += 1;
    if (rows > MAX_IMPORT_ROWS) {
      if (rows === MAX_IMPORT_ROWS + 1) {
        problems.push(
          `More than ${MAX_IMPORT_ROWS} rows in one paste - split the list and import it in parts.`,
        );
      }
      return;
    }

    const key = (fields[0] ?? "").trim();
    if (!key) {
      problems.push(`Line ${n}: no ${emailCol.replace(/_/g, " ")} - the first column is required.`);
      return;
    }
    if (needsEmail && (!EMAIL.test(key) || key.length > 254)) {
      problems.push(`Line ${n}: "${key}" is not an email address.`);
      return;
    }
    if (!headerMapping && fields.length > columns.length) {
      problems.push(
        `Line ${n}: ${fields.length} columns, but a ${kind} record has ${columns.length} - expected "${csvHeaderFor(kind)}".`,
      );
      return;
    }
    const lowerKey = key.toLowerCase();
    const earlier = seen.get(lowerKey);
    if (earlier !== undefined) {
      problems.push(`Line ${n}: ${key} is also given on line ${earlier}.`);
      return;
    }
    seen.set(lowerKey, n);

    const input = headerMapping
      ? buildInputFromHeader(kind, fields, headerMapping, importedBy)
      : buildInputPositional(kind, fields, importedBy);
    const typed = input as InputForKind[K];
    const current = byEmail.get(lowerKey);
    if (!current) {
      added.push(typed);
    } else if (!sameRow(kind, current as Record<string, unknown>, typed as Record<string, unknown>)) {
      updated.push({ id: current.id, input: typed });
    } else {
      unchanged += 1;
    }
  });

  if (rows === 0 && problems.length === 0) {
    problems.push("Nothing to import - paste one record per line.");
  }

  const usedColumns: string[] = headerMapping
    ? (headerMapping as (string | null)[]).filter((c): c is string => c !== null)
    : [...columns];

  if (problems.length > 0) {
    return { kind, added: [], updated: [], unchanged, hadHeader, columns: usedColumns, skippedHeaders, problems };
  }
  return { kind, added, updated, unchanged, hadHeader, columns: usedColumns, skippedHeaders, problems };
}

export function describeImport(plan: Pick<InstituteImportPlan, "added" | "updated" | "unchanged">): string {
  const parts = [
    plan.added.length > 0 ? `${plan.added.length} added` : null,
    plan.updated.length > 0 ? `${plan.updated.length} updated` : null,
    plan.unchanged > 0 ? `${plan.unchanged} unchanged` : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : "nothing changed";
}
