"use server";

import { requireUser } from "@/lib/auth";
import { MAX_AVAILABILITY_DAYS } from "@/lib/availability";
import { getStore } from "@/lib/store";
import { blockSegment, blockOverlaps } from "@/lib/operations";
import type { Role, Room, RoomOccupancySegment } from "@/lib/types";

/**
 * Roles that may see who a room is booked for. Everyone else gets the period
 * and the reference id only — the grid answers "is this room free", which
 * needs no guest identity.
 */
const CAN_SEE_OCCUPANT: Role[] = ["gh_manager", "developer"];

const DAY_MS = 86_400_000;

export interface RoomAvailability {
  rooms: Room[];
  segments: RoomOccupancySegment[];
  /** Whether `requester_name` / `purpose_of_visit` were included. */
  showsOccupant: boolean;
}

/**
 * Room occupancy at one guest house over [fromIso, toIso) — a day, a week or a
 * month — for the availability grid at `/availability` and the panel in the
 * booking form. Open to every signed-in user, so identifying fields are
 * stripped unless the caller is staff, and the window is capped at
 * `MAX_AVAILABILITY_DAYS` so this cannot be used to read the whole history.
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
  const segments = [
    ...stays,
    ...blocks.filter((b) => blockOverlaps(b, from.toISOString(), to.toISOString())).map(blockSegment),
  ];

  const showsOccupant = CAN_SEE_OCCUPANT.includes(user.role);
  const roomIds = new Set(rooms.map((r) => r.id));

  return {
    rooms,
    // A room deactivated after a booking was allocated is not in `rooms`, so
    // its segments would have nowhere to render.
    segments: segments
      .filter((s) => roomIds.has(s.room_id))
      .map((s) =>
        // A block's reason is not personal — everyone sees why a room is out.
        showsOccupant || s.kind === "maintenance" ? s : { ...s, requester_name: null, purpose_of_visit: null }
      ),
    showsOccupant,
  };
}
