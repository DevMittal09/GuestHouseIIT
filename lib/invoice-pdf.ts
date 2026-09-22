import "server-only";
import { jsPDF } from "jspdf";
import {
  arimoBold,
  arimoRegular,
  hindiAddressPng,
  logoPng,
  wordmarkJpg,
} from "./invoice-assets.generated";
import {
  formatINR,
  formatInvoiceDate,
  gstBreakdownLines,
  gstRowLabel,
  GST_INCLUDED_NOTE,
  INVOICE_TITLE,
  PAYMENT_MODE_LABELS,
  type InvoiceDocument,
  type InvoiceRecord,
} from "./invoice";
import { MEAL_LABELS } from "./meals";
import { formatInstituteDate, formatInstituteDateTime } from "./tz";

/**
 * The invoice PDF, drawn on the server from an invoice's snapshot (Phase 5).
 *
 * It reproduces the office's template (`public/GHM_Invoice.docx`) to its
 * measurements: A4 with 12.7 mm margins, the two header images, a 185.5 mm
 * table whose columns are the template's grid (92.9 / 26.7 / 26.7 / 39.2 mm),
 * rows of at least 9.2 mm, the #B7B7B7 section bands and #D9D9D9 column heads,
 * and the bank-details box at the foot. Text is Arimo — metrically the
 * template's Arial, and unlike jsPDF's built-in fonts it has the rupee sign —
 * so ₹1,23,456.00 prints as itself.
 *
 * **The Hindi half of the address line is artwork**, rendered from the
 * template's own Palanquin Dark Bold: jsPDF cannot shape Devanagari (the
 * vowel sign in "कि" goes before its consonant, conjuncts join), so drawing it
 * as text would print it wrong. The old `pdfSafe()` stripped anything outside
 * Latin-1 and is gone from this file for that reason.
 *
 * Drawn here rather than in the browser so the same bytes are printed at the
 * desk, downloaded from the dashboard and attached to the mail to Accounts.
 */

const MM_PER_TWIP = 25.4 / 1440;
const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 720 * MM_PER_TWIP; // 12.7
const TABLE_X = MARGIN - 0.45;
const COLS = [5265, 1515, 1515, 2220].map((t) => t * MM_PER_TWIP); // 92.9, 26.7, 26.7, 39.2
const TABLE_W = COLS.reduce((a, b) => a + b, 0);
const ROW_H = 520 * MM_PER_TWIP; // 9.17
const PAD = 1.9;
const BAND: [number, number, number] = [0xb7, 0xb7, 0xb7];
const HEAD: [number, number, number] = [0xd9, 0xd9, 0xd9];
const BODY_PT = 11;
const PT = 25.4 / 72;

type Stamp = Pick<InvoiceRecord, "status" | "payment_mode" | "payment_reference" | "paid_at" | "cancel_reason" | "cancelled_at">;

function setup(): jsPDF {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
  // Each weight under its own PostScript name: registered as one family, both
  // are embedded as "/Arimo" and a viewer may draw the bold with the regular.
  doc.addFileToVFS("Arimo-Regular.ttf", arimoRegular);
  doc.addFont("Arimo-Regular.ttf", "Arimo-Regular", "normal");
  doc.addFileToVFS("Arimo-Bold.ttf", arimoBold);
  doc.addFont("Arimo-Bold.ttf", "Arimo-Bold", "normal");
  doc.setLineWidth(0.2);
  doc.setDrawColor(0, 0, 0);
  doc.setTextColor(0, 0, 0);
  return doc;
}

function font(doc: jsPDF, style: "normal" | "bold", size = BODY_PT) {
  doc.setFont(style === "bold" ? "Arimo-Bold" : "Arimo-Regular", "normal");
  doc.setFontSize(size);
}

/** A cell: optional fill, border, and text laid out inside with padding. */
function cell(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  text: string | string[],
  opts: { fill?: [number, number, number]; bold?: boolean; align?: "left" | "center" | "right"; size?: number } = {}
) {
  if (opts.fill) {
    doc.setFillColor(...opts.fill);
    doc.rect(x, y, w, h, "FD");
  } else {
    doc.rect(x, y, w, h, "S");
  }
  font(doc, opts.bold ? "bold" : "normal", opts.size ?? BODY_PT);
  const lines = Array.isArray(text) ? text : doc.splitTextToSize(text, w - PAD * 2);
  const lineH = (opts.size ?? BODY_PT) * PT * 1.15;
  const blockH = lines.length * lineH;
  let ty = y + (h - blockH) / 2 + lineH * 0.78;
  const align = opts.align ?? "left";
  const tx = align === "left" ? x + PAD : align === "center" ? x + w / 2 : x + w - PAD;
  for (const line of lines) {
    doc.text(line, tx, ty, { align });
    ty += lineH;
  }
}

