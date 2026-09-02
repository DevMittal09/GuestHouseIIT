"use server";

import { requireUser } from "@/lib/auth";
import {
  HISTORY_EXPORT_LIMIT,
  criteriaFromParams,
  parseHistoryParams,
} from "@/lib/booking-search";
import { getStore } from "@/lib/store";
import { ROLE_LABELS, STATUS_LABELS, type BookingWithDetails } from "@/lib/types";
import { countBedGuests, countInfants } from "@/lib/occupancy";
import { canExportPdf, historyScope } from "@/lib/workflow";
import { formatDate, formatDateTime } from "@/lib/format";

/**
 * One booking, flattened and pre-formatted for the report. The action returns
 * data, not markup: the PDF itself is drawn in the browser (`lib/report-pdf.ts`)
 * because a real PDF server-side would mean bundling a headless browser.
 * Authorization still happens here — the client sends only a query string and
 * the user, scope and filters are all re-derived below.
 */
export interface ReportRow {
  reference: string;
  requester: string;
  category: string;
  guestHouse: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  rooms: string;
  status: string;
  party: string;
  guestNames: string;
  purpose: string;
  submitted: string;
  remarks: string;
}

export interface HistoryReport {
  subtitle: string;
  filters: string[];
  generatedAt: string;
  generatedBy: string;
  rows: ReportRow[];
  statusSummary: { label: string; count: number }[];
  totals: { bookings: number; guests: number; infants: number; roomNights: number };
  truncated: boolean;
}

export type PdfExportResult =
  | { ok: true; report: HistoryReport }
  | { ok: false; error: string };

function nightsBetween(checkIn: string, checkOut: string): number {
  const ms = new Date(checkOut).getTime() - new Date(checkIn).getTime();
  return Math.max(1, Math.round(ms / 86_400_000));
}

function toReportRow(b: BookingWithDetails): ReportRow {
  const beds = countBedGuests(b.guests);
  const infants = countInfants(b.guests);
  const party = infants > 0 ? `${beds} + ${infants} inf` : String(beds);
  return {
    reference: b.booking_reference_id,
    requester: b.requester?.full_name ?? "—",
    category: ROLE_LABELS[b.user_role],
    guestHouse: b.guest_house?.name ?? "—",
    checkIn: formatDateTime(b.check_in),
    checkOut: formatDateTime(b.check_out),
    nights: nightsBetween(b.check_in, b.check_out),
    rooms:
      b.assigned_rooms.length > 0
        ? b.assigned_rooms.map((r) => r.room_number).join(", ")
        : `${b.rooms_requested} requested`,
    status: STATUS_LABELS[b.status],
    party,
    guestNames: b.guests.map((g) => g.name).join(", "),
    purpose: b.purpose_of_visit,
    submitted: formatDate(b.created_at),
    remarks: b.rejection_reason ?? "",
  };
}

/**
 * Gather the current log view as report data. GH Manager and Developer only.
 * Capped at HISTORY_EXPORT_LIMIT rows, like the CSV export.
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

    const { rows, truncated } = await getStore().searchBookings(criteria);

    // Human-readable description of what was filtered, for the report header.
    const filters: string[] = [];
    if (params.q) filters.push(`Search: "${params.q}"`);
    if (params.from && params.to) filters.push(`Check-in ${params.from} to ${params.to}`);
    else if (params.from) filters.push(`Check-in from ${params.from}`);
    else if (params.to) filters.push(`Check-in until ${params.to}`);
    if (params.statuses.length > 0) {
      filters.push(`Status: ${params.statuses.map((s) => STATUS_LABELS[s]).join(", ")}`);
    }
    if (params.guestHouseId) {
      const gh = rows.find((r) => r.guest_house_id === params.guestHouseId)?.guest_house?.name;
      if (gh) filters.push(`Guest house: ${gh}`);
    }
    if (params.userRole) filters.push(`Category: ${ROLE_LABELS[params.userRole]}`);
    if (params.actor === "me") filters.push("Handled by me");
    if (filters.length === 0) filters.push("No filters — every booking in scope");

    const counts = new Map<string, number>();
    for (const b of rows) {
      const label = STATUS_LABELS[b.status];
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }

    return {
      ok: true,
      report: {
        subtitle: scope.label,
        filters,
        generatedAt: formatDateTime(new Date().toISOString()),
        generatedBy: `${user.full_name} (${ROLE_LABELS[user.role]})`,
        rows: rows.map(toReportRow),
        statusSummary: [...counts.entries()]
          .map(([label, count]) => ({ label, count }))
          .sort((a, b) => b.count - a.count),
        totals: {
          bookings: rows.length,
          guests: rows.reduce((n, b) => n + countBedGuests(b.guests), 0),
          infants: rows.reduce((n, b) => n + countInfants(b.guests), 0),
          roomNights: rows.reduce(
            (n, b) =>
              n +
              nightsBetween(b.check_in, b.check_out) *
                Math.max(b.assigned_rooms.length, b.rooms_requested),
            0
          ),
        },
        truncated,
      },
    };
  } catch (e) {
    console.error("exportHistoryPdf failed", e);
    return { ok: false, error: "Something went wrong while generating the report" };
  }
}
