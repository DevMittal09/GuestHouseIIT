import { describe, expect, it } from "vitest";
import {
  availabilityCounts,
  rangeBetween,
  type AvailabilityRange,
} from "@/lib/availability";
import { bookingPayloadSchema } from "@/lib/booking-schema";
import {
  asksForDebitHead,
  DEBIT_RULES_REVISION,
  DEFAULT_DEBIT_RULES,
  debitHeadFor,
  debitHeadsByType,
  FORBIDDEN_DEBIT_HEADS,
  isHeadAllowedFor,
  PERSONAL_DEBIT_HEAD,
  upgradeDebitRules,
} from "@/lib/debit-heads";
import { buildDefaultFormConfig, sanitizeFormConfig } from "@/lib/form-config";
import { projectFromDetails } from "@/lib/invoice";
import {
  guestHousePolicyError,
  guestHousesForBookingType,
  mealsAllowedFor,
  mealsPolicyError,
  restrictedToOneGuestHouse,
} from "@/lib/policy";
import { DEFAULT_RULES, INVOICE_RULES_REVISION, parseRuleGroup, upgradeInvoiceRules } from "@/lib/settings";
import { SITE_LINKS } from "@/lib/site";
import { tariffPreviewLines, tariffPreviews, type Tariff } from "@/lib/tariffs";
import { addDaysToDateValue, toInstituteDateValue } from "@/lib/tz";
import type { GuestHouse, Role, RoomOccupancySegment } from "@/lib/types";
import { GH, room } from "./helpers";

/**
 * The office's eighth list of corrections (7 Oct 2026), phase 1: the text
 * cleanup, the booking form and what a requester is told about availability.
 *
 * Phase 2 (the academic records table), phase 3 (invoices and payments) and
 * phase 4 (missed requests) have test files of their own.
 */

// ------------------------------------------------------------------ dashes

describe("em dashes are gone from the code", () => {
  /**
   * The office asked for every em dash to become a plain hyphen. Enforced
   * here rather than only done once, because the next round of copy would
   * otherwise reintroduce them one message at a time.
   */
  it("is not in any message the portal renders", () => {
    const messages = [
      ...Object.values(DEFAULT_RULES.invoice.contact),
      ...SITE_LINKS.map((l) => l.label),
      mealsPolicyError("alumni") ?? "",
      mealsPolicyError("personal", "student") ?? "",
      guestHousePolicyError("alumni", { ...GH, name: "Hamsanandi" }, [
        { ...GH, id: "gh-b", name: "Bageshri" },
      ]) ?? "",
      guestHousePolicyError("personal", { ...GH, name: "Hamsanandi" }, [
        { ...GH, id: "gh-b", name: "Bageshri" },
      ], "student") ?? "",
    ];
    for (const message of messages) {
      expect(message).not.toContain("—");
    }
  });

  /**
   * A project is stored as "number - title". Bookings made before this round
   * hold an em dash there, so the reader has to take both or a past stay's
   * whole entry prints as the project number with no title.
   */
  it("still splits a project stored with the old em dash", () => {
    expect(projectFromDetails("SP/2025/017 — Grid-scale storage (Dr. A)")).toEqual({
      number: "SP/2025/017",
      title: "Grid-scale storage (Dr. A)",
    });
    expect(projectFromDetails("SP/2025/017 - Grid-scale storage (Dr. A)")).toEqual({
      number: "SP/2025/017",
      title: "Grid-scale storage (Dr. A)",
    });
    // A hyphen inside the number is not the separator: the em dash wins when
    // both are present, and a lone number keeps its whole text.
    expect(projectFromDetails("SP-2025-017 — Storage")).toEqual({
      number: "SP-2025-017",
      title: "Storage",
    });
    expect(projectFromDetails("SP/2025/017")).toEqual({ number: "SP/2025/017", title: "" });
    expect(projectFromDetails(null)).toBeNull();
  });
});

// ----------------------------------------------------------------- Keralam

