# Recent changes - the last round, and only the last round

This file is **replaced** every round, not appended to. The round before this
one is written up where every round is: what was asked in
[01-background.md](01-background.md), why it was done that way in
[02-decisions.md](02-decisions.md).

---

## Round of 11 November 2026 - the owner's reports

Reports sent one after another while work was in progress, each **committed
on its own**.

### 1. "Copy to" mail never arrived

**Cause: configuration, with a defect beside it.** Read from the shared
database's outbox, booking `IITPKD-GH-2026-6NPTY`: the typed address was in
`cc_emails` of both requester mails, both SENT. It is not on
`MAIL_ALLOWED_RECIPIENTS` in `.env.local`, so it was dropped at send time, and
nothing on the row said so.

| Change | Where |
| --- | --- |
| Skip a message only when **nobody** is left in To *or* Cc; a fake To no longer takes an allowed Cc with it | `lib/mail/dispatch.ts`, `hasAllowedRecipient` in `lib/mail/deliverable.ts` |
| A sent row names who was dropped: "Not delivered to x (not in MAIL_ALLOWED_RECIPIENTS)" | `droppedRecipientsNote`, shown in `/admin/mail` as it already shows notes |
| A Cc-only message writes no empty To header | `lib/mail/smtp.ts`, `lib/mail/file.ts` |
| Tests | `tests/mail-dispatch-copy-to.test.ts` (new, real dispatch on the mock store), `tests/mail-allowlist.test.ts` |

**To make the address in the report receive mail on this deployment, add it
to `MAIL_ALLOWED_RECIPIENTS` in `.env.local`** and restart the server. That is
the owner's call and was not done for them.

### Checks

`npm run lint`, `npm run typecheck`, **696 tests in 42 files** clean. The
build was not run while a `next dev` held port 3000 (it would have killed it).

No migration, no schema change, nothing written to the shared database (it
was read, to find the outbox rows).
