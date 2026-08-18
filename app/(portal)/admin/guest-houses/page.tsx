import { GuestHousesManager } from "@/components/admin/guest-houses-manager";
import { getStore } from "@/lib/store";
import type { Room } from "@/lib/types";

export default async function AdminGuestHousesPage() {
  const store = getStore();
  const guestHouses = await store.listGuestHouses();
  const roomsByGh: Record<string, Room[]> = {};
  for (const gh of guestHouses) {
    roomsByGh[gh.id] = await store.listAllRooms(gh.id);
  }
  return <GuestHousesManager guestHouses={guestHouses} roomsByGh={roomsByGh} />;
}
