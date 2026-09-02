import type { BookingGuest, Room, RoomType } from "./types";

/**
 * How many people a room sleeps.
 *
 * `standard` is the room's own beds; `withExtraBed` is what it takes once an
 * extra bed is rolled in — a double sharing room is 2 + 1, a single is 1 + 1.
 * Infants share with their guardians and occupy neither.
 */
export const ROOM_CAPACITY: Record<RoomType, { standard: number; withExtraBed: number }> = {
  single: { standard: 1, withExtraBed: 2 },
  double_sharing: { standard: 2, withExtraBed: 3 },
};

/** A guest marked as an infant must be under this age. */
export const INFANT_AGE_LIMIT = 10;

/** Capacity used before rooms are picked, when their types are not yet known. */
export const DEFAULT_ROOM_MAX = ROOM_CAPACITY.double_sharing.withExtraBed;
export const DEFAULT_ROOM_STANDARD = ROOM_CAPACITY.double_sharing.standard;

export const ROOM_TYPE_LABELS: Record<RoomType, string> = {
  single: "Single",
  double_sharing: "Double sharing",
};

/** Anything with a bed. Infants share with their guardians, so they are not counted. */
export function countBedGuests(guests: { is_infant?: boolean }[]): number {
  return guests.filter((g) => !g.is_infant).length;
}

export function countInfants(guests: { is_infant?: boolean }[]): number {
  return guests.filter((g) => g.is_infant).length;
}

/** "2 adults + 1 infant" style summary of a guest list. */
export function describeParty(guests: Pick<BookingGuest, "is_infant">[]): string {
  const beds = countBedGuests(guests);
  const infants = countInfants(guests);
  const guestPart = `${beds} guest${beds === 1 ? "" : "s"}`;
  if (infants === 0) return guestPart;
  return `${guestPart} + ${infants} infant${infants === 1 ? "" : "s"}`;
}

/** Total a set of rooms sleeps, on their own beds and with extra beds added. */
export function capacityOf(rooms: Room[]): { standard: number; withExtraBed: number } {
  return rooms.reduce(
    (total, room) => {
      const capacity = ROOM_CAPACITY[room.room_type];
      return {
        standard: total.standard + capacity.standard,
        withExtraBed: total.withExtraBed + capacity.withExtraBed,
      };
    },
    { standard: 0, withExtraBed: 0 }
  );
}

/** Fewest rooms that hold `guests` on the rooms' own beds (what to request). */
export function roomsNeededFor(guests: number): number {
  return Math.max(1, Math.ceil(guests / DEFAULT_ROOM_STANDARD));
}

/** Most bed-occupying guests `rooms` rooms hold, extra beds included. */
export function maxGuestsFor(rooms: number): number {
  return rooms * DEFAULT_ROOM_MAX;
}

/** How many of the guests in `rooms` rooms would be on an extra bed. */
export function extraBedsNeeded(guests: number, rooms: number): number {
  return Math.max(0, guests - rooms * DEFAULT_ROOM_STANDARD);
}

/**
 * Checked at submission, before rooms exist: does the requested room count
 * hold the guest list? `guests` must already exclude infants. Returns the
 * error message, or null.
 */
export function requestedRoomsError(guests: number, rooms: number): string | null {
  if (guests <= maxGuestsFor(rooms)) return null;
  const needed = roomsNeededFor(guests);
  return `${rooms} room${rooms === 1 ? "" : "s"} can sleep ${maxGuestsFor(rooms)} at most (${DEFAULT_ROOM_STANDARD} per room, ${DEFAULT_ROOM_MAX} with an extra bed). ${guests} guests need at least ${needed} rooms. Infants under ${INFANT_AGE_LIMIT} share with their guardians and do not need a bed.`;
}

/**
 * Checked at allocation, when the actual rooms and their types are known.
 * `guests` must already exclude infants.
 */
export function allocationCapacityError(guests: number, rooms: Room[]): string | null {
  const capacity = capacityOf(rooms);
  if (guests <= capacity.withExtraBed) return null;
  return `${rooms.length} room${rooms.length === 1 ? "" : "s"} sleep ${capacity.withExtraBed} even with extra beds, but this booking needs beds for ${guests} — allocate another room.`;
}

/** Human-readable occupancy for one room, e.g. "sleeps 2, 3 with an extra bed". */
export function describeCapacity(roomType: RoomType): string {
  const { standard, withExtraBed } = ROOM_CAPACITY[roomType];
  if (withExtraBed <= standard) return `sleeps ${standard}`;
  return `sleeps ${standard}, ${withExtraBed} with an extra bed`;
}
