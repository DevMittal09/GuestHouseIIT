"use server";

import { requireUser } from "@/lib/auth";
import { getStore } from "@/lib/store";
import type { Role, Room, RoomOccupancySegment } from "@/lib/types";

/**
 * Roles that may see who a room is booked for. Everyone else gets the period
 * and the reference id only — the grid answers "is this room free", which
 * needs no guest identity.
 */
const CAN_SEE_OCCUPANT: Role[] = ["gh_manager", "developer"];

export interface DayAvailability {
  rooms: Room[];
  segments: RoomOccupancySegment[];
  /** Whether `requester_name` / `purpose_of_visit` were included. */
  showsOccupant: boolean;
}

/**
 * Room occupancy for one calendar day at one guest house, for the
 * availability grid at `/availability`. Open to every signed-in user, so
 * identifying fields are stripped unless the caller is staff.
 */
export async function getDayAvailability(
  guestHouseId: string,
  dayStartIso: string,
  dayEndIso: string
): Promise<DayAvailability> {
  const user = await requireUser();
  const store = getStore();

  const [rooms, segments] = await Promise.all([
    store.listRooms(guestHouseId),
    store.listRoomOccupancy(guestHouseId, dayStartIso, dayEndIso),
  ]);

  const showsOccupant = CAN_SEE_OCCUPANT.includes(user.role);
  const roomIds = new Set(rooms.map((r) => r.id));

  return {
    rooms,
    // A room deactivated after a booking was allocated is not in `rooms`, so
    // its segments would have nowhere to render.
    segments: segments
      .filter((s) => roomIds.has(s.room_id))
      .map((s) =>
        showsOccupant ? s : { ...s, requester_name: null, purpose_of_visit: null }
      ),
    showsOccupant,
  };
}
