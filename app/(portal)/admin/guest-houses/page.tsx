import { GuestHousesManager } from "@/components/admin/guest-houses-manager";
import { getStore } from "@/lib/store";
import type { RoomBlock } from "@/lib/operations";
import type { Room } from "@/lib/types";

export default async function AdminGuestHousesPage() {
  const store = getStore();
  const guestHouses = await store.listGuestHouses();
  const roomsByGh: Record<string, Room[]> = {};
  const blocksByGh: Record<string, RoomBlock[]> = {};
  const now = new Date().toISOString();
  for (const gh of guestHouses) {
    roomsByGh[gh.id] = await store.listAllRooms(gh.id);
    // Blocks still to come or in force; before migration 20 there are none.
    blocksByGh[gh.id] = (await store.listRoomBlocks(gh.id).catch(() => [])).filter((b) => b.to > now);
  }
  return <GuestHousesManager guestHouses={guestHouses} roomsByGh={roomsByGh} blocksByGh={blocksByGh} />;
}
