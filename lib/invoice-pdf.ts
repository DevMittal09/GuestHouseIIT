import { formatMoney, type Invoice } from "./invoice";

/**
 * The invoice as a PDF, drawn in the browser.
 *
 * Same reasoning as `lib/report-pdf.ts`: a real PDF server-side would mean
 * bundling a headless browser, and jsPDF is already here. The palette and the
 * header follow that file so a guest's invoice and the office's report look
 * like they came from the same institute.
 */
const AMBER: [number, number, number] = [247, 166, 0];
const INK: [number, number, number] = [43, 43, 43];
const MUTED: [number, number, number] = [107, 104, 98];
const RULE: [number, number, number] = [227, 225, 220];
const BAND: [number, number, number] = [250, 249, 247];

/**
 * jsPDF's built-in fonts are WinAnsi, so anything outside Latin-1 is dropped
 * rather than rendered as a box — including the rupee sign, which is why
 * amounts print as "INR 1,200" here and "₹1,200" on screen.
 */
function pdfSafe(text: string): string {
  return text
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/₹\s?/g, "INR ")
    .replace(/[^\x00-\xFF]/g, "");
}

export async function downloadInvoicePdf(invoice: Invoice, filename: string): Promise<void> {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 16;
  const contentWidth = pageWidth - margin * 2;
  let y = margin;

  doc.setFillColor(...AMBER);
  doc.rect(margin, y, contentWidth, 1.6, "F");
  y += 8;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(...MUTED);
  doc.text("INDIAN INSTITUTE OF TECHNOLOGY PALAKKAD", margin, y);

  doc.setFontSize(16);
  doc.setTextColor(...INK);
  doc.text("Guest House Invoice", margin, y + 8);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.text(pdfSafe(invoice.guestHouse), margin, y + 14);
  doc.text(pdfSafe(invoice.reference), pageWidth - margin, y + 1, { align: "right" });

  y += 22;

  doc.setFillColor(...BAND);
  doc.setDrawColor(...RULE);
  doc.setLineWidth(0.2);
  doc.rect(margin, y, contentWidth, 20, "FD");

  const facts: [string, string][] = [
    ["Guest", invoice.guestName],
    ["Category", invoice.category],
    ["Check-in", invoice.checkIn],
    ["Check-out", invoice.checkOut],
    ["Days charged", String(invoice.days)],
  ];
  facts.forEach(([label, value], i) => {
    const x = margin + 5 + (i % 2) * (contentWidth / 2);
    const row = y + 7 + Math.floor(i / 2) * 8;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(...MUTED);
    doc.text(label.toUpperCase(), x, row - 3.5);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...INK);
    doc.text(pdfSafe(value), x, row);
  });

  y += 26;

  autoTable(doc, {
    head: [["Item", "Qty", "Rate", "Amount"]],
    body: invoice.lines.map((l) => [
      pdfSafe(l.description),
      `${l.quantity} ${l.unit}`,
      pdfSafe(formatMoney(l.rate)),
      pdfSafe(formatMoney(l.amount)),
    ]),
    foot: [["", "", "Total", pdfSafe(formatMoney(invoice.total))]],
    startY: y,
    margin: { left: margin, right: margin },
    tableWidth: contentWidth,
    styles: {
      font: "helvetica",
      fontSize: 9,
      cellPadding: 2.5,
      overflow: "linebreak",
      lineColor: RULE,
      lineWidth: 0.1,
      textColor: INK,
    },
    headStyles: { fillColor: AMBER, textColor: [40, 26, 0], fontStyle: "bold" },
    footStyles: { fillColor: BAND, textColor: INK, fontStyle: "bold" },
    columnStyles: {
      0: { cellWidth: 88 },
      1: { cellWidth: 30, halign: "right" },
      2: { cellWidth: 25, halign: "right" },
      3: { cellWidth: 35, halign: "right" },
    },
  });

  const after = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable;
  const noteY = (after?.finalY ?? y) + 8;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  // The open charges first — they are what the desk still has to act on —
  // then the standing note about how the tariff is applied.
  const openLines = invoice.openCharges.map((c) => `- ${c}`);
  const body = [...openLines, invoice.note].join("\n");
  doc.text(doc.splitTextToSize(pdfSafe(body), contentWidth), margin, noteY);

  doc.setDrawColor(...RULE);
  doc.line(margin, pageHeight - 14, pageWidth - margin, pageHeight - 14);
  doc.setFontSize(7);
  doc.text(
    "IIT Palakkad Guest House - this statement is not a receipt and records no payment",
    margin,
    pageHeight - 9
  );

  doc.save(filename);
}
