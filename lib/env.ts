import { z } from "zod";

/**
 * The environment, checked once at startup (Phase 8).
 *
 * A production deployment that is missing a secret, or that has the developer
 * sign-in switch on, must **refuse to start** rather than run in a state
 * nobody intended. `instrumentation.ts` calls `assertEnv()` when the server
 * boots; the individual readers here are what the rest of the code uses, so
 * there is one place that says what each variable is for.
 *
 * Nothing in this file is ever logged or returned to a browser: the keys
 * themselves stay in `process.env`.
 */

const url = z.string().url();

/** Whether the developer sign-in doors (`/mock-login`, `loginAs`) exist at all. */
export function devLoginEnabled(): boolean {
  return process.env.NODE_ENV !== "production" && process.env.DEV_LOGIN === "true";
}

/**
 * Whether the **mock authentication** door (`/mock-login`, `loginAs`) is open.
 *
 * Google sign-in is not built yet, so the button on the sign-in card has to
 * lead somewhere: while `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` /
 * `APP_URL` are not all set, it opens the persona picker instead. Configure
 * Google and the door closes on its own — there is no flag to remember to
 * unset, which is the failure mode a `DEV_LOGIN`-style switch has.
 *
 * `MOCK_LOGIN=false` closes it early, for a deployment that wants LDAP only.
 *
 * > This is a placeholder, not authentication: anyone who can reach the page
 * > can become any account on it. It must not be open on a deployment holding
 * > real bookings — see `.memories/08-roadmap.md` item 1.
 */
export function mockLoginEnabled(): boolean {
  if (process.env.MOCK_LOGIN === "false") return false;
  return devLoginEnabled() || googleOauth() === null;
}

export function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

/** The site's own origin, used for OAuth redirects and server-action origins. */
export function appUrl(): string | null {
  const raw = process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? null;
  if (!raw) return null;
  return url.safeParse(raw).success ? raw.replace(/\/$/, "") : null;
}

export function googleOauth(): { clientId: string; clientSecret: string; redirectUri: string } | null {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const base = appUrl();
  if (!clientId || !clientSecret || !base) return null;
  return { clientId, clientSecret, redirectUri: `${base}/api/auth/google/callback` };
}

/** Keys for encrypting ID numbers and TOTP secrets, newest first (`v2:base64,v1:base64`). */
export function encryptionKeys(env: NodeJS.ProcessEnv = process.env): { version: number; key: Buffer }[] {
  const raw = [env.ID_ENCRYPTION_KEY, env.ID_ENCRYPTION_KEYS_OLD]
    .filter(Boolean)
    .join(",");
  const keys: { version: number; key: Buffer }[] = [];
  for (const part of raw.split(",").map((p) => p.trim()).filter(Boolean)) {
    const m = /^(?:v(\d+):)?(.+)$/.exec(part);
    if (!m) continue;
    const key = Buffer.from(m[2], "base64");
    if (key.length !== 32) continue;
    keys.push({ version: m[1] ? Number(m[1]) : 1, key });
  }
  return keys.sort((a, b) => b.version - a.version);
}

const REQUIRED_IN_PRODUCTION = [
  ["NEXT_PUBLIC_SUPABASE_URL", "the hosted database the portal runs on"],
  ["SUPABASE_SERVICE_ROLE_KEY", "the server's database key"],
  ["APP_URL", "the site's own URL, for sign-in redirects and server-action origins"],
  ["CRON_SECRET", "so the daily jobs cannot be triggered by anyone"],
  ["ID_ENCRYPTION_KEY", "to encrypt guests' ID numbers at rest (32 bytes, base64)"],
] as const;

export type EnvProblem = { variable: string; problem: string };

/** Everything wrong with the environment for this NODE_ENV, in order. */
export function envProblems(env: NodeJS.ProcessEnv = process.env): EnvProblem[] {
  const problems: EnvProblem[] = [];
  const production = env.NODE_ENV === "production";

  if (production && env.DEV_LOGIN === "true") {
    problems.push({
      variable: "DEV_LOGIN",
      problem: "the developer sign-in doors must never be enabled in production — unset it",
    });
  }
  if (production) {
    const allowMock = env.ALLOW_MOCK_STORE === "true";
    for (const [name, why] of REQUIRED_IN_PRODUCTION) {
      if (allowMock && (name === "NEXT_PUBLIC_SUPABASE_URL" || name === "SUPABASE_SERVICE_ROLE_KEY")) continue;
      if (!env[name]) problems.push({ variable: name, problem: `is required in production — ${why}` });
    }
    if (env.APP_URL && !url.safeParse(env.APP_URL).success) {
      problems.push({ variable: "APP_URL", problem: "is not a URL (e.g. https://guesthouse.iitpkd.ac.in)" });
    }
    if (env.ID_ENCRYPTION_KEY && encryptionKeys(env).length === 0) {
      problems.push({ variable: "ID_ENCRYPTION_KEY", problem: "must be 32 bytes, base64 encoded (openssl rand -base64 32)" });
    }
    if (env.CRON_SECRET && env.CRON_SECRET.length < 16) {
      problems.push({ variable: "CRON_SECRET", problem: "is too short to be a secret — use at least 16 characters" });
    }
  }
  if (env.GOOGLE_CLIENT_ID && !env.GOOGLE_CLIENT_SECRET) {
    problems.push({ variable: "GOOGLE_CLIENT_SECRET", problem: "is needed alongside GOOGLE_CLIENT_ID" });
  }
  return problems;
}

/**
 * Called from `instrumentation.ts`. In production a problem is fatal; in
 * development it is a warning, so a fresh clone still runs with no setup.
 */
export function assertEnv(): void {
  const problems = envProblems();
  if (problems.length === 0) return;
  const lines = problems.map((p) => `  - ${p.variable} ${p.problem}`).join("\n");
  if (isProduction()) {
    throw new Error(`Refusing to start: the environment is not fit for production.\n${lines}`);
  }
  console.warn(`[env] not production-ready yet:\n${lines}`);
}
