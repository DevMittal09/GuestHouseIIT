import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { DataStore } from "@/lib/store/types";
import { useThrowawayMockDb } from "./helpers";
import { hashSecret, verifySecret } from "@/lib/crypto";
import { mockDirectoryPassword, SAMPLE_ACCOUNT } from "@/lib/ldap/mock-directory";
import { passwordLoginEnabled } from "@/lib/env";
import { RATE_LIMITS } from "@/lib/security";
import { signInRefusal } from "@/lib/user-groups";

/**
 * The email and password door (6 Nov 2026, migration 38).
 *
 * The door itself (`signInWithPassword`) sets a cookie and redirects, so what
 * is pinned here is everything it decides *with*: the hash format, the store's
 * answer, the refusals, and the fact that a `Profile` never carries a hash.
 * The 29 seeded accounts are checked against a real PostgreSQL in
 * `.memories/22-running-and-testing.md`.
 */

const SEEDED_RECORD =
  "scrypt$50b39605a7cf805e05861040a2d55022$faf84127769af359cbc7f17e610880e958f57e231085c8c3eb888316df00f550d3e8e6f11023e365c8a39cd43e48e99f1940df3b216160a7eb1674a38056739f";

describe("the password record", () => {
  it("accepts the office's published test password and nothing near it", () => {
    // The hash the office's backup carries, seeded unchanged by
    // supabase/seed-test-accounts.sql. If this fails, the 29 test accounts
    // have stopped signing in.
    expect(verifySecret("test@gh", SEEDED_RECORD)).toBe(true);
    for (const wrong of ["test@gh ", " test@gh", "Test@gh", "test@g", "", "password123"]) {
      expect(verifySecret(wrong, SEEDED_RECORD)).toBe(false);
    }
  });

  it("round-trips what hashSecret writes, and refuses a malformed record", () => {
    const record = hashSecret("a-long-enough-password");
    expect(record.startsWith("scrypt$")).toBe(true);
    expect(verifySecret("a-long-enough-password", record)).toBe(true);
    expect(verifySecret("something else", record)).toBe(false);
    // A null hash reaches `verifySecret` as "", never as a match.
    for (const junk of ["", "scrypt$", "scrypt$abc", "bcrypt$a$b", "not-a-record"]) {
      expect(verifySecret("test@gh", junk)).toBe(false);
    }
  });
});

describe("the mock store's password source", () => {
  it("is the published dummy directory, so there is no second list", () => {
    const password = mockDirectoryPassword("priya@iitpkd.ac.in");
    expect(password).toBe(SAMPLE_ACCOUNT.password);
    // What MockStore.getPasswordHash does with it.
    expect(verifySecret(password!, hashSecret(password!))).toBe(true);
  });

  it("matches the address case-insensitively and knows nobody else", () => {
    expect(mockDirectoryPassword("PRIYA@iitpkd.ac.in")).toBe(SAMPLE_ACCOUNT.password);
    expect(mockDirectoryPassword("  priya@iitpkd.ac.in  ")).toBe(SAMPLE_ACCOUNT.password);
    expect(mockDirectoryPassword("nobody@iitpkd.ac.in")).toBeNull();
  });
});

describe("what the door refuses after the password is proved", () => {
  const base = { email: "someone@iitpkd.ac.in", login_disabled_at: null, account_status: "active" as const };

  it("lets an active institute account through", () => {
    expect(signInRefusal(base)).toBeNull();
    expect(signInRefusal({ ...base, email: "s@smail.iitpkd.ac.in" })).toBeNull();
  });

  it("refuses an address off the institute's domains", () => {
    expect(signInRefusal({ ...base, email: "someone@gmail.com" })).not.toBeNull();
  });

  it("refuses a blocked account and one whose status has moved on", () => {
    expect(signInRefusal({ ...base, login_disabled_at: "2026-11-01T00:00:00.000Z" })).not.toBeNull();
    expect(signInRefusal({ ...base, account_status: "graduated" })).not.toBeNull();
  });
});

describe("the door's configuration", () => {
  it("is open unless PASSWORD_LOGIN says otherwise", () => {
    const before = process.env.PASSWORD_LOGIN;
    try {
      delete process.env.PASSWORD_LOGIN;
      expect(passwordLoginEnabled()).toBe(true);
      process.env.PASSWORD_LOGIN = "true";
      expect(passwordLoginEnabled()).toBe(true);
      process.env.PASSWORD_LOGIN = "false";
      expect(passwordLoginEnabled()).toBe(false);
    } finally {
      if (before === undefined) delete process.env.PASSWORD_LOGIN;
      else process.env.PASSWORD_LOGIN = before;
    }
  });

  it("is throttled per address, no looser than the LDAP door", () => {
    expect(RATE_LIMITS.passwordLogin.limit).toBeLessThanOrEqual(RATE_LIMITS.signIn.limit);
    expect(RATE_LIMITS.passwordLogin.windowSeconds).toBeGreaterThan(0);
  });
});


describe("which door an account belongs to", () => {
  /**
   * 6 Nov 2026, the owner: *"mock authentication should have the original
   * dummy accounts I created not the new ones. The new dummy accounts we can
   * login through login page."* The separator is whether a password is **set
   * on the account**, which is `password_hash` on PostgreSQL and, on the mock
   * store, nothing at all - its records come from the dummy directory, so all
   * nineteen personas stay in the picker. That is what these assertions pin:
   * the mock store must not start excluding its own personas.
   */
  let store: DataStore;
  let db: ReturnType<typeof useThrowawayMockDb>;

  beforeAll(async () => {
    db = useThrowawayMockDb();
    const { MockStore } = await import("@/lib/store/mock");
    store = new MockStore();
  });
  afterAll(() => db.cleanup());

  it("keeps every seeded persona in the picker, because none has a password set on it", async () => {
    const all = await store.listProfiles();
    const picker = await store.listProfilesWithoutPassword();
    expect(all.length).toBeGreaterThan(0);
    expect(picker.map((p) => p.id).sort()).toEqual(all.map((p) => p.id).sort());

    for (const p of all) {
      expect(await store.hasStoredPassword(p.email)).toBe(false);
    }
  });

  it("still lets those personas use the password door", async () => {
    // "No password set on the account" and "cannot sign in with a password"
    // are different claims, and only the first is true of the mock store.
    const record = await store.getPasswordHash("priya@iitpkd.ac.in");
    expect(record).not.toBeNull();
    expect(verifySecret("Priya@2026", record!)).toBe(true);
  });
});
