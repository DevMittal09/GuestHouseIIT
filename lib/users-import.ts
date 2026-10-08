import { splitCsvLine } from "./academic/stored";
import { isValidLdapUid, normalizeLdapUid } from "./ldap/uid";
import { ROLE_LABELS, type Profile, type Role, type StaffCategory } from "./types";
import type { Unit } from "./units";

/**
 * Bulk-loading accounts from a spreadsheet (8 Oct 2026, the office's ninth
 * list: "for GH Manager we should have the option to add the data from excel,
 * and also edit the columns, and also have the option to delete data").
 *
 * The office holds the institute's people in spreadsheets. Typing a few
 * hundred of them into a dialog one at a time was never going to happen, so
 * Users & Roles takes a paste: copy the columns out of Excel, paste, check
 * the plan, import. The same shape as the academic-records import and the
 * projects one - **a plan first, then all or nothing** - for the same
 * reason: half an imported list is worse than none, because nobody can tell
 * which half landed, and these rows decide who can sign in and what they can
 * approve.
 *
 * **"Edit the columns" is the header line.** The paste may lead with a header
 * naming the columns in whatever order the office's own sheet has them
 * ({@link KNOWN_COLUMNS} lists the names and their aliases), and only `email`
 * is required. Without a header the paste is read in {@link DEFAULT_COLUMNS}
 * order. So a sheet that holds only email, name and roll number imports
 * without being rearranged, and a sheet that holds more imports without the
 * office deleting anything first.
 *
 * Everything else about the accounts stays as it was: the per-row Edit dialog
 * and Delete button are still there, and a row an import brings in is an
 * ordinary profile from then on.
 *
 * Pure, so the console can show the plan before applying it and the tests
 * need no store.
 */

/** A column a paste may carry, with the spellings a spreadsheet might use. */
export type UserColumn =
  | "email"
  | "full_name"
  | "role"
  | "hostel_name"
  | "department_or_club"
  | "roll_number"
  | "ldap_uid"
  | "staff_category"
  | "unit";

/**
 * The order a paste with **no** header line is read in: the columns the
 * office's list of people actually has, in the order the Users table shows
 * them. A short line is read as "the rest is not given".
 */
export const DEFAULT_COLUMNS: UserColumn[] = [
  "email",
  "full_name",
  "role",
  "hostel_name",
  "department_or_club",
  "roll_number",
  "ldap_uid",
];

/** Every column that may be named in a header, and what a header may call it. */
export const KNOWN_COLUMNS: Record<UserColumn, string[]> = {
  email: ["email", "email address", "e-mail", "institute email", "mail"],
  full_name: ["full_name", "full name", "name", "person"],
  role: ["role", "portal role"],
  hostel_name: ["hostel_name", "hostel", "hostel name"],
  department_or_club: ["department_or_club", "department", "dept", "club", "department / club", "dept / club"],
  roll_number: ["roll_number", "roll number", "roll no", "roll no.", "roll", "employee id"],
  ldap_uid: ["ldap_uid", "ldap", "ldap username", "ldap uid", "username", "uid"],
  staff_category: ["staff_category", "staff category", "category", "faculty or staff"],
  unit: ["unit", "unit_id", "unit name", "department unit"],
};

/** The header the console offers to copy: the default order, comma separated. */
export const USER_CSV_HEADER = DEFAULT_COLUMNS.join(", ");

export const MAX_USER_IMPORT_ROWS = 2000;

/** What one line asks for, resolved against the roles, hostels and units. */
export type UserImportRow = {
  email: string;
  full_name: string;
  role: Role;
  hostel_name: string | null;
  department_or_club: string | null;
  roll_number: string | null;
  ldap_uid: string | null;
  staff_category: StaffCategory | null;
  unit_id: string | null;
};