/** Height a cell needs for `text` at the body size, never less than a template row. */
function rowHeight(doc: jsPDF, text: string, w: number): number {
  font(doc, "normal");
  const lines = doc.splitTextToSize(text, w - PAD * 2).length;
  return Math.max(ROW_H, lines * BODY_PT * PT * 1.15 + 3);
}

function header(doc: jsPDF, invoice: InvoiceDocument): number {
  // word/header1.xml: the wordmark inline (4014788 × 922190 EMU), the logo
  // anchored 5314950 EMU from the column (1190625 × 934734 EMU).
  const emu = (n: number) => n / 36000;
  doc.addImage(wordmarkJpg, "JPEG", MARGIN + 180 * MM_PER_TWIP, 2.6, emu(4014788), emu(922190));
  doc.addImage(logoPng, "PNG", MARGIN + emu(5314950) - 3.2, 3.4, emu(1190625), emu(934734));
  font(doc, "bold");
  const y = 32;
  doc.text(INVOICE_TITLE(invoice.guest_house), PAGE_W / 2, y, { align: "center" });
  return y + 2.2;
}

function details(doc: jsPDF, invoice: InvoiceDocument, top: number): number {
  const leftW = COLS[0];
  const rightW = TABLE_W - leftW;
  const bandH = 7.4;
  cell(doc, TABLE_X, top, leftW, bandH, "Booking Details", { fill: BAND, bold: true });
  cell(doc, TABLE_X + leftW, top, rightW, bandH, "Invoice Details", { fill: BAND, bold: true });

  const left: [string, string][] = [
    ["Booked By (Name) : ", invoice.booked_by],
    ["Department/Section/Institute: ", invoice.unit],
    ["Debitable head: ", invoice.debit_head_label],
    ["Project Detail: ", invoice.project_title ?? ""],
    ["Project Number: ", invoice.project_number ?? ""],
  ];
  const right: [string, string][] = [
    ["Invoice No.: ", invoice.invoice_number ?? "DRAFT — not yet issued"],
    ["Invoice Date: ", formatInvoiceDate(invoice.invoice_date)],
    ["Primary Guest Name: ", invoice.primary_guest],
    ["Check-In Date & Time: ", formatInstituteDateTime(invoice.check_in)],
    ["Check-Out Date & Time: ", formatInstituteDateTime(invoice.check_out)],
    ["No. of Room(s) : ", String(invoice.rooms)],
    ["No. of Guests(s): ", String(invoice.guests)],
    ["No. of Infants(s): ", String(invoice.infants)],
  ];

  // Each fact is "Label: value" on one paragraph, wrapping inside its column,
  // with the template's 3 pt before and after.
  const lineH = BODY_PT * PT * 1.15;
  const para = 60 * MM_PER_TWIP;
  const layout = (facts: [string, string][], w: number) =>
    facts.map(([label, value]) => {
      font(doc, "normal");
      return doc.splitTextToSize(`${label}${value}`, w - PAD * 2) as string[];
    });
  const leftLines = layout(left, leftW);
  const rightLines = layout(right, rightW);
  const heightOf = (paras: string[][]) =>
    paras.reduce((h, lines) => h + lines.length * lineH + para * 2, 0) + 2;
  const h = Math.max(2602.76 * MM_PER_TWIP, heightOf(leftLines), heightOf(rightLines));
  const y0 = top + bandH;
  doc.rect(TABLE_X, y0, leftW, h, "S");
  doc.rect(TABLE_X + leftW, y0, rightW, h, "S");

  // Label and value in the same regular weight, as the template has them.
  const draw = (paras: string[][], x: number) => {
    let y = y0 + 1;
    font(doc, "normal");
    for (const lines of paras) {
      y += para;
      for (const line of lines) {
        doc.text(line, x + PAD, y + lineH * 0.8);
        y += lineH;
      }
      y += para;
    }
  };
  draw(leftLines, TABLE_X);
  draw(rightLines, TABLE_X + leftW);
  return y0 + h;
}

