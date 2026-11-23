import type { Profile, Role } from "./types";

/**
 * Non-teaching staff booking on behalf of teaching staff (23 Nov 2026).
 *
 * The pattern mirrors `lib/club-booking.ts`: the booking hangs off the
 * **faculty member's** account (`user_id`, `user_role: "employee"`), so it is
 * routed, debited and scoped exactly as a faculty booking always is.
 * `created_by` names the staff member who raised it.
 *
 * Any non-teaching staff may book for any faculty member - there is no
 * appointment like `faculty_advisor_id`. The staff member picks a faculty
 * member from a searchable dropdown, the form switches to that faculty
 * member's options (booking types, debitable heads, service types), and the
 * faculty member is automatically CC'd on all booking mail (through the
 * existing `requesterCopyTo` in `lib/mail/recipients.ts`, which CCs the
 * creator when `created_by !== user_id`).
 *
 * Pure: everything is worked out from profiles already loaded.
 */

/** Whether this person is non-teaching staff who may book on behalf of faculty. */
export function isNonTeachingStaff(
  profile: Pick<Profile, "role" | "staff_category">,
): boolean {
  return profile.role === "employee" && profile.staff_category === "staff";
}

/** Whether this person is teaching staff (faculty) someone may book for. */
export function isFacultyMember(
  profile: Pick<Profile, "role" | "staff_category">,
): boolean {
  return profile.role === "employee" && profile.staff_category !== "staff";
}

/**
 * All faculty members this staff person could book for, in name order.
 * Returns an empty array for anyone who is not non-teaching staff.
 */
export function facultyBookableBy(
  user: Pick<Profile, "id" | "role" | "staff_category">,
  profiles: Profile[],
): Profile[] {
  if (!isNonTeachingStaff(user)) return [];
  return profiles
    .filter((p) => p.id !== user.id && isFacultyMember(p))
    .sort((a, b) => a.full_name.localeCompare(b.full_name));
}

/**
 * Whether a stored booking was raised for a faculty member by non-teaching
 * staff: an employee booking whose `created_by` is somebody other than the
 * faculty member.
 */
export function raisedByStaffForFaculty(booking: {
  user_role: Role;
  user_id?: string | null;
  created_by?: string | null;
}): boolean {
  return (
    booking.user_role === "employee" &&
    Boolean(booking.created_by) &&
    booking.created_by !== booking.user_id
  );
}
