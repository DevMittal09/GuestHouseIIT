"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, verifyDemoPassword } from "@/lib/auth";
import { homeForRole, SIGN_IN_PATH } from "@/lib/routes";
import { INSTITUTE_EMAIL_ERROR, isInstituteEmail, safeNextPath } from "@/lib/site";
import { getStore } from "@/lib/store";
import type { ActionResult } from "./bookings";

async function startSession(userId: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, userId, { httpOnly: true, sameSite: "lax", path: "/" });
}

/**
 * Credential sign-in — the form the institute sees. Identity is still the
 * persona cookie underneath; the only thing checked is that the address belongs
 * to a profile and that the shared demo password was typed. Replace this and
 * `loginAs` together when real authentication lands.
 *
 * Only institute addresses (`@iitpkd.ac.in` and its subdomains, e.g. students'
 * `@smail.iitpkd.ac.in`) may sign in — the form checks too, but this is the
 * rule. `next` is where the page wanted to go ("Book a room" sends `/book`);
 * anything that is not a same-origin path is ignored, and a role that cannot
 * use the destination is bounced to its own home by that page's guard.
 */
export async function signIn(
  email: string,
  password: string,
  next?: string | null
): Promise<ActionResult> {
  const address = email.trim().toLowerCase();
  if (!address) return { ok: false, error: "Enter your institute email address" };
  if (!password) return { ok: false, error: "Enter your password" };
  // Safe to say before the account lookup: it describes the domain, not
  // whether this particular address is registered.
  if (!isInstituteEmail(address)) return { ok: false, error: INSTITUTE_EMAIL_ERROR };

  // Matching in memory rather than adding a `getProfileByEmail` keeps this off
  // the `DataStore` interface, which would otherwise need implementing twice.
  const profiles = await getStore().listProfiles();
  const profile = profiles.find((p) => p.email.toLowerCase() === address);

  // One message for both failures on purpose: a distinct "no such account"
  // tells an unauthenticated visitor which addresses are registered.
  if (!profile || !verifyDemoPassword(password)) {
    return { ok: false, error: "Incorrect email address or password" };
  }

  await startSession(profile.id);
  // Outside any try/catch — `redirect()` signals by throwing.
  redirect(safeNextPath(next) ?? homeForRole(profile.role));
}

/** Mock sign-in: pick a seeded persona. Replace with real SSO in production. */
export async function loginAs(userId: string): Promise<void> {
  const profile = await getStore().getProfile(userId);
  if (!profile) throw new Error("Unknown user");
  await startSession(userId);
  redirect(homeForRole(profile.role));
}

export async function logout(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
  // Straight back to a sign-in form: "Switch user" is the common reason.
  redirect(SIGN_IN_PATH);
}
