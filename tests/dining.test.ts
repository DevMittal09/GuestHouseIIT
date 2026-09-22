import { describe, expect, it } from "vitest";
import { serviceTypeError, serviceTypesFor } from "@/lib/booking-types";
import { DEFAULT_DEBIT_RULES, debitHeadsByType } from "@/lib/debit-heads";
import { buildInvoiceDocument, invoiceBlocker } from "@/lib/invoice";
import { isKitchenConfirmed, kitchenHeadCount } from "@/lib/meals";
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

  it("dining heads: Department / PDF / Personal for faculty, Department for staff, never Project", () => {
    const faculty = debitHeadsByType("employee", ["official"], { staff_category: "faculty", unit_id: null }, [], DEFAULT_DEBIT_RULES, "dining");
    expect(faculty.official).toEqual(["department_budget", "professional_development_fund", "personal_funds"]);
    const staff = debitHeadsByType("employee", ["official"], { staff_category: "staff", unit_id: null }, [], DEFAULT_DEBIT_RULES, "dining");
    expect(staff.official).toEqual(["department_budget"]);
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
