import { addMonths } from "date-fns";
import type { BookingSearchCriteria } from "./booking-search";
import type { BookingStatus, Profile, Role, ServiceType } from "./types";

/** How far ahead of today a stay may be booked. */
export const ADVANCE_BOOKING_WINDOW_MONTHS = 1;

/**
 * Who may book outside the one-month advance window.
 *
 * Official / dignitary visits are arranged by the institute on its own notice.
 * The Guest House Manager is exempt because they take bookings at the desk for
 * whatever the institute has already committed to — a window they could not
 * reach past would simply move those bookings off the portal — and the
 * developer because the console bypasses everything anyway.
 */
export function isAdvanceWindowExempt(role: Role): boolean {
  return role === "official" || role === "gh_manager" || role === "developer";
}

/**
 * The latest check-in a role may request, or null when the role is exempt.
 * Applied to check-in only: a stay that starts inside the window may run past
 * it. Both the client and the server build the booking schema from this, so
 * the limit cannot be bypassed by a crafted request.
 */
export function latestCheckIn(role: Role, from: Date = new Date()): Date | null {
  if (isAdvanceWindowExempt(role)) return null;
  return addMonths(from, ADVANCE_BOOKING_WINDOW_MONTHS);
}

/**
 * Where a fresh booking enters the approval pipeline.
 *
 * One account can raise requests that answer to different people, so the route
 * is not simply "the requester's boss". The IAR Student Cell's requests — for
 * its own office or for an alumnus — are checked by the IAR Office first. The
 * IAR Office's own requests are not: it *is* the approving body, so routing
 * them to `PENDING_IAR` would have it approve itself, which is not a control
 * at all. Those go straight to the manager.
 *
 * A **meals-only** booking skips the chain entirely and goes straight to the
 * Guest House Manager. The intermediate stages exist to vouch for someone
 * staying overnight in institute accommodation — a warden for their student's
 * family, an advisor for their club. Lunch for a visitor is the kitchen's
 * business and nobody else's, and routing it through a warden would leave the
 * kitchen waiting on an approval for a head count.
 */
export function initialStatusFor(role: Role, service: ServiceType = "room"): BookingStatus {
  if (service === "meals_only") return "PENDING_GH_MANAGER";
  switch (role) {
    case "student":
      return "PENDING_WARDEN";
    case "club":
      return "PENDING_FA";
    // Retired role, kept so a resubmitted legacy booking still routes sanely.
    case "alumni":
      return "PENDING_IAR";
    case "iar_student_cell":
      return "PENDING_IAR";
    case "iar_cell":
    case "employee":
    case "official":
    // The manager booking at the desk on someone's behalf. It still lands in
    // their own allocation queue rather than being approved on the spot: the
    // room has to be picked, and the booking has to appear in the log like
    // any other.
    case "gh_manager":
      return "PENDING_GH_MANAGER";
    default:
      throw new Error(`Role ${role} cannot create bookings`);
  }
}

/** Which intermediate status a reviewer role is responsible for. */
export const REVIEWER_STAGE: Partial<Record<Role, BookingStatus>> = {
  warden: "PENDING_WARDEN",
  faculty_advisor: "PENDING_FA",
  iar_cell: "PENDING_IAR",
  gh_manager: "PENDING_GH_MANAGER",
};

/** Intermediate approvals all forward to the GH Manager queue. */
export function nextStatusOnApprove(current: BookingStatus): BookingStatus {
  switch (current) {
    case "PENDING_WARDEN":
    case "PENDING_FA":
    case "PENDING_IAR":
      return "PENDING_GH_MANAGER";
    case "PENDING_GH_MANAGER":
      return "APPROVED";
    default:
      throw new Error(`Cannot approve a booking in status ${current}`);
  }
}

/**
 * Can `reviewer` act on a booking currently in `status`, submitted by `requester`?
 * Wardens are scoped to their hostel, FAs to their club/council.
 */
