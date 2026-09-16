import { randomUUID } from "crypto";
import { mailConfig } from "./config";

/**
 * Threading, so a booking's mail arrives as one conversation.
 *
 * From the Guest House meeting notes: *"Email — try to send in a single thread
 * instead of a standalone email."* Six separate messages about one booking is
 * what makes an approver filter the portal into spam.
 *
 * Two things have to line up for Gmail and Outlook to group them:
 *
 * 1. **Threading headers.** The first message about a booking claims a
 *    deterministic `Message-ID`; every later one sets `In-Reply-To` and
 *    `References` to it. The id is derived from the booking id, so it needs no
 *    storage and survives a restart, a redeploy, or a switch of backend.
 * 2. **A stable subject.** Gmail still splits a thread when the subject
 *    changes, so every subject starts with the booking's reference id and the
 *    part that varies comes after it — see `bookingSubject`.
 */

/** The deterministic root Message-ID for a booking's thread. */
export function threadRootFor(bookingId: string): string {
  return `<gh-booking-${bookingId}@${mailConfig().messageIdDomain}>`;
}

/** A fresh Message-ID for a message that is not opening a thread. */
export function freshMessageId(): string {
  return `<gh-${randomUUID()}@${mailConfig().messageIdDomain}>`;
}

/**
 * Subject for mail about a booking: `[IITPKD-GH-2026-AB12C] Rooms allocated`.
 *
 * The reference id leads so the subject line is stable across the thread and
 * so someone searching their mailbox for a reference finds every message about
 * it — which is how the office actually looks these up.
 */
export function bookingSubject(referenceId: string, what: string): string {
  return `[${referenceId}] ${what}`;
}
