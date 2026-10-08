import { describe, expect, it } from "vitest";
import {
  awaitingPayment,
  awaitingSettlement,
  buildInvoiceDocument,
  invoiceTable,
  PAYMENT_MODE_LABELS,
  PAYMENT_MODES,
  paymentModeError,
  paymentReferenceError,
  printsTaxLines,
  settlesAtCheckOut,
  UNSETTLED_WINDOW_DAYS,
  vacateBlocker,
  type InvoiceRecord,
} from "@/lib/invoice";
import { canOverrideVacatePayment } from "@/lib/access";
import { DEFAULT_RULES } from "@/lib/settings";
import type { Tariff } from "@/lib/tariffs";
import type { BookingLog, BookingWithDetails } from "@/lib/types";
import { booking, GH, guest, room } from "./helpers";

/**
 * The office's eighth list (7 Oct 2026), phase 3: the invoice's layout, cash
 * withdrawn, a personal stay settled at check-out, and the Awaiting payment
 * list that reaches back as far as it needs to.
 */

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
    effective_from: "2026-01-01",
    note: null,
    created_at: "2026-01-01T00:00:00.000Z",
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
  id: `l-${status}-${timestamp}`,
  booking_id: "b-1",
  previous_status: null,
  new_status: status,
  action_by: null,
  action_by_name: "Desk",
  remarks: null,
  timestamp,
});

/** One room, one night, two guests - the invoice's simplest real shape. */
const oneRoomStay = booking(
  {
    status: "VACATED",
    logs: [log("OCCUPIED", "2026-10-01T08:30:00.000Z"), log("VACATED", "2026-10-02T04:30:00.000Z")],
  },
  [{ guests: [guest({ name: "Prof. A" })], assigned: room({ id: "r-1", room_number: "201" }) }]
);

// ------------------------------------------------------------ the layout

describe("the invoice's layout", () => {
  const doc = buildInvoiceDocument(oneRoomStay, { tariffs: TARIFFS, rules: RULES, capacity: CAP });

  it("is version 4", () => {
    expect(doc.version).toBe(4);
  });

  /**
   * The office's words: "no empty rows, including in room charges". The
   * template had two ruled room rows, so a one-room stay printed a second,
   * blank one that read as a charge nobody had filled in.
   */
  it("has no blank rows anywhere, room charges included", () => {
    const table = invoiceTable(doc);
    for (const section of table.sections) {
      expect(section.minRows).toBe(0);
      // Nothing with no description: every row is a real charge.
      for (const row of section.rows) expect(row.label.trim()).not.toBe("");
    }
    // One room was booked, so the room section has exactly one row.
    expect(table.sections[0].key).toBe("rooms");
    expect(table.sections[0].rows).toHaveLength(1);
    // A version-3 snapshot still prints the template's second ruled row.
    expect(invoiceTable({ ...doc, version: 3 }).sections[0].minRows).toBe(2);
  });

  it("prints no tax lines under the GSTIN, and puts the split in the GST label", () => {
    expect(printsTaxLines(doc)).toBe(false);
    expect(printsTaxLines({ version: 3 })).toBe(true);
    const gstLabels = invoiceTable(doc)
      .sections.flatMap((s) => s.totals.map((x) => x.label))
      .filter((l) => l.startsWith("GST"));
    expect(gstLabels).toEqual([
      "GST @ 18% on A (B) - CGST 9% + SGST 9%:",
      "GST @ 5% on C (D) - CGST 2.5% + SGST 2.5%:",
    ]);
    // The breakdown is still computed - the snapshot keeps it - it is simply
    // not printed. Nothing is lost if the office asks for it back.
    expect((doc.gst_breakdown ?? []).length).toBeGreaterThan(0);
    // An older snapshot's labels are untouched, so a reprint is unchanged.
    const v3 = invoiceTable({ ...doc, version: 3 })
      .sections.flatMap((s) => s.totals.map((x) => x.label))
      .filter((l) => l.startsWith("GST"));
    expect(v3).toEqual(["GST @ 18% on A (B):", "GST @ 5% on C (D):"]);
  });
});

// ------------------------------------------------------------- cash is out

describe("cash is no longer accepted", () => {
  it("is off the list of modes, and refused with a message that says why", () => {
    expect(PAYMENT_MODES).toEqual(["upi", "account_transfer"]);
    expect(PAYMENT_MODES).not.toContain("cash");
    expect(paymentModeError("cash")).toMatch(/no longer accepted/);
    expect(paymentModeError("upi")).toBeNull();
    expect(paymentModeError("account_transfer")).toBeNull();
  });

  it("still reads an invoice that was paid in cash", () => {
    // A stored payment is a record of what happened, not a choice to re-make.
    expect(PAYMENT_MODE_LABELS.cash).toBe("Cash");
  });

  it("asks for a reference for both modes it does offer", () => {
    expect(paymentReferenceError("upi", "")).toMatch(/UPI transaction id/);
    expect(paymentReferenceError("account_transfer", "  ")).toMatch(/UTR/);
    expect(paymentReferenceError("upi", "123456789012")).toBeNull();
  });
});

// ----------------------------------------- a personal stay pays at check-out

