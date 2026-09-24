import type { Profile, Role } from "./types";
import type { Unit } from "./units";

/**
 * Clubs and fest councils do not book for themselves (24 Sep 2026).
 *
 * The office's rule: **only a club's faculty in-charge can book for it.** The
 * club's own account — a shared student mailbox such as petrichor@ — can see
 * the club's bookings and follow them, but a new request is raised by the
 * faculty member responsible for the club, from their own login, on the
 * club's behalf.
 *
 * Such a booking is still the club's: it hangs off the club's account
 * (`user_id`, `user_role: "club"`), so it is routed, debited, scoped and
 * reported exactly as a club booking always was. `created_by` names the
 * faculty member who raised it. Because the person who would have signed it
 * off as Faculty Advisor is the one who raised it, that stage is skipped
 * (`routeFor`, `raisedByFacultyInCharge`); an HOD stage, where the club has
 * one, still applies.
 *
 * Pure: everything is worked out from profiles and units already loaded.
 */

/** Roles whose own account may not raise a booking — their faculty in-charge does. */
export const BOOKED_BY_FACULTY_IN_CHARGE: Role[] = ["club"];

export function mustBookThroughFacultyInCharge(role: Role): boolean {
  return BOOKED_BY_FACULTY_IN_CHARGE.includes(role);
}

/** Roles that can never be a club's faculty in-charge, whatever the console says. */
const NOT_FACULTY: Role[] = ["student", "club", "iar_student_cell", "alumni"];

/**
 * The faculty in-charge of a club, by two routes, and both count:
 *
 * - **the club's own head or acting head** in Departments & Clubs, as long as
 *   they are not a student. Deliberately *not* inherited from a parent unit:
 *   a club with no head of its own is approved by its council's secretary,
 *   who is a student and is nobody's faculty in-charge;
 * - **a Faculty Advisor account** whose Department / Club is the club's —
 *   the name match reviewers were found by before units existed, and still
 *   how the demo's Petrichor advisor is set up.
 */
export function facultyInChargeOf(club: Profile, profiles: Profile[], units: Unit[]): Profile[] {
  if (club.role !== "club") return [];
  const unit = club.unit_id ? units.find((u) => u.id === club.unit_id) : undefined;
  const heads = new Set([unit?.head_id, unit?.acting_head_id].filter((id): id is string => Boolean(id)));
  const clubName = club.department_or_club?.trim();
  return profiles.filter((p) => {
    if (p.id === club.id || NOT_FACULTY.includes(p.role)) return false;
    if (heads.has(p.id)) return true;
    return p.role === "faculty_advisor" && Boolean(clubName) && p.department_or_club?.trim() === clubName;
  });
}

/**
 * Whether this person could be anybody's faculty in-charge at all, from the
 * units alone — a Faculty Advisor account, or the head of a club or council.
 * Lets a caller skip reading every profile for the great majority of people,
 * who are neither.
 */
export function mightBeFacultyInCharge(user: Profile, units: Unit[]): boolean {
  if (NOT_FACULTY.includes(user.role)) return false;
  if (user.role === "faculty_advisor") return true;
  return units.some(
    (u) =>
      (u.kind === "club" || u.kind === "council") &&
      (u.head_id === user.id || u.acting_head_id === user.id)
  );
}

/** The clubs this person may book for, in name order. Empty for almost everyone. */
export function clubsBookableBy(user: Profile, profiles: Profile[], units: Unit[]): Profile[] {
  if (NOT_FACULTY.includes(user.role)) return [];
  return profiles
    .filter((p) => p.role === "club" && facultyInChargeOf(p, profiles, units).some((f) => f.id === user.id))
    .sort((a, b) => a.full_name.localeCompare(b.full_name));
}

/**
 * Whether a stored booking was raised for a club by its faculty in-charge:
 * a club booking whose `created_by` is somebody other than the club itself.
 */
export function raisedByFacultyInCharge(booking: {
  user_role: Role;
  user_id?: string | null;
  created_by?: string | null;
}): boolean {
  return (
    booking.user_role === "club" &&
    Boolean(booking.created_by) &&
    booking.created_by !== booking.user_id
  );
}

/** What a club's account is told on New Booking, naming who can book for it. */
export function clubBookingNotice(inCharge: Pick<Profile, "full_name" | "email">[]): string {
  if (inCharge.length === 0) {
    return "Club bookings are raised by the club's faculty in-charge, and nobody is set as yours yet. Ask the Guest House Manager to name your faculty in-charge in Departments & Clubs.";
  }
  const names = inCharge.map((p) => `${p.full_name} (${p.email})`).join(" or ");
  return `Club bookings are raised by the club's faculty in-charge — ${names}. Ask them to book; the request will appear here under My Bookings, and every mail about it reaches this account too.`;
}
