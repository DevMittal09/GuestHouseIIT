import {
  SPOUSE_RELATIONSHIP,
  SPOUSE_SCHOLARS_ONLY,
  spouseBookingError,
} from "../student-programme";
import type { Profile } from "../types";
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
   * out - a parent it does not name, a guardian where it names a parent, or
   * (9 Nov 2026) a spouse on a taught programme.
   */
  withheld: string[];
  /**
   * Why each entry of `withheld` is withheld, keyed as `withheld` spells it:
   * `short` for the greyed-out option on the form, `message` for the error.
   *
   * Two wordings because the two places can take different lengths - a
   * dropdown option has a line, an error has a sentence - and because the
   * reasons genuinely read differently: a parent the record does not name is
   * a gap the office can fill, a spouse on a taught programme is a rule that
   * will not change. A relationship with **no** entry here is one that is not
   * offered at all, and `withheldRelationshipError` words it from the
   * relationship's own name.
   */
  withheldReasons: Record<string, { short: string; message: string }>;
};

export const NO_GUEST_NAME_RULE: GuestNameRule = {
  fromRecord: false,
  locked: {},
  withheld: [],
  withheldReasons: {},
};

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
  options: readonly string[],
  /**
   * Who is booking, for the rules that do not come from the record.
   *
   * Today that is the **spouse rule** (9 Nov 2026): a regular B.Tech or
   * M.Tech student may not book for a spouse, an MS or PhD research scholar
   * may, and the programme is read from the roll number
   * (`lib/student-programme.ts`). It is answered from the **profile** rather
   * than from the academic record because it has to be answered even when
   * there is no record at all - otherwise a student the portal holds nothing
   * about would be the one student who could book a spouse.
   */
  requester?: Pick<Profile, "role" | "roll_number"> | null
): GuestNameRule {
  // The spouse rule applies to a student whether or not a record was found,
  // so it is settled before the early return below.
  const spouse = spouseWithholding(options, requester, record);
  if (!record || record.kind !== "student") {
    return spouse
      ? {
          ...NO_GUEST_NAME_RULE,
          withheld: [spouse.option],
          withheldReasons: { [spouse.option]: spouse.reason },
        }
      : NO_GUEST_NAME_RULE;
  }
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
  const withheldReasons: GuestNameRule["withheldReasons"] = {};
  if (spouse) {
    withheld.push(spouse.option);
    withheldReasons[spouse.option] = spouse.reason;
  }
  return { fromRecord: true, locked, withheld, withheldReasons };
}

/**
 * The spouse option and why it is withheld, or null when it may be offered -
 * which is also the answer for anybody who is not a student, since the rule
 * is about programmes and only students have one.
 *
 * The roll number comes from the profile first (`profiles_v` resolves it from
 * `institute_students`) and from the record second, so a deployment whose
 * profile view has not caught up still gets the right answer.
 */
function spouseWithholding(
  options: readonly string[],
  requester: Pick<Profile, "role" | "roll_number"> | null | undefined,
  record: AcademicRecord | null | undefined
): { option: string; reason: { short: string; message: string } } | null {
  if (!requester || requester.role !== "student") return null;
  // Matched the way every other relationship here is: on the Form Builder's
  // own spelling, ignoring case. Rename the option and the rule stops biting,
  // rather than producing a form nobody can submit.
  const option = options.find((o) => key(o) === key(SPOUSE_RELATIONSHIP));
  if (!option) return null;
  const student = record && record.kind === "student" ? (record as StudentRecord) : null;
  const reason = spouseBookingError({
    roll_number: requester.roll_number ?? student?.roll_number ?? null,
    program: student?.program ?? null,
  });
  return reason ? { option, reason: { short: SPOUSE_SCHOLARS_ONLY, message: reason } } : null;
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

/**
 * The short reason a relationship is withheld, where the rule has one to give,
 * for the greyed-out option on the form. Null for a relationship that is
 * simply not offered - a parent the record does not name - and null for one
 * that is not withheld at all.
 */
export function withheldReason(
  rule: GuestNameRule,
  relationship: string | null | undefined
): string | null {
  if (!relationship) return null;
  const found = Object.entries(rule.withheldReasons ?? {}).find(
    ([r]) => key(r) === key(relationship)
  );
  return found ? found[1].short : null;
}

/** Why this relationship may not be chosen, or null when it may. */
export function withheldRelationshipError(
  rule: GuestNameRule,
  guest: { relationship?: string | null }
): string | null {
  if (!isRelationshipWithheld(rule, guest.relationship)) return null;
  const relationship = (guest.relationship ?? "").trim();
  // A rule that says why in its own words - today the spouse rule - says it
  // here rather than being described again from the relationship's name.
  const given = Object.entries(rule.withheldReasons ?? {}).find(([r]) => key(r) === key(relationship));
  if (given) return given[1].message;
  return relationship.toLowerCase() === "guardian"
    ? "A guardian can be booked only when your academic record names neither parent."
    : `Your academic record does not name a ${relationship.toLowerCase()}. Ask the guest house office to add it if it is missing.`;
}

/** The help line under a locked name box. */
export const LOCKED_NAME_HINT = "From your academic record - ask the guest house office if it is wrong.";
