import { splitCsvLine } from "@/lib/csv";
import {
  STUDENT_COLUMNS,
  EMPLOYEE_COLUMNS,
  OFFICE_COLUMNS,
  FCC_COLUMNS,
  HOSTEL_COLUMNS,
  WARDEN_COLUMNS,
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

function buildInput(
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

  const needsEmail = kind !== "hostel";

  text.split(/\r?\n/).forEach((raw, i) => {
    const n = i + 1;
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;
    const fields = splitCsvLine(line);
    if (fields[0]?.toLowerCase() === emailCol) return;
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
    if (fields.length > columns.length) {
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

    const input = buildInput(kind, fields, importedBy) as InputForKind[K];
    const current = byEmail.get(lowerKey);
    if (!current) {
      added.push(input);
    } else if (!sameRow(kind, current as Record<string, unknown>, input as Record<string, unknown>)) {
      updated.push({ id: current.id, input });
    } else {
      unchanged += 1;
    }
  });

  if (rows === 0 && problems.length === 0) {
    problems.push("Nothing to import - paste one record per line.");
  }
  if (problems.length > 0) return { kind, added: [], updated: [], unchanged, problems };
  return { kind, added, updated, unchanged, problems };
}

export function describeImport(plan: Pick<InstituteImportPlan, "added" | "updated" | "unchanged">): string {
  const parts = [
    plan.added.length > 0 ? `${plan.added.length} added` : null,
    plan.updated.length > 0 ? `${plan.updated.length} updated` : null,
    plan.unchanged > 0 ? `${plan.unchanged} unchanged` : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : "nothing changed";
}
