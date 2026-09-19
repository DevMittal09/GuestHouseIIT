import type { RoomOccupancySegment } from "./types";

/**
 * Turnover overlaps, and the manager's power to accept one.
 *
 * A guest house is not a database: a room booked "until 12:00" is usually
 * empty by 10:00, because the outgoing guest leaves after breakfast and
 * housekeeping is quick. The portal used to refuse the 10:00 arrival outright,
 * so the desk booked them by telephone and the portal stopped describing
 * reality — which is the failure mode every rule here is trying to avoid.
 *
 * So a *small* overlap is a different thing from a real clash:
 *
 * - **hard** — the two stays genuinely collide. Never allocatable.
 * - **soft** — they overlap by no more than `TURNOVER_GRACE_HOURS` at one end.
 *   Shown to the Guest House Manager in yellow, and allocatable only if they
 *   deliberately override it, which is recorded in the booking's log.
 *
 * Requesters never see this distinction: to them a held room is held. The
 * override is a judgement about how *this* guest house actually runs, and it
 * is the manager's to make.
 */
export const TURNOVER_GRACE_HOURS = 2;

const GRACE_MS = TURNOVER_GRACE_HOURS * 3_600_000;

export type ConflictKind = "free" | "soft" | "hard";

/** How badly a requested stay collides with one already held. */
export function conflictBetween(
  requested: { from: string; to: string },
  held: { from: string; to: string }
): ConflictKind {
  const rFrom = Date.parse(requested.from);
  const rTo = Date.parse(requested.to);
  const hFrom = Date.parse(held.from);
  const hTo = Date.parse(held.to);
  if ([rFrom, rTo, hFrom, hTo].some(Number.isNaN)) return "hard";

  // Half-open, like `room_holds.during`: touching ends do not overlap.
  const overlap = Math.min(rTo, hTo) - Math.max(rFrom, hFrom);
  if (overlap <= 0) return "free";

  // Only an overlap at one *end* is a turnover. A stay wholly inside another
  // is not somebody leaving late, however short it is.
  const containedEitherWay = (rFrom >= hFrom && rTo <= hTo) || (hFrom >= rFrom && hTo <= rTo);
  if (containedEitherWay) return "hard";

  return overlap <= GRACE_MS ? "soft" : "hard";
}

/** The worst conflict between a requested stay and everything a room holds. */
export function worstConflict(
  requested: { from: string; to: string },
  held: { from: string; to: string }[]
): ConflictKind {
  let worst: ConflictKind = "free";
  for (const h of held) {
    const kind = conflictBetween(requested, h);
    if (kind === "hard") return "hard";
    if (kind === "soft") worst = "soft";
  }
  return worst;
}

/** Each room's worst conflict with the requested stay, keyed by room id. */
export function conflictsByRoom(
  requested: { from: string; to: string },
  segments: RoomOccupancySegment[]
): Record<string, ConflictKind> {
  const held: Record<string, { from: string; to: string }[]> = {};
  for (const s of segments) {
    (held[s.room_id] ??= []).push({ from: s.check_in, to: s.check_out });
  }
  return Object.fromEntries(
    Object.entries(held).map(([roomId, periods]) => [roomId, worstConflict(requested, periods)])
  );
}

/** Hours of overlap, rounded to the nearest half hour, for the manager's warning. */
export function overlapHours(
  requested: { from: string; to: string },
  held: { from: string; to: string }
): number {
  const overlap =
    Math.min(Date.parse(requested.to), Date.parse(held.to)) -
    Math.max(Date.parse(requested.from), Date.parse(held.from));
  return Math.max(0, Math.round((overlap / 3_600_000) * 2) / 2);
}

export const OVERRIDE_NOTICE = `A stay already ends within ${TURNOVER_GRACE_HOURS} hours of this one starting, or starts within ${TURNOVER_GRACE_HOURS} hours of it ending. You can allocate the room anyway if you know the changeover will work — it is recorded against the booking.`;
