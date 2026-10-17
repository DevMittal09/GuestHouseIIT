import { describe, expect, it } from "vitest";
import {
  buildInvoiceDocument,
  extraChargeSectionsFor,
  invoicePrintsDining,
  invoiceTable,
  parseExtraCharges,
  type ExtraCharge,
  type InvoiceDocument,
} from "@/lib/invoice";
import { invoiceToAccounts } from "@/lib/mail/templates";
import { DEFAULT_RULES } from "@/lib/settings";
import { tariffLockedError, tariffStartError, type Tariff } from "@/lib/tariffs";
import { addDaysToDateValue } from "@/lib/tz";
import type { BookingLog, BookingWithDetails } from "@/lib/types";
import { booking, GH, guest, room } from "./helpers";

/**
 * The owner's thirteenth list (16 Oct 2026, asked at the end of the 15th):
 *
 * 1. "Only for future booking GHM can change the rates ... currently even
 *    past and todays rate apparently we can change rates, which is not
 *    right."
 * 2. "Add the guest house name while differentiating the invoices in the
 *    dashboard where we are showing the previous bookings for GHM/GHC."
 * 3. "For bageshri meals should not come in invoice."
 *
 * Item 2 is three table cells (`StaysTable`, `CheckoutsToday`,
 * `AwaitingPaymentTable`) and the invoice dialog's printed heading; it is
 * checked in `e2e/fifth-round.spec.ts`, which drives the desk's own console.
 */

// ------------------------------------------------- 1. rates start in the future

describe("a new rate starts in the future", () => {
  const today = "2026-10-16";
  const tomorrow = addDaysToDateValue(today, 1);

  it("refuses today and every earlier date, and names the earliest in the office's format", () => {
    expect(tariffStartError(tomorrow, today)).toBeNull();
    expect(tariffStartError("2027-04-01", today)).toBeNull();
    const refused = tariffStartError(today, today);
    expect(refused).toMatch(/future date/);
    // DD/MM/YYYY everywhere since 1 Oct 2026.
    expect(refused).toContain("17/10/2026");
    expect(tariffStartError("2026-10-15", today)).not.toBeNull();
    expect(tariffStartError("2024-01-01", today)).not.toBeNull();
  });

  it("reports a date it cannot read instead of letting it through", () => {
    for (const bad of ["", "tomorrow", "2026-13-40", "16-10-2026"]) {
      expect(tariffStartError(bad, today)).not.toBeNull();
    }
  });

  /**
   * The two rules meet at tomorrow with no gap and no overlap: the earliest
   * date a new rate may start is the earliest one that can still be removed,
   * so every rate the console accepts is one it can also take back until the
   * day it comes into force.
   */
  it("meets tariffLockedError at tomorrow", () => {
    expect(tariffStartError(tomorrow, today)).toBeNull();
    expect(tariffLockedError({ effective_from: tomorrow }, today)).toBeNull();
    expect(tariffStartError(today, today)).not.toBeNull();
    expect(tariffLockedError({ effective_from: today }, today)).not.toBeNull();
  });
});

// --------------------------------- 3. no dining section where there is no kitchen

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
  t({ item: "extra_bed", rate: 500 }),
  t({ item: "breakfast", rate: 80 }),
  t({ item: "lunch", rate: 120 }),
  t({ item: "dinner", rate: 100 }),
];

const log = (status: BookingLog["new_status"], timestamp: string): BookingLog => ({
  id: timestamp,
  booking_id: "b-1",
  action_by: null,
  action_by_name: "Desk",
  previous_status: null,
  new_status: status,
  remarks: null,
  timestamp,
});

/** The same two-night stay in one double room, at a kitchen or without one. */
const stayAt = (servesMeals: boolean): BookingWithDetails =>
  booking(
    {
      status: "VACATED",
      guest_house: { ...GH, name: servesMeals ? "Hamsanandi" : "Bageshri", serves_meals: servesMeals },
      logs: [log("OCCUPIED", "2026-10-01T08:30:00.000Z"), log("VACATED", "2026-10-03T04:30:00.000Z")],
    },
    [{ guests: [guest({ name: "Prof. A" }), guest({ name: "Dr. B" })], assigned: room({ id: "r-d", room_number: "201" }) }]
  );

const price = (b: BookingWithDetails, ctx: Partial<Parameters<typeof buildInvoiceDocument>[1]> = {}) =>
  buildInvoiceDocument(b, { tariffs: TARIFFS, rules: RULES, capacity: CAP, ...ctx });

const bageshri = stayAt(false);
const hamsanandi = stayAt(true);

