import type { DetailRow } from "./fields";
import type { StudentRecord } from "./types";

/**
 * The Assistant Warden's check of a student's request against the academic
 * record (25 Sep 2026): is the "Father" on the request the father the
 * institute has on file? The warden forwards a student's family to the guest
 * house, so they see the record's parents and guardian beside the guests the
 * student entered, with a verdict on each.
 *
 * A pure comparison. The record is fetched on the warden's page for the
 * requests in their own queue only, shown there, and never stored, logged or
 * mailed — the rule in `.memories/17-academic-records.md`.
 */

export type FamilyVerdict =
  /** The name on the request is the one on record. */
  | "match"
  /** Close — one name contains the other ("Ramesh" / "Ramesh Menon"). Worth a look. */
  | "close"
  /** A different name from the record's. */
  | "differs"
  /** On the request, but the record has no such name to compare with. */
  | "not_on_record"
  /** On record, and nobody with this relationship is on the request. */
  | "not_on_request";

export type FamilyCheck = {
  relationship: "Father" | "Mother" | "Guardian";
  onRecord: string | null;
  /** Guests on the request with this relationship, as the student typed them. */
  onRequest: string[];
  verdict: FamilyVerdict;
};

export const FAMILY_VERDICT_LABELS: Record<FamilyVerdict, string> = {
  match: "Matches the record",
  close: "Partly matches — check",
  differs: "Differs from the record",
  not_on_record: "Not on record",
  not_on_request: "Not on this request",
};

const HONORIFICS = new Set(["mr", "mrs", "ms", "miss", "dr", "prof", "smt", "shri", "sri", "late"]);

/** Lower case, letters and spaces only, titles dropped: "Dr. Ramesh  Menon" → ["ramesh", "menon"]. */
function tokens(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/[^\p{L}\s]/gu, " ")
    .split(/\s+/)
    .filter((t) => t && !HONORIFICS.has(t));
}

/** How alike two names are, ignoring case, punctuation, spacing and titles. */
export function compareNames(a: string, b: string): "same" | "close" | "different" {
  const x = tokens(a);
  const y = tokens(b);
  if (x.length === 0 || y.length === 0) return "different";
  if (x.join(" ") === y.join(" ")) return "same";
  // The same words in another order ("Menon Ramesh"), or one name inside the other.
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  if (short.every((t) => long.includes(t))) return "close";
  return "different";
}

const RELATIONSHIPS: { relationship: FamilyCheck["relationship"]; field: "father_name" | "mother_name" | "guardian_name" }[] = [
  { relationship: "Father", field: "father_name" },
  { relationship: "Mother", field: "mother_name" },
  { relationship: "Guardian", field: "guardian_name" },
];

/**
 * One line per relationship the record or the request mentions. A
 * relationship neither mentions is left out, so a student with no guardian
 * who brings only their mother reads as two lines, not three.
 */
export function checkFamily(
  record: Pick<StudentRecord, "father_name" | "mother_name" | "guardian_name"> | null,
  guests: { name: string; relationship: string | null }[]
): FamilyCheck[] {
  const out: FamilyCheck[] = [];
  for (const { relationship, field } of RELATIONSHIPS) {
    const onRecord = record?.[field]?.trim() || null;
    const onRequest = guests
      .filter((g) => g.relationship?.trim().toLowerCase() === relationship.toLowerCase())
      .map((g) => g.name.trim())
      .filter(Boolean);
    if (!onRecord && onRequest.length === 0) continue;
    let verdict: FamilyVerdict;
    if (onRequest.length === 0) verdict = "not_on_request";
    else if (!onRecord) verdict = "not_on_record";
    else {
      const results = onRequest.map((n) => compareNames(n, onRecord));
      verdict = results.every((r) => r === "same")
        ? "match"
        : results.some((r) => r === "different")
          ? "differs"
          : "close";
    }
    out.push({ relationship, onRecord, onRequest, verdict });
  }
  return out;
}

/**
 * What the Assistant Warden sees beside a student's request: the student's
 * academic record — parents' and guardian's names included — and each
 * Father / Mother / Guardian on the request checked against it. Built on the
 * server (`studentRecordPanels`), drawn by `components/student-record-check.tsx`.
 */
export type StudentRecordPanel = {
  /** How the lookup went — the same statuses as `academicRecordFor`. */
  status: "found" | "not_found" | "unavailable" | "not_applicable";
  /** The record's rows, as the student's own card shows them; empty without a record. */
  rows: DetailRow[];
  family: FamilyCheck[];
  /** A dummy record, until the academic database is connected. */
  sample: boolean;
};

/** The request's one-word summary for the queue: all good, something to look at, or nothing to compare. */
export function familySummary(checks: FamilyCheck[]): "match" | "check" | "none" {
  const compared = checks.filter((c) => c.verdict !== "not_on_request");
  if (compared.length === 0) return "none";
  return compared.every((c) => c.verdict === "match") ? "match" : "check";
}
