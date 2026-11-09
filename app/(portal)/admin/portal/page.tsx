import { redirect } from "next/navigation";
import { PortalSettingsManager } from "@/components/admin/portal-settings-manager";
import { canUseConsoleSection } from "@/lib/access";
import { getCurrentUser } from "@/lib/auth";
import { SIGN_IN_PATH } from "@/lib/routes";
import { getRules } from "@/lib/settings-server";

/**
 * **Portal Settings** (9 Nov 2026): VIP room access, how many free rooms a
 * general requester is shown, and the guidelines link. Manager and developer,
 * behind the console password like every other section.
 *
 * It edits `rules.portal`, through the same `saveRuleGroup` the developer's
 * Settings page uses - so the validation, the audit entry and the
 * confirmation that spells out each change are the ones every rule group
 * already gets. `requireConsoleFor` is what sends this group to this
 * section's permissions rather than to the developer's.
 */
export default async function AdminPortalSettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect(SIGN_IN_PATH);
  if (!canUseConsoleSection(user.role, "portal")) redirect("/admin/users");

  const rules = await getRules();
  return <PortalSettingsManager current={rules.portal} />;
}
