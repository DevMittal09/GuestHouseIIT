import { cookies } from "next/headers";
import { cache } from "react";
import { getStore } from "@/lib/store";
import type { Profile } from "@/lib/types";

export const SESSION_COOKIE = "gh_mock_user";

/**
 * Mock authentication: the "session" is a cookie holding a seeded profile id.
 * Swap this module for a Supabase Auth (or LDAP/SSO) lookup in production —
 * everything else consumes only `getCurrentUser()`.
 */
export const getCurrentUser = cache(async (): Promise<Profile | null> => {
  const cookieStore = await cookies();
  const userId = cookieStore.get(SESSION_COOKIE)?.value;
  if (!userId) return null;
  return getStore().getProfile(userId);
});

export async function requireUser(): Promise<Profile> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");
  return user;
}
