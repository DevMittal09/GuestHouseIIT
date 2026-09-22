import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { cookies, headers } from "next/headers";
import { isProduction } from "./env";
import { getStore } from "./store";

/**
 * Server-side sessions (Phase 8).
 *
 * The cookie carries a 32-byte random token and nothing else — no user id, no
 * signature to forge. The row in `sessions` is the session: it can be expired,
 * revoked, or required to prove a second factor, and "sign out everywhere"
 * is one statement. Only the token's SHA-256 is stored, so a leaked database
 * dump cannot be replayed as a login.
 *
 * Lifetimes: **30 minutes idle**, pushed forward as the session is used, and
 * **12 hours absolute** from sign-in. The token is **rotated** when a session
 * gains privilege — at sign-in and when a second factor is proved — so a token
 * captured before either is worthless after it.
 */

export const IDLE_MINUTES = 30;
export const ABSOLUTE_HOURS = 12;
/** How recently a second factor must have been proved for a dangerous action. */
export const STEP_UP_MINUTES = 10;
/** Don't write `last_seen_at` on every request; once a minute is enough. */
const TOUCH_AFTER_MS = 60_000;

/**
 * `__Host-` in production: browsers only accept it over HTTPS, with no Domain
 * and Path=/, which makes it immune to a subdomain overwriting it. Plain
 * elsewhere, because the prefix requires Secure and dev is over http.
 */
export const SESSION_COOKIE = isProduction() ? "__Host-gh_session" : "gh_session";
/** The pre-Phase-8 cookie: a bare profile id. Only honoured when dev login is on. */
export const LEGACY_COOKIE = "gh_mock_user";

export type Session = {
  id: string;
  user_id: string;
  token_hash: string;
  created_at: string;
  last_seen_at: string;
  idle_expires_at: string;
  absolute_expires_at: string;
  revoked_at: string | null;
  verified_at: string | null;
  rotated_from: string | null;
  ip: string | null;
  user_agent: string | null;
};

export type NewSessionInput = Omit<Session, "id" | "created_at" | "last_seen_at">;

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function sameToken(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Whether this session may still be used at `now`. */
export function sessionLive(session: Session, now = new Date()): boolean {
  const at = now.getTime();
  return (
    session.revoked_at === null &&
    Date.parse(session.idle_expires_at) > at &&
    Date.parse(session.absolute_expires_at) > at
  );
}

/** Whether a second factor was proved recently enough for a dangerous action. */
export function steppedUp(session: Session, now = new Date()): boolean {
  return (
    session.verified_at !== null &&
    now.getTime() - Date.parse(session.verified_at) < STEP_UP_MINUTES * 60_000
  );
}

async function requestOrigin(): Promise<{ ip: string | null; userAgent: string | null }> {
  try {
    const h = await headers();
    const forwarded = h.get("x-forwarded-for");
    return {
      ip: forwarded ? forwarded.split(",")[0].trim() : (h.get("x-real-ip") ?? null),
      userAgent: h.get("user-agent")?.slice(0, 300) ?? null,
    };
  } catch {
    return { ip: null, userAgent: null };
  }
}

function cookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    // `__Host-` requires Secure; localhost is a secure context, so this is
    // also fine for `next start` on a developer's machine.
    secure: isProduction(),
    path: "/",
    maxAge: maxAgeSeconds,
  };
}

/** Start a session for a user who has just proved who they are. */
export async function startSession(
  userId: string,
  { verified = false, rotatedFrom = null }: { verified?: boolean; rotatedFrom?: string | null } = {}
): Promise<Session> {
  const now = new Date();
  const token = randomBytes(32).toString("base64url");
  const { ip, userAgent } = await requestOrigin();
  const session = await getStore().createSession({
    user_id: userId,
    token_hash: hashToken(token),
    idle_expires_at: new Date(now.getTime() + IDLE_MINUTES * 60_000).toISOString(),
    absolute_expires_at: new Date(now.getTime() + ABSOLUTE_HOURS * 3_600_000).toISOString(),
    revoked_at: null,
    verified_at: verified ? now.toISOString() : null,
    rotated_from: rotatedFrom,
    ip,
    user_agent: userAgent,
  });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, cookieOptions(ABSOLUTE_HOURS * 3600));
  // A stale dev cookie would otherwise shadow the real session.
  jar.delete(LEGACY_COOKIE);
  return session;
}

/** The live session for this request, or null. Also pushes the idle timeout forward. */
export async function currentSession(): Promise<Session | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const store = getStore();
  let session: Session | null;
  try {
    session = await store.getSessionByToken(hashToken(token));
  } catch {
    // The sessions table is not there yet (migration 21 not applied).
    return null;
  }
  if (!session) return null;
  const now = new Date();
  if (!sessionLive(session, now)) return null;
  if (now.getTime() - Date.parse(session.last_seen_at) > TOUCH_AFTER_MS) {
    const idle = new Date(now.getTime() + IDLE_MINUTES * 60_000).toISOString();
    await store.touchSession(session.id, now.toISOString(), idle).catch(() => {});
    return { ...session, last_seen_at: now.toISOString(), idle_expires_at: idle };
  }
  return session;
}

/**
 * Give the session a new token, keeping its absolute expiry: used when it
 * gains privilege. The old row is revoked, so a copied token stops working.
 */
export async function rotateSession(session: Session, { verified = false } = {}): Promise<Session> {
  const store = getStore();
  const token = randomBytes(32).toString("base64url");
  const now = new Date();
  const next = await store.createSession({
    user_id: session.user_id,
    token_hash: hashToken(token),
    idle_expires_at: new Date(now.getTime() + IDLE_MINUTES * 60_000).toISOString(),
    absolute_expires_at: session.absolute_expires_at,
    revoked_at: null,
    verified_at: verified ? now.toISOString() : session.verified_at,
    rotated_from: session.id,
    ip: session.ip,
    user_agent: session.user_agent,
  });
  await store.revokeSession(session.id);
  const jar = await cookies();
  const remaining = Math.max(60, Math.floor((Date.parse(session.absolute_expires_at) - now.getTime()) / 1000));
  jar.set(SESSION_COOKIE, token, cookieOptions(remaining));
  return next;
}

export async function endSession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    try {
      const session = await getStore().getSessionByToken(hashToken(token));
      if (session) await getStore().revokeSession(session.id);
    } catch {
      // Nothing to revoke — the cookie goes either way.
    }
  }
  jar.delete(SESSION_COOKIE);
  jar.delete(LEGACY_COOKIE);
}

/** Sign out everywhere: every session of this user, including this one. */
export async function endAllSessions(userId: string): Promise<number> {
  const count = await getStore().revokeUserSessions(userId);
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  jar.delete(LEGACY_COOKIE);
  return count;
}
