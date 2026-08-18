"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE } from "@/lib/auth";
import { homeForRole } from "@/lib/routes";
import { getStore } from "@/lib/store";

/** Mock sign-in: pick a seeded persona. Replace with real SSO in production. */
export async function loginAs(userId: string): Promise<void> {
  const profile = await getStore().getProfile(userId);
  if (!profile) throw new Error("Unknown user");
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, userId, { httpOnly: true, sameSite: "lax", path: "/" });
  redirect(homeForRole(profile.role));
}

export async function logout(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
  redirect("/");
}
