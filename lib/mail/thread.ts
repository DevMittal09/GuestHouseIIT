import { createHash, randomUUID } from "crypto";
import { formatDateValue } from "@/lib/tz";
import { mailConfig } from "./config";
import { MAIL_THREAD_OF, type MailThreadKind } from "./types";

export { MAIL_THREAD_OF, type MailThreadKind };

/**
 * Threading: which mail arrives as one conversation, and which stands alone.
 *
 * From the Guest House meeting notes: staff mail goes in a thread instead of a
 * pile of standalone emails, so the Guest House Manager and the approvers are
 * not spammed — but the person who *asked* for a room gets a standalone mail
 * for each step, because each one is news to them.
 *
 * - **Requesters: standalone.** No threading headers at all, and a
 *   `[reference]`-led subject that says what happened.
 * - **Staff, per-booking mail** (a new request, a forwarded one, a
 *   cancellation, the desk's copy of an allocation): one thread **per
 *   booking**, per person.
 * - **Staff, scheduled mail** (the morning digest, the escalation nudge, the
 *   day-wise guest house log): a **daily log** thread per person per day.
 *   These are about a queue, not a booking, so there is nothing else to hang
 *   them on; and a new institute day starts a new one, which is the point —
 *   today's digest should not keep bumping last week's.
 *
 * > **The booking thread replaced a daily "approvals" thread** (23 Sep 2026).
 * > That grouped by the day a message was queued, so a club's request, an
 * > unrelated cancellation and a dignitary's allocation landed in one
 * > conversation because they happened on the same morning, while two messages
 * > about the *same* booking a day apart were split. Threading on the booking
 * > is what an approver actually wants to follow, and it is what the reference
 * > id already promises: search for it and get the whole story.
 *
 * Two things have to line up for Gmail and Outlook to group messages:
 *
 * 1. **Threading headers.** Every message in a thread references a
 *    deterministic root `Message-ID`, and the first one actually sent claims
 *    that id as its own (decided at send time in `dispatch.ts`, since which
 *    message is first is only known then). The id is derived from the thread's
 *    key and the recipient, so it needs no storage.
 * 2. **An identical subject.** Gmail splits a thread when the subject changes,
 *    so a threaded message's subject is the thread's, and what the message is
 *    about goes in its heading and inbox preview instead.
 *
 * The root is per *recipient*, which is why threaded mail is queued as one
 * message per address (`notify.ts`): one message can carry only one
 * `References`, and a thread whose root went to someone else's mailbox is not
 * reliably grouped.
 */

/** A stable, short fingerprint of a mailbox, so a root id carries no address. */
function mailboxKey(address: string): string {
  return createHash("sha256").update(address.trim().toLowerCase()).digest("hex").slice(0, 16);
}

/**
 * The root Message-ID of one person's thread about one booking.
 *
 * Keyed on the **reference id** rather than the row id: it is what the subject
 * shows, what the office searches for, and what stays readable in a header
 * someone has to debug.
 */
export function bookingThreadRoot(referenceId: string, address: string): string {
  const reference = referenceId.toLowerCase().replace(/[^a-z0-9-]/g, "");
  return `<gh-booking-${reference}-${mailboxKey(address)}@${mailConfig().messageIdDomain}>`;
}

/**
 * `[IITPKD-GH-2026-AB12C] Guest house booking`: the same for every message in
 * the booking's thread.
 *
 * Deliberately says nothing about *this* message — a thread needs one subject,
 * and Gmail splits it the moment that changes. What each message is about
 * leads its heading and its inbox preview line instead (`notify.ts`).
 */
export function bookingThreadSubject(referenceId: string): string {
  return bookingSubject(referenceId, "Guest house booking");
}

const DAILY_THREAD_TITLES: Record<"daily_log", string> = {
  daily_log: "Guest house daily log",
};

/** The root Message-ID of one person's daily-log thread on one institute day. */
export function dailyThreadRoot(kind: "daily_log", day: string, address: string): string {
  return `<gh-${kind.replace("_", "-")}-${day}-${mailboxKey(address)}@${
    mailConfig().messageIdDomain
  }>`;
}

/** `Guest house daily log — Mon 21 Sep 2026`: the same for every message that day. */
export function dailyThreadSubject(kind: "daily_log", day: string): string {
  return `${DAILY_THREAD_TITLES[kind]} — ${formatDateValue(day, { year: true })}`;
}

/** A fresh Message-ID for a message that is not opening a thread. */
export function freshMessageId(): string {
  return `<gh-${randomUUID()}@${mailConfig().messageIdDomain}>`;
}

/**
 * Subject for standalone mail about a booking: `[IITPKD-GH-2026-AB12C] Rooms allocated`.
 *
 * The reference id leads so someone searching their mailbox for a reference
 * finds every message about it — which is how the office actually looks these
 * up.
 */
export function bookingSubject(referenceId: string, what: string): string {
  return `[${referenceId}] ${what}`;
}