describe("a guest house with no kitchen has no dining section on its invoice", () => {
  const doc = price(bageshri);

  it("records that the guest house serves no meals, in a new version", () => {
    expect(doc.serves_meals).toBe(false);
    expect(invoicePrintsDining(doc)).toBe(false);
    // Sections and labels are computed at print time, so dropping one is a
    // new version, never an upgrade of an invoice already issued.
    expect(doc.version).toBe(5);
  });

  it("prints the rooms and their GST only, lettered A and B", () => {
    const table = invoiceTable(doc);
    expect(table.sections.map((s) => s.key)).toEqual(["rooms"]);
    expect(table.sections[0].totals.map((x) => x.label)).toEqual([
      "Room Charges Subtotal (A):",
      "GST @ 18% on A (B) - CGST 9% + SGST 9%:",
    ]);
    expect(table.closing).toEqual([{ label: "Grand Total (A+B):", amount: doc.grand_total }]);
    // The letters still add up to the figure they name.
    const figures = table.sections.flatMap((s) => s.totals.map((x) => x.amount));
    expect(figures.reduce((n, a) => n + a, 0)).toBe(doc.grand_total);
    // Two nights of a ₹2,000 room, GST included.
    expect(doc.grand_total).toBe(2 * 200_000);
  });

  it("charges nothing for meals even when the desk's counts say otherwise", () => {
    const typed = price(bageshri, { mealCounts: { breakfast: 9, lunch: 9, dinner: 9 } });
    expect(typed.meal_lines.map((l) => l.count)).toEqual([0, 0, 0]);
    expect(typed.subtotal_dining).toBe(0);
    expect(typed.gst_dining).toBe(0);
    expect(typed.grand_total).toBe(doc.grand_total);
    // Overwritten, not refused - a crafted payload must not be able to put a
    // charge into a section the invoice does not print.
    expect(invoiceTable(typed).sections.map((s) => s.key)).toEqual(["rooms"]);
  });

  it("offers no dining section for an additional charge, and refuses one", () => {
    expect(extraChargeSectionsFor({ kind: "stay", servesMeals: false })).toEqual(["room", "other"]);
    const refused = parseExtraCharges(
      [{ section: "dining", description: "Birthday cake", quantity: 1, amount: "300" }],
      { kind: "stay", servesMeals: false }
    );
    expect(refused).toMatchObject({ ok: false, error: expect.stringMatching(/does not serve meals/) });
    // And one that arrived anyway is left out of the figures.
    const cake: ExtraCharge[] = [
      { section: "dining", description: "Birthday cake", comment: null, quantity: 1, unit_price: 30_000 },
    ];
    const withCake = price(bageshri, { extraCharges: cake });
    expect(withCake.grand_total).toBe(doc.grand_total);
    expect(withCake.subtotal_dining).toBe(0);
  });

  it("says nothing about dining in the mail to Accounts", () => {
    const rows = factsOf(invoiceToAccounts(bageshri, { ...doc, invoice_number: "GH/2026-27/0007" }));
    expect(rows.map(([label]) => label)).toContain("Room charges");
    expect(rows.map(([label]) => label)).not.toContain("Dining charges");
  });
});

describe("a guest house with a kitchen is unchanged", () => {
  const doc = price(hamsanandi, { mealCounts: { breakfast: 2, lunch: 0, dinner: 2 } });

  it("still prints the dining section, lettered C and D", () => {
    expect(doc.serves_meals).toBe(true);
    expect(invoicePrintsDining(doc)).toBe(true);
    const table = invoiceTable(doc);
    expect(table.sections.map((s) => s.key)).toEqual(["rooms", "dining"]);
    expect(table.sections[1].totals.map((x) => x.label)).toEqual([
      "Dining Charges Subtotal (C):",
      "GST @ 5% on C (D) - CGST 2.5% + SGST 2.5%:",
    ]);
    expect(table.closing).toEqual([{ label: "Grand Total (A+B+C+D):", amount: doc.grand_total }]);
    // ₹80 × 2 + ₹100 × 2 on top of the rooms, GST included.
    expect(doc.grand_total).toBe(2 * 200_000 + 2 * 8_000 + 2 * 10_000);
  });

  it("offers all three sections for an additional charge", () => {
    expect(extraChargeSectionsFor({ kind: "stay", servesMeals: true })).toEqual(["room", "dining", "other"]);
    // A dining booking has no rooms to charge to - unchanged (24 Sep 2026).
    expect(extraChargeSectionsFor({ kind: "dining", servesMeals: true })).toEqual(["dining", "other"]);
  });

  it("names dining in the mail to Accounts", () => {
    const rows = factsOf(invoiceToAccounts(hamsanandi, { ...doc, invoice_number: "GH/2026-27/0008" }));
    expect(rows.map(([label]) => label)).toContain("Dining charges");
  });
});

/**
 * An invoice issued before the flag existed reprints exactly as it was
 * issued - three zero meal rows, a subtotal (C), GST (D) and a grand total
 * that names all four letters. This is the rule every invoice version turns
 * on: a snapshot is a record of what was handed over.
 */
describe("an invoice issued before this change", () => {
  it("still prints its dining section", () => {
    const issued: InvoiceDocument = { ...price(bageshri), version: 4, serves_meals: undefined };
    expect(invoicePrintsDining(issued)).toBe(true);
    const table = invoiceTable(issued);
    expect(table.sections.map((s) => s.key)).toEqual(["rooms", "dining"]);
    expect(table.sections[1].rows.map((r) => r.qty)).toEqual([0, 0, 0]);
    expect(table.closing).toEqual([{ label: "Grand Total (A+B+C+D):", amount: issued.grand_total }]);
  });
});

/** The rows of the one facts block in an email document. */
function factsOf(mail: ReturnType<typeof invoiceToAccounts>): [string, string][] {
  const block = mail.blocks.find((b) => b.kind === "facts");
  if (!block || block.kind !== "facts") throw new Error("no facts block");
  return block.rows;
}
