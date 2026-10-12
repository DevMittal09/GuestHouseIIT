import {
  isStageStatus,
  stageApproverIds,
  stageForStatus,
  type ApprovalRules,
} from "./approval-routes";
import { mealPlanError } from "./meals";
import { countBedGuests, countInfants, ROOM_TYPE_LABELS } from "./occupancy";
import type { CapacityRules, MealRules } from "./settings";
import { ROLE_LABELS, STATUS_LABELS, type BookingWithDetails, type Profile, type Role } from "./types";
import { approversOf, type Unit } from "./units";
import { ACTIVE_STATUSES, requestFactsFor, ROOM_HOLDING_STATUSES } from "./workflow";

/**
 * What a proposed Settings change would break, before it is saved.
 *
 * A setting applies to bookings still to be decided or still to happen. If a
 * change would make one of those invalid - a room that no longer holds the
 * party already allocated to it, a meal the kitchen will no longer serve - the
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
        `${p.full_name} (${p.email}) is an Official / Dignitary account - change its role in Users & Roles first, or it can no longer book`
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

// -------------------------------------------------- the approval routes

/**
 * What a proposed set of approval routes would break.
 *
 * Two different kinds of harm, both of them silent if nobody looks:
 *
 * 1. **A request already waiting at a stage the new routes drop.** Its
 *    status stays `PENDING_HOD` whatever the console says, and the queue it
 *    is in stops listing it, so it waits until the nightly sweep marks it
 *    Missed. `canReview` falls back to the stage's built-in meaning for
 *    exactly this case, which keeps it actionable - but a request whose
 *    approver has changed under it is still something the office should be
 *    told about rather than discover.
 * 2. **A stage nobody can ever decide** - a unit with no head, an account
 *    that has been deleted, a role nobody holds. New requests skip such a
 *    stage (`skippedStages`), so the route silently does less than it says.
 *
 * Named, refused, nothing saved - the same contract as every other Setting.
 */
export function approvalRouteBlockers(
  proposed: ApprovalRules,
  bookings: BookingWithDetails[],
  units: Unit[],
  profiles: Profile[],
  now: Date = new Date()
): string[] {
  const blockers: string[] = [];
  const directory = { units, profiles };

  // 1. Requests waiting at a stage their new route no longer has.
  for (const booking of bookings) {
    if (!ACTIVE_STATUSES.includes(booking.status)) continue;
    if (!isStageStatus(booking.status)) continue;
    if (booking.check_out <= now.toISOString()) continue;
    const facts = requestFactsFor(booking, booking.requester);
    const stage = stageForStatus(booking.status, facts, proposed);
    if (!stage) {
      blockers.push(
        `${booking.booking_reference_id} is waiting at ${STATUS_LABELS[booking.status]}, which its new route does not have`
      );
      continue;
    }
    if (stageApproverIds(stage.approver, booking.requester, directory).length === 0) {
      blockers.push(
        `${booking.booking_reference_id} is waiting at ${STATUS_LABELS[booking.status]}, and nobody would be set to decide it`
      );
    }
  }

  // 2. Stages pointing at somebody who is not there. Only the rules that
  //    name a target outright can be judged without a requester in hand; a
  //    requester-relative stage is judged per request above.
  for (const rule of proposed.rules) {
    if (!rule.active) continue;
    for (const stage of rule.stages) {
      const { approver } = stage;
      if (approver.kind === "unit") {
        const unit = units.find((u) => u.id === approver.unit_id);
        if (!unit) {
          blockers.push(`${rule.name}: the unit it names no longer exists`);
        } else if (approversOf(unit.id, units).length === 0) {
          blockers.push(`${rule.name}: nobody heads ${unit.name}, so that stage could never be decided`);
        }
      }
      if (approver.kind === "profile" && !profiles.some((p) => p.id === approver.profile_id)) {
        blockers.push(`${rule.name}: the account it names no longer exists`);
      }
      if (approver.kind === "role" && !profiles.some((p) => p.role === approver.role)) {
        blockers.push(
          `${rule.name}: no account holds ${ROLE_LABELS[approver.role as Role] ?? approver.role}, so that stage could never be decided`
        );
      }
    }
  }
  return blockers;
}
