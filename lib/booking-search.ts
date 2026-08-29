import {
  ROLE_LABELS,
  STATUS_LABELS,
  type BookingLog,
  type BookingStatus,
  type BookingWithDetails,
  type Role,
} from "@/lib/types";
import { REQUESTER_ROLES } from "@/lib/types";

/**
 * Keyword + filter search over the booking archive.
 *
 * The matching rules live here — as pure functions over already-hydrated
 * bookings — so that `MockStore` and `SupabaseStore` cannot drift apart.
 * Each store fetches candidate rows its own way and then hands them to
 * `runBookingSearch`.
 */

export type BookingSortKey = "recent" | "checkin" | "reference";

export const BOOKING_SORT_KEYS: BookingSortKey[] = ["recent", "checkin", "reference"];

export const SORT_LABELS: Record<BookingSortKey, string> = {
  recent: "Newest first",
  checkin: "Check-in date",
  reference: "Reference ID",
};

export interface BookingSearchCriteria {
  /** Free text. Supports `field:value` tokens — see `SEARCH_FIELD_ALIASES`. */
  query?: string;
  /** Match any one of these statuses. Empty or omitted means "any status". */
  statuses?: BookingStatus[];
  guestHouseId?: string;
  userRole?: Role;
  /** Requester scoping, same semantics as `BookingFilter`. */
  hostelName?: string;
  club?: string;
  /** Keep only bookings this profile id has acted on (an approval-log view). */
  actedBy?: string;
  /** Keep only bookings owned by this user id (requester's own log view). */
  userId?: string;
  /** ISO instants bounding `check_in`. */
  checkInFrom?: string;
  checkInTo?: string;
  sort?: BookingSortKey;
  offset?: number;
  limit?: number;
}

export interface BookingSearchResult {
  /** The requested page of matches. */
  rows: BookingWithDetails[];
  /** Matches before paging. */
  total: number;
  /**
   * Match counts per status, computed while *ignoring* `criteria.statuses`, so
   * the status filter can show live facet counts without disabling itself.
   */
  statusCounts: Record<BookingStatus, number>;
  /** True when the backend could not scan the whole archive — see SupabaseStore. */
  truncated: boolean;
}

// ---- query tokenizer -------------------------------------------------

export type SearchField =
  | "any"
  | "reference"
  | "guest"
  | "room"
  | "requester"
  | "purpose"
  | "guesthouse"
  | "status";

/** `ref:IITPKD-…`, `guest:"Anita Rao"`, `room:B-101`, `by:priya@…` */
export const SEARCH_FIELD_ALIASES: Record<string, SearchField> = {
  ref: "reference",
  id: "reference",
  booking: "reference",
  guest: "guest",
  room: "room",
  by: "requester",
  from: "requester",
  requester: "requester",
  email: "requester",
  purpose: "purpose",
  reason: "purpose",
  gh: "guesthouse",
  house: "guesthouse",
  guesthouse: "guesthouse",
  status: "status",
};

export interface SearchToken {
  field: SearchField;
  /** Already lower-cased. */
  value: string;
}

/** Optional `field:` prefix, then either a "quoted phrase" or a bare run. */
const TOKEN_PATTERN = /(?:([a-zA-Z]+):)?(?:"([^"]*)"|(\S+))/g;

export function tokenizeQuery(raw: string): SearchToken[] {
  const tokens: SearchToken[] = [];
  for (const match of (raw ?? "").matchAll(TOKEN_PATTERN)) {
    const prefix = match[1]?.toLowerCase();
    const body = (match[2] ?? match[3] ?? "").trim();
    if (!body) continue;
    const field = prefix ? SEARCH_FIELD_ALIASES[prefix] : undefined;
    // An unrecognised prefix is not a field — keep the chunk as literal text
    // so that pasting something like "http://x" still searches for it.
    const value = field ? body : prefix ? `${prefix}:${body}` : body;
    tokens.push({ field: field ?? "any", value: value.toLowerCase() });
  }
  return tokens;
}