describe("the state is Keralam", () => {
  it("is the default invoice address", () => {
    expect(DEFAULT_RULES.invoice.contact.address).toContain("Keralam");
    expect(DEFAULT_RULES.invoice.contact.address).not.toMatch(/\bKerala\b/);
  });

  it("renames a saved row once, and never turns Keralam into Keralamm", () => {
    const saved = { ...DEFAULT_RULES.invoice, revision: 2, contact: { ...DEFAULT_RULES.invoice.contact, address: "Kanjikode West, Palakkad, Kerala" } };
    const read = parseRuleGroup("invoice", saved);
    expect(read.contact.address).toBe("Kanjikode West, Palakkad, Keralam");
    expect(read.revision).toBe(INVOICE_RULES_REVISION);
    // Read again: the revision gate means the office's own words are never
    // rewritten twice.
    expect(parseRuleGroup("invoice", read).contact.address).toBe(
      "Kanjikode West, Palakkad, Keralam"
    );
    // The whole word only - "Keralam" contains "Kerala".
    const already = upgradeInvoiceRules({ revision: 2, contact: { address: "Palakkad, Keralam" } });
    expect((already.contact as { address: string }).address).toBe("Palakkad, Keralam");
    // A row with no contact of its own keeps the default rather than being
    // given `contact: undefined`, which would fail the schema.
    expect(parseRuleGroup("invoice", { accounts_email: "a@b.c" }).contact.address).toContain(
      "Keralam"
    );
  });
});

// -------------------------------------------------------------------- MRBS

describe("the meeting room booking system is off the site", () => {
  it("is in none of the footer links", () => {
    for (const link of SITE_LINKS) {
      expect(link.href).not.toContain("mrbs");
      expect(link.label).not.toMatch(/MRBS/i);
    }
  });
});

// ------------------------------------------------- no head on a personal booking

describe("a personal booking is not asked which budget pays", () => {
  const priya = { staff_category: "faculty" as const, unit_id: null };
  const houses = [GH];

  it("asks on an official booking and not on a personal one", () => {
    expect(asksForDebitHead("official")).toBe(true);
    expect(asksForDebitHead("alumni")).toBe(true);
    expect(asksForDebitHead("personal")).toBe(false);
    // Whatever arrived, a personal booking is Personal Funds.
    expect(debitHeadFor("personal", null)).toBe(PERSONAL_DEBIT_HEAD);
    expect(debitHeadFor("personal", "department_budget")).toBe(PERSONAL_DEBIT_HEAD);
    expect(debitHeadFor("official", "department_budget")).toBe("department_budget");
    expect(debitHeadFor("official", null)).toBeNull();
  });

  it("has only Personal Funds left to offer, for rooms as well as meals", () => {
    for (const kind of ["room", "dining"] as const) {
      expect(DEFAULT_DEBIT_RULES[kind].personal).toEqual(["personal_funds"]);
      expect(DEFAULT_DEBIT_RULES[kind].student).toEqual(["personal_funds"]);
    }
    expect(FORBIDDEN_DEBIT_HEADS.personal).toContain("special_budget");
    expect(isHeadAllowedFor("personal", "special_budget")).toBe(false);
    expect(isHeadAllowedFor("personal", "special_budget", "dining")).toBe(false);
    // A stored Settings row that still ticks it is ignored on read, not fatal.
    const forced = {
      ...DEFAULT_DEBIT_RULES,
      room: { ...DEFAULT_DEBIT_RULES.room, personal: ["personal_funds" as const, "special_budget" as const] },
    };
    expect(debitHeadsByType("employee", ["personal"], priya, [], forced).personal).toEqual([
      "personal_funds",
    ]);
  });

  it("withdraws Special Funds from a saved row, and revision 6 reseats the lists", () => {
    // Revision 5 (7 Oct) took Special Funds off every personal list;
    // revision 6 (8 Oct) replaced both lists with the office's own mapping,
    // which also gives a personal booking Personal Funds and nothing else.
    expect(DEBIT_RULES_REVISION).toBe(6);
    const rev4 = {
      revision: 4,
      room: { ...DEFAULT_DEBIT_RULES.room, personal: ["personal_funds", "special_budget"] },
      dining: DEFAULT_DEBIT_RULES.dining,
    };
    const upgraded = upgradeDebitRules(rev4) as typeof DEFAULT_DEBIT_RULES;
    expect(upgraded.room.personal).toEqual(["personal_funds"]);
    expect(upgraded.revision).toBe(DEBIT_RULES_REVISION);
    // A row already on the current revision is left alone for good.
    const own = { revision: DEBIT_RULES_REVISION, room: { personal: ["personal_funds"] } };
    expect(upgradeDebitRules(own)).toEqual(own);
  });

  it("accepts a personal payload that names no head, and records Personal Funds", () => {
    const config = sanitizeFormConfig(buildDefaultFormConfig("employee", houses), houses);
    const schema = bookingPayloadSchema(config, {
      mealsAvailable: false,
      debitHeads: { room: { personal: ["personal_funds"] }, dining: {} },
      rules: DEFAULT_RULES,
    });
    const today = toInstituteDateValue(new Date());
    const base = {
      guest_house_id: GH.id,
      service_type: "room",
      booking_type: "personal",
      purpose_of_visit: "My parents are visiting",
      check_in: `${addDaysToDateValue(today, 1)}T12:00`,
      check_out: `${addDaysToDateValue(today, 2)}T10:00`,
      rooms: [
        {
          room_type: null,
          guests: [{ name: "Mother", age: "60", gender: "female", citizenship: "indian" }],
        },
      ],
      meals: [],
      privacy_consent: true,
    };
    const bare = schema.safeParse(base);
    if (!bare.success) throw new Error(JSON.stringify(bare.error.issues));
    expect(bare.data.debit_head).toBe("personal_funds");

    // A crafted payload naming a department is overwritten, not believed.
    const crafted = schema.safeParse({ ...base, debit_head: "department_budget" });
    if (!crafted.success) throw new Error(JSON.stringify(crafted.error.issues));
    expect(crafted.data.debit_head).toBe("personal_funds");

    // And the schema still accepts its own output - the form sends
    // `parsed.data` and the server re-parses it.
    const again = schema.safeParse(bare.data);
    expect(again.success).toBe(true);

    // An official booking is still asked.
    const official = bookingPayloadSchema(config, {
      mealsAvailable: false,
      debitHeads: { room: { official: ["department_budget"] }, dining: {} },
      rules: DEFAULT_RULES,
    }).safeParse({ ...base, booking_type: "official" });
    expect(official.success).toBe(false);
    expect(!official.success && JSON.stringify(official.error.issues)).toContain("debitable head");
  });
});

