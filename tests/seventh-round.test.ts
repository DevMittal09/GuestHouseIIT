import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  DEFAULT_DEBIT_RULES,
  DEBIT_RULES_REVISION,
  debitDetailsPrompt,
  debitDetailsRequired,
  debitHeadsByType,
  needsProject,
} from "@/lib/debit-heads";
import {
  bookingPayloadSchema,
  earliestBookableCheckIn,
  LATE_CHECK_IN_ERROR,
} from "@/lib/booking-schema";
import { buildDefaultFormConfig, sanitizeFormConfig } from "@/lib/form-config";
import {
  choicesFromMealSlots,
  DEFAULT_MEALS_ON,
  describeDietCounts,
  dietCountsError,
  kitchenHeadCount,
  mealCapacityError,
  mealDietCounts,
  mealPlatesBooked,
  mealSlot,
  mealSlotsFromChoices,
  NO_MEALS,
  normalizeDietCounts,
} from "@/lib/meals";
import { moveCheckInError } from "@/lib/operations";
import { DEFAULT_RULES } from "@/lib/settings";
import {
  addDaysToDateValue,
  formatDateValue,
  formatInstituteDate,
  formatInstituteDateTime,
  toInstituteDateValue,
} from "@/lib/tz";
import type { MockStore } from "@/lib/store/mock";
import type { NewBookingInput } from "@/lib/types";
import { booking, GH, useThrowawayMockDb } from "./helpers";

/**
 * The office's seventh list of corrections (1 Oct 2026).
 *
 * Each person's own meal preference instead of one for the party, the
 * kitchen's limit per sitting, lunch ticked by default, DD/MM/YYYY dates, a
 * check-in the desk can move **later** for a guest who arrives late, a
 * check-in that may be entered after the fact on the day itself, a typed
 * project, and Special Funds off a personal meal booking.
 */

// ------------------------------------------------- each person's preference

describe("each person's own meal preference", () => {
  it("adds up to the head count, or says so", () => {
    expect(dietCountsError({ veg: 5, non_veg: 3 }, 8)).toBeNull();
    expect(dietCountsError({ veg: 8, non_veg: 0 }, 8)).toBeNull();
    expect(dietCountsError({ veg: 0, non_veg: 0 }, 8)).toMatch(/how many/);
    expect(dietCountsError({ veg: 5, non_veg: 2 }, 8)).toMatch(/add up to 7.*8 people/);
    expect(dietCountsError({ veg: 1, non_veg: 1 }, 1)).toMatch(/1 person/);
  });

  it("cleans a stored or submitted split", () => {
    expect(normalizeDietCounts({ veg: 3, non_veg: 2 })).toEqual({ veg: 3, non_veg: 2 });
    expect(normalizeDietCounts({ veg: -1, non_veg: 2.7 })).toEqual({ veg: 0, non_veg: 2 });
    expect(normalizeDietCounts("nonsense")).toEqual({ veg: 0, non_veg: 0 });
    expect(normalizeDietCounts(null)).toEqual({ veg: 0, non_veg: 0 });
  });

  it("reads a booking made before the split by spreading its one answer", () => {
    // Nothing is backfilled by migration 27: a legacy row says only "veg",
    // and the honest reading of that is "all of them".
    expect(mealDietCounts({ meal_preference: "veg", meal_diet_counts: null }, 4)).toEqual({
      veg: 4,
      non_veg: 0,
    });
    expect(mealDietCounts({ meal_preference: "non_veg", meal_diet_counts: null }, 4)).toEqual({
      veg: 0,
      non_veg: 4,
    });
    // Its own split wins over the legacy answer.
    expect(
      mealDietCounts({ meal_preference: "veg", meal_diet_counts: { veg: 1, non_veg: 3 } }, 4)
    ).toEqual({ veg: 1, non_veg: 3 });
    // Neither: unknown, never guessed.
    expect(mealDietCounts({ meal_preference: null, meal_diet_counts: null }, 4)).toBeNull();
  });

  it("describes the split in words", () => {
    expect(describeDietCounts({ veg: 18, non_veg: 12 })).toBe("18 vegetarian, 12 non-vegetarian");
    expect(describeDietCounts({ veg: 4, non_veg: 0 })).toBe("4 vegetarian");
    expect(describeDietCounts({ veg: 0, non_veg: 0 })).toBe("No preference recorded");
  });

  it("gives the kitchen plates per kind, legacy rows included", () => {
    const day = "2030-03-05";
    const plan = [{ date: day, breakfast: false, lunch: true, dinner: false }];
    const split = booking({
      service_type: "meals_only",
      status: "APPROVED",
      meal_guest_count: 8,
      meal_diet_counts: { veg: 5, non_veg: 3 },
      meals: plan,
    }, []);
    const legacy = booking({
      service_type: "meals_only",
      status: "APPROVED",
      meal_guest_count: 4,
      meal_preference: "non_veg",
      meals: plan,
    }, []);
    const unknown = booking({
      service_type: "meals_only",
      status: "APPROVED",
      meal_guest_count: 2,
      meals: plan,
    }, []);
    expect(kitchenHeadCount([split, legacy, unknown], day, "lunch")).toEqual({
      veg: 5,
      non_veg: 7,
      unknown: 2,
      total: 14,
    });
    // A split that no longer adds up (the desk changed the head count after)
    // must not lose plates — the remainder is still people to feed.
    const stale = booking({
      service_type: "meals_only",
      status: "APPROVED",
      meal_guest_count: 10,
      meal_diet_counts: { veg: 2, non_veg: 2 },
      meals: plan,
    }, []);
    expect(kitchenHeadCount([stale], day, "lunch")).toEqual({
      veg: 2,
      non_veg: 2,
      unknown: 6,
      total: 10,
    });
  });
});

