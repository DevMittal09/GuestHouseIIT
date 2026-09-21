import { DEBIT_HEAD_LABELS, type BookingType, type DebitHead, type Role } from "./types";

/**
 * Which budget a stay is charged to — the "debitable head".
 *
 * The rule is short:
 *
 * - A **student** books personally and pays personally. There is nothing to
 *   choose, so the form states it instead of asking.
 * - A **personal** booking by anyone is paid from personal funds, settled at
 *   the desk on the invoice at checkout.
 * - Everything else — official bookings, and bookings made for an alumnus —
 *   chooses the head the institute will debit.
 *
 * Kept apart from the tariff on purpose: the debit head records *who pays*,
 * and does not change *what is charged*. The rate still follows the guest
 * house and the category of guest (`lib/invoice.ts`).
 */

/** The heads an institute-funded booking may be charged to. */
export const INSTITUTE_DEBIT_HEADS: DebitHead[] = [
  "institute_grant",
  "professional_development_fund",
  "project_grant",
  "department_budget",
  "special_budget",
  "alumni_fund",
  "student_fund",
  "hostel_funds",
];

export function debitHeadsFor(role: Role, bookingType: BookingType): DebitHead[] {
  if (role === "student" || bookingType === "personal") return ["personal_funds"];
  return INSTITUTE_DEBIT_HEADS;
}

/** The head when there is only one it can be, so the form shows it rather than asking. */
export function fixedDebitHead(role: Role, bookingType: BookingType): DebitHead | null {
  const heads = debitHeadsFor(role, bookingType);
  return heads.length === 1 ? heads[0] : null;
}

/**
 * What must be written down for the accounts section to trace the charge,
 * or null when the head is enough on its own.
 */
export function debitDetailsPrompt(head: DebitHead | null | undefined): string | null {
  switch (head) {
    case "project_grant":
      return "Project number and title";
    case "special_budget":
      return "Details of the special budget";
    default:
      return null;
  }
}

/** A Special Budget has to be backed by its sanction, uploaded with the request. */
export function needsDebitDocument(head: DebitHead | null | undefined): boolean {
  return head === "special_budget";
}

/**
 * "Project Grant — SP/2025/017", or "Not recorded" for a booking made before
 * the question existed. The same words on screen, in mail and in exports.
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
  "Personal — you will be given an invoice at checkout and can settle it at the desk.";

/** Why this head does not fit the booking, or null when it does. */
export function debitHeadError(
  role: Role,
  bookingType: BookingType,
  head: DebitHead | null | undefined
): string | null {
  const allowed = debitHeadsFor(role, bookingType);
  if (!head) return "Choose how this stay will be paid for";
  if (allowed.includes(head)) return null;
  if (allowed.length === 1) {
    return `A ${bookingType === "personal" ? "personal" : "student"} booking is paid from ${DEBIT_HEAD_LABELS[allowed[0]]}`;
  }
  return `${DEBIT_HEAD_LABELS[head]} cannot be used for this kind of booking`;
}
