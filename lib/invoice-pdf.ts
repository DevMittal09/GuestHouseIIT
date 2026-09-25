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
  gstBreakdownLines,
  GST_INCLUDED_NOTE,
  INVOICE_TITLE,
  invoiceFacts,
  invoiceTable,
  PAYMENT_MODE_LABELS,
  type InvoiceDocument,
  type InvoiceRecord,
} from "./invoice";
import { formatInstituteDate } from "./tz";

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
 *
 * **The table is `invoiceTable()`**, the same description the desk's preview
 * draws, so version 1 snapshots reprint as issued and version 2 invoices carry
 * the revised template's per-section GST. A table the desk's additional
 * charges make longer than the page continues on the next one; the bank
 * details are printed at the foot of every page.
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
const NOTE_PT = 9;
const PT = 25.4 / 72;
/** Where the footer's box starts, less a gap: the table stops above it. */
const CONTENT_BOTTOM = 258;
/** Where a continuation page starts. */
const CONTINUED_TOP = MARGIN + 4;

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

  // One list of facts for this and the desk's preview (`invoiceFacts`):
  // project rows only with the Project head, no room facts on dining.
  const { left, right } = invoiceFacts(invoice);

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

/** The running y position, moved to a new page when the next block will not fit. */
type Cursor = { y: number };

function room(doc: jsPDF, at: Cursor, h: number) {
  if (at.y + h <= CONTENT_BOTTOM) return;
  doc.addPage();
  at.y = CONTINUED_TOP;
}

/** A label with an optional smaller note beneath it (an additional charge's comment). */
function labelLines(doc: jsPDF, label: string, note: string | null, w: number) {
  font(doc, "normal");
  const main = doc.splitTextToSize(label, w - PAD * 2) as string[];
  font(doc, "normal", NOTE_PT);
  const sub = note ? (doc.splitTextToSize(note, w - PAD * 2) as string[]) : [];
  const h = main.length * BODY_PT * PT * 1.15 + sub.length * NOTE_PT * PT * 1.15;
  return { main, sub, h: Math.max(ROW_H, h + 3) };
}

function labelCell(doc: jsPDF, x: number, y: number, w: number, lines: ReturnType<typeof labelLines>) {
  doc.rect(x, y, w, lines.h, "S");
  const bodyH = BODY_PT * PT * 1.15;
  const noteH = NOTE_PT * PT * 1.15;
  const blockH = lines.main.length * bodyH + lines.sub.length * noteH;
  let ty = y + (lines.h - blockH) / 2;
  font(doc, "normal");
  for (const line of lines.main) {
    doc.text(line, x + PAD, ty + bodyH * 0.78);
    ty += bodyH;
  }
  font(doc, "normal", NOTE_PT);
  doc.setTextColor(0x44, 0x44, 0x44);
  for (const line of lines.sub) {
    doc.text(line, x + PAD, ty + noteH * 0.78);
    ty += noteH;
  }
  doc.setTextColor(0, 0, 0);
}

function tariffTables(doc: jsPDF, invoice: InvoiceDocument, top: number): number {
  const xs = [TABLE_X, TABLE_X + COLS[0], TABLE_X + COLS[0] + COLS[1], TABLE_X + COLS[0] + COLS[1] + COLS[2]];
  const at: Cursor = { y: top };
  const table = invoiceTable(invoice);
  room(doc, at, ROW_H * 3);
  cell(doc, TABLE_X, at.y, TABLE_W, ROW_H, "Tariff Details", { fill: BAND, bold: true, align: "center" });
  at.y += ROW_H;

  const headRow = (first: string, second: string) => {
    // A heading is never left alone at the foot of a page.
    room(doc, at, ROW_H * 2);
    cell(doc, xs[0], at.y, COLS[0], ROW_H, first, { fill: HEAD, bold: true, align: "center" });
    cell(doc, xs[1], at.y, COLS[1], ROW_H, second, { fill: HEAD, bold: true, align: "center" });
    cell(doc, xs[2], at.y, COLS[2], ROW_H, table.rateHeading, { fill: HEAD, bold: true, align: "center" });
    cell(doc, xs[3], at.y, COLS[3], ROW_H, "Amount", { fill: HEAD, bold: true, align: "center" });
    at.y += ROW_H;
  };
  const bodyRow = (label: string, note: string | null, qty: string, rate: string, amount: string) => {
    const lines = labelLines(doc, label, note, COLS[0]);
    room(doc, at, lines.h);
    labelCell(doc, xs[0], at.y, COLS[0], lines);
    cell(doc, xs[1], at.y, COLS[1], lines.h, qty, { align: "center" });
    cell(doc, xs[2], at.y, COLS[2], lines.h, rate, { align: "right" });
    cell(doc, xs[3], at.y, COLS[3], lines.h, amount, { align: "right" });
    at.y += lines.h;
  };
  const totalRow = (label: string, amount: string) => {
    room(doc, at, ROW_H);
    cell(doc, xs[0], at.y, COLS[0] + COLS[1] + COLS[2], ROW_H, label, { bold: true, align: "right" });
    cell(doc, xs[3], at.y, COLS[3], ROW_H, amount, { bold: true, align: "right" });
    at.y += ROW_H;
  };

  // A dining booking had no room, so its invoice has no room table — only
  // the meals (24 Sep 2026). `invoiceTable` leaves the section out.
  for (const section of table.sections) {
    headRow(section.heading, section.qtyHeading);
    for (const row of section.rows) {
      bodyRow(row.label, row.note, String(row.qty), row.rate === null ? "—" : formatINR(row.rate), formatINR(row.amount));
    }
    // The template has two ruled room rows; a one-room stay keeps the second, blank.
    for (let i = section.rows.length; i < section.minRows; i++) bodyRow("", null, "", "", "");
    for (const t of section.totals) totalRow(t.label, formatINR(t.amount));
  }
  for (const t of table.closing) totalRow(t.label, formatINR(t.amount));
  return at.y;
}

function signatures(doc: jsPDF, invoice: InvoiceDocument, start: number, stamp: Stamp | null) {
  // The tax breakdown a tax invoice needs: taxable value and CGST / SGST per
  // SAC and rate. Snapshots from before it existed have none.
  const lines = [
    ...gstBreakdownLines(invoice),
    ...(invoice.prices_include_gst ? [GST_INCLUDED_NOTE] : []),
  ];
  const at: Cursor = { y: start };
  room(doc, at, Math.max(18, 9.5 + lines.length * 3.6 + 8) + 2);
  const top = at.y;
  font(doc, "bold", 10);
  doc.text(`GSTIN No.:${invoice.gstin}`, MARGIN + 1.3, top + 5);
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

  // The bank details and any watermark on every page, once the table has
  // decided how many there are.
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page);
    footer(doc, invoice);
    if (pages > 1) {
      font(doc, "normal", 8);
      doc.text(`Page ${page} of ${pages}`, PAGE_W - MARGIN, PAGE_H - 4, { align: "right" });
    }
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
  }
  return new Uint8Array(doc.output("arraybuffer"));
}

/** "invoice-GH-2026-27-0001.pdf" — slashes are not allowed in a filename. */
export function invoiceFilename(invoice: InvoiceDocument): string {
  const id = invoice.invoice_number ?? `draft-${invoice.booking_reference}`;
  return `invoice-${id.replace(/[^A-Za-z0-9-]+/g, "-")}.pdf`;
}
