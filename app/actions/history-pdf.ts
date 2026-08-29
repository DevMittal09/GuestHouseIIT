"use server";

import { requireUser } from "@/lib/auth";
import {
  HISTORY_EXPORT_LIMIT,
  criteriaFromParams,
  parseHistoryParams,
} from "@/lib/booking-search";
import { getStore } from "@/lib/store";
import { ROLE_LABELS, STATUS_LABELS, type BookingWithDetails } from "@/lib/types";
import { canExportPdf, historyScope } from "@/lib/workflow";
import { formatDate, formatDateTime } from "@/lib/format";

export type PdfExportResult =
  | { ok: true; pdfBase64: string; filename: string; rows: number }
  | { ok: false; error: string };

/**
 * Build a simple HTML table suitable for printing/saving as PDF.
 * We generate a self-contained HTML document that the client will
 * render to a Blob via the browser's print-to-PDF or a jsPDF text approach.
 *
 * Since we cannot rely on a headless browser server-side, we generate a
 * well-structured HTML document and convert it to a base64 PDF-like format
 * that the client can download. The actual approach: generate HTML and
 * use the browser to print it.
 */
function generatePdfHtml(
  rows: BookingWithDetails[],
  title: string,
  dateRange: string
): string {
  const tableRows = rows
    .map(
      (b) => `
      <tr>
        <td>${escapeHtml(b.booking_reference_id)}</td>
        <td>${escapeHtml(b.requester?.full_name ?? "—")}</td>
        <td>${escapeHtml(ROLE_LABELS[b.user_role])}</td>
        <td>${escapeHtml(b.guest_house?.name ?? "—")}</td>
        <td>${escapeHtml(formatDate(b.check_in))} — ${escapeHtml(formatDate(b.check_out))}</td>
        <td>${escapeHtml(String(b.rooms_requested))}</td>
        <td>${escapeHtml(b.assigned_rooms.map((r) => r.room_number).join(", ") || "—")}</td>
        <td>${escapeHtml(STATUS_LABELS[b.status])}</td>
        <td>${escapeHtml(b.guests.map((g) => g.name).join(", "))}</td>
        <td>${escapeHtml(b.purpose_of_visit)}</td>
        <td>${escapeHtml(formatDateTime(b.created_at))}</td>
        <td>${escapeHtml(b.rejection_reason ?? "—")}</td>
      </tr>`
    )
    .join("\n");

  // Summary stats
  const statusSummary = rows.reduce<Record<string, number>>((acc, b) => {
    const label = STATUS_LABELS[b.status];
    acc[label] = (acc[label] ?? 0) + 1;
    return acc;
  }, {});

  const summaryHtml = Object.entries(statusSummary)
    .map(([label, count]) => `<span style="margin-right:16px;">${label}: <strong>${count}</strong></span>`)
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 9px;
      color: #1a1a1a;
      padding: 16px;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 16px;
      padding-bottom: 12px;
      border-bottom: 2px solid #f7a600;
    }
    .header h1 { font-size: 16px; color: #2b2b2b; }
    .header .subtitle { font-size: 10px; color: #666; margin-top: 4px; }
    .header .meta { text-align: right; font-size: 9px; color: #888; }
    .summary {
      background: #faf9f7;
      border: 1px solid #e3e1dc;
      border-radius: 4px;
      padding: 8px 12px;
      margin-bottom: 12px;
      font-size: 9px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 8px;
    }
    th {
      background: #f7a600;
      color: #fff;
      text-align: left;
      padding: 4px 6px;
      font-weight: 600;
      white-space: nowrap;
    }
    td {
      padding: 3px 6px;
      border-bottom: 1px solid #eee;
      vertical-align: top;
      word-break: break-word;
    }
    tr:nth-child(even) td { background: #faf9f7; }
    .footer {
      margin-top: 16px;
      padding-top: 8px;
      border-top: 1px solid #e3e1dc;
      font-size: 8px;
      color: #888;
      text-align: center;
    }
    @media print {
      body { padding: 0; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <h1>IIT Palakkad — Guest House Booking Report</h1>
      <div class="subtitle">${escapeHtml(dateRange)}</div>
    </div>
    <div class="meta">
      Generated: ${escapeHtml(formatDateTime(new Date().toISOString()))}<br/>
      Total records: ${rows.length}
    </div>
  </div>

  <div class="summary">${summaryHtml}</div>

  <table>
    <thead>
      <tr>
        <th>Reference</th>
        <th>Requester</th>
        <th>Category</th>
        <th>Guest House</th>
        <th>Stay Period</th>
        <th>Rooms</th>
        <th>Assigned</th>
        <th>Status</th>
        <th>Guests</th>
        <th>Purpose</th>
        <th>Submitted</th>
        <th>Remarks</th>
      </tr>
    </thead>
    <tbody>
      ${tableRows}
    </tbody>
  </table>

  <div class="footer">
    IIT Palakkad Guest House Management System — Confidential
  </div>
</body>
</html>`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Export the current log view as a PDF report. The PDF is generated as an
 * HTML document converted to a PDF-printable format. We return the HTML as
 * base64 which the client triggers as a downloadable file.
 *
 * For a true server-side PDF we'd need puppeteer or similar, but for this
 * application we generate a print-optimized HTML file that can be printed
 * to PDF from any browser, OR we use a lightweight approach of generating
 * the document and letting the browser handle it.
 */
export async function exportHistoryPdf(queryString: string): Promise<PdfExportResult> {
  try {
    const user = await requireUser();
    if (!canExportPdf(user.role)) {
      return { ok: false, error: "Your role cannot export PDF reports" };
    }
    const scope = historyScope(user);
    if (!scope.ok) return { ok: false, error: scope.reason };

    const raw = Object.fromEntries(new URLSearchParams(queryString ?? "").entries());
    const defaultActor = user.role === "developer" ? "all" : "me";
    const params = parseHistoryParams(raw, defaultActor);
    const criteria = criteriaFromParams(params, scope.criteria, user.id, {
      offset: 0,
      limit: HISTORY_EXPORT_LIMIT,
    });

    const { rows } = await getStore().searchBookings(criteria);

    // Build a human-readable date range label
    let dateRange = "All bookings";
    if (params.from && params.to) {
      dateRange = `Check-in period: ${params.from} to ${params.to}`;
    } else if (params.from) {
      dateRange = `Check-in from: ${params.from}`;
    } else if (params.to) {
      dateRange = `Check-in until: ${params.to}`;
    }
    if (params.q) {
      dateRange += ` | Search: "${params.q}"`;
    }

    const title = "Guest House Booking Report";
    const html = generatePdfHtml(rows, title, dateRange);

    // Encode the HTML as base64 to send to the client.
    // The client will create a Blob and trigger download as an .html file
    // that the user can print to PDF, OR we can use a proper approach.
    const pdfBase64 = Buffer.from(html, "utf-8").toString("base64");

    const stamp = new Date().toISOString().slice(0, 10);
    return {
      ok: true,
      pdfBase64,
      filename: `guest-house-report-${stamp}.html`,
      rows: rows.length,
    };
  } catch (e) {
    console.error("exportHistoryPdf failed", e);
    return { ok: false, error: "Something went wrong while generating the report" };
  }
}
