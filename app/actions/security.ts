"use server";

import { revalidatePath } from "next/cache";
import { recordAudit } from "@/lib/audit-server";
import { getSessionUser, mfaRequiredFor, mfaState } from "@/lib/auth";
import { decryptValue, encryptValue, hashSecret, verifySecret } from "@/lib/crypto";
import { RATE_LIMITS } from "@/lib/security";
import { rotateSession, type Session } from "@/lib/sessions";
import { getStore } from "@/lib/store";
import {
  generateRecoveryCodes,
  generateTotpSecret,
  normaliseRecoveryCode,
  otpauthUri,
  verifyTotp,
} from "@/lib/totp";
import type { ActionResult } from "./bookings";

/**
 * The second factor (Phase 8): enrolment, verification, recovery codes, and
 * the list of a person's own sessions.
 *
 * Developers must enrol — theirs is the account that can change roles and
 * delete bookings. Verifying rotates the session's token, so a token captured
 * before the second factor was proved cannot be used after it.
 */

async function requireSession(): Promise<{ user: Awaited<ReturnType<typeof getSessionUser>> extends null ? never : NonNullable<Awaited<ReturnType<typeof getSessionUser>>>["user"]; session: Session }> {
  const current = await getSessionUser();
  if (!current) throw new Error("Sign in again");
  if (!current.session) throw new Error("Two-factor authentication needs a real session — sign in again");
  return { user: current.user, session: current.session };
}

async function throttleFactor(sessionId: string): Promise<boolean> {
  try {
    const result = await getStore().hitRateLimit(`2fa:${sessionId}`, RATE_LIMITS.twoFactor.limit, RATE_LIMITS.twoFactor.windowSeconds);
    return result.allowed;
  } catch {
    return true;
  }
}

/** Start enrolment: a fresh secret, stored encrypted and not yet confirmed. */
export async function beginMfaEnrolment(): Promise<
  { ok: true; secret: string; uri: string } | { ok: false; error: string }
