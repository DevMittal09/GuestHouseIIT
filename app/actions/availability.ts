"use server";

import { requireUser } from "@/lib/auth";
import {
  availabilityCounts,
  MAX_AVAILABILITY_DAYS,
  rangeBetween,
  type AvailabilityCounts,
} from "@/lib/availability";
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
  const [rooms, stays, blocks] = await Promise.all([
    store.listRooms(guestHouseId),
    store.listRoomOccupancy(guestHouseId, from.toISOString(), to.toISOString()),
    // Maintenance blocks are drawn too (Phase 7). Before migration 20 there are none.
    store.listRoomBlocks(guestHouseId).catch(() => []),
  ]);
  const roomIds = new Set(rooms.map((r) => r.id));
  const segments = [
    ...stays,
    ...blocks.filter((b) => blockOverlaps(b, from.toISOString(), to.toISOString())).map(blockSegment),
  ]
    // A room deactivated after a booking was allocated is not in `rooms`, so
    // its segments would have nowhere to render - and would be counted
    // against a room that is no longer there.
    .filter((s) => roomIds.has(s.room_id));

  // The counts are computed from everything, for everybody: they are what a
  // requester is sent, and the figures the desk's own header reads.
  const range = rangeBetween(from, to);
  const counts = range
    ? availabilityCounts(rooms, segments, range)
    : {
        total: rooms.length,
        days: [],
        freeByDay: [],
        freeThroughout: rooms.length,
        freeByHour: null,
        bookedNow: null,
      };

  if (!SEES_ROOMS.includes(user.role)) {
    // Nothing identifying, and no room numbers: the whole answer is the
    // counts above.
    return { rooms: [], segments: [], showsOccupant: false, detailed: false, counts };
  }

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
