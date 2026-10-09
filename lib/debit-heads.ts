import { z } from "zod";
import { DEBIT_HEAD_LABELS, type BookingType, type DebitHead, type Profile, type Role } from "./types";
import { narrowToOffice } from "./office-debit-heads";
import type { Unit } from "./units";

/**
 * Which budget a stay is charged to - the "debitable head" (Phase 4).
 *
 * Required on every booking except a personal one, which is never asked
 * ({@link asksForDebitHead}). **Which heads a requester may choose is
 * configuration** (Settings → Debitable heads, `rules.debit`), keyed by the
 * requester's *category*. The defaults are the office's own list of
 * 8 October 2026, which replaced the one taken from the meeting notes:
 *
 * | Category | Room booking | Dining (Phase 6) |
 * | --- | --- | --- |
 * | Faculty | every head except Institute Grant, Alumni Fund, Student Fund and Hostel Funds | the same, less Project |
 * | Non-teaching staff | Personal | Personal |
 * | Offices (officer and department alike) | Institute / Department / Special Budget / Student Fund / Hostel Funds / Alumni Fund | the same |
 * | Clubs, councils and fests | Student Fund / Special Budget | the same |
 * | Students | Personal | Personal |
 * | On behalf of an alumnus, and the IAR Student Cell | Alumni Fund / Special Budget | the same |
 * | Personal booking (anyone) | Personal | Personal |
 *
 * It is stated as the office wrote it, not reasoned from the earlier table:
 * **non-teaching staff lost the department budget** and **the two classes of
 * office are now one list**, which the previous defaults split. The nine
 * heads themselves have existed since migration 15; four of them
 * (Alumni Fund, Student Fund, Hostel Funds, and Personal on an official
 * faculty booking) were not offered anywhere until this list.
 *
 * **An office is then narrowed to its own row** (9 Oct 2026): Settings keys
 * the list by category, so every office shared the same six heads, and the
 * office's spreadsheet of its mailboxes is finer than that - the Director's
 * Office spends the Institute Grant, a department office its department's
 * budget, the Students Section the student and hostel funds. The category
 * list is the ceiling for offices in general and
 * `lib/office-debit-heads.ts` is the ceiling for one office; `debitHeadsByType`
 * intersects them. An office that is not on the spreadsheet keeps the
 * category list.
 *
 * The allowed list is computed on the server (`debitHeadsByType`) and handed
 * to the booking form, and the schema checks the choice against the same list
 * on both sides - so a crafted request cannot charge a project from a staff
 * account. Any head but Personal Funds also needs the requester's
 * {@link FUND_DECLARATION}.
 *
 * Kept apart from the tariff: the head records *who pays*; the rate still
 * follows the room, the kind of booking and the category of guest.
 */

export type DebitCategory =
  | "faculty"
  | "staff"
  | "officer_office"
  | "department_office"
  | "club"
  | "student"
  | "iar_student_cell"
  | "alumni"
  | "personal"
  | "manager";

export const DEBIT_CATEGORIES: DebitCategory[] = [
  "faculty",
  "staff",
  "officer_office",
  "department_office",
  "club",
  "student",
  "iar_student_cell",
  "alumni",
  "personal",
  "manager",
];

export const DEBIT_CATEGORY_LABELS: Record<DebitCategory, string> = {
  faculty: "Faculty (official)",
  staff: "Non-teaching staff (official)",
  officer_office: "Officer offices - Director, Registrar, Deans",
  department_office: "Department offices",
  club: "Student clubs",
  student: "Students",
  iar_student_cell: "IAR Student Cell",
  alumni: "On behalf of an alumnus",
  personal: "Any personal booking",
  manager: "Guest House Manager, booking at the desk",
};

/**
 * Every head the office uses, in the order it listed them (8 Oct 2026). All
 * nine are in use now: Alumni Fund, Student Fund and Hostel Funds were on
 * the enum from migration 15 but offered to nobody until this list.
 */
export const STANDARD_DEBIT_HEADS: DebitHead[] = [
  "institute_grant",
  "professional_development_fund",
  "project_grant",
  "department_budget",
  "special_budget",
  "personal_funds",
  "alumni_fund",
  "student_fund",
  "hostel_funds",
];

