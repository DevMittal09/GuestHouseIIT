import { createHash, randomUUID } from "crypto";
import { formatDateValue } from "@/lib/tz";
import { mailConfig } from "./config";
import { MAIL_THREAD_OF, type MailThreadKind } from "./types";

export { MAIL_THREAD_OF, type MailThreadKind };

/**
 * Threading: which mail arrives as one conversation, and which stands alone.
 *
 * From the Guest House meeting notes: *"Email — try to send in a single thread
 * instead of a standalone email."* The thread is the **booking**. Everything
 * about one booking — sent for approval, forwarded, approved, rooms
 * allocated, cancelled, the check-in reminder — is one conversation in each
 * recipient's mailbox, whether that is the requester, the approver or the
 * desk.
 *
 * - **Per-booking mail: one thread per booking per mailbox.** A warden with
 *   three requests on the same day has three threads, not one; each carries
 *   the whole history of its own booking.
 * - **Scheduled mail** (the morning digest, the escalation nudge, the day-wise
 *   guest house log) is about a day, not a booking, so it keeps a **daily
 *   log** thread per person per day.
 *
 * > This replaced (22 Sep 2026) a design where staff mail was grouped into one
 * > "approvals" thread per *day*, which put every booking that arrived that
 * > day into the same conversation and split one booking's mail across days.
 *
 * Two things have to line up for Gmail and Outlook to group messages:
 *
 * 1. **Threading headers.** Every message in a thread references a
 *    deterministic root `Message-ID`, and the first one actually sent claims
 *    that id as its own (decided at send time in `dispatch.ts`, since which
 *    message is first is only known then). The id is derived from the booking
 *    (or the day) and the recipient, so it needs no storage and survives a
 *    restart, a redeploy or a switch of backend.
 * 2. **An identical subject.** Gmail splits a thread when the subject changes,
 *    so every message about a booking has the booking's subject, and what the
 *    message is about goes in its heading and inbox preview instead.
 *
 * The root is per *recipient*, which is why threaded mail is queued as one
 * message per address (`notify.ts`): one message can carry only one
 * `References`, and a thread whose root went to someone else's mailbox is not
 * reliably grouped.
 */

/** A short, stable stand-in for an address, so roots do not spell it out. */
function mailboxHash(address: string): string {
  return createHash("sha256").update(address.trim().toLowerCase()).digest("hex").slice(0, 16);
}

/** The root Message-ID of one person's thread about one booking. */
export function bookingThreadRoot(bookingId: string, address: string): string {
  return `<gh-booking-${bookingId}-${mailboxHash(address)}@${mailConfig().messageIdDomain}>`;
}

/**
 * `[IITPKD-GH-2026-AB12C] Guest house booking — Bageshri`: the same for every
 * message about the booking, which is what keeps it one thread. The reference
 * leads so someone searching their mailbox for it finds every message.
 */
export function bookingThreadSubject(referenceId: string, guestHouseName: string): string {
  return bookingSubject(referenceId, `Guest house booking — ${guestHouseName}`);
}

/** The root Message-ID of one person's daily log thread on one institute day. */
export function dailyThreadRoot(day: string, address: string): string {
  return `<gh-daily-log-${day}-${mailboxHash(address)}@${mailConfig().messageIdDomain}>`;
}

/** `Guest house daily log — Mon 21 Sep 2026`: the same for every message that day. */
export function dailyThreadSubject(day: string): string {
  return `Guest house daily log — ${formatDateValue(day, { year: true })}`;
}

/** A fresh Message-ID for a message that is not opening a thread. */
export function freshMessageId(): string {
  return `<gh-${randomUUID()}@${mailConfig().messageIdDomain}>`;
}

/**
 * Subject for mail about a booking: `[IITPKD-GH-2026-AB12C] Rooms allocated`.
 * Only a standalone message uses a subject like this; a threaded one takes the
 * thread's subject and this becomes its preview line.
 */
export function bookingSubject(referenceId: string, what: string): string {
  return `[${referenceId}] ${what}`;
}
