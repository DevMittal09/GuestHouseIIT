import { redirect } from "next/navigation";
import { getSettingsConsoleData } from "@/app/actions/settings";
import { SettingsManager } from "@/components/admin/settings-manager";
import { canUseConsoleSection } from "@/lib/access";
import { getCurrentUser } from "@/lib/auth";
import { SIGN_IN_PATH } from "@/lib/routes";
import { getStore } from "@/lib/store";

export default async function AdminSettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect(SIGN_IN_PATH);
  if (!canUseConsoleSection(user.role, "settings")) redirect("/admin/users");

  // A result rather than a throw: a missing migration should say so here, not
  // replace the console with an error page.
  const result = await getSettingsConsoleData();
  if (!result.ok) {
    return (
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">
        <p className="font-medium">Settings are not available yet</p>
        <p className="mt-1">{result.error}</p>
      </div>
    );
  }
  const units = await getStore()
    .listUnits()
    .catch(() => []);
  return <SettingsManager data={result.data} unitCount={units.length} />;
}
