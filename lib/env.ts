import { z } from "zod";

const url = z.string().url();

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

/** Whether the developer sign-in doors (`/mock-login`, `loginAs`) exist at all. */
export function devLoginEnabled(): boolean {
  return process.env.NODE_ENV !== "production" && process.env.DEV_LOGIN === "true";
}

/**
 * Whether the **mock authentication** door (`/mock-login`, `loginAs`) is open.
 *
 * Google sign-in is built (`lib/oidc.ts` and `app/api/auth/google/*`) but may
 * not be configured, so the button on the sign-in card has to lead somewhere:
 * while `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `APP_URL` are not all
 * set, it opens the persona picker instead. Configure Google and the door
 * closes on its own - there is no flag to remember to unset, which is the
 * failure mode a `DEV_LOGIN`-style switch has. `GOOGLE-SIGN-IN.md` is the
 * setup.
 *
 * `MOCK_LOGIN=false` closes it early, for a deployment that wants LDAP only.
 *
 * > This is a placeholder, not authentication: anyone who can reach the page
 * > can become any account on it. It must not be open on a deployment holding
 * > real bookings - see `.memories/03-roadmap.md` item 1.
 */
export function mockLoginEnabled(): boolean {
  if (process.env.MOCK_LOGIN === "false") return false;
  // **Outside production the picker is always there**, Google configured or
  // not (6 Nov 2026, the owner: "add mock authentication along with google
  // oauth in the sign in page for now"). Configuring Google used to close it,
  // which meant a developer who had just set the client id lost the one-click
  // way of becoming each of the nineteen demo personas - and the Playwright
  // suite signs in through it.
  if (process.env.NODE_ENV !== "production") return true;
  // In production it exists only while Google is unconfigured, exactly as
  // before: the button has to lead somewhere, and there is no flag to
  // remember to unset, which is the failure mode a `DEV_LOGIN`-style switch
  // has. Closing it is `MOCK_LOGIN=false`, or configuring Google.
  return googleOauth() === null;
}

export function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

/**
 * A production build **with real backing services behind it**.
 *
 * `NODE_ENV === "production"` alone is not that: the Playwright suite and CI
 * run a production build on the JSON mock store, with no database, no bucket
 * and no Google client, which is what `ALLOW_MOCK_STORE=true` declares. Guards
 * that exist to protect real data - the factory-password refusal in
 * `requireConsole`, and `REQUIRED_SERVICES_IN_PRODUCTION` below - ask this
 * question rather than `isProduction()`, so a test server is not held to
 * promises about data it does not have.
 *
 * Everything that is not about data still asks `isProduction()`: the
 * `DEV_LOGIN` and `MOCK_LOGIN` bans, `APP_URL`, `CRON_SECRET` and the
 * encryption key are required of a test server too, because none of them is a
 * secret somebody has to hold.
 */
export function isRealDeployment(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NODE_ENV === "production" && env.ALLOW_MOCK_STORE !== "true";
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
  ["APP_URL", "the site's own URL, for sign-in redirects and server-action origins"],
  ["CRON_SECRET", "so the daily jobs cannot be triggered by anyone"],
  ["ID_ENCRYPTION_KEY", "to encrypt guests' ID numbers at rest (32 bytes, base64)"],
] as const;

/**
 * The backing services a real deployment has and a test server does not: the
 * database, the bucket the ID documents go in, and the identity provider.
 *
 * `ALLOW_MOCK_STORE=true` exempts **all** of these together, because a server
 * running on the JSON mock store has none of them by definition - it is the
 * Playwright suite and CI, where the whole point is that no secret is needed.
 * It used to exempt `DATABASE_URL` alone, which is why the 55 end-to-end
 * journeys stopped being runnable the day Google was made a production
 * requirement: `next start` refused to boot and the only symptom was
 * Playwright timing out waiting for its own web server.
 *
 * Everything in `REQUIRED_IN_PRODUCTION` above is still required of a test
 * server, because none of it is a secret somebody has to hold - and the
 * `DEV_LOGIN` and `MOCK_LOGIN` bans below are not exempted either.
 */
