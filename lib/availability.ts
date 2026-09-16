import {
  addDaysToDateValue,
  dateValueOf,
  formatDateValue,
  formatMonthOfDateValue,
  instituteDayBounds,
  parseDateValue,
  toInstituteDateValue,
  weekdayOfDateValue,
} from "./tz";
import { STATUS_LABELS, type Room, type RoomOccupancySegment } from "./types";

export const HOURS_IN_DAY = 24;
const HOUR_MS = 3_600_000;
const MINUTE_MS = 60_000;

/** One room's day: the booking holding each hour (null = free), plus its bookings. */
export interface RoomDayOccupancy {
  /** 24 entries, midnight-first, in institute time (`lib/tz.ts`). */
  hours: (RoomOccupancySegment | null)[];
  segments: RoomOccupancySegment[];
}

/**
 * Institute midnight of `date` ("yyyy-MM-dd") and of the day after. Zoned
 * rather than runtime-local so the grid draws the same day for a manager in
 * Palakkad and a server in UTC.
 */
export function dayBounds(date: string): { start: Date; end: Date } {
  return instituteDayBounds(date);
}

/** "yyyy-MM-dd" for a Date, in institute time. */
export function toDateInputValue(d: Date): string {
  return toInstituteDateValue(d);
}

/**
 * How to describe one booking's hold in the room list, given where it sits in
 * time.
 *
 * A hold is a *reservation*; "Occupied" is a separate fact the desk records
 * when the guest walks in. So a stay that has not started is only ever
 * "Booked", never "Occupied", no matter what its row says — the office
 * reported future bookings reading as occupied, and this is the read side of
 * that fix (`displayStatus` in `lib/workflow.ts` is the other).
 */
export function describeSegmentStatus(
  segment: Pick<RoomOccupancySegment, "status" | "check_in" | "check_out">,
  now: Date = new Date()
): string {
  const at = now.toISOString();
  if (segment.check_in > at) return "Booked · upcoming";
  if (segment.check_out <= at) return "Booked · past check-out";
  return STATUS_LABELS[segment.status];
}