/** How the head prints on the invoice: "Department / Institute / PDF / Personal / Project / Special Budget". */
export const INVOICE_HEAD_LABELS: Partial<Record<DebitHead, string>> = {
  department_budget: "Department",
  institute_grant: "Institute",
  professional_development_fund: "PDF",
  personal_funds: "Personal",
  project_grant: "Project",
  special_budget: "Special Budget",
  alumni_fund: "Alumni",
  student_fund: "Student",
  hostel_funds: "Hostel",
};

export function invoiceHeadLabel(head: DebitHead | null | undefined): string {
  if (!head) return "Not recorded";
  return INVOICE_HEAD_LABELS[head] ?? DEBIT_HEAD_LABELS[head];
}

export type DebitRules = {
  /** Room (and room + meals) bookings. */
  room: Record<DebitCategory, DebitHead[]>;
  /** Meals-only / dining bookings (Phase 6). Never Project. */
  dining: Record<DebitCategory, DebitHead[]>;
  /**
   * Which shape of the defaults a saved row was made from, so
   * `upgradeDebitRules` brings it forward exactly once. Absent on rows saved
   * before 24 Sep 2026.
   */
  revision?: number;
};

/**
 * Revision 2 (24 Sep 2026): Special Budget on every official booking.
 * Revision 3 (25 Sep 2026): Special Budget for everyone except students.
 * Revision 4 (1 Oct 2026): not on a personal dining booking.
 * Revision 5 (7 Oct 2026): not on a personal booking of any kind, which is
 * also when the form stopped asking (see {@link asksForDebitHead}).
 * Revision 6 (8 Oct 2026): **the office's own list of heads per requester**,
 * which is not reachable by adding or removing one head from revision 5 -
 * non-teaching staff lost the department budget, the two classes of office
 * were merged onto one longer list, clubs moved from the department budget to
 * the Student Fund, and alumni bookings moved from the Institute Grant to the
 * Alumni Fund. So revision 6 **replaces** both lists with
 * {@link DEFAULT_DEBIT_RULES} rather than editing them.
 */
export const DEBIT_RULES_REVISION = 6;

export const DEFAULT_DEBIT_RULES: DebitRules = {
  room: {
    // "All funds except Institute Grant, Alumni, Student Fund and Hostel" -
    // the grant is the offices' money, and the other three are not a
    // department's to spend. Personal Funds is on the list because a faculty
    // member may host a visitor at their own expense.
    faculty: [
      "professional_development_fund",
      "project_grant",
      "department_budget",
      "special_budget",
      "personal_funds",
    ],
    // Non-teaching staff: Personal Funds only. Their official hosting is
    // raised by the office or the department that is paying, which has its
    // own list below.
    staff: ["personal_funds"],
    // Both classes of office get the same six: the office's list says
    // "Offices" without dividing them, and the Director's office and a
    // department office draw on the same funds in practice.
    officer_office: [
      "institute_grant",
      "department_budget",
      "special_budget",
      "student_fund",
      "hostel_funds",
      "alumni_fund",
    ],
    department_office: [
      "institute_grant",
      "department_budget",
      "special_budget",
      "student_fund",
      "hostel_funds",
      "alumni_fund",
    ],
    // "Fests - Student Funds Special Budget Only". Councils, clubs and fests
    // are all `club` here, and a fest's visiting speakers are paid for out of
    // the student fund, not a department's budget.
    club: ["student_fund", "special_budget"],
    student: ["personal_funds"],
    // "Alumni IAR - Alumni Fund, Special Budget", which covers both the
    // Student Cell's own official requests and any booking made for an
    // alumnus.
    iar_student_cell: ["alumni_fund", "special_budget"],
    alumni: ["alumni_fund", "special_budget"],
    // A personal booking is the requester's own money, and since 7 Oct 2026
    // it is not even asked about - the form states nothing and the server
    // writes Personal Funds itself.
    personal: ["personal_funds"],
    // The desk books for everyone, so it can name any head.
    manager: [...STANDARD_DEBIT_HEADS],
  },
  dining: {
    // The same lists, less Project: dining is never charged to a project
    // (`debitRulesSchema` refuses it).
    faculty: [
      "professional_development_fund",
      "department_budget",
      "special_budget",
      "personal_funds",
    ],
    staff: ["personal_funds"],
    officer_office: [
      "institute_grant",
      "department_budget",
      "special_budget",
      "student_fund",
      "hostel_funds",
      "alumni_fund",
    ],
    department_office: [
      "institute_grant",
      "department_budget",
      "special_budget",
      "student_fund",
      "hostel_funds",
      "alumni_fund",
    ],
    club: ["student_fund", "special_budget"],
    student: ["personal_funds"],
    iar_student_cell: ["alumni_fund", "special_budget"],
    alumni: ["alumni_fund", "special_budget"],
    personal: ["personal_funds"],
    manager: STANDARD_DEBIT_HEADS.filter((h) => h !== "project_grant"),
  },
  revision: DEBIT_RULES_REVISION,
};

