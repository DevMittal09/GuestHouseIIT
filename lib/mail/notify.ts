import { getStore } from "@/lib/store";
import type { BookingStatus, BookingWithDetails, Profile } from "@/lib/types";
import { mailConfig, portalUrl } from "./config";
import { dispatchOutbox } from "./dispatch";
import { addressStaffMail } from "./addressing";
import {
  addressesOf,
  copyToAddresses,
  deskRecipients,
  managerRecipients,
  requesterRecipient,
  reviewersForStatus,
} from "./recipients";
import { renderEmail, type EmailDocument } from "./render";
import * as t from "./templates";
import {
  defaultOverride,
  fillTokens,
  type MailTemplateOverride,
} from "./template-config";
import { toInstituteDateValue } from "@/lib/tz";
import { MAIL_THREAD_OF, bookingSubject, dailyThreadRoot, dailyThreadSubject } from "./thread";
import type { MailEventKey, NewEmailInput } from "./types";

/**
 * The guest house's edits to the automatic mails, keyed by event.
 *
 * A missing table (migration 12 not yet applied) or an unreachable store must
 * not stop a booking being acknowledged, so this degrades to "no edits" — the
 * built-in wording — rather than throwing.
 */
async function loadMailOverrides(): Promise<Map<MailEventKey, MailTemplateOverride>> {
  try {
    const rows = await getStore().listMailTemplates();
    return new Map(rows.map((r) => [r.event_key, r]));
  } catch (error) {
    console.error("[mail] could not read template overrides; using the built-in wording", error);
    return new Map();
  }
}

/**
 * Queues the notifications for a workflow event.
 *
 * **Called from the server actions, not from `updateBookingStatus`.** The
 * store method sees a status and a log row; only the action knows *why* —
 * which reason the reviewer typed, which rooms the manager picked, whether a
 * cancellation was approved or declined. Hooking the store would mean
 * reconstructing intent from a status pair, and would also mail on the
 * developer console's force-status override, which is a repair tool: a
 * developer fixing a bad row should not send a parent a confirmation.
 *
 * **Nothing here is allowed to break a booking.** Every entry point swallows
 * its errors: if migration 10 has not been applied, or SMTP is misconfigured,
 * or a profile has no address, the booking still succeeds and the failure is a
 * log line. A notification is worth less than the request it describes.
 */

const FOOTER = [
  `Portal: ${portalUrl("/")}`,
  "Replies to this message reach the Guest House office.",
];

/**
 * Hand the queue to the worker without making the caller wait.
 *
 * `after()` runs the callback once the response has been sent, which is the
 * whole point: the requester's booking confirmation does not wait on an SMTP
 * handshake. Outside a request — an `npx tsx` script, say — `after` throws, so
 * fall back to a detached promise.
 */
async function scheduleDispatch(): Promise<void> {
  try {
    const { after } = await import("next/server");
    after(async () => {
      try {
        await dispatchOutbox();
      } catch (error) {
        console.error("[mail] dispatch after() failed", error);
      }
    });
  } catch {
    void dispatchOutbox().catch((error) => console.error("[mail] dispatch failed", error));
  }
}

interface QueueOne {
  eventKey: MailEventKey;
  booking: BookingWithDetails | null;
  to: string[];
  cc?: string[];
  subjectText: string;
  doc: EmailDocument;
  /**
   * What makes this send unique. For a booking event it is the instant of the
   * status change, so the same transition cannot mail twice but a *later* one
   * still can; for a digest it is the date, which gives "once a day" for free.
   */
  stamp: string;
  scheduledFor?: string;
  /** Files to attach when it is sent (resolved by the dispatcher). */
  attachments?: NewEmailInput["attachments"];
  /**
   * Send this one on its own even though its event normally joins a daily
   * thread — the console's test message, which borrows an event key.
   */
  standalone?: boolean;
}

