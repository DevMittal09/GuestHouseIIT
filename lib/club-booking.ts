import type { Profile, Role } from "./types";
import { facultyAdvisorOf, secretaryEmailOf, type Unit } from "./units";

/**
 * Councils, fests and clubs do not book for themselves (24 Sep 2026).
 *
 * The office's rule: **a club's bookings are raised by its Faculty Advisor.**
 * The student bodies sit in a hierarchy — a Faculty Advisor for each council
 * (Technical Affairs, Cultural Affairs), a student secretary for it, and the
 * clubs under it; a fest such as Petrichor has an advisor of its own. The
 * club's own account (a shared mailbox such as petrichor@ or sec_arts@) can
 * see its bookings and follow them, but a new request is raised by the
 * Faculty Advisor, from their own faculty login, on the club's behalf.
 *
 * **Who the advisor is lives in the console, not in an account.** It is a
 * contract of a year or two, so it is a field on the council or club
 * (`units.faculty_advisor_id`, Departments & Clubs) that the developer
 * changes, and any professor named there gets "Book as Faculty Advisor" on
 * New Booking. A club with no advisor of its own takes its council's.
 *
 * Such a booking is still the club's: it hangs off the club's account
 * (`user_id`, `user_role: "club"`), so it is debited, scoped and reported
 * exactly as a club booking always was. `created_by` names the advisor. It
 * needs nobody to forward it — the advisor is who would have — so it goes
 * **straight to the Guest House Manager** (`routeFor`,
 * `raisedByFacultyInCharge`), and its Copy to starts with the council
 * secretary's mailbox (`defaultCopyToFor`).
 *
 * Pure: everything is worked out from profiles and units already loaded.
 */

/** Roles whose own account may not raise a booking — their Faculty Advisor does. */
export const BOOKED_BY_FACULTY_IN_CHARGE: Role[] = ["club"];

export function mustBookThroughFacultyInCharge(role: Role): boolean {
  return BOOKED_BY_FACULTY_IN_CHARGE.includes(role);
}

/**
 * Whether this account may be named a Faculty Advisor: a faculty member —
 * an employee who is not non-teaching staff — or one of the old Faculty
 * Advisor accounts. Never a student, a club or a desk. The console refuses
 * anyone else, and the rules below ignore anyone else a stored row names.
 */
export function canBeFacultyAdvisor(profile: Pick<Profile, "role" | "staff_category">): boolean {
  if (profile.role === "faculty_advisor") return true;
  return profile.role === "employee" && profile.staff_category !== "staff";
}

/**
 * The Faculty Advisor of a club, fest or council account: the one named on
 * its unit in the console, or on the council above it. At most one person;
 * a list so callers need not special-case "nobody set".
 */
export function facultyInChargeOf(club: Profile, profiles: Profile[], units: Unit[]): Profile[] {
  if (club.role !== "club") return [];
  const advisorId = facultyAdvisorOf(club.unit_id, units);
  const advisor = advisorId ? profiles.find((p) => p.id === advisorId) : undefined;
  return advisor && advisor.id !== club.id && canBeFacultyAdvisor(advisor) ? [advisor] : [];
}

/**
 * Whether this person is named Faculty Advisor of anything at all, from the
 * units alone. Lets a caller skip reading every profile for the great
 * majority of people, who are not.
 */
export function mightBeFacultyInCharge(user: Profile, units: Unit[]): boolean {
  return canBeFacultyAdvisor(user) && units.some((u) => u.faculty_advisor_id === user.id);
}

/** The councils, fests and clubs this person may book for, in name order. Empty for almost everyone. */
export function clubsBookableBy(user: Profile, profiles: Profile[], units: Unit[]): Profile[] {
  if (!canBeFacultyAdvisor(user)) return [];
  return profiles
    .filter((p) => p.role === "club" && facultyInChargeOf(p, profiles, units).some((f) => f.id === user.id))
    .sort((a, b) => a.full_name.localeCompare(b.full_name));
}

/**
 * What Copy to starts with when the Faculty Advisor books for a club: the
 * secretary's mailbox of the club's council (or the club's own, where it has
 * one). Left out when that mailbox *is* the club's account — booking for the
 * council itself — because the account is mailed anyway. The advisor can
 * remove it or add more; it is a default, not a rule.
 */
export function defaultCopyToFor(club: Pick<Profile, "email" | "unit_id">, units: Unit[]): string[] {
  const secretary = secretaryEmailOf(club.unit_id, units);
  if (!secretary || secretary.toLowerCase() === club.email.toLowerCase()) return [];
  return [secretary];
}

/**
 * Whether a stored booking was raised for a club by its Faculty Advisor:
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
    return "Club bookings are raised by the club's Faculty Advisor, and nobody is set as yours yet. Ask the Guest House Manager to name your Faculty Advisor in Departments & Clubs.";
  }
  const names = inCharge.map((p) => `${p.full_name} (${p.email})`).join(" or ");
  return `Club bookings are raised by the club's Faculty Advisor — ${names}. Ask them to book; the request will appear here under My Bookings, and every mail about it reaches this account too.`;
}
