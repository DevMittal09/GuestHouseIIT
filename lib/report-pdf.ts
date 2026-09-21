import type { HistoryReport, ReportRow } from "@/app/actions/history-pdf";

/**
 * Draws the booking report as a genuine PDF in the browser.
 *
 * The previous version handed the browser a styled HTML document, opened it in
 * a popup and called print(), which meant popup blockers, an .html file named
 * like a report, and a "now choose Save as PDF" instruction. jsPDF is imported
 * dynamically so none of it lands in the main bundle — only a manager or
 * developer clicking Export ever downloads it.
 */

const AMBER: [number, number, number] = [247, 166, 0];
const INK: [number, number, number] = [43, 43, 43];
const MUTED: [number, number, number] = [120, 116, 110];
const RULE: [number, number, number] = [227, 225, 220];
const BAND: [number, number, number] = [250, 249, 247];

/** Status colours, keyed by the words that appear in STATUS_LABELS. */
function statusColour(label: string): [number, number, number] {
  if (label.includes("Rejected")) return [185, 28, 28];
  if (label.includes("Cancel")) return [146, 64, 14];
  if (label === "Approved" || label === "Occupied") return [21, 128, 61];
  if (label === "Vacated") return [55, 65, 81];
  return [161, 98, 7]; // pending tiers
}

/**
 * jsPDF's built-in fonts are WinAnsi (Latin-1). Map the typographic
 * characters this app actually emits, and drop anything else that would
 * otherwise render as mojibake.
 */
function pdfSafe(text: string): string {
  return text
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/·/g, "-")
    .replace(/[^\x00-\xFF]/g, "");
}

/**
 * The table's columns and their millimetre widths, which must add up to the
 * content width of an A4 landscape page (273 mm) — autoTable will not shrink
 * them for you, it overflows the margin instead.
 *
 * "Svc" and "Meals" were added when meals became bookable without a room; the
 * widths either side of them were trimmed to pay for it. Passport details are
 * **not** a column: they are blank on almost every row, so they go in their
 * own appendix after the table.
 */
const COLUMNS: { header: string; key: keyof ReportRow; width: number }[] = [
  { header: "Reference", key: "reference", width: 25 },
  { header: "Requester", key: "requester", width: 24 },
  { header: "Category", key: "category", width: 16 },
  { header: "House", key: "guestHouse", width: 18 },
  { header: "Svc", key: "service", width: 13 },
  { header: "Check-in", key: "checkIn", width: 23 },
  { header: "Check-out", key: "checkOut", width: 23 },
  { header: "Nt", key: "nights", width: 8 },
  { header: "Rooms", key: "rooms", width: 18 },
  { header: "Party", key: "party", width: 11 },
  { header: "Meals", key: "mealPreference", width: 12 },
  { header: "Status", key: "status", width: 20 },
  { header: "Head", key: "debitHead", width: 14 },
  { header: "Guests", key: "guestNames", width: 24 },
  { header: "Purpose", key: "purpose", width: 24 },
];

const STATUS_COLUMN = COLUMNS.findIndex((c) => c.key === "status");

