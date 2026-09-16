import fs from "fs";
import path from "path";
import { mailConfig } from "./config";
import type { Mailer, OutboundMessage } from "./types";

/**
 * Writes each message to `.local-mail/` as an `.eml` file instead of sending
 * it. Open one in Thunderbird, Apple Mail or any browser extension that reads
 * `.eml` to see exactly what a recipient would have got.
 *
 * This exists for the same reason `MockStore` does: the first run of this
 * project needs no accounts, no credentials and no network. It is selected
 * automatically when `MAIL_USER` / `MAIL_APP_PASSWORD` are absent, so a
 * developer who has not been given the mailbox still gets the whole
 * notification flow, on disk.
 */

const MAIL_DIR = path.join(process.cwd(), ".local-mail");

/** Header value folding is not worth it here, but CRLF injection is worth refusing. */
function headerValue(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}

export class FileMailer implements Mailer {
  readonly name = "file (.local-mail/*.eml)";

  async send(message: OutboundMessage): Promise<{ messageId: string }> {
    const config = mailConfig();
    const messageId = message.messageId ?? `<local-${Date.now()}@${config.messageIdDomain}>`;
    const boundary = `----gh-${Math.random().toString(36).slice(2)}`;

    const headers = [
      `Date: ${new Date().toUTCString()}`,
      `From: ${headerValue(config.from)}`,
      `Reply-To: ${headerValue(config.replyTo)}`,
      `To: ${headerValue(message.to.join(", "))}`,
      ...(message.cc.length > 0 ? [`Cc: ${headerValue(message.cc.join(", "))}`] : []),
      `Subject: ${headerValue(message.subject)}`,
      `Message-ID: ${headerValue(messageId)}`,
      ...(message.inReplyTo ? [`In-Reply-To: ${headerValue(message.inReplyTo)}`] : []),
      ...(message.references?.length ? [`References: ${headerValue(message.references.join(" "))}`] : []),
      ...Object.entries(message.headers ?? {}).map(
        ([name, value]) => `${name.replace(/[^\w-]/g, "")}: ${headerValue(value)}`
      ),
      "MIME-Version: 1.0",
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
    ];

    const body = [
      "",
      `--${boundary}`,
      'Content-Type: text/plain; charset="utf-8"',
      "Content-Transfer-Encoding: 8bit",
      "",
      message.text,
      "",
      `--${boundary}`,
      'Content-Type: text/html; charset="utf-8"',
      "Content-Transfer-Encoding: 8bit",
      "",
      message.html,
      "",
      `--${boundary}--`,
      "",
    ];

    await fs.promises.mkdir(MAIL_DIR, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const slug = message.subject.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").slice(0, 60);
    const file = path.join(MAIL_DIR, `${stamp}-${slug || "message"}.eml`);
    await fs.promises.writeFile(file, [...headers, ...body].join("\r\n"), "utf8");

    console.log(`[mail] wrote ${path.relative(process.cwd(), file)} (to: ${message.to.join(", ")})`);
    return { messageId };
  }
}

/**
 * `MAIL_DRY_RUN=true`: logs one line per message and sends nothing, not even
 * to disk. The switch you reach for when you are about to do something you are
 * not sure about.
 */
export class DryRunMailer implements Mailer {
  readonly name = "dry-run (nothing is sent)";

  async send(message: OutboundMessage): Promise<{ messageId: string }> {
    console.log(
      `[mail:dry-run] would send "${message.subject}" to ${message.to.join(", ")}` +
        (message.cc.length > 0 ? ` (cc ${message.cc.join(", ")})` : "")
    );
    return { messageId: message.messageId ?? "<dry-run>" };
  }
}
