import { mailConfig, type MailConfig } from "./config";
import { DryRunMailer, FileMailer } from "./file";
import { SmtpMailer } from "./smtp";
import type { Mailer } from "./types";

/**
 * Picks the transport from the environment, exactly the way
 * `lib/store/index.ts` picks a backend:
 *
 * | Condition | Transport | Mail goes to |
 * | --- | --- | --- |
 * | `MAIL_DRY_RUN=true` | `DryRunMailer` | nowhere (one log line) |
 * | `MAIL_USER` + `MAIL_APP_PASSWORD` | `SmtpMailer` | the SMTP host |
 * | otherwise | `FileMailer` | `.local-mail/*.eml` |
 *
 * Cached per process, and keyed on the transport kind so a changed
 * `.env.local` is picked up on the next dev-server reload rather than
 * requiring a restart.
 */
let cached: { mailer: Mailer; kind: MailConfig["transport"] } | null = null;

export function getMailer(): Mailer {
  const config = mailConfig();
  if (cached && cached.kind === config.transport) return cached.mailer;

  const mailer: Mailer =
    config.transport === "dry-run"
      ? new DryRunMailer()
      : config.transport === "smtp"
        ? new SmtpMailer(config)
        : new FileMailer();

  cached = { mailer, kind: config.transport };
  return mailer;
}

export { mailConfig } from "./config";
export type { Mailer, OutboundMessage } from "./types";