export function canReview(reviewer: Profile, status: BookingStatus, requester: Profile): boolean {
  if (REVIEWER_STAGE[reviewer.role] !== status) return false;
  // Nobody signs off their own request. The IAR Office both books and reviews,
  // and its own bookings skip `PENDING_IAR` for that reason — this is the
  // belt-and-braces check in case one ever lands there anyway.
  if (reviewer.id === requester.id) return false;
  if (reviewer.role === "warden") return reviewer.hostel_name === requester.hostel_name;
  if (reviewer.role === "faculty_advisor")
    return reviewer.department_or_club === requester.department_or_club;
  return true;
}

export const ACTIVE_STATUSES: BookingStatus[] = [
  "PENDING_WARDEN",
  "PENDING_FA",
  "PENDING_IAR",
  "PENDING_GH_MANAGER",
];

/**
 * Where a stay sits relative to now.
 *
 * `OCCUPIED` is a *fact the manager records at the desk* — the guest walked in
 * — not something a date implies. So the phase is read off the booking's own
 * check-in and check-out, and the manager console groups by it. Without this
 * a stay starting next week sat under the same heading as one happening now,
 * and a future booking could be marked Occupied by mistake.
 */
export type StayPhase = "upcoming" | "current" | "past";

export function stayPhase(
  booking: { check_in: string; check_out: string },
  now: Date = new Date()
): StayPhase {
  const at = now.toISOString();
  if (booking.check_in > at) return "upcoming";
  // Half-open, matching `room_holds.during`: a stay checking out at 11:00 is
  // no longer current at 11:00.
  if (booking.check_out <= at) return "past";
  return "current";
}

/**
 * Why the manager cannot mark this booking Occupied yet, or null when they
 * can. Enforced server-side in `updateBookingLifecycle`; the console uses the
 * same function to disable the button and say why.
 */
export function occupancyNotStartedError(
  booking: { check_in: string },
  now: Date = new Date()
): string | null {
  if (booking.check_in <= now.toISOString()) return null;
  return "This stay has not started yet — it can be marked Occupied from its check-in time.";
}

/** Statuses that represent a booking where rooms are currently held/occupied. */
export const ROOM_HOLDING_STATUSES: BookingStatus[] = [
  "APPROVED",
  "OCCUPIED",
  "CANCELLATION_REQUESTED",
];

/**
 * The status to *show* for a stay, which is not always the status stored.
 *
 * A booking whose check-in has not arrived cannot be occupied, whatever the
 * row says — and rows can say so, because the developer console can force any
 * status and older data predates the guard in `updateBookingLifecycle`. The
 * office reported exactly this: future bookings reading as "Occupied". Writes
 * are refused at the source; this keeps a bad row already in the database from
 * telling the reception a guest is in a room that is in fact empty.
 */
export function displayStatus(
  booking: { status: BookingStatus; check_in: string },
  now: Date = new Date()
): BookingStatus {
  // Whatever the row says, nobody is in a room before the stay begins.
  if (booking.status === "OCCUPIED" && booking.check_in > now.toISOString()) {
    return "APPROVED";
  }
  return booking.status;
}

/** Whether a stay's check-out falls on the given institute calendar date. */
export function checksOutOn(
  booking: { check_out: string },
  dayStart: Date,
  dayEnd: Date
): boolean {
  const at = new Date(booking.check_out).getTime();
  return at >= dayStart.getTime() && at < dayEnd.getTime();
}

/** Roles that get the approval log / booking archive at `/history`. */
export const HISTORY_ROLES: Role[] = [
  "warden",
  "faculty_advisor",
  "iar_cell",
  "gh_manager",
  "gh_caretaker",
  "developer",
];

/**
 * Roles that record arrivals and departures at the desk.
 *
 * The caretaker sits on the guest house reception and does exactly this much:
 * marks guests Occupied when they walk in and Vacated when they leave. Room
 * allocation, approvals and cancellations stay with the manager, which is what
 * makes this a subset of that console rather than a second copy of it.
 */