/** "1 PM" style label for the hour axis. */
export function hourLabel(hour: number): string {
  const suffix = hour < 12 ? "AM" : "PM";
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12} ${suffix}`;
}

/**
 * Lay the day's occupancy out per room and per hour, for the availability
 * grid. An hour counts as held when a booking covers any part of it, using
 * the same strict overlap as room allocation — so a stay checking out at
 * 11:00 releases the 11 AM hour rather than holding it.
 */
export function bucketOccupancyByHour(
  rooms: Room[],
  segments: RoomOccupancySegment[],
  dayStart: Date
): Map<string, RoomDayOccupancy> {
  const byRoom = new Map<string, RoomDayOccupancy>();
  for (const room of rooms) {
    byRoom.set(room.id, { hours: Array(HOURS_IN_DAY).fill(null), segments: [] });
  }

  for (const segment of segments) {
    const entry = byRoom.get(segment.room_id);
    if (!entry) continue;
    entry.segments.push(segment);
    const segStart = new Date(segment.check_in).getTime();
    const segEnd = new Date(segment.check_out).getTime();
    for (let hour = 0; hour < HOURS_IN_DAY; hour++) {
      const hourStart = dayStart.getTime() + hour * HOUR_MS;
      if (segStart < hourStart + HOUR_MS && segEnd > hourStart) {
        entry.hours[hour] = segment;
      }
    }
  }

  return byRoom;
}

// ---------------------------------------------------------------- week & month views

/** How much of the calendar `/availability` shows at once. */
export type AvailabilityView = "day" | "week" | "month";

export const AVAILABILITY_VIEWS: { value: AvailabilityView; label: string }[] = [
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
];

/**
 * The widest window `getRoomAvailability` will serve. The longest view is a
 * 31-day month; the cap only stops a crafted request from pulling years of
 * occupancy through an action that every signed-in role can call.
 */
export const MAX_AVAILABILITY_DAYS = 62;

/** The days a view covers, and the instants they span. */
export interface AvailabilityRange {
  view: AvailabilityView;
  /** Institute calendar dates ("yyyy-MM-dd"), first to last. */
  days: string[];
  /** Institute midnight at the start of the first day. */
  start: Date;
  /** Institute midnight after the last day. The range is [start, end). */
  end: Date;
}

function daysInMonth(year: number, month: number): number {
  // Day 0 of the following month is the last day of this one. Date.UTC rolls
  // month 0 and month 13 over into the neighbouring years.
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * The day, week or month containing `anchor`. Weeks run Monday to Sunday, as
 * in the archive's date presets; months are whole calendar months. Returns
 * null when `anchor` is not a real date, e.g. a cleared date input.
 */
export function availabilityRange(
  view: AvailabilityView,
  anchor: string
): AvailabilityRange | null {
  const parts = parseDateValue(anchor);
  if (!parts) return null;

  let first = dateValueOf(parts.year, parts.month, parts.day);
  let count = 1;
  if (view === "week") {
    const sinceMonday = (weekdayOfDateValue(first) + 6) % 7;
    first = addDaysToDateValue(first, -sinceMonday);
    count = 7;
  } else if (view === "month") {
    first = dateValueOf(parts.year, parts.month, 1);
    count = daysInMonth(parts.year, parts.month);
  }

  const days = Array.from({ length: count }, (_, i) => addDaysToDateValue(first, i));
  return {
    view,
    days,
    start: instituteDayBounds(days[0]).start,
    end: instituteDayBounds(days[days.length - 1]).end,
  };
}

/**
 * `anchor` moved one day, week or month back (-1) or forward (+1). A month
 * step keeps the day of the month where it can and clamps where it cannot, so
 * 31 January steps to 28 February rather than rolling on into March.
 */
export function shiftAnchor(view: AvailabilityView, anchor: string, step: -1 | 1): string {
  const parts = parseDateValue(anchor);
  if (!parts) return anchor;
  if (view === "day") return addDaysToDateValue(anchor, step);
  if (view === "week") return addDaysToDateValue(anchor, 7 * step);
  const month = parts.month + step;
  return dateValueOf(parts.year, month, Math.min(parts.day, daysInMonth(parts.year, month)));
}

/** "Tue 15 Sep 2026", "14 Sep – 20 Sep 2026" or "September 2026". */
export function describeRange(range: AvailabilityRange): string {
  const first = range.days[0];
  const last = range.days[range.days.length - 1];
  if (range.view === "month") return formatMonthOfDateValue(first);
  if (range.view === "day") return formatDateValue(first, { year: true });
  const sameYear = first.slice(0, 4) === last.slice(0, 4);
  return `${formatDateValue(first, { weekday: false, year: !sameYear })} – ${formatDateValue(
    last,
    { weekday: false, year: true }
  )}`;
}

/** One room's bookings over a week or a month. */
export interface RoomRangeOccupancy {
  /**
   * Each booking's hold clipped to the range, as fractions of it: 0 is the
   * range's first midnight and 1 its last. Drawn as one unbroken bar, so a
   * three-night stay reads as one booking rather than three.
   */
  bars: { segment: RoomOccupancySegment; from: number; to: number }[];
  /** Minutes booked on each day of the range, in `range.days` order. */
  bookedMinutes: number[];
  /** The bookings themselves, in check-in order. */
  segments: RoomOccupancySegment[];
}

/**
 * Lay occupancy out per room across a range of days, for the week and month
 * views and for every view's per-room badges. Uses the same strict overlap as
 * allocation: a stay checking out at 11:00 books nothing after 11:00 on the
 * day it leaves.
 */
export function bucketOccupancyByDay(
  rooms: Room[],
  segments: RoomOccupancySegment[],
  range: AvailabilityRange
): Map<string, RoomRangeOccupancy> {
  const rangeStart = range.start.getTime();
  const rangeEnd = range.end.getTime();
  const span = rangeEnd - rangeStart;
  const dayEdges = range.days.map((day) => {
    const { start, end } = instituteDayBounds(day);
    return { start: start.getTime(), end: end.getTime() };
  });

  const byRoom = new Map<string, RoomRangeOccupancy>();
  for (const room of rooms) {
    byRoom.set(room.id, { bars: [], bookedMinutes: range.days.map(() => 0), segments: [] });
  }

  for (const segment of segments) {
    const entry = byRoom.get(segment.room_id);
    if (!entry) continue;
    const from = Math.max(new Date(segment.check_in).getTime(), rangeStart);
    const to = Math.min(new Date(segment.check_out).getTime(), rangeEnd);
    // Written as a negation so an unparseable time (NaN) is skipped as well.
    if (!(to > from)) continue;
    entry.segments.push(segment);
    entry.bars.push({ segment, from: (from - rangeStart) / span, to: (to - rangeStart) / span });
    dayEdges.forEach((edge, i) => {
      const overlap = Math.min(to, edge.end) - Math.max(from, edge.start);
      if (overlap > 0) entry.bookedMinutes[i] += overlap / MINUTE_MS;
    });
  }

  for (const entry of byRoom.values()) {
    entry.segments.sort(
      (a, b) => new Date(a.check_in).getTime() - new Date(b.check_in).getTime()
    );
  }
  return byRoom;
}

/** How many rooms are not booked at any moment of each day of the range. */
export function freeRoomsByDay(
  rooms: Room[],
  occupancy: Map<string, RoomRangeOccupancy>,
  range: AvailabilityRange
): number[] {
  return range.days.map(
    (_, i) => rooms.filter((room) => (occupancy.get(room.id)?.bookedMinutes[i] ?? 0) === 0).length
  );
}

/** Whether a room is free, partly booked or booked for the whole of a range. */
export type RoomRangeStatus = "vacant" | "partial" | "booked";

export function roomRangeStatus(
  entry: RoomRangeOccupancy | undefined,
  range: AvailabilityRange
): RoomRangeStatus {
  if (!entry || entry.segments.length === 0) return "vacant";
  const booked = entry.bookedMinutes.reduce((sum, minutes) => sum + minutes, 0);
  const total = (range.end.getTime() - range.start.getTime()) / MINUTE_MS;
  // Half a minute of slack for floating-point sums; bookings are on the minute.
  return booked >= total - 0.5 ? "booked" : "partial";
}

/** Where `now` falls in the range as a fraction (0–1), or null when outside it. */
export function rangeProgress(range: AvailabilityRange, now: Date = new Date()): number | null {
  const at = now.getTime();
  const start = range.start.getTime();
  const end = range.end.getTime();
  if (at < start || at >= end) return null;
  return (at - start) / (end - start);
}

/** How many rooms a booking holds at `now`. */
export function roomsBookedAt(
  occupancy: Map<string, { segments: RoomOccupancySegment[] }>,
  now: Date = new Date()
): number {
  const at = now.getTime();
  let count = 0;
  for (const { segments } of occupancy.values()) {
    const held = segments.some(
      (s) => new Date(s.check_in).getTime() <= at && new Date(s.check_out).getTime() > at
    );
    if (held) count++;
  }
  return count;
}
