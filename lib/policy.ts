/**
 * Guest house policy in one place.
 *
 * Everything here is a rule the office can change without a developer reading
 * the code that enforces it: how long a stay may run and who is exempt, where
 * alumni are put up, and the pets notice. Each is enforced somewhere else -
 * the booking schema, the form, the server actions - but the *value* lives
 * only here, so changing it changes every place that shows or applies it.
 */

import { DEFAULT_RULES } from "./settings";
import { addDaysToDateValue, parseDateValue, toInstituteDateValue } from "./tz";
import type { BookingType, GuestHouse, Role } from "./types";

// ------------------------------------------------------------------ duration

/**
 * The longest ordinary stay, in nights, under the default rules. The office's
 * own value is Settings (`rules.booking.max_stay_nights`, 0 = no limit) and is
 * passed as `maxNights` below.
 */
export const MAX_BOOKING_NIGHTS = DEFAULT_RULES.booking.max_stay_nights;

/*
 * **Nobody is exempt from the stay cap any more** (10 Nov 2026, the owner:
 * "booking period should be 14 days max for everyone so limit it in the
 * checkout calender selection").
 *
 * `BOOKING_DURATION_EXEMPT_ROLES` (`official`, `gh_manager`, `developer`),
 * `DIRECTOR_OFFICE_EMAILS` and `isDurationExempt` are **deleted**, and so is
 * the `official` **booking type** exemption added on 9 Nov 2026 from the
 * meeting's own list ("official bookings and GHM-created bookings: no maximum
 * duration restriction"). Both are superseded: a cap that most of the desk's
 * own accounts could ignore is not a cap, and the office asked for one figure
 * that holds for everyone and is visible in the date picker.
 *
 * **The escape hatch is unchanged, and it is a better one.** A stay that has
 * to run longer than the cap is extended by the desk *after* it is approved -
 * `extendStayAction`, from Manage, which has never consulted this rule and
 * still does not. So the institute can still host a three-week visit; what it
 * can no longer do is book one on a form nobody reviewed for length. That is
 * the difference between an exemption and a decision.
 */

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
 * booking schema (client *and* server) and by the form's date picker, so the
 * rule and the message it shows cannot drift apart.
 *
 * It takes no role, address or booking type: since 10 Nov 2026 **the cap
 * applies to everyone**, and carrying parameters nothing reads would be an
 * exemption waiting to be reintroduced.
 */
export function stayLengthError(
  checkIn: Date,
  checkOut: Date,
  maxNights: number = MAX_BOOKING_NIGHTS
): string | null {
  if (maxNights <= 0) return null;
  const nights = stayNights(checkIn, checkOut);
  if (nights <= maxNights) return null;
  return `Bookings are limited to a maximum of ${maxNights} nights - this stay is ${nights} nights. ${CONTACT_FOR_LONGER_STAYS}`;
}

export const CONTACT_FOR_LONGER_STAYS =
  "For longer stays, contact the Guest House Manager.";

/**
 * **`stayLengthHint` is gone** (27 Oct 2026). It wrote "Bookings are limited
 * to a maximum of 14 nights. For longer stays, contact the Guest House
 * Manager." under the check-out box, and the owner asked for it off the page.
 * The rule is unchanged and still has its three homes: the Guidelines state
 * it, `stayLengthError` says it with the reader's own figures when it fires,
 * and `latestCheckOutDate` keeps the date picker from offering the day.
 */

/**
 * The latest check-out the date picker may offer for a stay starting on
 * `checkInDate` ("yyyy-MM-dd"), or null only where the office has turned the
 * cap off (`max_stay_nights: 0`).
 *
 * **It is no longer a convenience** (10 Nov 2026): the owner asked for the
 * limit to be *in* the picker, so this is what stops the day being offered at
 * all, and `stayLengthError` is the rule behind it. Nobody is exempt - see
 * the note above `stayNights`.
 */
export function latestCheckOutDate(
  checkInDate: string,
  maxNights: number = MAX_BOOKING_NIGHTS
): string | null {
  if (maxNights <= 0) return null;
  if (!parseDateValue(checkInDate)) return null;
  return addDaysToDateValue(checkInDate, maxNights);
}

// ------------------------------------------------------------ cancellation

/**
 * **A requester cancels at least 24 hours before check-in** (9 Nov 2026, the
 * meeting).
 *
 * The office's reason, in their words: the notice period "allows rooms to be
 * allocated to people on the waiting list". A room released an hour before
 * the guest was due is a room nobody else can be offered, so it is a room the
 * guest house loses - and the office was being asked to cancel by telephone
 * and WhatsApp instead, which left no record at all. So the portal takes the
 * cancellation and the notice period is the rule.
 *
 * The figure is Settings (`rules.booking.cancellation_notice_hours`, 0 turns
 * it off) and is passed in, like every other rule here.
 *
 * **Three things it deliberately does not do.**
 *
 * - It does not hold the **Guest House Manager** to anything: the meeting was
 *   explicit that "the GHM should have the authority to cancel any booking at
 *   any time", which is `managerCancelBooking` and has always been a separate
 *   action.
 * - It does not touch a stay that has already **started**: that is refused
 *   earlier and for a different reason - the guest is in the room, and what
 *   happens next is a conversation at the desk.
 * - It does not refuse a **dining** booking by its check-in. A meal booking's
 *   `check_in` is derived from its first day of meals, and the kitchen's own
 *   notice period (`mealBookingDeadline`) is the rule that governs it.
 */
export function cancellationNoticeError(
  checkIn: Date,
  now: Date,
  noticeHours: number = DEFAULT_RULES.booking.cancellation_notice_hours
): string | null {
  if (noticeHours <= 0) return null;
  const deadline = checkIn.getTime() - noticeHours * 3_600_000;
  if (now.getTime() <= deadline) return null;
  return `A booking can be cancelled from the portal up to ${plural(noticeHours, "hour")} before check-in, so the room can be offered to somebody else. ${CONTACT_TO_CANCEL_LATE}`;
}

export const CONTACT_TO_CANCEL_LATE =
  "Speak to the Guest House Manager to cancel this stay.";

/** "24 hours", "1 hour" - the one place either is spelled. */
function plural(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
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

/**
 * The no-pets rule, in one sentence.
 *
 * **Not on the booking form** (11 Oct 2026, the office: "only required in the
 * guidelines no need to show it here"). A house rule is not a rule the form
 * enforces, so it has the two homes every other rule has: the Guidelines page
 * ("During your stay", `lib/site-content.ts`) and the **"Pets" line in every
 * booking mail** (`lib/mail/templates.ts`), which is the only place this
 * constant is now read. Don't put it back on a form.
 */
export const PETS_POLICY_NOTICE = "Pets are not allowed in the guest house premises.";

/** The withdrawn tick box's label (19 Sep 2026). Nothing renders it. */
export const PETS_POLICY_ACKNOWLEDGEMENT =
  "I have read and understood that pets are not allowed.";

// ------------------------------------------------------------------ contact

/*
 * **The help line is gone** (9 Oct 2026). "Facing trouble booking? Contact
 * the Guest House Manager on … or …" stood at the foot of My Bookings and
 * again at the foot of the booking form - a sentence in the middle of a form,
 * addressed to the few people who are stuck. The office's phone and email are
 * in the portal footer on every signed-in page now
 * (`app/(portal)/layout.tsx`), read from `GUEST_HOUSE_CONTACT` in
 * `lib/site.ts`, which remains the one place either is written down. There is
 * no copy of them here any more.
 */
