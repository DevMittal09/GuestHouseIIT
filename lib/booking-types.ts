import {
  BOOKING_TYPE_LABELS,
  SERVICE_TYPE_LABELS,
  type BookingType,
  type Role,
  type ServiceType,
} from "./types";

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
  // The Student Cell raises alumni requests only. It had an "Official" option
  // until the IAR Office asked for it to be withdrawn (Sep 2026): office
  // bookings are raised by the IAR Office itself, which is also the body that
  // approves the Student Cell's requests. Stored bookings that used it keep
  // reading through here — the value is retired, not deleted.
  iar_student_cell: ["alumni"],
  // Retired: no one books as an alumnus any more, but stored bookings read
  // their type through here.
  alumni: ["alumni"],
  /**
   * The manager takes bookings at the desk for people who never open the
   * portal, so the kinds they raise on someone else's behalf are open to
   * them — the guest decides which it is, not the account typing it in.
   *
   * **Not `personal`** (23 Sep 2026). The manager's account is the desk, not
   * a person: a booking made on it is the guest house booking for somebody,
   * and "personal" would mean the manager's own family. Staff in this
   * position hold a second, ordinary institute account for their own
   * bookings — the office asked for the desk account to stop offering a
   * private stay, so a private stay cannot be raised, invoiced or approved
   * from the console that also approves it.
   */
  gh_manager: ["official", "alumni"],
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

// ------------------------------------------------------------ service type

/**
 * Roles that may book meals without a room.
 *
 * Faculty, staff and institute offices eat at the guest house without staying
 * there — a department hosting an examiner for the day, a committee meeting
 * over lunch. An ordinary guest has no reason to, and offering it to them
 * would only produce bookings the kitchen cannot place.
 *
 * The manager is here because they book for everybody (see `lib/access.ts`).
 */
export const MEALS_ONLY_ROLES: Role[] = [
  "employee",
  "official",
  "iar_cell",
  "gh_manager",
];

/** Who {@link MEALS_ONLY_ROLES} are, in words — for error messages and the public site. */
export const MEALS_ONLY_AUDIENCE = "institute faculty, staff and offices";

export function canBookMealsOnly(role: Role): boolean {
  return MEALS_ONLY_ROLES.includes(role);
}

/**
 * What this role may book, given whether any guest house it can use serves
 * meals at all. Meals-only is withheld from roles that cannot have it; the
 * two room options are always offered where meals exist, because whether a
 * *particular* guest house serves them is checked once one is chosen.
 */
export function serviceTypesFor(role: Role, mealsAvailable: boolean): ServiceType[] {
  if (!mealsAvailable) return ["room"];
  const types: ServiceType[] = ["room", "room_meals"];
  if (canBookMealsOnly(role)) types.push("meals_only");
  return types;
}

/** Why this role may not book that way, or null when it may. */
export function serviceTypeError(
  role: Role,
  service: ServiceType,
  mealsAvailable: boolean
): string | null {
  if (serviceTypesFor(role, mealsAvailable).includes(service)) return null;
  if (service === "meals_only" && !canBookMealsOnly(role)) {
    return `Meals without a room can only be booked by ${MEALS_ONLY_AUDIENCE}`;
  }
  return `“${SERVICE_TYPE_LABELS[service]}” is not available for your account`;
}

/** How each option is described on the booking form. */
export function describeServiceType(service: ServiceType): string {
  switch (service) {
    case "room":
      return "A room for the night. Guests make their own arrangements for food.";
    case "room_meals":
      return "A room, plus meals from the guest house kitchen on the days you choose.";
    case "meals_only":
      return "Meals at the guest house with no room booked — for a visitor you are hosting for the day.";
  }
}