function tariffTables(doc: jsPDF, invoice: InvoiceDocument, top: number): number {
  const xs = [TABLE_X, TABLE_X + COLS[0], TABLE_X + COLS[0] + COLS[1], TABLE_X + COLS[0] + COLS[1] + COLS[2]];
  let y = top;
  cell(doc, TABLE_X, y, TABLE_W, ROW_H, "Tariff Details", { fill: BAND, bold: true, align: "center" });
  y += ROW_H;

  const headRow = (first: string, second: string) => {
    cell(doc, xs[0], y, COLS[0], ROW_H, first, { fill: HEAD, bold: true, align: "center" });
    cell(doc, xs[1], y, COLS[1], ROW_H, second, { fill: HEAD, bold: true, align: "center" });
    cell(doc, xs[2], y, COLS[2], ROW_H, "Tariff", { fill: HEAD, bold: true, align: "center" });
    cell(doc, xs[3], y, COLS[3], ROW_H, "Amount", { fill: HEAD, bold: true, align: "center" });
    y += ROW_H;
  };
  const bodyRow = (label: string, qty: string, rate: string, amount: string) => {
    const h = rowHeight(doc, label, COLS[0]);
    cell(doc, xs[0], y, COLS[0], h, label);
    cell(doc, xs[1], y, COLS[1], h, qty, { align: "center" });
    cell(doc, xs[2], y, COLS[2], h, rate, { align: "right" });
    cell(doc, xs[3], y, COLS[3], h, amount, { align: "right" });
    y += h;
  };
  const totalRow = (label: string, amount: string) => {
    cell(doc, xs[0], y, COLS[0] + COLS[1] + COLS[2], ROW_H, label, { bold: true, align: "right" });
    cell(doc, xs[3], y, COLS[3], ROW_H, amount, { bold: true, align: "right" });
    y += ROW_H;
  };

  headRow("Room Details (with additional bed details)", "Day(s)");
  for (const line of invoice.room_lines) {
    bodyRow(line.description, String(line.days), line.rate === null ? "—" : formatINR(line.rate), formatINR(line.amount));
  }
  // The template has two ruled rows; a one-room stay keeps the second, blank.
  for (let i = invoice.room_lines.length; i < 2; i++) bodyRow("", "", "", "");
  totalRow("Sub Total (A):", formatINR(invoice.subtotal_rooms));

  headRow("Dining Charges Details", "No(s)");
  for (const line of invoice.meal_lines) {
    bodyRow(
      MEAL_LABELS[line.meal],
      String(line.count),
      line.rate === null ? "—" : formatINR(line.rate),
      formatINR(line.amount)
    );
  }
  totalRow("Sub Total (B):", formatINR(invoice.subtotal_dining));
  totalRow("Total (A+B)", formatINR(invoice.total));
  totalRow(gstRowLabel(invoice), formatINR(invoice.gst));
  totalRow("Grand Total (A+B including GST):", formatINR(invoice.grand_total));
  return y;
}

function signatures(doc: jsPDF, invoice: InvoiceDocument, top: number, stamp: Stamp | null) {
  font(doc, "bold", 10);
  doc.text(`GSTIN No.:${invoice.gstin}`, MARGIN + 1.3, top + 5);
  // The tax breakdown a tax invoice needs: taxable value and CGST / SGST per
  // SAC and rate. Snapshots from before it existed have none.
  const lines = [
    ...gstBreakdownLines(invoice),
    ...(invoice.prices_include_gst ? [GST_INCLUDED_NOTE] : []),
  ];
  font(doc, "normal", 8);
  lines.forEach((line, i) => doc.text(line, MARGIN + 1.3, top + 9.5 + i * 3.6));
  const sigY = Math.max(top + 18, top + 9.5 + lines.length * 3.6 + 8);
  font(doc, "bold", 10);
  doc.text("Signature of the guest", MARGIN + 1.3, sigY);
  doc.text("Authorised signatory", PAGE_W - MARGIN - 1.3, sigY, { align: "right" });

  if (stamp?.status === "paid" && stamp.payment_mode) {
    doc.setTextColor(0x1b, 0x6b, 0x2f);
    font(doc, "bold", 9);
    const ref = stamp.payment_reference ? ` · Ref ${stamp.payment_reference}` : "";
    doc.text(
      `PAID · ${PAYMENT_MODE_LABELS[stamp.payment_mode]}${ref} · ${stamp.paid_at ? formatInstituteDate(stamp.paid_at) : ""}`,
      PAGE_W - MARGIN - 1.3,
      top + 5,
      { align: "right" }
    );
    doc.setTextColor(0, 0, 0);
  }
}

