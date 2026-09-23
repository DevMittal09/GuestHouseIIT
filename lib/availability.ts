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
const MINUTE_MS = 60_000;

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

// ---------------------------------------------------------------- day, week & month views

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

/**
 * One booking's hold, clipped to the range, as fractions of it: 0 is the
 * range's first midnight and 1 its last. Drawn as one unbroken bar, so a
 * three-night stay reads as one booking rather than three.
 */
export interface OccupancyBar {
  segment: RoomOccupancySegment;
  from: number;
  to: number;
  /**
   * Which of two shades to draw it in. A room's bookings alternate in
   * check-in order, so a stay that starts the moment the previous one ends
   * still reads as two bookings rather than one long one.
   */
  tone: 0 | 1;
}

/**
 * A stretch when two of a room's bookings hold it at the same time — a
 * turnover the Guest House Manager accepted (`lib/turnover.ts`), or a row
 * forced from the console. Fractions of the range, like the bars.
 */
export interface OccupancyOverlap {
  from: number;
  to: number;
  /** The two bookings, earlier check-in first. */
  segments: [RoomOccupancySegment, RoomOccupancySegment];
}

/** One room's bookings over a day, a week or a month. */
export interface RoomRangeOccupancy {
  bars: OccupancyBar[];
  overlaps: OccupancyOverlap[];
  /**
   * Minutes booked on each day of the range, in `range.days` order. Time two
   * bookings share is counted once: the room is booked, not booked twice.
   */
  bookedMinutes: number[];
  /** The bookings themselves, in check-in order. */
  segments: RoomOccupancySegment[];
}

/**
 * Lay occupancy out per room across a range of days, for all three views and
 * for every view's per-room badges. Uses the same strict overlap as
 * allocation: a stay checking out at 11:00 books nothing after 11:00 on the
 * day it leaves, and one checking in at 11:00 touches it without overlapping.
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

  // Each room's holds as clipped instants, before they become fractions.
  const held = new Map<string, { segment: RoomOccupancySegment; from: number; to: number }[]>();
  for (const room of rooms) held.set(room.id, []);

  for (const segment of segments) {
    const list = held.get(segment.room_id);
    if (!list) continue;
    const from = Math.max(new Date(segment.check_in).getTime(), rangeStart);
    const to = Math.min(new Date(segment.check_out).getTime(), rangeEnd);
    // Written as a negation so an unparseable time (NaN) is skipped as well.
    if (!(to > from)) continue;
    list.push({ segment, from, to });
  }

  const fraction = (at: number) => (at - rangeStart) / span;
  const byRoom = new Map<string, RoomRangeOccupancy>();
  for (const [roomId, list] of held) {
    list.sort((a, b) => a.from - b.from || a.to - b.to);

    const overlaps: OccupancyOverlap[] = [];
    list.forEach((a, i) => {
      for (const b of list.slice(i + 1)) {
        const from = Math.max(a.from, b.from);
        const to = Math.min(a.to, b.to);
        if (to > from) {
          overlaps.push({ from: fraction(from), to: fraction(to), segments: [a.segment, b.segment] });
        }
      }
    });

    // Booked time per day, from the union of the holds so shared time is
    // counted once.
    const merged: { from: number; to: number }[] = [];
    for (const { from, to } of list) {
      const last = merged[merged.length - 1];
      if (last && from <= last.to) last.to = Math.max(last.to, to);
      else merged.push({ from, to });
    }
    const bookedMinutes = dayEdges.map((edge) =>
      merged.reduce((sum, m) => {
        const overlap = Math.min(m.to, edge.end) - Math.max(m.from, edge.start);
        return overlap > 0 ? sum + overlap / MINUTE_MS : sum;
      }, 0)
    );

    byRoom.set(roomId, {
      bars: list.map(({ segment, from, to }, i) => ({
        segment,
        from: fraction(from),
        to: fraction(to),
        tone: (i % 2) as 0 | 1,
      })),
      overlaps,
      bookedMinutes,
      segments: list.map(({ segment }) => segment),
    });
  }
  return byRoom;
}

/** How long two stays hold a room together, e.g. "1 hour 30 minutes". */
export function describeOverlap(a: RoomOccupancySegment, b: RoomOccupancySegment): string {
  const shared =
    Math.min(Date.parse(a.check_out), Date.parse(b.check_out)) -
    Math.max(Date.parse(a.check_in), Date.parse(b.check_in));
  const minutes = Math.max(0, Math.round(shared / MINUTE_MS));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  const parts = [
    hours > 0 ? `${hours} hour${hours === 1 ? "" : "s"}` : null,
    rest > 0 || hours === 0 ? `${rest} minute${rest === 1 ? "" : "s"}` : null,
  ].filter(Boolean);
  return parts.join(" ");
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
