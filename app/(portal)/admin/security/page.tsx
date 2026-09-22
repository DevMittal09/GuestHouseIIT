import { redirect } from "next/navigation";
import { listMySessions } from "@/app/actions/security";
import { SecurityManager } from "@/components/admin/security-manager";
import { canUseConsoleSection } from "@/lib/access";
import { getCurrentUser } from "@/lib/auth";
import { SIGN_IN_PATH } from "@/lib/routes";
import { ABSOLUTE_HOURS, IDLE_MINUTES, STEP_UP_MINUTES } from "@/lib/sessions";

export default async function AdminSecurityPage() {
  const user = await getCurrentUser();
  if (!user) redirect(SIGN_IN_PATH);
  if (!canUseConsoleSection(user.role, "security")) redirect("/admin/users");

  const result = await listMySessions();
  if (!result.ok) {
    return (
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">
        <p className="font-medium">Security is not available yet</p>
        <p className="mt-1">{result.error}</p>
      </div>
    );
  }
  return (
    <SecurityManager
      mfa={result.mfa}
      sessions={result.sessions}
      idleMinutes={IDLE_MINUTES}
      absoluteHours={ABSOLUTE_HOURS}
      stepUpMinutes={STEP_UP_MINUTES}
    />
  );
}
