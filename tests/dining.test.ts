import { describe, expect, it } from "vitest";
import { serviceTypeError, serviceTypesFor } from "@/lib/booking-types";
import { DEFAULT_DEBIT_RULES, debitHeadsByType } from "@/lib/debit-heads";
import { buildInvoiceDocument, invoiceBlocker } from "@/lib/invoice";
import {
  firstBookableMealDate,
  isKitchenConfirmed,
  isMealBookable,
  kitchenHeadCount,
  mealLeadTimeError,
  stayMealDays,
} from "@/lib/meals";
import { renderEmail } from "@/lib/mail/render";
import { dailyDeskReport } from "@/lib/mail/templates";
import { DEFAULT_RULES } from "@/lib/settings";
import type { Tariff } from "@/lib/tariffs";
import { booking, GH, guest } from "./helpers";

/**
 * Dining (Phase 6): meals without a room, for faculty, staff and offices, at
 * guest houses that serve meals — counted for the kitchen, reported daily,
 * and invoiced like a stay.
 */

const meal = (item: Tariff["item"], rate: number): Tariff => ({
  id: item,
  guest_house_id: null,
  item,
  room_type: null,
  booking_type: null,
  requester_role: null,
  rate,
  effective_from: "2024-01-01",
  note: null,
  created_at: "2024-01-01T00:00:00.000Z",
  created_by: null,
});
const TARIFFS = [meal("breakfast", 80), meal("lunch", 120), meal("dinner", 100)];

function dining(patch: Parameters<typeof booking>[0] = {}) {
  return booking(
    {
      service_type: "meals_only",
      meal_guest_count: 25,
      meal_preference: "veg",
      status: "APPROVED",
      debit_head: "department_budget",
      meals: [{ date: "2026-09-20", breakfast: false, lunch: true, dinner: false }],
      ...patch,
    },
    []
  );
}

describe("who may book meals without a room", () => {
  it("faculty, staff and offices — not students, clubs or the student cell", () => {
    for (const role of ["employee", "official", "iar_cell"] as const) {
      expect(serviceTypesFor(role, true)).toContain("meals_only");
    }
    for (const role of ["student", "club", "iar_student_cell"] as const) {
      expect(serviceTypesFor(role, true)).not.toContain("meals_only");
      expect(serviceTypeError(role, "meals_only", true)).toMatch(/faculty, staff and offices/);
    }
  });

  it("only where a guest house serves meals", () => {
    expect(serviceTypesFor("employee", false)).toEqual(["room"]);
  });

  it("dining heads: Department / PDF / Personal / Special Funds for faculty, Department / Special Funds for staff, never Project", () => {
    const faculty = debitHeadsByType("employee", ["official"], { staff_category: "faculty", unit_id: null }, [], DEFAULT_DEBIT_RULES, "dining");
    expect(faculty.official).toEqual(["department_budget", "professional_development_fund", "personal_funds", "special_budget"]);
    const staff = debitHeadsByType("employee", ["official"], { staff_category: "staff", unit_id: null }, [], DEFAULT_DEBIT_RULES, "dining");
    expect(staff.official).toEqual(["department_budget", "special_budget"]);
    for (const heads of Object.values(DEFAULT_DEBIT_RULES.dining)) expect(heads).not.toContain("project_grant");
  });
});

describe("the kitchen's head count", () => {
  it("adds stays' bed guests and dining head counts, by preference", () => {
    const stay = booking(
      { status: "OCCUPIED", meal_preference: "non_veg", meals: [{ date: "2026-09-20", breakfast: true, lunch: true, dinner: false }] },
      [{ guests: [guest(), guest(), guest({ is_infant: true, age: 1 })] }]
    );
    const lunch = kitchenHeadCount([stay, dining()], "2026-09-20", "lunch");
    expect(lunch).toEqual({ veg: 25, non_veg: 2, unknown: 0, total: 27 });
    expect(kitchenHeadCount([stay, dining()], "2026-09-20", "breakfast").total).toBe(2);
    expect(kitchenHeadCount([stay, dining()], "2026-09-21", "lunch").total).toBe(0);
  });

  it("cooks only for bookings that are going ahead", () => {
    expect(["APPROVED", "OCCUPIED", "CANCELLATION_REQUESTED"].every(isKitchenConfirmed)).toBe(true);
    expect(["PENDING_HOD", "PENDING_GH_MANAGER", "CANCELLED", "REJECTED"].some(isKitchenConfirmed)).toBe(false);
  });
});