// ------------------------------------- students and alumni: one house, no meals

describe("students and alumni get one guest house and no meals", () => {
  const bageshri: GuestHouse = { id: "gh-b", name: "Bageshri", total_rooms: 10, serves_meals: false };
  const hamsanandi: GuestHouse = { id: "gh-h", name: "Hamsanandi", total_rooms: 13, serves_meals: true };
  const houses = [hamsanandi, bageshri];

  it("narrows the guest house for a student and for an alumnus", () => {
    expect(restrictedToOneGuestHouse("personal", "student")).toBe(true);
    expect(restrictedToOneGuestHouse("alumni", "iar_cell")).toBe(true);
    expect(restrictedToOneGuestHouse("official", "employee")).toBe(false);
    expect(guestHousesForBookingType(houses, "personal", "student")).toEqual([bageshri]);
    expect(guestHousesForBookingType(houses, "alumni", "iar_student_cell")).toEqual([bageshri]);
    expect(guestHousesForBookingType(houses, "personal", "employee")).toEqual(houses);
    // Renamed out of existence: the rule cannot be applied, so the full list
    // stands rather than leaving an empty dropdown.
    expect(guestHousesForBookingType([hamsanandi], "personal", "student")).toEqual([hamsanandi]);
  });

  it("refuses the other guest house on the server, with its own message", () => {
    expect(guestHousePolicyError("personal", bageshri, houses, "student")).toBeNull();
    expect(guestHousePolicyError("personal", hamsanandi, houses, "student")).toMatch(/student/i);
    expect(guestHousePolicyError("alumni", hamsanandi, houses, "iar_cell")).toMatch(/alumnus/i);
    expect(guestHousePolicyError("official", hamsanandi, houses, "employee")).toBeNull();
    // Unchanged for everyone else, with or without the new argument.
    expect(guestHousePolicyError("personal", hamsanandi, houses)).toBeNull();
  });

  it("refuses meals for either, and allows them for everyone else", () => {
    expect(mealsAllowedFor("personal", "student")).toBe(false);
    expect(mealsAllowedFor("alumni", "iar_cell")).toBe(false);
    expect(mealsAllowedFor("official", "employee")).toBe(true);
    expect(mealsPolicyError("personal", "student")).toMatch(/student/i);
    expect(mealsPolicyError("alumni", "iar_student_cell")).toMatch(/alumnus/i);
    expect(mealsPolicyError("official", "employee")).toBeNull();
  });
});