/**
 * The categories Special Budget is offered to by default - read off the
 * defaults rather than written out again, so the two cannot disagree. Not
 * students, not non-teaching staff, and never a personal booking.
 */
export const SPECIAL_FUNDS_CATEGORIES: DebitCategory[] = DEBIT_CATEGORIES.filter((c) =>
  DEFAULT_DEBIT_RULES.room[c].includes("special_budget")
);

/**
 * Bring a saved Settings row up to the current defaults, once.
 *
 * Settings rows replace the default lists wholesale, so a row saved before a
 * head reached a category would never offer it there - and the console could
 * not show it either, because the grid only lists heads in use. A row's
 * `revision` says which shape of the defaults it was made from.
 *
 * **Revision 6 (8 Oct 2026) replaces both lists.** Revisions 2 to 5 each
 * added or removed one head (Special Budget), so they could be applied to a
 * saved row field by field. The office's own list is a different mapping
 * altogether - four categories changed heads rather than gaining one - and
 * there is no edit that turns the old row into it. The honest upgrade is
 * therefore to take the new defaults, which is also what the office means by
 * giving the list: it is the mapping, not a suggestion the console had
 * already overridden. Saving from the console writes the current revision,
 * after which this leaves the row alone for good.
 */
export function upgradeDebitRules(stored: Record<string, unknown>): Record<string, unknown> {
  const revision = typeof stored.revision === "number" ? stored.revision : 1;
  if (revision >= DEBIT_RULES_REVISION) return stored;
  return {
    ...stored,
    room: { ...DEFAULT_DEBIT_RULES.room },
    dining: { ...DEFAULT_DEBIT_RULES.dining },
    revision: DEBIT_RULES_REVISION,
  };
}

const DEBIT_HEAD_VALUES = [
  "institute_grant",
  "professional_development_fund",
  "project_grant",
  "department_budget",
  "special_budget",
  "personal_funds",
  "alumni_fund",
  "student_fund",
  "hostel_funds",
] as const satisfies readonly DebitHead[];

export const debitHeadSchema = z.enum(DEBIT_HEAD_VALUES);

/**
 * Heads a category may never be charged to, whatever Settings says.
 *
 * **Faculty cannot debit the Institute Grant** (23 Sep 2026). The grant is the
 * institute's own money, spent by the offices that hold it - the Director, the
 * Registrar, the Deans and the IAR Office, which is why they still have it
 * below. A faculty member hosting a visitor charges the department, the
 * project or their PDF; letting the grant appear on their form made it look
 * like a fourth budget they could reach, and it is not one.
 *
 * It is a floor under the Settings console rather than only a default, because
 * a default can be ticked back on. {@link allowedHeads} strips it on read, so
 * a row saved before this rule keeps working instead of breaking the page, and
 * {@link debitRulesSchema} refuses to save it.
 */
export const FORBIDDEN_DEBIT_HEADS: Partial<Record<DebitCategory, DebitHead[]>> = {
  /**
   * "All funds except Institute Grant, Alumni, Student Fund and Hostel"
   * (8 Oct 2026) - the office's own wording, read as a floor and not only as
   * a default. The grant is the institute's own money, spent by the offices
   * that hold it; the other three belong to the alumni, the students and the
   * hostels. Institute Grant has been refused here since 23 Sep 2026; the
   * three funds joined it when they were first offered to anyone.
   */
  faculty: ["institute_grant", "alumni_fund", "student_fund", "hostel_funds"],
  // Special Budget is for everyone except students (25 Sep 2026): a
  // student's stay is always their own money.
  student: ["special_budget"],
  /**
   * And off **every** personal booking (7 Oct 2026), not only a personal meal
   * booking as it was from 1 Oct. A special fund pays for an institute
   * occasion; a private visit by somebody's family is not one, whether they
   * sleep here or only eat here. With this the personal lists hold one head,
   * which is what lets the form stop asking - see {@link asksForDebitHead}.
   */
  personal: ["special_budget"],
};