function footer(doc: jsPDF, invoice: InvoiceDocument) {
  // word/footer1.xml: a ruled box, bank details over the address line.
  const x = MARGIN - 0.45;
  const w = TABLE_W;
  const top = 260.4;
  const addressH = 8;
  const bankH = 20.1;
  doc.rect(x, top, w, bankH + addressH, "S");
  doc.line(x, top + bankH, x + w, top + bankH);

  const b = invoice.bank;
  const lineH = 4.1;
  let y = top + 4.2;
  font(doc, "bold", BODY_PT);
  doc.text("Bank Account details:", x + PAD, y);
  font(doc, "normal", BODY_PT);
  y += lineH;
  doc.text(`Account Holder Name: ${b.account_holder}`, x + PAD, y);
  y += lineH;
  doc.text(`A/C No: ${b.account_number}`, x + PAD, y);
  doc.text(`IFSC Code: ${b.ifsc}`, x + 129, y);
  y += lineH;
  doc.text(`BANK NAME: ${b.bank_name}`, x + PAD, y);
  doc.text(`BRANCH: ${b.branch}`, x + 129, y);

  // "Kanjikode West, Palakkad, Kerala | <Hindi> | Phone: …  Email: …", centred.
  const size = 8;
  const baseline = top + bankH + addressH / 2 + 1.2;
  // The Latin parts are set in Arimo Bold rather than the template's Palanquin
  // Dark: a viewer that substitutes Palanquin draws it wider than jsPDF
  // measured it, and the text then runs into the artwork.
  const lead = `${invoice.contact.address} | `;
  const sep = " | ";
  const tail = `Phone: ${invoice.contact.phone}  Email: ${invoice.contact.email}`;
  font(doc, "bold", size);
  const leadW = doc.getTextWidth(lead);
  const sepW = doc.getTextWidth(sep);
  const tailW = doc.getTextWidth(tail);
  // hindi-address.png: 1914 × 122 px, rendered at 3× for 32 px type.
  const em = size * PT;
  const hindiH = (122 / 3 / 32) * em;
  const hindiW = (1914 / 3 / 32) * em;
  const gap = 0.6;
  const total = leadW + gap + hindiW + gap + sepW + tailW;
  let cx = x + (w - total) / 2;
  doc.text(lead, cx, baseline);
  cx += leadW + gap;
  doc.addImage(hindiAddressPng, "PNG", cx, baseline - hindiH * 0.74, hindiW, hindiH);
  cx += hindiW + gap;
  doc.text(sep, cx, baseline);
  cx += sepW;
  doc.text(tail, cx, baseline);
}

function watermark(doc: jsPDF, text: string, color: [number, number, number]) {
  doc.saveGraphicsState();
  doc.setGState(doc.GState({ opacity: 0.12 }));
  doc.setTextColor(...color);
  font(doc, "bold", 64);
  doc.text(text, PAGE_W / 2, PAGE_H / 2, { align: "center", angle: 35 });
  doc.restoreGraphicsState();
  doc.setTextColor(0, 0, 0);
}

/**
 * The PDF for an invoice. `stamp` is the record's current state — the
 * snapshot is fixed, but whether it has since been paid or cancelled is shown
 * on the page. A preview (no number yet) is marked DRAFT across the page.
 */
export function renderInvoicePdf(invoice: InvoiceDocument, stamp: Stamp | null = null): Uint8Array {
  const doc = setup();
  doc.setProperties({
    title: invoice.invoice_number ? `Invoice ${invoice.invoice_number}` : `Invoice draft ${invoice.booking_reference}`,
    subject: INVOICE_TITLE(invoice.guest_house),
    author: "IIT Palakkad Guest House",
    creator: "IIT Palakkad Guest House portal",
  });
  let y = header(doc, invoice);
  y = details(doc, invoice, y);
  y = tariffTables(doc, invoice, y);
  signatures(doc, invoice, y, stamp);
  footer(doc, invoice);

  if (!invoice.invoice_number) watermark(doc, "DRAFT", [0x80, 0x80, 0x80]);
  if (stamp?.status === "cancelled") {
    watermark(doc, "CANCELLED", [0xb0, 0x00, 0x00]);
    font(doc, "normal", 8);
    doc.setTextColor(0xb0, 0, 0);
    doc.text(
      `Cancelled ${stamp.cancelled_at ? formatInstituteDate(stamp.cancelled_at) : ""}: ${stamp.cancel_reason ?? ""}`,
      PAGE_W / 2,
      256,
      { align: "center", maxWidth: TABLE_W }
    );
    doc.setTextColor(0, 0, 0);
  }
  return new Uint8Array(doc.output("arraybuffer"));
}

/** "invoice-GH-2026-27-0001.pdf" — slashes are not allowed in a filename. */
export function invoiceFilename(invoice: InvoiceDocument): string {
  const id = invoice.invoice_number ?? `draft-${invoice.booking_reference}`;
  return `invoice-${id.replace(/[^A-Za-z0-9-]+/g, "-")}.pdf`;
}
