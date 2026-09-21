/**
 * The security audit log (`security_audit`, migration 16): who did what that
 * matters for security, when, and from where.
 *
 * Distinct from `booking_logs`, which is the story of one booking and is shown
 * to everyone who can see that booking. This log is about the *system*: sign
 * ins, role and settings changes, who opened an ID document, what was
 * exported, invoices issued and cancelled, force-status overrides, 2FA. It is
 * append-only in the database (updates and early deletes are refused by a
 * trigger) and kept for at least 180 days, as CERT-In requires.
 *
 * Pure types and labels only — `lib/audit-server.ts` writes the rows.
 */

export type AuditEventKind =
  | "signin.success"
  | "signin.failure"
  | "signout"
  | "signout.everywhere"
  | "session.expired"
  | "user.created"
  | "user.updated"
  | "user.deleted"
  | "role.changed"
  | "settings.changed"
  | "document.viewed"
  | "export.csv"
  | "export.pdf"
  | "export.collections"
  | "invoice.issued"
  | "invoice.cancelled"
  | "invoice.paid"
  | "booking.force_status"
  | "booking.deleted"
  | "booking.room_moved"
  | "booking.no_show_released"
  | "room.maintenance"
  | "retention.purged"
  | "privacy.data_export"
  | "privacy.deletion_requested"
  | "twofa.enrolled"
  | "twofa.verified"
  | "twofa.failed"
  | "twofa.reset"
  | "stepup.verified"
  | "stepup.failed"
  | "rate_limited";

export const AUDIT_EVENT_LABELS: Record<AuditEventKind, string> = {
  "signin.success": "Signed in",
  "signin.failure": "Sign-in failed",
  signout: "Signed out",
  "signout.everywhere": "Signed out everywhere",
  "session.expired": "Session expired",
  "user.created": "User created",
  "user.updated": "User updated",
  "user.deleted": "User deleted",
  "role.changed": "Role changed",
  "settings.changed": "Settings changed",
  "document.viewed": "ID document viewed",
  "export.csv": "CSV export",
  "export.pdf": "PDF export",
  "export.collections": "Collections report",
  "invoice.issued": "Invoice issued",
  "invoice.cancelled": "Invoice cancelled",
  "invoice.paid": "Invoice marked paid",
  "booking.force_status": "Booking status forced",
  "booking.deleted": "Booking deleted",
  "booking.room_moved": "Guest moved to another room",
  "booking.no_show_released": "No-show released",
  "room.maintenance": "Maintenance block",
  "retention.purged": "ID data purged (retention)",
  "privacy.data_export": "Personal data downloaded",
  "privacy.deletion_requested": "Data deletion requested",
  "twofa.enrolled": "2FA enrolled",
  "twofa.verified": "2FA verified",
  "twofa.failed": "2FA code rejected",
  "twofa.reset": "2FA reset",
  "stepup.verified": "Step-up re-authentication",
  "stepup.failed": "Step-up re-authentication failed",
  rate_limited: "Rate limit hit",
};

export type AuditEvent = {
  id: string;
  at: string;
  actor_id: string | null;
  /** Denormalised so the log still names someone whose account was deleted. */
  actor_name: string;
  actor_role: string | null;
  event: AuditEventKind;
  /** What was acted on: a settings group, a booking reference, an email. */
  target: string | null;
  details: Record<string, unknown>;
  ip: string | null;
  user_agent: string | null;
};

export type NewAuditEvent = Omit<AuditEvent, "id" | "at">;

export interface AuditFilter {
  event?: AuditEventKind;
  actorId?: string;
  /** Free text matched against actor name, target and details. */
  q?: string;
  /** ISO instants, inclusive / exclusive. */
  from?: string;
  to?: string;
  limit?: number;
}

/** CERT-In: logs are kept for at least 180 days. */
export const AUDIT_MIN_RETENTION_DAYS = 180;

/** The mock store's matcher, and the Supabase store's post-filter for `q`. */
export function auditMatches(event: AuditEvent, filter: AuditFilter): boolean {
  if (filter.event && event.event !== filter.event) return false;
  if (filter.actorId && event.actor_id !== filter.actorId) return false;
  if (filter.from && event.at < filter.from) return false;
  if (filter.to && event.at >= filter.to) return false;
  if (filter.q) {
    const needle = filter.q.toLowerCase();
    const haystack = [event.actor_name, event.target ?? "", JSON.stringify(event.details)]
      .join(" ")
      .toLowerCase();
    if (!haystack.includes(needle)) return false;
  }
  return true;
}
