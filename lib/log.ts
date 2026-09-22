/**
 * Structured, redacted logging (Phase 8).
 *
 * Server logs end up in a hosting provider's console, which is not a place for
 * a guest's Aadhaar number or a session token. Everything logged through here
 * is JSON — greppable, and parsed by whatever collects it — and passes through
 * `redact()` first: email addresses keep their shape but lose the name, long
 * digit strings become their last four, and anything that looks like a secret
 * is replaced outright.
 *
 * When `SENTRY_DSN` is set, errors are also posted to Sentry (the envelope
 * endpoint, no SDK). Without it, nothing leaves the machine.
 */

const SECRET_KEYS = /(password|secret|token|key|authorization|cookie|otp|code)/i;

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return "…";
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return redactString(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => redact(v, depth + 1));
  if (value instanceof Error) return { name: value.name, message: redactString(value.message) };
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      out[key] = SECRET_KEYS.test(key) ? "[redacted]" : redact(v, depth + 1);
    }
    return out;
  }
  return String(value);
}

function redactString(text: string): string {
  return text
    // a.person@iitpkd.ac.in → a***@iitpkd.ac.in
    .replace(/([\w.+-])[\w.+-]*@([\w.-]+)/g, "$1***@$2")
    // Aadhaar, phone numbers, long ids → last four only
    .replace(/\b\d{6,}\b/g, (m) => `••••${m.slice(-4)}`)
    // Bearer tokens and the like
    .replace(/\b[A-Za-z0-9_-]{32,}\b/g, "[redacted]");
}

type Level = "info" | "warn" | "error";

function emit(level: Level, event: string, data: Record<string, unknown>): void {
  const line = JSON.stringify({ at: new Date().toISOString(), level, event, ...(redact(data) as object) });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const log = {
  info: (event: string, data: Record<string, unknown> = {}) => emit("info", event, data),
  warn: (event: string, data: Record<string, unknown> = {}) => emit("warn", event, data),
  error: (event: string, data: Record<string, unknown> = {}) => emit("error", event, data),
};

/**
 * Report an error: to the log always, and to Sentry when a DSN is configured.
 * Never throws — a failed report must not become the failure.
 */
export async function reportError(error: unknown, context: Record<string, unknown> = {}): Promise<void> {
  log.error("exception", { ...context, error });
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;
  try {
    // dsn: https://<key>@<host>/<project>
    const parsed = new URL(dsn);
    const projectId = parsed.pathname.replace(/^\//, "");
    const endpoint = `${parsed.protocol}//${parsed.host}/api/${projectId}/envelope/`;
    const event = {
      event_id: crypto.randomUUID().replace(/-/g, ""),
      timestamp: new Date().toISOString(),
      platform: "node",
      environment: process.env.NODE_ENV ?? "development",
      level: "error",
      logger: "guesthouse",
      message: { formatted: error instanceof Error ? error.message : String(error) },
      extra: redact(context) as Record<string, unknown>,
    };
    const envelope = [
      JSON.stringify({ event_id: event.event_id, sent_at: new Date().toISOString() }),
      JSON.stringify({ type: "event" }),
      JSON.stringify(event),
    ].join("\n");
    await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/x-sentry-envelope",
        "X-Sentry-Auth": `Sentry sentry_version=7, sentry_client=guesthouse/1.0, sentry_key=${parsed.username}`,
      },
      body: envelope,
    });
  } catch (e) {
    console.error("[log] could not report to Sentry", e);
  }
}
