import { describe, expect, it } from "vitest";
import { availabilityRange, isPastDay } from "@/lib/availability";
import { advanceWindowMessage, bookingPayloadSchema } from "@/lib/booking-schema";
import { buildDefaultFormConfig, sanitizeFormConfig } from "@/lib/form-config";
import { DEFAULT_RULES, type Rules } from "@/lib/settings";
import { GUEST_HOUSE_CONTACT } from "@/lib/site";
import { addDaysToDateValue, toInstituteDateValue } from "@/lib/tz";
import { latestCheckIn } from "@/lib/workflow";
import { GH } from "./helpers";

/**
 * The round of 14 October 2026 - the office's twelfth list. Five items, of
 * which three are rules a test can hold to account:
 *
 * 1. The number the contact page prints is **the Guest House Manager's**, not
 *    "the front office" - one label for the three places that print it.
 * 2. The week and month views **do not offer dates that have gone**, in the
 *    booking form and on `/availability` alike.
 * 3. **No privacy consent is asked for** while submitting a request, so the
 *    schema cannot demand it - the form sends `parsed.data` and
 *    `createBooking` re-parses it with the same rule.
 * 4. **Bookings open further ahead than a month**: the window defaults to six.
 *
 * The fifth - the free-room count is green, and the "N of M rooms at X free
 * all month" sentence is off the booking form - is copy and colour, which a
 * unit test cannot see.
 */

const today = toInstituteDateValue(new Date());

// --------------------------------------------- the number is the manager's

describe("the guest house's number is labelled once", () => {
  it("names the Guest House Manager, beside the manager's own address", () => {
    expect(GUEST_HOUSE_CONTACT.phoneLabel).toBe("Guest House Manager");
    expect(GUEST_HOUSE_CONTACT.email).toBe("ghm@iitpkd.ac.in");
  });
});

// ------------------------------------------- the week and month views

describe("a date that has gone is not offered", () => {
  it("is a plain comparison of institute calendar dates", () => {
    expect(isPastDay(addDaysToDateValue(today, -1), today)).toBe(true);
    // Today is bookable: `earliestBookableCheckIn` is midnight this morning,
    // so the desk can still enter a guest who arrived an hour ago.
    expect(isPastDay(today, today)).toBe(false);
    expect(isPastDay(addDaysToDateValue(today, 1), today)).toBe(false);
  });

  /**
   * The point of the rule: a week runs Monday to Sunday and a month is a whole
   * calendar month, so the range containing today contains days nobody can
   * book - and each of them used to carry a free-room count, which reads as an
   * offer.
   */
  it("marks exactly the days before today in the week containing it", () => {
    const week = availabilityRange("week", today);
    if (!week) throw new Error("no range");
    expect(week.days).toHaveLength(7);
    expect(week.days.filter((day) => isPastDay(day, today))).toEqual(
      week.days.filter((day) => day < today)
    );
    expect(week.days.find((day) => !isPastDay(day, today))).toBe(today);
  });

  it("marks a week that has wholly gone, and nothing of a month still to come", () => {
    const gone = availabilityRange("week", addDaysToDateValue(today, -14));
    const coming = availabilityRange("month", addDaysToDateValue(today, 40));
    if (!gone || !coming) throw new Error("no range");
    expect(gone.days.every((day) => isPastDay(day, today))).toBe(true);
    expect(coming.days.some((day) => isPastDay(day, today))).toBe(false);
  });
});

// ------------------------------------------------- privacy, and the window

describe("a request is submitted with no privacy consent at all", () => {
  const houses = [GH];
  const config = sanitizeFormConfig(buildDefaultFormConfig("employee", houses), houses);
  const schema = (rules: Rules = DEFAULT_RULES) =>
    bookingPayloadSchema(config, {
      mealsAvailable: false,
      requesterEmail: "person@iitpkd.ac.in",
      rules,
    });

  /** An employee's personal stay: the one booking nothing else is asked of. */
  const payload = (patch: Record<string, unknown> = {}, days = 3) => ({
    guest_house_id: GH.id,
    service_type: "room",
    booking_type: "personal",
    debit_head: "personal_funds",
    purpose_of_visit: "Family visiting",
    check_in: `${addDaysToDateValue(today, days)}T12:00`,
    check_out: `${addDaysToDateValue(today, days + 1)}T10:00`,
    rooms: [{ room_type: null, guests: [{ name: "A Guest", gender: "female", citizenship: "indian" }] }],
    meals: [],
    ...patch,
  });

  it("is accepted, and carries no consent in its output", () => {
    const result = schema().safeParse(payload());
    if (!result.success) throw new Error(JSON.stringify(result.error.issues));
    expect(result.data).not.toHaveProperty("privacy_consent");
    // Round trip: the schema takes its own output (the form sends it back).
    expect(schema().safeParse(result.data).success).toBe(true);
  });

  /**
   * The whole notice was withdrawn later the same day
   * (`archive/privacy-notice/`), so the field is off the payload too. A
   * payload that still names it - one in flight, or kept by a browser - is
   * **stripped, not refused**: the object is not `.strict()`, and refusing it
   * would turn a withdrawn field into a submission that cannot be made.
   */
  it("strips a consent a payload still carries, rather than refusing it", () => {
    const result = schema().safeParse(payload({ privacy_consent: true }));
    if (!result.success) throw new Error(JSON.stringify(result.error.issues));
    expect(result.data).not.toHaveProperty("privacy_consent");
  });

  // ------------------------------------------------- the booking window

  it("opens bookings six months ahead, not one", () => {
    expect(DEFAULT_RULES.booking.advance_booking_months).toBe(6);
    expect(schema().safeParse(payload({}, 60)).success).toBe(true);
  });

  it("is what the one-month window refused", () => {
    const oneMonth: Rules = {
      ...DEFAULT_RULES,
      booking: { ...DEFAULT_RULES.booking, advance_booking_months: 1 },
    };
    const result = schema(oneMonth).safeParse(payload({}, 60));
    expect(result.success).toBe(false);
    expect(!result.success && JSON.stringify(result.error.issues)).toContain("Bookings open one month");
  });

  it("is still a window, and still names the last date it allows", () => {
    const result = schema().safeParse(payload({}, 220));
    expect(result.success).toBe(false);
    expect(advanceWindowMessage("employee")).toContain("6 months");
    // The exempt roles are unchanged: the institute books on its own notice.
    expect(latestCheckIn("official", new Date())).toBeNull();
    expect(latestCheckIn("gh_manager", new Date())).toBeNull();
  });
});
