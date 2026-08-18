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
