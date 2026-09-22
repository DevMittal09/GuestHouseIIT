import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { envProblems } from "@/lib/env";
import { sessionLive, steppedUp, hashToken, type Session } from "@/lib/sessions";
import {
  base32Decode,
  base32Encode,
  generateRecoveryCodes,
  generateTotpSecret,
  otpauthUri,
  stepFor,
  totpCode,
  verifyTotp,
} from "@/lib/totp";
import { maskIdNumber } from "@/lib/security";
import type { DataStore } from "@/lib/store/types";
import { useThrowawayMockDb } from "./helpers";

/** The security layer (Phase 8): sessions, the second factor, env and throttles. */

describe("TOTP", () => {
  const secret = "JBSWY3DPEHPK3PXP"; // RFC-style test secret

  it("round-trips base32 and produces six digits", () => {
    expect(base32Encode(base32Decode(secret))).toBe(secret);
    const code = totpCode(secret, 1);
    expect(code).toMatch(/^\d{6}$/);
    expect(totpCode(secret, 1)).toBe(code);
    expect(totpCode(secret, 2)).not.toBe(code);
  });

  it("accepts the current code and one step of drift, and refuses a replay", () => {
    const at = new Date("2026-09-22T10:00:00.000Z");
    const step = stepFor(at);
    expect(verifyTotp(secret, totpCode(secret, step), { at })).toBe(step);
    expect(verifyTotp(secret, totpCode(secret, step - 1), { at })).toBe(step - 1);
    expect(verifyTotp(secret, totpCode(secret, step + 1), { at })).toBe(step + 1);
    expect(verifyTotp(secret, totpCode(secret, step - 3), { at })).toBeNull();
    // A code already used is refused, even inside its 30 seconds.
    expect(verifyTotp(secret, totpCode(secret, step), { at, lastStep: step })).toBeNull();
    expect(verifyTotp(secret, "000000", { at })).toBeNull();
    expect(verifyTotp(secret, "12345", { at })).toBeNull();
  });

  it("makes a secret and an otpauth URI an app can read", () => {
    const fresh = generateTotpSecret();
    expect(fresh).toMatch(/^[A-Z2-7]+$/);
    const uri = otpauthUri(fresh, "dev@iitpkd.ac.in");
    expect(uri).toContain("otpauth://totp/");
    expect(uri).toContain(`secret=${fresh}`);
    expect(uri).toContain("digits=6");
    const codes = generateRecoveryCodes();
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
  });
});

describe("session rules", () => {
  const base = (patch: Partial<Session> = {}): Session => ({
    id: "s1",
    user_id: "u1",
    token_hash: "h",
    created_at: "2026-09-22T09:00:00.000Z",
    last_seen_at: "2026-09-22T09:50:00.000Z",
    idle_expires_at: "2026-09-22T10:20:00.000Z",
    absolute_expires_at: "2026-09-22T21:00:00.000Z",
    revoked_at: null,
    verified_at: null,
    rotated_from: null,
    ip: null,
    user_agent: null,
    ...patch,
  });

  it("dies on idle, on the absolute limit, or when revoked", () => {
    const now = new Date("2026-09-22T10:00:00.000Z");
    expect(sessionLive(base(), now)).toBe(true);
    expect(sessionLive(base({ idle_expires_at: "2026-09-22T09:59:00.000Z" }), now)).toBe(false);
    expect(sessionLive(base({ absolute_expires_at: "2026-09-22T09:59:00.000Z" }), now)).toBe(false);
    expect(sessionLive(base({ revoked_at: "2026-09-22T09:30:00.000Z" }), now)).toBe(false);
  });

  it("counts a second factor as recent for ten minutes", () => {
    const now = new Date("2026-09-22T10:00:00.000Z");
    expect(steppedUp(base(), now)).toBe(false);
    expect(steppedUp(base({ verified_at: "2026-09-22T09:55:00.000Z" }), now)).toBe(true);
    expect(steppedUp(base({ verified_at: "2026-09-22T09:45:00.000Z" }), now)).toBe(false);
  });

  it("stores only the token's hash", () => {
    const hash = hashToken("a-token");
    expect(hash).toHaveLength(64);
    expect(hash).not.toContain("a-token");
    expect(hashToken("a-token")).toBe(hash);
  });
});

