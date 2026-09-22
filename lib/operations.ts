import { rangesOverlap } from "./turnover";
import type { BookingWithDetails, RoomOccupancySegment } from "./types";

/**
 * What happens to a stay after allocation, beyond check-in and check-out
 * (Phase 7): maintenance blocks, extensions, no-shows, and adding rooms in
 * bulk. Pure rules; the stores and actions apply them.
 */

// ------------------------------------------------------------ maintenance

/** A room out of service over [from, to), with no booking (migration 20). */
export type RoomBlock = {
  id: string;
  room_id: string;
  from: string;
  to: string;
  reason: string;
  created_by: string | null;
  created_at: string;
};

export type NewRoomBlockInput = Omit<RoomBlock, "id" | "created_at">;

export function roomBlockError(input: { from: string; to: string; reason: string }): string | null {
  const from = Date.parse(input.from);
  const to = Date.parse(input.to);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return "Choose when the room is out of service, from and until";
  if (to <= from) return "The room must be back in service after it goes out";
  if (to - from > 366 * 86_400_000) return "Block a room for at most a year at a time";
  const reason = input.reason.trim();
  if (reason.length < 3) return "Say why the room is out of service";
  if (reason.length > 300) return "Keep the reason under 300 characters";
  return null;
}

/** Whether a block overlaps a period (strict, half-open — the constraint's rule). */
export function blockOverlaps(block: Pick<RoomBlock, "from" | "to">, from: string, to: string): boolean {
  return rangesOverlap(
    { from: Date.parse(block.from), to: Date.parse(block.to) },
    { from: Date.parse(from), to: Date.parse(to) }
  );
}

/**
 * A block as a segment for the charts and the allocation grid, which already
 * draw segments. `kind: "maintenance"` is what they draw differently; the
 * reference reads "Maintenance" so a list or tooltip is never blank.
 */
export function blockSegment(block: RoomBlock): RoomOccupancySegment {
  return {
    room_id: block.room_id,
    booking_id: `block-${block.id}`,
    booking_reference_id: "Maintenance",
    status: "APPROVED",
    check_in: block.from,
    check_out: block.to,
    turnaround_until: null,
    requester_name: null,
    purpose_of_visit: block.reason,
    kind: "maintenance",
  };
}

// ------------------------------------------------------------ extensions

/** Why this stay cannot be extended to `until`, or null when the request is well-formed. */
export function extensionError(
  booking: Pick<BookingWithDetails, "status" | "check_out" | "service_type">,
  until: string
): string | null {
  if (booking.service_type === "meals_only") return "A dining booking has no stay to extend";
  if (!["APPROVED", "OCCUPIED"].includes(booking.status)) {
    return "Only an approved or current stay can be extended";
  }
  const t = Date.parse(until);
  if (!Number.isFinite(t)) return "Choose the new check-out date and time";
  if (t <= Date.parse(booking.check_out)) return "The new check-out must be later than the current one";
  if (t - Date.parse(booking.check_out) > 60 * 86_400_000) return "Extend by at most 60 days at a time";
  return null;
}

// ------------------------------------------------------------- no-shows

/** Whether the desk recorded the guest arriving. */
export function hasCheckedIn(booking: Pick<BookingWithDetails, "logs">): boolean {
  return booking.logs.some((l) => l.new_status === "OCCUPIED");
}

/**
 * Whether a stay can be released as a no-show now: approved, never checked
 * in, and its check-in time has passed. `afterHours` is the automatic
 * release's wait (the Setting); the manager's own action uses 0.
 */
export function noShowReleasable(
  booking: Pick<BookingWithDetails, "status" | "check_in" | "logs" | "service_type">,
  now: Date,
  afterHours = 0
): boolean {
  if (booking.service_type === "meals_only") return false;
  if (booking.status !== "APPROVED" || hasCheckedIn(booking)) return false;
  return now.getTime() >= Date.parse(booking.check_in) + afterHours * 3_600_000;
}

// ------------------------------------------------------------ bulk rooms

export type RoomRangePlan = {
  /** Room numbers to create, in order. */
  create: string[];
  /** Already in the guest house; left alone. */
  existing: string[];
  problems: string[];
};

export const MAX_ROOMS_PER_RANGE = 200;

/**
 * "B-101 to B-120" (also "B-101 - B-120", "B-101..B-120") → B-101 … B-120, or
 * a comma / line separated list of numbers, or a mix. The prefix and the
 * zero-padding of the first number are kept ("H-001 to H-010"). Numbers the
 * guest house already has are reported, not duplicated.
 */
export function planRoomRange(text: string, existingNumbers: string[]): RoomRangePlan {
  const problems: string[] = [];
  const out: string[] = [];
  const taken = new Set(existingNumbers.map((n) => n.toUpperCase()));
  const parts = text
    .split(/[\n,;]+/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return { create: [], existing: [], problems: ["Type room numbers, e.g. B-101 to B-120"] };
  for (const part of parts) {
    const range = /^(.*?)(\d+)\s*(?:to|–|—|-|\.\.)\s*(.*?)(\d+)$/i.exec(part);
    if (range && (range[3] === "" || range[3].toUpperCase() === range[1].toUpperCase())) {
      const [, prefix, a, , b] = range;
      const start = Number(a);
      const end = Number(b);
      if (end < start) {
        problems.push(`${part}: the range runs backwards`);
        continue;
      }
      if (end - start + 1 > MAX_ROOMS_PER_RANGE) {
        problems.push(`${part}: at most ${MAX_ROOMS_PER_RANGE} rooms at a time`);
        continue;
      }
      for (let n = start; n <= end; n++) out.push(`${prefix}${String(n).padStart(a.length, "0")}`);
      continue;
    }
    if (/^[A-Za-z0-9][A-Za-z0-9 ._/-]{0,19}$/.test(part)) {
      out.push(part);
      continue;
    }
    problems.push(`${part}: not a room number or a range like B-101 to B-120`);
  }
  const seen = new Set<string>();
  const create: string[] = [];
  const existing: string[] = [];
  for (const n of out) {
    const key = n.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);
    (taken.has(key) ? existing : create).push(n);
  }
  if (create.length > MAX_ROOMS_PER_RANGE) problems.push(`At most ${MAX_ROOMS_PER_RANGE} rooms at a time`);
  return { create, existing, problems };
}