export type UserImportPlan = {
  /** Lines for people with no account yet. */
  added: UserImportRow[];
  /** Lines that change an account, with what it holds now. */
  updated: { id: string; before: Profile; row: UserImportRow }[];
  /** Lines identical to the account already stored. */
  unchanged: number;
  /** The columns the paste was read as, in order - shown back to the office. */
  columns: UserColumn[];
  /** Whether a header line was recognised, so the console can say which it used. */
  hadHeader: boolean;
  /**
   * Why the paste was refused, line by line. **Non-empty means nothing is
   * imported.**
   */
  problems: string[];
};

const EMAIL = /^[^@\s,]+@[^@\s,.]+(\.[^@\s,.]+)+$/;

function blank(value: string | undefined): string | null {
  const text = (value ?? "").trim();
  if (!text) return null;
  // What the office's spreadsheets put in a cell they have nothing for.
  if (/^(-|--|n\/?a|nil|none|null)$/i.test(text)) return null;
  return text;
}

/** Which column a header cell names, or null when nothing recognises it. */
export function columnFor(header: string): UserColumn | null {
  const text = header.trim().toLowerCase().replace(/\s+/g, " ");
  if (!text) return null;
  for (const [column, names] of Object.entries(KNOWN_COLUMNS) as [UserColumn, string[]][]) {
    if (names.includes(text)) return column;
  }
  return null;
}

/**
 * Read a line as a header, or null when it is data.
 *
 * A header has to **start with the email column** and have every other cell
 * recognised. Both halves matter: the first cell of a data line is an email
 * address, which `columnFor` also matches on the word "email", so requiring
 * the rest to be column names is what tells a header from a row belonging to
 * somebody whose address happens to be `email@...`.
 */
export function headerColumns(fields: string[]): UserColumn[] | null {
  if (fields.length === 0) return null;
  const columns = fields.map((f) => columnFor(f));
  if (columns[0] !== "email") return null;
  if (columns.some((c, i) => c === null && fields[i].trim() !== "")) return null;
  return columns.filter((c): c is UserColumn => c !== null);
}

/** The roles an import may hand out, by label and by value, lowercased. */
function roleIndex(assignable: Role[]): Map<string, Role> {
  const index = new Map<string, Role>();
  for (const role of assignable) {
    index.set(role.toLowerCase(), role);
    index.set(ROLE_LABELS[role].toLowerCase(), role);
  }
  // The words the office uses for the two kinds of employee. Both are the
  // `employee` role; the category column, or this word, decides which.
  if (assignable.includes("employee")) {
    index.set("faculty", "employee");
    index.set("staff", "employee");
    index.set("non-teaching staff", "employee");
    index.set("employee", "employee");
  }
  return index;
}

function staffCategoryFrom(value: string | null, roleWord: string): StaffCategory | null {
  const text = (value ?? roleWord).trim().toLowerCase();
  if (/^(faculty|teaching)$/.test(text)) return "faculty";
  if (/^(staff|non-teaching staff|non teaching staff|non-faculty|non faculty)$/.test(text)) {
    return "staff";
  }
  return null;
}

/** Whether two rows say the same thing about a person. */
function sameProfile(before: Profile, row: UserImportRow): boolean {
  return (
    before.full_name === row.full_name &&
    before.role === row.role &&
    (before.hostel_name ?? null) === row.hostel_name &&
    (before.department_or_club ?? null) === row.department_or_club &&
    (before.roll_number ?? null) === row.roll_number &&
    (before.ldap_uid ?? null) === row.ldap_uid &&
    (before.staff_category ?? null) === row.staff_category &&
    (before.unit_id ?? null) === row.unit_id
  );
}

export type UserImportContext = {
  profiles: Profile[];
  /** The roles this console user may hand out (`assignableRoles`). */
  assignable: Role[];
  /** Hostels on record, so a warden's scoping cannot be set to a typo. */
  hostels: string[];
  units: Unit[];
  /** Accounts this console user may not edit at all (`userEditError`). */
  locked?: (profile: Profile) => string | null;
};

/**
 * What a pasted list would do to the accounts, without doing it.
 *
 * A line for somebody who already has an account **updates** it, matched on
 * the email: that is what makes the import usable twice, once to load the
 * list and again when the office's sheet changes. A column the paste does not
 * carry is left as it is rather than cleared - a sheet of email and name must
 * not wipe everyone's hostel.
 */
