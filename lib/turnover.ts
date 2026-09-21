import type { RoomOccupancySegment } from "./types";

/**
 * Turnover overlaps, the turnaround buffer, and the manager's power to accept
 * a tight changeover.
 *
 * A guest house is not a database: a room booked "until 12:00" is usually
 * empty by 10:00, because the outgoing guest leaves after breakfast and
 * housekeeping is quick. The portal used to refuse the 10:00 arrival outright,
 * so the desk booked them by telephone and the portal stopped describing
 * reality — which is the failure mode every rule here is trying to avoid.
 *
 * Two rules meet here:
 *
 * - **The turnaround buffer** (Phase 3, a Setting — `rules.booking.buffer_minutes`,
 *   4 hours by default): the least time between one stay's check-out and the
 *   next check-in on the same room, for housekeeping. Only the *end* of a hold
 *   is padded, so the gap is the buffer, not twice it.
 * - **The turnover override** (migration 14): the Guest House Manager may
 *   accept a changeover that is tighter than that — even an overlap of up to
 *   `TURNOVER_GRACE_HOURS` — and it is recorded against the booking.
 *
 * So a requested stay is, against each stay a room already holds:
 *
 * - **free** — their guards (below) do not meet; allocatable.
 * - **soft** — they meet, but the real overlap is no more than the grace at one
 *   end (a gap shorter than the buffer counts: its "overlap" is negative).
 *   Shown to the manager in yellow, allocatable only by an explicit override.
 * - **hard** — a genuine clash. Never allocatable.
 *
 * `holdGuard` is the database's `room_hold_guard()` (migration 17) in JS: the
 * range the exclusion constraint compares. The mock store uses it to emulate
 * the constraint, so both backends refuse exactly the same allocations.
 * Requesters never see soft vs hard: to them a held room is held.
 */
export const TURNOVER_GRACE_HOURS = 2;

const HOUR_MS = 3_600_000;
const GRACE_MS = TURNOVER_GRACE_HOURS * HOUR_MS;

/**
 * `turnaround`: the stays do not overlap, but the gap is shorter than the
 * buffer. `soft`: they overlap by no more than the grace. Both are the
 * manager's to accept; `hard` never is.
 */
export type ConflictKind = "free" | "turnaround" | "soft" | "hard";

const SEVERITY: Record<ConflictKind, number> = { free: 0, turnaround: 1, soft: 2, hard: 3 };

/** Whether the manager may allocate this room by accepting the changeover. */
export function isOverridable(kind: ConflictKind | undefined): boolean {
  return kind === "turnaround" || kind === "soft";
}

type Period = { from: string; to: string };

/** Minutes → milliseconds, clamped at zero. */
export function bufferMs(minutes: number): number {
  return Math.max(0, minutes) * 60_000;
}

/**
 * The range the no-overlap constraint compares for one hold, as epoch ms:
 * `[check_in, check_out + buffer)` normally; `[check_in + grace + buffer,
 * check_out − grace)` for a manager-accepted turnover, or a two-second sliver
 * at the midpoint when the stay is too short to shrink that far.
 */
export function holdGuard(
  period: Period,
  overridden: boolean,
  buffer: number
): { from: number; to: number } {
  const lo = Date.parse(period.from);
  const hi = Date.parse(period.to);
  if (!overridden) return { from: lo, to: hi + buffer };
  if (hi - GRACE_MS - (lo + GRACE_MS + buffer) > 0) {
    return { from: lo + GRACE_MS + buffer, to: hi - GRACE_MS };
  }
  const mid = lo + (hi - lo) / 2;
  return { from: mid - 1000, to: mid + 1000 };
}

/** Whether two half-open ranges share any instant. */
export function rangesOverlap(a: { from: number; to: number }, b: { from: number; to: number }): boolean {
  return a.from < b.to && b.from < a.to;
}

/** How badly a requested stay collides with one already held, under a buffer (ms). */
export function conflictBetween(requested: Period, held: Period, buffer = 0): ConflictKind {
  const rFrom = Date.parse(requested.from);
  const rTo = Date.parse(requested.to);
  const hFrom = Date.parse(held.from);
  const hTo = Date.parse(held.to);
  if ([rFrom, rTo, hFrom, hTo].some(Number.isNaN)) return "hard";

  // Free when neither stay's padded end reaches the other's start.
  if (rTo + buffer <= hFrom || hTo + buffer <= rFrom) return "free";

  // Only a meeting at one *end* is a turnover. A stay wholly inside another
  // is not somebody leaving late, however short it is.
  const containedEitherWay = (rFrom >= hFrom && rTo <= hTo) || (hFrom >= rFrom && hTo <= rTo);
  if (containedEitherWay) return "hard";

  // The real overlap at the end where they meet; negative for a gap shorter
  // than the buffer. The database allows an accepted turnover exactly when
  // this is within the grace (see `holdGuard`).
  const overlap = rFrom >= hFrom ? hTo - rFrom : rTo - hFrom;
  if (overlap <= 0) return "turnaround";
  return overlap <= GRACE_MS ? "soft" : "hard";
}

/** The worst conflict between a requested stay and everything a room holds. */
export function worstConflict(requested: Period, held: Period[], buffer = 0): ConflictKind {
  let worst: ConflictKind = "free";
  for (const h of held) {
    const kind = conflictBetween(requested, h, buffer);
    if (kind === "hard") return "hard";
    if (SEVERITY[kind] > SEVERITY[worst]) worst = kind;
  }
  return worst;
}

/** Each room's worst conflict with the requested stay, keyed by room id. */
export function conflictsByRoom(
  requested: Period,
  segments: RoomOccupancySegment[],
  buffer = 0
): Record<string, ConflictKind> {
  const held: Record<string, Period[]> = {};
  for (const s of segments) {
    (held[s.room_id] ??= []).push({ from: s.check_in, to: s.check_out });
  }
  return Object.fromEntries(
    Object.entries(held).map(([roomId, periods]) => [roomId, worstConflict(requested, periods, buffer)])
  );
}

/** Hours of overlap, rounded to the nearest half hour, for the manager's warning. */
export function overlapHours(requested: Period, held: Period): number {
  const overlap =
    Math.min(Date.parse(requested.to), Date.parse(held.to)) -
    Math.max(Date.parse(requested.from), Date.parse(held.from));
  return Math.max(0, Math.round((overlap / HOUR_MS) * 2) / 2);
}

/** "4 hours", "90 minutes", or "no" for the notices. */
export function describeBuffer(minutes: number): string {
  if (minutes <= 0) return "no";
  if (minutes % 60 === 0) return `${minutes / 60} hour${minutes === 60 ? "" : "s"}`;
  return `${minutes} minutes`;
}

export function overrideNotice(bufferMinutes: number): string {
  const buffer =
    bufferMinutes > 0
      ? `A room needs ${describeBuffer(bufferMinutes)} between guests for housekeeping. `
      : "";
  return `${buffer}Another stay ends too close to this one starting (or starts too soon after it ends) — within the ${describeBuffer(
    bufferMinutes
  )} turnaround, or overlapping it by up to ${TURNOVER_GRACE_HOURS} hours. You can allocate the room anyway if you know the changeover will work — it is recorded against the booking.`;
}

/** The notice under the default 4-hour buffer, for places without settings. */
export const OVERRIDE_NOTICE = overrideNotice(240);