/**
 * Heads a category may never be charged to **for meals**, on top of the list
 * above. Empty since 7 Oct 2026: its one entry - no Special Funds on a
 * personal meal booking (1 Oct 2026) - was widened to every personal booking
 * and moved into `FORBIDDEN_DEBIT_HEADS`, which covers both kinds. The seam
 * is kept because dining is the kind of charge the office narrows first, and
 * `allowedHeads` already reads it.
 */
export const FORBIDDEN_DINING_HEADS: Partial<Record<DebitCategory, DebitHead[]>> = {};

function forbiddenFor(category: DebitCategory, kind: "room" | "dining"): DebitHead[] {
  return [
    ...(FORBIDDEN_DEBIT_HEADS[category] ?? []),
    ...(kind === "dining" ? (FORBIDDEN_DINING_HEADS[category] ?? []) : []),
  ];
}

/** Whether this category may ever be offered that head, for this kind of booking. */
export function isHeadAllowedFor(
  category: DebitCategory,
  head: DebitHead,
  kind: "room" | "dining" = "room"
): boolean {
  return !forbiddenFor(category, kind).includes(head);
}

/** A configured list with the forbidden heads removed. */
export function allowedHeads(
  category: DebitCategory,
  heads: DebitHead[],
  kind: "room" | "dining" = "room"
): DebitHead[] {
  const forbidden = forbiddenFor(category, kind);
  return forbidden.length > 0 ? heads.filter((h) => !forbidden.includes(h)) : heads;
}

const headList = (
  category: DebitCategory,
  label: string,
  allowProject: boolean,
  kind: "room" | "dining" = "room"
) =>
  z
    .array(debitHeadSchema)
    .min(1, `${label}: choose at least one head`)
    .refine((heads) => new Set(heads).size === heads.length, `${label}: a head is listed twice`)
    .refine(
      (heads) => allowProject || !heads.includes("project_grant"),
      `${label}: dining cannot be charged to a project`
    )
    .refine(
      (heads) => heads.every((h) => isHeadAllowedFor(category, h, kind)),
      `${label}: ${forbiddenFor(category, kind)
        .map((h) => DEBIT_HEAD_LABELS[h])
        .join(" and ")} cannot be charged by this category`
    );

export const debitRulesSchema = z.object({
  revision: z.number().int().optional(),
  room: z.object(
    Object.fromEntries(
      DEBIT_CATEGORIES.map((c) => [c, headList(c, `Room - ${DEBIT_CATEGORY_LABELS[c]}`, true)])
    ) as Record<DebitCategory, ReturnType<typeof headList>>
  ),
  dining: z.object(
    Object.fromEntries(
      DEBIT_CATEGORIES.map((c) => [
        c,
        headList(c, `Dining - ${DEBIT_CATEGORY_LABELS[c]}`, false, "dining"),
      ])
    ) as Record<DebitCategory, ReturnType<typeof headList>>
  ),
});

/**
 * The requester's category for this kind of booking. A student is always
 * "student"; otherwise a personal booking is "personal" and one for an
 * alumnus "alumni", whoever makes it, and the account decides the rest -
 * faculty or staff for an employee (uncategorised counts as faculty, the
 * wider set), and the office's class for an office (unclassified counts as a
 * department office, the narrower).
 *
 * **The student check comes first** (25 Sep 2026). A student's only booking
 * type is personal, so before this their bookings fell into "personal" and
 * the Students row in Settings was never read - harmless while the two lists
 * were the same, and a leak the moment Special Funds was offered on personal
 * bookings but not to students.
 */
