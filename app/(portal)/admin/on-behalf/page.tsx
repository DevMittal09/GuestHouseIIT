import { redirect } from "next/navigation";
import { OnBehalfSettings } from "@/components/admin/on-behalf-settings";
import { canUseConsoleSection } from "@/lib/access";
import { getCurrentUser } from "@/lib/auth";
import { SIGN_IN_PATH } from "@/lib/routes";
import { getStore } from "@/lib/store";
import { getOnBehalfConfig } from "@/lib/on-behalf-config-server";

export default async function AdminOnBehalfPage() {
  const user = await getCurrentUser();
  if (!user) redirect(SIGN_IN_PATH);
  if (!canUseConsoleSection(user.role, "on_behalf")) redirect("/admin/users");

  const [entries, profiles] = await Promise.all([
    getOnBehalfConfig(),
    getStore().listProfiles().catch(() => []),
  ]);

  return (
    <OnBehalfSettings entries={entries} profiles={profiles} />
  );
}
