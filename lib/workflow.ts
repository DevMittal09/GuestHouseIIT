import { addMonths } from "date-fns";
import type { BookingSearchCriteria } from "./booking-search";
import type { BookingStatus, Profile, Role, ServiceType, StaffCategory } from "./types";
import { approversOf, hodApproversFor, unitsGovernedBy, type Unit } from "./units";
import { formatDateTime } from "./format";
import { TURNOVER_GRACE_HOURS } from "./turnover";
import { DEFAULT_RULES } from "./settings";

/**
 * How far ahead of today a stay may be booked, under the default rules. The
 * office's value is Settings (`rules.booking.advance_booking_months`) and is
 * passed as `months` to `latestCheckIn`.
 */
export const ADVANCE_BOOKING_WINDOW_MONTHS = DEFAULT_RULES.booking.advance_booking_months;

/**
 * Who may book outside the one-month advance window.
 *
 * Official / dignitary visits are arranged by the institute on its own notice.
 * The Guest House Manager is exempt because they take bookings at the desk for
 * whatever the institute has already committed to — a window they could not
 * reach past would simply move those bookings off the portal — and the
 * developer because the console bypasses everything anyway.
 */
export function isAdvanceWindowExempt(role: Role): boolean {
  return role === "official" || role === "gh_manager" || role === "developer";
}

/**
 * The latest check-in a role may request, or null when the role is exempt.
 * Applied to check-in only: a stay that starts inside the window may run past
 * it. Both the client and the server build the booking schema from this, so
 * the limit cannot be bypassed by a crafted request.
 */
export function latestCheckIn(
  role: Role,
  from: Date = new Date(),
  months: number = ADVANCE_BOOKING_WINDOW_MONTHS
): Date | null {
  if (isAdvanceWindowExempt(role)) return null;
  return addMonths(from, months);
}

/**
 * How an office's official booking is approved (Phase 4): **direct** to the
 * Guest House Manager, as before, or through the office's **HOD** first. The
 * office chooses per booking; it is stored on the booking
 * (`office_approval`), so the route cannot change under a waiting request.
 */
export type OfficeApproval = "direct" | "hod";

/** Roles that are offices, and so choose Direct or Requires HOD approval. */
export const OFFICE_ROLES: Role[] = ["official", "iar_cell"];

export function isOfficeRole(role: Role): boolean {
  return OFFICE_ROLES.includes(role);
}

/** What routing needs beyond the role and the service. */
export interface RoutingContext {
  bookingType?: string;
  staffCategory?: StaffCategory | null;
  /** An office's choice for this booking. Ignored for other roles. */
  officeApproval?: OfficeApproval | null;
  /**
   * Whether anyone other than the requester gives HOD approval for them
   * (`hodApproversFor`). With nobody, the HOD stage is skipped — and the
   * submission log says so — rather than waiting forever.
   */
  hasHodApprover?: boolean;
}

/**
 * The whole approval chain for a request, in order: every intermediate stage
 * before the Guest House Manager. Empty when it goes straight to the manager.
 * **The single source of the pipeline** — the entry status, the next stage
 * after each approval, the Copy-to chain and the public site's description of
 * the routes are all read from here.
 *
 * - **Student** → Assistant Warden.
 * - **Club** (always official) → its Faculty Advisor / council secretary →
 *   its HOD, when the club has one (Departments & Clubs → "HOD approval by").
 * - **Employee, official** → HOD of their department — faculty and
 *   non-teaching staff alike. **Personal** → straight to the manager: it is
 *   their own money.
 * - **Office** (Director's Office, a department's office, the IAR Office) →
 *   straight to the manager (**Direct**), or HOD first (**Requires HOD
 *   approval**) — the office's choice per booking.
 * - **IAR Student Cell** → the IAR Office.
 * - **Meals only** → straight to the manager: lunch for a visitor is the
 *   kitchen's business; the stages exist to vouch for an overnight stay.
 * - The **manager** booking at the desk → their own queue.
 */