export function debitCategoryFor(
  role: Role,
  bookingType: BookingType,
  requester: Pick<Profile, "staff_category" | "unit_id">,
  units: Unit[]
): DebitCategory {
  if (role === "student") return "student";
  if (bookingType === "personal") return "personal";
  if (bookingType === "alumni") return "alumni";
  switch (role) {
    case "employee":
      return requester.staff_category === "staff" ? "staff" : "faculty";
    case "official":
    case "iar_cell": {
      const unit = units.find((u) => u.id === requester.unit_id);
      return unit?.office_class === "officer" ? "officer_office" : "department_office";
    }
    case "club":
      return "club";
    case "iar_student_cell":
      return "iar_student_cell";
    default:
      return "manager";
  }
}

/** The heads offered, per booking type, for this requester - what the form and schema use. */
export type DebitHeadsByType = Partial<Record<BookingType, DebitHead[]>>;

/** The two categories the office's per-office spreadsheet applies to. */
const OFFICE_CATEGORIES: DebitCategory[] = ["officer_office", "department_office"];

export function debitHeadsByType(
  role: Role,
  bookingTypes: BookingType[],
  requester: Pick<Profile, "staff_category" | "unit_id"> & { email?: string | null },
  units: Unit[],
  rules: DebitRules,
  kind: "room" | "dining" = "room"
): DebitHeadsByType {
  return Object.fromEntries(
    bookingTypes.map((type) => {
      const category = debitCategoryFor(role, type, requester, units);
      // Stripped here rather than trusted from Settings: the form and
      // `createBooking` both read this, so a head a category may never use
      // cannot be offered or accepted even if a stored row still lists it.
      const configured = allowedHeads(category, rules[kind][category], kind);
      // Then narrowed to the particular office (9 Oct 2026). Settings keys
      // the list by category, and the office's own spreadsheet is per
      // mailbox - the Director's Office spends the Institute Grant, a
      // department office its department's budget - so the category list is
      // a ceiling for every office and this is the ceiling for this one. Only
      // the office categories: an employee's or a club's heads are not on
      // that spreadsheet, and a personal booking is not asked at all.
      return [
        type,
        OFFICE_CATEGORIES.includes(category)
          ? narrowToOffice(configured, requester.email)
          : configured,
      ];
    })
  );
}

/** The head when there is only one it can be, so the form shows it rather than asking. */
export function fixedDebitHead(allowed: DebitHead[] | undefined): DebitHead | null {
  return allowed && allowed.length === 1 ? allowed[0] : null;
}

/**
 * The head a **personal** booking is charged to. There is only one it can be.
 */
export const PERSONAL_DEBIT_HEAD: DebitHead = "personal_funds";

/**
 * Whether the form asks at all (7 Oct 2026, the office's eighth list).
 *
 * **A personal booking is not asked.** The office's words were that personal
 * bookings - students' included - should show no debitable head: the money is
 * the requester's own, the budget question has one possible answer, and a
 * card headed "Debitable head" on a family visit read as though a department
 * might be about to pay for it. So the question is not put, and the server
 * records {@link PERSONAL_DEBIT_HEAD} itself.
 *
 * It is a rule rather than a consequence of the list having one entry
 * (`fixedDebitHead`), because the two say different things: a list of one is
 * a question with one answer, which the form still *states*; this is a
 * question that is not asked. The schema reads it on both sides, so a crafted
 * payload naming a department on a personal booking is overwritten rather
 * than believed.
 */
export function asksForDebitHead(bookingType: BookingType): boolean {
  return bookingType !== "personal";
}

/**
 * The head to store for this booking: what the requester chose, or Personal
 * Funds when nobody was asked. One function for the schema, the form and
 * `createBooking`, so the three cannot record different budgets.
 */
export function debitHeadFor(
  bookingType: BookingType,
  chosen: DebitHead | null | undefined
): DebitHead | null {
  return asksForDebitHead(bookingType) ? (chosen ?? null) : PERSONAL_DEBIT_HEAD;
}

/**
 * What may be written down beside the head, or null when the head takes
 * nothing.
 *
 * - **Special Budget** asks which fund, and is **mandatory** (8 Oct 2026).
 *   The office's own list writes it as "Special Budget (Please specify the
 *   details)", so the details are part of choosing the head rather than a
 *   courtesy: a sanction nobody names cannot be checked by the accounts
 *   section. It was optional from 24 Sep 2026, when the office had asked for
 *   the head and nothing more. The sanction letter beside it stays optional -
 *   a requester waiting on a scan should not be stopped from booking, and the
 *   desk can ask for it later.
 * - **Project** asks for the project itself, and is mandatory (1 Oct 2026).
 *   It used to be a dropdown of the projects in the console, which the office
 *   asked to remove: the list was always behind the real one, and a requester
 *   whose sanction landed last week had nothing to choose. What they type is
 *   snapshotted onto the booking and printed on the invoice, which splits it
 *   back into number and title on " - " (`projectFromDetails`).
 */
