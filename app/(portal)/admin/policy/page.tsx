import { redirect } from "next/navigation";
import { PolicyManager } from "@/components/admin/policy-manager";
import { canUseConsoleSection } from "@/lib/access";
import { getCurrentUser } from "@/lib/auth";
import { SIGN_IN_PATH } from "@/lib/routes";
import { getRules } from "@/lib/settings-server";
import { getStore } from "@/lib/store";
import { FIXED_VIP_EMAILS, vipRoomIds } from "@/lib/vip";

/**
 * Console -> VIP Rooms & Guidelines (4 Nov 2026, the owner's sixteenth list):
 * the Guest House Manager's own settings - `rules.policy`.
 */
export default async function AdminPolicyPage() {
  const user = await getCurrentUser();
  if (!user) redirect(SIGN_IN_PATH);
  if (!canUseConsoleSection(user.role, "policy")) redirect("/admin/users");

  const store = getStore();
  const [rules, guestHouses] = await Promise.all([getRules(), store.listGuestHouses()]);
  const houses = await Promise.all(
    guestHouses.map(async (g) => ({
      id: g.id,
      name: g.name,
      rooms: (await store.listRooms(g.id)).map((r) => ({ id: r.id, room_number: r.room_number })),
    }))
  );
  const allRooms = houses.flatMap((h) => h.rooms);
  return (
    <PolicyManager
      policy={rules.policy}
      houses={houses}
      vipRoomIds={[...vipRoomIds(allRooms, rules.policy)]}
      fixedVipEmails={FIXED_VIP_EMAILS}
    />
  );
}
