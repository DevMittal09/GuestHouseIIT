"use server";

import { redirect } from "next/navigation";
import { recordAudit } from "@/lib/audit-server";
import { getSessionUser } from "@/lib/auth";
// import { verifyPassword } from "@/lib/password";
// import { homeForRole } from "@/lib/routes";
import { SIGN_IN_PATH } from "@/lib/routes";
// import { RATE_LIMITS } from "@/lib/security";
import { endAllSessions, endSession } from "@/lib/sessions";
// import { startSession } from "@/lib/sessions";
// import { safeNextPath } from "@/lib/site";
// import { getStore } from "@/lib/store";
import type { ActionResult } from "./bookings";

/**
 * The sign-in door. Ends in `startSession()` - a row in `sessions` and an
 * opaque cookie (`lib/sessions.ts`) - so there is a single definition of what
 * being signed in means, and a single place to revoke it.
 *
 * **Google sign-in is the only door** (30 Oct 2026): the email+password flow
 * below is commented out - the UI shows "Sign in with Google" and the OAuth
 * callback (`app/api/auth/google/callback`) is what starts sessions. The
 * password action is kept so it can be re-enabled if needed.
 */

// async function throttle(key: string): Promise<{ allowed: boolean; retryAfter: number }> {
//   try {
//     const result = await getStore().hitRateLimit(key, RATE_LIMITS.signIn.limit, RATE_LIMITS.signIn.windowSeconds);
//     return { allowed: result.allowed, retryAfter: result.retryAfter };
//   } catch {
//     return { allowed: true, retryAfter: 0 };
//   }
// }

// export async function signInWithPassword(
//   email: string,
//   password: string,
//   next?: string | null
// ): Promise<ActionResult> {
//   const trimmed = email.trim().toLowerCase();
//   if (!trimmed) return { ok: false, error: "Enter your email address" };
//   if (!password) return { ok: false, error: "Enter your password" };
//
//   const gate = await throttle(`signin:email:${trimmed}`);
//   if (!gate.allowed) {
//     await recordAudit(null, "signin.failure", trimmed, { reason: "throttled" });
//     return { ok: false, error: `Too many attempts - try again in ${gate.retryAfter}s` };
//   }
//
//   const profile = await getStore().getProfileByEmail(trimmed);
//   if (!profile || !profile.password_hash) {
//     await recordAudit(null, "signin.failure", trimmed, { method: "password" });
//     return { ok: false, error: "Incorrect email or password" };
//   }
//
//   const valid = await verifyPassword(password, profile.password_hash);
//   if (!valid) {
//     await recordAudit(null, "signin.failure", trimmed, { method: "password" });
//     return { ok: false, error: "Incorrect email or password" };
//   }
//
//   await startSession(profile.id);
//   await recordAudit(profile, "signin.success", profile.email, { method: "password" });
//   redirect(safeNextPath(next) ?? homeForRole(profile.role));
// }

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
