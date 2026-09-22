import { redirect } from "next/navigation";
import { AuditLog } from "@/components/admin/audit-log";
import { canUseConsoleSection } from "@/lib/access";
import { isAdminUnlocked } from "@/lib/admin-lock";
import { AUDIT_EVENT_LABELS, AUDIT_MIN_RETENTION_DAYS, type AuditEventKind } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth";
import { SIGN_IN_PATH } from "@/lib/routes";
import { getRules } from "@/lib/settings-server";
import { getStore } from "@/lib/store";

/**
 * The security audit log (Phase 8): who signed in, who changed a role or a
 * setting, who looked at a guest's ID document, who issued or cancelled an
 * invoice. Append-only in the database; this is the only way to read it.
 */
export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ event?: string; q?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect(SIGN_IN_PATH);
  if (!canUseConsoleSection(user.role, "audit")) redirect("/admin/users");
  if (!(await isAdminUnlocked())) redirect("/admin/users");

  const { event, q } = await searchParams;
  const kind = event && event in AUDIT_EVENT_LABELS ? (event as AuditEventKind) : undefined;
  const [events, rules] = await Promise.all([
    getStore()
      .listAudit({ event: kind, q: q?.trim() || undefined, limit: 300 })
      .catch(() => []),
    getRules(),
  ]);

  return (
    <AuditLog
      events={events}
      event={kind ?? ""}
      q={q ?? ""}
      retentionDays={Math.max(AUDIT_MIN_RETENTION_DAYS, rules.privacy.audit_retention_days)}
    />
  );
}
