import { createHmac, randomBytes, timingSafeEqual } from "crypto";

/**
 * Time-based one-time passwords (RFC 6238), for the developer's second factor
 * (Phase 8). Six digits, 30-second steps, SHA-1 — what Google Authenticator,
 * Aegis and the rest implement.
 *
 * Written out rather than added as a dependency: it is thirty lines of HMAC,
 * and an authentication dependency is a supply-chain risk in itself.
 */

const DIGITS = 6;
export const STEP_SECONDS = 30;
/** How many steps either side are accepted, for clock drift. */
const WINDOW = 1;

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function generateTotpSecret(bytes = 20): string {
  return base32Encode(randomBytes(bytes));
}

export function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(secret: string): Buffer {
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of secret.replace(/[\s=]/g, "").toUpperCase()) {
    const index = ALPHABET.indexOf(char);
    if (index === -1) continue;
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export function stepFor(at: Date | number = new Date()): number {
  const ms = typeof at === "number" ? at : at.getTime();
  return Math.floor(ms / 1000 / STEP_SECONDS);
}

export function totpCode(secret: string, step: number): string {
  const key = base32Decode(secret);
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const digest = createHmac("sha1", key).update(counter).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);
  return String(binary % 10 ** DIGITS).padStart(DIGITS, "0");
}

/**
 * The step a code is valid for, or null. `lastStep` refuses a code that has
 * already been used — otherwise a code shoulder-surfed inside its 30 seconds
 * could be replayed.
 */
export function verifyTotp(
  secret: string,
  code: string,
  { at = new Date(), lastStep = null }: { at?: Date; lastStep?: number | null } = {}
): number | null {
  const cleaned = code.replace(/\D/g, "");
  if (cleaned.length !== DIGITS) return null;
  const now = stepFor(at);
  for (let offset = -WINDOW; offset <= WINDOW; offset++) {
    const step = now + offset;
    if (lastStep !== null && step <= lastStep) continue;
    const expected = Buffer.from(totpCode(secret, step));
    const actual = Buffer.from(cleaned);
    if (expected.length === actual.length && timingSafeEqual(expected, actual)) return step;
  }
  return null;
}

/** The `otpauth://` URI an authenticator app scans or accepts pasted. */
export function otpauthUri(secret: string, account: string, issuer = "IIT Palakkad Guest House"): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({ secret, issuer, algorithm: "SHA1", digits: String(DIGITS), period: String(STEP_SECONDS) });
  return `otpauth://totp/${label}?${params.toString()}`;
}

/** Ten one-time codes, shown once at enrolment and stored only as hashes. */
export function generateRecoveryCodes(count = 10): string[] {
  return Array.from({ length: count }, () => {
    const raw = randomBytes(5).toString("hex").toUpperCase();
    return `${raw.slice(0, 5)}-${raw.slice(5)}`;
  });
}

export function normaliseRecoveryCode(code: string): string {
  return code.replace(/[^0-9A-Za-z]/g, "").toUpperCase();
}