// ------------------------------------------------- the kitchen's limit

describe("the kitchen's limit per sitting", () => {
  const day = "2030-04-10";
  const plan = [{ date: day, breakfast: false, lunch: true, dinner: true }];

  it("is 30 by default, and a Setting", () => {
    expect(DEFAULT_RULES.meals.max_diners_per_meal).toBe(30);
  });

  it("counts everyone already booked for that meal, per meal", () => {
    expect(mealCapacityError(plan, 10, () => 0, 30)).toBeNull();
    expect(mealCapacityError(plan, 10, () => 20, 30)).toBeNull();
    expect(mealCapacityError(plan, 11, () => 20, 30)).toMatch(/Lunch.*only 10 places are left/);
    expect(mealCapacityError(plan, 1, () => 30, 30)).toMatch(/no places left/);
    // Per meal, not per day: a full lunch does not close dinner.
    const onlyLunchFull = (_date: string, meal: string) => (meal === "lunch" ? 30 : 0);
    expect(mealCapacityError(plan, 5, onlyLunchFull, 30)).toMatch(/Lunch/);
    expect(
      mealCapacityError([{ date: day, breakfast: false, lunch: false, dinner: true }], 5, onlyLunchFull, 30)
    ).toBeNull();
    // 0 turns it off.
    expect(mealCapacityError(plan, 500, () => 500, 0)).toBeNull();
  });

  it("names the day in DD/MM/YYYY", () => {
    expect(mealCapacityError(plan, 31, () => 0, 30)).toContain("10/04/2030");
  });

  it("counts live bookings and releases rejected and cancelled ones", () => {
    const of = (status: string, people: number) =>
      booking({ service_type: "meals_only", status: status as never, meal_guest_count: people, meals: plan }, []);
    const all = [
      of("APPROVED", 4),
      of("PENDING_GH_MANAGER", 3), // still waiting: it holds its places
      of("OCCUPIED", 2),
      of("REJECTED", 100),
      of("CANCELLED", 100),
      of("CANCELLATION_APPROVED", 100),
    ];
    expect(mealPlatesBooked(all, day, "lunch")).toBe(9);
    // A booking being re-checked does not count itself.
    expect(mealPlatesBooked(all.map((b, i) => ({ ...b, id: `b-${i}` })), day, "lunch", "b-0")).toBe(5);
    // A different day is not this sitting.
    expect(mealPlatesBooked(all, "2030-04-11", "lunch")).toBe(0);
  });

  it("caps one booking's head count at the limit, on both sides", () => {
    const houses = [GH];
    const config = sanitizeFormConfig(buildDefaultFormConfig("employee", houses), houses);
    const schema = bookingPayloadSchema(config, { mealsAvailable: true, rules: DEFAULT_RULES });
    const today = toInstituteDateValue(new Date());
    const dining = (people: number) => ({
      guest_house_id: GH.id,
      service_type: "meals_only",
      booking_type: "official",
      debit_head: "department_budget",
      purpose_of_visit: "",
      check_in: `${today}T00:00`,
      check_out: `${addDaysToDateValue(today, 1)}T23:59`,
      rooms: [],
      meal_guest_count: String(people),
      meal_diet_counts: { veg: people, non_veg: 0 },
      meals: [{ date: addDaysToDateValue(today, 1), breakfast: false, lunch: true, dinner: false }],
      privacy_consent: true,
    });
    expect(schema.safeParse(dining(30)).success).toBe(true);
    const over = schema.safeParse(dining(31));
    expect(over.success).toBe(false);
    expect(!over.success && JSON.stringify(over.error.issues)).toContain("30 people at a sitting");
  });
});

