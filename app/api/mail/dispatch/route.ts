import { cronAuthorized, mailConfig } from "@/lib/mail/config";
import { drainOutbox } from "@/lib/mail/dispatch";

/**
 * The outbox worker as an HTTP endpoint.
 *
 * Normal operation does not need this: `notify.ts` schedules a dispatch with
 * `after()` on the action that queued the message, so mail leaves within a
 * second. This route is the safety net — it clears messages queued while SMTP
 * was down, and retries whose backoff has expired.
 *
 * Run it every few minutes:
 *
 *     * / 5 * * * *  curl -fsS -H "Authorization: Bearer $CRON_SECRET" \
 *                      https://<host>/api/mail/dispatch
 *
 * (on Vercel, a `crons` entry in `vercel.json` pointing at this path).
 *
 * `GET` and `POST` both work, because cron runners disagree about which to
 * use. Authorization is `CRON_SECRET` — required in production, since this
 * route causes mail to real people.
 */

// Never prerendered or cached: it must run, and run now.
export const dynamic = "force-dynamic";

async function handle(request: Request): Promise<Response> {
  const auth = cronAuthorized(request);
  if (!auth.ok) {
    return Response.json({ ok: false, error: auth.reason }, { status: 401 });
  }

  try {
    const result = await drainOutbox();
    return Response.json({
      ok: true,
      transport: mailConfig().transport,
      ...result,
    });
  } catch (error) {
    return failed(error);
  }
}
/**
 * A store error here is almost always one thing: migration 10 has not been
 * applied, so there is no outbox to read. A cron runner's log should say that
 * rather than showing an opaque 500 from the framework.
 */
function failed(error: unknown): Response {
  const message = error instanceof Error ? error.message : String(error);
  console.error("[mail] route failed", error);
  return Response.json(
    {
      ok: false,
      error: message,
      hint: "If the outbox table is missing, apply supabase/migrations/00000000000010_email_outbox.sql.",
    },
    { status: 500 }
  );
}


/** As for the daily cron: GET only for Vercel Cron, which cannot POST. */
export async function GET(request: Request) {
  if (request.headers.get("x-vercel-cron") === null) {
    return new Response("Use POST", { status: 405, headers: { Allow: "POST" } });
  }
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}
