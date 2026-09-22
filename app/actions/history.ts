"use server";

import { maskIdNumber } from "@/lib/security";
import { csvCell } from "@/lib/csv";
import { requireUser } from "@/lib/auth";
import {
  HISTORY_EXPORT_LIMIT,
  criteriaFromParams,
  latestReviewerActionOn,
  parseHistoryParams,
} from "@/lib/booking-search";
import { countryName } from "@/lib/countries";
import { describeDebit } from "@/lib/debit-heads";
import { getStore } from "@/lib/store";
import { toInstituteDateValue } from "@/lib/tz";
import {
  MEAL_PREFERENCE_LABELS,
  ROLE_LABELS,
  SERVICE_TYPE_LABELS,
  STATUS_LABELS,
  type BookingWithDetails,
} from "@/lib/types";
import { historyScope, isRequesterHistory } from "@/lib/workflow";
import { formatDateTime } from "@/lib/format";

export type ExportResult =
  | { ok: true; csv: string; filename: string; rows: number }
  | { ok: false; error: string };

const COLUMNS = [
  "Reference",
  "Status",
  "Requester",
  "Email",
  "Category",
  "Hostel / Club",
  "Guest House",
  "Booking",
  "Check-in",
  "Check-out",
  "Rooms requested",
  "Assigned rooms",
  "Guests",
  "Infants",
  "Meal preference",
  "Foreign nationals",
  "Pets policy acknowledged",
  "Booked on behalf of",
  "Debitable head",
  "Purpose",
  "Submitted",
  "My action",
  "My action on",
  "My remarks",
  "Rejection reason",
];

function csvRow(booking: BookingWithDetails, userId: string): string {
  const action = latestReviewerActionOn(booking, userId);
  return [
    booking.booking_reference_id,
    STATUS_LABELS[booking.status],
    booking.requester?.full_name,
    booking.requester?.email,
    ROLE_LABELS[booking.user_role],
    booking.requester?.hostel_name ?? booking.requester?.department_or_club ?? "",
    booking.guest_house?.name,
    SERVICE_TYPE_LABELS[booking.service_type],
    formatDateTime(booking.check_in),
    formatDateTime(booking.check_out),
    // A meals-only booking has no rooms and no guest list — the head count is
    // the whole of it, so it goes in the Guests column rather than leaving the
    // row looking like an empty booking.
    booking.service_type === "meals_only" ? "" : booking.rooms_requested,
    booking.assigned_rooms.map((r) => r.room_number).join(" / "),
    booking.service_type === "meals_only"
      ? `${booking.meal_guest_count ?? 0} (head count)`
      : booking.guests
          .filter((g) => !g.is_infant)
          .map((g) => g.name)
          .join(" / "),
    booking.guests
      .filter((g) => g.is_infant)
      .map((g) => g.name)
      .join(" / "),
    booking.meal_preference ? MEAL_PREFERENCE_LABELS[booking.meal_preference] : "",
    booking.guests
      .filter((g) => g.citizenship === "other")
      .map(
        (g) =>
          `${g.name} (${g.nationality ? countryName(g.nationality) : "nationality not recorded"}${
            g.passport_number ? `, ${maskIdNumber(g.passport_number)}` : ""
          })`
      )
      .join(" / "),
    booking.pets_policy_acknowledged ? "Yes" : "Not asked",
    booking.on_behalf_of_name ?? "",
    describeDebit(booking),
    booking.purpose_of_visit,
    formatDateTime(booking.created_at),
    action ? STATUS_LABELS[action.log.new_status] : "",
    action ? formatDateTime(action.log.timestamp) : "",
    action?.log.remarks ?? "",
    booking.rejection_reason ?? "",
  ]
    .map(csvCell)
    .join(",");
}

/**
 * Export the current approval-log view as CSV. The query string is re-parsed
 * and re-scoped server-side, so a hand-edited URL cannot widen the export
 * beyond what the caller is allowed to see.
 */
export async function exportHistoryCsv(queryString: string): Promise<ExportResult> {
  try {
    const user = await requireUser();
    const scope = historyScope(user, await getStore().listUnits().catch(() => []));
    if (!scope.ok) return { ok: false, error: scope.reason };

    const isRequester = isRequesterHistory(user.role);
    const defaultActor = scope.isOwnBookings ? "all" : user.role === "developer" ? "all" : "me";
    const raw = Object.fromEntries(new URLSearchParams(queryString ?? "").entries());
    const params = parseHistoryParams(raw, defaultActor);
    const criteria = criteriaFromParams(params, scope.criteria, user.id, {
      offset: 0,
      limit: HISTORY_EXPORT_LIMIT,
    });

    const { rows } = await getStore().searchBookings(criteria);
    const csv = [COLUMNS.map(csvCell).join(","), ...rows.map((b) => csvRow(b, user.id))].join("\r\n");
    const stamp = toInstituteDateValue(new Date());
    const prefix = isRequester ? "booking-history" : "approval-log";
    return {
      ok: true,
      csv,
      filename: `${prefix}-${stamp}.csv`,
      rows: rows.length,
    };
  } catch (e) {
    console.error("exportHistoryCsv failed", e);
    return { ok: false, error: "Something went wrong while preparing the export" };
  }
}
