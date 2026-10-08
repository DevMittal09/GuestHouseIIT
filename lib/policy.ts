/**
 * Guest house policy in one place.
 *
 * Everything here is a rule the office can change without a developer reading
 * the code that enforces it: how long a stay may run and who is exempt, where
 * alumni are put up, the pets notice, and who to ring when the form will not
 * let you do what you need. Each is enforced somewhere else - the booking
 * schema, the form, the server actions - but the *value* lives only here, so
 * changing it changes every place that shows or applies it.
 */

import { DEFAULT_RULES } from "./settings";
import { GUEST_HOUSE_CONTACT } from "./site";
import { addDaysToDateValue, parseDateValue, toInstituteDateValue } from "./tz";
import type { BookingType, GuestHouse, Role } from "./types";

// ------------------------------------------------------------------ duration

/**
 * The longest ordinary stay, in nights, under the default rules. The office's
 * own value is Settings (`rules.booking.max_stay_nights`, 0 = no limit) and is
 * passed as `maxNights` below.
 */
export const MAX_BOOKING_NIGHTS = DEFAULT_RULES.booking.max_stay_nights;

/**
 * Roles that may book any length of stay.
 *
 * The Director's Office hosts visits the institute has already committed to,
 * and the manager and the developer are the people who fix a booking when the
 * rule gets in the way - a cap they could not lift would just mean the stay is
 * recorded somewhere other than this portal.
 */
export const BOOKING_DURATION_EXEMPT_ROLES: Role[] = ["official", "gh_manager", "developer"];

/**
 * Accounts exempt regardless of role. The Director's Office books through the
 * `official` role today, so this is belt-and-braces for the day it does not -
 * an address here is exempt even if its role changes.
 */
export const DIRECTOR_OFFICE_EMAILS = ["director.office@iitpkd.ac.in"];

export function isDurationExempt(role: Role, email?: string | null): boolean {
  if (BOOKING_DURATION_EXEMPT_ROLES.includes(role)) return true;
  return Boolean(email && DIRECTOR_OFFICE_EMAILS.includes(email.toLowerCase()));
}

/**
 * Nights between two stay instants, counted the way a guest house counts them:
 * institute calendar dates, so checking in at 23:00 and out at 06:00 the next
 * morning is one night, not "seven hours".
 */
export function stayNights(checkIn: Date, checkOut: Date): number {
  const from = dayNumber(toInstituteDateValue(checkIn));
  const to = dayNumber(toInstituteDateValue(checkOut));
  if (from === null || to === null) return 0;
  return Math.max(0, to - from);
}

/**
 * A calendar date as a count of days, for subtracting one date from another.
 * UTC only because a UTC day is always 24 hours long - nothing here is an
 * instant, and nothing reads the runtime's zone. Same reasoning as `lib/tz.ts`.
 */
function dayNumber(value: string): number | null {
  const p = parseDateValue(value);
  if (!p) return null;
  return Date.UTC(p.year, p.month - 1, p.day) / 86_400_000;
}

/**
 * Why this stay is too long, or null when it is within the cap. Used by the
 * booking schema (client *and* server) and by the form's date hint, so the
 * rule and the message it shows cannot drift apart.
 */
export function stayLengthError(
  checkIn: Date,
  checkOut: Date,
  role: Role,
  email?: string | null,
  maxNights: number = MAX_BOOKING_NIGHTS
): string | null {
  if (isDurationExempt(role, email) || maxNights <= 0) return null;
  const nights = stayNights(checkIn, checkOut);
  if (nights <= maxNights) return null;
  return `Bookings are limited to a maximum of ${maxNights} nights - this stay is ${nights} nights. ${CONTACT_FOR_LONGER_STAYS}`;
}

export const CONTACT_FOR_LONGER_STAYS =
  "For longer stays, contact the Guest House Manager.";

/** Helper text under the date range on the booking form. */
export function stayLengthHint(
  role: Role,
  email?: string | null,
  maxNights: number = MAX_BOOKING_NIGHTS
): string | null {
  if (isDurationExempt(role, email) || maxNights <= 0) return null;
  return `Bookings are limited to a maximum of ${maxNights} nights. ${CONTACT_FOR_LONGER_STAYS}`;
}

/**
 * The latest check-out the date picker should offer for a stay starting on
 * `checkInDate` ("yyyy-MM-dd"), or null when the role is exempt. The picker
 * blocking it is a convenience; `stayLengthError` is the rule.
 */
export function latestCheckOutDate(
  checkInDate: string,
  role: Role,
  email?: string | null,
  maxNights: number = MAX_BOOKING_NIGHTS
): string | null {
  if (isDurationExempt(role, email) || maxNights <= 0) return null;
  if (!parseDateValue(checkInDate)) return null;
  return addDaysToDateValue(checkInDate, maxNights);
}

// ------------------------------------------------------------------ alumni

/**
 * Students and alumni are put up at Bageshri. Matched on the guest house
 * *name* because guest houses are created from the developer console and have
 * no stable id.
 *
 * It was the alumni rule alone until 7 Oct 2026, when the office asked for
 * students to be held to it in the same way - "students and alumni get
 * Bageshri only and no meal options". Students were already Bageshri-only in
 * practice, through `allowed_guest_house_ids` on the student form config, but
 * that is a Form Builder row a developer can edit; this is the policy, and
 * {@link restrictedToOneGuestHouse} applies it to both.
 */
export const ALUMNI_GUEST_HOUSE_NAME = "Bageshri";

