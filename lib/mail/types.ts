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
  | "booking.cancellation_requested.reviewer"
  | "booking.cancellation_decided.requester"
  | "booking.cancelled.requester"
  | "booking.cancelled.desk"
  | "stay.reminder.requester"
  | "queue.digest.reviewer"
  | "desk.daily_report"
  | "queue.escalation.reviewer"
  | "invoice.issued.accounts"
  | "booking.extension_requested.manager"
  | "booking.extension_decided.requester"
  | "booking.no_show.requester";

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
  "booking.cancellation_requested.reviewer": "Cancellation requested (for information — retired, now CC)",
  "booking.cancellation_decided.requester": "Cancellation decided",
  "booking.cancelled.requester": "Booking cancelled",
  "booking.cancelled.desk": "Cancellation record (desk)",
  "stay.reminder.requester": "Check-in reminder",
  "queue.digest.reviewer": "Daily approval digest",
  "desk.daily_report": "Daily guest house report",
  "queue.escalation.reviewer": "Pending-too-long escalation",
  "invoice.issued.accounts": "Invoice issued (Accounts)",
  "booking.extension_requested.manager": "Extension requested",
  "booking.extension_decided.requester": "Extension decided",
  "booking.no_show.requester": "Released as a no-show",
};

/**
 * Kinds of mail no longer sent. Kept in the union so outbox rows written
 * before still have a label, but not offered in the template editor.
 * `booking.cancellation_requested.reviewer` became CC on the manager's mail in
 * Phase 2 ("Copy to" is CC).
 */
export const RETIRED_MAIL_EVENTS: MailEventKey[] = ["booking.cancellation_requested.reviewer"];

/**
 * The daily thread a kind of mail joins; anything not listed is standalone.
 * Why, and how the thread is built, is in `lib/mail/thread.ts` — this lives
 * here only so the console can say which mails are threaded without pulling
 * server code into the browser.
 */
export type MailThreadKind = "booking" | "daily_log";

export const MAIL_THREAD_OF: Partial<Record<MailEventKey, MailThreadKind>> = {
  // Per **booking**, not per day (23 Sep 2026). These used to join one
  // "approvals" thread per person per institute day, which put a fest club's
  // request, a cancellation and a dignitary's allocation in the same
  // conversation because they happened on the same morning. The office asked
  // for the thread to follow the request: everything about
  // IITPKD-GH-2026-AB12C in one place, from submission to cancellation,
  // however many days it takes.
  "booking.submitted.reviewer": "booking",
  "booking.pending.reviewer": "booking",
  "booking.allocated.desk": "booking",
  "booking.cancellation_requested.manager": "booking",
  "booking.cancellation_requested.reviewer": "booking",
  "booking.cancelled.desk": "booking",
  "booking.extension_requested.manager": "booking",
  // Scheduled mail has no booking to thread on — a digest is *about* a queue
  // — so it keeps a daily thread of its own.
  "queue.digest.reviewer": "daily_log",
  "queue.escalation.reviewer": "daily_log",
  "desk.daily_report": "daily_log",
};

/** A message ready to hand to a transport. */
export interface OutboundMessage {
  to: string[];
  cc: string[];
  subject: string;
  html: string;
  text: string;
  /**
   * RFC 5322 threading headers. Staff mail about one booking arrives as one
   * conversation rather than a pile of standalone messages, so every message
   * after the first references the thread's root id — see
   * `lib/mail/thread.ts`.
   */
  messageId?: string;
  inReplyTo?: string;
  references?: string[];
  /** Extra headers, e.g. `X-Original-To` when a redirect is in force. */
  headers?: Record<string, string>;
  attachments?: OutboundAttachment[];
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
  /** The thread this message belongs to, or null for standalone mail. */
  thread_root: string | null;
  /**
   * Written false. Kept for rows queued before threads were daily, when the
   * opening message was fixed at queue time; the dispatcher now decides that
   * when it sends.
   */
  is_thread_root: boolean;
  /** Earliest the worker may send it. Defaults to now. */
  scheduled_for?: string;
  /**
   * Files to attach, as references resolved when the message is sent — the
   * PDF of an issued invoice is rendered from its snapshot then, so no file
   * sits in the outbox (migration 19).
   */
  attachments?: MailAttachmentRef[];
}

export type MailAttachmentRef = { kind: "invoice"; invoice_id: string };

/** A file ready for the transport. */
export interface OutboundAttachment {
  filename: string;
  contentType: string;
  content: Uint8Array;
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
  /** Messages in one thread — how the dispatcher tells whether a thread has started. */
  threadRoot?: string;
  limit?: number;
}

/** How a send attempt ended, for `settleEmail`. */
export type EmailSettlement =
  | { ok: true; providerMessageId: string }
  | { ok: false; error: string; retryAt: string | null };
