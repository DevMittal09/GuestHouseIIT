import { getStore } from "@/lib/store";
import { mailConfig } from "./config";
import { getMailer } from "./index";
import { applyAllowList, droppedRecipientsNote, hasAllowedRecipient } from "./deliverable";
import { applyRedirect } from "./redirect";
import { freshMessageId } from "./thread";
import type { EmailMessage, MailAttachmentRef, OutboundAttachment, OutboundMessage } from "./types";

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

/**
 * Whether this message opens its thread: the first one of the thread to be
 * sent claims the root id. Decided here rather than at queue time because
 * which message goes first is only known now - the day's first approval might
 * fail and retry after the second has gone. Checking for a *sent* sibling
 * means a failed opener simply hands the role on.
 *
 * Rows from before daily threads that were queued as a thread's opener still
 * open it.
 */
async function opensThread(row: EmailMessage): Promise<boolean> {
  if (!row.thread_root) return false;
  if (row.is_thread_root) return true;
  try {
    const sent = await getStore().listEmails({
      threadRoot: row.thread_root,
      status: "SENT",
      limit: 1,
    });
    return sent.length === 0;
  } catch (error) {
    // Replying to a root the mailbox has not seen still threads by subject in
    // most clients; not sending at all would be worse.
    console.error("[mail] could not check the thread; sending as a reply", error);
    return false;
  }
}

/** Turn an outbox row into a message for the transport, threading headers and all. */
function toOutbound(row: EmailMessage, isRoot: boolean): OutboundMessage {
  return {
    to: row.to_emails,
    cc: row.cc_emails,
    subject: row.subject,
    html: row.body_html,
    text: row.body_text,
    // The message that opens a thread claims the deterministic root id; every
    // later one gets a fresh id and points at the root, which is what makes
    // mail clients group them. Standalone mail has no threading headers.
    messageId: isRoot && row.thread_root ? row.thread_root : freshMessageId(),
    inReplyTo: !isRoot && row.thread_root ? row.thread_root : undefined,
    references: !isRoot && row.thread_root ? [row.thread_root] : undefined,
  };
}

/**
 * Turn the outbox row's attachment references into files. An invoice is drawn
 * from its stored snapshot now - the bytes are never kept in the outbox. A
 * reference that cannot be resolved fails the send (and so retries): mailing
 * Accounts an invoice without the invoice would be worse than mailing late.
 */
async function resolveAttachments(refs: MailAttachmentRef[] | undefined): Promise<OutboundAttachment[]> {
  const out: OutboundAttachment[] = [];
  for (const ref of refs ?? []) {
    if (ref.kind === "invoice") {
      const invoice = await getStore().getInvoice(ref.invoice_id);
      if (!invoice?.document) throw new Error(`Invoice ${ref.invoice_id} to attach was not found`);
      const { renderInvoicePdf, invoiceFilename } = await import("@/lib/invoice-pdf");
      out.push({
        filename: invoiceFilename(invoice.document),
        contentType: "application/pdf",
        content: renderInvoicePdf(invoice.document, invoice),
      });
    }
  }
  return out;
}

export interface DispatchResult {
  claimed: number;
  sent: number;
  failed: number;
  /**
   * Settled without being delivered, because `MAIL_ALLOWED_RECIPIENTS` ruled
   * every recipient out. Counted apart from `sent` and `failed` so a run that
   * delivered nothing cannot read as a run that worked.
   */
  skipped: number;
  /** False when another dispatcher in this process was already running. */
  ran: boolean;
}

/**
 * One in-process guard, so the `after()` hooks of three approvals landing
 * together do not open three SMTP pools at once. It is per-process and
 * deliberately not a distributed lock - `claimQueuedEmails` is what makes
 * concurrency correct; this only keeps it tidy.
 */
let running = false;

export async function dispatchOutbox(
  { batchSize = BATCH_SIZE }: { batchSize?: number } = {}
): Promise<DispatchResult> {
  if (running) return { claimed: 0, sent: 0, failed: 0, skipped: 0, ran: false };
  running = true;
  try {
    const store = getStore();
    const config = mailConfig();
    const mailer = getMailer();

    const claimed = await store.claimQueuedEmails(batchSize, STALE_SENDING_MS);
    let sent = 0;
    let failed = 0;
    let skipped = 0;

    for (const row of claimed) {
      // Both of these are applied here rather than at queue time, so the
      // outbox keeps a record of who the message was genuinely for.
      //
      // Order matters and is deliberate: the allow list decides **whether**
      // each real recipient may be written to, and the redirect then decides
      // **where** what is left actually goes. The other way round would test
      // the redirect mailbox against the allow list, which answers nothing.
      const addressed = applyAllowList(
        toOutbound(row, await opensThread(row)),
        config.allowedRecipients
      );
      if (!hasAllowedRecipient(addressed.message) && addressed.dropped.length > 0) {
        // Every recipient - To and Cc - is an address the deployment says
        // does not exist. Settled, not failed: there is nothing to retry and
        // nothing wrong. A Cc that survives is still sent (below), even when
        // the To did not: that is the requester's own "Copy to".
        await store.settleEmail(row.id, {
          ok: true,
          providerMessageId: "skipped-no-allowed-recipient",
          note: `Not sent: no recipient is in MAIL_ALLOWED_RECIPIENTS (${addressed.dropped.join(", ")})`,
        });
        skipped++;
        continue;
      }
      const { message, originalRecipients } = applyRedirect(
        addressed.message,
        config.redirectAllTo
      );
      if (addressed.dropped.length > 0) {
        console.log(
          `[mail] ${row.event_key}: skipped ${addressed.dropped.length} recipient(s) not in ` +
            `MAIL_ALLOWED_RECIPIENTS (${addressed.dropped.join(", ")})`
        );
      }
      if (!hasAllowedRecipient(message)) {
        // Nobody to send to - a profile without an address, most likely.
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
        const attachments = await resolveAttachments(row.attachments);
        if (attachments.length > 0) message.attachments = attachments;
        const { messageId } = await mailer.send(message);
        // A partly delivered message says so on its row, or the outbox lists a
        // dropped Copy-to address as though it had been sent to.
        await store.settleEmail(row.id, {
          ok: true,
          providerMessageId: messageId,
          note: droppedRecipientsNote(addressed.dropped),
        });
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
      console.log(
        `[mail] ${mailer.name}: ${sent} sent, ${failed} failed` +
          (skipped > 0 ? `, ${skipped} skipped (no allowed recipient)` : "") +
          ` of ${claimed.length} claimed`
      );
    }
    return { claimed: claimed.length, sent, failed, skipped, ran: true };
  } finally {
    running = false;
  }
}

/**
 * Drain the queue rather than sending one batch - used by the cron route,
 * where the point is to clear a backlog. Bounded so a poisoned queue cannot
 * spin forever.
 */
export async function drainOutbox(maxBatches = 10): Promise<DispatchResult> {
  const total: DispatchResult = { claimed: 0, sent: 0, failed: 0, skipped: 0, ran: false };
  for (let i = 0; i < maxBatches; i++) {
    const result = await dispatchOutbox();
    total.claimed += result.claimed;
    total.sent += result.sent;
    total.failed += result.failed;
    total.skipped += result.skipped;
    total.ran = total.ran || result.ran;
    if (result.claimed === 0) break;
  }
  return total;
}

export { MAX_ATTEMPTS, STALE_SENDING_MS };
