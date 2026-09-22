import { cronAuthorized, mailConfig } from "@/lib/mail/config";
import { runDailyMailJobs } from "@/lib/mail/digest";
import { drainOutbox } from "@/lib/mail/dispatch";
import { runNoShowRelease } from "@/lib/no-show-server";
import { runRetention } from "@/lib/retention-server";
import { getRules } from "@/lib/settings-server";
import { getStore } from "@/lib/store";

/**
 * The daily mail jobs: approval digests, check-in reminders, the day-wise
 * guest house log, and the pending-too-long escalation.
 *
 * Intended for 8am institute time — the digest is only useful before people
 * start their day:
 *
 *     30 2 * * *  curl -fsS -H "Authorization: Bearer $CRON_SECRET" \
 *                   https://<host>/api/mail/cron
 *
 * (02:30 UTC is 08:00 IST. If the runner speaks IST, use `0 8 * * *`.)
 *
 * **The schedule is advisory.** Every job keys its idempotency on the
 * institute calendar date, so a missed 8am run still delivers at 9am, and a
 * second run at 9:05 sends nothing. That is deliberate: a cron you can safely
 * re-run is a cron you can debug.
 *
 * It queues and then drains, so one call does the whole job rather than
 * leaving the mail for the dispatch route.
 */

export const dynamic = "force-dynamic";

async function handle(request: Request): Promise<Response> {
  const auth = cronAuthorized(request);
  if (!auth.ok) {
    return Response.json({ ok: false, error: auth.reason }, { status: 401 });
  }

  try {
    // Release no-shows first (Phase 7, off unless the Setting is above 0), so
    // the day's desk report already shows the rooms as free.
    const noShowsReleased = await runNoShowRelease(new Date(), (await getRules()).booking.no_show_release_hours);
    // Housekeeping: sessions and throttle windows long dead (migration 21).
    const sessionsPurged = await getStore().purgeExpiredSessions().catch(() => 0);
    // Retention (Phase 8): identity fields and audit rows past their keep-days.
    const retention = await runRetention(new Date());
    const queued = await runDailyMailJobs();
    const dispatched = await drainOutbox();

    return Response.json({
      ok: true,
      transport: mailConfig().transport,
      queued,
      noShowsReleased,
      sessionsPurged,
      retention,
      dispatched,
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


/**
 * POST for anything that can choose its method (Phase 8): a GET can be
 * triggered by a link, a prefetch or a crawler.
 *
 * Vercel Cron, however, only issues GET. So a GET is accepted **only** when it
 * carries Vercel's own `x-vercel-cron` header as well as the bearer secret,
 * which together cannot be produced by a browser following a link. The secret
 * is never read from the query string.
 */
export async function GET(request: Request) {
  if (request.headers.get("x-vercel-cron") === null) {
    return new Response("Use POST", { status: 405, headers: { Allow: "POST" } });
  }
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}
