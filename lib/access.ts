/**
 * Who may act outside the ordinary flow.
 *
 * The Guest House Manager runs the guest house: they take bookings at the
 * desk for people who never open the portal, fix the ones that are wrong, and
 * override a rule when the institute has already promised something the form
 * refuses. None of that is a new role — `gh_manager` has existed since the
 * first migration — it is a set of permissions that were previously spread
 * across `role === "gh_manager"` checks in individual actions.
 *
 * Every override here is recorded in `booking_logs`, which is what makes it an
 * override rather than a loophole: the audit trail names who did it and why.
 */

import type { Role } from "./types";

/**
 * Roles with unrestricted access to every booking. The developer is included
 * because the console already bypasses everything; naming it here keeps the
 * two from drifting apart.
 */
export const FULL_ACCESS_ROLES: Role[] = ["gh_manager", "developer"];

export function hasFullBookingAccess(role: Role): boolean {
  return FULL_ACCESS_ROLES.includes(role);
}

/** Create, edit, cancel or reinstate any booking, whoever raised it. */
export function canManageAnyBooking(role: Role): boolean {
  return hasFullBookingAccess(role);
}

/** Submit a booking in someone else's name, recording both parties. */
export function canBookOnBehalf(role: Role): boolean {
  return hasFullBookingAccess(role);
}

/**
 * Approve a booking without walking it through the warden / advisor / IAR
 * chain. The manager is the last stage of that chain anyway; this lets them
 * be the only stage when the request is already settled off-portal.
 */
export function canOverrideApproval(role: Role): boolean {
  return hasFullBookingAccess(role);
}

/**
 * Book a guest house that a policy would otherwise rule out — an alumnus at
 * Hamsanandi, say, when Bageshri is full. Gated here and logged at the point
 * of use, never silently allowed.
 */
export function canOverrideGuestHousePolicy(role: Role): boolean {
  return hasFullBookingAccess(role);
}

/** Assign and reassign rooms, and change dates on an existing booking. */
export function canAssignRooms(role: Role): boolean {
  return hasFullBookingAccess(role);
}

/** Edit the meal selection of a booking after it was submitted. */
export function canEditMeals(role: Role): boolean {
  return hasFullBookingAccess(role);
}

/** See occupancy and daily meal counts across every guest house. */
export function canViewAllOccupancy(role: Role): boolean {
  return hasFullBookingAccess(role) || role === "gh_caretaker";
}