export function planUserImport(text: string, context: UserImportContext): UserImportPlan {
  const { profiles, assignable, hostels, units } = context;
  const byEmail = new Map(profiles.map((p) => [p.email.trim().toLowerCase(), p]));
  const roles = roleIndex(assignable);
  const hostelByName = new Map(hostels.map((h) => [h.toLowerCase(), h]));
  const unitByName = new Map<string, Unit>();
  for (const unit of units) {
    unitByName.set(unit.name.toLowerCase(), unit);
    unitByName.set(unit.id.toLowerCase(), unit);
  }

  const problems: string[] = [];
  const added: UserImportRow[] = [];
  const updated: UserImportPlan["updated"] = [];
  let unchanged = 0;
  let columns = DEFAULT_COLUMNS;
  let hadHeader = false;
  const seen = new Map<string, number>();
  const uidLine = new Map<string, number>();
  let rows = 0;

  const lines = text.split(/\r?\n/);
  lines.forEach((raw, i) => {
    const n = i + 1;
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;
    const fields = splitCsvLine(line);

    // The header, if there is one, has to be the first non-blank line: a
    // second one later is a sign the office pasted two sheets together, and
    // reading it as data would make an account called "email".
    const header = headerColumns(fields);
    if (header) {
      if (rows === 0 && !hadHeader) {
        columns = header;
        hadHeader = true;
        return;
      }
      problems.push(`Line ${n}: a second header line - paste one list at a time.`);
      return;
    }

    rows += 1;
    if (rows > MAX_USER_IMPORT_ROWS) {
      if (rows === MAX_USER_IMPORT_ROWS + 1) {
        problems.push(
          `More than ${MAX_USER_IMPORT_ROWS} rows in one paste - split the list and import it in parts.`
        );
      }
      return;
    }
    if (fields.length > columns.length) {
      problems.push(
        `Line ${n}: ${fields.length} columns, but ${columns.length} were expected - "${columns.join(", ")}". Add a header line to say what the columns are.`
      );
      return;
    }

    const value = (column: UserColumn): string | null => {
      const at = columns.indexOf(column);
      return at === -1 ? null : blank(fields[at]);
    };

    const email = (value("email") ?? "").trim();
    if (!email) {
      problems.push(`Line ${n}: no email address.`);
      return;
    }
    if (!EMAIL.test(email) || email.length > 254) {
      problems.push(`Line ${n}: "${email}" is not an email address.`);
      return;
    }
    const key = email.toLowerCase();
    const earlier = seen.get(key);
    if (earlier !== undefined) {
      problems.push(`Line ${n}: ${email} is also given on line ${earlier}.`);
      return;
    }
    seen.set(key, n);
    const current = byEmail.get(key);
    if (current) {
      const locked = context.locked?.(current);
      if (locked) {
        problems.push(`Line ${n}: ${email} - ${locked}`);
        return;
      }
    }

    const name = value("full_name") ?? current?.full_name ?? null;
    if (!name || name.length < 2) {
      problems.push(`Line ${n}: ${email} has no name.`);
      return;
    }

    const roleWord = value("role");
    const role = roleWord ? roles.get(roleWord.trim().toLowerCase()) : (current?.role ?? "student");
    if (!role) {
      problems.push(
        `Line ${n}: "${roleWord}" is not a role this console can assign - use one of ${assignable
          .map((r) => ROLE_LABELS[r])
          .join(", ")}.`
      );
      return;
    }

    const hostelWord = value("hostel_name");
    let hostel = current?.hostel_name ?? null;
    if (hostelWord) {
      const match = hostelByName.get(hostelWord.toLowerCase());
      if (!match) {
        problems.push(`Line ${n}: "${hostelWord}" is not a hostel on record.`);
        return;
      }
      hostel = match;
    }

    const unitWord = value("unit");
    let unitId = current?.unit_id ?? null;
    if (unitWord) {
      const unit = unitByName.get(unitWord.toLowerCase());
      if (!unit) {
        problems.push(`Line ${n}: "${unitWord}" is not a department, club or office on record.`);
        return;
      }
      unitId = unit.id;
    }

    const uidWord = value("ldap_uid");
    let uid = current?.ldap_uid ?? null;
    if (uidWord) {
      const normalized = normalizeLdapUid(uidWord);
      if (!isValidLdapUid(normalized)) {
        problems.push(`Line ${n}: "${uidWord}" is not a valid LDAP username.`);
        return;
      }
      uid = normalized;
    }

    const row: UserImportRow = {
      email,
      full_name: name,
      role,
      hostel_name: hostel,
      department_or_club: value("department_or_club") ?? current?.department_or_club ?? null,
      roll_number: value("roll_number") ?? current?.roll_number ?? null,
      ldap_uid: uid,
      staff_category:
        role === "employee"
          ? (staffCategoryFrom(value("staff_category"), roleWord ?? "") ??
            current?.staff_category ??
            null)
          : null,
      unit_id: unitId,
    };

    if (!current) added.push(row);
    else if (!sameProfile(current, row)) updated.push({ id: current.id, before: current, row });
    else unchanged += 1;
  });

  /**
   * An LDAP username is unique across accounts, so the paste is checked
   * against the state it would leave behind - the same rule as
   * `planLdapUidImport`, so swapping two people's usernames in one paste is
   * allowed and giving two people the same one is not.
   */
  const wanted = new Map<string, UserImportRow>();
  for (const row of added) wanted.set(row.email.toLowerCase(), row);
  for (const { row } of updated) wanted.set(row.email.toLowerCase(), row);
  const owner = new Map<string, string>();
  for (const profile of profiles) {
    const row = wanted.get(profile.email.toLowerCase());
    const uid = (row ? row.ldap_uid : profile.ldap_uid)?.toLowerCase();
    if (uid) owner.set(uid, profile.email);
  }
  for (const row of wanted.values()) {
    const uid = row.ldap_uid?.toLowerCase();
    if (!uid) continue;
    const held = owner.get(uid);
    if (held && held.toLowerCase() !== row.email.toLowerCase()) {
      problems.push(`LDAP username ${uid} for ${row.email} already belongs to ${held}.`);
    } else {
      const line = uidLine.get(uid);
      if (line !== undefined) {
        problems.push(`LDAP username ${uid} is given to more than one person in this paste.`);
      }
      uidLine.set(uid, 1);
      owner.set(uid, row.email);
    }
  }

  if (rows === 0 && problems.length === 0) {
    problems.push("Nothing to import - paste one person per line.");
  }
  if (problems.length > 0) {
    return { added: [], updated: [], unchanged, columns, hadHeader, problems };
  }
  return { added, updated, unchanged, columns, hadHeader, problems };
}

