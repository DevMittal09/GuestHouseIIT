import { STATUS_LABELS, type BookingLog, type BookingStatus, type ServiceType } from "./types";

/**
 * Where an open booking stands in its pipeline, as steps to draw on the
 * requester's booking card.
 *
 * The route is read from the booking's own history, not re-derived from the
 * requester's role: routing depends on more than the role (an employee's
 * official booking waits for their HOD, a personal one does not; a meals-only
 * request goes straight to the manager), and the log already records where
 * this booking actually entered — both stores write the submission as a log
 * with `new_status` set to the entry status.
 */

export type ProgressState = "done" | "current" | "upcoming";
export type ProgressStep = { label: string; state: ProgressState };
export type BookingProgress = { steps: ProgressStep[]; caption: string };

/** The statuses that wait on someone before the Guest House Manager. */
export const INTERMEDIATE_STATUSES: BookingStatus[] = [
  "PENDING_WARDEN",
  "PENDING_FA",
  "PENDING_HOD",
  "PENDING_IAR",
];

/** "Pending HOD Approval" → "HOD Approval", from the one set of labels. */
function stepLabel(status: BookingStatus): string {
  return STATUS_LABELS[status].replace(/^Pending\s+/i, "");
}

/**
 * The status a booking entered the pipeline at: the submission log's
 * `new_status`, or — for a row whose first log is a later transition — that
 * transition's `previous_status`. With no logs at all, a booking still
 * waiting where it started is its own answer.
 */
export function entryStatus(booking: {
  status: BookingStatus;
  logs?: Pick<BookingLog, "previous_status" | "new_status" | "timestamp">[];
}): BookingStatus | null {
  const logs = [...(booking.logs ?? [])].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const first = logs[0];
  if (first) return first.previous_status ?? first.new_status;
  return booking.status.startsWith("PENDING_") ? booking.status : null;
}

/**
 * The steps for an open booking, or `null` for one that has closed without a
 * stay (rejected, cancelled, cancellation approved) — those show their
 * outcome instead of a half-finished track.
 */
export function bookingProgress(booking: {
  status: BookingStatus;
  service_type?: ServiceType;
  logs?: Pick<BookingLog, "previous_status" | "new_status" | "timestamp">[];
}): BookingProgress | null {
  const entry = entryStatus(booking);
  const intermediate = entry && INTERMEDIATE_STATUSES.includes(entry) ? entry : null;
  const mealsOnly = booking.service_type === "meals_only";

  const labels = [
    "Requested",
    ...(intermediate ? [stepLabel(intermediate)] : []),
    mealsOnly ? "Manager approval" : "Room allotment",
    mealsOnly ? "Meals" : "Stay",
  ];
  const manager = labels.length - 2;
  const stay = labels.length - 1;

  let current: number;
  let caption: string;
  switch (booking.status) {
    case "PENDING_WARDEN":
    case "PENDING_FA":
    case "PENDING_HOD":
    case "PENDING_IAR":
      current = intermediate ? 1 : manager;
      caption = `Waiting for ${stepLabel(booking.status)}`;
      break;
    case "PENDING_GH_MANAGER":
      current = manager;
      caption = mealsOnly
        ? "Awaiting approval by the Guest House Manager"
        : "Awaiting room allotment by the Guest House Manager";
      break;
    case "APPROVED":
      current = stay;
      caption = mealsOnly ? "Confirmed" : "Confirmed — rooms allotted";
      break;
    case "CANCELLATION_REQUESTED":
      current = stay;
      caption = "Cancellation requested — awaiting the Guest House Manager";
      break;
    case "OCCUPIED":
      current = stay;
      caption = "Checked in";
      break;
    case "VACATED":
      current = labels.length;
      caption = "Stay complete";
      break;
    default:
      return null;
  }

  return {
    steps: labels.map((label, i) => ({
      label,
      state: i < current ? "done" : i === current ? "current" : "upcoming",
    })),
    caption,
  };
}

/** True while a booking is still waiting on a reviewer or the manager. */
export function isInReview(status: BookingStatus): boolean {
  return INTERMEDIATE_STATUSES.includes(status) || status === "PENDING_GH_MANAGER";
}
