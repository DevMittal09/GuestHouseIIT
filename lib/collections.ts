import { csvLine } from "./csv";
import {
  formatINR,
  INVOICE_STATUS_LABELS,
  PAYMENT_MODE_LABELS,
  PAYMENT_MODES,
  toPaise,
  type InvoiceRecord,
} from "./invoice";
import { dateValueOf, formatInstituteDate, formatInstituteDateTime, instituteDayBounds, parseDateValue } from "./tz";

/**
 * The monthly collections report (Phase 5), exported from /history: every
 * invoice issued in the month and every payment received in it, with totals
 * by payment mode and by debitable head. Pure — the action reads the store and
 * hands the rows here.
 */

/** "2026-09" → the month's bounds as instants, institute time. */
export function monthBounds(month: string): { from: string; to: string } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m) return null;
  const year = Number(m[1]);
  const mon = Number(m[2]);
  if (mon < 1 || mon > 12) return null;
  const first = dateValueOf(year, mon, 1);
  const next = dateValueOf(year, mon + 1, 1);
  if (!parseDateValue(first)) return null;
  return {
    from: instituteDayBounds(first).start.toISOString(),
    to: instituteDayBounds(next).start.toISOString(),
  };
}

export type CollectionsSummary = {
  issuedCount: number;
  /** Paise. Issued in the month and not cancelled. */
  issuedTotal: number;
  cancelledCount: number;
  /** Paise received in the month, by mode. */
  collectedByMode: Record<string, number>;
  collectedTotal: number;
  /** Paise issued in the month and still unpaid. */
  outstanding: number;
  /** Paise issued in the month, by debitable head. */
  byHead: Record<string, number>;
};

export function summariseCollections(
  invoices: InvoiceRecord[],
  bounds: { from: string; to: string }
): CollectionsSummary {
  const inMonth = (at: string | null) => at !== null && at >= bounds.from && at < bounds.to;
  const issued = invoices.filter((i) => inMonth(i.issued_at));
  const live = issued.filter((i) => i.status !== "cancelled");
  const collectedByMode: Record<string, number> = Object.fromEntries(PAYMENT_MODES.map((m) => [m, 0]));
  let collectedTotal = 0;
  for (const i of invoices) {
    if (i.status === "paid" && inMonth(i.paid_at) && i.payment_mode) {
      collectedByMode[i.payment_mode] += toPaise(i.grand_total);
      collectedTotal += toPaise(i.grand_total);
    }
  }
  const byHead: Record<string, number> = {};
  for (const i of live) {
    const head = i.document?.debit_head_label ?? "Not recorded";
    byHead[head] = (byHead[head] ?? 0) + toPaise(i.grand_total);
  }
  return {
    issuedCount: live.length,
    issuedTotal: live.reduce((n, i) => n + toPaise(i.grand_total), 0),
    cancelledCount: issued.length - live.length,
    collectedByMode,
    collectedTotal,
    outstanding: live.filter((i) => i.status === "issued").reduce((n, i) => n + toPaise(i.grand_total), 0),
    byHead,
  };
}

const COLUMNS = [
  "Invoice No.",
  "Invoice date",
  "Status",
  "Booking",
  "Guest house",
  "Booked by",
  "Department/Section/Institute",
  "Debitable head",
  "Project number",
  "Rooms (A)",
  "Dining (B)",
  "GST",
  "Grand total",
  "Payment mode",
  "Payment reference",
  "Paid on",
  "Cancellation reason",
];

/** Rupees as a plain number for a spreadsheet: 1234.5 → "1234.50". */
function amount(rupees: number): string {
  return rupees.toFixed(2);
}

export function collectionsCsv(invoices: InvoiceRecord[], month: string, bounds: { from: string; to: string }): string {
  const inMonth = (at: string | null) => at !== null && at >= bounds.from && at < bounds.to;
  const rows = invoices
    .filter((i) => i.status !== "draft" && (inMonth(i.issued_at) || inMonth(i.paid_at)))
    .sort((a, b) => (a.fy ?? "").localeCompare(b.fy ?? "") || (a.seq ?? 0) - (b.seq ?? 0));
  const s = summariseCollections(invoices, bounds);
  const lines = [
    csvLine(COLUMNS),
    ...rows.map((i) =>
      csvLine([
        i.invoice_number,
        i.issued_at ? formatInstituteDate(i.issued_at) : "",
        INVOICE_STATUS_LABELS[i.status],
        i.document?.booking_reference,
        i.document?.guest_house,
        i.document?.booked_by,
        i.document?.unit,
        i.document?.debit_head_label,
        i.project_number,
        amount(i.subtotal_rooms),
        amount(i.subtotal_dining),
        amount(i.gst_amount),
        amount(i.grand_total),
        i.payment_mode ? PAYMENT_MODE_LABELS[i.payment_mode] : "",
        i.payment_reference,
        i.paid_at ? formatInstituteDateTime(i.paid_at) : "",
        i.cancel_reason,
      ])
    ),
    "",
    csvLine([`Summary for ${month}`]),
    csvLine(["Invoices issued (not cancelled)", s.issuedCount, formatINR(s.issuedTotal)]),
    csvLine(["Invoices cancelled", s.cancelledCount]),
    ...PAYMENT_MODES.map((m) => csvLine([`Collected — ${PAYMENT_MODE_LABELS[m]}`, "", formatINR(s.collectedByMode[m])])),
    csvLine(["Collected — total", "", formatINR(s.collectedTotal)]),
    csvLine(["Issued this month, still unpaid", "", formatINR(s.outstanding)]),
    ...Object.entries(s.byHead).map(([head, paise]) => csvLine([`Issued — ${head}`, "", formatINR(paise)])),
  ];
  return lines.join("\r\n");
}
