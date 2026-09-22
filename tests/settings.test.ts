import { describe, expect, it } from "vitest";
import { bookingPayloadSchema } from "@/lib/booking-schema";
import { buildDefaultFormConfig } from "@/lib/form-config";
import { mealPlanError, mealTimes, normalizeMeals, stayMealDays } from "@/lib/meals";
import {
  allocationCapacityError,
  roomAssignmentError,
  roomOccupancyNotice,
  roomPartyError,
} from "@/lib/occupancy";
import { stayLengthError } from "@/lib/policy";
import {
  DEFAULT_RULES,
  describeRuleChanges,
  isWhitelistedOfficial,
  parseRuleGroup,
  ruleGroupError,
  type Rules,
} from "@/lib/settings";
import {
  capacityChangeBlockers,
  mealWindowBlockers,
  whitelistRemovalBlockers,
} from "@/lib/settings-impact";
import { addDaysToDateValue, instituteDate, toInstituteDateValue } from "@/lib/tz";
import { latestCheckIn } from "@/lib/workflow";
import { booking, GH, guest, profile, room } from "./helpers";

const withCapacity = (patch: Partial<Rules["capacity"]>): Rules => ({
  ...DEFAULT_RULES,
  capacity: { ...DEFAULT_RULES.capacity, ...patch },
});

describe("reading stored settings", () => {
  it("falls back to the defaults when nothing is stored", () => {
    expect(parseRuleGroup("capacity", null)).toEqual(DEFAULT_RULES.capacity);
    expect(parseRuleGroup("booking", undefined)).toEqual(DEFAULT_RULES.booking);
  });

  it("merges a partial row over the defaults (a field added later)", () => {
    const parsed = parseRuleGroup("booking", { advance_booking_months: 3 });
    expect(parsed).toEqual({ advance_booking_months: 3, max_stay_nights: 14, buffer_minutes: 240, no_show_release_hours: 0 });
  });

  it("ignores a malformed row rather than throwing", () => {
    expect(parseRuleGroup("capacity", { max_guests_per_room: "lots" })).toEqual(
      DEFAULT_RULES.capacity
    );
    expect(parseRuleGroup("meals", "not an object")).toEqual(DEFAULT_RULES.meals);
  });

  it("ignores keys it does not know", () => {
    const parsed = parseRuleGroup("booking", { max_stay_nights: 7, surprise: true });
    expect(parsed).toEqual({ advance_booking_months: 1, max_stay_nights: 7, buffer_minutes: 240, no_show_release_hours: 0 });
  });
});

describe("validating a proposed change", () => {
  it("accepts the defaults", () => {
    for (const group of ["capacity", "booking", "meals"] as const) {
      expect(ruleGroupError(group, DEFAULT_RULES[group])).toBeNull();
    }
  });

  it("refuses a room whose extra-bed maximum is below its beds", () => {
    const bad = structuredClone(DEFAULT_RULES.capacity);
    bad.room_types.single = { standard: 2, withExtraBed: 1 };
    expect(ruleGroupError("capacity", bad)).toMatch(/cannot be less than the beds/);
  });

  it("refuses a per-card limit no room type could ever hold", () => {
    expect(ruleGroupError("capacity", { ...DEFAULT_RULES.capacity, max_guests_per_room: 5 })).toMatch(
      /largest room type/
    );
  });

  it("refuses meals that overlap or run out of order", () => {
    const overlap = structuredClone(DEFAULT_RULES.meals);
    overlap.windows.lunch = { start: "09:00", end: "14:00" };
    expect(ruleGroupError("meals", overlap)).toMatch(/in that order/);
    const backwards = structuredClone(DEFAULT_RULES.meals);
    backwards.windows.dinner = { start: "21:00", end: "19:30" };
    expect(ruleGroupError("meals", backwards)).toMatch(/end after it starts/);
  });

  it("refuses an advance window of zero months", () => {
    expect(ruleGroupError("booking", { advance_booking_months: 0, max_stay_nights: 14, buffer_minutes: 240 })).toMatch(
      /at least 1/
    );
  });

  it("describes each change for the audit log", () => {
    const after = structuredClone(DEFAULT_RULES.booking);
    after.max_stay_nights = 7;
    expect(describeRuleChanges(DEFAULT_RULES.booking, after)).toEqual(["max_stay_nights: 14 → 7"]);
  });
});

