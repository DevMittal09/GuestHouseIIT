import { z } from "zod";
import { DEBIT_HEAD_LABELS, type BookingType, type DebitHead, type Profile, type Role } from "./types";
import type { Unit } from "./units";

/**
 * Which budget a stay is charged to — the "debitable head" (Phase 4).
 *
 * Required on every booking. **Which heads a requester may choose is
 * configuration** (Settings → Debitable heads, `rules.debit`), keyed by the
 * requester's *category*, with defaults from the meeting notes:
 *
 * | Category | Room booking | Dining (Phase 6) |
 * | --- | --- | --- |
 * | Faculty | Department / Project / PDF | Department / PDF / Personal |
 * | Non-teaching staff | Department | Department |
 * | Officer office (Director, Registrar…) | Institute | Institute |
 * | Department office | Department | Department |
 * | Club | Department | — |
 * | Personal booking (anyone) | Personal | — |
 *
 * The allowed list is computed on the server (`debitHeadsByType`) and handed
 * to the booking form, and the schema checks the choice against the same list
 * on both sides — so a crafted request cannot charge a project from a staff
 * account. Choosing **Project** requires picking a project from the list the
 * console maintains (`lib/projects.ts`).
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
  officer_office: "Officer offices — Director, Registrar, Deans",
  department_office: "Department offices",
  club: "Student clubs",
  student: "Students",
  iar_student_cell: "IAR Student Cell",
  alumni: "On behalf of an alumnus",
  personal: "Any personal booking",
  manager: "Guest House Manager, booking at the desk",
};

/** The heads the office's invoice template names; the others are legacy (migration 15). */
export const STANDARD_DEBIT_HEADS: DebitHead[] = [
  "department_budget",
  "institute_grant",
  "professional_development_fund",
  "personal_funds",
  "project_grant",
];

/** How the head prints on the invoice: "Department / Institute / PDF / Personal / Project". */
export const INVOICE_HEAD_LABELS: Partial<Record<DebitHead, string>> = {
  department_budget: "Department",
  institute_grant: "Institute",
  professional_development_fund: "PDF",
  personal_funds: "Personal",
  project_grant: "Project",
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
};

export const DEFAULT_DEBIT_RULES: DebitRules = {
  room: {
    faculty: ["department_budget", "project_grant", "professional_development_fund"],
    staff: ["department_budget"],
    officer_office: ["institute_grant"],
    department_office: ["department_budget"],
    club: ["department_budget"],
    student: ["personal_funds"],
    iar_student_cell: ["institute_grant"],
    alumni: ["institute_grant", "personal_funds"],
    personal: ["personal_funds"],
    manager: [...STANDARD_DEBIT_HEADS],
  },
  dining: {
    faculty: ["department_budget", "professional_development_fund", "personal_funds"],
    staff: ["department_budget"],
    officer_office: ["institute_grant"],
    department_office: ["department_budget"],
    club: ["department_budget"],
    student: ["personal_funds"],
    iar_student_cell: ["institute_grant"],
    alumni: ["personal_funds"],
    personal: ["personal_funds"],
    manager: ["department_budget", "institute_grant", "professional_development_fund", "personal_funds"],
  },
};

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
 * institute's own money, spent by the offices that hold it — the Director, the
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
  faculty: ["institute_grant"],
};

/** Whether this category may ever be offered that head. */
export function isHeadAllowedFor(category: DebitCategory, head: DebitHead): boolean {
  return !FORBIDDEN_DEBIT_HEADS[category]?.includes(head);
}

/** A configured list with the forbidden heads removed. */
export function allowedHeads(category: DebitCategory, heads: DebitHead[]): DebitHead[] {
  const forbidden = FORBIDDEN_DEBIT_HEADS[category];
  return forbidden ? heads.filter((h) => !forbidden.includes(h)) : heads;
}

