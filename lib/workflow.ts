import type { BookingSearchCriteria } from "./booking-search";
import type { BookingStatus, Profile, Role } from "./types";

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

/** Roles that get the approval log / booking archive at `/history`. */
export const HISTORY_ROLES: Role[] = [
  "warden",
  "faculty_advisor",
  "iar_cell",
  "gh_manager",
  "developer",
];

export function canViewHistory(role: Role): boolean {
  return HISTORY_ROLES.includes(role);
}

/** The slice of the archive a role may search, or why it cannot search at all. */
export type HistoryScope =
  | {
      ok: true;
      /** Applied last when building criteria, so the URL cannot widen it. */
      criteria: Pick<BookingSearchCriteria, "hostelName" | "club" | "userRole">;
      /** Human-readable description of the boundary, shown in the UI. */
      label: string;
      /** False when the role is fixed by the scope (hides the category filter). */
      canFilterByRole: boolean;
    }
  | { ok: false; reason: string };

/**
 * Archive counterpart to `canReview()`. A reviewer may look back over exactly
 * the requests they were ever responsible for — wardens their own hostel's
 * students, advisors their own club, the IAR cell alumni requests. The manager
 * and the developer see every booking, since every booking reaches the manager.
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
      };
    case "iar_cell":
      return {
        ok: true,
        criteria: { userRole: "alumni" },
        label: "Alumni requests",
        canFilterByRole: false,
      };
    case "gh_manager":
      return {
        ok: true,
        criteria: {},
        label: "All guest house bookings",
        canFilterByRole: true,
      };
    case "developer":
      return {
        ok: true,
        criteria: {},
        label: "All bookings (developer)",
        canFilterByRole: true,
      };
    default:
      return { ok: false, reason: "Your role does not have an approval log." };
  }
}
