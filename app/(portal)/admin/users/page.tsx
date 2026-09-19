import { redirect } from "next/navigation";
import { UsersManager } from "@/components/admin/users-manager";
import { assignableRoles } from "@/lib/access";
import { getCurrentUser } from "@/lib/auth";
import { SIGN_IN_PATH } from "@/lib/routes";
import { getStore } from "@/lib/store";
import { ROLE_LABELS, type Role } from "@/lib/types";

export default async function AdminUsersPage() {
  const user = await getCurrentUser();
  if (!user) redirect(SIGN_IN_PATH);
  const profiles = await getStore().listProfiles();
  // The manager may appoint another manager but not a developer, so the
  // dropdown matches what `createUserAction` will actually accept — an option
  // that always fails is worse than no option.
  const roles = assignableRoles(user.role, Object.keys(ROLE_LABELS) as Role[]);
  return <UsersManager profiles={profiles} roles={roles} actorRole={user.role} />;
}
