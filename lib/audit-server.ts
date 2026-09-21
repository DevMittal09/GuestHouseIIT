import { headers } from "next/headers";
import { getStore } from "@/lib/store";
import type { Profile } from "@/lib/types";
import type { AuditEventKind } from "./audit";

/**
 * Append a row to the security audit log.
 *
 * Written **after** the change it records, so the log never claims something
 * that was refused. A failed write is logged loudly and swallowed: the change
 * has already happened, and failing the request would only tell the operator
 * it did not. (Before migration 16 there is no table; that is the usual cause.)
 *
 * The client address is the first hop of `x-forwarded-for` — what Vercel and
 * most proxies set — and is recorded as given, not trusted for anything.
 */
export async function recordAudit(
  actor: Pick<Profile, "id" | "full_name" | "role"> | null,
  event: AuditEventKind,
  target: string | null,
  details: Record<string, unknown> = {}
): Promise<void> {
  try {
    const { ip, userAgent } = await requestOrigin();
    await getStore().appendAudit({
      actor_id: actor?.id ?? null,
      actor_name: actor?.full_name ?? "Anonymous",
      actor_role: actor?.role ?? null,
      event,
      target,
      details,
      ip,
      user_agent: userAgent,
    });
  } catch (error) {
    console.error(`[audit] could not record ${event} for ${target ?? "-"}`, error);
  }
}

/** Where the request came from, or nulls outside a request (a script, the cron). */
export async function requestOrigin(): Promise<{ ip: string | null; userAgent: string | null }> {
  try {
    const h = await headers();
    const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
    return {
      ip: forwarded || h.get("x-real-ip") || null,
      userAgent: h.get("user-agent")?.slice(0, 300) ?? null,
    };
  } catch {
    return { ip: null, userAgent: null };
  }
}
