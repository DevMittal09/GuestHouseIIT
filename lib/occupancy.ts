import { DEFAULT_RULES, type CapacityRules } from "./settings";
import type { Room, RoomType } from "./types";

/**
 * Room capacity and the per-room party rule.
 *
 * **Two rules, applied at different moments** — they are not alternatives:
 *
 * - **Per room type** (`capacity.room_types`): a double sharing room sleeps 2,
 *   3 with an extra bed; a single sleeps 1, 2 with an extra bed. Checked at
 *   **allocation**, when the manager picks actual rooms and their types are
 *   known (`allocationCapacityError`, `roomAssignmentError`).
 * - **Per room card** (`capacity.max_guests_per_room` /
 *   `max_infants_per_room`, 3 + 1 by default): checked at **submission**, when
 *   the requester has filled in "Room 1", "Room 2" but no physical room exists
 *   yet (`roomPartyError`), and again by the database trigger on
 *   `booking_guests` (migration 11, reading Settings since migration 16).
 *
 * All the numbers are Settings (`lib/settings.ts`). Every function takes them
 * as a parameter defaulting to `DEFAULT_RULES.capacity` — what the portal did
 * before they were configurable — so the booking form and the server action
 * are handed the same values and cannot disagree.
 */

const DEFAULT_CAPACITY: CapacityRules = DEFAULT_RULES.capacity;

/**
 * How many people a room sleeps, under the default rules.
 *
 * `standard` is the room's own beds; `withExtraBed` is what it takes once an
 * extra bed is rolled in — a double sharing room is 2 + 1, a single is 1 + 1.
 * Infants share with their guardians and occupy neither. The office's own
 * values come from Settings; pass them as `capacity` to the functions below.
 */
export const ROOM_CAPACITY: Record<RoomType, { standard: number; withExtraBed: number }> =
  DEFAULT_CAPACITY.room_types;

/**
 * Children under this age are infants: they share a guardian's bed, need no
 * bed of their own and are not asked for an ID.
 *
 * The threshold was 10 until the office reset it to 5 (Sep 2026). Existing
 * bookings are **not** reclassified — a guest recorded as an infant under the
 * old rule stays one, because their stay was agreed on that basis. Only new
 * bookings are classified by this number; see migration 11, whose trigger
 * applies the same threshold in the database.
 */
export const INFANT_AGE_LIMIT = 5;

/** Default: most bed-occupying guests allowed in one room card, extra bed included. */
export const MAX_GUESTS_PER_ROOM = DEFAULT_CAPACITY.max_guests_per_room;

/** Default: most infants allowed in one room card. They share a guardian's bed. */
export const MAX_INFANTS_PER_ROOM = DEFAULT_CAPACITY.max_infants_per_room;

export const ROOM_TYPE_LABELS: Record<RoomType, string> = {
  single: "Single",
  double_sharing: "Double sharing",
};

const guestCount = (n: number) => `${n} guest${n === 1 ? "" : "s"}`;
const infantCount = (n: number) => `${n} infant${n === 1 ? "" : "s"}`;

/** The rule, in the requester's words. Shown inside every room card. */
export function roomOccupancyNotice(capacity: CapacityRules = DEFAULT_CAPACITY): string {
  const infants = capacity.max_infants_per_room;
  const infantPart =
    infants > 0 ? ` + ${infantCount(infants)} (below ${INFANT_AGE_LIMIT} years)` : "";
  return `Maximum ${guestCount(capacity.max_guests_per_room)}${infantPart} per room.`;
}

/** The notice under the default rules, for places with no settings to hand. */
export const ROOM_OCCUPANCY_NOTICE = roomOccupancyNotice();

/**
 * Beds per room before rooms are picked, when their types are not yet known:
 * the roomier type's own beds. The requester is told how many rooms they need
 * on the assumption that the manager can give them that kind.
 */
function standardBeds(capacity: CapacityRules): number {
  return Math.max(...Object.values(capacity.room_types).map((c) => c.standard));
}

/** Capacity used before rooms are picked, under the default rules. */
export const DEFAULT_ROOM_MAX = ROOM_CAPACITY.double_sharing.withExtraBed;
export const DEFAULT_ROOM_STANDARD = ROOM_CAPACITY.double_sharing.standard;

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
 * trigger refuses the row (migrations 11 and 16). The form is a courtesy; the
 * other two are the rule.
 */
export function roomPartyError(
  guests: number,
  infants: number,
  capacity: CapacityRules = DEFAULT_CAPACITY
): string | null {
  if (guests > capacity.max_guests_per_room) {
    return `A room takes at most ${guestCount(capacity.max_guests_per_room)}, including an extra bed. Move the extra guests to another room.`;
  }
  if (infants > capacity.max_infants_per_room) {
    return capacity.max_infants_per_room === 0
      ? `Infants under ${INFANT_AGE_LIMIT} cannot be booked into a room at present — contact the Guest House Manager.`
      : `A room takes at most ${infantCount(capacity.max_infants_per_room)} under ${INFANT_AGE_LIMIT}. Move the extra infant to another room.`;
  }
  if (guests === 0 && infants > 0) {
    return `An infant cannot be booked into a room on their own — add the guest they are staying with.`;
  }
  if (guests === 0) return "Add at least one guest to this room.";
  return null;
}

