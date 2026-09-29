import { redirect } from "next/navigation";
import { listUnitsForConsole } from "@/app/actions/units";
import { UnitsManager } from "@/components/admin/units-manager";
import { canUseConsoleSection } from "@/lib/access";
import { getCurrentUser } from "@/lib/auth";
import { SIGN_IN_PATH } from "@/lib/routes";
import { getStore } from "@/lib/store";

export default async function AdminUnitsPage() {
  const user = await getCurrentUser();
  if (!user) redirect(SIGN_IN_PATH);
  if (!canUseConsoleSection(user.role, "units")) redirect("/admin/users");

  // A result rather than a throw: a missing migration should say so here, not
  // replace the console with an error page.
  const result = await listUnitsForConsole();
  if (!result.ok) {
    return (
      <div className="border-l-4 border-saffron bg-notice p-4 text-sm text-ink">
        <p className="font-medium">Departments &amp; Clubs are not available yet</p>
        <p className="mt-1">{result.error}</p>
      </div>
    );
  }
  const profiles = await getStore().listProfiles();
  return <UnitsManager units={result.units} profiles={profiles} />;
}
