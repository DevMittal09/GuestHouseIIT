import type { BookingWithDetails } from "@/lib/types";
import { formatDateTime } from "@/lib/format";
import { MAIL_EVENT_LABELS, type MailEventKey } from "./types";

/**
 * The part of an automatic email the guest house can change without a
 * developer.
 *
 * The bodies themselves are built from blocks in `templates.ts` — facts
 * tables, callouts, the approval trail — and those stay in code, because they
 * are *derived from the booking* and a free-text editor could only get them
 * wrong. What the office actually asks to change is the wording around them:
 * the subject line, a sentence of context at the top, a standing note at the
 * bottom ("bring a photo ID", "the gate closes at 10pm"), and who else gets
 * copied. Those are the four fields here.
 *
 * A template can also be switched **off** entirely, which is the honest way
 * to stop a mail nobody wants rather than deleting the code that sends it.
 *
 * Adding a genuinely *new* kind of mail is not an editing job: something has
 * to decide when to send it. New kinds are added by giving `MailEventKey` a
 * value and calling `queueMessages` at the moment it happens.
 */
export interface MailTemplateOverride {
  event_key: MailEventKey;
  /** False suppresses this mail entirely. */
  enabled: boolean;
  /** Replaces the built-in subject. Null keeps it. Supports the tokens below. */
  subject: string | null;
  /** An extra paragraph at the top of the body. */
  intro: string | null;
  /** A standing note at the foot of the body. */
  outro: string | null;
  /** Addresses copied on every message of this kind. */
  cc: string[];
  updated_at: string;
}

/** A template that has never been edited: everything as the code has it. */
export function defaultOverride(key: MailEventKey): MailTemplateOverride {
  return {
    event_key: key,
    enabled: true,
    subject: null,
    intro: null,
    outro: null,
    cc: [],
    updated_at: "",
  };
}

export function isEdited(o: MailTemplateOverride): boolean {
  return !o.enabled || o.subject !== null || o.intro !== null || o.outro !== null || o.cc.length > 0;
}

/**
 * What each mail is for, so the console can be read by someone who has never
 * seen the code. Kept beside the keys rather than in the page, because a new
 * event key should be impossible to add without saying what it does.
 */
export const MAIL_EVENT_NOTES: Record<MailEventKey, { audience: string; when: string }> = {
  "booking.submitted.requester": {
    audience: "The person who made the booking",
    when: "Immediately after a request is submitted.",
  },
  "booking.submitted.reviewer": {
    audience:
      "To: whoever has to decide first (Assistant Warden, Faculty Advisor, HOD, IAR or the Manager). CC: the Copy-to list.",
    when: "Immediately after a request is submitted.",
  },
  "booking.tier_approved.requester": {
    audience: "The person who made the booking",
    when: "When a reviewer forwards the request onward.",
  },
  "booking.pending.reviewer": {
    audience: "To: whoever must act at the new stage (the next approver, or the Manager). CC: the Copy-to list, including who forwarded it.",
    when: "When a request reaches them from an earlier stage.",
  },
  "booking.rejected.requester": {
    audience: "The person who made the booking",
    when: "When a reviewer rejects the request. Carries their reason verbatim.",
  },
  "booking.allocated.requester": {
    audience: "The person who made the booking",
    when: "When the Manager allocates rooms and the booking is confirmed.",
  },
  "booking.allocated.desk": {
    audience: "To: the guest house desk. CC: the Copy-to list.",
    when: "Alongside the requester's confirmation, as the desk's record.",
  },
  "booking.cancellation_requested.manager": {
    audience: "To: the Guest House Manager, who decides. CC: the Copy-to list (whoever reviewed it).",
    when: "When a requester asks to cancel a booking that is holding rooms.",
  },
  "booking.cancellation_requested.reviewer": {
    audience: "Retired — reviewers are now CC on the manager's mail",
    when: "No longer sent.",
  },
  "booking.cancellation_decided.requester": {
    audience: "The person who made the booking",
    when: "When the Manager approves or refuses a cancellation request.",
  },
  "booking.cancelled.requester": {
    audience: "The person who made the booking",
    when: "When a booking is cancelled outright.",
  },
  "booking.cancelled.desk": {
    audience: "To: the guest house desk. CC: the Copy-to list.",
    when: "When a cancellation frees rooms the desk was holding.",
  },
  "stay.reminder.requester": {
    audience: "The person who made the booking",
    when: "Shortly before check-in.",
  },
  "queue.digest.reviewer": {
    audience: "Every reviewer with something waiting",
    when: "Once a day, listing what is in their queue.",
  },
  "desk.daily_report": {
    audience: "The guest house desk",
    when: "Once a day: arrivals, departures and occupancy.",
  },
  "queue.escalation.reviewer": {
    audience: "A reviewer who has left a request too long",
    when: "When a request has waited past the escalation threshold.",
  },
  "booking.extension_requested.manager": {
    audience: "To: the Guest House Manager. CC: the Copy-to list.",
    when: "When a requester asks to stay longer.",
  },
  "booking.extension_decided.requester": {
    audience: "The person who made the booking",
    when: "When the manager approves or declines a request to stay longer.",
  },
  "booking.no_show.requester": {
    audience: "The person who made the booking",
    when: "When a stay is released because the guest did not arrive — by the manager or automatically.",
  },
  "invoice.issued.accounts": {
    audience:
      "To: the Accounts email (Tariffs & Invoicing). CC: the requester's HOD and the requester. The invoice PDF is attached.",
    when: "When the desk issues the invoice for an official booking. Personal bookings are not mailed — the requester downloads theirs from the dashboard.",
  },
};

