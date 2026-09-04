import { ConsoleAccess } from "@/components/admin/console-access";
import { isDefaultAdminPassword } from "@/lib/admin-lock";

/** Reachable only through the admin layout, which enforces the unlock. */
export default async function ConsoleAccessPage() {
  return <ConsoleAccess usingDefault={await isDefaultAdminPassword()} />;
}
