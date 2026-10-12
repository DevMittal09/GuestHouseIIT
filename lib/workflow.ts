import { addMonths } from "date-fns";
import type { BookingSearchCriteria } from "./booking-search";
import {
  BOOKING_CATEGORY_ROLES,
  type Booking,
  type BookingLog,
  type BookingStatus,
  type BookingType,
  type Profile,
  type Role,
  type ServiceType,
  type StaffCategory,
} from "./types";
import { hodApproversFor, unitsGovernedBy, type Unit } from "./units";
import {
  BUILT_IN_STAGE_APPROVERS,
  canResolveApprover,
  decidesStage,
  DEFAULT_APPROVAL_RULES,
  isStageStatus,
  stageApproverIds,
  stageForStatus,
  stagesFor,
  type ApprovalRules,
  type ApprovalStage,
  type ApproverDirectory,
  type RequestFacts,
} from "./approval-routes";
import { formatDateTime } from "./format";
import { raisedByFacultyInCharge } from "./club-booking";
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
 * whatever the institute has already committed to - a window they could not
 * reach past would simply move those bookings off the portal - and the
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

/**
 * Whether this requester is **asked** how their booking is approved.
 *
 * An office chooses Direct or Requires HOD approval - but only where there is
 * somebody to give that approval (11 Oct 2026, the office). The Director's
 * Office has no HOD, so "Requires HOD approval" sent the request straight to
 * the manager anyway (`routeFor`'s `hasHodApprover`) and the option explained
 * itself with "Nobody is set as HOD for your office yet". A question with one
 * real answer is not put: the form withholds the card and `createBooking`
 * records **Direct** whatever arrived, the same way a personal booking is
 * recorded against Personal Funds without being asked.
 */
export function asksOfficeApproval(
  role: Role,
  service: ServiceType = "room",
  hasHodApprover = true,
  context: Omit<RoutingContext, "officeApproval"> = {}
): boolean {
  if (!isOfficeRole(role) || service === "meals_only") return false;
  // Derived, not asserted: the office is asked only where the two answers
  // actually lead somewhere different. Under the default routes that means
  // "an HOD exists"; under a route the office has edited it means whatever
  // they made it mean - including, if they take the HOD stage off an office
  // altogether, not asking at all.
  const route = (officeApproval: OfficeApproval) =>
    routeFor(role, service, { ...context, hasHodApprover, officeApproval }).join(">");
  return route("direct") !== route("hod");
}

/** What routing needs beyond the role and the service. */
export interface RoutingContext {
  bookingType?: string;
  staffCategory?: StaffCategory | null;
  /** An office's choice for this booking. Ignored for other roles. */
  officeApproval?: OfficeApproval | null;
  /**
   * Whether anyone other than the requester gives HOD approval for them
   * (`hodApproversFor`). With nobody, the HOD stage is skipped - and the
   * submission log says so - rather than waiting forever.
   *
   * Superseded in part by `directory` + `requester` below, which count the
   * approvers of **every** stage rather than only the HOD's. This is still
   * read when they are absent, so every caller written before 12 Oct 2026
   * behaves exactly as it did.
   */
  hasHodApprover?: boolean;
  /**
   * A club booking raised by the club's Faculty Advisor (24 Sep 2026,
   * `lib/club-booking.ts`). It then goes straight to the Guest House
   * Manager: the advisor is who would have forwarded it, and the office
   * asked that nobody else has to.
   */
  raisedByFacultyInCharge?: boolean;
  /** The requester's own unit, for a route the office narrowed to one unit. */
  unitId?: string | null;
  /** The requester's hostel, for a route the office narrowed to one hostel. */
  hostelName?: string | null;
  /**
   * The chains the office configured (`rules.approval`, Console -> Approval
   * Workflow). Defaults to {@link DEFAULT_APPROVAL_RULES}, which is the
   * pipeline the portal had before it was configurable.
   */
  rules?: ApprovalRules;
  /**
   * Units and profiles, when the caller has them. A stage with nobody to
   * decide it is **skipped**, and the submission log says which - the rule
   * the HOD stage has had since Phase 4, now applied to every stage, because
   * a route the office points at an empty unit must not strand every request
   * that matches it.
   */
  directory?: ApproverDirectory;
  /** Who is asking, needed to count a requester-relative stage's approvers. */
  requester?: Pick<Profile, "id" | "unit_id" | "hostel_name">;
}