type Haystacks = Record<Exclude<SearchField, "any">, string>;

function buildHaystacks(b: BookingWithDetails): Haystacks {
  return {
    reference: b.booking_reference_id ?? "",
    guest: b.guests
      .map((g) => [g.name, g.relationship, g.id_number].filter(Boolean).join(" "))
      .join(" "),
    room: b.assigned_rooms.map((r) => r.room_number).join(" "),
    requester: [
      b.requester?.full_name,
      b.requester?.email,
      b.requester?.roll_number,
      b.requester?.hostel_name,
      b.requester?.department_or_club,
    ]
      .filter(Boolean)
      .join(" "),
    purpose: b.purpose_of_visit ?? "",
    guesthouse: b.guest_house?.name ?? "",
    status: `${b.status} ${STATUS_LABELS[b.status] ?? ""}`,
  };
}

/** Everything a bare keyword can hit, including the audit trail. */
function buildAnyHaystack(b: BookingWithDetails, h: Haystacks): string {
  return [
    h.reference,
    h.guest,
    h.room,
    h.requester,
    h.purpose,
    h.guesthouse,
    h.status,
    ROLE_LABELS[b.user_role] ?? "",
    b.rejection_reason ?? "",
    (b.custom_fields ?? []).map((f) => `${f.label} ${String(f.value)}`).join(" "),
    b.logs.map((l) => `${l.action_by_name} ${l.remarks ?? ""}`).join(" "),
  ].join(" ");
}

export function bookingMatchesTokens(b: BookingWithDetails, tokens: SearchToken[]): boolean {
  if (tokens.length === 0) return true;
  const haystacks = buildHaystacks(b);
  const lowered = {
    reference: haystacks.reference.toLowerCase(),
    guest: haystacks.guest.toLowerCase(),
    room: haystacks.room.toLowerCase(),
    requester: haystacks.requester.toLowerCase(),
    purpose: haystacks.purpose.toLowerCase(),
    guesthouse: haystacks.guesthouse.toLowerCase(),
    status: haystacks.status.toLowerCase(),
    any: buildAnyHaystack(b, haystacks).toLowerCase(),
  };
  // Every token must match — narrowing, not widening.
  return tokens.every((t) => lowered[t.field].includes(t.value));
}

// ---- criteria matching -----------------------------------------------

/** Timestamps arrive as `…Z` from the mock store and `…+00:00` from PostgREST. */
function toMillis(iso: string | null | undefined): number {
  return iso ? Date.parse(iso) : Number.NaN;
}

/** Every criterion except `statuses`, which is applied separately for faceting. */
function matchesExceptStatus(
  b: BookingWithDetails,
  c: BookingSearchCriteria,
  tokens: SearchToken[]
): boolean {
  if (c.guestHouseId && b.guest_house_id !== c.guestHouseId) return false;
  if (c.userRole && b.user_role !== c.userRole) return false;
  if (c.hostelName && b.requester?.hostel_name !== c.hostelName) return false;
  if (c.club && b.requester?.department_or_club !== c.club) return false;
  if (c.actedBy && !reviewerActionsOn(b, c.actedBy).length) return false;
  if (c.userId && b.user_id !== c.userId) return false;

  if (c.checkInFrom || c.checkInTo) {
    const checkIn = toMillis(b.check_in);
    if (Number.isNaN(checkIn)) return false;
    if (c.checkInFrom && checkIn < toMillis(c.checkInFrom)) return false;
    if (c.checkInTo && checkIn > toMillis(c.checkInTo)) return false;
  }

  return bookingMatchesTokens(b, tokens);
}

export function bookingMatchesCriteria(
  b: BookingWithDetails,
  c: BookingSearchCriteria,
  tokens: SearchToken[] = tokenizeQuery(c.query ?? "")
): boolean {
  if (c.statuses?.length && !c.statuses.includes(b.status)) return false;
  return matchesExceptStatus(b, c, tokens);
}

