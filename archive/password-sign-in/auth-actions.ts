"use server";

import { redirect } from "next/navigation";
import { recordAudit } from "@/lib/audit-server";
import { getSessionUser } from "@/lib/auth";
import { verifySecret } from "@/lib/crypto";
import { homeForRole, SIGN_IN_PATH } from "@/lib/routes";
import { RATE_LIMITS } from "@/lib/security";
import { startSession } from "@/lib/sessions";
import { safeNextPath } from "@/lib/site";
import { getStore } from "@/lib/store";
import { throttleCheck } from "@/lib/admin-lock";
import { endAllSessions, endSession } from "@/lib/sessions";
import type { ActionResult } from "./bookings";

/**
 * Auth actions. Google OAuth and email+password sign-in.
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
