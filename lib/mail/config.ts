import { timingSafeEqual } from "crypto";

/**
 * Mail configuration, read from the environment.
 *
 * Read lazily through `mailConfig()` rather than at module load, for the same
 * reason `lib/store/index.ts` picks its backend inside a function: the build
 * must not bake in whatever happened to be set on the machine that ran it.
 */

export type MailTransportKind = "smtp" | "file" | "dry-run";

export interface MailConfig {
  transport: MailTransportKind;
  /** Envelope/From address, e.g. `IIT Palakkad Guest House <guesthouse@iitpkd.ac.in>`. */
  from: string;
  /** Where replies should land — a human, never a no-reply address. */
  replyTo: string;
  host: string;
  port: number;
  /** Implicit TLS (465) rather than STARTTLS (587). */
  secure: boolean;
  user: string | null;
  pass: string | null;
  /**
   * When set, **every** message is delivered here instead of its real
   * recipients, who are recorded in an `X-Original-To` header and a banner at
   * the top of the body.
   *
   * This is not a nicety. Without it, one person pointing a staging server at
   * real data mails a real parent. The current deployment sets it to the same
   * mailbox it sends from, so the whole notification flow can be watched in one
   * inbox.
   */
  redirectAllTo: string | null;
  /** Absolute origin for links in mail bodies — relative URLs are useless there. */
  baseUrl: string;
  /** Right-hand side of generated Message-IDs; also what threads a booking's mail. */
  messageIdDomain: string;
}

const DEFAULT_FROM_NAME = "IIT Palakkad Guest House";
const DEFAULT_HOST = "smtp.gmail.com";
const DEFAULT_PORT = 465;
const DEFAULT_BASE_URL = "http://localhost:3000";
const DEFAULT_MESSAGE_ID_DOMAIN = "guesthouse.iitpkd.ac.in";

function env(name: string): string | null {
  const value = process.env[name];
  if (value === undefined) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function truthy(value: string | null): boolean {
  return value !== null && ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

/** `Name <address>`, quoting the display name only when it needs it. */
function addressWithName(address: string, name: string): string {
  return /[",:;<>@]/.test(name) ? `"${name.replace(/"/g, '\\"')}" <${address}>` : `${name} <${address}>`;
}

export function mailConfig(): MailConfig {
  const user = env("MAIL_USER");
  // Google shows an app password as four groups of four ("abcd efgh ijkl
  // mnop") and people paste it that way. The spaces are presentation, not
  // part of the secret, so strip them — but only for the app-password
  // variable: a generic SMTP password may legitimately contain a space.
  const appPassword = env("MAIL_APP_PASSWORD")?.replace(/\s+/g, "") ?? null;
  const pass = appPassword ?? env("MAIL_PASSWORD");
  const fromAddress = env("MAIL_FROM") ?? user;
  const fromName = env("MAIL_FROM_NAME") ?? DEFAULT_FROM_NAME;

  // Dry run wins over real credentials on purpose: it is the switch you reach
  // for when you are about to do something you are not sure about.
  const transport: MailTransportKind = truthy(env("MAIL_DRY_RUN"))
    ? "dry-run"
    : user && pass
      ? "smtp"
      : "file";

  const port = Number(env("MAIL_PORT") ?? DEFAULT_PORT);

  return {
    transport,
    from: fromAddress ? addressWithName(fromAddress, fromName) : `${DEFAULT_FROM_NAME} <no-reply@localhost>`,
    replyTo: env("MAIL_REPLY_TO") ?? fromAddress ?? "no-reply@localhost",
    host: env("MAIL_HOST") ?? DEFAULT_HOST,
    port: Number.isFinite(port) ? port : DEFAULT_PORT,
    // 465 is implicit TLS; 587 upgrades with STARTTLS. Overridable because the
    // institute relay may want either.
    secure: env("MAIL_SECURE") ? truthy(env("MAIL_SECURE")) : port === 465,
    user,
    pass,
    redirectAllTo: env("MAIL_REDIRECT_ALL_TO"),
    baseUrl: (env("APP_BASE_URL") ?? env("NEXT_PUBLIC_APP_URL") ?? DEFAULT_BASE_URL).replace(/\/+$/, ""),
    messageIdDomain: env("MAIL_MESSAGE_ID_DOMAIN") ?? DEFAULT_MESSAGE_ID_DOMAIN,
  };
}

/** An absolute URL into the portal, for a link in a mail body. */
export function portalUrl(path: string): string {
  const { baseUrl } = mailConfig();
  return `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
}

/**
 * Whether a caller may trigger the mail worker or the daily cron.
 *
 * `CRON_SECRET` is required in production — these routes send mail to real
 * people, so they cannot be open. With no secret set they are allowed only
 * outside production, which keeps `npm run dev` usable without ceremony.
 */
export function cronAuthorized(request: Request): { ok: true } | { ok: false; reason: string } {
  const secret = env("CRON_SECRET");
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      return { ok: false, reason: "CRON_SECRET is not set on this deployment" };
    }
    return { ok: true };
  }
  const header = request.headers.get("authorization");
  const presented = header?.startsWith("Bearer ")
    ? header.slice("Bearer ".length).trim()
    : new URL(request.url).searchParams.get("key");
  if (!presented || !sameSecret(presented, secret)) {
    return { ok: false, reason: "Bad or missing CRON_SECRET" };
  }
  return { ok: true };
}

function sameSecret(presented: string, expected: string): boolean {
  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
