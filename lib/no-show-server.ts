import "server-only";
import { recordAudit } from "@/lib/audit-server";
import { notifyNoShowReleased } from "@/lib/mail/notify";
import { noShowReleasable } from "@/lib/operations";
import { getStore } from "@/lib/store";
import type { Profile } from "@/lib/types";

/**
 * Releasing a no-show (Phase 7): the booking is cancelled, its rooms freed,
 * `no_show_released_at` set, the audit log written and the requester told.
 * Server-only — never a server action, so the automatic run cannot be called
 * from a browser.
 */
export async function releaseNoShow(
  bookingId: string,
  actor: Pick<Profile, "id" | "full_name" | "role"> | null,
  reason: string | null
): Promise<void> {
  const store = getStore();
  const now = new Date().toISOString();
  await store.updateBookingStatus(
    bookingId,
    { status: "CANCELLED", assigned_room_ids: [], no_show_released_at: now },
    {
      action_by: actor?.id ?? null,
      action_by_name: actor?.full_name ?? "System (automatic no-show release)",
      new_status: "CANCELLED",
      remarks: `Released as a no-show — the guest did not arrive${reason ? `: ${reason}` : ""}`,
    }
  );
  await recordAudit(actor, "booking.no_show_released", bookingId, { automatic: actor === null, reason });
  await notifyNoShowReleased(bookingId, actor === null, reason);
}

/**
 * The automatic no-show release, run by the daily cron: every approved stay
 * whose guest has not checked in `hours` after the booked check-in. Idempotent
 * — a released booking is no longer APPROVED, and its mail is keyed on the
 * release time. Returns how many were released.
 */
export async function runNoShowRelease(now: Date, hours: number): Promise<number> {
  if (hours <= 0) return 0;
  const store = getStore();
  const approved = await store.listBookings({ status: "APPROVED" });
  let released = 0;
  for (const booking of approved) {
    if (!noShowReleasable(booking, now, hours)) continue;
    try {
      await releaseNoShow(booking.id, null, `not checked in ${hours} hours after the booked check-in`);
      released++;
    } catch (e) {
      console.error(`[no-show] could not release ${booking.booking_reference_id}`, e);
    }
  }
  return released;
}