/** Why no more bed-occupying guests can be added to this room, or null. */
export function addGuestBlockedReason(
  guests: number,
  capacity: CapacityRules = DEFAULT_CAPACITY
): string | null {
  return guests >= capacity.max_guests_per_room
    ? `This room is full — ${guestCount(capacity.max_guests_per_room)} is the maximum. Add another room for more guests.`
    : null;
}

/** Why no more infants can be added to this room, or null. */
export function addInfantBlockedReason(
  infants: number,
  capacity: CapacityRules = DEFAULT_CAPACITY
): string | null {
  if (capacity.max_infants_per_room === 0) return "Infants cannot be added to a room at present.";
  return infants >= capacity.max_infants_per_room
    ? `This room already has ${infantCount(capacity.max_infants_per_room)}, which is the maximum per room.`
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
export function capacityOf(
  rooms: Room[],
  rules: CapacityRules = DEFAULT_CAPACITY
): { standard: number; withExtraBed: number } {
  return rooms.reduce(
    (total, room) => {
      const capacity = rules.room_types[room.room_type];
      return {
        standard: total.standard + capacity.standard,
        withExtraBed: total.withExtraBed + capacity.withExtraBed,
      };
    },
    { standard: 0, withExtraBed: 0 }
  );
}

/** Fewest rooms that hold `guests` on the rooms' own beds (what to request). */
export function roomsNeededFor(guests: number, capacity: CapacityRules = DEFAULT_CAPACITY): number {
  return Math.max(1, Math.ceil(guests / standardBeds(capacity)));
}

/** Most bed-occupying guests `rooms` room cards hold, extra beds included. */
export function maxGuestsFor(rooms: number, capacity: CapacityRules = DEFAULT_CAPACITY): number {
  return rooms * capacity.max_guests_per_room;
}

/**
 * How many of the guests in `rooms` rooms would be on an extra bed, before the
 * rooms are chosen — so it assumes the roomier type. Once the actual rooms are
 * known, use `extraBedsFor`.
 */
export function extraBedsNeeded(
  guests: number,
  rooms: number,
  capacity: CapacityRules = DEFAULT_CAPACITY
): number {
  return Math.max(0, guests - rooms * standardBeds(capacity));
}

/** Extra beds needed to fit `guests` into these particular rooms. */
export function extraBedsFor(
  guests: number,
  rooms: Room[],
  capacity: CapacityRules = DEFAULT_CAPACITY
): number {
  return Math.max(0, guests - capacityOf(rooms, capacity).standard);
}

/**
 * Checked at submission, before rooms exist: does the requested room count
 * hold the guest list? `guests` must already exclude infants.
 */
export function requestedRoomsError(
  guests: number,
  rooms: number,
  capacity: CapacityRules = DEFAULT_CAPACITY
): string | null {
  const max = maxGuestsFor(rooms, capacity);
  if (guests <= max) return null;
  const needed = Math.ceil(guests / capacity.max_guests_per_room);
  return `${rooms} room${rooms === 1 ? "" : "s"} can accommodate at most ${guestCount(max)} (${capacity.max_guests_per_room} per room, including an extra bed). ${guestCount(guests)} require at least ${needed} rooms. Infants under ${INFANT_AGE_LIMIT} share a guardian's bed and are not counted.`;
}

/**
 * Checked at allocation, when the actual rooms and their types are known.
 * `guests` must already exclude infants.
 */
export function allocationCapacityError(
  guests: number,
  rooms: Room[],
  rules: CapacityRules = DEFAULT_CAPACITY
): string | null {
  const capacity = capacityOf(rooms, rules);
  if (guests <= capacity.withExtraBed) return null;
  return `The selected room${rooms.length === 1 ? "" : "s"} can accommodate at most ${guestCount(capacity.withExtraBed)}, including extra beds, but this booking has ${guestCount(guests)} requiring a bed. Please select an additional room.`;
}

/**
 * Whether one room card's party fits the physical room the manager picked for
 * it. The aggregate check above can pass while a single room card still does
 * not fit — three guests allocated a single room, say — so allocation checks
 * card by card as well.
 */
export function roomAssignmentError(
  guests: number,
  room: Room,
  label: string,
  rules: CapacityRules = DEFAULT_CAPACITY
): string | null {
  const capacity = rules.room_types[room.room_type];
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
export function describeCapacity(
  roomType: RoomType,
  rules: CapacityRules = DEFAULT_CAPACITY
): string {
  const { standard, withExtraBed } = rules.room_types[roomType];
  const base = `Occupancy: ${guestCount(standard)}`;
  if (withExtraBed <= standard) return base;
  return `${base} (maximum ${withExtraBed} with an extra bed)`;
}
