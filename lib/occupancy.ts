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

/**
 * Children under this age are infants: they share a guardian's bed and need no
 * ID. A booking records only *whether* any are coming (`Booking.has_infant`).
 */
export const INFANT_AGE_LIMIT = 10;

/** Capacity used before rooms are picked, when their types are not yet known. */
export const DEFAULT_ROOM_MAX = ROOM_CAPACITY.double_sharing.withExtraBed;
export const DEFAULT_ROOM_STANDARD = ROOM_CAPACITY.double_sharing.standard;

export const ROOM_TYPE_LABELS: Record<RoomType, string> = {
  single: "Single",
  double_sharing: "Double sharing",
};

/**
 * Guests who need a bed. A new booking only ever holds such guests — infants
 * are the `has_infant` switch — but bookings made before migration 7 can carry
 * infant guest rows, which share a guardian's bed and must not be counted.
 */
export function countBedGuests(guests: { is_infant?: boolean }[]): number {
  return guests.filter((g) => !g.is_infant).length;
}

/** Infant guest rows, which only bookings made before migration 7 have. */
export function countInfants(guests: { is_infant?: boolean }[]): number {
  return guests.filter((g) => g.is_infant).length;
}

type PartyBooking = { guests: Pick<BookingGuest, "is_infant">[]; has_infant: boolean };

/** Whether an infant is coming: the booking's switch, or a legacy infant row. */
export function hasInfant(booking: PartyBooking): boolean {
  return booking.has_infant || booking.guests.some((g) => g.is_infant);
}

/**
 * "3 guests" or "3 guests, with infant(s)". An older booking that listed its
 * infants as guest rows reads "2 guests + 1 infant".
 */
export function describeParty(booking: PartyBooking): string {
  const beds = countBedGuests(booking.guests);
  const guestPart = `${beds} guest${beds === 1 ? "" : "s"}`;
  const listed = countInfants(booking.guests);
  if (listed > 0) return `${guestPart} + ${listed} infant${listed === 1 ? "" : "s"}`;
  return booking.has_infant ? `${guestPart}, with infant(s)` : guestPart;
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

/**
 * How many of the guests in `rooms` rooms would be on an extra bed, before the
 * rooms are chosen — so it assumes double sharing rooms. Once the actual rooms
 * are known, use `extraBedsFor`.
 */
export function extraBedsNeeded(guests: number, rooms: number): number {
  return Math.max(0, guests - rooms * DEFAULT_ROOM_STANDARD);
}

/** Extra beds needed to fit `guests` into these particular rooms. */
export function extraBedsFor(guests: number, rooms: Room[]): number {
  return Math.max(0, guests - capacityOf(rooms).standard);
}

const guestCount = (n: number) => `${n} guest${n === 1 ? "" : "s"}`;

/**
 * Checked at submission, before rooms exist: does the requested room count
 * hold the guest list? `guests` must already exclude infants. Returns the
 * error message, or null.
 */
export function requestedRoomsError(guests: number, rooms: number): string | null {
  if (guests <= maxGuestsFor(rooms)) return null;
  const needed = roomsNeededFor(guests);
  return `${rooms} room${rooms === 1 ? "" : "s"} can accommodate at most ${guestCount(maxGuestsFor(rooms))} (${DEFAULT_ROOM_STANDARD} per room, or ${DEFAULT_ROOM_MAX} with an extra bed). ${guestCount(guests)} require at least ${needed} rooms. Infants under ${INFANT_AGE_LIMIT} share a guardian's bed and are not counted.`;
}

/**
 * Checked at allocation, when the actual rooms and their types are known.
 * `guests` must already exclude infants.
 */
export function allocationCapacityError(guests: number, rooms: Room[]): string | null {
  const capacity = capacityOf(rooms);
  if (guests <= capacity.withExtraBed) return null;
  return `The selected room${rooms.length === 1 ? "" : "s"} can accommodate at most ${guestCount(capacity.withExtraBed)}, including extra beds, but this booking has ${guestCount(guests)} requiring a bed. Please select an additional room.`;
}

/**
 * Occupancy of one room type in the manager's words, e.g.
 * "Occupancy: 2 guests (maximum 3 with an extra bed)". It is shown in the
 * Review & Allocate dialog, where "sleeps 2, 3 with an extra bed" was read as
 * too informal — so it is phrased like a specification, not a remark.
 */
export function describeCapacity(roomType: RoomType): string {
  const { standard, withExtraBed } = ROOM_CAPACITY[roomType];
  const base = `Occupancy: ${guestCount(standard)}`;
  if (withExtraBed <= standard) return base;
  return `${base} (maximum ${withExtraBed} with an extra bed)`;
}
