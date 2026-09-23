import { mealPlanError } from "./meals";
import { countBedGuests, countInfants, ROOM_TYPE_LABELS } from "./occupancy";
import type { CapacityRules, MealRules } from "./settings";
import type { BookingWithDetails, Profile } from "./types";
import { ACTIVE_STATUSES, ROOM_HOLDING_STATUSES } from "./workflow";

/**
 * What a proposed Settings change would break, before it is saved.
 *
 * A setting applies to bookings still to be decided or still to happen. If a
 * change would make one of those invalid — a room that no longer holds the
 * party already allocated to it, a meal the kitchen will no longer serve — the
 * change is refused and the bookings are named, so the office can fix them
 * first (or decide the setting was wrong). Nothing is ever changed silently to
 * fit.
 *
 * Past stays are never re-judged: they happened under the rules of the day.
 */

/** A booking that still matters: waiting for a decision, or holding rooms for a stay not over. */
export function isLiveBooking(booking: BookingWithDetails, now: Date = new Date()): boolean {
  const live =
    ACTIVE_STATUSES.includes(booking.status) || ROOM_HOLDING_STATUSES.includes(booking.status);
  return live && booking.check_out > now.toISOString();
}

/**
 * Bookings a capacity change would break:
 * - a room card with more guests or infants than the new per-room limit;
 * - an allocated room whose type would no longer hold its card's party.
 *
 * Room cards migration 11 synthesised for old bookings (`is_legacy`) were never
 * held to the per-room rule and are skipped here too.
 */
export function capacityChangeBlockers(
  proposed: CapacityRules,
  bookings: BookingWithDetails[],
  now: Date = new Date()
): string[] {
  const blockers: string[] = [];
  for (const b of bookings) {
    if (!isLiveBooking(b, now)) continue;
    for (const card of b.rooms) {
      if ((card as { is_legacy?: boolean }).is_legacy) continue;
      const guests = countBedGuests(card.guests);
      const infants = countInfants(card.guests);
      if (guests > proposed.max_guests_per_room) {
        blockers.push(
          `${b.booking_reference_id}: Room ${card.room_index} has ${guests} guests (new limit ${proposed.max_guests_per_room})`
        );
      } else if (infants > proposed.max_infants_per_room) {
        blockers.push(
          `${b.booking_reference_id}: Room ${card.room_index} has ${infants} infant(s) (new limit ${proposed.max_infants_per_room})`
        );
      } else if (guests + infants > proposed.max_occupants_per_room) {
        blockers.push(
          `${b.booking_reference_id}: Room ${card.room_index} holds ${guests + infants} people including infants (new limit ${proposed.max_occupants_per_room})`
        );
      }
      const room = card.assigned_room;
      if (room && ROOM_HOLDING_STATUSES.includes(b.status)) {
        const max = proposed.room_types[room.room_type].withExtraBed;
        if (guests > max) {
          blockers.push(
            `${b.booking_reference_id}: ${room.room_number} (${ROOM_TYPE_LABELS[room.room_type].toLowerCase()}) holds ${guests} guests, more than the new maximum of ${max}`
          );
        }
      }
    }
  }
  return blockers;
}

/** Bookings whose chosen meals the new serving times would put outside the stay. */
export function mealWindowBlockers(
  proposed: MealRules,
  bookings: BookingWithDetails[],
  now: Date = new Date()
): string[] {
  const blockers: string[] = [];
  for (const b of bookings) {
    if (!isLiveBooking(b, now) || b.meals.length === 0) continue;
    const problem = mealPlanError(
      b.meals,
      new Date(b.check_in),
      new Date(b.check_out),
      proposed.windows
    );
    if (problem) blockers.push(`${b.booking_reference_id}: ${problem}`);
  }
  return blockers;
}

/**
 * Official accounts that removing an address from the whitelist would lock out
 * of the only thing their role does.
 */
export function whitelistRemovalBlockers(email: string, profiles: Profile[]): string[] {
  const wanted = email.trim().toLowerCase();
  return profiles
    .filter((p) => p.role === "official" && p.email.toLowerCase() === wanted)
    .map(
      (p) =>
        `${p.full_name} (${p.email}) is an Official / Dignitary account — change its role in Users & Roles first, or it can no longer book`
    );
}

/** One readable refusal naming the first few blockers. */
export function refusalMessage(what: string, blockers: string[], show = 5): string {
  const listed = blockers.slice(0, show).join("; ");
  const more = blockers.length > show ? `; and ${blockers.length - show} more` : "";
  return `${what} would break ${blockers.length} existing booking${
    blockers.length === 1 ? "" : "s"
  } or account${blockers.length === 1 ? "" : "s"}: ${listed}${more}. Fix ${
    blockers.length === 1 ? "it" : "them"
  } first.`;
}
