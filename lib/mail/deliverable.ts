import type { OutboundMessage } from "./types";

/**
 * `MAIL_ALLOWED_RECIPIENTS`: the only addresses mail may actually reach.
 *
 * Why this exists, and why it is not `MAIL_REDIRECT_ALL_TO`. The redirect
 * answers "send everything to one mailbox" - safe, but it replaces To and
 * **drops CC**, so it cannot be used to watch the real addressing work. The
 * question this answers is different: *most of the 29 demo accounts have
 * addresses that do not exist*, and sending to one earns an SMTP rejection or
 * a bounce, a FAILED outbox row, four retries, and a log full of errors about
 * a mailbox nobody expected to work.
 *
 * So the allow list names the addresses that are real. Everything else is
 * **dropped, not failed**: nothing is attempted, nothing is retried, and the
 * outbox still records who the message was genuinely for.
 *
 * Applied at **send** time, in `dispatch.ts`, for the same reason the redirect
 * is: the outbox stays an honest record of intent, and flipping the variable
 * changes behaviour without rewriting history.
 *
 * Unset - the normal case, and production - means every address is
 * deliverable, which is what the portal did before this existed.
 */

/** One entry: a whole address, or `@domain` for every address at a domain. */
export type RecipientRule = string;

/**
 * Parse the variable. Comma, semicolon or whitespace separated; case is
 * ignored; an empty or absent value is `null`, meaning "no restriction".
 *
 * `null` and `[]` mean opposite things and the difference matters: an empty
 * list is a list that allows **nobody**, which is a legitimate way to say
 * "queue mail but deliver none of it". Only an unset variable means "no
 * restriction", so a typo that leaves the value blank cannot silently open
 * the gate - `env()` returns null for a blank string, so a blank reads as
 * unset, which is the safe-for-production default rather than the safe-for-
 * testing one. Set `MAIL_DRY_RUN` to send nothing at all.
 */
export function parseAllowedRecipients(raw: string | null | undefined): RecipientRule[] | null {
  if (raw === null || raw === undefined) return null;
  const entries = raw
    .split(/[,;\s]+/)
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);
  return entries;
}

/** Whether one address may be delivered to. `null` rules allow everything. */
export function isDeliverable(address: string, rules: RecipientRule[] | null): boolean {
  if (rules === null) return true;
  const normalized = address.trim().toLowerCase();
  if (normalized.length === 0) return false;
  const at = normalized.lastIndexOf("@");
  const domain = at === -1 ? null : normalized.slice(at);
  return rules.some((rule) => (rule.startsWith("@") ? rule === domain : rule === normalized));
}

export interface AllowListResult {
  /** The message with undeliverable addresses removed from To and Cc. */
  message: OutboundMessage;
  /** Addresses that were removed, in the order they appeared. */
  dropped: string[];
}

/**
 * Remove every undeliverable address from To and Cc.
 *
 * The subject and body are left alone: unlike the redirect this is not a
 * different message to a different mailbox, it is the same message to fewer
 * people, and a banner explaining that a colleague's fake address was skipped
 * would be noise in a real person's inbox.
 */
export function applyAllowList(
  message: OutboundMessage,
  rules: RecipientRule[] | null
): AllowListResult {
  if (rules === null) return { message, dropped: [] };

  const dropped: string[] = [];
  const keep = (address: string): boolean => {
    if (isDeliverable(address, rules)) return true;
    dropped.push(address);
    return false;
  };

  const to = message.to.filter(keep);
  const cc = message.cc.filter(keep);
  if (dropped.length === 0) return { message, dropped };
  return { message: { ...message, to, cc }, dropped };
}

/**
 * Whether the allow list left anybody to write to, in To **or** Cc.
 *
 * Cc counts (11 Nov 2026). Most demo accounts have addresses that do not
 * exist, so a requester's To is often dropped while the real address they
 * typed under "Copy to" survives. Reading only To skipped the whole message
 * and the one person who could receive it got nothing - the "copy to mail is
 * not working" report.
 */
export function hasAllowedRecipient(message: OutboundMessage): boolean {
  return message.to.length > 0 || message.cc.length > 0;
}

/**
 * The outbox note for a message that was sent to fewer people than it was
 * queued for. A SENT row lists its queued To and Cc, so without this a
 * dropped Copy-to address reads as delivered.
 */
export function droppedRecipientsNote(dropped: string[]): string | undefined {
  if (dropped.length === 0) return undefined;
  return `Not delivered to ${dropped.join(", ")} (not in MAIL_ALLOWED_RECIPIENTS)`;
}