function buildInputs(
  params: QueueOne,
  overrides: Map<MailEventKey, MailTemplateOverride>
): NewEmailInput[] {
  // What the guest house has changed about this kind of mail, if anything.
  // Applied here, at the single point every message passes through, so no
  // template can be edited in the console and then quietly ignored.
  const edit = overrides.get(params.eventKey) ?? defaultOverride(params.eventKey);
  if (!edit.enabled) return [];

  // To is whoever must act; CC is the Copy-to list plus any address the
  // office added to this template. Anyone in To is dropped from CC, and both
  // are de-duplicated ignoring case — see `lib/mail/addressing.ts`.
  const { to, cc } = addressStaffMail(params.to, [...(params.cc ?? []), ...edit.cc]);
  if (to.length === 0) return [];
  // A custom subject replaces the built-in one wholesale, tokens and all —
  // including the "[IITPKD-GH-…]" prefix, because an office that wants its
  // own subject usually wants the whole line.
  const itemSubject = edit.subject
    ? fillTokens(edit.subject, params.booking)
    : params.booking
      ? bookingSubject(params.booking.booking_reference_id, params.subjectText)
      : params.subjectText;
  const thread = params.standalone ? undefined : MAIL_THREAD_OF[params.eventKey];
  // The intro goes above everything, the outro below it as small print — the
  // two places a standing sentence belongs without disturbing the facts the
  // template assembled from the booking.
  const doc: EmailDocument = {
    ...params.doc,
    // In a thread every message shares the thread's subject, so what this one
    // is about moves to the inbox preview, where it is still read first.
    ...(thread ? { preheader: `${itemSubject} — ${params.doc.preheader}` } : {}),
    blocks: [
      ...(edit.intro ? [{ kind: "paragraph" as const, text: fillTokens(edit.intro, params.booking) }] : []),
      ...params.doc.blocks,
      ...(edit.outro ? [{ kind: "note" as const, text: fillTokens(edit.outro, params.booking) }] : []),
    ],
  };
  const { html, text } = renderEmail(doc, { footerLines: FOOTER });
  const bookingId = params.booking?.id ?? null;

  const input = (
    recipients: string[],
    copied: string[],
    threadRoot: string | null,
    subject: string
  ): NewEmailInput => ({
    booking_id: bookingId,
    event_key: params.eventKey,
    // Recipients are in the key: a warden and a manager both told about the
    // same transition are two messages, and one failing must not suppress the
    // other's retry.
    idempotency_key: `${params.eventKey}:${bookingId ?? "none"}:${params.stamp}:${recipients.join(",")}`,
    to_emails: recipients,
    cc_emails: copied,
    subject,
    body_html: html,
    body_text: text,
    thread_root: threadRoot,
    // Which message opens a thread is decided when it is sent — see dispatch.ts.
    is_thread_root: false,
    ...(params.scheduledFor ? { scheduled_for: params.scheduledFor } : {}),
    ...(params.attachments?.length ? { attachments: params.attachments } : {}),
  });

  if (!thread) return [input(to, cc, null, itemSubject)];

  // One message per address: the thread root is per mailbox, and a message can
  // reference only one root. The day is the institute date it was queued on,
  // so only the same day's mail shares a thread.
  const day = toInstituteDateValue(new Date());
  const subject = dailyThreadSubject(thread, day);
  // Anyone copied is copied once, on the first recipient's message, not on
  // every one of them — and so joins that recipient's thread: the message
  // carries its References, and every later message about the day's
  // approvals to the same To carries the same root.
  return to.map((address, i) =>
    input([address], i === 0 ? cc : [], dailyThreadRoot(thread, day, address), subject)
  );
}

/** Queue a batch and kick the worker. Returns how many messages were new. */
export async function queueMessages(messages: (QueueOne | null)[]): Promise<number> {
  const pending = messages.filter((m): m is QueueOne => m !== null);
  if (pending.length === 0) return 0;
  // Read once for the batch: a transition queues two or three messages and
  // they share the same overrides.
  const overrides = await loadMailOverrides();
  const inputs = pending.flatMap((m) => buildInputs(m, overrides));
  if (inputs.length === 0) return 0;

  const queued = await getStore().enqueueEmails(inputs);
  if (queued > 0) await scheduleDispatch();
  return queued;
}

/**
 * Wrap an entry point so a mail failure can never surface to the requester.
 * `mailConfig()` is read here too, so a project with no mail configured at all
 * does the cheapest possible thing.
 */
async function safely(what: string, run: () => Promise<unknown>): Promise<void> {
  try {
    await run();
  } catch (error) {
    console.error(
      `[mail] could not queue ${what}. ` +
        "Has supabase/migrations/00000000000010_email_outbox.sql been applied?",
      error
    );
  }
}

async function freshBooking(bookingId: string): Promise<BookingWithDetails | null> {
  // Always re-read: `assigned_room_ids` is derived from room_holds on read, so
  // a booking object from before the write would name the wrong rooms — and
  // `updated_at` is the stamp the idempotency key needs.
  return getStore().getBooking(bookingId);
}

// ------------------------------------------------------------------ events

