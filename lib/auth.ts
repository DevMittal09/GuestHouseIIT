import { cookies } from "next/headers";
import { cache } from "react";
import { getStore } from "@/lib/store";
import type { Profile } from "@/lib/types";

export const SESSION_COOKIE = "gh_mock_user";

/**
 * The session is a cookie holding a profile id. Two doors set it
 * (`app/actions/auth.ts`): LDAP sign-in, which checks the password against the
 * directory (`lib/ldap/`), and the mock Google door, which picks a persona.
 * The cookie itself is unsigned, so anyone can still claim any id — making it
 * a signed or server-side session is part of going to production. Everything
 * else consumes only `getCurrentUser()`.
 */
export const getCurrentUser = cache(async (): Promise<Profile | null> => {
  const cookieStore = await cookies();
  const userId = cookieStore.get(SESSION_COOKIE)?.value;
  if (!userId) return null;
  try {
    return await getStore().getProfile(userId);
  } catch {
    // A session cookie left over from the other backend does not merely miss,
    // it throws: mock profile ids are strings like "official-admin" and
    // Postgres rejects them as malformed uuids (22P02). Treating that as
    // signed-out keeps the login page reachable — otherwise the stale cookie
    // 500s every route including the one that would let you replace it.
    return null;
  }
});

export async function requireUser(): Promise<Profile> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");
  return user;
}