/**
 * Roles a booking can be stored under: every requester role, the retired
 * `alumni` (stored bookings still carry it), and the desk, which books for
 * guests who never open the portal. Anything else throws out of `routeFor` -
 * a warden has no route because a warden does not book.
 */
export const BOOKABLE_ROLES: Role[] = [...BOOKING_CATEGORY_ROLES, "gh_manager"];

/** The facts a configured route is matched against, from a role and a context. */
function requestFacts(role: Role, service: ServiceType, context: RoutingContext): RequestFacts {
  return {
    role,
    service,
    bookingType: (context.bookingType as BookingType | undefined) ?? null,
    staffCategory: context.staffCategory ?? null,
    officeApproval: context.officeApproval ?? null,
    raisedByFacultyInCharge: Boolean(context.raisedByFacultyInCharge),
    unitId: context.unitId ?? context.requester?.unit_id ?? null,
    hostelName: context.hostelName ?? context.requester?.hostel_name ?? null,
  };
}

/**
 * Whether anybody can decide this stage - and so whether it stays in the
 * route at all.
 *
 * With a directory, the stage's own approver rule is resolved and counted.
 * Without one, only an HOD stage is judged, from `hasHodApprover`: that is
 * precisely what the hardcoded pipeline did, and a caller that cannot count
 * must not start dropping stages on a guess.
 */
function stageIsStaffed(stage: ApprovalStage, context: RoutingContext): boolean {
  const { directory, requester } = context;
  if (directory && requester && canResolveApprover(stage.approver, directory)) {
    return stageApproverIds(stage.approver, requester, directory).length > 0;
  }
  if (stage.approver.kind === "hod") return Boolean(context.hasHodApprover);
  return true;
}

/**
 * The whole approval chain for a request, in order: every intermediate stage
 * before the Guest House Manager. Empty when it goes straight to the manager.
 * **The single source of the pipeline** - the entry status, the next stage
 * after each approval and the Copy-to chain are all read from here.
 *
 * **It is configuration, not code, since 12 Oct 2026.** The chain comes from
 * `context.rules` - the list of routes the Guest House Manager edits at
 * Console -> Approval Workflow (`lib/approval-routes.ts`) - and defaults to
 * {@link DEFAULT_APPROVAL_RULES}, which reproduces the hardcoded pipeline
 * case for case:
 *
 * - **Student** → Assistant Warden.
 * - **Club** (always official) - since 24 Sep 2026 raised by its Faculty
 *   Advisor, and then **straight to the manager**: no forwarding by anyone,
 *   HOD included. A club request stored before then (raised by the club's
 *   own account) keeps the old route: council secretary → its HOD, when the
 *   club has one (Departments & Clubs → "HOD approval by").
 * - **Employee, official** → HOD of their department - faculty and
 *   non-teaching staff alike. **Personal** → straight to the manager: it is
 *   their own money.
 * - **Office** (Director's Office, a department's office, the IAR Office) →
 *   straight to the manager (**Direct**), or HOD first (**Requires HOD
 *   approval**) - the office's choice per booking.
 * - **IAR Student Cell** → the IAR Office.
 * - **Meals only** → straight to the manager: lunch for a visitor is the
 *   kitchen's business; the stages exist to vouch for an overnight stay.
 * - The **manager** booking at the desk → their own queue.
 *
 * A stage nobody can decide is dropped - see {@link skippedStages}, which is
 * what the submission log names.
 */
export function routeFor(
  role: Role,
  service: ServiceType = "room",
  context: RoutingContext = {}
): BookingStatus[] {
  return routeStagesFor(role, service, context).map((stage) => stage.status);
}

/**
 * As {@link routeFor}, but each stage with the approver rule and the name the
 * office gave it - what a queue page's heading and the console's preview
 * read. Throws for a role that cannot book at all.
 */
export function routeStagesFor(
  role: Role,
  service: ServiceType = "room",
  context: RoutingContext = {}
): ApprovalStage[] {
  if (!BOOKABLE_ROLES.includes(role)) {
    throw new Error(`Role ${role} cannot create bookings`);
  }
  const rules = context.rules ?? DEFAULT_APPROVAL_RULES;
  return stagesFor(requestFacts(role, service, context), rules).filter((stage) =>
    stageIsStaffed(stage, context)
  );
}

/**
 * The stages this request's route names but which have nobody to decide
 * them, and so were dropped. The submission log says so - otherwise it looks
 * as though an approval was skipped on purpose.
 */
