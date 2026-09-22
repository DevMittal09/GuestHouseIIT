import nodemailer, { type Transporter } from "nodemailer";
import type { MailConfig } from "./config";
import type { Mailer, OutboundMessage } from "./types";

/**
 * SMTP transport (nodemailer).
 *
 * Configured for an authenticated mailbox — today a Gmail account with an app
 * password, which is what `MAIL_USER` / `MAIL_APP_PASSWORD` are. Host and port
 * are environment variables rather than constants because the production plan
 * is to move to the institute's own relay (`smtp-relay.gmail.com`) sending as
 * `guesthouse@iitpkd.ac.in`: SPF and DKIM are already correct for
 * `iitpkd.ac.in`, and mail then genuinely originates from the institute, which
 * is what the Administration Section cares about when a parent receives it.
 * That migration should be an `.env.local` change and nothing else.
 *
 * The transporter is cached per process and pooled: one TCP connection reused
 * across a batch beats one handshake per message, and Gmail rate-limits
 * connections harder than it rate-limits messages.
 */
export class SmtpMailer implements Mailer {
  readonly name: string;
  private transporter: Transporter;
  private config: MailConfig;

  constructor(config: MailConfig) {
    this.config = config;
    this.name = `smtp (${config.host}:${config.port})`;
    this.transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      // 465 is implicit TLS; 587 starts plain and upgrades.
      secure: config.secure,
      auth: config.user && config.pass ? { user: config.user, pass: config.pass } : undefined,
      pool: true,
      maxConnections: 2,
      maxMessages: 50,
      // Fail rather than hang: the worker has other messages to get through,
      // and a stuck send would hold its claimed row in SENDING.
      connectionTimeout: 15_000,
      greetingTimeout: 10_000,
      socketTimeout: 30_000,
    });
  }

  async send(message: OutboundMessage): Promise<{ messageId: string }> {
    const info = await this.transporter.sendMail({
      from: this.config.from,
      replyTo: this.config.replyTo,
      to: message.to,
      cc: message.cc.length > 0 ? message.cc : undefined,
      subject: message.subject,
      html: message.html,
      text: message.text,
      messageId: message.messageId,
      inReplyTo: message.inReplyTo,
      references: message.references,
      headers: message.headers,
      attachments: message.attachments?.map((a) => ({
        filename: a.filename,
        contentType: a.contentType,
        content: Buffer.from(a.content),
      })),
    });
    return { messageId: String(info.messageId ?? message.messageId ?? "") };
  }

  /** Prove the credentials and the route before trusting them. Used by the console. */
  async verify(): Promise<void> {
    await this.transporter.verify();
  }
}
