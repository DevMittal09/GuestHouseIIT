/**
 * Sponsored and consultancy projects a stay can be debited to (Phase 4).
 *
 * When a booking's debitable head is **Project**, the requester picks the
 * project from this list rather than typing a number — a typed number is how
 * the accounts section ends up debiting a project that does not exist. The
 * list is maintained in the console (Projects), loaded in bulk by pasting
 * from a spreadsheet, and a project is *deactivated* rather than deleted once
 * a booking has used it, so its invoices still name it.
 */

export type Project = {
  id: string;
  /** The institute's project number, e.g. "SP/2025/017". Unique, compared case-insensitively. */
  project_number: string;
  title: string;
  /** Principal investigator, as printed on the invoice. */
  pi_name: string | null;
  /** Offered on the booking form only while active. */
  active: boolean;
};

export type NewProjectInput = Omit<Project, "id">;

/** "SP/2025/017 — Grid-scale storage (Dr. A. Kumar)" */
export function describeProject(p: Pick<Project, "project_number" | "title" | "pi_name">): string {
  return `${p.project_number} — ${p.title}${p.pi_name ? ` (${p.pi_name})` : ""}`;
}

const PROJECT_NUMBER = /^[A-Za-z0-9][A-Za-z0-9/._-]{1,39}$/;

export function projectNumberError(value: string): string | null {
  return PROJECT_NUMBER.test(value.trim())
    ? null
    : "A project number is 2–40 letters, digits and / . _ -, e.g. SP/2025/017";
}

export type ProjectImportPlan = {
  /** New projects to add. */
  added: NewProjectInput[];
  /** Existing projects whose title or PI the paste changes, by id. */
  updated: { id: string; patch: Partial<NewProjectInput> }[];
  unchanged: number;
  /** One per bad line. Any problem means nothing is applied. */
  problems: string[];
};

/**
 * Plans a bulk project import from pasted text — a spreadsheet's columns
 * pasted as-is (tab separated), or comma / semicolon separated:
 *
 *     project number, title, principal investigator (optional)
 *
 * Blank lines, `#` comments and a header row starting "project" are skipped.
 * A number already on the list updates its title and PI (and reactivates it);
 * a new number is added. **All or nothing**, like the LDAP import: a malformed
 * line, a missing title or a number given twice is reported and nothing is
 * applied.
 */
export function planProjectImport(text: string, existing: Project[]): ProjectImportPlan {
  const byNumber = new Map(existing.map((p) => [p.project_number.toLowerCase(), p]));
  const problems: string[] = [];
  const seen = new Map<string, number>();
  const added: NewProjectInput[] = [];
  const updated: ProjectImportPlan["updated"] = [];
  let unchanged = 0;

  text.split(/\r?\n/).forEach((raw, i) => {
    const n = i + 1;
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;
    const fields = (line.includes("\t") ? line.split("\t") : line.split(/[,;]/)).map((f) =>
      f.trim().replace(/^"(.*)"$/, "$1").trim()
    );
    if (/^project/i.test(fields[0] ?? "")) return;
    const [number = "", title = "", pi = ""] = fields;
    if (fields.length < 2 || !title) {
      problems.push(`Line ${n}: expected "project number, title, PI", got "${line}"`);
      return;
    }
    const numberProblem = projectNumberError(number);
    if (numberProblem) {
      problems.push(`Line ${n}: "${number}" — ${numberProblem}`);
      return;
    }
    const key = number.toLowerCase();
    const earlier = seen.get(key);
    if (earlier !== undefined) {
      problems.push(`Line ${n}: project ${number} is also given on line ${earlier}`);
      return;
    }
    seen.set(key, n);
    const current = byNumber.get(key);
    const piName = pi || null;
    if (!current) {
      added.push({ project_number: number, title, pi_name: piName, active: true });
    } else if (current.title !== title || current.pi_name !== piName || !current.active) {
      updated.push({ id: current.id, patch: { title, pi_name: piName, active: true } });
    } else {
      unchanged += 1;
    }
  });

  if (problems.length > 0) return { added: [], updated: [], unchanged, problems };
  return { added, updated, unchanged, problems };
}
