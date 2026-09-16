import { BOOKING_TYPE_LABELS, type BookingType, type Role } from "./types";

/**
 * Which booking types a role may choose, and which is selected by default.
 *
 * The office asked for this to be the *first* question on the booking form,
 * because it decides how the stay is billed and who has to approve it — not a
 * detail buried near the bottom. A role with exactly one option is never asked:
 * a club or a dignitary's office only ever books officially, so showing them a
 * toggle with one position is a decision that isn't theirs to make.
 *
 * `alumni` is here rather than on a role of its own because alumni have no
 * institute login. The IAR Office and the IAR Student Cell raise those requests
 * for them, and each can also book for its own office, so the *same* account
 * needs both options.
 */
const ROLE_BOOKING_TYPES: Partial<Record<Role, BookingType[]>> = {
  // Students book for family; an official student booking is a club booking,
  // which is a different role.
  student: ["personal"],
  // The one role the toggle was actually asked for: faculty and regular staff
  // book officially by default, privately when it is their own family.
  employee: ["official", "personal"],
  club: ["official"],
  official: ["official"],
  iar_cell: ["official", "alumni"],
  iar_student_cell: ["official", "alumni"],
  // Retired: no one books as an alumnus any more, but stored bookings read
  // their type through here.
  alumni: ["alumni"],
};

/** The booking types `role` may pick. Empty when the role cannot book at all. */
export function bookingTypesFor(role: Role): BookingType[] {
  return ROLE_BOOKING_TYPES[role] ?? [];
}

/**
 * The type pre-selected for `role` — the first it is allowed, which is why the
 * arrays above list "official" first for staff. Null when the role cannot book.
 */
export function defaultBookingTypeFor(role: Role): BookingType | null {
  return bookingTypesFor(role)[0] ?? null;
}

/** Whether the form should ask at all, or just record the single option. */
export function offersBookingTypeChoice(role: Role): boolean {
  return bookingTypesFor(role).length > 1;
}

/** Why this role may not book that way, or null when it may. */
export function bookingTypeError(role: Role, type: BookingType): string | null {
  const allowed = bookingTypesFor(role);
  if (allowed.length === 0) return "Your role cannot submit booking requests";
  if (allowed.includes(type)) return null;
  const readable = role.replace(/_/g, " ");
  return `A ${readable} booking cannot be submitted as “${BOOKING_TYPE_LABELS[type]}”`;
}

/**
 * Whether the request is for an alumnus, and therefore has to carry their
 * name, student id and ID card. Those identify someone who cannot log in to
 * speak for themselves, so the IAR Office has nothing else to verify against.
 */
export function needsAlumniDetails(type: BookingType): boolean {
  return type === "alumni";
}

/**
 * How the choice is described on the booking form, per role. Kept next to the
 * policy so the wording and the rule cannot drift apart.
 */
export function describeBookingType(role: Role, type: BookingType): string {
  if (type === "alumni") {
    return (
      "The stay is for an alumnus. You will be asked for their name, " +
      "student id and Alumni ID card."
    );
  }
  if (type === "personal") {
    return (
      "A private visit — family or personal guests. Settled by you, not by " +
      "the department."
    );
  }
  return role === "iar_cell" || role === "iar_student_cell"
    ? "Institute business for the IAR office."
    : "Institute business — a visitor, collaborator or committee hosted by " +
      "the institute.";
}