export function debitDetailsPrompt(head: DebitHead | null | undefined): string | null {
  if (head === "special_budget") return "Which special fund (name or sanction reference)";
  if (head === "project_grant") return "Project number and title";
  return null;
}

/** Whether the details above are mandatory. The project and Special Budget are. */
export function debitDetailsRequired(head: DebitHead | null | undefined): boolean {
  return head === "project_grant" || head === "special_budget";
}

/** Special Budget may carry its sanction letter. Optional since 24 Sep 2026. */
export function acceptsDebitDocument(head: DebitHead | null | undefined): boolean {
  return head === "special_budget";
}

/**
 * The declaration a requester signs when somebody else's money pays
 * (8 Oct 2026, the office's words, reproduced exactly).
 *
 * Personal Funds is the one head it is not asked for: the requester is the
 * competent authority for their own money and there is no balance for them to
 * verify. Every other head spends a budget they do not own, and the office
 * wanted the request itself to carry the assurance - until now the first
 * person to ask whether a department had the money was the accounts section,
 * after the guest had gone.
 *
 * Checked on both sides ({@link fundDeclarationError}) and recorded with the
 * booking (`fund_declaration_at`, migration 30), so an approver can see that
 * it was given and when.
 */
export const FUND_DECLARATION =
  "I have the necessary approval for the usage of funds from the competent authority and verified that sufficient balance is there in the debitable head.";

/** Whether this head asks for {@link FUND_DECLARATION}: any but Personal Funds. */
export function requiresFundDeclaration(head: DebitHead | null | undefined): boolean {
  return head !== null && head !== undefined && head !== PERSONAL_DEBIT_HEAD;
}

/**
 * Why the declaration is missing, or null when it is not needed or was given.
 * One rule for the form, the schema and `createBooking`.
 */
export function fundDeclarationError(
  head: DebitHead | null | undefined,
  declared: boolean | null | undefined
): string | null {
  if (!requiresFundDeclaration(head)) return null;
  return declared === true ? null : "Tick the declaration to confirm the funds are approved and available";
}

/** Whether this head needs a project picked from the list. */
export function needsProject(head: DebitHead | null | undefined): boolean {
  return head === "project_grant";
}

/** Longest sub-head accepted; the database checks the same (migration 24). */
export const MAX_SUBHEAD_LENGTH = 120;

/**
 * "Project Grant - SP/2025/017 - Storage (Dr. A) · Sub-head: Travel", or
 * "Not recorded" for a booking made before the question existed. The same
 * words on screen, in mail and in exports.
 */
export function describeDebit(booking: {
  debit_head: DebitHead | null;
  debit_details: string | null;
  debit_subhead?: string | null;
}): string {
  if (!booking.debit_head) return "Not recorded";
  const label = DEBIT_HEAD_LABELS[booking.debit_head];
  const withDetails = booking.debit_details ? `${label} - ${booking.debit_details}` : label;
  return booking.debit_subhead ? `${withDetails} · Sub-head: ${booking.debit_subhead}` : withDetails;
}

/**
 * What a personal booking tells the requester about paying - the office's
 * wording (30 Sep 2026), which names no particular way to pay.
 */
export const PAY_AT_CHECKOUT_NOTE =
  "An invoice will be generated and can be settled at the time of checkout. Multiple payment options are available at the guest house.";

/** Why this head does not fit the booking, or null when it does. */
export function debitHeadError(
  allowed: DebitHead[] | undefined,
  head: DebitHead | null | undefined
): string | null {
  if (!head) return "Choose the debitable head this stay is charged to";
  if (!allowed || allowed.length === 0) return "No debitable head is set up for this kind of booking";
  if (allowed.includes(head)) return null;
  return `${DEBIT_HEAD_LABELS[head]} cannot be used for this booking - choose ${allowed
    .map((h) => DEBIT_HEAD_LABELS[h])
    .join(" or ")}`;
}