/** A new request: acknowledge it, and tell whoever has to decide. */
export async function notifyBookingSubmitted(bookingId: string): Promise<void> {
  await safely("booking.submitted", async () => {
    const booking = await freshBooking(bookingId);
    if (!booking) return;
    const requester = requesterRecipient(booking);
    const reviewers = await reviewersForStatus(booking, booking.status);
    const copyTo = await copyToAddresses(booking);
    const stamp = booking.created_at;

    await queueMessages([
      requester && {
        eventKey: "booking.submitted.requester",
        booking,
        to: [requester.email],
        subjectText: "Booking request received",
        doc: t.submittedToRequester(booking),
        stamp,
      },
      reviewers.length > 0
        ? {
            eventKey: "booking.submitted.reviewer",
            booking,
            to: addressesOf(reviewers),
            cc: copyTo,
            subjectText: "New request awaiting your review",
            doc: t.awaitingReview(booking, reviewers[0]),
            stamp,
          }
        : null,
    ]);
  });
}

/**
 * An intermediate tier approved: tell the requester it moved, and the next
 * tier that it is theirs now.
 */
export async function notifyTierApproved(
  bookingId: string,
  approver: Profile,
  stageApproved: BookingStatus
): Promise<void> {
  await safely("booking.tier_approved", async () => {
    const booking = await freshBooking(bookingId);
    if (!booking) return;
    const requester = requesterRecipient(booking);
    // To moves with the booking: whoever `canReview()` lets act on the stage
    // it has just entered. The approver who forwarded it stays in CC.
    const nextReviewers = await reviewersForStatus(booking, booking.status);
    const copyTo = await copyToAddresses(booking);
    const stamp = booking.updated_at;

    await queueMessages([
      requester && {
        eventKey: "booking.tier_approved.requester",
        booking,
        to: [requester.email],
        subjectText:
          booking.status === "PENDING_HOD"
            ? "Approved — now with the HOD"
            : "Approved — now with the Guest House Manager",
        doc: t.tierApprovedToRequester(booking, approver.full_name, stageApproved),
        stamp,
      },
      nextReviewers.length > 0
        ? {
            eventKey: "booking.pending.reviewer",
            booking,
            to: addressesOf(nextReviewers),
            cc: copyTo,
            subjectText: "Forwarded for your review",
            doc: t.awaitingReview(booking, nextReviewers[0], {
              forwardedBy: approver.full_name,
            }),
            stamp,
          }
        : null,
    ]);
  });
}

/** Rejected at any tier. The reason goes out verbatim. */
export async function notifyRejected(
  bookingId: string,
  reviewer: Profile,
  reason: string
): Promise<void> {
  await safely("booking.rejected", async () => {
    const booking = await freshBooking(bookingId);
    if (!booking) return;
    const requester = requesterRecipient(booking);

    await queueMessages([
      requester && {
        eventKey: "booking.rejected.requester",
        booking,
        to: [requester.email],
        subjectText: "Request not approved",
        doc: t.rejectedToRequester(booking, reviewer.full_name, reason),
        stamp: booking.updated_at,
      },
    ]);
  });
}

/**
 * Rooms allocated — the mail the Administration Section actually asked for
 * (requirement 5). The requester learns their room numbers without opening the
 * portal; the desk gets a copy for the register.
 */
export async function notifyRoomsAllocated(bookingId: string, manager: Profile): Promise<void> {
  await safely("booking.allocated", async () => {
    const booking = await freshBooking(bookingId);
    if (!booking) return;
    const requester = requesterRecipient(booking);
    const desk = await deskRecipients();
    const copyTo = await copyToAddresses(booking);
    const stamp = booking.updated_at;

    await queueMessages([
      requester && {
        eventKey: "booking.allocated.requester",
        booking,
        to: [requester.email],
        subjectText: "Confirmed — rooms allocated",
        doc: t.allocatedToRequester(booking),
        stamp,
      },
      desk.length > 0
        ? {
            eventKey: "booking.allocated.desk",
            booking,
            to: addressesOf(desk),
            cc: copyTo,
            subjectText: "Allocation recorded",
            doc: t.allocatedToDesk(booking, manager.full_name),
            stamp,
          }
        : null,
    ]);
  });
}

/**
 * Someone has asked to cancel.
 *
 * Only the **manager** decides, whatever stage the booking had reached, so the
 * manager is To. Whoever **reviewed** it — the Assistant Warden, the advisor,
 * the HOD, the IAR Office — is on the Copy-to list and so in CC: told at the
 * same moment, because they signed it off and would otherwise never find out,
 * but not asked. Routing a cancellation through the review chain again would
 * leave a guest waiting on two approvals to undo one booking.
 *
 * Until Phase 2 the reviewers got a separate "for your information" mail
 * (`booking.cancellation_requested.reviewer`); CC replaced it, so the key is
 * kept only so old outbox rows still have a label.
 */
