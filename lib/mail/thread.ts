import { createHash, randomUUID } from "crypto";
import { formatDateValue } from "@/lib/tz";
import { mailConfig } from "./config";
import { MAIL_THREAD_OF, type MailThreadKind } from "./types";

export { MAIL_THREAD_OF, type MailThreadKind };

/**
 * Threading: which mail arrives as one conversation, and which stands alone.
 *
 * From the Guest House meeting notes: staff mail goes in a single thread
 * instead of a pile of standalone emails, so the Guest House Manager and the
 * approvers are not spammed — but the person who *asked* for a room gets a
 * standalone mail for each step, because each one is news to them.
 *
 * - **Requesters: standalone.** No threading headers at all.
 * - **Staff, per-booking mail** (a new request, a forwarded one, a
 *   cancellation, the desk's copy of an allocation): one **approvals** thread
 *   per person per institute day.
 * - **Staff, scheduled mail** (the morning digest, the escalation nudge, the
 *   day-wise guest house log): a separate **daily log** thread per person per
 *   day.
 *
 * A new day starts a new thread. That is the point: today's approvals are one
 * conversation, and yesterday's do not keep bumping it.
 *
 * Two things have to line up for Gmail and Outlook to group messages:
 *
 * 1. **Threading headers.** Every message in a thread references a
 *    deterministic root `Message-ID`, and the first one actually sent claims
 *    that id as its own (decided at send time in `dispatch.ts`, since which
 *    message is first is only known then). The id is derived from the kind,
 *    the day and the recipient, so it needs no storage.
 * 2. **An identical subject.** Gmail splits a thread when the subject changes,
 *    so a threaded message's subject is the thread's, and what the message is
 *    about goes in its heading and inbox preview instead.
 *
 * The root is per *recipient*, which is why threaded mail is queued as one
 * message per address (`notify.ts`): one message can carry only one
 * `References`, and a thread whose root went to someone else's mailbox is not
 * reliably grouped.
 */

const THREAD_TITLES: Record<MailThreadKind, string> = {
  approvals: "Guest house approvals",
  daily_log: "Guest house daily log",
};

/** The root Message-ID of one person's thread of one kind on one institute day. */
export function dailyThreadRoot(kind: MailThreadKind, day: string, address: string): string {
  const who = createHash("sha256").update(address.trim().toLowerCase()).digest("hex").slice(0, 16);
  return `<gh-${kind.replace("_", "-")}-${day}-${who}@${mailConfig().messageIdDomain}>`;
}

/** `Guest house approvals — Mon 21 Sep 2026`: the same for every message that day. */
export function dailyThreadSubject(kind: MailThreadKind, day: string): string {
  return `${THREAD_TITLES[kind]} — ${formatDateValue(day, { year: true })}`;
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
