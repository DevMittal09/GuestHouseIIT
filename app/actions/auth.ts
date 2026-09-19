"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { clearAttempts, recordFailedAttempt, throttleCheck } from "@/lib/admin-lock";
import { SESSION_COOKIE } from "@/lib/auth";
import { directoryUsesEmailUsernames, getDirectory, type DirectoryEntry } from "@/lib/ldap";
import { profileForDirectoryEntry } from "@/lib/ldap/link";
import { isValidLdapUid, normalizeLdapUid } from "@/lib/ldap/uid";
import { homeForRole, SIGN_IN_PATH } from "@/lib/routes";
import { safeNextPath } from "@/lib/site";
import { getStore } from "@/lib/store";
import type { ActionResult } from "./bookings";

async function startSession(userId: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, userId, { httpOnly: true, sameSite: "lax", path: "/" });
}

/**
 * LDAP sign-in — the form the institute sees on `/sign-in`, `/book-room` and
 * `/book-meal`. Two separate questions, answered by two separate systems:
 *
 * 1. Is this the password for this LDAP username? The directory
 *    (`getDirectory()`: the institute server when `LDAP_URL` is set, the dummy
 *    accounts in `lib/ldap/mock-directory.ts` otherwise).
 * 2. Which portal account is this person? `profiles.ldap_uid`. The directory
 *    knows nothing about roles, hostels or clubs, so a valid LDAP login with
 *    no profile gets in nowhere.
 *
 * `next` is where the page wanted to go ("Book a room" sends `/book`); anything
 * that is not a same-origin path is ignored, and a role that cannot use the
 * destination is bounced to its own home by that page's guard.
 */
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

  // Per username, so guessing one person's password is slow. Shares the
  // console lock's in-process counter under its own key prefix; the directory
  // server's own lockout policy is the real defence.
  const throttleKey = `ldap:${uid}`;
  const gate = throttleCheck(throttleKey);
  if (!gate.allowed) {
    return { ok: false, error: `Too many attempts — try again in ${gate.retryInSeconds}s` };
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
    recordFailedAttempt(throttleKey);
    return { ok: false, error: "Incorrect username or password" };
  }
  clearAttempts(throttleKey);

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
  // Outside any try/catch — `redirect()` signals by throwing.
  redirect(safeNextPath(next) ?? homeForRole(profile.role));
}

/**
 * The "Sign in with Google" door, mocked: `/mock-login` lists the portal's
 * accounts and this signs in as the one picked. Real Google OAuth replaces the
 * page and this action together — it would match the verified Google address
 * against `profiles.email`, accepting only `@iitpkd.ac.in` and its subdomains
 * (`isInstituteEmail`). Until then it is also the one-click persona switcher
 * development relies on.
 */
export async function loginAs(userId: string, next?: string | null): Promise<void> {
  const profile = await getStore().getProfile(userId);
  if (!profile) throw new Error("Unknown user");
  await startSession(userId);
  redirect(safeNextPath(next) ?? homeForRole(profile.role));
}

export async function logout(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
  // Straight back to a sign-in form: "Switch user" is the common reason.
  redirect(SIGN_IN_PATH);
}
