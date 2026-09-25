import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { getStore } from "@/lib/store";
import { RATE_LIMITS } from "@/lib/security";

/**
 * A password gate in front of the developer console.
 *
 * **What this is and is not.** Identity in this app is still a persona cookie
 * (`lib/auth.ts`), so anyone can already claim to be the developer. This gate
 * stops casual poking at `/admin` during a demo — nothing more. It is enforced
 * in `requireDeveloper()`, so it guards the *actions*, not just the UI, which
 * is what makes it worth having at all. It is not a substitute for real
 * authentication; see .memories/04-roadmap.md item 1.
 */

const SETTING_KEY = "admin_console_password";
export const ADMIN_UNLOCK_COOKIE = "gh_admin_unlock";

/** Used until a developer sets one. Deliberately trivial and flagged in the UI. */
export const DEFAULT_ADMIN_PASSWORD = "0000";

/** How long one unlock lasts before the password is asked for again. */
const UNLOCK_TTL_MS = 8 * 60 * 60 * 1000;

const MIN_PASSWORD_LENGTH = 4;
const MAX_PASSWORD_LENGTH = 128;

// ---------------------------------------------------------------- hashing

/** `scrypt$<saltHex>$<hashHex>` — no dependency, and slow enough to matter. */
export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

function verifyAgainstRecord(password: string, record: string): boolean {
  const [scheme, saltHex, hashHex] = record.split("$");
  if (scheme !== "scrypt" || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  let actual: Buffer;
  try {
    actual = scryptSync(password, Buffer.from(saltHex, "hex"), expected.length);
  } catch {
    return false;
  }
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

// ---------------------------------------------------------------- state

/**
 * The stored hash, or null when the developer has never set one — in which
 * case the password is `DEFAULT_ADMIN_PASSWORD`.
 *
 * A missing `app_settings` table (migration 5 not applied yet) is treated as
 * "no password set" rather than allowed to throw: the console then falls back
 * to the default and stays locked, instead of 500ing the one page that would
 * let a developer fix it. Saving a new password will surface the real error.
 */
async function storedRecord(): Promise<string | null> {
  try {
    return await getStore().getSetting(SETTING_KEY);
  } catch (e) {
    console.error(
      "admin-lock: could not read the console password — falling back to the default. " +
        "Has supabase/migrations/00000000000005_app_settings.sql been applied?",
      e
    );
    return null;
  }
}

/** True while the console is still on the shipped default password. */
export async function isDefaultAdminPassword(): Promise<boolean> {
  return (await storedRecord()) === null;
}

export function validatePasswordChoice(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Use at least ${MIN_PASSWORD_LENGTH} characters`;
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    return `Use at most ${MAX_PASSWORD_LENGTH} characters`;
  }
  return null;
}

export async function checkAdminPassword(password: string): Promise<boolean> {
  const record = await storedRecord();
  if (record === null) {
    // No record yet: compare against the default in constant time.
    const a = Buffer.from(password);
    const b = Buffer.from(DEFAULT_ADMIN_PASSWORD);
    return a.length === b.length && timingSafeEqual(a, b);
  }
  return verifyAgainstRecord(password, record);
}

export async function setAdminPassword(password: string): Promise<void> {
  await getStore().setSetting(SETTING_KEY, hashPassword(password));
}

// ---------------------------------------------------------------- unlock token

/**
 * The signing key is the stored password record itself, so **changing the
 * password invalidates every outstanding unlock cookie** without needing
 * anywhere to track them.
 */
async function signingKey(): Promise<string> {
  return (await storedRecord()) ?? `default:${DEFAULT_ADMIN_PASSWORD}`;
}

function sign(key: string, payload: string): string {
  return createHmac("sha256", key).update(payload).digest("hex");
}

async function mintToken(): Promise<{ value: string; maxAgeSeconds: number }> {
  const expiresAt = Date.now() + UNLOCK_TTL_MS;
  const payload = String(expiresAt);
  return {
    value: `${payload}.${sign(await signingKey(), payload)}`,
    maxAgeSeconds: Math.floor(UNLOCK_TTL_MS / 1000),
  };
}

async function tokenIsValid(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return false;

  const expiresAt = Number(payload);
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return false;

  const expected = Buffer.from(sign(await signingKey(), payload), "hex");
  const actual = Buffer.from(signature, "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/** Whether this request carries a valid, unexpired unlock. */
export async function isAdminUnlocked(): Promise<boolean> {
  const jar = await cookies();
  return tokenIsValid(jar.get(ADMIN_UNLOCK_COOKIE)?.value);
}

export async function grantAdminUnlock(): Promise<void> {
  const { value, maxAgeSeconds } = await mintToken();
  const jar = await cookies();
  jar.set(ADMIN_UNLOCK_COOKIE, value, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: maxAgeSeconds,
    secure: process.env.NODE_ENV === "production",
  });
}

export async function revokeAdminUnlock(): Promise<void> {
  const jar = await cookies();
  jar.delete(ADMIN_UNLOCK_COOKIE);
}

// ---------------------------------------------------------------- throttling

/**
 * Attempt throttle, counted in the database (migration 21) so it survives a
 * restart and is shared by every instance — the in-process map this replaced
 * reset itself whenever the server did.
 *
 * Keys are the caller's choice: the console lock counts per profile
 * ("console:<id>"), sign-in per username (`app/actions/auth.ts`).
 */
export async function throttleCheck(
  who: string,
  limit = RATE_LIMITS.consoleUnlock.limit,
  windowSeconds = RATE_LIMITS.consoleUnlock.windowSeconds
): Promise<{ allowed: boolean; retryInSeconds: number }> {
  try {
    const result = await getStore().hitRateLimit(who, limit, windowSeconds);
    return { allowed: result.allowed, retryInSeconds: result.retryAfter };
  } catch {
    // Migration 21 not applied: do not lock the office out of its own console.
    return { allowed: true, retryInSeconds: 0 };
  }
}
