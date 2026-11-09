"use server";

import { requireUser } from "@/lib/auth";
import {
  availabilityCounts,
  MAX_AVAILABILITY_DAYS,
  rangeBetween,
  type AvailabilityCounts,
} from "@/lib/availability";
import {
  allocatableRooms,
  canUseVipRooms,
  generalInventory,
  visibleFreeRooms,
} from "@/lib/rooms-access";
import { getRules } from "@/lib/settings-server";
import { getStore } from "@/lib/store";
import { blockSegment, blockOverlaps } from "@/lib/operations";
import type { Role, Room, RoomOccupancySegment } from "@/lib/types";

/**
 * Roles that may see who a room is booked for. Everyone else gets the period
 * and the reference id only - the grid answers "is this room free", which
 * needs no guest identity.
 */
const CAN_SEE_OCCUPANT: Role[] = ["gh_manager", "developer"];

/**
 * Roles that see the rooms at all.
 *
 * It was the housekeeping *detail* this gated until 7 Oct 2026 - the
 * turnaround after each stay, an accepted overlap, maintenance by name - with
 * a simplified booked-or-free chart for everyone else. The office then asked
 * for requesters to be told **only how many rooms are free**, both on the
 * availability page and in the booking form, and for the server to send them
 * the number and nothing more.
 *
 * So this is now the line between two different answers, not two styles of
 * the same one: the desk gets rooms and segments, and everyone else gets
 * {@link AvailabilityCounts} with `rooms` and `segments` empty. Which room is
 * free is of no use to a requester - they cannot pick one, the manager
 * allocates - and sending the grid told anyone with a login which rooms a
 * named stay was in.
 */
const SEES_ROOMS: Role[] = ["gh_manager", "gh_caretaker", "developer"];

const DAY_MS = 86_400_000;

export interface RoomAvailability {
  /** The guest house's rooms - **empty** unless the caller is the desk. */
  rooms: Room[];
  /** One segment per (room, booking) - **empty** unless the caller is the desk. */
  segments: RoomOccupancySegment[];
  /** Whether `requester_name` / `purpose_of_visit` were included. */
  showsOccupant: boolean;
  /**
   * Whether this answer carries the rooms. The desk's view draws the chart,
   * the turnarounds, the overlaps, maintenance and the room-by-room list from
   * `rooms` and `segments`; everyone else draws `counts`.
   */
  detailed: boolean;
  /** How many rooms are free, by day and (for a one-day window) by hour. */
  counts: AvailabilityCounts;
}

/**
 * Room occupancy at one guest house over [fromIso, toIso) - a day, a week or a
 * month - for the availability grid at `/availability` and the panel in the
 * booking form. Open to every signed-in user, so a requester is answered with
 * counts alone and the window is capped at `MAX_AVAILABILITY_DAYS` so this
 * cannot be used to read the whole history.
 */
export async function getRoomAvailability(
  guestHouseId: string,
  fromIso: string,
  toIso: string
): Promise<RoomAvailability> {
  const user = await requireUser();

  const from = new Date(fromIso);
  const to = new Date(toIso);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to <= from) {
    throw new Error("Invalid availability window");
  }
  if (to.getTime() - from.getTime() > MAX_AVAILABILITY_DAYS * DAY_MS) {
    throw new Error(`Availability can be read for at most ${MAX_AVAILABILITY_DAYS} days at a time`);
  }

  const store = getStore();
  const [rooms, stays, blocks, rules] = await Promise.all([
    store.listRooms(guestHouseId),
    store.listRoomOccupancy(guestHouseId, from.toISOString(), to.toISOString()),
    // Maintenance blocks are drawn too (Phase 7). Before migration 20 there are none.
    store.listRoomBlocks(guestHouseId).catch(() => []),
    getRules(),
  ]);
  const roomIds = new Set(rooms.map((r) => r.id));
  const segments = [
    ...stays,
    ...rooms.filter((r) => r.room_class === "reserved").map((room): RoomOccupancySegment => ({
      room_id: room.id, booking_id: `reserved-${room.id}`, booking_reference_id: "Reserved",
      status: "APPROVED", check_in: from.toISOString(), check_out: to.toISOString(),
      turnaround_until: null, requester_name: null,
      purpose_of_visit: room.reservation_note ?? "Reserved off-portal", kind: "maintenance",
    })),
    ...blocks.filter((b) => blockOverlaps(b, from.toISOString(), to.toISOString())).map(blockSegment),
  ]
    // A room deactivated after a booking was allocated is not in `rooms`, so
    // its segments would have nowhere to render - and would be counted
    // against a room that is no longer there.
    .filter((s) => roomIds.has(s.room_id));

  const range = rangeBetween(from, to);
  const emptyCounts = (n: number): AvailabilityCounts => ({
    total: n,
    days: [],
    freeByDay: [],
    freeThroughout: n,
    freeByHour: null,
    bookedNow: null,
  });
  const countsFor = (pool: Room[]) =>
    range ? availabilityCounts(pool, segments, range) : emptyCounts(pool.length);

  if (!SEES_ROOMS.includes(user.role)) {
    /**
     * **What a general requester is told** (9 Nov 2026, the meeting): how
     * many rooms are free, counted against the **general inventory** only -
     * so a VIP room and a room let to faculty for three years are neither
     * offered nor implied - **capped** at
     * `rules.portal.general_visible_rooms`, and with **no total at all**.
     *
     * Three separate rules, deliberately not folded into one hardcoded room
     * count (the meeting asked for exactly that: "implemented as distinct
     * rules rather than conflated into one hardcoded room count"):
     *
     *   1. which rooms count  - the room's class (`generalInventory`)
     *   2. how high the figure may read - the cap (`visibleFreeRooms`)
     *   3. what is published at all - no denominator, ever
     *
     * A VIP requester is counted against the rooms they could actually be
     * given, which includes the VIP ones.
     */
    const pool = canUseVipRooms(user, rules.portal)
      ? allocatableRooms(rooms, user, rules.portal)
      : generalInventory(rooms);
    const raw = countsFor(pool);
    const cap = rules.portal.general_visible_rooms;
    const counts: AvailabilityCounts = {
      ...raw,
      // The inventory is not a requester's business, so it is not sent.
      total: 0,
      capped: cap > 0 && (raw.freeByDay.some((n) => n > cap) || raw.total > cap),
      freeByDay: raw.freeByDay.map((n) => visibleFreeRooms(n, cap)),
      freeThroughout: visibleFreeRooms(raw.freeThroughout, cap),
      freeByHour: raw.freeByHour?.map((n) => visibleFreeRooms(n, cap)) ?? null,
      // How many rooms are *taken* is the other half of the fraction, so it
      // goes with the total.
      bookedNow: null,
    };
    return { rooms: [], segments: [], showsOccupant: false, detailed: false, counts };
  }

  // The desk sees the whole inventory - every class, the real figures and the
  // total, which is the other half of the same requirement.
  const counts = countsFor(rooms);

  const showsOccupant = CAN_SEE_OCCUPANT.includes(user.role);
  return {
    rooms,
    segments: segments.map((s) =>
      // A block's reason is not personal - everyone at the desk sees why a
      // room is out.
      showsOccupant || s.kind === "maintenance" ? s : { ...s, requester_name: null, purpose_of_visit: null }
    ),
    showsOccupant,
    detailed: true,
    counts,
  };
}