export function sortBookings(
  rows: BookingWithDetails[],
  sort: BookingSortKey = "recent"
): BookingWithDetails[] {
  const sorted = [...rows];
  switch (sort) {
    case "checkin":
      sorted.sort((a, b) => toMillis(b.check_in) - toMillis(a.check_in));
      break;
    case "reference":
      sorted.sort((a, b) => a.booking_reference_id.localeCompare(b.booking_reference_id));
      break;
    default:
      sorted.sort((a, b) => toMillis(b.created_at) - toMillis(a.created_at));
  }
  return sorted;
}

export function emptyStatusCounts(): Record<BookingStatus, number> {
  return {
    PENDING_WARDEN: 0,
    PENDING_FA: 0,
    PENDING_IAR: 0,
    PENDING_GH_MANAGER: 0,
    APPROVED: 0,
    REJECTED: 0,
    CANCELLED: 0,
    OCCUPIED: 0,
    VACATED: 0,
    CANCELLATION_REQUESTED: 0,
    CANCELLATION_APPROVED: 0,
  };
}

/**
 * Filter, facet, sort and page a set of candidate bookings. Both stores route
 * through this so their results are identical for the same criteria.
 */
export function runBookingSearch(
  candidates: BookingWithDetails[],
  criteria: BookingSearchCriteria,
  truncated = false
): BookingSearchResult {
  const tokens = tokenizeQuery(criteria.query ?? "");

  // Facet counts deliberately ignore the status filter, so the status chips
  // keep showing what *would* match if the user switched to another status.
  const statusCounts = emptyStatusCounts();
  const beforeStatus = candidates.filter((b) => matchesExceptStatus(b, criteria, tokens));
  for (const b of beforeStatus) {
    if (b.status in statusCounts) statusCounts[b.status] += 1;
  }

  const matched = criteria.statuses?.length
    ? beforeStatus.filter((b) => criteria.statuses!.includes(b.status))
    : beforeStatus;

  const sorted = sortBookings(matched, criteria.sort);
  const offset = Math.max(0, criteria.offset ?? 0);
  const rows =
    criteria.limit === undefined ? sorted.slice(offset) : sorted.slice(offset, offset + criteria.limit);

  return { rows, total: sorted.length, statusCounts, truncated };
}

// ---- "what did I do to this booking?" --------------------------------

export type ReviewerActionKind = "approved" | "rejected" | "cancelled" | "other";

export interface ReviewerAction {
  log: BookingLog;
  kind: ReviewerActionKind;
}

function actionKind(status: BookingStatus): ReviewerActionKind {
  // An intermediate approval lands on PENDING_GH_MANAGER; the manager's own
  // approval (via room allocation) lands on APPROVED.
  if (status === "APPROVED" || status === "PENDING_GH_MANAGER") return "approved";
  if (status === "REJECTED") return "rejected";
  if (status === "CANCELLED" || status === "CANCELLATION_APPROVED") return "cancelled";
  return "other";
}

/**
 * Log entries where `userId` changed this booking's status. The submission
 * entry (`previous_status === null`) is excluded — submitting is not reviewing.
 */
export function reviewerActionsOn(b: BookingWithDetails, userId: string): ReviewerAction[] {
  return b.logs
    .filter((l) => l.action_by === userId && l.previous_status !== null)
    .map((log) => ({ log, kind: actionKind(log.new_status) }));
}

/** The most recent action `userId` took on this booking, if any. */
export function latestReviewerActionOn(
  b: BookingWithDetails,
  userId: string
): ReviewerAction | null {
  const actions = reviewerActionsOn(b, userId);
  return actions.length > 0 ? actions[actions.length - 1] : null;
}

// ---- query-string handling -------------------------------------------

export const HISTORY_PAGE_SIZE = 20;
/** Hard ceiling on a CSV export, so one click cannot pull the whole archive. */
export const HISTORY_EXPORT_LIMIT = 5000;

