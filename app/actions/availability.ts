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
import { getRules } from "@/lib/settings-server";
import type { Role, Room, RoomOccupancySegment } from "@/lib/types";
import { capCounts, heldToVisibleRoomCap, roomsVisibleTo } from "@/lib/vip";

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
  const [rooms, { segments }, policy] = await Promise.all([
    store.listRooms(guestHouseId),
    occupancyOf(guestHouseId, from, to),
    getRules().then((r) => r.policy),
  ]);
  const roomIds = new Set(rooms.map((r) => r.id));
  // A room deactivated after a booking was allocated is not in `rooms`, so
  // its segments would have nowhere to render - and would be counted against
  // a room that is no longer there.
  const ownSegments = segments.filter((s) => roomIds.has(s.room_id));

  // **VIP rooms are not counted for a requester without VIP access** (4 Nov
  // 2026): they are not theirs to be given, so a figure that included them
  // would be an offer the desk could not honour. The desk's own chart below
  // still draws every room.
  const counted = roomsVisibleTo(rooms, user, policy);
  const range = rangeBetween(from, to);
  let counts = countRooms(counted, ownSegments, range);

  // **And never more than the pool** (`visible_room_cap`, 14): what is left
  // of it is the cap less every non-VIP room held at *any* guest house, so a
  // room the desk gives away comes off the figure wherever it is.
  if (range && heldToVisibleRoomCap(user, policy)) {
    const houses = await store.listGuestHouses();
    const everywhere = await Promise.all(
      houses.map(async (house) => {
        if (house.id === guestHouseId) return counts;
        const [houseRooms, occupancy] = await Promise.all([
          store.listRooms(house.id),
          occupancyOf(house.id, from, to),
        ]);
        const ids = new Set(houseRooms.map((r) => r.id));
        return countRooms(
          roomsVisibleTo(houseRooms, user, policy),
          occupancy.segments.filter((s) => ids.has(s.room_id)),
          range
        );
      })
    );
    counts = capCounts(counts, everywhere, policy.visible_room_cap);
  }

  if (!SEES_ROOMS.includes(user.role)) {
    // Nothing identifying, and no room numbers: the whole answer is the
    // counts above.
    return { rooms: [], segments: [], showsOccupant: false, detailed: false, counts };
  }

  const showsOccupant = CAN_SEE_OCCUPANT.includes(user.role);
  return {
    rooms,
    segments: ownSegments.map((s) =>
      // A block's reason is not personal - everyone at the desk sees why a
      // room is out.
      showsOccupant || s.kind === "maintenance" ? s : { ...s, requester_name: null, purpose_of_visit: null }
    ),
    showsOccupant,
    detailed: true,
    counts,
  };
}

/** Stays and maintenance blocks at one guest house over the window. */
async function occupancyOf(
  guestHouseId: string,
  from: Date,
  to: Date
): Promise<{ segments: RoomOccupancySegment[] }> {
  const store = getStore();
  const [stays, blocks] = await Promise.all([
    store.listRoomOccupancy(guestHouseId, from.toISOString(), to.toISOString()),
    // Maintenance blocks are drawn too (Phase 7). Before migration 20 there are none.
    store.listRoomBlocks(guestHouseId).catch(() => []),
  ]);
  return {
    segments: [
      ...stays,
      ...blocks.filter((b) => blockOverlaps(b, from.toISOString(), to.toISOString())).map(blockSegment),
    ],
  };
}

function countRooms(
  rooms: Room[],
  segments: RoomOccupancySegment[],
  range: ReturnType<typeof rangeBetween>
): AvailabilityCounts {
  return range
    ? availabilityCounts(rooms, segments, range)
    : {
        total: rooms.length,
        days: [],
        freeByDay: [],
        freeThroughout: rooms.length,
        freeByHour: null,
        bookedNow: null,
      };
}
