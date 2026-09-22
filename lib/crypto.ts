import "server-only";
import { createCipheriv, createDecipheriv, randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { encryptionKeys, isProduction } from "./env";

/**
 * Encryption at rest for the few fields that are identity documents in
 * themselves: a guest's ID number and passport number, and a developer's TOTP
 * secret (Phase 8).
 *
 * AES-256-GCM with a random 12-byte IV per value, stored as
 * `enc:v<key version>:<iv>:<ciphertext>:<tag>` in base64url. The key version
 * is in the value, so a key can be rotated by adding the new one to
 * `ID_ENCRYPTION_KEY` and keeping the old in `ID_ENCRYPTION_KEYS_OLD` — values
 * written before the rotation still decrypt.
 *
 * **Without a key configured** (a developer's laptop) values are stored as
 * they are. Production refuses to start without one (`lib/env.ts`), so this
 * cannot be the live behaviour; it is what lets a fresh clone run, and what
 * makes rows written before Phase 8 readable.
 */

const PREFIX = "enc:";

export function encryptionConfigured(): boolean {
  return encryptionKeys().length > 0;
}

export function isEncrypted(value: string | null | undefined): boolean {
  return typeof value === "string" && value.startsWith(PREFIX);
}

export function encryptValue(plain: string | null | undefined): string | null {
  if (plain === null || plain === undefined || plain === "") return plain ?? null;
  if (isEncrypted(plain)) return plain;
  const keys = encryptionKeys();
  if (keys.length === 0) {
    if (isProduction()) throw new Error("ID_ENCRYPTION_KEY is not configured");
    return plain;
  }
  const { version, key } = keys[0];
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [PREFIX + `v${version}`, iv.toString("base64url"), enc.toString("base64url"), cipher.getAuthTag().toString("base64url")].join(":");
}

/** Decrypt, or return the value unchanged when it was never encrypted. */
export function decryptValue(stored: string | null | undefined): string | null {
  if (stored === null || stored === undefined) return null;
  if (!isEncrypted(stored)) return stored;
  const [, versionPart, ivPart, dataPart, tagPart] = stored.split(":");
  const version = Number(versionPart?.replace(/^v/, ""));
  const entry = encryptionKeys().find((k) => k.version === version);
  if (!entry || !ivPart || !dataPart || !tagPart) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", entry.key, Buffer.from(ivPart, "base64url"));
    decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(dataPart, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    // A value encrypted with a key this deployment no longer has. Better a
    // blank than a crash in the middle of a booking.
    console.error("[crypto] could not decrypt a stored value — is a key missing from ID_ENCRYPTION_KEYS_OLD?");
    return null;
  }
}

/** scrypt hash for a secret that is only ever compared (recovery codes). */
export function hashSecret(value: string): string {
  const salt = randomBytes(16);
  return `scrypt$${salt.toString("hex")}$${scryptSync(value, salt, 64).toString("hex")}`;
}

export function verifySecret(value: string, record: string): boolean {
  const [scheme, saltHex, hashHex] = record.split("$");
  if (scheme !== "scrypt" || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  try {
    const actual = scryptSync(value, Buffer.from(saltHex, "hex"), expected.length);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}
