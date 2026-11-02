"use server";

import { redirect } from "next/navigation";
import { recordAudit } from "@/lib/audit-server";
import { getSessionUser } from "@/lib/auth";
import { SIGN_IN_PATH } from "@/lib/routes";
import { endAllSessions, endSession } from "@/lib/sessions";
import type { ActionResult } from "./bookings";

/**
 * Auth actions. Google OAuth (`app/api/auth/google/`) is the only sign-in
 * door (2 Nov 2026). These actions handle sign-out only.
 */

export async function logout(): Promise<void> {
  const current = await getSessionUser();
  await endSession();
  if (current) await recordAudit(current.user, "signout", current.user.email, {});
  redirect(SIGN_IN_PATH);
}

export async function logoutEverywhere(): Promise<ActionResult & { sessions?: number }> {
  const current = await getSessionUser();
  if (!current) return { ok: false, error: "You are not signed in" };
  const count = await endAllSessions(current.user.id);
  await recordAudit(current.user, "signout.everywhere", current.user.email, { sessions: count });
  return { ok: true, sessions: count };
}