/** "12 added, 3 updated, 40 unchanged" - for the toast and the audit log. */
export function describeUserImport(
  plan: Pick<UserImportPlan, "added" | "updated" | "unchanged">
): string {
  const parts = [
    plan.added.length > 0 ? `${plan.added.length} added` : null,
    plan.updated.length > 0 ? `${plan.updated.length} updated` : null,
    plan.unchanged > 0 ? `${plan.unchanged} unchanged` : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : "nothing changed";
}

/** What changed about one person, for the plan's preview: "Role, Hostel". */
export function changedFields(before: Profile, row: UserImportRow): string[] {
  const labels: [string, boolean][] = [
    ["Name", before.full_name !== row.full_name],
    ["Role", before.role !== row.role],
    ["Hostel", (before.hostel_name ?? null) !== row.hostel_name],
    ["Dept / Club", (before.department_or_club ?? null) !== row.department_or_club],
    ["Roll No.", (before.roll_number ?? null) !== row.roll_number],
    ["LDAP username", (before.ldap_uid ?? null) !== row.ldap_uid],
    ["Category", (before.staff_category ?? null) !== row.staff_category],
    ["Unit", (before.unit_id ?? null) !== row.unit_id],
  ];
  return labels.filter(([, changed]) => changed).map(([label]) => label);
}
