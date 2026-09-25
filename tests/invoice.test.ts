import fs from "fs";
import { describe, expect, it } from "vitest";
import {
  actualStayTimes,
  buildInvoiceDocument,
  chargeableDays,
  extraBedsByRoom,
  financialYear,
  formatINR,
  formatInvoiceNumber,
  gstPaise,
  halves,
  invoiceBlocker,
  splitGst,
  mealCovers,
  projectFromDetails,
  roundHalfUpToRupee,
  splitByRate,
} from "@/lib/invoice";
import { resolveTariff, tariffLockedError, type Tariff } from "@/lib/tariffs";
import { DEFAULT_RULES } from "@/lib/settings";
import { renderInvoicePdf } from "@/lib/invoice-pdf";
import type { BookingLog } from "@/lib/types";
import { booking, GH, guest, profile, room } from "./helpers";

const RULES = DEFAULT_RULES.invoice;
const CAP = DEFAULT_RULES.capacity;

function t(patch: Partial<Tariff>): Tariff {
  return {
    id: Math.random().toString(36).slice(2),
    guest_house_id: null,
    item: "room",
    room_type: null,
    booking_type: null,
    requester_role: null,
    rate: 0,
    effective_from: "2024-01-01",
    note: null,
    created_at: "2024-01-01T00:00:00.000Z",
    created_by: null,
    ...patch,
  };
}

const TARIFFS: Tariff[] = [
  t({ guest_house_id: GH.id, item: "room", rate: 2000 }),
  t({ guest_house_id: GH.id, item: "room", requester_role: "official", rate: 4000 }),
  t({ item: "extra_bed", rate: 500 }),
  t({ item: "breakfast", rate: 80 }),
  t({ item: "lunch", rate: 120 }),
  t({ item: "dinner", rate: 100 }),
  t({ item: "breakfast", requester_role: "student", rate: 0 }),
];

function log(status: BookingLog["new_status"], timestamp: string): BookingLog {
  return {
    id: timestamp,
    booking_id: "b-1",
    action_by: null,
    action_by_name: "Desk",
    previous_status: null,
    new_status: status,
    remarks: null,
    timestamp,
  };
}

describe("money", () => {
  it("formats rupees with Indian grouping", () => {
    expect(formatINR(0)).toBe("₹0.00");
    expect(formatINR(99_900)).toBe("₹999.00");
    expect(formatINR(100_000)).toBe("₹1,000.00");
    expect(formatINR(12_345_600)).toBe("₹1,23,456.00");
    expect(formatINR(1_234_567_850)).toBe("₹1,23,45,678.50");
    expect(formatINR(5)).toBe("₹0.05");
  });

  it("rounds half-up to the rupee", () => {
    expect(roundHalfUpToRupee(1050)).toBe(1100);
    expect(roundHalfUpToRupee(1049)).toBe(1000);
    expect(roundHalfUpToRupee(1000)).toBe(1000);
  });

  it("computes GST in integers, rounded half-up to the rupee", () => {
    expect(gstPaise(100_000, 18)).toBe(18_000); // 18% of ₹1,000
    expect(gstPaise(2_500, 18)).toBe(500); // ₹4.50 → ₹5
    expect(gstPaise(2_400, 18)).toBe(400); // ₹4.32 → ₹4
    expect(gstPaise(100_278, 18)).toBe(18_100); // ₹180.5004 → ₹181
    expect(gstPaise(100_000, 0)).toBe(0);
    expect(gstPaise(333_300, 12.5)).toBe(41_700); // ₹416.625 → ₹417
  });
});

describe("numbering", () => {
  it("rolls the financial year over on 1 April, institute time", () => {
    expect(financialYear("2026-03-31T18:29:59.000Z")).toBe("2025-26"); // 23:59 IST, 31 Mar
    expect(financialYear("2026-03-31T18:30:00.000Z")).toBe("2026-27"); // 00:00 IST, 1 Apr
    expect(financialYear("2027-01-15T00:00:00.000Z")).toBe("2026-27");
    expect(financialYear("2099-12-31T00:00:00.000Z")).toBe("2099-00");
  });

  it("formats the serial", () => {
    expect(formatInvoiceNumber("GH", "2026-27", 1, 4)).toBe("GH/2026-27/0001");
    expect(formatInvoiceNumber("GH", "2026-27", 12345, 4)).toBe("GH/2026-27/12345");
  });
});

