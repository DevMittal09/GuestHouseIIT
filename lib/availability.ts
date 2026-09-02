import type { Room, RoomOccupancySegment } from "./types";

export const HOURS_IN_DAY = 24;
const HOUR_MS = 3_600_000;

/** One room's day: the booking holding each hour (null = free), plus its bookings. */
export interface RoomDayOccupancy {
  /** 24 entries, midnight-first, in the viewer's local time. */
  hours: (RoomOccupancySegment | null)[];
  segments: RoomOccupancySegment[];
}

/** Local midnight of `date` ("yyyy-MM-dd") and of the day after. */
export function dayBounds(date: string): { start: Date; end: Date } {
  const start = new Date(`${date}T00:00:00`);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

/** "yyyy-MM-dd" for a Date, in local time. */
export function toDateInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
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
