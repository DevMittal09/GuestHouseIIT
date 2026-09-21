import { getStore } from "@/lib/store";
import {
  addDaysToDateValue,
  instituteDayBounds,
  toInstituteDateValue,
} from "@/lib/tz";
import type { BookingStatus, BookingWithDetails, Profile } from "@/lib/types";
import {
  ACTIVE_STATUSES,
  ROOM_HOLDING_STATUSES,
  canReview,
  checksOutOn,
  stayPhase,
} from "@/lib/workflow";
import { addressesOf, managerRecipients, profilesWithRole, requesterRecipient } from "./recipients";
import { queueMessages } from "./notify";
import * as t from "./templates";

/**
 * The scheduled mail: digests, reminders, the daily guest house log and the
 * pending-too-long nudge. Driven by `/api/mail/cron`.
 *
 * **Why digests instead of per-item mail.** A warden during fest week would
 * get a message per request, learn to filter the portal into spam, and then
 * stop approving anything. One 8am summary does not do that. The per-item mail
 * in `notify.ts` and the digests here are deliberately different audiences of
 * the same facts: the first is "this just happened", the second is "this is
 * still waiting on you".
 *
 * **Every job is idempotent per institute day.** The idempotency key carries
 * the calendar date, so running the cron twice — or a retry firing, or someone
 * curling the route out of curiosity — sends one mail, not two. That also
 * means the schedule is advisory: if the cron misses 8am, the 9am run still
 * delivers, and a second 9:05 run does nothing.
 */

/** How long a request may sit in one queue before the nudge goes out. */
export const ESCALATION_HOURS = 48;

/** Roles that get the morning approval digest. */
const DIGEST_ROLES = ["warden", "faculty_advisor", "iar_cell"] as const;

export interface CronSummary {
  day: string;
  digests: number;
  reminders: number;
  reports: number;
  escalations: number;
}

/** Every booking currently in an approval queue, hydrated. */
async function pendingBookings(): Promise<BookingWithDetails[]> {
  const store = getStore();
  const batches = await Promise.all(
    ACTIVE_STATUSES.map((status) => store.listBookings({ status }))
  );
  return batches.flat();
}

/** Every booking holding a room, hydrated. */
async function holdingBookings(): Promise<BookingWithDetails[]> {
  const store = getStore();
  const batches = await Promise.all(
    ROOM_HOLDING_STATUSES.map((status) => store.listBookings({ status }))
  );
  return batches.flat();
}

/**
 * The morning digest: one mail per reviewer who has something waiting.
 *
 * The Guest House Manager is deliberately not included — their pending
 * allocations are a section of the daily desk report below, and two mails
 * listing the same queue is how a report stops being read.
 */
export async function queueReviewerDigests(now: Date): Promise<number> {
  const day = toInstituteDateValue(now);
  const [reviewers, pending] = await Promise.all([
    profilesWithRole(...DIGEST_ROLES),
    pendingBookings(),
  ]);

  let queued = 0;
  for (const reviewer of reviewers) {
    // `canReview` again, not a hand-rolled hostel or club match: the digest
    // must list exactly what this person's buttons can act on.
    const mine = pending
      .filter((booking) => canReview(reviewer, booking.status, booking.requester))
      .sort((a, b) => a.check_in.localeCompare(b.check_in));
    // Silence is the right mail for an empty queue.
    if (mine.length === 0) continue;

    queued += await queueMessages([
      {
        eventKey: "queue.digest.reviewer",
        booking: null,
        to: [reviewer.email],
        subjectText: `Guest house: ${mine.length} request${mine.length === 1 ? "" : "s"} awaiting your review`,
        doc: t.reviewerDigest(reviewer, mine, day),
        // The date is the whole key: one digest per reviewer per day.
        stamp: `${day}:${reviewer.id}`,
      },
    ]);
  }
  return queued;
}

/** The day before check-in: where to go, what to bring. */
export async function queueCheckInReminders(now: Date): Promise<number> {
  const today = toInstituteDateValue(now);
  const tomorrow = addDaysToDateValue(today, 1);
  const { start, end } = instituteDayBounds(tomorrow);

  const arriving = (await holdingBookings()).filter(
    (booking) =>
      booking.check_in >= start.toISOString() && booking.check_in < end.toISOString()
  );

  let queued = 0;
  for (const booking of arriving) {
    const requester = requesterRecipient(booking);
    if (!requester) continue;
    queued += await queueMessages([
      {
        eventKey: "stay.reminder.requester",
        booking,
        to: [requester.email],
        subjectText: "Your stay begins tomorrow",
        doc: t.reminderToRequester(booking),
        // Keyed on the arrival date, so this cannot fire twice even if the
        // cron runs hourly.
        stamp: `reminder:${tomorrow}`,
      },
    ]);
  }
  return queued;
}

/**
 * The day-wise guest house log, mailed to the manager and the reception desk
 * — Administration Section requirement 3.
 *
 * One mail per guest house, because the desk is per building and a merged
 * report makes the reader do the filtering. Guest houses are read from the
 * store rather than assumed to be two: a developer can add a third from the
 * console.
 */
