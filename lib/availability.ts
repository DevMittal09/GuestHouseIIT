import { instituteDayBounds, toInstituteDateValue } from "./tz";
import type { Room, RoomOccupancySegment } from "./types";

export const HOURS_IN_DAY = 24;
const HOUR_MS = 3_600_000;

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