describe("chargeable days", () => {
  // 14:00 IST = 08:30Z
  const inAt = "2026-10-01T08:30:00.000Z";

  it("counts calendar nights by default", () => {
    expect(chargeableDays(inAt, "2026-10-03T05:30:00.000Z", "night", 4)).toEqual(["2026-10-01", "2026-10-02"]);
    // Arrived 01:00 IST, left 10:00 IST the same day: still one.
    expect(chargeableDays("2026-09-30T19:30:00.000Z", "2026-10-01T04:30:00.000Z", "night", 4)).toEqual(["2026-10-01"]);
    // A late check-out does not add a night.
    expect(chargeableDays(inAt, "2026-10-02T15:30:00.000Z", "night", 4)).toHaveLength(1);
  });

  it("counts 24-hour blocks with a grace, when configured", () => {
    const at = (h: number) => new Date(Date.parse(inAt) + h * 3_600_000).toISOString();
    expect(chargeableDays(inAt, at(3), "24h", 4)).toHaveLength(1);
    expect(chargeableDays(inAt, at(28), "24h", 4)).toHaveLength(1);
    expect(chargeableDays(inAt, at(28.5), "24h", 4)).toHaveLength(2);
    expect(chargeableDays(inAt, at(52), "24h", 4)).toHaveLength(2);
    expect(chargeableDays(inAt, at(53), "24h", 0)).toHaveLength(3);
  });

  it("groups consecutive days at the same rate", () => {
    const days = ["2027-03-30", "2027-03-31", "2027-04-01", "2027-04-02"];
    expect(splitByRate(days, (d) => (d < "2027-04-01" ? 200_000 : 250_000))).toEqual([
      { from: "2027-03-30", to: "2027-03-31", days: 2, rate: 200_000 },
      { from: "2027-04-01", to: "2027-04-02", days: 2, rate: 250_000 },
    ]);
  });
});

describe("tariff resolution", () => {
  const q = { guest_house_id: GH.id, item: "room" as const, room_type: "double_sharing" as const, booking_type: "official" as const, requester_role: "employee" as const, date: "2026-10-01" };

  it("prefers the most specific row", () => {
    expect(resolveTariff(TARIFFS, q)?.rate).toBe(2000);
    expect(resolveTariff(TARIFFS, { ...q, requester_role: "official" })?.rate).toBe(4000);
  });

  it("takes the latest rate in force among equally specific rows", () => {
    const rows = [...TARIFFS, t({ guest_house_id: GH.id, item: "room", rate: 2500, effective_from: "2027-04-01" })];
    expect(resolveTariff(rows, q)?.rate).toBe(2000);
    expect(resolveTariff(rows, { ...q, date: "2027-04-01" })?.rate).toBe(2500);
    // The officers' own rate is not overtaken by a later general one.
    expect(resolveTariff(rows, { ...q, requester_role: "official", date: "2027-05-01" })?.rate).toBe(4000);
  });

  it("returns null when nothing covers the charge", () => {
    expect(resolveTariff(TARIFFS, { ...q, guest_house_id: "elsewhere" })).toBeNull();
    expect(resolveTariff(TARIFFS, { ...q, date: "2023-12-31" })).toBeNull();
  });

  it("locks a rate once it is in force", () => {
    expect(tariffLockedError({ effective_from: "2026-09-22" }, "2026-09-22")).not.toBeNull();
    expect(tariffLockedError({ effective_from: "2026-09-23" }, "2026-09-22")).toBeNull();
  });
});

describe("what the stay used", () => {
  it("bills actual check-in and check-out from the desk's log", () => {
    const b = booking({
      logs: [log("OCCUPIED", "2030-01-10T09:12:00.000Z"), log("VACATED", "2030-01-11T23:40:00.000Z")],
    });
    expect(actualStayTimes(b)).toMatchObject({
      checkIn: "2030-01-10T09:12:00.000Z",
      checkOut: "2030-01-11T23:40:00.000Z",
      actualIn: true,
      actualOut: true,
    });
    expect(actualStayTimes(booking())).toMatchObject({ checkIn: booking().check_in, actualOut: false });
  });

  it("counts meal covers as ticks × diners, infants not counted", () => {
    const b = booking({
      meals: [
        { date: "2030-01-10", breakfast: false, lunch: true, dinner: true },
        { date: "2030-01-11", breakfast: true, lunch: true, dinner: false },
      ],
    }, [{ guests: [guest(), guest(), guest({ is_infant: true, age: 1 })] }]);
    expect(mealCovers(b)).toEqual({ breakfast: 2, lunch: 4, dinner: 2 });
    const dining = booking({ service_type: "meals_only", meal_guest_count: 25, meals: [{ date: "2030-01-10", breakfast: false, lunch: true, dinner: false }] }, []);
    expect(mealCovers(dining)).toEqual({ breakfast: 0, lunch: 25, dinner: 0 });
  });

  it("finds extra beds per room from who was put in it", () => {
    const double = room({ id: "r-d", room_number: "B-204", room_type: "double_sharing" });
    const single = room({ id: "r-s", room_number: "B-110", room_type: "single" });
    const b = booking({}, [
      { guests: [guest(), guest(), guest()], assigned: double },
      { guests: [guest(), guest({ is_infant: true, age: 1 })], assigned: single },
    ]);
    expect(extraBedsByRoom(b, CAP).map((x) => [x.room.room_number, x.extra])).toEqual([
      ["B-204", 1],
      ["B-110", 0],
    ]);
  });

  it("splits a project snapshot into number and title", () => {
    expect(projectFromDetails("SP/2025/017 — Grid-scale storage (Dr. A)")).toEqual({
      number: "SP/2025/017",
      title: "Grid-scale storage (Dr. A)",
    });
  });
});

