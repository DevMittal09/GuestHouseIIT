import { addMonths } from "date-fns";
import type { BookingSearchCriteria } from "./booking-search";
import type { BookingStatus, Profile, Role } from "./types";

/** How far ahead of today a stay may be booked. */
export const ADVANCE_BOOKING_WINDOW_MONTHS = 1;

/**
 * Official / dignitary visits are arranged by the institute on its own notice
 * and are the one category exempt from the advance-booking window.
 */
export function isAdvanceWindowExempt(role: Role): boolean {
  return role === "official";
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

/** Where a fresh booking enters the approval pipeline, by requester role. */
export function initialStatusForRole(role: Role): BookingStatus {
  switch (role) {
    case "student":
      return "PENDING_WARDEN";
    case "club":
      return "PENDING_FA";
    case "alumni":
      return "PENDING_IAR";
    case "employee":
    case "official":
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

/** Statuses that represent a booking where rooms are currently held/occupied. */
export const ROOM_HOLDING_STATUSES: BookingStatus[] = [
  "APPROVED",
  "OCCUPIED",
  "CANCELLATION_REQUESTED",
];

/** Roles that get the approval log / booking archive at `/history`. */
export const HISTORY_ROLES: Role[] = [
  "warden",
  "faculty_advisor",
  "iar_cell",
  "gh_manager",
  "developer",
];

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
      criteria: Pick<BookingSearchCriteria, "hostelName" | "club" | "userRole" | "userId">;
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
        criteria: { userRole: "alumni" },
        label: "Alumni requests",
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