describe("rule functions follow the settings", () => {
  it("per-room card limit", () => {
    expect(roomPartyError(4, 0)).toMatch(/at most 3 guests/);
    const rules = withCapacity({ max_guests_per_room: 4, room_types: {
      ...DEFAULT_RULES.capacity.room_types,
      double_sharing: { standard: 2, withExtraBed: 4 },
    } });
    expect(roomPartyError(4, 0, rules.capacity)).toBeNull();
    expect(roomOccupancyNotice(rules.capacity)).toBe(
      "Maximum 4 guests + 1 infant (below 5 years) per room."
    );
  });

  it("zero infants per room refuses any infant", () => {
    const capacity = { ...DEFAULT_RULES.capacity, max_infants_per_room: 0 };
    expect(roomPartyError(1, 1, capacity)).toMatch(/cannot be booked/);
    expect(roomOccupancyNotice(capacity)).toBe("Maximum 3 guests per room.");
  });

  it("room-type capacity at allocation", () => {
    const single = room({ room_type: "single" });
    expect(allocationCapacityError(2, [single])).toBeNull();
    const tight = structuredClone(DEFAULT_RULES.capacity);
    tight.room_types.single = { standard: 1, withExtraBed: 1 };
    expect(allocationCapacityError(2, [single], tight)).toMatch(/at most 1 guest/);
    expect(roomAssignmentError(2, single, "Room 1", tight)).toMatch(/sleeps at most 1/);
  });

  it("advance window in months", () => {
    const from = new Date("2026-01-31T06:30:00Z");
    expect(latestCheckIn("employee", from)?.toISOString().slice(0, 10)).toBe("2026-02-28");
    expect(latestCheckIn("employee", from, 3)?.toISOString().slice(0, 10)).toBe("2026-04-30");
    expect(latestCheckIn("official", from, 3)).toBeNull();
  });

  it("maximum stay, and 0 meaning no limit", () => {
    const inAt = instituteDate("2030-01-01T12:00");
    const outAt = instituteDate("2030-01-20T10:00");
    expect(stayLengthError(inAt, outAt, "employee")).toMatch(/maximum of 14 nights/);
    expect(stayLengthError(inAt, outAt, "employee", null, 30)).toBeNull();
    expect(stayLengthError(inAt, outAt, "employee", null, 0)).toBeNull();
    expect(stayLengthError(inAt, outAt, "official", null, 3)).toBeNull();
  });

  it("meal windows decide which meals a stay is offered", () => {
    const inAt = instituteDate("2030-01-01T12:00");
    const outAt = instituteDate("2030-01-02T10:00");
    const byDefault = stayMealDays(inAt, outAt);
    expect(byDefault[0].available).toEqual({ breakfast: false, lunch: true, dinner: true });
    // A kitchen that serves lunch from 11:00 to 11:45 closes before a noon arrival.
    const early = structuredClone(DEFAULT_RULES.meals.windows);
    early.lunch = { start: "11:00", end: "11:45" };
    expect(stayMealDays(inAt, outAt, early)[0].available.lunch).toBe(false);
    const plan = [{ date: "2030-01-01", breakfast: false, lunch: true, dinner: false }];
    expect(mealPlanError(plan, inAt, outAt)).toBeNull();
    expect(mealPlanError(plan, inAt, outAt, early)).toMatch(/Lunch .* before you check in/);
    expect(mealTimes(early).lunch).toBe("11:00 – 11:45 AM");
  });

  it("legacy whole-stay meals keep migration 8's windows", () => {
    // The pre-migration-8 object expands exactly as the SQL did, whatever the
    // kitchen's hours are now.
    const plan = normalizeMeals(
      { breakfast: true, lunch: true, dinner: false },
      { check_in: "2030-01-01T06:30:00.000Z", check_out: "2030-01-02T04:30:00.000Z" }
    );
    expect(plan).toEqual([
      { date: "2030-01-01", breakfast: false, lunch: true, dinner: false },
      { date: "2030-01-02", breakfast: true, lunch: false, dinner: false },
    ]);
  });
});

