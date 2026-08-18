import { UsersManager } from "@/components/admin/users-manager";
import { getStore } from "@/lib/store";

export default async function AdminUsersPage() {
  const profiles = await getStore().listProfiles();
  return <UsersManager profiles={profiles} />;
}