/**
 * Tokens usable in a subject line. Deliberately few: each one is a fact the
 * booking always has, so a subject cannot render with a hole in it. A token
 * on a mail with no booking behind it (a digest, the daily report) is left
 * alone rather than blanked, which makes the mistake visible in the outbox
 * instead of silently producing "Booking  — ".
 */
export const SUBJECT_TOKENS: { token: string; describes: string }[] = [
  { token: "{reference}", describes: "The booking reference, e.g. IITPKD-GH-2026-DM001" },
  { token: "{guest_house}", describes: "The guest house name" },
  { token: "{requester}", describes: "Who made the booking" },
  { token: "{check_in}", describes: "Check-in date and time" },
  { token: "{check_out}", describes: "Check-out date and time" },
];

export function fillTokens(text: string, booking: BookingWithDetails | null): string {
  if (!booking) return text;
  const values: Record<string, string> = {
    "{reference}": booking.booking_reference_id,
    "{guest_house}": booking.guest_house?.name ?? "",
    "{requester}": booking.on_behalf_of_name ?? booking.requester?.full_name ?? "",
    "{check_in}": formatDateTime(booking.check_in),
    "{check_out}": formatDateTime(booking.check_out),
  };
  return text.replace(/\{[a-z_]+\}/g, (m) => values[m] ?? m);
}

/** Split a textarea of addresses — one per line, or comma separated. */
export function parseAddressList(raw: string): string[] {
  return [
    ...new Set(
      raw
        .split(/[\n,;]+/)
        .map((a) => a.trim().toLowerCase())
        .filter(Boolean)
    ),
  ];
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The first address that is not one, or null when they all are. */
export function firstInvalidAddress(addresses: string[]): string | null {
  return addresses.find((a) => !EMAIL.test(a)) ?? null;
}

/**
 * Shown when `mail_templates` is not there yet. Lives here rather than in the
 * server action because a "use server" module may only export async
 * functions — exporting a string from one fails the build.
 */
export const MAIL_TEMPLATES_MIGRATION_HINT =
  "The email templates table is not there yet — apply " +
  "supabase/migrations/00000000000013_mail_templates.sql, then reload this page.";

export function mailEventLabel(key: MailEventKey): string {
  return MAIL_EVENT_LABELS[key] ?? key;
}
