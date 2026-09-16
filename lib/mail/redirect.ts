import { escapeHtml } from "./render";
import type { OutboundMessage } from "./types";

/**
 * `MAIL_REDIRECT_ALL_TO`: send everything to one mailbox instead of to the
 * real recipients.
 *
 * Applied **at send time, not at queue time.** The outbox always records who
 * the message was genuinely for, so flipping this environment variable changes
 * where mail goes without rewriting history, and the developer console's
 * outbox still answers "was the warden supposed to get this?".
 *
 * Without this variable, one person pointing a staging server at real data
 * mails a real parent. The current deployment redirects to the same mailbox it
 * sends from, so the whole notification flow lands in one inbox.
 */

/** Everyone the message was really for, as one readable line. */
function describeRealRecipients(message: OutboundMessage): string {
  const to = message.to.join(", ") || "(nobody)";
  return message.cc.length > 0 ? `To: ${to} · Cc: ${message.cc.join(", ")}` : `To: ${to}`;
}

const BANNER_ANCHOR = /<body([^>]*)>/i;

function bannerHtml(text: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#fdeeee;border-bottom:1px dashed #ef4444;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;"><tr><td align="center" style="padding:10px 14px;font-size:12px;line-height:1.5;color:#8c1c1c;"><strong>Redirected mail.</strong> ${escapeHtml(text)}</td></tr></table>`;
}

/**
 * Rewrite a message for the redirect mailbox, or return it untouched when no
 * redirect is configured.
 */
export function applyRedirect(
  message: OutboundMessage,
  redirectAllTo: string | null
): { message: OutboundMessage; originalRecipients: string[] } {
  const originalRecipients = [...message.to, ...message.cc];
  if (!redirectAllTo) return { message, originalRecipients };

  const notice = `Originally addressed to ${describeRealRecipients(message)}.`;

  return {
    originalRecipients,
    message: {
      ...message,
      to: [redirectAllTo],
      cc: [],
      // The subject is prefixed so a redirected inbox is sortable and nobody
      // mistakes one of these for mail that actually reached its recipient.
      subject: `[redirected] ${message.subject}`,
      html: message.html.replace(BANNER_ANCHOR, (_m, attrs) => `<body${attrs}>${bannerHtml(notice)}`),
      text: `[REDIRECTED MAIL] ${notice}\n\n${message.text}`,
      headers: {
        ...message.headers,
        // Machine-readable counterpart to the banner, so a filter or a script
        // can sort a redirected mailbox by who the mail was actually for.
        "X-Original-To": message.to.join(", "),
        ...(message.cc.length > 0 ? { "X-Original-Cc": message.cc.join(", ") } : {}),
      },
    },
  };
}