describe("the environment gate", () => {
  const base = { NODE_ENV: "production", APP_URL: "https://gh.iitpkd.ac.in", CRON_SECRET: "0123456789abcdef", NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "k", ID_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64") } as NodeJS.ProcessEnv;

  it("passes a complete production environment", () => {
    expect(envProblems(base)).toEqual([]);
  });

  it("refuses production without the secrets, and with the developer door open", () => {
    const names = envProblems({ NODE_ENV: "production" } as NodeJS.ProcessEnv).map((p) => p.variable);
    expect(names).toContain("NEXT_PUBLIC_SUPABASE_URL");
    expect(names).toContain("CRON_SECRET");
    expect(names).toContain("ID_ENCRYPTION_KEY");
    expect(envProblems({ ...base, DEV_LOGIN: "true" })[0].variable).toBe("DEV_LOGIN");
    expect(envProblems({ ...base, CRON_SECRET: "short" })[0].variable).toBe("CRON_SECRET");
    expect(envProblems({ ...base, ID_ENCRYPTION_KEY: "not-a-key" })[0].variable).toBe("ID_ENCRYPTION_KEY");
  });

  it("says nothing in development", () => {
    expect(envProblems({ NODE_ENV: "development", DEV_LOGIN: "true" } as NodeJS.ProcessEnv)).toEqual([]);
  });
});

describe("encryption at rest", () => {
  const KEY = Buffer.alloc(32, 3).toString("base64");
  const OLD = Buffer.alloc(32, 9).toString("base64");
  afterEach(() => {
    delete process.env.ID_ENCRYPTION_KEY;
    delete process.env.ID_ENCRYPTION_KEYS_OLD;
  });

  it("round-trips a value and hides the original", async () => {
    process.env.ID_ENCRYPTION_KEY = `v2:${KEY}`;
    const { encryptValue, decryptValue, isEncrypted } = await import("@/lib/crypto");
    const stored = encryptValue("1234 5678 9012")!;
    expect(isEncrypted(stored)).toBe(true);
    expect(stored).not.toContain("5678");
    expect(stored.startsWith("enc:v2:")).toBe(true);
    expect(decryptValue(stored)).toBe("1234 5678 9012");
    // Two encryptions of the same value differ (random IV).
    expect(encryptValue("1234 5678 9012")).not.toBe(stored);
  });

  it("reads values written with an older key, and passes plain values through", async () => {
    process.env.ID_ENCRYPTION_KEY = `v1:${OLD}`;
    const first = await import("@/lib/crypto");
    const old = first.encryptValue("AB1234567")!;
    process.env.ID_ENCRYPTION_KEY = `v2:${KEY}`;
    process.env.ID_ENCRYPTION_KEYS_OLD = `v1:${OLD}`;
    expect(first.decryptValue(old)).toBe("AB1234567");
    expect(first.decryptValue("plain-old-value")).toBe("plain-old-value");
  });

  it("masks an ID number to its last four", () => {
    expect(maskIdNumber("123456789012")).toBe("•••• 9012");
    expect(maskIdNumber("999")).toBe("••••");
    expect(maskIdNumber(null)).toBeNull();
  });
});

// ------------------------------------------------------------------ the store

let store: DataStore;
let db: ReturnType<typeof useThrowawayMockDb>;
beforeAll(async () => {
  db = useThrowawayMockDb();
  store = new (await import("@/lib/store/mock")).MockStore();
  await store.listProfiles();
});
afterAll(() => db.cleanup());

describe("sessions and throttles in the store", () => {
  const future = (mins: number) => new Date(Date.now() + mins * 60_000).toISOString();

  it("creates, finds, touches, verifies and revokes", async () => {
    const session = await store.createSession({
      user_id: "gh-manager",
      token_hash: hashToken("tok-1"),
      idle_expires_at: future(30),
      absolute_expires_at: future(720),
      revoked_at: null,
      verified_at: null,
      rotated_from: null,
      ip: "127.0.0.1",
      user_agent: "test",
    });
    expect((await store.getSessionByToken(hashToken("tok-1")))?.id).toBe(session.id);
    expect(await store.getSessionByToken(hashToken("wrong"))).toBeNull();
    await store.touchSession(session.id, new Date().toISOString(), future(30));
    await store.markSessionVerified(session.id, new Date().toISOString());
    expect((await store.getSessionByToken(hashToken("tok-1")))?.verified_at).toBeTruthy();
    expect(await store.listUserSessions("gh-manager")).toHaveLength(1);
    await store.revokeSession(session.id);
    expect((await store.getSessionByToken(hashToken("tok-1")))?.revoked_at).toBeTruthy();
    expect(await store.listUserSessions("gh-manager")).toHaveLength(0);
  });

  it("signs out everywhere", async () => {
    for (const token of ["a", "b", "c"]) {
      await store.createSession({
        user_id: "employee-priya",
        token_hash: hashToken(token),
        idle_expires_at: future(30),
        absolute_expires_at: future(720),
        revoked_at: null,
        verified_at: null,
        rotated_from: null,
        ip: null,
        user_agent: null,
      });
    }
    expect(await store.revokeUserSessions("employee-priya")).toBe(3);
    expect(await store.listUserSessions("employee-priya")).toHaveLength(0);
    expect(await store.revokeUserSessions("employee-priya")).toBe(0);
  });

  it("counts attempts per key and resets after the window", async () => {
    const key = `test:${Math.random()}`;
    expect(await store.hitRateLimit(key, 2, 60)).toMatchObject({ allowed: true, attempts: 1 });
    expect(await store.hitRateLimit(key, 2, 60)).toMatchObject({ allowed: true, attempts: 2 });
    const third = await store.hitRateLimit(key, 2, 60);
    expect(third.allowed).toBe(false);
    expect(third.retryAfter).toBeGreaterThan(0);
    // A different key is counted separately.
    expect((await store.hitRateLimit(`${key}-other`, 2, 60)).allowed).toBe(true);
    // Once the window has passed, the count starts again.
    expect((await store.hitRateLimit(key, 2, 0)).attempts).toBe(1);
  });

  it("keeps a second factor's secret and spends recovery codes", async () => {
    await store.saveUserMfa({
      user_id: "developer",
      secret_enc: "enc:v1:abc",
      key_version: 1,
      recovery_codes: ["scrypt$aa$bb"],
      last_step: null,
      confirmed_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    const stored = await store.getUserMfa("developer");
    expect(stored?.recovery_codes).toHaveLength(1);
    await store.saveUserMfa({ ...stored!, recovery_codes: [], last_step: 42 });
    expect((await store.getUserMfa("developer"))?.last_step).toBe(42);
    await store.deleteUserMfa("developer");
    expect(await store.getUserMfa("developer")).toBeNull();
  });
});
