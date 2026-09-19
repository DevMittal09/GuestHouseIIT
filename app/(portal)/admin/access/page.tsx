import { redirect } from "next/navigation";
import { ConsoleAccess } from "@/components/admin/console-access";
import { canUseConsoleSection } from "@/lib/access";
import { isDefaultAdminPassword } from "@/lib/admin-lock";
import { getCurrentUser } from "@/lib/auth";
import { SIGN_IN_PATH } from "@/lib/routes";

/** The console password is the key to this door, so only a developer holds it. */
export default async function ConsoleAccessPage() {
  const user = await getCurrentUser();
  if (!user) redirect(SIGN_IN_PATH);
  if (!canUseConsoleSection(user.role, "console_access")) redirect("/admin/users");

  return <ConsoleAccess usingDefault={await isDefaultAdminPassword()} />;
}