export async function notifyCancellationRequested(bookingId: string, reason: string): Promise<void> {
  await safely("booking.cancellation_requested", async () => {
    const booking = await freshBooking(bookingId);
    if (!booking) return;
    const managers = await managerRecipients();
    const copyTo = await copyToAddresses(booking);

    await queueMessages([
      managers.length > 0
        ? {
            eventKey: "booking.cancellation_requested.manager",
            booking,
            to: addressesOf(managers),
            cc: copyTo,
            subjectText: "Cancellation requested",
            doc: t.cancellationRequestedToManager(booking, reason),
            stamp: booking.updated_at,
          }
        : null,
    ]);
  });
}

export async function notifyCancellationDecided(
  bookingId: string,
  outcome: "approved" | "rejected",
  manager: Profile,
  reason: string | null
): Promise<void> {
  await safely("booking.cancellation_decided", async () => {
    const booking = await freshBooking(bookingId);
    if (!booking) return;
    const requester = requesterRecipient(booking);

    await queueMessages([
      requester && {
        eventKey: "booking.cancellation_decided.requester",
        booking,
        to: [requester.email],
        subjectText:
          outcome === "approved" ? "Cancellation approved" : "Cancellation declined",
        doc: t.cancellationDecidedToRequester(booking, outcome, manager.full_name, reason),
        stamp: booking.updated_at,
      },
    ]);
  });
}

/**
 * A booking was cancelled outright.
 *
 * The desk is only copied when rooms were actually being held — a pending
 * request a student thought better of is not news at the reception.
 */
export async function notifyCancelled(
  bookingId: string,
  actor: Profile,
  reason: string | null,
  { heldRooms }: { heldRooms: boolean }
): Promise<void> {
  await safely("booking.cancelled", async () => {
    const booking = await freshBooking(bookingId);
    if (!booking) return;
    const requester = requesterRecipient(booking);
    const desk = heldRooms ? await deskRecipients() : [];
    const copyTo = desk.length > 0 ? await copyToAddresses(booking) : [];
    const stamp = booking.updated_at;

    await queueMessages([
      // Not when they cancelled it themselves — they know, and a confirmation
      // of their own click is the sort of mail that teaches people to ignore
      // the portal's mail.
      requester && actor.id !== booking.user_id
        ? {
            eventKey: "booking.cancelled.requester",
            booking,
            to: [requester.email],
            subjectText: "Booking cancelled",
            doc: t.cancelledToRequester(booking, reason),
            stamp,
          }
        : null,
      desk.length > 0
        ? {
            eventKey: "booking.cancelled.desk",
            booking,
            to: addressesOf(desk),
            cc: copyTo,
            subjectText: "Booking cancelled — rooms released",
            doc: t.cancellationToDesk(booking, actor.full_name),
            stamp,
          }
        : null,
    ]);
  });
}

export { mailConfig };

/**
 * An official booking's invoice has been issued: mail it to Accounts, with
 * the requester's HOD and the requester copied, and the PDF attached (Phase
 * 5). Personal bookings are not mailed. Nothing is sent until the office has
 * entered the Accounts address in Tariffs & Invoicing.
 */
export async function notifyInvoiceIssued(invoiceId: string): Promise<void> {
  await safely("invoice.issued", async () => {
    const store = getStore();
    const invoice = await store.getInvoice(invoiceId);
    if (!invoice?.document || !invoice.invoice_number) return;
    const booking = await freshBooking(invoice.booking_id);
    if (!booking || booking.booking_type === "personal") return;
    const { getRules } = await import("@/lib/settings-server");
    const accounts = (await getRules()).invoice.accounts_email;
    if (!accounts) return;

    const { hodApproversFor } = await import("@/lib/units");
    const [units, profiles] = await Promise.all([store.listUnits().catch(() => []), store.listProfiles()]);
    const hods = hodApproversFor(booking.requester, units)
      .map((id) => profiles.find((p) => p.id === id)?.email)
      .filter((e): e is string => Boolean(e));
    const requester = requesterRecipient(booking);

    await queueMessages([
      {
        eventKey: "invoice.issued.accounts",
        booking,
        to: [accounts],
        cc: [...hods, ...(requester ? [requester.email] : [])],
        subjectText: `Invoice ${invoice.invoice_number}`,
        doc: t.invoiceToAccounts(booking, invoice.document),
        stamp: invoice.issued_at ?? invoice.created_at,
        attachments: [{ kind: "invoice", invoice_id: invoice.id }],
      },
    ]);
  });
}