/** The one guest house students and alumni use, under its own name. */
export const RESTRICTED_GUEST_HOUSE_NAME = ALUMNI_GUEST_HOUSE_NAME;

export const ALUMNI_GUEST_HOUSE_NOTE = `Alumni bookings are accommodated at ${ALUMNI_GUEST_HOUSE_NAME} Guest House.`;

export const STUDENT_GUEST_HOUSE_NOTE = `Student bookings are accommodated at ${RESTRICTED_GUEST_HOUSE_NAME} Guest House, which does not serve meals.`;

/** Guest houses an alumni booking may use. */
export function alumniGuestHouses(all: GuestHouse[]): GuestHouse[] {
  return all.filter((g) => g.name === RESTRICTED_GUEST_HOUSE_NAME);
}

/**
 * Whether this requester and this kind of booking are held to the one guest
 * house: a **student**, whoever they are booking for, and any booking made
 * **for an alumnus**, whichever account raises it.
 */
export function restrictedToOneGuestHouse(bookingType: BookingType, role?: Role | null): boolean {
  return bookingType === "alumni" || role === "student";
}

/**
 * The guest houses to offer for this kind of booking.
 *
 * A student's or an alumnus's booking is narrowed to Bageshri - unless the
 * institute has no guest house by that name, in which case the rule cannot be
 * applied and the full list stands rather than leaving the requester with an
 * empty dropdown. Guest houses are created and renamed from the developer
 * console, so that is a real possibility, not a theoretical one.
 */
export function guestHousesForBookingType(
  all: GuestHouse[],
  bookingType: BookingType,
  role?: Role | null
): GuestHouse[] {
  if (!restrictedToOneGuestHouse(bookingType, role)) return all;
  const allowed = alumniGuestHouses(all);
  return allowed.length > 0 ? allowed : all;
}

/**
 * Why this guest house may not take this booking, or null when it may.
 * Checked server-side; the form narrows the dropdown for the same reason.
 * A manager override is applied by the caller, which also logs it.
 */
export function guestHousePolicyError(
  bookingType: BookingType,
  guestHouse: GuestHouse,
  all: GuestHouse[],
  role?: Role | null
): string | null {
  if (!restrictedToOneGuestHouse(bookingType, role)) return null;
  const allowed = alumniGuestHouses(all);
  if (allowed.length === 0) return null;
  if (allowed.some((g) => g.id === guestHouse.id)) return null;
  return bookingType === "alumni"
    ? `${ALUMNI_GUEST_HOUSE_NOTE} ${guestHouse.name} cannot be booked for an alumnus.`
    : `${STUDENT_GUEST_HOUSE_NOTE} ${guestHouse.name} cannot be booked by a student.`;
}

// ------------------------------------------------------------------- meals

/**
 * Whether meals may be booked at all, for this requester and this kind of
 * booking (7 Oct 2026).
 *
 * **No** for a student and for any booking made for an alumnus. Both are
 * accommodated at Bageshri, which has no kitchen, so until now the answer
 * fell out of the guest house: the form offers meals only where
 * `serves_meals`, and Bageshri does not. That is a coincidence of
 * configuration rather than a rule - a developer ticking "Serves meals" on
 * Bageshri, or adding either role to Hamsanandi's list, would have started
 * offering meals the office does not sell to them. So it is written down
 * here, applied by the form and checked by `createBooking`.
 *
 * The **manager** is not held to it: the desk books for whoever is standing
 * at the counter, and an exception it cannot make is an exception recorded
 * somewhere other than this portal. The override is logged, like the guest
 * house one.
 */
export function mealsAllowedFor(bookingType: BookingType, role?: Role | null): boolean {
  return !restrictedToOneGuestHouse(bookingType, role);
}

/** Why this booking may not include meals, or null when it may. */
export function mealsPolicyError(bookingType: BookingType, role?: Role | null): string | null {
  if (mealsAllowedFor(bookingType, role)) return null;
  return bookingType === "alumni"
    ? "Meals cannot be booked with a stay for an alumnus - they are accommodated at the guest house that has no kitchen."
    : "Meals cannot be booked with a student's request - students are accommodated at the guest house that has no kitchen.";
}

// ------------------------------------------------------------------ pets

export const PETS_POLICY_NOTICE = "Pets are not allowed in the guest house premises.";

export const PETS_POLICY_ACKNOWLEDGEMENT =
  "I have read and understood that pets are not allowed.";

// ------------------------------------------------------------------ contact

/**
 * Who to contact when the form will not allow what the requester needs - a
 * stay over the cap, an alumni booking at the other guest house, a category
 * that no longer exists.
 *
 * The guest house office's own phone and email, from the one place they are
 * kept (`GUEST_HOUSE_CONTACT`, `lib/site.ts` - the numbers on the office's
 * invoice template, also on the public site). This used to be a placeholder of
 * its own (+91 04923 226 100, guesthouse@), so the portal showed a different
 * number from the website and the invoice.
 */
export const GUEST_HOUSE_MANAGER_CONTACT = {
  name: "Guest House Manager",
  phone: GUEST_HOUSE_CONTACT.phone,
  email: GUEST_HOUSE_CONTACT.email,
} as const;

/** The one-line help shown on the booking form and the portal home page. */
export const MANAGER_HELP_LINE = `Facing trouble booking? Contact the ${GUEST_HOUSE_MANAGER_CONTACT.name} on ${GUEST_HOUSE_MANAGER_CONTACT.phone} or ${GUEST_HOUSE_MANAGER_CONTACT.email}.`;