describe("dining invoices", () => {
  const rules = DEFAULT_RULES.invoice;
  const cap = DEFAULT_RULES.capacity;

  it("bills covers at the meal rates, with no rooms", () => {
    const doc = buildInvoiceDocument(dining(), { tariffs: TARIFFS, rules, capacity: cap });
    expect(doc.room_lines).toEqual([]);
    expect([doc.rooms, doc.guests, doc.infants]).toEqual([0, 25, 0]);
    expect(doc.meal_lines.map((l) => l.count)).toEqual([0, 25, 0]);
    expect(doc.grand_total).toBe(25 * 12_000); // rates include GST
    expect(doc.gst_breakdown.map((g) => g.label)).toEqual(["Food"]);
  });

  it("can be issued from the day of the first meal, once approved", () => {
    const doc = buildInvoiceDocument(dining(), { tariffs: TARIFFS, rules, capacity: cap });
    const before = new Date("2026-09-19T12:00:00.000Z");
    const on = new Date("2026-09-20T05:00:00.000Z");
    expect(invoiceBlocker(dining(), doc, before)).toMatch(/first meal/);
    expect(invoiceBlocker(dining(), doc, on)).toBeNull();
    expect(invoiceBlocker(dining({ status: "PENDING_GH_MANAGER" }), doc, on)).toMatch(/approved/);
  });
});

describe("the daily desk report", () => {
  it("has the kitchen's plates and the day's dining bookings", () => {
    const doc = dailyDeskReport(
      "2026-09-20",
      GH.name,
      {
        arrivals: [],
        departures: [],
        inHouse: [],
        overdue: [],
        awaitingAllocation: [],
        kitchen: {
          counts: [
            { meal: "breakfast", veg: 0, non_veg: 0, unknown: 0, total: 0 },
            { meal: "lunch", veg: 25, non_veg: 2, unknown: 0, total: 27 },
            { meal: "dinner", veg: 0, non_veg: 0, unknown: 0, total: 0 },
          ],
          dining: [dining()],
        },
      },
      { rooms: 4, held: 0 }
    );
    const { text } = renderEmail(doc);
    expect(text).toContain("Kitchen — plates today");
    expect(text).toContain("Dining bookings today");
    expect(text).toContain("REF-b-1");
    // A day with lunches to cook is not "quiet".
    expect(text).not.toContain("No arrivals, departures or guests in house");
  });
});

/**
 * The kitchen's notice period (Sep 2026): a meal has to be asked for **before
 * the previous one finishes being served**, because that is the last head count
 * the kitchen can buy and cook against. So lunch closes when breakfast ends,
 * dinner when lunch ends, and a morning's breakfast when the evening before it
 * ends.
 *
 * `TZ=UTC` in the suite, so every instant below is written in UTC and the
 * institute's wall clock is 5h30m ahead of it: 04:00Z is 09:30 IST, the moment
 * breakfast stops being served.
 */
