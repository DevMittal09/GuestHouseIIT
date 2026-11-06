"use server";

import { signInRefusal } from "@/lib/user-groups";
import { redirect } from "next/navigation";
import { recordAudit } from "@/lib/audit-server";
import { getSessionUser } from "@/lib/auth";
import { mockLoginEnabled, passwordLoginEnabled } from "@/lib/env";
import { randomBytes } from "crypto";
import { hashSecret, verifySecret } from "@/lib/crypto";
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
 * The sign-in doors. Each one ends in `startSession()` - a row in `sessions`
 * and an opaque cookie (`lib/sessions.ts`) - so there is a single definition
 * of what being signed in means, and a single place to revoke it.
 */

/**
 * Attempts are counted in the database (migration 21), so a restart does not
 * clear the counter and every instance shares it. Failures are recorded in the
 * security audit log; the message never says whether the username exists.
 */
async function throttle(
  key: string,
  { limit, windowSeconds }: { limit: number; windowSeconds: number } = RATE_LIMITS.signIn
): Promise<{ allowed: boolean; retryAfter: number }> {
  try {
    const result = await getStore().hitRateLimit(key, limit, windowSeconds);
    return { allowed: result.allowed, retryAfter: result.retryAfter };
  } catch {
    // The table is not there yet (migration 21). Better to allow the sign-in
    // than to lock the office out of its own portal.
    return { allowed: true, retryAfter: 0 };
  }
}

/**
 * What `useActionState` holds between submissions. On success the action
 * redirects instead of returning, exactly as the other two doors do, so `ok`
 * is only ever read as "no error yet".
 */
export type SignInResult = { ok: boolean; error?: string | null };

/**
 * A record to compare against when there is no account, so that a wrong
 * address and a wrong password take the same time to answer. Without it the
 * missing-account path returns before scrypt runs, and the difference is a
 * usable oracle for which addresses are registered - the thing the single
 * error message exists to hide. Built once per process from random bytes: it
 * is a decoy, so nothing may ever match it.
 */
let decoyRecord: string | null = null;
function decoy(): string {
  if (!decoyRecord) decoyRecord = hashSecret(randomBytes(32).toString("hex"));
  return decoyRecord;
}

/**
 * **Email and password** - the primary door since 6 Nov 2026, at the owner's
 * request, while the roles and workflows are being tested. Google OpenID
 * Connect is unchanged and is still the intended method; `PASSWORD_LOGIN=false`
 * closes this one (`passwordLoginEnabled()`).
 *
 * The password is checked against `profiles.password_hash` (migration 38) with
 * `verifySecret` - scrypt, the salt read out of the stored record, compared
 * with `timingSafeEqual`. Nothing here trusts the browser for anything but the
 * two strings typed: the role, the hostel and every permission come from the
 * profile the database returns, and the session is the same `sessions` row
 * `startSession()` writes for every other door.
 *
 * Four refusals, one message. "Incorrect email or password" is returned for an
 * unknown address, an account with no password set, and a wrong password
 * alike, so the form cannot be used to find out who has an account. A blocked
 * or non-active account gets `signInRefusal`'s own wording, which the person
 * needs in order to know who to ask - and which is only reachable after the
 * password has been proved.
 *
 * The session is created **unverified**: a password is not a second factor, so
 * a developer still meets `stepUpProblem()` at the console.
 */
export async function signInWithPassword(
  _prev: SignInResult,
  formData: FormData
): Promise<SignInResult> {
  if (!passwordLoginEnabled()) return { ok: false, error: "Password sign-in is not available" };

  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = safeNextPath(formData.get("next") as string | null);

  if (!email) return { ok: false, error: "Enter your email address" };
  if (!password) return { ok: false, error: "Enter your password" };

  const gate = await throttle(`signin:password:${email.toLowerCase()}`, RATE_LIMITS.passwordLogin);
  if (!gate.allowed) {
    await recordAudit(null, "signin.failure", email, { method: "password", reason: "throttled" });
    return { ok: false, error: `Too many attempts - try again in ${gate.retryAfter}s` };
  }

  const store = getStore();
  const profile = await store.getProfileByEmail(email);
  const record = profile ? await store.getPasswordHash(profile.email) : null;

  // Always run the comparison, even with nothing to compare against - see
  // `decoy()`. `verifySecret` is what decides; the `profile &&` is what stops
  // a decoy match (impossible) from signing anyone in.
  const correct = verifySecret(password, record ?? decoy());
  if (!profile || !record || !correct) {
    await recordAudit(profile ?? null, "signin.failure", email, {
      method: "password",
      reason: !profile ? "no account" : !record ? "no password set" : "wrong password",
    });
    return { ok: false, error: "Incorrect email or password" };
  }

  const refusal = signInRefusal(profile);
  if (refusal) {
    await recordAudit(profile, "signin.failure", profile.email, { method: "password", reason: refusal });
    return { ok: false, error: refusal };
  }

  await startSession(profile.id);
  await recordAudit(profile, "signin.success", profile.email, { method: "password" });
  // Outside any try/catch - `redirect()` signals by throwing.
  redirect(next ?? homeForRole(profile.role));
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
    return { ok: false, error: `Too many attempts - try again in ${gate.retryAfter}s` };
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

  const refusal = signInRefusal(profile);
  if (refusal) {
    await recordAudit(profile, "signin.failure", profile.email, { method: "ldap", reason: refusal });
    return { ok: false, error: refusal };
  }

  await startSession(profile.id);
  await recordAudit(profile, "signin.success", profile.email, { method: "ldap" });
  // Outside any try/catch - `redirect()` signals by throwing.
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
  // **An account with a password is not a picker account** (6 Nov 2026). The
  // page already leaves it out of the list, and that is never the boundary:
  // the picker signs anyone in with no secret at all, so an account that has
  // a real credential must not be reachable through it by a crafted request.
  if (await getStore().hasStoredPassword(profile.email)) {
    throw new Error("This account signs in with its email and password");
  }
  const refusal = signInRefusal(profile);
  if (refusal) throw new Error(refusal);
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

/** Sign out of every browser - the answer to a laptop left in a lab. */
export async function logoutEverywhere(): Promise<ActionResult & { sessions?: number }> {
  const current = await getSessionUser();
  if (!current) return { ok: false, error: "You are not signed in" };
  const count = await endAllSessions(current.user.id);
  await recordAudit(current.user, "signout.everywhere", current.user.email, { sessions: count });
  return { ok: true, sessions: count };
}
