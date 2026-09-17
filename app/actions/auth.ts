"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, verifyDemoPassword } from "@/lib/auth";
import { homeForRole } from "@/lib/routes";
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
 */
export async function signIn(email: string, password: string): Promise<ActionResult> {
  const address = email.trim().toLowerCase();
  if (!address) return { ok: false, error: "Enter your institute email address" };
  if (!password) return { ok: false, error: "Enter your password" };

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
  redirect(homeForRole(profile.role));
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
  redirect("/");
}
