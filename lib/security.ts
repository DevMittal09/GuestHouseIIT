/**
 * Shapes the security layer stores (Phase 8): the second factor, throttles
 * and DPDP requests. Kept out of `lib/sessions.ts` and `lib/crypto.ts` so the
 * stores — and the browser bundle of a page that only shows a status — do not
 * pull in `server-only` code.
 */

export type UserMfa = {
  user_id: string;
  /** The TOTP secret, encrypted (`lib/crypto.ts`). Never sent to a browser. */
  secret_enc: string;
  key_version: number;
  /** scrypt hashes of the unused recovery codes. */
  recovery_codes: string[];
  /** The last accepted 30-second step, so a code cannot be used twice. */
  last_step: number | null;
  confirmed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type RateLimitResult = {
  allowed: boolean;
  attempts: number;
  /** Seconds until the window resets — the `Retry-After` of a 429. */
  retryAfter: number;
};

export type PrivacyRequest = {
  id: string;
  user_id: string;
  kind: "export" | "deletion";
  status: "open" | "done" | "refused";
  note: string | null;
  response: string | null;
  created_at: string;
  handled_at: string | null;
  handled_by: string | null;
};

export type NewPrivacyRequest = { user_id: string; kind: PrivacyRequest["kind"]; note: string | null };

/** The privacy notice a booking consented to. Bump when the notice changes. */
export const PRIVACY_NOTICE_VERSION = "2026-09-22";

/**
 * The throttles, in one place so the numbers can be read at a glance. Counted
 * per key in the database (migration 21), so they survive a restart.
 */
export const RATE_LIMITS = {
  /** Per LDAP username. The directory's own lockout is the real defence. */
  signIn: { limit: 8, windowSeconds: 15 * 60 },
  /** Per developer-console password, per browser. */
  consoleUnlock: { limit: 6, windowSeconds: 15 * 60 },
  /** Per session, for the second factor. */
  twoFactor: { limit: 10, windowSeconds: 10 * 60 },
  /** Per user, for anything that renders a PDF. */
  documents: { limit: 60, windowSeconds: 5 * 60 },
  /** Per IP, for the OAuth start — it costs a round trip to Google. */
  oauth: { limit: 20, windowSeconds: 10 * 60 },
} as const;

/** "1234 5678 9012" → "•••• •••• 9012": what the desk sees unless it asks. */
export function maskIdNumber(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (trimmed.length <= 4) return "••••";
  return `•••• ${trimmed.slice(-4)}`;
}