const REQUIRED_SERVICES_IN_PRODUCTION = [
  ["DATABASE_URL", "the PostgreSQL connection string the portal runs on"],
  ["SUPABASE_URL", "the project whose Storage bucket holds ID documents"],
  ["SUPABASE_SERVICE_ROLE_KEY", "the server-side key for the documents bucket"],
  ["GOOGLE_CLIENT_ID", "for Google sign-in - the only authentication method in production"],
  ["GOOGLE_CLIENT_SECRET", "for Google sign-in - the only authentication method in production"],
] as const;

export type EnvProblem = { variable: string; problem: string };

/** Everything wrong with the environment for this NODE_ENV, in order. */
export function envProblems(env: NodeJS.ProcessEnv = process.env): EnvProblem[] {
  const problems: EnvProblem[] = [];
  const production = env.NODE_ENV === "production";

  if (production && env.DEV_LOGIN === "true") {
    problems.push({
      variable: "DEV_LOGIN",
      problem: "the developer sign-in doors must never be enabled in production - unset it",
    });
  }
  if (production) {
    for (const [name, why] of REQUIRED_IN_PRODUCTION) {
      if (!env[name]) problems.push({ variable: name, problem: `is required in production - ${why}` });
    }
    if (isRealDeployment(env)) {
      for (const [name, why] of REQUIRED_SERVICES_IN_PRODUCTION) {
        // `SUPABASE_URL` is also accepted under its older public name, which
        // the deployments that predate `lib/storage/` already set.
        const value = name === "SUPABASE_URL" ? (env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL) : env[name];
        if (!value) problems.push({ variable: name, problem: `is required in production - ${why}` });
      }
    }
    if (env.APP_URL && !url.safeParse(env.APP_URL).success) {
      problems.push({ variable: "APP_URL", problem: "is not a URL (e.g. https://guesthouse.iitpkd.ac.in)" });
    }
    if (env.ID_ENCRYPTION_KEY && encryptionKeys(env).length === 0) {
      problems.push({ variable: "ID_ENCRYPTION_KEY", problem: "must be 32 bytes, base64 encoded (openssl rand -base64 32)" });
    }
    if (env.CRON_SECRET && env.CRON_SECRET.length < 16) {
      problems.push({ variable: "CRON_SECRET", problem: "is too short to be a secret - use at least 16 characters" });
    }
  }
  if (env.GOOGLE_CLIENT_ID && !env.GOOGLE_CLIENT_SECRET) {
    problems.push({ variable: "GOOGLE_CLIENT_SECRET", problem: "is needed alongside GOOGLE_CLIENT_ID" });
  }
  if (production) {
    // `mockLoginEnabled()` is open whenever Google is unconfigured, and anyone
    // who can reach `/mock-login` can become any account on it. Google being
    // required above closes it; this catches the deployment that sets
    // MOCK_LOGIN=true by hand to get round that.
    if (env.MOCK_LOGIN === "true") {
      problems.push({
        variable: "MOCK_LOGIN",
        problem: "must never be forced on in production - the account picker is not authentication",
      });
    }
    if (env.DATABASE_URL && !/sslmode=/.test(env.DATABASE_URL) && env.DATABASE_SSL !== "true") {
      problems.push({
        variable: "DATABASE_URL",
        problem: "must connect over TLS - add ?sslmode=require (or set DATABASE_SSL=true)",
      });
    }
  }
  return problems;
}

export function assertEnv(): void {
  const problems = envProblems();
  if (problems.length === 0) return;
  const lines = problems.map((p) => `  - ${p.variable} ${p.problem}`).join("\n");
  if (isProduction()) {
    throw new Error(`Refusing to start: the environment is not fit for production.\n${lines}`);
  }
  console.warn(`[env] not production-ready yet:\n${lines}`);
}