// ------------------------------------------------------- the rates on the form

describe("the booking form's rate table", () => {
  const today = "2026-10-07";
  const tariff = (patch: Partial<Tariff>): Tariff => ({
    id: patch.id ?? Math.random().toString(36).slice(2),
    guest_house_id: null,
    item: "room",
    room_type: null,
    booking_type: null,
    requester_role: null,
    rate: 1000,
    effective_from: "2026-01-01",
    note: null,
    created_at: "2026-01-01T00:00:00.000Z",
    created_by: null,
    ...patch,
  });

  it("quotes the rate the invoice would resolve, and says when there is none", () => {
    const tariffs = [
      tariff({ id: "general", guest_house_id: GH.id, item: "room", rate: 2000 }),
      // More specific and later: a student's room at this house.
      tariff({
        id: "student",
        guest_house_id: GH.id,
        item: "room",
        requester_role: "student",
        rate: 500,
        effective_from: "2026-06-01",
      }),
      tariff({ id: "lunch", guest_house_id: GH.id, item: "lunch", rate: 120 }),
    ];
    const forStudent = tariffPreviewLines(tariffs, {
      guestHouseId: GH.id,
      bookingType: "personal",
      role: "student",
      roomType: "double_sharing",
      servesMeals: true,
      date: today,
    });
    expect(forStudent.find((l) => l.item === "room")?.rate).toBe(500);
    expect(forStudent.find((l) => l.item === "lunch")?.rate).toBe(120);
    // No extra-bed rate is set up: reported as such, not as zero.
    expect(forStudent.find((l) => l.item === "extra_bed")?.rate).toBeNull();

    const forFaculty = tariffPreviewLines(tariffs, {
      guestHouseId: GH.id,
      bookingType: "official",
      role: "employee",
      roomType: "double_sharing",
      servesMeals: true,
      date: today,
    });
    expect(forFaculty.find((l) => l.item === "room")?.rate).toBe(2000);
  });

  it("leaves the meals out where the kitchen does not serve them", () => {
    const lines = tariffPreviewLines([], {
      guestHouseId: "gh-b",
      bookingType: "personal",
      role: "student",
      roomType: "double_sharing",
      servesMeals: false,
      date: today,
    });
    expect(lines.map((l) => l.item)).toEqual(["room", "extra_bed"]);
  });

  it("builds one preview per guest house and booking type", () => {
    const houses = [
      { id: "gh-a", serves_meals: true },
      { id: "gh-b", serves_meals: false },
    ];
    const previews = tariffPreviews([], houses, ["official", "personal"], "employee" as Role, today);
    expect(previews).toHaveLength(4);
    expect(previews.map((p) => `${p.guest_house_id}:${p.booking_type}`)).toEqual([
      "gh-a:official",
      "gh-a:personal",
      "gh-b:official",
      "gh-b:personal",
    ]);
    expect(previews[0].lines).toHaveLength(5);
    expect(previews[2].lines).toHaveLength(2);
  });

  it("uses a rate in force, not one that starts later", () => {
    const tariffs = [
      tariff({ id: "now", guest_house_id: GH.id, rate: 1000, effective_from: "2026-01-01" }),
      tariff({ id: "soon", guest_house_id: GH.id, rate: 1500, effective_from: "2026-12-01" }),
    ];
    const lines = tariffPreviewLines(tariffs, {
      guestHouseId: GH.id,
      bookingType: "official",
      role: "employee",
      roomType: "double_sharing",
      servesMeals: false,
      date: today,
    });
    expect(lines.find((l) => l.item === "room")?.rate).toBe(1000);
  });
});

