import type { Room, RoomType } from "./types";

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
 * Children under this age are infants: they share a guardian's bed, need no
 * bed of their own and are not asked for an ID.
 *
 * The threshold was 10 until the office reset it to 5 (Sep 2026). Existing
 * bookings are **not** reclassified — a guest recorded as an infant under the
 * old rule stays one, because their stay was agreed on that basis. Only new
 * bookings are classified by this number; see migration 11.
 */
export const INFANT_AGE_LIMIT = 5;

/** Most bed-occupying guests allowed in one room, extra bed included. */
export const MAX_GUESTS_PER_ROOM = 3;

/** Most infants allowed in one room. They share a guardian's bed. */
export const MAX_INFANTS_PER_ROOM = 1;

/** The rule, in the requester's words. Shown inside every room card. */
export const ROOM_OCCUPANCY_NOTICE = `Maximum ${MAX_GUESTS_PER_ROOM} guests + ${MAX_INFANTS_PER_ROOM} infant (below ${INFANT_AGE_LIMIT} years) per room.`;

/** Capacity used before rooms are picked, when their types are not yet known. */
export const DEFAULT_ROOM_MAX = ROOM_CAPACITY.double_sharing.withExtraBed;
export const DEFAULT_ROOM_STANDARD = ROOM_CAPACITY.double_sharing.standard;

export const ROOM_TYPE_LABELS: Record<RoomType, string> = {
  single: "Single",
  double_sharing: "Double sharing",
};

/**
 * Whether an age makes this person an infant.
 *
 * The requester is never asked to pick a category — they type an age and the
 * classification follows, so "is this child an infant?" cannot be answered one
 * way in the form and another way at the desk. An age that has not been
 * entered yet is not an infant: it is simply not known.
 */
export function isInfantAge(age: number | null | undefined): boolean {
  return typeof age === "number" && Number.isFinite(age) && age < INFANT_AGE_LIMIT;
}

/**
 * Guests who need a bed of their own.
 *
 * Reads the stored `is_infant` flag rather than re-deriving it from the age,
 * because the threshold has changed once already: re-deriving would silently
 * turn a 7-year-old booked as an infant under the old rule into a guest
 * needing a bed, and the room they were allocated would no longer fit.
 */
export function countBedGuests(guests: { is_infant?: boolean }[]): number {
  return guests.filter((g) => !g.is_infant).length;
}

export function countInfants(guests: { is_infant?: boolean }[]): number {
  return guests.filter((g) => g.is_infant).length;
}

type PartyBooking = { guests: { is_infant?: boolean }[]; has_infant?: boolean };

/** Whether any infant is on the booking. */
export function hasInfant(booking: PartyBooking): boolean {
  return booking.guests.some((g) => g.is_infant) || booking.has_infant === true;
}

const guestCount = (n: number) => `${n} guest${n === 1 ? "" : "s"}`;
const infantCount = (n: number) => `${n} infant${n === 1 ? "" : "s"}`;

/** "3 guests", or "3 guests + 1 infant". */
export function describeParty(booking: PartyBooking): string {
  const beds = countBedGuests(booking.guests);
  const infants = countInfants(booking.guests);
  const guestPart = guestCount(beds);
  if (infants > 0) return `${guestPart} + ${infantCount(infants)}`;
  // A booking made between migrations 7 and 11 recorded only *whether* an
  // infant was coming, with no row to count.
  return booking.has_infant ? `${guestPart}, with infant(s)` : guestPart;
}

// ------------------------------------------------------- per-room occupancy

/**
 * Why one room card's party breaks the occupancy rule, or null when it fits.
 *
 * Enforced in three places that must agree: the room card disables its own
 * Add buttons, the booking schema refuses the submission, and a database
 * trigger refuses the row (migration 11). The form is a courtesy; the other
 * two are the rule.
 */
export function roomPartyError(guests: number, infants: number): string | null {
  if (guests > MAX_GUESTS_PER_ROOM) {
    return `A room takes at most ${guestCount(MAX_GUESTS_PER_ROOM)} (${DEFAULT_ROOM_STANDARD} beds plus one extra bed). Move the extra guests to another room.`;
  }
  if (infants > MAX_INFANTS_PER_ROOM) {
    return `A room takes at most ${infantCount(MAX_INFANTS_PER_ROOM)} under ${INFANT_AGE_LIMIT}. Move the extra infant to another room.`;
  }
  if (guests === 0 && infants > 0) {
    return `An infant cannot be booked into a room on their own — add the guest they are staying with.`;
  }
  if (guests === 0) return "Add at least one guest to this room.";
  return null;
}

/** Why no more bed-occupying guests can be added to this room, or null. */
export function addGuestBlockedReason(guests: number): string | null {
  return guests >= MAX_GUESTS_PER_ROOM
    ? `This room is full — ${guestCount(MAX_GUESTS_PER_ROOM)} is the maximum. Add another room for more guests.`
    : null;
}

/** Why no more infants can be added to this room, or null. */
export function addInfantBlockedReason(infants: number): string | null {
  return infants >= MAX_INFANTS_PER_ROOM
    ? `This room already has ${infantCount(MAX_INFANTS_PER_ROOM)}, which is the maximum per room.`
    : null;
}

/** Totals rolled up across the room cards, for the booking summary. */
export function partyTotals(rooms: { guests: { is_infant?: boolean }[] }[]): {
  rooms: number;
  guests: number;
  infants: number;
} {
  return {
    rooms: rooms.length,
    guests: rooms.reduce((n, r) => n + countBedGuests(r.guests), 0),
    infants: rooms.reduce((n, r) => n + countInfants(r.guests), 0),
  };
}

/** "2 rooms · 4 guests + 1 infant". */
export function describeTotals(totals: { rooms: number; guests: number; infants: number }): string {
  const parts = [`${totals.rooms} room${totals.rooms === 1 ? "" : "s"}`, guestCount(totals.guests)];
  if (totals.infants > 0) parts.push(infantCount(totals.infants));
  return parts.join(" · ");
}

// ------------------------------------------------------------- allocation

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
  return rooms * MAX_GUESTS_PER_ROOM;
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

/**
 * Checked at submission, before rooms exist: does the requested room count
 * hold the guest list? `guests` must already exclude infants.
 */
export function requestedRoomsError(guests: number, rooms: number): string | null {
  if (guests <= maxGuestsFor(rooms)) return null;
  const needed = Math.ceil(guests / MAX_GUESTS_PER_ROOM);
  return `${rooms} room${rooms === 1 ? "" : "s"} can accommodate at most ${guestCount(maxGuestsFor(rooms))} (${MAX_GUESTS_PER_ROOM} per room, including an extra bed). ${guestCount(guests)} require at least ${needed} rooms. Infants under ${INFANT_AGE_LIMIT} share a guardian's bed and are not counted.`;
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
 * Whether one room card's party fits the physical room the manager picked for
 * it. The aggregate check above can pass while a single room card still does
 * not fit — three guests allocated a single room, say — so allocation checks
 * card by card as well.
 */
export function roomAssignmentError(guests: number, room: Room, label: string): string | null {
  const capacity = ROOM_CAPACITY[room.room_type];
  if (guests <= capacity.withExtraBed) return null;
  return `${label} has ${guestCount(guests)}, but ${room.room_number} (${ROOM_TYPE_LABELS[
    room.room_type
  ].toLowerCase()}) sleeps at most ${capacity.withExtraBed}. Pick a different room for it.`;
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
