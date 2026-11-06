import { describe, expect, it } from "vitest";
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
