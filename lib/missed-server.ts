import "server-only";
import { notifyMissed } from "@/lib/mail/notify";
import { getStore } from "@/lib/store";
import { ACTIVE_STATUSES, missedSweepable } from "@/lib/workflow";
import type { BookingWithDetails } from "@/lib/types";

/**
 * The nightly sweep that marks a request nobody decided in time as **Missed**
 * (migration 29, 7 Oct 2026, the office's eighth list).
 *
 * Before this, such a request kept its pending status: it stayed in an
 * approver's queue for ever with a "lapsed" badge, waiting for somebody to
 * reject it by hand, and the requester heard nothing at all. They had asked
 * for a room, the date had gone past, and the portal still said "pending".
 *
 * What the sweep does to each one: sets `MISSED`, writes the booking log, and
 * mails the requester. The cutoff is the check-in - or, for a **dining**
 * booking, its last day of meals, because a meal booking's `check_in` is
 * midnight on its first day and is already past the moment somebody books
 * lunch for today (`lapseDeadline` in `lib/workflow.ts`).
 *
 * **Running it twice changes nothing.** A marked request is no longer in an
 * active status, so the second pass does not see it; its mail is keyed on the
 * booking's `updated_at`, so a re-run queues nothing even if the status were
 * somehow set again. And a request the manager has **reinstated** is skipped
 * for good (`missedSweepable`), or the next night would undo their decision.
 *
 * Server-only, and never a server action: the automatic run must not be
 * callable from a browser. The manager's own reinstatement goes the other
 * way, through `app/actions/manager.ts`.
 */
export async function runMissedSweep(now: Date = new Date()): Promise<number> {
  const store = getStore();
  let marked = 0;
  // One query per pending stage rather than every booking ever made: only an
  // active request can be missed.
  const queues = await Promise.all(
    ACTIVE_STATUSES.map((status) => store.listBookings({ status }).catch(() => [] as BookingWithDetails[]))
  );
  for (const booking of queues.flat()) {
    if (!missedSweepable(booking, now)) continue;
    try {
      await store.updateBookingStatus(
        booking.id,
        { status: "MISSED" },
        {
          action_by: null,
          action_by_name: "System (missed requests)",
          new_status: "MISSED",
          remarks:
            booking.service_type === "meals_only"
              ? "Marked as Missed - the last day of meals passed before anyone decided this request."
              : "Marked as Missed - the check-in passed before anyone decided this request.",
        }
      );
      await notifyMissed(booking.id);
      marked++;
    } catch (e) {
      /**
       * One booking's failure must not end the night's run. The likely cause
       * on Supabase is migration 29 not yet applied, in which case the
       * update is refused with an invalid-enum error for every row - noisy
       * in the log, and exactly the right place to notice it.
       */
      console.error(`[missed] could not mark ${booking.booking_reference_id}`, e);
    }
  }
  return marked;
}