export type HistoryActor = "me" | "all";

export interface HistoryParams {
  q: string;
  statuses: BookingStatus[];
  guestHouseId?: string;
  userRole?: Role;
  actor: HistoryActor;
  /** `yyyy-mm-dd`, exactly as it appears in the URL and the date inputs. */
  from?: string;
  to?: string;
  sort: BookingSortKey;
  page: number;
}

export type RawSearchParams = Record<string, string | string[] | undefined>;

const ALL_STATUSES = Object.keys(STATUS_LABELS) as BookingStatus[];
const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function firstValue(v: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(v) ? v[0] : v;
  const trimmed = raw?.trim();
  return trimmed ? trimmed : undefined;
}

function validDay(v: string | undefined): string | undefined {
  if (!v || !DAY_PATTERN.test(v)) return undefined;
  return Number.isNaN(Date.parse(`${v}T00:00:00`)) ? undefined : v;
}

/** Parse and validate the query string. Anything unrecognised is dropped. */
export function parseHistoryParams(
  raw: RawSearchParams,
  defaultActor: HistoryActor = "me"
): HistoryParams {
  const statusParam = firstValue(raw.status);
  const statuses = statusParam
    ? statusParam
        .split(",")
        .map((s) => s.trim().toUpperCase())
        .filter((s): s is BookingStatus => (ALL_STATUSES as string[]).includes(s))
    : [];

  const roleParam = firstValue(raw.role);
  const userRole = REQUESTER_ROLES.includes(roleParam as Role) ? (roleParam as Role) : undefined;

  const sortParam = firstValue(raw.sort) as BookingSortKey | undefined;
  const sort = sortParam && BOOKING_SORT_KEYS.includes(sortParam) ? sortParam : "recent";

  const actorParam = firstValue(raw.actor);
  const actor: HistoryActor =
    actorParam === "me" || actorParam === "all" ? actorParam : defaultActor;

  const pageParam = Number.parseInt(firstValue(raw.page) ?? "1", 10);
  const page = Number.isFinite(pageParam) && pageParam > 0 ? pageParam : 1;

  return {
    q: firstValue(raw.q) ?? "",
    statuses: [...new Set(statuses)],
    guestHouseId: firstValue(raw.gh),
    userRole,
    actor,
    from: validDay(firstValue(raw.from)),
    to: validDay(firstValue(raw.to)),
    sort,
    page,
  };
}

/** Local midnight / end-of-day, matching how `formatDateTime` renders dates. */
export function dayStartIso(day: string): string {
  return new Date(`${day}T00:00:00`).toISOString();
}

export function dayEndIso(day: string): string {
  return new Date(`${day}T23:59:59.999`).toISOString();
}

/**
 * Turn validated params into store criteria. `scope` is spread last so a
 * reviewer's authorization boundary can never be widened from the URL.
 */
export function criteriaFromParams(
  params: HistoryParams,
  scope: Pick<BookingSearchCriteria, "hostelName" | "club" | "userRole" | "userId">,
  currentUserId: string,
  paging?: { offset?: number; limit?: number }
): BookingSearchCriteria {
  return {
    query: params.q,
    statuses: params.statuses,
    guestHouseId: params.guestHouseId,
    userRole: params.userRole,
    actedBy: params.actor === "me" ? currentUserId : undefined,
    checkInFrom: params.from ? dayStartIso(params.from) : undefined,
    checkInTo: params.to ? dayEndIso(params.to) : undefined,
    sort: params.sort,
    ...paging,
    ...scope,
  };
}

/** True when anything other than the default view is in effect. */
export function hasActiveFilters(params: HistoryParams, defaultActor: HistoryActor): boolean {
  return Boolean(
    params.q ||
      params.statuses.length ||
      params.guestHouseId ||
      params.userRole ||
      params.from ||
      params.to ||
      params.sort !== "recent" ||
      params.actor !== defaultActor
  );
}