// ------------------------------------------------- lunch by default

describe("lunch is ticked by default", () => {
  it("is the only meal on by default", () => {
    expect(DEFAULT_MEALS_ON).toEqual({ breakfast: false, lunch: true, dinner: false });
  });

  it("is not applied to a stay, where meals are an extra that is charged", () => {
    const days = [{ date: "2030-05-01", available: { breakfast: true, lunch: true, dinner: true } }];
    // A room booking passes NO_MEALS: nothing is ticked until the requester
    // ticks it, so no stay picks up dining charges nobody asked for.
    expect([...mealSlotsFromChoices(days, new Map(), NO_MEALS)]).toEqual([]);
    expect([...mealSlotsFromChoices(days, new Map(), DEFAULT_MEALS_ON)]).toEqual(["2030-05-01|lunch"]);
  });

  it("ticks lunch on a day nobody has decided about, and keeps every decision", () => {
    const days = [
      { date: "2030-05-01", available: { breakfast: true, lunch: true, dinner: true } },
      { date: "2030-05-02", available: { breakfast: true, lunch: true, dinner: true } },
    ];
    expect([...mealSlotsFromChoices(days, new Map())].sort()).toEqual([
      "2030-05-01|lunch",
      "2030-05-02|lunch",
    ]);
    // Turning breakfast on and lunch off on the first day is remembered; the
    // second day, which nobody has touched, still arrives with lunch.
    const choices = choicesFromMealSlots(
      [days[0]],
      new Set(["2030-05-01|breakfast"]),
      new Map()
    );
    expect([...mealSlotsFromChoices(days, choices)].sort()).toEqual([
      "2030-05-01|breakfast",
      "2030-05-02|lunch",
    ]);
    // A meal the stay does not cover is never ticked, whatever was decided —
    // and a decision about lunch does not leak into dinner, which is off by
    // default. A day whose lunch is closed therefore arrives with nothing.
    const closed = [{ date: "2030-05-03", available: { breakfast: false, lunch: false, dinner: true } }];
    expect([...mealSlotsFromChoices(closed, new Map([[mealSlot("2030-05-03", "lunch"), true]]))]).toEqual([]);
    expect([
      ...mealSlotsFromChoices(closed, new Map([[mealSlot("2030-05-03", "dinner"), true]])),
    ]).toEqual(["2030-05-03|dinner"]);
  });
});

// ------------------------------------------------- DD/MM/YYYY

describe("dates read DD/MM/YYYY", () => {
  it("renders an instant day-first", () => {
    const at = "2026-09-10T06:30:00.000Z"; // noon IST
    expect(formatInstituteDate(at)).toBe("10/09/2026");
    expect(formatInstituteDateTime(at)).toBe("10/09/2026, 12:00 PM");
  });

  it("renders a calendar date day-first, with its options intact", () => {
    expect(formatDateValue("2026-09-15")).toBe("Tue 15/09");
    expect(formatDateValue("2026-09-15", { year: true })).toBe("Tue 15/09/2026");
    expect(formatDateValue("2026-09-15", { weekday: false, year: true })).toBe("15/09/2026");
    // Month dropped: the bare day number, for a calendar cell that already
    // says which month it is in.
    expect(formatDateValue("2026-09-15", { month: false })).toBe("Tue 15");
    expect(formatDateValue("not a date")).toBe("not a date");
  });
});

// ------------------------------------------------- a late check-in

