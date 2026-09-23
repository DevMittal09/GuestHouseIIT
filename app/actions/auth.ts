"use server";

import { redirect } from "next/navigation";
import { recordAudit } from "@/lib/audit-server";
import { getSessionUser } from "@/lib/auth";
import { mockLoginEnabled } from "@/lib/env";
import { directoryUsesEmailUsernames, getDirectory, type DirectoryEntry } from "@/lib/ldap";
import { profileForDirectoryEntry } from "@/lib/ldap/link";
import { isValidLdapUid, normalizeLdapUid } from "@/lib/ldap/uid";
import { homeForRole, SIGN_IN_PATH } from "@/lib/routes";
import { RATE_LIMITS } from "@/lib/security";
import { endAllSessions, endSession, startSession } from "@/lib/sessions";
import { safeNextPath } from "@/lib/site";
import { getStore } from "@/lib/store";
import type { ActionResult } from "./bookings";

/**
 * The sign-in doors. Each one ends in `startSession()` — a row in `sessions`
 * and an opaque cookie (`lib/sessions.ts`) — so there is a single definition
 * of what being signed in means, and a single place to revoke it.
 */

/**
 * Attempts are counted in the database (migration 21), so a restart does not
 * clear the counter and every instance shares it. Failures are recorded in the
 * security audit log; the message never says whether the username exists.
 */
async function throttle(key: string): Promise<{ allowed: boolean; retryAfter: number }> {
  try {
    const result = await getStore().hitRateLimit(key, RATE_LIMITS.signIn.limit, RATE_LIMITS.signIn.windowSeconds);
    return { allowed: result.allowed, retryAfter: result.retryAfter };
  } catch {
    // The table is not there yet (migration 21). Better to allow the sign-in
    // than to lock the office out of its own portal.
    return { allowed: true, retryAfter: 0 };
  }
}

export async function signInWithLdap(
  username: string,
  password: string,
  next?: string | null
): Promise<ActionResult> {
  const uid = normalizeLdapUid(username);
  if (!uid) return { ok: false, error: "Enter your LDAP username" };
  if (!password) return { ok: false, error: "Enter your password" };
  // The most likely mistake, so it gets its own answer rather than "incorrect".
  if (uid.includes("@") && !directoryUsesEmailUsernames()) {
    return { ok: false, error: "Enter your LDAP username, not your email address" };
  }
  if (!isValidLdapUid(uid)) return { ok: false, error: "Incorrect username or password" };

  const gate = await throttle(`signin:ldap:${uid}`);
  if (!gate.allowed) {
    await recordAudit(null, "signin.failure", uid, { reason: "throttled" });
    return { ok: false, error: `Too many attempts — try again in ${gate.retryAfter}s` };
  }

  let entry: DirectoryEntry | null;
  try {
    entry = await getDirectory().authenticate(uid, password);
  } catch (e) {
    console.error("[auth] LDAP sign-in failed:", e);
    return {
      ok: false,
      error: "The institute directory could not be reached. Try again shortly, or sign in with Google.",
    };
  }
  // One message for both failures on purpose: a distinct "no such user" tells
  // an unauthenticated visitor which usernames exist.
  if (!entry) {
    await recordAudit(null, "signin.failure", uid, { method: "ldap" });
    return { ok: false, error: "Incorrect username or password" };
  }

  const profile = await profileForDirectoryEntry(entry);
  if (!profile) {
    // Safe to be specific here: the password has already been proven.
    return {
      ok: false,
      error:
        "Your LDAP account is valid but is not registered on the guest house portal. Please contact the guest house office.",
    };
  }

  await startSession(profile.id);
  await recordAudit(profile, "signin.success", profile.email, { method: "ldap" });
  // Outside any try/catch — `redirect()` signals by throwing.
  redirect(safeNextPath(next) ?? homeForRole(profile.role));
}

/**
 * Mock authentication (`/mock-login`): one click per portal account, no
 * password. It stands in for "Sign in with Google" until the real OpenID
 * Connect flow is configured, and it is also how a developer jumps between the
 * roles. `mockLoginEnabled()` closes this door the moment Google is set up.
 */
export async function loginAs(userId: string, next?: string | null): Promise<void> {
  if (!mockLoginEnabled()) throw new Error("Mock authentication is disabled");
  const profile = await getStore().getProfile(userId);
  if (!profile) throw new Error("Unknown user");
  await startSession(userId, { verified: true });
  redirect(safeNextPath(next) ?? homeForRole(profile.role));
}

export async function logout(): Promise<void> {
  const current = await getSessionUser();
  await endSession();
  if (current) await recordAudit(current.user, "signout", current.user.email, {});
  // Straight back to a sign-in form: "Switch user" is the common reason.
  redirect(SIGN_IN_PATH);
}

/** Sign out of every browser — the answer to a laptop left in a lab. */
export async function logoutEverywhere(): Promise<ActionResult & { sessions?: number }> {
  const current = await getSessionUser();
  if (!current) return { ok: false, error: "You are not signed in" };
  const count = await endAllSessions(current.user.id);
  await recordAudit(current.user, "signout.everywhere", current.user.email, { sessions: count });
  return { ok: true, sessions: count };
}