describe("the booking schema uses the settings on both sides", () => {
  const config = buildDefaultFormConfig("employee", [GH]);
  const checkInDate = addDaysToDateValue(toInstituteDateValue(new Date()), 3);
  const checkOutDate = addDaysToDateValue(checkInDate, 1);
  const payload = (guests: number) => ({
    guest_house_id: GH.id,
    service_type: "room",
    booking_type: "personal",
    debit_head: "personal_funds",
    purpose_of_visit: "Family visit",
    check_in: `${checkInDate}T12:00`,
    check_out: `${checkOutDate}T10:00`,
    rooms: [
      {
        room_type: null,
        guests: Array.from({ length: guests }, (_, i) => ({
          name: `Guest ${i + 1}`,
          age: 30,
          gender: "female",
          relationship: "Family",
          id_number: "1234 5678 9012",
          citizenship: "indian",
        })),
      },
    ],
  });

  it("four guests in one room are refused by default and allowed when the setting says so", () => {
    const strict = bookingPayloadSchema(config, { mealsAvailable: true });
    expect(strict.safeParse(payload(4)).success).toBe(false);
    const rules = withCapacity({
      max_guests_per_room: 4,
      room_types: { ...DEFAULT_RULES.capacity.room_types, double_sharing: { standard: 2, withExtraBed: 4 } },
    });
    const relaxed = bookingPayloadSchema(config, { mealsAvailable: true, rules });
    const first = relaxed.safeParse(payload(4));
    expect(first.success).toBe(true);
    // The form sends `parsed.data`; the server must accept it back.
    expect(relaxed.safeParse(first.success ? first.data : null).success).toBe(true);
  });

  it("a stay over the configured maximum is refused", () => {
    const rules: Rules = { ...DEFAULT_RULES, booking: { ...DEFAULT_RULES.booking, max_stay_nights: 0 } };
    const long = { ...payload(1), check_out: `${addDaysToDateValue(checkInDate, 20)}T10:00` };
    expect(bookingPayloadSchema(config, { mealsAvailable: true }).safeParse(long).success).toBe(false);
    expect(bookingPayloadSchema(config, { mealsAvailable: true, rules }).safeParse(long).success).toBe(true);
  });
});

describe("a change that would break stored data is refused", () => {
  const now = new Date("2029-12-15T00:00:00Z");

  it("lowering the per-card limit below a live booking's room", () => {
    const three = booking({}, [{ guests: [guest(), guest(), guest()] }]);
    const lower = { ...DEFAULT_RULES.capacity, max_guests_per_room: 2 };
    expect(capacityChangeBlockers(lower, [three], now)).toEqual([
      "REF-b-1: Room 1 has 3 guests (new limit 2)",
    ]);
    // A stay that is over is never re-judged.
    const past = booking({ check_out: "2029-01-01T00:00:00.000Z" }, [{ guests: [guest(), guest(), guest()] }]);
    expect(capacityChangeBlockers(lower, [past], now)).toEqual([]);
    // Nor is a rejected request.
    expect(capacityChangeBlockers(lower, [{ ...three, status: "REJECTED" }], now)).toEqual([]);
  });

  it("shrinking a room type below the party already allocated to it", () => {
    const single = room({ room_type: "single", room_number: "T-201" });
    const held = booking({ status: "APPROVED" }, [{ guests: [guest(), guest()], assigned: single }]);
    const tight = structuredClone(DEFAULT_RULES.capacity);
    tight.room_types.single = { standard: 1, withExtraBed: 1 };
    expect(capacityChangeBlockers(tight, [held], now)).toEqual([
      "REF-b-1: T-201 (single) holds 2 guests, more than the new maximum of 1",
    ]);
  });

  it("serving times that would leave booked meals outside the stay", () => {
    const withLunch = booking({
      check_in: "2030-01-01T06:30:00.000Z",
      check_out: "2030-01-02T04:30:00.000Z",
      meals: [{ date: "2030-01-01", breakfast: false, lunch: true, dinner: false }],
    });
    const early = structuredClone(DEFAULT_RULES.meals);
    early.windows.lunch = { start: "11:00", end: "11:45" };
    expect(mealWindowBlockers(early, [withLunch], now)).toHaveLength(1);
    expect(mealWindowBlockers(DEFAULT_RULES.meals, [withLunch], now)).toEqual([]);
  });

  it("removing the address of an Official account", () => {
    const official = profile({ role: "official", email: "Registrar@iitpkd.ac.in" });
    expect(whitelistRemovalBlockers("registrar@iitpkd.ac.in", [official])).toHaveLength(1);
    expect(whitelistRemovalBlockers("registrar@iitpkd.ac.in", [{ ...official, role: "employee" }])).toEqual([]);
  });

  it("whitelist matching ignores case", () => {
    expect(isWhitelistedOfficial("Admin@IITPKD.ac.in", ["admin@iitpkd.ac.in"])).toBe(true);
    expect(isWhitelistedOfficial("someone@iitpkd.ac.in", ["admin@iitpkd.ac.in"])).toBe(false);
  });
});