describe("a late check-in", () => {
  it("lets the desk move a check-in later as well as earlier", () => {
    const b = booking({ status: "APPROVED" });
    const later = new Date(Date.parse(b.check_in) + 26 * 3_600_000).toISOString();
    expect(moveCheckInError(b, later)).toBeNull();
  });

  it("accepts a check-in earlier today, and still refuses yesterday", () => {
    const houses = [GH];
    const config = sanitizeFormConfig(buildDefaultFormConfig("employee", houses), houses);
    const schema = bookingPayloadSchema(config, { mealsAvailable: false, rules: DEFAULT_RULES });
    const today = toInstituteDateValue(new Date());
    const stay = (checkInDate: string, time: string) => ({
      guest_house_id: GH.id,
      service_type: "room",
      booking_type: "official",
      debit_head: "department_budget",
      purpose_of_visit: "A guest who arrived late",
      check_in: `${checkInDate}T${time}`,
      check_out: `${addDaysToDateValue(today, 2)}T10:00`,
      rooms: [
        {
          room_type: null,
          guests: [{ name: "Guest", age: "40", gender: "male", citizenship: "indian" }],
        },
      ],
      meals: [],
      privacy_consent: true,
    });
    // 00:01 today is in the past for all but one minute of the day, and is
    // exactly the entry the desk has to make for a guest already at the desk.
    expect(schema.safeParse(stay(today, "00:01")).success).toBe(true);
    const yesterday = schema.safeParse(stay(addDaysToDateValue(today, -1), "12:00"));
    expect(yesterday.success).toBe(false);
    expect(!yesterday.success && JSON.stringify(yesterday.error.issues)).toContain(
      LATE_CHECK_IN_ERROR
    );
  });

  it("measures 'today' in institute time", () => {
    const at = new Date("2026-09-10T06:30:00.000Z");
    // Institute midnight of 10 Sep is 18:30Z on the 9th.
    expect(earliestBookableCheckIn(at).toISOString()).toBe("2026-09-09T18:30:00.000Z");
  });
});

// ------------------------------------------------- the typed project

describe("a project is typed, not picked", () => {
  it("asks for the number and title beside the head, and requires it", () => {
    expect(needsProject("project_grant")).toBe(true);
    expect(debitDetailsPrompt("project_grant")).toMatch(/Project number/);
    expect(debitDetailsRequired("project_grant")).toBe(true);
    // Special Funds still asks which fund, and still optionally.
    expect(debitDetailsPrompt("special_budget")).toMatch(/special fund/i);
    expect(debitDetailsRequired("special_budget")).toBe(false);
  });

  it("refuses a Project booking with nothing typed, and takes one with it", () => {
    const houses = [GH];
    const config = sanitizeFormConfig(buildDefaultFormConfig("employee", houses), houses);
    const heads = { room: { official: ["project_grant" as const] }, dining: {} };
    const schema = bookingPayloadSchema(config, {
      mealsAvailable: false,
      debitHeads: heads,
      rules: DEFAULT_RULES,
    });
    const today = toInstituteDateValue(new Date());
    const payload = (patch: Record<string, unknown>) => ({
      guest_house_id: GH.id,
      service_type: "room",
      booking_type: "official",
      debit_head: "project_grant",
      purpose_of_visit: "A collaborator's visit",
      check_in: `${addDaysToDateValue(today, 1)}T12:00`,
      check_out: `${addDaysToDateValue(today, 2)}T10:00`,
      rooms: [
        {
          room_type: null,
          guests: [{ name: "Guest", age: "40", gender: "male", citizenship: "indian" }],
        },
      ],
      meals: [],
      privacy_consent: true,
      ...patch,
    });
    const bare = schema.safeParse(payload({}));
    expect(bare.success).toBe(false);
    expect(!bare.success && JSON.stringify(bare.error.issues)).toContain("Project number and title");
    const typed = schema.safeParse(payload({ debit_details: "SP/2025/017 — Grid-scale storage" }));
    if (!typed.success) throw new Error(JSON.stringify(typed.error.issues));
    expect(typed.data.debit_details).toBe("SP/2025/017 — Grid-scale storage");
  });
});

// ------------------------------------------------- personal dining

describe("Special Funds on a personal meal booking", () => {
  it("is gone, and the revision says so", () => {
    expect(DEBIT_RULES_REVISION).toBe(4);
    expect(DEFAULT_DEBIT_RULES.dining.personal).toEqual(["personal_funds"]);
    const heads = debitHeadsByType(
      "employee",
      ["personal"],
      { staff_category: "faculty", unit_id: null },
      [],
      DEFAULT_DEBIT_RULES,
      "dining"
    );
    expect(heads.personal).toEqual(["personal_funds"]);
  });
});

