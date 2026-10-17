import { stayPhase } from "./workflow";
import type { BookingStatus } from "./types";

/**
 * **How a requester's own list is divided** (17 Oct 2026, the owner: separate
 * upcoming, current and previous bookings, and stop showing more of the
 * history than anybody needs).
 *
 * My Bookings was one table of everything the account had ever submitted,
 * newest request first, so a stay happening today sat between a cancelled
 * request from August and one for March. Three questions, three sections.
 *
 * **Status decides before the dates do.** A date alone would file a rejected
 * request for next month under "upcoming", where there is nothing upcoming
 * about it, and would move a guest who is still in the building out of
 * "current" the moment their booked check-out passed. So:
 *
 * - **`OCCUPIED` is always current** - the desk recorded the guest walking
 *   in, and until it records them leaving they are in the building whatever
 *   the clock says. This is the desk's own "Awaiting check-out".
 * - **A finished request is always previous** - rejected, cancelled, vacated
 *   or missed. Nothing more will happen to it.
 * - **Anything still open** - waiting for an approval, approved, or with a
 *   cancellation asked for - is placed by its dates (`stayPhase`, the same
 *   function the manager's console groups stays by, so the requester and the
 *   desk cannot disagree about what "current" means). An open request whose
 *   dates have passed is previous: nobody can approve it now, and the nightly
 *   sweep will mark it Missed.
 */

export type MyBookingSection = "upcoming" | "current" | "previous";

/** A request nothing more will happen to. */
const FINISHED: BookingStatus[] = [
  "REJECTED",
  "CANCELLED",
  "CANCELLATION_APPROVED",
  "VACATED",
  "MISSED",
];

export function isFinishedBooking(status: BookingStatus): boolean {
  return FINISHED.includes(status);
}

/** The least a booking has to carry to be placed. */
export type PlaceableBooking = {
  status: BookingStatus;
  check_in: string;
  check_out: string;
};

export function myBookingSection(
  booking: PlaceableBooking,
  now: Date = new Date()
): MyBookingSection {
  if (booking.status === "OCCUPIED") return "current";
  if (isFinishedBooking(booking.status)) return "previous";
  const phase = stayPhase(booking, now);
  return phase === "past" ? "previous" : phase;
}

/**
 * How many finished bookings the page shows before it stops (17 Oct 2026).
 *
 * The point is what the page opens on, not what it holds: everything hidden
 * is one click away under "Show all", and the whole archive - with its
 * filters, its facet tiles and both exports - is the Booking History page,
 * which this one links to. Nothing is deleted and nothing becomes
 * unreachable.
 */
export const PREVIOUS_BOOKINGS_SHOWN = 5;

export type MyBookingSections<T> = {
  upcoming: T[];
  current: T[];
  /** Newest first, and complete - the component decides how many to draw. */
  previous: T[];
};

/**
 * The three sections, each in the order the reader wants it: the next arrival
 * first in Upcoming, the earliest departure first in Current, and the most
 * recently touched first in Previous.
 *
 * Previous is ordered by `updated_at` rather than by date, because what it
 * holds is things that have *happened* - a request rejected this morning for
 * a stay in March belongs above a stay that ended last week. Where a booking
 * carries no `updated_at` the check-out stands in for it.
 */
export function groupMyBookings<
  T extends PlaceableBooking & { updated_at?: string; created_at?: string },
>(bookings: T[], now: Date = new Date()): MyBookingSections<T> {
  const sections: MyBookingSections<T> = { upcoming: [], current: [], previous: [] };
  for (const booking of bookings) sections[myBookingSection(booking, now)].push(booking);
  sections.upcoming.sort((a, b) => a.check_in.localeCompare(b.check_in));
  sections.current.sort((a, b) => a.check_out.localeCompare(b.check_out));
  sections.previous.sort((a, b) =>
    (b.updated_at ?? b.check_out).localeCompare(a.updated_at ?? a.check_out)
  );
  return sections;
}