export async function downloadHistoryPdf(report: HistoryReport, filename: string): Promise<void> {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 12;
  const contentWidth = pageWidth - margin * 2;

  // ---------------------------------------------------------------- cover
  let y = margin;

  doc.setFillColor(...AMBER);
  doc.rect(margin, y, contentWidth, 1.6, "F");
  y += 7;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(...MUTED);
  doc.text("INDIAN INSTITUTE OF TECHNOLOGY PALAKKAD", margin, y);

  doc.setFontSize(15);
  doc.setTextColor(...INK);
  doc.text("Guest House Booking Report", margin, y + 7);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  doc.text(pdfSafe(report.subtitle), margin, y + 12.5);

  // Right-aligned provenance, so a printed copy says who ran it and when.
  const metaLines = [
    `Generated ${pdfSafe(report.generatedAt)}`,
    `By ${pdfSafe(report.generatedBy)}`,
  ];
  doc.setFontSize(7.5);
  metaLines.forEach((line, i) => {
    doc.text(line, pageWidth - margin, y + 1 + i * 4, { align: "right" });
  });

  y += 18;

  // ---------------------------------------------------------------- summary
  const boxHeight = 15;
  doc.setFillColor(...BAND);
  doc.setDrawColor(...RULE);
  doc.setLineWidth(0.2);
  doc.rect(margin, y, contentWidth, boxHeight, "FD");

  const stats: [string, string][] = [
    ["Bookings", String(report.totals.bookings)],
    ["Guests", String(report.totals.guests)],
    ["With infants", String(report.totals.withInfants)],
    ["Room-nights", String(report.totals.roomNights)],
  ];
  stats.forEach(([label, value], i) => {
    const x = margin + 5 + i * 26;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(...INK);
    doc.text(value, x, y + 7);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(...MUTED);
    doc.text(label.toUpperCase(), x, y + 11.5);
  });

  // Status breakdown, wrapped into the remaining width of the band.
  const breakdownX = margin + 5 + stats.length * 26;
  doc.setFontSize(7);
  doc.setTextColor(...MUTED);
  doc.text("BY STATUS", breakdownX, y + 4.5);
  doc.setFontSize(7.5);
  const summaryText =
    report.statusSummary.length > 0
      ? report.statusSummary.map((s) => `${pdfSafe(s.label)}: ${s.count}`).join("    ")
      : "No bookings matched.";
  doc.setTextColor(...INK);
  doc.text(doc.splitTextToSize(summaryText, contentWidth - (breakdownX - margin) - 5), breakdownX, y + 9);

  y += boxHeight + 4;

  // ---------------------------------------------------------------- filters
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(...MUTED);
  const filterText = `Filters — ${report.filters.map(pdfSafe).join("  |  ")}`;
  const filterLines = doc.splitTextToSize(filterText, contentWidth);
  doc.text(filterLines, margin, y);
  y += filterLines.length * 3.2 + 2;

  if (report.truncated) {
    doc.setTextColor(185, 28, 28);
    doc.text(
      "This report hit the export limit and is incomplete — narrow the filters and export again.",
      margin,
      y
    );
    y += 4;
  }

  // ---------------------------------------------------------------- table
  autoTable(doc, {
    head: [COLUMNS.map((c) => c.header)],
    body: report.rows.map((row) =>
      COLUMNS.map((c) => pdfSafe(String(row[c.key] ?? "")))
    ),
    startY: y + 1,
    // Room on pages 2+ for the running header, and for the footer everywhere.
    margin: { left: margin, right: margin, top: 18, bottom: 14 },
    tableWidth: contentWidth,
    styles: {
      font: "helvetica",
      fontSize: 6.6,
      cellPadding: 1.5,
      overflow: "linebreak",
      valign: "top",
      lineColor: RULE,
      lineWidth: 0.1,
      textColor: INK,
    },
    headStyles: {
      fillColor: AMBER,
      textColor: [40, 26, 0],
      fontStyle: "bold",
      fontSize: 6.8,
    },
    alternateRowStyles: { fillColor: BAND },
    columnStyles: Object.fromEntries(
      COLUMNS.map((c, i) => [i, { cellWidth: c.width }])
    ),
    // Keep a booking's row on one page rather than splitting it mid-cell.
    rowPageBreak: "avoid",
    didParseCell: (data) => {
      if (data.section === "body" && data.column.index === STATUS_COLUMN) {
        data.cell.styles.textColor = statusColour(String(data.cell.raw ?? ""));
        data.cell.styles.fontStyle = "bold";
      }
    },
    didDrawPage: (data) => {
      if (data.pageNumber === 1) return;
      // Slim running header so a loose page is still identifiable.
      doc.setFillColor(...AMBER);
      doc.rect(margin, margin - 4, contentWidth, 1, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(...INK);
      doc.text("Guest House Booking Report", margin, margin + 2);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(...MUTED);
      doc.text(pdfSafe(report.subtitle), pageWidth - margin, margin + 2, { align: "right" });
    },
  });

  // -------------------------------------------------- foreign nationals
  //
  // Its own section rather than a column: the great majority of bookings have
  // none, so a column would be 95% empty, and the guest house has to be able
  // to hand this over as a list in its own right.
  const foreign = report.rows.filter((row) => row.foreignNationals);
  if (foreign.length > 0) {
    doc.addPage();
    doc.setFillColor(...AMBER);
    doc.rect(margin, margin, contentWidth, 1.6, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...INK);
    doc.text("Foreign nationals", margin, margin + 8);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    doc.text(
      `${foreign.length} booking${foreign.length === 1 ? "" : "s"} in this report include a guest who is not an Indian citizen.`,
      margin,
      margin + 13
    );

    autoTable(doc, {
      head: [["Reference", "Requester", "Check-in", "Check-out", "Guest (nationality, passport)"]],
      body: foreign.map((row) => [
        pdfSafe(row.reference),
        pdfSafe(row.requester),
        pdfSafe(row.checkIn),
        pdfSafe(row.checkOut),
        pdfSafe(row.foreignNationals),
      ]),
      startY: margin + 17,
      margin: { left: margin, right: margin, top: 18, bottom: 14 },
      tableWidth: contentWidth,
      styles: {
        font: "helvetica",
        fontSize: 7,
        cellPadding: 1.5,
        overflow: "linebreak",
        valign: "top",
        lineColor: RULE,
        lineWidth: 0.1,
        textColor: INK,
      },
      headStyles: { fillColor: AMBER, textColor: [40, 26, 0], fontStyle: "bold", fontSize: 7.2 },
      alternateRowStyles: { fillColor: BAND },
      columnStyles: { 0: { cellWidth: 30 }, 1: { cellWidth: 40 }, 2: { cellWidth: 28 }, 3: { cellWidth: 28 }, 4: { cellWidth: 147 } },
      rowPageBreak: "avoid",
    });
  }

  // ---------------------------------------------------------------- footer
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page);
    doc.setDrawColor(...RULE);
    doc.setLineWidth(0.2);
    doc.line(margin, pageHeight - 9, pageWidth - margin, pageHeight - 9);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(...MUTED);
    doc.text(
      "IIT Palakkad Guest House Management System - Confidential",
      margin,
      pageHeight - 5.5
    );
    doc.text(`Page ${page} of ${pages}`, pageWidth - margin, pageHeight - 5.5, {
      align: "right",
    });
  }

  doc.save(filename);
}
