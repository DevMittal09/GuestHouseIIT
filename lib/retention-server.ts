import "server-only";
import { recordAudit } from "@/lib/audit-server";
import { getRules } from "@/lib/settings-server";
import { getStore } from "@/lib/store";

/**
 * Keeping personal data no longer than it is needed (Phase 8, DPDP).
 *
 * Run daily from the cron route. Two jobs:
 *
 * - **Identity fields.** Stays that ended more than `id_retention_days` ago
 *   lose their guests' ID numbers, passport numbers and uploaded documents —
 *   the files as well as the references. What the guest house is entitled to
 *   keep as its own record (who stayed, when, in which room, what it cost) is
 *   untouched.
 * - **The audit log.** Trimmed to `audit_retention_days`, which the database
 *   will not let fall below the 180 days CERT-In expects.
 *
 * Both are idempotent: a second run the same day finds nothing to do, and
 * both write to the audit log so a purge is itself accountable.
 */
export async function runRetention(now = new Date()): Promise<{ bookings: number; documents: number; auditRows: number }> {
  const store = getStore();
  const rules = (await getRules()).privacy;
  const before = new Date(now.getTime() - rules.id_retention_days * 86_400_000).toISOString();

  let bookings = 0;
  let documents = 0;
  try {
    const purged = await store.purgeGuestIdentities(before);
    bookings = purged.bookings;
    for (const path of purged.documents) {
      await store.deleteDocument(path).catch((e) => console.error("[retention] could not delete", path, e));
      documents++;
    }
  } catch (e) {
    console.error("[retention] could not purge identity fields", e);
  }

  let auditRows = 0;
  try {
    auditRows = await store.purgeAudit(rules.audit_retention_days);
  } catch (e) {
    console.error("[retention] could not trim the audit log", e);
  }

  if (bookings > 0 || documents > 0 || auditRows > 0) {
    await recordAudit(null, "retention.purged", null, {
      bookings,
      documents,
      auditRows,
      idRetentionDays: rules.id_retention_days,
      auditRetentionDays: rules.audit_retention_days,
    });
  }
  return { bookings, documents, auditRows };
}