describe("the invoice document", () => {
  const double = room({ id: "r-d", room_number: "B-204", room_type: "double_sharing" });
  const single = room({ id: "r-s", room_number: "B-110", room_type: "single" });
  const stay = booking(
    {
      status: "VACATED",
      debit_head: "project_grant",
      debit_details: "SP/2025/017 — Grid-scale energy storage (Dr. Priya Sharma)",
      requester: profile({ full_name: "Dr. Priya Sharma", department_or_club: "Electrical Engineering" }),
      // 14:00 IST 1 Oct → 10:00 IST 3 Oct: two nights.
      logs: [log("OCCUPIED", "2026-10-01T08:30:00.000Z"), log("VACATED", "2026-10-03T04:30:00.000Z")],
      meals: [
        { date: "2026-10-01", breakfast: false, lunch: false, dinner: true },
        { date: "2026-10-02", breakfast: true, lunch: true, dinner: true },
        { date: "2026-10-03", breakfast: true, lunch: false, dinner: false },
      ],
    },
    [
      { guests: [guest({ name: "Prof. Anil Mehta" }), guest({ name: "Ravi" }), guest({ name: "Asha" })], assigned: double },
      { guests: [guest({ name: "Kiran" }), guest({ name: "Baby", is_infant: true, age: 1 })], assigned: single },
    ]
  );

  it("prices rooms, extra beds and meals, and totals them", () => {
    const doc = buildInvoiceDocument(stay, { tariffs: TARIFFS, rules: RULES, capacity: CAP, invoiceDate: "2026-10-03T05:00:00.000Z" });
    expect(doc.problems).toEqual([]);
    expect(doc.primary_guest).toBe("Prof. Anil Mehta");
    expect([doc.rooms, doc.guests, doc.infants]).toEqual([2, 4, 1]);
    expect(doc.debit_head_label).toBe("Project");
    expect(doc.project_number).toBe("SP/2025/017");
    // The tariffs include GST — 18% on rooms since 25 Sep 2026: the Rate
    // column is the rate before GST (₹2,000 / 1.18 = ₹1,694.92), the Amount
    // that rate × days.
    expect(doc.room_lines.map((l) => [l.description, l.days, l.rate, l.amount, l.amount_incl])).toEqual([
      ["B-204 — Double sharing", 2, 169_492, 338_984, 400_000],
      ["Extra bed — B-204", 2, 42_373, 84_746, 100_000],
      ["B-110 — Single", 2, 169_492, 338_984, 400_000],
    ]);
    // 4 diners: dinner ×2 days, breakfast ×2, lunch ×1.
    expect(doc.meal_lines.map((l) => [l.meal, l.count, l.rate, l.amount_incl])).toEqual([
      ["breakfast", 8, 7_619, 64_000],
      ["lunch", 4, 11_429, 48_000],
      ["dinner", 8, 9_524, 80_000],
    ]);
    // The grand total is exactly the prices: ₹9,000 of rooms + ₹1,920 of meals.
    expect(doc.grand_total).toBe(1_092_000);
    expect(doc.total + doc.gst).toBe(doc.grand_total);
    expect(doc.subtotal_rooms + doc.subtotal_dining).toBe(doc.total);
    expect(doc.gst_breakdown.map((g) => [g.label, g.sac, g.percent, g.taxable + g.tax])).toEqual([
      ["Accommodation", "996311", 18, 900_000],
      ["Food", "996331", 5, 192_000],
    ]);
    for (const g of doc.gst_breakdown) expect(g.cgst + g.sgst).toBe(g.tax);
    expect(doc.cgst + doc.sgst).toBe(doc.gst);
    expect(doc.gst).toBe(1_092_000 - doc.total);
  });

  it("prints the desk's corrected meal counts", () => {
    const doc = buildInvoiceDocument(stay, {
      tariffs: TARIFFS,
      rules: RULES,
      capacity: CAP,
      mealCounts: { breakfast: 6, lunch: 4, dinner: 7 },
    });
    expect(doc.meal_lines.map((l) => l.count)).toEqual([6, 4, 7]);
    expect(doc.meal_lines.reduce((n, l) => n + l.amount_incl, 0)).toBe(6 * 8000 + 4 * 12000 + 7 * 10000);
  });

  it("splits a room row on a mid-stay rate change", () => {
    const rows = [...TARIFFS, t({ guest_house_id: GH.id, item: "room", rate: 2500, effective_from: "2026-10-02" })];
    const doc = buildInvoiceDocument(stay, { tariffs: rows, rules: RULES, capacity: CAP });
    const b204 = doc.room_lines.filter((l) => l.description.startsWith("B-204 —"));
    expect(b204.map((l) => [l.days, l.rate_incl])).toEqual([
      [1, 200_000],
      [1, 250_000],
    ]);
    expect(b204[0].description).toContain("(1 Oct)");
  });

  it("adds GST on top when the rates exclude it, rounded half-up per SAC", () => {
    const rules = { ...RULES, prices_include_gst: false, gst_room_percent: 12, gst_meal_percent: 12 };
    const doc = buildInvoiceDocument(stay, { tariffs: TARIFFS, rules, capacity: CAP });
    expect(doc.total).toBe(1_092_000);
    // Rooms ₹9,000 × 12% = ₹1,080; food ₹1,920 × 12% = ₹230.40 → ₹230.
    expect(doc.gst).toBe(gstPaise(900_000, 12) + gstPaise(192_000, 12));
    expect(doc.gst).toBe(131_000);
    expect(doc.grand_total).toBe(1_223_000);
  });

  // The ₹7,500 slab (5% below, 18% above) was replaced by a flat 18% on
  // rooms on 25 Sep 2026 — see fifth-round.test.ts.
  it("taxes every room line at the one accommodation rate, however dear", () => {
    const rows = [...TARIFFS, t({ guest_house_id: GH.id, item: "room", requester_role: "employee", rate: 9000 })];
    const doc = buildInvoiceDocument(stay, { tariffs: rows, rules: RULES, capacity: CAP });
    expect(new Set(doc.room_lines.map((l) => l.gst_percent))).toEqual(new Set([18]));
    expect(doc.room_lines.find((l) => l.kind === "room")!.rate).toBe(762_712); // ₹9,000 / 1.18
    expect(doc.grand_total).toBe(2 * 2 * 900_000 + 100_000 + 192_000);
  });

  it("backs GST out of an inclusive price exactly", () => {
    expect(splitGst(200_000, 5, true)).toEqual({ taxable: 190_476, tax: 9_524 });
    expect(splitGst(12_000, 5, true)).toEqual({ taxable: 11_429, tax: 571 });
    expect(splitGst(200_000, 0, true)).toEqual({ taxable: 200_000, tax: 0 });
    expect(halves(9_525)).toEqual({ cgst: 4_762, sgst: 4_763 });
  });

  it("refuses to issue what no tariff prices", () => {
    const doc = buildInvoiceDocument(stay, { tariffs: TARIFFS.filter((x) => x.item !== "extra_bed"), rules: RULES, capacity: CAP });
    expect(doc.problems[0]).toMatch(/extra bed/i);
    expect(invoiceBlocker(stay, doc)).toMatch(/extra bed/i);
    const ok = buildInvoiceDocument(stay, { tariffs: TARIFFS, rules: RULES, capacity: CAP });
    expect(invoiceBlocker(stay, ok)).toBeNull();
    expect(invoiceBlocker({ ...stay, status: "APPROVED" }, ok)).toMatch(/check-out/);
  });

  it("renders the PDF with the rupee sign and the Hindi artwork", () => {
    const doc = buildInvoiceDocument(stay, {
      tariffs: TARIFFS,
      rules: RULES,
      capacity: CAP,
      invoiceNumber: "GH/2026-27/0001",
      invoiceDate: "2026-10-03T05:00:00.000Z",
    });
    const pdf = renderInvoicePdf(doc, null);
    expect(Buffer.from(pdf.slice(0, 5)).toString()).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(20_000);
    if (process.env.INVOICE_PDF_OUT) fs.writeFileSync(process.env.INVOICE_PDF_OUT, pdf);
  });
});