describe("a personal stay is settled before the guest leaves", () => {
  const personal = (patch: Partial<BookingWithDetails> = {}) =>
    booking({ booking_type: "personal", status: "OCCUPIED", ...patch });
  const official = (patch: Partial<BookingWithDetails> = {}) =>
    booking({ booking_type: "official", status: "OCCUPIED", ...patch });
  const invoice = (status: InvoiceRecord["status"]) => ({ status });

  it("checks out through the invoice, unlike an official stay", () => {
    expect(settlesAtCheckOut(personal())).toBe(true);
    expect(settlesAtCheckOut(official())).toBe(false);
    expect(settlesAtCheckOut({ booking_type: "alumni", service_type: "room" })).toBe(false);
    // A dining booking never checks out at all.
    expect(settlesAtCheckOut({ booking_type: "personal", service_type: "meals_only" })).toBe(false);
  });

  it("cannot be vacated with no invoice, or with one that is not paid", () => {
    expect(vacateBlocker(personal(), [])).toMatch(/invoiced and paid for at check-out/);
    expect(vacateBlocker(personal(), [invoice("draft")])).toMatch(/invoiced and paid for/);
    expect(vacateBlocker(personal(), [invoice("issued")])).toMatch(/Record the payment/);
    expect(vacateBlocker(personal(), [invoice("paid")])).toBeNull();
    // A cancelled invoice reopens the bill.
    expect(vacateBlocker(personal(), [invoice("cancelled")])).not.toBeNull();
    // Reissued after a cancellation and then paid: settled.
    expect(vacateBlocker(personal(), [invoice("cancelled"), invoice("paid")])).toBeNull();
  });

  it("never stands in the way of an official or an alumni stay", () => {
    expect(vacateBlocker(official(), [])).toBeNull();
    expect(vacateBlocker({ booking_type: "alumni", service_type: "room" }, [])).toBeNull();
  });

  /**
   * The manager may close a stay off unpaid with a reason - an invoice that
   * cannot be issued at all must not leave a guest in the building on paper,
   * holding a room nobody can let. Reception may not: it is a decision about
   * money, not a record of what happened.
   */
  it("can be set aside by the manager and nobody else", () => {
    expect(canOverrideVacatePayment("gh_manager")).toBe(true);
    expect(canOverrideVacatePayment("developer")).toBe(true);
    expect(canOverrideVacatePayment("gh_caretaker")).toBe(false);
    expect(canOverrideVacatePayment("employee")).toBe(false);
  });
});

// ------------------------------------------------------ awaiting payment

describe("Awaiting payment", () => {
  const now = new Date("2026-10-07T06:30:00.000Z");
  const days = (n: number) => new Date(now.getTime() - n * 86_400_000).toISOString();

  const stay = (id: string, patch: Partial<BookingWithDetails> = {}) =>
    booking({
      id,
      booking_reference_id: `REF-${id}`,
      status: "VACATED",
      check_out: days(45),
      ...patch,
    });

  const inv = (
    bookingId: string,
    status: InvoiceRecord["status"],
    issuedAt: string | null
  ): Pick<InvoiceRecord, "booking_id" | "status" | "issued_at" | "invoice_number" | "grand_total"> => ({
    booking_id: bookingId,
    status,
    issued_at: issuedAt,
    invoice_number: `GH/2026-27/${bookingId}`,
    grand_total: 250_000,
  });

  /**
   * The point of the list, and the office's own test: a bill that has been
   * out for a month and a half is exactly the one that needs chasing, and
   * "Checked out - to bill" drops it after thirty days.
   */
  it("still holds an official invoice issued 45 days ago", () => {
    const b = stay("old", { booking_type: "official" });
    const rows = awaitingPayment([b], [inv("old", "issued", days(45))]);
    expect(rows.map((r) => r.booking.id)).toEqual(["old"]);
    expect(rows[0].invoice.invoice_number).toBe("GH/2026-27/old");

    // Whereas the desk's daily to-bill list has let it go, which is why this
    // list had to exist.
    expect(awaitingSettlement([b], [inv("old", "issued", days(45))], now)).toEqual([]);
    expect(UNSETTLED_WINDOW_DAYS).toBe(30);
  });

  it("leaves out what is paid, cancelled or never invoiced", () => {
    const bookings = [stay("paid"), stay("cancelled"), stay("none"), stay("issued")];
    const rows = awaitingPayment(bookings, [
      inv("paid", "issued", days(3)),
      inv("paid", "paid", days(3)),
      inv("cancelled", "cancelled", days(4)),
      inv("issued", "issued", days(1)),
    ]);
    expect(rows.map((r) => r.booking.id)).toEqual(["issued"]);
  });

  it("puts the most recently issued first, and keeps a dining booking", () => {
    const dining = stay("dining", {
      service_type: "meals_only",
      booking_type: "official",
      status: "APPROVED",
      meal_guest_count: 12,
    });
    const rows = awaitingPayment(
      [stay("a"), dining, stay("b")],
      [inv("a", "issued", days(10)), inv("dining", "issued", days(1)), inv("b", "issued", days(5))]
    );
    expect(rows.map((r) => r.booking.id)).toEqual(["dining", "b", "a"]);
  });

  it("takes the later invoice when a bill was cancelled and reissued", () => {
    const rows = awaitingPayment(
      [stay("re")],
      [inv("re", "cancelled", days(9)), inv("re", "issued", days(2))]
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].invoice.issued_at).toBe(days(2));
  });
});
