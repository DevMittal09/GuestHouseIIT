import { getStore } from "@/lib/store";
import { mailConfig } from "./config";
import { getMailer } from "./index";
import { applyRedirect } from "./redirect";
import { freshMessageId } from "./thread";
import type { EmailMessage, OutboundMessage } from "./types";

/**
 * The outbox worker: claim due messages, send them, record what happened.
 *
 * Triggered two ways, and it needs both:
 *
 * - `after()` on the server action that queued the message, so mail goes out
 *   within a second in normal operation without anything scheduled;
 * - the cron route (`/api/mail/dispatch`), which is the safety net for
 *   messages queued while SMTP was down, and for a retry whose backoff has
 *   only just expired.
 *
 * Running both at once is safe: `claimQueuedEmails` marks each row `SENDING`
 * under `for update skip locked`, so two dispatchers get disjoint batches.
 */

/** Messages per run. Small: Gmail rate-limits connections, and this runs often. */
const BATCH_SIZE = 10;

/** Give up after this many attempts and leave the row FAILED for a human. */
const MAX_ATTEMPTS = 5;

/**
 * A row left in `SENDING` for longer than this is assumed to belong to a
 * process that died and is reclaimed. Comfortably longer than the socket
 * timeout in `SmtpMailer`, so a slow-but-alive send is never stolen.
 */
const STALE_SENDING_MS = 5 * 60 * 1000;

/** 1, 5, 15, 45 minutes. Long enough to outlast a relay hiccup or a DNS blip. */
const BACKOFF_MINUTES = [1, 5, 15, 45];

function retryAtFor(attempts: number): string | null {
  if (attempts >= MAX_ATTEMPTS) return null;
  const minutes = BACKOFF_MINUTES[Math.min(attempts - 1, BACKOFF_MINUTES.length - 1)];
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

function errorText(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`.slice(0, 500);
  return String(error).slice(0, 500);
}

/** Turn an outbox row into a message for the transport, threading headers and all. */
function toOutbound(row: EmailMessage): OutboundMessage {
  return {
    to: row.to_emails,
    cc: row.cc_emails,
    subject: row.subject,
    html: row.body_html,
    text: row.body_text,
    // The message that opens a booking's thread claims the deterministic root
    // id; every later one gets a fresh id and points at the root, which is
    // what makes mail clients group them.
    messageId: row.is_thread_root && row.thread_root ? row.thread_root : freshMessageId(),
    inReplyTo: row.is_thread_root ? undefined : (row.thread_root ?? undefined),
    references: !row.is_thread_root && row.thread_root ? [row.thread_root] : undefined,
  };
}

export interface DispatchResult {
  claimed: number;
  sent: number;
  failed: number;
  /** False when another dispatcher in this process was already running. */
  ran: boolean;
}

/**
 * One in-process guard, so the `after()` hooks of three approvals landing
 * together do not open three SMTP pools at once. It is per-process and
 * deliberately not a distributed lock — `claimQueuedEmails` is what makes
 * concurrency correct; this only keeps it tidy.
 */
let running = false;

export async function dispatchOutbox(
  { batchSize = BATCH_SIZE }: { batchSize?: number } = {}
): Promise<DispatchResult> {
  if (running) return { claimed: 0, sent: 0, failed: 0, ran: false };
  running = true;
  try {
    const store = getStore();
    const config = mailConfig();
    const mailer = getMailer();

    const claimed = await store.claimQueuedEmails(batchSize, STALE_SENDING_MS);
    let sent = 0;
    let failed = 0;

    for (const row of claimed) {
      // The redirect is applied here, not at queue time, so the outbox keeps a
      // record of who the message was genuinely for.
      const { message, originalRecipients } = applyRedirect(toOutbound(row), config.redirectAllTo);
      if (message.to.length === 0) {
        // Nobody to send to — a profile without an address, most likely.
        // Failing it outright is right: a retry would find the same nobody.
        await store.settleEmail(row.id, {
          ok: false,
          error: "No deliverable recipient",
          retryAt: null,
        });
        failed++;
        continue;
      }
      try {
        const { messageId } = await mailer.send(message);
        await store.settleEmail(row.id, { ok: true, providerMessageId: messageId });
        sent++;
      } catch (error) {
        const retryAt = retryAtFor(row.attempts);
        await store.settleEmail(row.id, { ok: false, error: errorText(error), retryAt });
        failed++;
        console.error(
          `[mail] ${row.event_key} to ${originalRecipients.join(", ")} failed ` +
            `(attempt ${row.attempts}/${MAX_ATTEMPTS})` +
            (retryAt ? `, retrying at ${retryAt}` : ", giving up"),
          error
        );
      }
    }

    if (claimed.length > 0) {
      console.log(`[mail] ${mailer.name}: ${sent} sent, ${failed} failed of ${claimed.length} claimed`);
    }
    return { claimed: claimed.length, sent, failed, ran: true };
  } finally {
    running = false;
  }
}

/**
 * Drain the queue rather than sending one batch — used by the cron route,
 * where the point is to clear a backlog. Bounded so a poisoned queue cannot
 * spin forever.
 */
export async function drainOutbox(maxBatches = 10): Promise<DispatchResult> {
  const total: DispatchResult = { claimed: 0, sent: 0, failed: 0, ran: false };
  for (let i = 0; i < maxBatches; i++) {
    const result = await dispatchOutbox();
    total.claimed += result.claimed;
    total.sent += result.sent;
    total.failed += result.failed;
    total.ran = total.ran || result.ran;
    if (result.claimed === 0) break;
  }
  return total;
}

export { MAX_ATTEMPTS, STALE_SENDING_MS };
