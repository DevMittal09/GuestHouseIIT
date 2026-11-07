"use server";

import { redirect } from "next/navigation";
import { recordAudit } from "@/lib/audit-server";
import { getSessionUser } from "@/lib/auth";
import { verifySecret } from "@/lib/crypto";
import { mockLoginEnabled } from "@/lib/env";
import { homeForRole, SIGN_IN_PATH } from "@/lib/routes";
import { RATE_LIMITS } from "@/lib/security";
import { startSession } from "@/lib/sessions";
import { safeNextPath } from "@/lib/site";
import { getStore } from "@/lib/store";
import { throttleCheck } from "@/lib/admin-lock";
import { endAllSessions, endSession } from "@/lib/sessions";
import type { ActionResult } from "./bookings";

/**
 * Auth actions: **Mock Authentication** (the account picker), Google OAuth
 * and the legacy email+password form.
 *
 * `signInWithPassword` is kept and still works - it is how the institute's
 * own accounts were tested before the picker, and `profiles.password_hash`
 * still holds their hashes - but nothing in the interface calls it since
 * 7 Nov 2026 (the owner: "make a mock authentication for this instead of
 * sign in with password"). Don't put the form back without being asked.
 */

export type SignInResult = { ok: boolean; error?: string | null; redirect?: string };

export async function signInWithPassword(
  _prev: SignInResult,
  formData: FormData
): Promise<SignInResult> {
  const email = (formData.get("email") as string ?? "").trim();
  const password = formData.get("password") as string ?? "";
  const next = safeNextPath(formData.get("next") as string | null);

  if (!email || !password) {
    return { ok: false, error: "Email and password are required." };
  }

  const limit: number = RATE_LIMITS.passwordLogin.limit;
  const window: number = RATE_LIMITS.passwordLogin.windowSeconds;
  const { allowed, retryInSeconds } = await throttleCheck(
    `pwd:${email.toLowerCase()}`,
    limit,
    window
  );
  if (!allowed) {
    return { ok: false, error: `Too many attempts. Try again in ${Math.ceil(retryInSeconds / 60)} minutes.` };
  }

  const store = getStore();
  const profile = await store.getProfileByEmail(email);
  if (!profile) {
    await recordAudit(null, "signin.failure", email, { method: "password", reason: "no account" });
    return { ok: false, error: "Incorrect email or password." };
  }

  const hash = await store.getPasswordHash(email);
  if (!hash || !verifySecret(password, hash)) {
    await recordAudit(null, "signin.failure", email, { method: "password", reason: "wrong password" });
    return { ok: false, error: "Incorrect email or password." };
  }

  if (profile.account_status !== "active") {
    await recordAudit(profile, "signin.failure", email, { method: "password", reason: "account inactive", status: profile.account_status });
    return { ok: false, error: "Your account is not active. Please contact the guest house office." };
  }

  await startSession(profile.id);
  await recordAudit(profile, "signin.success", profile.email, { method: "password" });
  return { ok: true, redirect: next ?? homeForRole(profile.role) };
}

/**
 * **Mock Authentication** (`/mock-login`): one click per portal account, no
 * password.
 *
 * It stands in for "Sign in with Google" wherever that is not configured, and
 * it is how every workflow in the portal is tested - a student in Saveri, the
 * Assistant Warden who decides their request, the Guest House Manager who
 * allocates the room - without nineteen passwords to remember.
 * `mockLoginEnabled()` (`lib/env.ts`) says where the door is open; this
 * action asks again rather than trusting the page, because a server action
 * is reachable without one.
 */
export async function loginAs(userId: string, next?: string | null): Promise<void> {
  if (!mockLoginEnabled()) throw new Error("Mock authentication is not available");
  const profile = await getStore().getProfile(userId);
  if (!profile) throw new Error("Unknown account");
  if (profile.account_status !== "active") {
    throw new Error(`This account is ${profile.account_status}, so it cannot sign in.`);
  }
  await startSession(profile.id, { verified: true });
  await recordAudit(profile, "signin.success", profile.email, { method: "mock" });
  // Outside any try/catch - `redirect()` signals by throwing.
  redirect(safeNextPath(next) ?? homeForRole(profile.role));
}

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
