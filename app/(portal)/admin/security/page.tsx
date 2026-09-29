import { redirect } from "next/navigation";
import { listMySessions } from "@/app/actions/security";
import { listPrivacyRequestsForConsole } from "@/app/actions/privacy";
import { SecurityManager } from "@/components/admin/security-manager";
import { canUseConsoleSection } from "@/lib/access";
import { getCurrentUser } from "@/lib/auth";
import { SIGN_IN_PATH } from "@/lib/routes";
import { ABSOLUTE_HOURS, IDLE_MINUTES, STEP_UP_MINUTES } from "@/lib/sessions";

export default async function AdminSecurityPage() {
  const user = await getCurrentUser();
  if (!user) redirect(SIGN_IN_PATH);
  if (!canUseConsoleSection(user.role, "security")) redirect("/admin/users");

  const [result, privacy] = await Promise.all([listMySessions(), listPrivacyRequestsForConsole()]);
  if (!result.ok) {
    return (
      <div className="border-l-4 border-saffron bg-notice p-4 text-sm text-ink">
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
      privacyRequests={privacy.ok ? privacy.requests : []}
    />
  );
}
