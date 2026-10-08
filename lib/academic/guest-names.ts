import type { AcademicRecord, StudentRecord } from "./types";

/**
 * A student's parents, taken from the record rather than asked for (7 Oct
 * 2026, the office's eighth list).
 *
 * What the office asked for, in their words: "Father and Mother are offered
 * when the record has them, with the name filled in and locked. Guardian is
 * offered only when the record has neither parent. Siblings and grandparents
 * are typed by hand. If there's no record, names stay editable."
 *
 * The reasoning is the same one that put the Assistant Warden's family check
 * on `/warden` in September: the warden's job at a student's request is to
 * confirm that the "Father" on it is the father the institute has on file,
 * and until now the student typed a name and the warden compared it
 * afterwards. If the portal knows the name, there is nothing to compare -
 * the request simply carries the right one. It also closes the gap the check
 * could only report: a student naming someone else's parent as their own.
 *
 * Two consequences the office asked for explicitly, both enforced on the
 * server and not merely shown:
 *
 * - **A relationship the record cannot support is not offered.** No father on
 *   record, no "Father" on the dropdown - there would be no name to lock it
 *   to, and offering it would be inviting a typed parent back in through the
 *   one door this is meant to close. Guardian is the mirror of that: it is
 *   for the student whose parents have died or are abroad, so it appears only
 *   when the record names neither parent.
 * - **A guest whose name came from the record needs no Aadhaar and no ID
 *   upload.** The institute has already identified them; demanding a document
 *   as well is asking the student to prove what the record already says. A
 *   sibling or a grandparent, typed by hand, is still asked.
 *
 * Everything here is pure, and matched against the Form Builder's own
 * relationship options ignoring case - so an office that renames "Father" to
 * "Dad" gets a dropdown that simply stops being locked, rather than a form
 * that cannot be submitted.
 */

/** The relationships a student's record can speak for, and the field each reads. */
const RECORD_RELATIONSHIPS = [
  { relationship: "Father", field: "father_name" },
  { relationship: "Mother", field: "mother_name" },
  { relationship: "Guardian", field: "guardian_name" },
] as const;

export type RecordRelationship = (typeof RECORD_RELATIONSHIPS)[number]["relationship"];

export type GuestNameRule = {
  /**
   * Whether a record was found at all. Without one nothing is locked and
   * nothing is withheld: the form is exactly what it was before this round,
   * because a student the portal knows nothing about must still be able to
   * book for their family.
   */
  fromRecord: boolean;
  /**
   * Relationship (as the Form Builder spells it) to the name the record
   * fixes. The form renders those names read-only; the schema refuses any
   * other value; `createBooking` writes the record's name regardless.
   */
  locked: Record<string, string>;
  /**
   * Relationships the form must not offer, because the record rules them
   * out - a parent it does not name, or a guardian where it names a parent.
   */
  withheld: string[];
};

export const NO_GUEST_NAME_RULE: GuestNameRule = { fromRecord: false, locked: {}, withheld: [] };

const key = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();

/**
 * The rule for this student and this form.
 *
 * `options` is the role's `relationship_options`, so the keys of `locked` and
 * the entries of `withheld` are the words actually on the dropdown. A
 * relationship the form does not offer is left out of both: there is nothing
 * to lock and nothing to withhold.
 */
export function guestNameRule(
  record: AcademicRecord | null | undefined,
  options: readonly string[]
): GuestNameRule {
  if (!record || record.kind !== "student") return NO_GUEST_NAME_RULE;
  const student = record as StudentRecord;
  const father = student.father_name?.trim() || null;
  const mother = student.mother_name?.trim() || null;
  const guardian = student.guardian_name?.trim() || null;
  // The guardian stands in for a parent, and only where there is none - the
  // same rule the Requester details card shows the name under.
  const guardianApplies = !father && !mother;

  const onRecord: Record<RecordRelationship, string | null> = {
    Father: father,
    Mother: mother,
    Guardian: guardianApplies ? guardian : null,
  };

  const locked: Record<string, string> = {};
  const withheld: string[] = [];
  for (const { relationship } of RECORD_RELATIONSHIPS) {
    // The option as the Form Builder spells it, matched ignoring case.
    const option = options.find((o) => key(o) === key(relationship));
    if (!option) continue;
    const name = onRecord[relationship];
    if (name) {
      locked[option] = name;
      continue;
    }
    // Guardian where a parent is on record is withheld; a guardian where
    // neither parent is on record *and* the record has no guardian either is
    // left open, because the record has nothing to say about them and the
    // student has to be able to bring somebody.
    if (relationship === "Guardian" && guardianApplies) continue;
    withheld.push(option);
  }
  return { fromRecord: true, locked, withheld };
}

/** The name the record fixes for this relationship, or null when it fixes none. */
export function lockedNameFor(
  rule: GuestNameRule,
  relationship: string | null | undefined
): string | null {
  if (!relationship) return null;
  const match = Object.keys(rule.locked).find((r) => key(r) === key(relationship));
  return match ? rule.locked[match] : null;
}

/** Whether this relationship may be chosen at all. */
export function isRelationshipWithheld(
  rule: GuestNameRule,
  relationship: string | null | undefined
): boolean {
  if (!relationship) return false;
  return rule.withheld.some((r) => key(r) === key(relationship));
}

/**
 * Whether this guest is one the record named - and so is not asked for an
 * Aadhaar number or an ID document. Keyed on the relationship rather than on
 * the name, because the server writes the name from the record anyway: by the
 * time a booking is stored, a locked relationship and a recorded name are the
 * same thing.
 */
export function isRecordedGuest(
  rule: GuestNameRule,
  guest: { relationship?: string | null }
): boolean {
  return lockedNameFor(rule, guest.relationship) !== null;
}

/**
 * Why this guest's name is not the one on record, or null when it is. The
 * schema reports it against the guest's own name field, so the form highlights
 * the row - though in practice the form fills the box in and makes it
 * read-only, so this fires for a crafted payload rather than for a person.
 */
export function lockedNameError(
  rule: GuestNameRule,
  guest: { name?: string | null; relationship?: string | null }
): string | null {
  const expected = lockedNameFor(rule, guest.relationship);
  if (!expected) return null;
  const typed = (guest.name ?? "").trim();
  if (key(typed) === key(expected)) return null;
  return `${guest.relationship} is on your academic record as ${expected}. If that is wrong, ask the guest house office to correct the record.`;
}

/** Why this relationship may not be chosen, or null when it may. */
export function withheldRelationshipError(
  rule: GuestNameRule,
  guest: { relationship?: string | null }
): string | null {
  if (!isRelationshipWithheld(rule, guest.relationship)) return null;
  const relationship = (guest.relationship ?? "").trim();
  return relationship.toLowerCase() === "guardian"
    ? "A guardian can be booked only when your academic record names neither parent."
    : `Your academic record does not name a ${relationship.toLowerCase()}. Ask the guest house office to add it if it is missing.`;
}

/** The help line under a locked name box. */
export const LOCKED_NAME_HINT = "From your academic record - ask the guest house office if it is wrong.";
