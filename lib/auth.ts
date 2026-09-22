import { cookies } from "next/headers";
import { cache } from "react";
import { devLoginEnabled } from "@/lib/env";
import { currentSession, steppedUp, LEGACY_COOKIE, type Session } from "@/lib/sessions";
import { getStore } from "@/lib/store";
import type { Profile } from "@/lib/types";

/**
 * Who is making this request.
 *
 * The session is a row in `sessions` and the cookie is an opaque token
 * (`lib/sessions.ts`); this module stays the **only** reader of it, so every
 * page and action asks the same question in the same way. Nothing else in the
 * codebase touches the cookie.
 *
 * `gh_mock_user` — the old "cookie holding a profile id" — is honoured only
 * when the developer sign-in doors are switched on (`DEV_LOGIN=true`, never in
 * production). That is what lets a developer switch persona in one click; in
 * production the branch does not exist.
 */

export type SessionUser = {
  user: Profile;
  /** Null for a developer-impersonated session (dev only). */
  session: Session | null;
};

export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const session = await currentSession();
  if (session) {
    const user = await profileOrNull(session.user_id);
    return user ? { user, session } : null;
  }
  if (devLoginEnabled()) {
    const jar = await cookies();
    const id = jar.get(LEGACY_COOKIE)?.value;
    if (id) {
      const user = await profileOrNull(id);
      if (user) return { user, session: null };
    }
  }
  return null;
});

async function profileOrNull(id: string): Promise<Profile | null> {
  try {
    return await getStore().getProfile(id);
  } catch {
    // A session cookie left over from the other backend does not merely miss,
    // it throws: mock profile ids are strings like "official-admin" and
    // Postgres rejects them as malformed uuids (22P02). Treating that as
    // signed-out keeps the sign-in page reachable.
    return null;
  }
}

export const getCurrentUser = cache(async (): Promise<Profile | null> => {
  return (await getSessionUser())?.user ?? null;
});

export async function requireUser(): Promise<Profile> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");
  return user;
}

// ------------------------------------------------------------ second factor

/** Whether this account must prove a second factor: developers, once enrolled. */
export function mfaRequiredFor(role: Profile["role"]): boolean {
  return role === "developer";
}

export type MfaState = {
  required: boolean;
  enrolled: boolean;
  /** This session has proved the second factor at some point. */
  verified: boolean;
  /** …and recently enough for a dangerous action (`STEP_UP_MINUTES`). */
  recent: boolean;
};

export const mfaState = cache(async (): Promise<MfaState> => {
  const current = await getSessionUser();
  if (!current) return { required: false, enrolled: false, verified: false, recent: false };
  const required = mfaRequiredFor(current.user.role);
  let enrolled = false;
  try {
    enrolled = Boolean((await getStore().getUserMfa(current.user.id))?.confirmed_at);
  } catch {
    // Migration 21 not applied yet: nobody is enrolled.
  }
  const verified = current.session?.verified_at !== null && current.session?.verified_at !== undefined;
  return { required, enrolled, verified, recent: current.session ? steppedUp(current.session) : false };
});

/**
 * Why this request may not perform a dangerous action — changing roles or
 * settings, deleting things — or null when it may.
 *
 * A developer must have proved their second factor in the last ten minutes.
 * Everyone else is already behind the console password; this is the seam where
 * a second factor would be demanded of them too.
 */
export async function stepUpProblem(): Promise<string | null> {
  const current = await getSessionUser();
  if (!current) return "Sign in again";
  if (!mfaRequiredFor(current.user.role)) return null;
  if (!current.session) return null; // developer sign-in (dev only) has no session to step up
  const state = await mfaState();
  if (!state.enrolled) return "Set up two-factor authentication first — Console → Security.";
  if (!state.recent) return "Enter your authenticator code to confirm this change (Console → Security).";
  return null;
}