const headList = (category: DebitCategory, label: string, allowProject: boolean) =>
  z
    .array(debitHeadSchema)
    .min(1, `${label}: choose at least one head`)
    .refine((heads) => new Set(heads).size === heads.length, `${label}: a head is listed twice`)
    .refine(
      (heads) => allowProject || !heads.includes("project_grant"),
      `${label}: dining cannot be charged to a project`
    )
    .refine(
      (heads) => heads.every((h) => isHeadAllowedFor(category, h)),
      `${label}: ${(FORBIDDEN_DEBIT_HEADS[category] ?? [])
        .map((h) => DEBIT_HEAD_LABELS[h])
        .join(" and ")} cannot be charged by this category`
    );

export const debitRulesSchema = z.object({
  room: z.object(
    Object.fromEntries(
      DEBIT_CATEGORIES.map((c) => [c, headList(c, `Room — ${DEBIT_CATEGORY_LABELS[c]}`, true)])
    ) as Record<DebitCategory, ReturnType<typeof headList>>
  ),
  dining: z.object(
    Object.fromEntries(
      DEBIT_CATEGORIES.map((c) => [c, headList(c, `Dining — ${DEBIT_CATEGORY_LABELS[c]}`, false)])
    ) as Record<DebitCategory, ReturnType<typeof headList>>
  ),
});

/**
 * The requester's category for this kind of booking. A personal booking is
 * "personal" and one for an alumnus "alumni", whoever makes it; otherwise the
 * account decides — faculty or staff for an employee (uncategorised counts as
 * faculty, the wider set), and the office's class for an office (unclassified
 * counts as a department office, the narrower).
 */
export function debitCategoryFor(
  role: Role,
  bookingType: BookingType,
  requester: Pick<Profile, "staff_category" | "unit_id">,
  units: Unit[]
): DebitCategory {
  if (bookingType === "personal") return "personal";
  if (bookingType === "alumni") return "alumni";
  switch (role) {
    case "student":
      return "student";
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

/** The heads offered, per booking type, for this requester — what the form and schema use. */
export type DebitHeadsByType = Partial<Record<BookingType, DebitHead[]>>;

export function debitHeadsByType(
  role: Role,
  bookingTypes: BookingType[],
  requester: Pick<Profile, "staff_category" | "unit_id">,
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
      return [type, allowedHeads(category, rules[kind][category])];
    })
  );
}

/** The head when there is only one it can be, so the form shows it rather than asking. */
export function fixedDebitHead(allowed: DebitHead[] | undefined): DebitHead | null {
  return allowed && allowed.length === 1 ? allowed[0] : null;
}

/** What must be written down beside the head, or null when the head is enough. */
export function debitDetailsPrompt(head: DebitHead | null | undefined): string | null {
  return head === "special_budget" ? "Details of the special budget" : null;
}

/** A Special Budget has to be backed by its sanction, uploaded with the request. */
export function needsDebitDocument(head: DebitHead | null | undefined): boolean {
  return head === "special_budget";
}

/** Whether this head needs a project picked from the list. */
export function needsProject(head: DebitHead | null | undefined): boolean {
  return head === "project_grant";
}

/**
 * "Project Grant — SP/2025/017 — Storage (Dr. A)", or "Not recorded" for a
 * booking made before the question existed. The same words on screen, in mail
 * and in exports.
 */
export function describeDebit(booking: {
  debit_head: DebitHead | null;
  debit_details: string | null;
}): string {
  if (!booking.debit_head) return "Not recorded";
  const label = DEBIT_HEAD_LABELS[booking.debit_head];
  return booking.debit_details ? `${label} — ${booking.debit_details}` : label;
}

/** What a personal booking tells the requester about paying. */
export const PAY_AT_CHECKOUT_NOTE =
  "Personal — you will be given an invoice at checkout and can settle it at the desk, or by bank transfer using the details on it.";

/** Why this head does not fit the booking, or null when it does. */
export function debitHeadError(
  allowed: DebitHead[] | undefined,
  head: DebitHead | null | undefined
): string | null {
  if (!head) return "Choose the debitable head this stay is charged to";
  if (!allowed || allowed.length === 0) return "No debitable head is set up for this kind of booking";
  if (allowed.includes(head)) return null;
  return `${DEBIT_HEAD_LABELS[head]} cannot be used for this booking — choose ${allowed
    .map((h) => DEBIT_HEAD_LABELS[h])
    .join(" or ")}`;
}