> {
  try {
    const { user } = await requireSession();
    if (!mfaRequiredFor(user.role)) return { ok: false, error: "Only developer accounts use a second factor" };
    const existing = await getStore().getUserMfa(user.id);
    if (existing?.confirmed_at) return { ok: false, error: "Two-factor authentication is already set up" };
    const secret = generateTotpSecret();
    const now = new Date().toISOString();
    await getStore().saveUserMfa({
      user_id: user.id,
      secret_enc: encryptValue(secret)!,
      key_version: 1,
      recovery_codes: [],
      last_step: null,
      confirmed_at: null,
      created_at: existing?.created_at ?? now,
      updated_at: now,
    });
    return { ok: true, secret, uri: otpauthUri(secret, user.email) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not start enrolment" };
  }
}

/** Confirm enrolment with a code from the app; returns the recovery codes once. */
export async function confirmMfaEnrolment(code: string): Promise<
  { ok: true; recoveryCodes: string[] } | { ok: false; error: string }
> {
  try {
    const { user, session } = await requireSession();
    if (!(await throttleFactor(session.id))) return { ok: false, error: "Too many attempts — wait a few minutes" };
    const record = await getStore().getUserMfa(user.id);
    const secret = record ? decryptValue(record.secret_enc) : null;
    if (!record || !secret) return { ok: false, error: "Start the setup again" };
    const step = verifyTotp(secret, code, { lastStep: record.last_step });
    if (step === null) return { ok: false, error: "That code did not match — check the time on your phone and try again" };
    const plain = generateRecoveryCodes();
    await getStore().saveUserMfa({
      ...record,
      recovery_codes: plain.map((c) => hashSecret(normaliseRecoveryCode(c))),
      last_step: step,
      confirmed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    await rotateSession(session, { verified: true });
    await recordAudit(user, "twofa.enrolled", user.email, {});
    revalidatePath("/", "layout");
    return { ok: true, recoveryCodes: plain };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not confirm enrolment" };
  }
}

/**
 * Prove the second factor: at sign-in, and again before a dangerous action.
 * A recovery code works too, and is spent.
 */
export async function verifyMfa(code: string): Promise<ActionResult> {
  try {
    const { user, session } = await requireSession();
    if (!(await throttleFactor(session.id))) {
      await recordAudit(user, "twofa.failed", user.email, { reason: "throttled" });
      return { ok: false, error: "Too many attempts — wait a few minutes" };
    }
    const record = await getStore().getUserMfa(user.id);
    if (!record?.confirmed_at) return { ok: false, error: "Two-factor authentication is not set up" };
    const secret = decryptValue(record.secret_enc);
    const step = secret ? verifyTotp(secret, code, { lastStep: record.last_step }) : null;
    if (step !== null) {
      await getStore().saveUserMfa({ ...record, last_step: step, updated_at: new Date().toISOString() });
    } else {
      // A recovery code, used once and then gone.
      const cleaned = normaliseRecoveryCode(code);
      const match = record.recovery_codes.find((hash) => verifySecret(cleaned, hash));
      if (!match) {
        await recordAudit(user, "twofa.failed", user.email, {});
        return { ok: false, error: "That code did not match" };
      }
      await getStore().saveUserMfa({
        ...record,
        recovery_codes: record.recovery_codes.filter((h) => h !== match),
        updated_at: new Date().toISOString(),
      });
      await recordAudit(user, "twofa.verified", user.email, { recoveryCode: true, remaining: record.recovery_codes.length - 1 });
    }
    // Rotate: the session has just gained privilege.
    await rotateSession(session, { verified: true });
    if (step !== null) await recordAudit(user, "twofa.verified", user.email, {});
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not verify the code" };
  }
}

/** Turn the second factor off — only with a fresh code, and only for oneself. */
export async function disableMfa(code: string): Promise<ActionResult> {
  try {
    const { user, session } = await requireSession();
    const record = await getStore().getUserMfa(user.id);
    if (!record?.confirmed_at) return { ok: false, error: "Two-factor authentication is not set up" };
    if (!(await throttleFactor(session.id))) return { ok: false, error: "Too many attempts — wait a few minutes" };
    const secret = decryptValue(record.secret_enc);
    if (!secret || verifyTotp(secret, code, { lastStep: record.last_step }) === null) {
      return { ok: false, error: "That code did not match" };
    }
    await getStore().deleteUserMfa(user.id);
    await recordAudit(user, "twofa.reset", user.email, { by: "self" });
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not turn it off" };
  }
}

export type SessionSummary = {
  id: string;
  current: boolean;
  created_at: string;
  last_seen_at: string;
  absolute_expires_at: string;
  ip: string | null;
  user_agent: string | null;
};

/** This account's live sessions, newest first, with the current one marked. */
export async function listMySessions(): Promise<
  { ok: true; sessions: SessionSummary[]; mfa: Awaited<ReturnType<typeof mfaState>> } | { ok: false; error: string }
> {
  try {
    const current = await getSessionUser();
    if (!current) return { ok: false, error: "Sign in again" };
    const sessions = await getStore().listUserSessions(current.user.id);
    return {
      ok: true,
      mfa: await mfaState(),
      sessions: sessions.map((s) => ({
        id: s.id,
        current: s.id === current.session?.id,
        created_at: s.created_at,
        last_seen_at: s.last_seen_at,
        absolute_expires_at: s.absolute_expires_at,
        ip: s.ip,
        user_agent: s.user_agent,
      })),
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not read your sessions" };
  }
}

/** Reset a developer's second factor when they have lost it (developer only, audited). */
export async function resetMfaFor(userId: string): Promise<ActionResult> {
  try {
    const { user } = await requireSession();
    if (user.role !== "developer") return { ok: false, error: "Only a developer can reset a second factor" };
    const state = await mfaState();
    if (state.enrolled && !state.recent) {
      return { ok: false, error: "Confirm with your own authenticator code first" };
    }
    const target = await getStore().getProfile(userId);
    if (!target) return { ok: false, error: "Account not found" };
    await getStore().deleteUserMfa(userId);
    await getStore().revokeUserSessions(userId);
    await recordAudit(user, "twofa.reset", target.email, { by: "developer" });
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not reset it" };
  }
}
