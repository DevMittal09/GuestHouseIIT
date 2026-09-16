/**
 * The mail layer's shapes.
 *
 * Two seams live here, deliberately separate:
 *
 * - `Mailer` is the *transport* — one `send()` call, the way `lib/auth.ts` is
 *   the one swap point for identity. Swapping Gmail for the institute's SMTP
 *   relay, or for a transactional API, is an implementation of this and
 *   nothing else.
 * - `EmailMessage` is the *outbox row*. Nothing sends inside a server action:
 *   the action queues, a worker sends. If SMTP is slow the requester does not
 *   wait for it, if SMTP is down the message is not lost, and there is a table
 *   you can query at 11pm to answer "did the warden actually get told?".
 */

export type MailStatus = "QUEUED" | "SENDING" | "SENT" | "FAILED";

export const MAIL_STATUSES: MailStatus[] = ["QUEUED", "SENDING", "SENT", "FAILED"];

/**
 * Every kind of mail the portal sends. One key per (event, audience) pair,
 * because the same transition says different things to the person waiting on a
 * decision and the person who has to make the next one.
 */
export type MailEventKey =
  | "booking.submitted.requester"
  | "booking.submitted.reviewer"
  | "booking.tier_approved.requester"
  | "booking.pending.reviewer"
  | "booking.rejected.requester"
  | "booking.allocated.requester"
  | "booking.allocated.desk"
  | "booking.cancellation_requested.manager"
  | "booking.cancellation_decided.requester"
  | "booking.cancelled.requester"
  | "booking.cancelled.desk"
  | "stay.reminder.requester"
  | "queue.digest.reviewer"
  | "desk.daily_report"
  | "queue.escalation.reviewer";

/** What each event is, for the developer console's outbox table. */
export const MAIL_EVENT_LABELS: Record<MailEventKey, string> = {
  "booking.submitted.requester": "Booking received",
  "booking.submitted.reviewer": "New request awaiting review",
  "booking.tier_approved.requester": "Approved at a tier",
  "booking.pending.reviewer": "Forwarded for review",
  "booking.rejected.requester": "Request rejected",
  "booking.allocated.requester": "Rooms allocated",
  "booking.allocated.desk": "Allocation record (desk)",
  "booking.cancellation_requested.manager": "Cancellation requested",
  "booking.cancellation_decided.requester": "Cancellation decided",
  "booking.cancelled.requester": "Booking cancelled",
  "booking.cancelled.desk": "Cancellation record (desk)",
  "stay.reminder.requester": "Check-in reminder",
  "queue.digest.reviewer": "Daily approval digest",
  "desk.daily_report": "Daily guest house report",
  "queue.escalation.reviewer": "Pending-too-long escalation",
};

/** A message ready to hand to a transport. */
export interface OutboundMessage {
  to: string[];
  cc: string[];
  subject: string;
  html: string;
  text: string;
  /**
   * RFC 5322 threading headers. The Guest House meeting asked for mail about
   * one booking to arrive as a single thread rather than a pile of standalone
   * messages, so every message after the first references the booking's root
   * id — see `threadRootFor` in `lib/mail/thread.ts`.
   */
  messageId?: string;
  inReplyTo?: string;
  references?: string[];
  /** Extra headers, e.g. `X-Original-To` when a redirect is in force. */
  headers?: Record<string, string>;
}

/**
 * The transport. Three implementations: SMTP (nodemailer), a file mailer that
 * writes `.eml` files for zero-setup local runs, and a dry run that only logs.
 * `lib/mail/index.ts` picks one from the environment.
 */
export interface Mailer {
  /** Shown in logs and in the developer console, so the operator knows what is live. */
  readonly name: string;
  send(message: OutboundMessage): Promise<{ messageId: string }>;
}

/** A message to queue. */
export interface NewEmailInput {
  booking_id: string | null;
  event_key: MailEventKey;
  /**
   * Natural key for this (event, subject, recipient). A unique index on it is
   * what stops a retried action — or two dispatchers racing — from mailing the
   * same parent twice.
   */
  idempotency_key: string;
  to_emails: string[];
  cc_emails: string[];
  subject: string;
  body_html: string;
  body_text: string;
  /** The booking thread this message belongs to, or null for standalone mail. */
  thread_root: string | null;
  /** True for the message that *opens* a thread; it claims `thread_root` as its own Message-ID. */
  is_thread_root: boolean;
  /** Earliest the worker may send it. Defaults to now. */
  scheduled_for?: string;
}

export interface EmailMessage extends NewEmailInput {
  id: string;
  status: MailStatus;
  attempts: number;
  last_error: string | null;
  scheduled_for: string;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface EmailOutboxFilter {
  status?: MailStatus;
  bookingId?: string;
  limit?: number;
}

/** How a send attempt ended, for `settleEmail`. */
export type EmailSettlement =
  | { ok: true; providerMessageId: string }
  | { ok: false; error: string; retryAt: string | null };
