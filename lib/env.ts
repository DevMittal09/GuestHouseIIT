import { z } from "zod";

const url = z.string().url();

export function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

/**
 * Whether the account picker at `/mock-login` is open.
 *
 * **Mock Authentication** is how the portal is tested: one click per demo
 * account, grouped by the workflow each one demonstrates, with no password
 * anywhere. The institute's real door is Google, and this is not
 * authentication - anyone who reaches the page can become any account - so
 * *where* it is open is the whole rule:
 *
 * - **Outside production it is always open**, Google configured or not. A
 *   developer who has just set a client id must not lose the one-click way
 *   of becoming each persona, and the Playwright suite signs in through it.
 * - **In production it exists only while Google is unconfigured**, because
 *   the sign-in button has to lead somewhere. Configuring Google closes it.
 * - `MOCK_LOGIN=false` closes it outright, anywhere.
 *
 * `MOCK_LOGIN=true` is deliberately **not** the switch: a flag that forces
 * the picker open is the one that gets copied into production and forgotten.
 * Setting it there is a startup error instead (`envProblems`).
 */
export function mockLoginEnabled(): boolean {
  if (process.env.MOCK_LOGIN === "false") return false;
  if (process.env.NODE_ENV !== "production") return true;
  return googleOauth() === null;
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
  ["DATABASE_URL", "the PostgreSQL connection string the portal runs on"],
  ["APP_URL", "the site's own URL, for sign-in redirects and server-action origins"],
  ["CRON_SECRET", "so the daily jobs cannot be triggered by anyone"],
  ["ID_ENCRYPTION_KEY", "to encrypt guests' ID numbers at rest (32 bytes, base64)"],
  ["GOOGLE_CLIENT_ID", "for Google sign-in - the only authentication method in production"],
  ["GOOGLE_CLIENT_SECRET", "for Google sign-in - the only authentication method in production"],
] as const;

export type EnvProblem = { variable: string; problem: string };

/** Everything wrong with the environment for this NODE_ENV, in order. */
export function envProblems(env: NodeJS.ProcessEnv = process.env): EnvProblem[] {
  const problems: EnvProblem[] = [];
  const production = env.NODE_ENV === "production";

  if (production) {
    /**
     * `ALLOW_MOCK_STORE=true` says this is a **production build that is not a
     * production deployment** - the Playwright suite, which serves a real
     * build off `.e2e-db.json`. It has always exempted `DATABASE_URL`, and
     * since 9 Nov 2026 it exempts **Google** for the same reason and with
     * more force.
     *
     * Requiring Google here was making the e2e suite set
     * `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` to inert placeholders just
     * to get the server up - and configuring Google **closes
     * `/mock-login`** and turns the sign-in button into a real link to
     * `accounts.google.com`. `AGENTS.md` says in so many words: *don't set
     * these in CI*. Three journeys failed on exactly that, one of them by
     * navigating out to Google's own error page.
     *
     * A real deployment never sets `ALLOW_MOCK_STORE` (`setup.md`,
     * [05-credentials-and-security.md] - "never"), so nothing about the
     * production gate is weakened: there, Google is still required.
     */
    const allowMock = env.ALLOW_MOCK_STORE === "true";
    const EXEMPT_UNDER_MOCK_STORE = ["DATABASE_URL", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"];
    for (const [name, why] of REQUIRED_IN_PRODUCTION) {
      if (allowMock && EXEMPT_UNDER_MOCK_STORE.includes(name)) continue;
      if (!env[name]) problems.push({ variable: name, problem: `is required in production - ${why}` });
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
  // `mockLoginEnabled()` answers "not in production" before it reads this, so
  // the variable does nothing there - but a deployment that sets it clearly
  // *means* to open the account picker, and anyone who reaches `/mock-login`
  // can become any account. Refuse to start rather than ignore the intent.
  if (production && env.MOCK_LOGIN === "true") {
    problems.push({
      variable: "MOCK_LOGIN",
      problem: "must never be forced on in production - the account picker is not authentication",
    });
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