// --------------------------------------------- availability, as a count only

describe("availability as a count", () => {
  const rooms = [room({ id: "r1", room_number: "B-101" }), room({ id: "r2", room_number: "B-102" })];
  const segment = (patch: Partial<RoomOccupancySegment>): RoomOccupancySegment => ({
    room_id: "r1",
    booking_id: "b-1",
    booking_reference_id: "IITPKD-GH-2026-AB12C",
    status: "APPROVED",
    check_in: "2026-10-08T06:30:00.000Z",
    check_out: "2026-10-09T04:30:00.000Z",
    requester_name: null,
    purpose_of_visit: null,
    turnaround_until: null,
    kind: "stay",
    ...patch,
  });

  /** Institute midnight on 8 Oct 2026 is 18:30Z on the 7th. */
  const from = new Date("2026-10-07T18:30:00.000Z");

  it("lists the institute days a window covers", () => {
    const oneDay = rangeBetween(from, new Date("2026-10-08T18:30:00.000Z")) as AvailabilityRange;
    expect(oneDay.days).toEqual(["2026-10-08"]);
    expect(oneDay.view).toBe("day");
    const week = rangeBetween(from, new Date("2026-10-14T18:30:00.000Z")) as AvailabilityRange;
    expect(week.days).toHaveLength(7);
    expect(week.days[6]).toBe("2026-10-14");
    expect(rangeBetween(from, from)).toBeNull();
  });

  it("counts free rooms by day and by hour, and nothing else", () => {
    const range = rangeBetween(from, new Date("2026-10-09T18:30:00.000Z")) as AvailabilityRange;
    // One room taken for the whole of 8 Oct and the first hours of the 9th.
    const counts = availabilityCounts(rooms, [segment({})], range, new Date("2026-10-08T07:00:00.000Z"));
    expect(counts.total).toBe(2);
    expect(counts.days).toEqual(["2026-10-08", "2026-10-09"]);
    expect(counts.freeByDay).toEqual([1, 1]);
    expect(counts.freeThroughout).toBe(1);
    expect(counts.bookedNow).toBe(1);
    // No hourly breakdown for a window of more than one day.
    expect(counts.freeByHour).toBeNull();
    // Nothing in the answer names a room.
    expect(JSON.stringify(counts)).not.toContain("B-101");
  });

  it("gives the hours of a single day, so a part-free day is visible", () => {
    const range = rangeBetween(from, new Date("2026-10-08T18:30:00.000Z")) as AvailabilityRange;
    // One room held from noon to 6pm institute time on 8 Oct.
    const counts = availabilityCounts(
      rooms,
      [segment({ check_in: "2026-10-08T06:30:00.000Z", check_out: "2026-10-08T12:30:00.000Z" })],
      range,
      new Date("2026-10-08T07:00:00.000Z")
    );
    expect(counts.freeByDay).toEqual([1]);
    expect(counts.freeByHour).toHaveLength(24);
    // Midnight to noon: both free. Noon to 6pm: one.
    expect(counts.freeByHour?.[0]).toBe(2);
    expect(counts.freeByHour?.[12]).toBe(1);
    expect(counts.freeByHour?.[17]).toBe(1);
    expect(counts.freeByHour?.[18]).toBe(2);
  });

  it("counts a room out of service as unavailable, without saying why", () => {
    const range = rangeBetween(from, new Date("2026-10-08T18:30:00.000Z")) as AvailabilityRange;
    const counts = availabilityCounts(
      rooms,
      [segment({ kind: "maintenance", purpose_of_visit: "Plumbing", booking_id: "block-1" })],
      range,
      new Date("2026-10-08T07:00:00.000Z")
    );
    expect(counts.freeByDay).toEqual([1]);
    expect(JSON.stringify(counts)).not.toContain("Plumbing");
  });

  it("reports no 'right now' figure for a window that does not contain now", () => {
    const range = rangeBetween(from, new Date("2026-10-08T18:30:00.000Z")) as AvailabilityRange;
    const counts = availabilityCounts(rooms, [], range, new Date("2026-11-01T07:00:00.000Z"));
    expect(counts.bookedNow).toBeNull();
    expect(counts.freeByDay).toEqual([2]);
  });
});
