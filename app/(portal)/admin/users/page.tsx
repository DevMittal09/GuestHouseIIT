import { redirect } from "next/navigation";
import { UsersManager } from "@/components/admin/users-manager";
import { assignableRoles } from "@/lib/access";
import { getCurrentUser } from "@/lib/auth";
import { SIGN_IN_PATH } from "@/lib/routes";
import { getStore } from "@/lib/store";
import { getHostels } from "@/lib/settings-server";
import { ROLE_LABELS, type Role } from "@/lib/types";

export default async function AdminUsersPage() {
  const user = await getCurrentUser();
  if (!user) redirect(SIGN_IN_PATH);
  const store = getStore();
  const [profiles, hostels, units, imports] = await Promise.all([
    store.listProfiles(),
    getHostels(),
    // Before migration 15 there is no units table; the form then simply
    // offers none, rather than the page failing.
    store.listUnits().catch(() => []),
    // Before migration 32 there is no table of imports, and the page shows no
    // Recent imports section rather than failing to open. Writing one is what
    // refuses loudly - an import will not run without somewhere to record
    // what it changed.
    store.listUserImports(10).catch(() => []),
  ]);
  // The manager may appoint another manager but not a developer, so the
  // dropdown matches what `createUserAction` will actually accept - an option
  // that always fails is worse than no option.
  const roles = assignableRoles(user.role, Object.keys(ROLE_LABELS) as Role[]);
  return (
    <UsersManager
      profiles={profiles}
      units={units}
      hostels={hostels}
      roles={roles}
      actorRole={user.role}
      imports={imports}
    />
  );
}