export const LIFECYCLE_ROLES: Role[] = ["gh_manager", "gh_caretaker"];

export function canUpdateLifecycle(role: Role): boolean {
  return LIFECYCLE_ROLES.includes(role);
}

/** All roles now have access to logs — requesters see their own bookings. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function canViewHistory(_role: Role): boolean {
  return true;
}

/** Roles allowed to generate PDF reports from logs. */
export const PDF_EXPORT_ROLES: Role[] = ["gh_manager", "developer"];

export function canExportPdf(role: Role): boolean {
  return PDF_EXPORT_ROLES.includes(role);
}

/** Whether the role is a "requester" (their logs show own bookings, not approval actions). */
export function isRequesterHistory(role: Role): boolean {
  return !HISTORY_ROLES.includes(role);
}

/** The slice of the archive a role may search, or why it cannot search at all. */
export type HistoryScope =
  | {
      ok: true;
      /** Applied last when building criteria, so the URL cannot widen it. */
      criteria: Pick<
        BookingSearchCriteria,
        "hostelName" | "club" | "userRole" | "userRoles" | "userId"
      >;
      /** Human-readable description of the boundary, shown in the UI. */
      label: string;
      /** False when the role is fixed by the scope (hides the category filter). */
      canFilterByRole: boolean;
      /** True for requester roles — hides the "Handled by me / Everything" toggle. */
      isOwnBookings: boolean;
    }
  | { ok: false; reason: string };

/**
 * Archive counterpart to `canReview()`. A reviewer may look back over exactly
 * the requests they were ever responsible for — wardens their own hostel's
 * students, advisors their own club, the IAR cell alumni requests. The manager
 * and the developer see every booking. Requesters see only their own bookings.
 */
export function historyScope(user: Profile): HistoryScope {
  switch (user.role) {
    case "warden":
      if (!user.hostel_name) {
        return {
          ok: false,
          reason:
            "Your account has no hostel assigned, so there is nothing to show. Ask a developer to set your hostel in Users & Roles.",
        };
      }
      return {
        ok: true,
        criteria: { userRole: "student", hostelName: user.hostel_name },
        label: `Student requests from ${user.hostel_name} hostel`,
        canFilterByRole: false,
        isOwnBookings: false,
      };
    case "faculty_advisor":
      if (!user.department_or_club) {
        return {
          ok: false,
          reason:
            "Your account has no department or club assigned, so there is nothing to show. Ask a developer to set it in Users & Roles.",
        };
      }
      return {
        ok: true,
        criteria: { userRole: "club", club: user.department_or_club },
        label: `Requests from ${user.department_or_club}`,
        canFilterByRole: false,
        isOwnBookings: false,
      };
    case "iar_cell":
      return {
        ok: true,
        // Three categories, not one: requests the Student Cell raised (which
        // this office approves), this office's own bookings, and the alumni
        // requests made before alumni lost their logins. A single `userRole`
        // could only name one of them and would hide the other two.
        criteria: { userRoles: ["alumni", "iar_student_cell", "iar_cell"] },
        label: "Alumni and IAR requests",
        canFilterByRole: false,
        isOwnBookings: false,
      };
    case "gh_manager":
      return {
        ok: true,
        criteria: {},
        label: "All guest house bookings",
        canFilterByRole: true,
        isOwnBookings: false,
      };
    case "gh_caretaker":
      return {
        ok: true,
        criteria: {},
        label: "All guest house bookings",
        canFilterByRole: true,
        isOwnBookings: false,
      };
    case "developer":
      return {
        ok: true,
        criteria: {},
        label: "All bookings (developer)",
        canFilterByRole: true,
        isOwnBookings: false,
      };
    // Requester roles: student, employee, official, club, alumni
    default:
      return {
        ok: true,
        criteria: { userId: user.id },
        label: "Your booking history",
        canFilterByRole: false,
        isOwnBookings: true,
      };
  }
}