export function routeFor(
  role: Role,
  service: ServiceType = "room",
  context: RoutingContext = {}
): BookingStatus[] {
  if (service === "meals_only") return [];
  const hod: BookingStatus[] = context.hasHodApprover ? ["PENDING_HOD"] : [];
  switch (role) {
    case "student":
      return ["PENDING_WARDEN"];
    case "club":
      return ["PENDING_FA", ...hod];
    case "employee":
      return context.bookingType === "official" ? hod : [];
    case "official":
    case "iar_cell":
      return context.officeApproval === "hod" ? hod : [];
    // `alumni` is retired, kept so a resubmitted legacy booking routes sanely.
    case "alumni":
    case "iar_student_cell":
      return ["PENDING_IAR"];
    case "gh_manager":
      return [];
    default:
      throw new Error(`Role ${role} cannot create bookings`);
  }
}

/** Where a fresh booking enters the pipeline: the first stage of its route. */
export function initialStatusFor(
  role: Role,
  service: ServiceType = "room",
  context: RoutingContext = {}
): BookingStatus {
  return routeFor(role, service, context)[0] ?? "PENDING_GH_MANAGER";
}

/**
 * Whether the HOD stage *should* apply to this request but cannot, because
 * nobody other than the requester is set to give it. The booking then skips
 * the stage and its submission log says why.
 */
export function hodStageMissing(
  role: Role,
  service: ServiceType,
  context: RoutingContext
): boolean {
  if (context.hasHodApprover) return false;
  return routeFor(role, service, { ...context, hasHodApprover: true }).includes("PENDING_HOD");
}

/** Which intermediate status a reviewer role is responsible for. */
export const REVIEWER_STAGE: Partial<Record<Role, BookingStatus>> = {
  warden: "PENDING_WARDEN",
  faculty_advisor: "PENDING_FA",
  iar_cell: "PENDING_IAR",
  gh_manager: "PENDING_GH_MANAGER",
};

/** The routing context of a stored booking, from its requester and the units now. */
export function routingContextFor(
  booking: { booking_type?: string; office_approval?: OfficeApproval | null },
  requester: Pick<Profile, "id" | "staff_category" | "unit_id">,
  units: Unit[]
): RoutingContext {
  return {
    bookingType: booking.booking_type,
    staffCategory: requester.staff_category ?? null,
    officeApproval: booking.office_approval ?? null,
    hasHodApprover: hodApproversFor(requester, units).length > 0,
  };
}

/**
 * Every intermediate stage a booking passes through before the Guest House
 * Manager, in order — its whole chain, not just where it is now. Used for the
 * Copy-to line (everyone who signs a request off is copied on the staff mail
 * about it for the rest of its life) and to find the next stage.
 */
export function approvalStagesFor(
  booking: {
    user_role: Role;
    service_type?: ServiceType;
    booking_type?: string;
    office_approval?: OfficeApproval | null;
  },
  requester: Pick<Profile, "id" | "staff_category" | "unit_id">,
  units: Unit[] = []
): BookingStatus[] {
  try {
    return routeFor(
      booking.user_role,
      booking.service_type ?? "room",
      routingContextFor(booking, requester, units)
    );
  } catch {
    // A role that cannot book (a stored booking under a role since removed).
    return [];
  }
}

/**
 * Where a booking goes when the stage it is in approves it: the next stage of
 * its route, else the Guest House Manager; the manager's approval (through
 * allocation) makes it APPROVED.
 */
export function nextStatusAfter(current: BookingStatus, stages: BookingStatus[]): BookingStatus {
  if (current === "PENDING_GH_MANAGER") return "APPROVED";
  if (!ACTIVE_STATUSES.includes(current)) {
    throw new Error(`Cannot approve a booking in status ${current}`);
  }
  const at = stages.indexOf(current);
  return (at >= 0 ? stages[at + 1] : undefined) ?? "PENDING_GH_MANAGER";
}

/**
 * Context-free next stage, for callers with no booking to hand: an
 * intermediate approval forwards to the manager. Prefer `nextStatusAfter`
 * with the booking's stages — a club's FA approval goes on to the HOD.
 */
export function nextStatusOnApprove(current: BookingStatus): BookingStatus {
  return nextStatusAfter(current, []);
}