export async function queueDailyDeskReports(now: Date): Promise<number> {
  const store = getStore();
  const day = toInstituteDateValue(now);
  const { start: dayStart, end: dayEnd } = instituteDayBounds(day);
  const [guestHouses, desk] = await Promise.all([
    store.listGuestHouses(),
    profilesWithRole("gh_manager", "gh_caretaker"),
  ]);
  if (desk.length === 0) return 0;

  let queued = 0;
  for (const guestHouse of guestHouses) {
    const [approved, occupied, awaitingAllocation, rooms] = await Promise.all([
      store.listBookings({ status: "APPROVED", guestHouseId: guestHouse.id }),
      store.listBookings({ status: "OCCUPIED", guestHouseId: guestHouse.id }),
      store.listBookings({ status: "PENDING_GH_MANAGER", guestHouseId: guestHouse.id }),
      store.listRooms(guestHouse.id),
    ]);

    const stays = [...approved, ...occupied].sort((a, b) =>
      a.check_in.localeCompare(b.check_in)
    );

    // Grouped by where the stay is in time, the same way `/manager` does it.
    // `OCCUPIED` is a fact recorded at the desk, not something a date implies,
    // so the report must not use the status to decide who is in the building.
    const arrivals = stays.filter(
      (b) => b.check_in >= dayStart.toISOString() && b.check_in < dayEnd.toISOString()
    );
    const departures = stays.filter((b) => checksOutOn(b, dayStart, dayEnd));
    const inHouse = stays.filter((b) => stayPhase(b, now) === "current");
    const overdue = stays.filter((b) => stayPhase(b, now) === "past");

    // Rooms taken right now. The overlap test is strict, so a zero-width
    // window would match nothing — hence a one-minute probe from now.
    const held = await store.getOccupiedRoomIds(
      guestHouse.id,
      now.toISOString(),
      new Date(now.getTime() + 60_000).toISOString()
    );

    // A quiet day still gets a report. This is a *log*, and the office asked
    // for one per day: if it were suppressed when nothing happened, a missing
    // report would mean either "nothing happened" or "the cron stopped
    // running", and the reader could not tell which. The tables read "Nothing
    // to report." on their own. The one exception is a guest house with no
    // rooms yet — a half-created one from the developer console, which has
    // nothing to be a log *of*.
    if (rooms.length === 0) continue;

    queued += await queueMessages([
      {
        eventKey: "desk.daily_report",
        booking: null,
        to: addressesOf(desk),
        subjectText: `${guestHouse.name} — daily guest house log`,
        doc: t.dailyDeskReport(
          day,
          guestHouse.name,
          { arrivals, departures, inHouse, overdue, awaitingAllocation },
          { rooms: rooms.length, held: held.length }
        ),
        stamp: `${day}:${guestHouse.id}`,
      },
    ]);
  }
  return queued;
}

/**
 * Requests that have sat in one queue too long. Sent to the reviewer, copying
 * the Guest House Manager — who is the person who has to explain to a guest
 * why there is still no answer.
 */
export async function queueEscalations(now: Date): Promise<number> {
  const day = toInstituteDateValue(now);
  const cutoff = new Date(now.getTime() - ESCALATION_HOURS * 3_600_000).toISOString();

  const [reviewers, managers, pending] = await Promise.all([
    profilesWithRole("warden", "faculty_advisor", "iar_cell", "gh_manager"),
    managerRecipients(),
    pendingBookings(),
  ]);

  // Time in *this* queue, not since submission: a request a warden forwarded
  // this morning has not been waiting on the manager for three days.
  const stale = pending.filter((booking) => (booking.updated_at ?? booking.created_at) < cutoff);
  if (stale.length === 0) return 0;

  let queued = 0;
  for (const reviewer of reviewers) {
    const mine = stale
      .filter((booking) => canReview(reviewer, booking.status, booking.requester))
      .sort((a, b) => (a.updated_at ?? a.created_at).localeCompare(b.updated_at ?? b.created_at));
    if (mine.length === 0) continue;

    queued += await queueMessages([
      {
        eventKey: "queue.escalation.reviewer",
        booking: null,
        to: [reviewer.email],
        // `buildInput` drops a cc that is already in `to`, so a manager
        // escalated to about their own queue is not copied to themselves.
        cc: addressesOf(managers),
        subjectText: `Guest house: ${mine.length} request${mine.length === 1 ? "" : "s"} waiting over ${ESCALATION_HOURS} hours`,
        doc: t.escalationToReviewer(reviewer, mine, ESCALATION_HOURS),
        // Re-nudge daily while it stays unanswered, not once and forgotten.
        stamp: `${day}:${reviewer.id}`,
      },
    ]);
  }
  return queued;
}

/** Everything the daily cron does, in order. */
export async function runDailyMailJobs(now: Date = new Date()): Promise<CronSummary> {
  const day = toInstituteDateValue(now);
  // Sequential on purpose: they share the store and the outbox, and the
  // volumes here are tens of rows, not thousands.
  const digests = await queueReviewerDigests(now);
  const reminders = await queueCheckInReminders(now);
  const reports = await queueDailyDeskReports(now);
  const escalations = await queueEscalations(now);
  return { day, digests, reminders, reports, escalations };
}

/** Exported for the cron route's response, so a caller can see what ran. */
export type { BookingStatus, Profile };