// ------------------------------------------------- Copy to, on every mail

/**
 * Copy to (the addresses typed on New Booking) is CC on **every** mail the
 * requester gets about that booking — not only the acknowledgement. The
 * office reported it as not working; what the outbox holds is what the
 * transport sends, so this is where the rule is checked.
 */
describe("Copy to reaches every mail the requester gets", () => {
  let store: MockStore;
  let notify: typeof import("@/lib/mail/notify");
  let db: ReturnType<typeof useThrowawayMockDb>;
  const COPY_TO = ["sec_arts@iitpkd.ac.in", "guest@example.org"];

  beforeAll(async () => {
    process.env.MAIL_DRY_RUN = "true";
    // The redirect swallows CC by design, so a test of CC has to run without
    // it — which is also the fix for the office's report: a deployment with
    // MAIL_REDIRECT_ALL_TO set delivers nothing to a Copy-to address.
    delete process.env.MAIL_REDIRECT_ALL_TO;
    db = useThrowawayMockDb();
    store = new (await import("@/lib/store/mock")).MockStore();
    notify = await import("@/lib/mail/notify");
  });
  afterAll(() => db.cleanup());

  function input(patch: Partial<NewBookingInput> = {}): NewBookingInput {
    return {
      user_id: "employee-priya",
      guest_house_id: "gh-bageshri",
      user_role: "employee",
      status: "PENDING_GH_MANAGER",
      purpose_of_visit: "Test visit",
      check_in: "2031-02-10T06:30:00.000Z",
      check_out: "2031-02-11T04:30:00.000Z",
      booking_type: "official",
      service_type: "room",
      debit_head: "department_budget",
      debit_details: null,
      debit_document_url: null,
      meal_preference: null,
      meal_diet_counts: null,
      meal_guest_count: null,
      pets_policy_acknowledged: true,
      alumni_name: null,
      alumni_roll_number: null,
      alumni_id_url: null,
      custom_fields: null,
      meals: [],
      copy_to_emails: COPY_TO,
      rooms: [
        {
          room_type: null,
          guests: [
            {
              name: "G",
              age: 40,
              gender: "female",
              relationship: null,
              id_number: null,
              id_document_url: null,
              is_infant: false,
              citizenship: "indian",
              nationality: null,
              passport_number: null,
            },
          ],
        },
      ],
      submission_remarks: null,
      created_by: null,
      on_behalf_of_name: null,
      on_behalf_of_email: null,
      on_behalf_of_phone: null,
      ...patch,
    };
  }

  it("copies the submission, the allocation, the rejection and the cancellation", async () => {
    const manager = (await store.listProfiles()).find((p) => p.role === "gh_manager")!;
    const created = await store.createBooking(input());
    await notify.notifyBookingSubmitted(created.id);

    const rooms = await store.listRooms("gh-bageshri");
    await store.updateBookingStatus(
      created.id,
      { status: "APPROVED", assigned_room_ids: [rooms[0].id] },
      {
        action_by: manager.id,
        action_by_name: manager.full_name,
        new_status: "APPROVED",
        remarks: "allocated",
      }
    );
    await notify.notifyRoomsAllocated(created.id, manager);

    await store.updateBookingStatus(
      created.id,
      { status: "CANCELLED" },
      { action_by: manager.id, action_by_name: manager.full_name, new_status: "CANCELLED", remarks: "x" }
    );
    await notify.notifyCancelled(created.id, manager, "The visit was called off", { heldRooms: true });

    const rejected = await store.createBooking(input());
    await store.updateBookingStatus(
      rejected.id,
      { status: "REJECTED", rejection_reason: "No rooms" },
      { action_by: manager.id, action_by_name: manager.full_name, new_status: "REJECTED", remarks: "x" }
    );
    await notify.notifyRejected(rejected.id, manager, "No rooms");

    const rows = await store.listEmails({ limit: 100 });
    const toRequester = rows.filter((r) => r.event_key.endsWith(".requester"));
    // Every kind of requester mail this round touches was queued…
    expect(new Set(toRequester.map((r) => r.event_key))).toEqual(
      new Set([
        "booking.submitted.requester",
        "booking.allocated.requester",
        "booking.cancelled.requester",
        "booking.rejected.requester",
      ])
    );
    // …and each one carries the whole Copy-to list, nobody else's mail does.
    for (const row of toRequester) {
      expect(row.to_emails).toEqual(["priya@iitpkd.ac.in"]);
      expect(row.cc_emails.map((a) => a.toLowerCase())).toEqual(COPY_TO);
    }
  });
});