/**
 * Can `reviewer` act on a booking currently in `status`, submitted by `requester`?
 *
 * Two kinds of approval live here:
 *
 * - **By unit** — a club's advisor or its council's secretary (`PENDING_FA`),
 *   and the HOD (`PENDING_HOD`) — decided by who heads the unit *now*
 *   (`approversOf`, `hodApproversFor`), so it follows a change of HOD without
 *   anyone touching the waiting requests. That is the HOD's department
 *   scoping: an HOD can act only on requests from units whose HOD they are.
 *   The approver need not hold a reviewer role at all: a council secretary is
 *   a student, an HOD an employee.
 * - **By role** — wardens scoped to their hostel, the IAR Office, the manager.
 *
 * A club whose unit has nobody set falls back to the old advisor rule, so a
 * request cannot be stranded because the console was half filled in; the
 * manager can also always approve past any stage.
 *
 * Nobody ever approves their own request.
 */
export function canReview(
  reviewer: Profile,
  status: BookingStatus,
  requester: Profile,
  units: Unit[] = []
): boolean {
  // Nobody signs off their own request. The IAR Office both books and reviews,
  // and an HOD books too — this is the belt-and-braces check behind the
  // routing that already skips them.
  if (reviewer.id === requester.id) return false;

  if (status === "PENDING_HOD") {
    return hodApproversFor(requester, units).includes(reviewer.id);
  }
  if (status === "PENDING_FA") {
    const byUnit = approversOf(requester.unit_id, units).filter((id) => id !== requester.id);
    if (byUnit.length > 0) return byUnit.includes(reviewer.id);
    // Nobody set for this club: the advisor matched by name, as before.
    return (
      reviewer.role === "faculty_advisor" &&
      Boolean(reviewer.department_or_club) &&
      reviewer.department_or_club === requester.department_or_club
    );
  }

  if (REVIEWER_STAGE[reviewer.role] !== status) return false;
  if (reviewer.role === "warden") return reviewer.hostel_name === requester.hostel_name;
  if (reviewer.role === "faculty_advisor")
    return reviewer.department_or_club === requester.department_or_club;
  return true;
}

export const ACTIVE_STATUSES: BookingStatus[] = [
  "PENDING_WARDEN",
  "PENDING_FA",
  "PENDING_HOD",
  "PENDING_IAR",
  "PENDING_GH_MANAGER",
];

/**
 * Where a stay sits relative to now.
 *
 * `OCCUPIED` is a *fact the manager records at the desk* — the guest walked in
 * — not something a date implies. So the phase is read off the booking's own
 * check-in and check-out, and the manager console groups by it. Without this
 * a stay starting next week sat under the same heading as one happening now,
 * and a future booking could be marked Occupied by mistake.
 */
export type StayPhase = "upcoming" | "current" | "past";

export function stayPhase(
  booking: { check_in: string; check_out: string },
  now: Date = new Date()
): StayPhase {
  const at = now.toISOString();
  if (booking.check_in > at) return "upcoming";
  // Half-open, matching `room_holds.during`: a stay checking out at 11:00 is
  // no longer current at 11:00.
  if (booking.check_out <= at) return "past";
  return "current";
}

/**
 * The earliest a guest may be checked in: their booked time, less the
 * turnover grace.
 *
 * A guest who turns up half an hour early is standing at the desk, and
 * refusing to record them means the register disagrees with the building.
 * A guest who turns up *a day* early has no room — the previous one is still
 * in it — so the window is the same two hours the changeover override uses,
 * and for the same reason.
 */
export function earliestCheckIn(booking: { check_in: string }): Date {
  return new Date(Date.parse(booking.check_in) - TURNOVER_GRACE_HOURS * 3_600_000);
}

/**
 * Why the desk cannot mark this booking Occupied yet, or null when it can.
 * Enforced server-side in `updateBookingLifecycle`; the console uses the same
 * function to decide what the button offers.
 *
 * There is no counterpart for Vacated on purpose: a guest may leave whenever
 * they like, and the desk records it when it happens.
 */