export function skippedStages(
  role: Role,
  service: ServiceType = "room",
  context: RoutingContext = {}
): ApprovalStage[] {
  if (!BOOKABLE_ROLES.includes(role)) return [];
  const rules = context.rules ?? DEFAULT_APPROVAL_RULES;
  return stagesFor(requestFacts(role, service, context), rules).filter(
    (stage) => !stageIsStaffed(stage, context)
  );
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
 * nobody other than the requester is set to give it. A special case of
 * {@link skippedStages}, kept because the submission log has worded it that
 * way since Phase 4.
 */
export function hodStageMissing(
  role: Role,
  service: ServiceType,
  context: RoutingContext
): boolean {
  return skippedStages(role, service, context).some((stage) => stage.approver.kind === "hod");
}

/** Which intermediate status a reviewer role is responsible for. */
export const REVIEWER_STAGE: Partial<Record<Role, BookingStatus>> = {
  warden: "PENDING_WARDEN",
  faculty_advisor: "PENDING_FA",
  iar_cell: "PENDING_IAR",
  gh_manager: "PENDING_GH_MANAGER",
};

/** Who a stored booking was raised by, where that matters to its route. */
type RaisedBy = { user_role?: Role; user_id?: string | null; created_by?: string | null };

/**
 * The routing context of a stored booking, from its requester and the units
 * now. `options.rules` is the office's configured chains - omit it and the
 * defaults apply; `options.profiles` lets a stage whose approver is a role or
 * a named account be counted as well as an HOD's.
 */
export function routingContextFor(
  booking: { booking_type?: string; office_approval?: OfficeApproval | null } & RaisedBy,
  requester: Pick<Profile, "id" | "staff_category" | "unit_id" | "hostel_name">,
  units: Unit[],
  options: { rules?: ApprovalRules; profiles?: Profile[] } = {}
): RoutingContext {
  return {
    bookingType: booking.booking_type,
    staffCategory: requester.staff_category ?? null,
    officeApproval: booking.office_approval ?? null,
    hasHodApprover: hodApproversFor(requester, units).length > 0,
    raisedByFacultyInCharge: booking.user_role
      ? raisedByFacultyInCharge({
          user_role: booking.user_role,
          user_id: booking.user_id ?? requester.id,
          created_by: booking.created_by ?? null,
        })
      : false,
    unitId: requester.unit_id ?? null,
    hostelName: requester.hostel_name ?? null,
    rules: options.rules,
    directory: { units, ...(options.profiles ? { profiles: options.profiles } : {}) },
    requester,
  };
}

/**
 * Every intermediate stage a booking passes through before the Guest House
 * Manager, in order - its whole chain, not just where it is now. Used for the
 * Copy-to line (everyone who signs a request off is copied on the staff mail
 * about it for the rest of its life) and to find the next stage.
 */
export function approvalStagesFor(
  booking: {
    user_role: Role;
    service_type?: ServiceType;
    booking_type?: string;
    office_approval?: OfficeApproval | null;
    user_id?: string | null;
    created_by?: string | null;
  },
  requester: Pick<Profile, "id" | "staff_category" | "unit_id" | "hostel_name">,
  units: Unit[] = [],
  options: { rules?: ApprovalRules; profiles?: Profile[] } = {}
): BookingStatus[] {
  try {
    return routeFor(
      booking.user_role,
      booking.service_type ?? "room",
      routingContextFor(booking, requester, units, options)
    );
  } catch {
    // A role that cannot book (a stored booking under a role since removed).
    return [];
  }
}

/** As {@link approvalStagesFor}, with each stage's approver rule and name. */
export function approvalStageDetailsFor(
  booking: Parameters<typeof approvalStagesFor>[0],
  requester: Parameters<typeof approvalStagesFor>[1],
  units: Unit[] = [],
  options: { rules?: ApprovalRules; profiles?: Profile[] } = {}
): ApprovalStage[] {
  try {
    return routeStagesFor(
      booking.user_role,
      booking.service_type ?? "room",
      routingContextFor(booking, requester, units, options)
    );
  } catch {
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
 * with the booking's stages - a club's FA approval goes on to the HOD.
 */
export function nextStatusOnApprove(current: BookingStatus): BookingStatus {
  return nextStatusAfter(current, []);
}

/**
 * What `canReview` needs beyond the reviewer, the status and the requester.
 *
 * All three are optional, and each one it is given makes the answer more
 * exact rather than different:
 *
 * - **`rules`** - the office's configured chains. Without them the stage's
 *   built-in meaning applies ({@link BUILT_IN_STAGE_APPROVERS}), which is
 *   the pipeline as it was before the chains were configurable.
 * - **`request`** - what the request is, so the *configured* stage governing
 *   this status can be found. A stage the current rules no longer describe
 *   falls back to its built-in meaning, so editing a route can never strand
 *   a request already waiting.
 * - **`profiles`** - every account, needed to resolve a stage decided by a
 *   role or a named person. Without it such a stage is answered from the
 *   reviewer's own profile, which is what the old `REVIEWER_STAGE` map did.
 */
export type ReviewContext = {
  rules?: ApprovalRules;
  request?: RequestFacts;
  profiles?: Profile[];
};

/** The request facts of a stored booking, for {@link canReview}. */
export function requestFactsFor(
  booking: {
    user_role: Role;
    service_type?: ServiceType;
    booking_type?: string;
    office_approval?: OfficeApproval | null;
    user_id?: string | null;
    created_by?: string | null;
  },
  requester: Pick<Profile, "id" | "staff_category" | "unit_id" | "hostel_name">
): RequestFacts {
  return {
    role: booking.user_role,
    service: booking.service_type ?? "room",
    bookingType: (booking.booking_type as BookingType | undefined) ?? null,
    staffCategory: requester.staff_category ?? null,
    officeApproval: booking.office_approval ?? null,
    raisedByFacultyInCharge: raisedByFacultyInCharge({
      user_role: booking.user_role,
      user_id: booking.user_id ?? requester.id,
      created_by: booking.created_by ?? null,
    }),
    unitId: requester.unit_id ?? null,
    hostelName: requester.hostel_name ?? null,
  };
}

/**
 * Can `reviewer` act on a booking currently in `status`, submitted by `requester`? *
 * **Who decides a stage is configuration** (12 Oct 2026). The stage the
 * request is waiting in is looked up in the office's route for it, and that
 * stage names its approver: the Assistant Warden of the requester's hostel,
 * the HOD of their unit, the head of their own unit, everyone holding a
 * role, the head of one named unit, or one named person
 * (`lib/approval-routes.ts`). The two kinds this started as are still the
 * two that matter:
 *
 * - **Relative to the requester** - `warden`, `hod`, `unit_head` - resolved
 *   from who heads what *now* (`approversOf`, `hodApproversFor`), so a
 *   change of HOD moves the waiting requests with it and nobody edits a
 *   booking. The approver need not hold a reviewer role at all: a council
 *   secretary is a student, an HOD an employee.
 * - **Named outright** - `role`, `unit`, `profile` - which is how an office
 *   says "every request from Civil also goes to the Dean of Students".
 *
 * A club whose unit has nobody set falls back to the old advisor rule, so a
 * request cannot be stranded because the console was half filled in; a stage
 * the current routes no longer describe falls back to its built-in meaning,
 * so neither can a reconfiguration strand one.
 *
 * Nobody ever approves their own request.
 */
export function canReview(
  reviewer: Profile,
  status: BookingStatus,
  requester: Profile,
  units: Unit[] = [],
  context: ReviewContext = {}
): boolean {
  // Nobody signs off their own request. The IAR Office both books and
  // reviews, and an HOD books too - this is the belt-and-braces check behind
  // the routing that already skips them.
  if (reviewer.id === requester.id) return false;

  // The last stage of every route, and the one stage no configuration moves:
  // approval there is room allocation.
  if (status === "PENDING_GH_MANAGER") return reviewer.role === "gh_manager";
  if (!isStageStatus(status)) return false;

  const configured = context.request
    ? stageForStatus(status, context.request, context.rules ?? DEFAULT_APPROVAL_RULES)
    : null;
  const approver = configured?.approver ?? BUILT_IN_STAGE_APPROVERS[status];
  return decidesStage(reviewer, approver, requester, {
    units,
    ...(context.profiles ? { profiles: context.profiles } : {}),
  });
}

/**
 * `canReview`, for a booking that exists: also refuses whoever **raised** it.
 * `canReview` sees only the requester, and a club booking's requester is the
 * club - so a faculty in-charge who is also the club's HOD would otherwise be
 * asked to approve the request they raised themselves.
 */
export function canReviewBooking(
  reviewer: Profile,
  booking: {
    status: BookingStatus;
    requester: Profile;
    created_by?: string | null;
    user_role?: Role;
    user_id?: string | null;
    service_type?: ServiceType;
    booking_type?: string;
    office_approval?: OfficeApproval | null;
  },
  units: Unit[] = [],
  context: Omit<ReviewContext, "request"> = {}
): boolean {
  if (booking.created_by && booking.created_by === reviewer.id) return false;
  // The booking's own facts, so the stage it waits in is read from the route
  // the office configured for *this* request and not from the slot's name.
  const request = booking.user_role
    ? requestFactsFor(
        { ...booking, user_role: booking.user_role },
        booking.requester
      )
    : undefined;
  return canReview(reviewer, booking.status, booking.requester, units, { ...context, request });
}

/**
 * Whether this person may act for a booking as its requester - ask to cancel
 * it, ask to extend it. The requester, and whoever raised it for them: a
 * club's faculty in-charge (24 Sep 2026). The Guest House Manager's desk
 * bookings are the manager's own already (`user_id`), so this adds nobody
 * there.
 */
export function actsAsRequester(
  booking: { user_id: string; created_by?: string | null },
  userId: string
): boolean {
  return booking.user_id === userId || (Boolean(booking.created_by) && booking.created_by === userId);
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
 * `OCCUPIED` is a *fact the manager records at the desk* - the guest walked in
 * - not something a date implies. So the phase is read off the booking's own
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
 * A guest who turns up *a day* early has no room - the previous one is still
 * in it - so the window is the same two hours the changeover override uses,
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
  return `This stay starts on ${formatDateTime(booking.check_in)}. A guest can be checked in up to ${TURNOVER_GRACE_HOURS} hours before that, no earlier - until then the room may still have someone in it.`;
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
 * for can no longer happen. Nothing deletes it - the archive keeps what was
 * asked for - but it must stop behaving like a live request: approving one
 * would hold rooms for dates in the past, and it should not sit in a queue
 * looking actionable.
 *
 * The way out is to reject it, or for the manager to move the dates
 * (`updateBookingStay`) and then allocate.
 */
type LapsableBooking = {
  status: BookingStatus;
  check_in: string;
  check_out?: string;
  service_type?: ServiceType;
};

/**
 * The instant after which the request can no longer be honoured.
 *
 * For a stay that is check-in: approving it afterwards would hold rooms for
 * dates in the past. A **dining booking has no check-in** - its `check_in` is
 * midnight on its first day of meals, which is already past the moment someone
 * books a meal for today, and booking a meal for today is allowed (the
 * kitchen's notice period is what limits it). What makes one lapse is its last
 * meal day being over, so that is measured from `check_out`.
 */
function lapseDeadline(booking: LapsableBooking): string {
  return booking.service_type === "meals_only"
    ? (booking.check_out ?? booking.check_in)
    : booking.check_in;
}

export function hasLapsed(booking: LapsableBooking, now: Date = new Date()): boolean {
  return ACTIVE_STATUSES.includes(booking.status) && lapseDeadline(booking) < now.toISOString();
}

/** Why this request can no longer be approved, or null when it still can. */
export function lapsedError(booking: LapsableBooking, now: Date = new Date()): string | null {
  if (!hasLapsed(booking, now)) return null;
  if (booking.service_type === "meals_only") {
    return `This request was never decided and its last day of meals (${formatDateTime(
      lapseDeadline(booking)
    )}) has passed, so the kitchen cannot serve it. Reject it to close it off.`;
  }
  return `This request was never decided and its check-in (${formatDateTime(
    booking.check_in
  )}) has passed, so the stay cannot happen. Reject it, or ask the Guest House Manager to move the dates first.`;
}

// ------------------------------------------------------------------ missed

/**
 * A request nobody decided in time (migration 29, 7 Oct 2026).
 *
 * `hasLapsed` has described this state since September - the queues drew a
 * badge and `lapsedError` refused to forward it - but the request kept its
 * pending status, so it sat in somebody's queue for ever waiting to be
 * rejected by hand, and the requester was never told. The nightly sweep now
 * marks it, logs it and mails them.
 *
 * It is **not** a rejection: nobody decided anything. That is why it has its
 * own status and why the manager can put it back
 * ({@link reinstateMissedError}) - the office asked for a way to recover a
 * request the desk still wants, which a rejection does not give.
 */
export const MISSED_STATUS: BookingStatus = "MISSED";

/**
 * Whether the nightly job should mark this request as Missed.
 *
 * Two things have to be true: the request has lapsed (its check-in has gone,
 * or for a dining booking its last day of meals - `lapseDeadline`), **and**
 * nobody has put it back since it was last marked. The second is what makes
 * reinstating mean anything: without it the next night's run would mark a
 * request the manager had deliberately recovered, every night, for ever.
 *
 * "Put back" is read structurally rather than from the remarks: reinstating
 * writes a log entry whose `previous_status` is MISSED, so a reinstatement is
 * a log row that says where it came from. No string matching, and no column.
 */
export function missedSweepable(
  booking: LapsableBooking & { logs?: Pick<BookingLog, "new_status" | "previous_status" | "timestamp">[] },
  now: Date = new Date()
): boolean {
  if (!hasLapsed(booking, now)) return false;
  return !reinstatedAfterMissed(booking.logs ?? []);
}

/** Whether the newest reinstatement is newer than the newest Missed marking. */
export function reinstatedAfterMissed(
  logs: Pick<BookingLog, "new_status" | "previous_status" | "timestamp">[]
): boolean {
  const latest = (match: (l: Pick<BookingLog, "new_status" | "previous_status">) => boolean) =>
    logs.filter(match).reduce<string | null>((at, l) => (at === null || l.timestamp > at ? l.timestamp : at), null);
  const missedAt = latest((l) => l.new_status === "MISSED");
  if (missedAt === null) return false;
  const reinstatedAt = latest((l) => l.previous_status === "MISSED");
  return reinstatedAt !== null && reinstatedAt > missedAt;
}

/**
 * The stage a reinstated request goes back to: whichever it was waiting at
 * when the sweep caught it, read from the log entry that marked it. A booking
 * with no such entry - forced into MISSED from the developer console, say -
 * goes to the manager, who is the one stage every route ends at.
 */
export function statusBeforeMissed(
  logs: Pick<BookingLog, "new_status" | "previous_status" | "timestamp">[]
): BookingStatus {
  const marking = logs
    .filter((l) => l.new_status === "MISSED")
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))[0];
  const before = marking?.previous_status;
  return before && ACTIVE_STATUSES.includes(before) ? before : "PENDING_GH_MANAGER";
}

/**
 * Why this request cannot be reinstated, or null when it can.
 *
 * Only a Missed one can be: a rejection was a decision and a cancellation was
 * asked for, and neither should be undone by this. Reinstating puts the
 * request back in the queue it was in, lapsed badge and all - the manager's
 * next move is to move the dates and allocate, exactly as it was before the
 * sweep existed. The nightly job will not mark it again
 * ({@link missedSweepable}).
 */
export function reinstateMissedError(booking: Pick<Booking, "status">): string | null {
  return booking.status === "MISSED"
    ? null
    : "Only a request marked Missed can be reinstated.";
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
 * row says - and rows can say so, because the developer console can force any
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

/** All roles now have access to logs - requesters see their own bookings. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function canViewHistory(_role: Role): boolean {
  return true;
}

/**
 * Who may take the log away as a PDF: **everybody**, since 9 Oct 2026.
 *
 * It was the manager and the developer. CSV was already open to every role,
 * and both exports re-derive the user, the scope and the filters on the
 * server from nothing but a query string (`exportHistoryCsv`,
 * `exportHistoryPdf`) - so a requester's PDF holds their own bookings and an
 * approver's holds their jurisdiction, exactly as the page they are looking
 * at does. Keeping PDF back meant a requester could have the same rows in the
 * one format a guest house office will not accept.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function canExportPdf(_role: Role): boolean {
  return true;
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
      /** True for requester roles - hides the "Handled by me / Everything" toggle. */
      isOwnBookings: boolean;
    }
  | { ok: false; reason: string };

/**
 * Archive counterpart to `canReview()`. A reviewer may look back over exactly
 * the requests they were ever responsible for - wardens their own hostel's
 * students, advisors their own club, the IAR cell alumni requests. The manager
 * and the developer see every booking. Requesters see only their own bookings.
 */
export function historyScope(user: Profile, units: Unit[] = []): HistoryScope {
  // An HOD, a council secretary, an office head: they approve by appointment,
  // so their archive is their own bookings plus the requests of the units
  // they approve for - found the way `canReview` finds them.
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