// ------------------------------------------------- the stored split

describe("the store keeps each person's split", () => {
  let store: MockStore;
  let db: ReturnType<typeof useThrowawayMockDb>;

  beforeAll(async () => {
    db = useThrowawayMockDb();
    store = new (await import("@/lib/store/mock")).MockStore();
  });
  afterAll(() => db.cleanup());

  it("round-trips meal_diet_counts on a dining booking", async () => {
    const created = await store.createBooking({
      user_id: "employee-priya",
      guest_house_id: "gh-hamsanandi",
      user_role: "employee",
      status: "PENDING_GH_MANAGER",
      purpose_of_visit: "",
      check_in: "2031-03-10T00:00:00.000Z",
      check_out: "2031-03-10T23:59:00.000Z",
      booking_type: "official",
      service_type: "meals_only",
      debit_head: "department_budget",
      debit_details: null,
      debit_document_url: null,
      meal_preference: null,
      meal_diet_counts: { veg: 7, non_veg: 5 },
      meal_guest_count: 12,
      pets_policy_acknowledged: true,
      alumni_name: null,
      alumni_roll_number: null,
      alumni_id_url: null,
      custom_fields: null,
      meals: [{ date: "2031-03-10", breakfast: false, lunch: true, dinner: false }],
      rooms: [],
      submission_remarks: null,
      created_by: null,
      on_behalf_of_name: null,
      on_behalf_of_email: null,
      on_behalf_of_phone: null,
    });
    const read = await store.getBooking(created.id);
    expect(read?.meal_diet_counts).toEqual({ veg: 7, non_veg: 5 });
    expect(read?.meal_guest_count).toBe(12);
    // Remarks are optional on a dining booking, so the column may be empty.
    expect(read?.purpose_of_visit).toBe("");
    expect(mealDietCounts(read!, 12)).toEqual({ veg: 7, non_veg: 5 });
  });
});

// ------------------------------------------------- remarks vs purpose

describe("Remarks on a dining booking, Purpose on a stay", () => {
  const houses = [GH];
  const config = sanitizeFormConfig(buildDefaultFormConfig("employee", houses), houses);
  const schema = bookingPayloadSchema(config, { mealsAvailable: true, rules: DEFAULT_RULES });
  const today = toInstituteDateValue(new Date());

  const dining = (purpose: string) => ({
    guest_house_id: GH.id,
    service_type: "meals_only",
    booking_type: "official",
    debit_head: "department_budget",
    purpose_of_visit: purpose,
    check_in: `${addDaysToDateValue(today, 1)}T00:00`,
    check_out: `${addDaysToDateValue(today, 1)}T23:59`,
    rooms: [],
    meal_guest_count: "4",
    meal_diet_counts: { veg: 4, non_veg: 0 },
    meals: [{ date: addDaysToDateValue(today, 1), breakfast: false, lunch: true, dinner: false }],
    privacy_consent: true,
  });

  const stay = (purpose: string) => ({
    guest_house_id: GH.id,
    service_type: "room",
    booking_type: "official",
    debit_head: "department_budget",
    purpose_of_visit: purpose,
    check_in: `${addDaysToDateValue(today, 1)}T12:00`,
    check_out: `${addDaysToDateValue(today, 2)}T10:00`,
    rooms: [
      { room_type: null, guests: [{ name: "Guest", age: "40", gender: "male", citizenship: "indian" }] },
    ],
    meals: [],
    privacy_consent: true,
  });

  it("takes a meal booking with nothing typed, and keeps what is typed", () => {
    expect(schema.safeParse(dining("")).success).toBe(true);
    const typed = schema.safeParse(dining("  One guest cannot eat wheat  "));
    expect(typed.success && typed.data.purpose_of_visit).toBe("One guest cannot eat wheat");
  });

  it("still makes a stay say what it is for", () => {
    const blank = schema.safeParse(stay(""));
    expect(blank.success).toBe(false);
    expect(!blank.success && JSON.stringify(blank.error.issues)).toContain(
      "Describe the purpose of the visit"
    );
    expect(schema.safeParse(stay("Collaborator's visit")).success).toBe(true);
  });
});