export function occupancyNotStartedError(
  booking: { check_in: string },
  now: Date = new Date()
): string | null {
  if (now >= earliestCheckIn(booking)) return null;
  return `This stay starts on ${formatDateTime(booking.check_in)}. A guest can be checked in up to ${TURNOVER_GRACE_HOURS} hours before that, no earlier — until then the room may still have someone in it.`;
}

/** Whether the guest is arriving before the time they booked. */
export function isEarlyArrival(
  booking: { check_in: string },
  now: Date = new Date()
): boolean {
  return now.toISOString() < booking.check_in;
}

/**
 * A request nobody decided in time.
 *
 * Its check-in has passed while it was still in a queue, so the stay it asks
 * for can no longer happen. Nothing deletes it — the archive keeps what was
 * asked for — but it must stop behaving like a live request: approving one
 * would hold rooms for dates in the past, and it should not sit in a queue
 * looking actionable.
 *
 * The way out is to reject it, or for the manager to move the dates
 * (`updateBookingStay`) and then allocate.
 */
export function hasLapsed(
  booking: { status: BookingStatus; check_in: string },
  now: Date = new Date()
): boolean {
  return ACTIVE_STATUSES.includes(booking.status) && booking.check_in < now.toISOString();
}

/** Why this request can no longer be approved, or null when it still can. */
export function lapsedError(
  booking: { status: BookingStatus; check_in: string },
  now: Date = new Date()
): string | null {
  if (!hasLapsed(booking, now)) return null;
  return `This request was never decided and its check-in (${formatDateTime(
    booking.check_in
  )}) has passed, so the stay cannot happen. Reject it, or ask the Guest House Manager to move the dates first.`;
}

/** Statuses that represent a booking where rooms are currently held/occupied. */
export const ROOM_HOLDING_STATUSES: BookingStatus[] = [
  "APPROVED",
  "OCCUPIED",
  "CANCELLATION_REQUESTED",
];

/**
 * The status to *show* for a stay, which is not always the status stored.
 *
 * A booking whose check-in has not arrived cannot be occupied, whatever the
 * row says — and rows can say so, because the developer console can force any
 * status and older data predates the guard in `updateBookingLifecycle`. The
 * office reported exactly this: future bookings reading as "Occupied". Writes
 * are refused at the source; this keeps a bad row already in the database from
 * telling the reception a guest is in a room that is in fact empty.
 */
export function displayStatus(
  booking: { status: BookingStatus; check_in: string },
  now: Date = new Date()
): BookingStatus {
  // Whatever the row says, nobody is in a room before the stay begins.
  if (booking.status === "OCCUPIED" && booking.check_in > now.toISOString()) {
    return "APPROVED";
  }
  return booking.status;
}

/** Whether a stay's check-out falls on the given institute calendar date. */
export function checksOutOn(
  booking: { check_out: string },
  dayStart: Date,
  dayEnd: Date
): boolean {
  const at = new Date(booking.check_out).getTime();
  return at >= dayStart.getTime() && at < dayEnd.getTime();
}

/** Roles that get the approval log / booking archive at `/history`. */
export const HISTORY_ROLES: Role[] = [
  "warden",
  "faculty_advisor",
  "iar_cell",
  "gh_manager",
  "gh_caretaker",
  "developer",
];

/**
 * Roles that record arrivals and departures at the desk.
 *
 * The caretaker sits on the guest house reception and does exactly this much:
 * marks guests Occupied when they walk in and Vacated when they leave. Room
 * allocation, approvals and cancellations stay with the manager, which is what
 * makes this a subset of that console rather than a second copy of it.
 */
export const LIFECYCLE_ROLES: Role[] = ["gh_manager", "gh_caretaker"];

export function canUpdateLifecycle(role: Role): boolean {
  return LIFECYCLE_ROLES.includes(role);
}

/** All roles now have access to logs — requesters see their own bookings. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function canViewHistory(_role: Role): boolean {
  return true;
}

/** Roles allowed to generate PDF reports from logs. */
export const PDF_EXPORT_ROLES: Role[] = ["gh_manager", "developer"];