describe("the kitchen's notice period", () => {
  const windows = DEFAULT_RULES.meals.windows;
  const at = (iso: string) => new Date(iso);

  it("closes each meal when the previous one stops being served", () => {
    // 08:00 IST — before breakfast ends, so every meal today is still open.
    const morning = at("2026-10-01T02:30:00.000Z");
    expect(isMealBookable("2026-10-01", "breakfast", morning, windows)).toBe(false); // last night
    expect(isMealBookable("2026-10-01", "lunch", morning, windows)).toBe(true);
    expect(isMealBookable("2026-10-01", "dinner", morning, windows)).toBe(true);

    // 09:31 IST — one minute past the end of breakfast: lunch has closed.
    const afterBreakfast = at("2026-10-01T04:01:00.000Z");
    expect(isMealBookable("2026-10-01", "lunch", afterBreakfast, windows)).toBe(false);
    expect(isMealBookable("2026-10-01", "dinner", afterBreakfast, windows)).toBe(true);

    // 14:01 IST — past the end of lunch: nothing today is left.
    const afterLunch = at("2026-10-01T08:31:00.000Z");
    expect(isMealBookable("2026-10-01", "dinner", afterLunch, windows)).toBe(false);
    // But tomorrow is wide open, because tonight's dinner has yet to be served.
    expect(isMealBookable("2026-10-02", "breakfast", afterLunch, windows)).toBe(true);

    // 21:01 IST — past the end of dinner: tomorrow's breakfast has closed too.
    const afterDinner = at("2026-10-01T15:31:00.000Z");
    expect(isMealBookable("2026-10-02", "breakfast", afterDinner, windows)).toBe(false);
    expect(isMealBookable("2026-10-02", "lunch", afterDinner, windows)).toBe(true);
  });

  it("opens the dining form on today until today is over", () => {
    // 08:00 IST: today still has lunch and dinner to offer.
    expect(firstBookableMealDate(at("2026-10-01T02:30:00.000Z"), windows)).toBe("2026-10-01");
    // 14:01 IST: nothing left today, so the form starts on tomorrow.
    expect(firstBookableMealDate(at("2026-10-01T08:31:00.000Z"), windows)).toBe("2026-10-02");
    // 23:00 IST: still tomorrow — tomorrow's lunch and dinner are open even
    // though its breakfast is not.
    expect(firstBookableMealDate(at("2026-10-01T17:30:00.000Z"), windows)).toBe("2026-10-02");
  });

  it("refuses a plan whose deadline has passed, naming it", () => {
    const plan = [{ date: "2026-10-01", breakfast: false, lunch: true, dinner: false }];
    expect(mealLeadTimeError(plan, at("2026-10-01T02:30:00.000Z"), windows)).toBeNull();
    const late = mealLeadTimeError(plan, at("2026-10-01T04:01:00.000Z"), windows);
    expect(late).toMatch(/Lunch on .* has to be booked before breakfast ends, at 9:30 AM/);
    expect(late).toMatch(/that has passed/);
  });

  it("offers a stay only the meals the kitchen can still take", () => {
    // A stay starting this afternoon: today's dinner is already closed
    // (its deadline was the end of lunch), tomorrow's meals are not.
    const now = at("2026-10-01T08:31:00.000Z"); // 14:01 IST
    const days = stayMealDays(
      new Date("2026-10-01T09:30:00.000Z"), // 15:00 IST today
      new Date("2026-10-02T09:30:00.000Z"), // 15:00 IST tomorrow
      windows,
      now
    );
    expect(days.map((d) => d.date)).toEqual(["2026-10-01", "2026-10-02"]);
    // Day 1: breakfast and lunch are before check-in, and dinner — which the
    // stay does cover — is past its deadline.
    expect(days[0].available).toEqual({ breakfast: false, lunch: false, dinner: false });
    // Day 2: breakfast and lunch are open; dinner is after the 15:00 check-out.
    expect(days[1].available).toEqual({ breakfast: true, lunch: true, dinner: false });
    // Without a clock it is purely "does the stay cover the meal" — the shape
    // `normalizeMeals` needs when re-reading a plan that was stored long ago.
    const noClock = stayMealDays(
      new Date("2026-10-01T09:30:00.000Z"),
      new Date("2026-10-02T09:30:00.000Z"),
      windows
    );
    expect(noClock[0].available.dinner).toBe(true);
  });
});