export function canExportPdf(role: Role): boolean {
  return PDF_EXPORT_ROLES.includes(role);
}

/** Whether the role is a "requester" (their logs show own bookings, not approval actions). */
export function isRequesterHistory(role: Role): boolean {
  return !HISTORY_ROLES.includes(role);
}

/** The slice of the archive a role may search, or why it cannot search at all. */
export type HistoryScope =
  | {
      ok: true;
      /** Applied last when building criteria, so the URL cannot widen it. */
      criteria: Pick<
        BookingSearchCriteria,
        "hostelName" | "club" | "userRole" | "userRoles" | "userId" | "approverScope"
      >;
      /** Human-readable description of the boundary, shown in the UI. */
      label: string;
      /** False when the role is fixed by the scope (hides the category filter). */
      canFilterByRole: boolean;
      /** True for requester roles — hides the "Handled by me / Everything" toggle. */
      isOwnBookings: boolean;
    }
  | { ok: false; reason: string };

/**
 * Archive counterpart to `canReview()`. A reviewer may look back over exactly
 * the requests they were ever responsible for — wardens their own hostel's
 * students, advisors their own club, the IAR cell alumni requests. The manager
 * and the developer see every booking. Requesters see only their own bookings.
 */
export function historyScope(user: Profile, units: Unit[] = []): HistoryScope {
  // An HOD, a council secretary, an office head: they approve by appointment,
  // so their archive is their own bookings plus the requests of the units
  // they approve for — found the way `canReview` finds them.
  const governed = unitsGovernedBy(user.id, units);
  if (governed.length > 0 && !["warden", "iar_cell", "gh_manager", "gh_caretaker", "developer"].includes(user.role)) {
    const names = units.filter((u) => governed.includes(u.id)).map((u) => u.name);
    return {
      ok: true,
      criteria: { approverScope: { userId: user.id, unitIds: governed } },
      label: `Your bookings, and requests from ${names.join(", ")}`,
      canFilterByRole: true,
      isOwnBookings: false,
    };
  }
  switch (user.role) {
    case "warden":
      if (!user.hostel_name) {
        return {
          ok: false,
          reason:
            "Your account has no hostel assigned, so there is nothing to show. Ask a developer to set your hostel in Users & Roles.",
        };
      }
      return {
        ok: true,
        criteria: { userRole: "student", hostelName: user.hostel_name },
        label: `Student requests from ${user.hostel_name} hostel`,
        canFilterByRole: false,
        isOwnBookings: false,
      };
    case "faculty_advisor":
      if (!user.department_or_club) {
        return {
          ok: false,
          reason:
            "Your account has no department or club assigned, so there is nothing to show. Ask a developer to set it in Users & Roles.",
        };
      }
      return {
        ok: true,
        criteria: { userRole: "club", club: user.department_or_club },
        label: `Requests from ${user.department_or_club}`,
        canFilterByRole: false,
        isOwnBookings: false,
      };
    case "iar_cell":
      return {
        ok: true,
        // Three categories, not one: requests the Student Cell raised (which
        // this office approves), this office's own bookings, and the alumni
        // requests made before alumni lost their logins. A single `userRole`
        // could only name one of them and would hide the other two.
        criteria: { userRoles: ["alumni", "iar_student_cell", "iar_cell"] },
        label: "Alumni and IAR requests",
        canFilterByRole: false,
        isOwnBookings: false,
      };
    case "gh_manager":
      return {
        ok: true,
        criteria: {},
        label: "All guest house bookings",
        canFilterByRole: true,
        isOwnBookings: false,
      };
    case "gh_caretaker":
      return {
        ok: true,
        criteria: {},
        label: "All guest house bookings",
        canFilterByRole: true,
        isOwnBookings: false,
      };
    case "developer":
      return {
        ok: true,
        criteria: {},
        label: "All bookings (developer)",
        canFilterByRole: true,
        isOwnBookings: false,
      };
    // Requester roles: student, employee, official, club, alumni
    default:
      return {
        ok: true,
        criteria: { userId: user.id },
        label: "Your booking history",
        canFilterByRole: false,
        isOwnBookings: true,
      };
  }
}
