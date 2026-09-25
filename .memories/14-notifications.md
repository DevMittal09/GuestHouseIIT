# Notifications — every automatic mail, who gets it, and how it is sent

Built 16 Sep 2026 and reworked since (Phase 2 addressing on 21 Sep, booking
threads on 23 Sep, the requester's own Copy to on 24 Sep). **Checked against
the code on 24 Sep 2026** — `lib/mail/types.ts` (the events),
`lib/mail/notify.ts`, `lib/mail/recipients.ts`, `lib/mail/digest.ts`,
`app/api/mail/*`, `vercel.json`.

## Every event

| Event key | What | To | CC |
| --- | --- | --- | --- |
| `booking.submitted.requester` | Booking received | Requester | Booking's Copy to (+ the Faculty Advisor on a club booking) |
| `booking.submitted.reviewer` | New request awaiting review | First actioner (warden / HOD / IAR Office / club stage / manager) | Approval chain ("Copy to" card) |
| `booking.tier_approved.requester` | Approved at a tier | Requester | Booking's Copy to |
| `booking.pending.reviewer` | Forwarded for review | Next actioner | Approval chain (incl. who forwarded) |
| `booking.rejected.requester` | Rejected — the reason verbatim | Requester | Booking's Copy to |
| `booking.allocated.requester` | Rooms allocated, check-in, what ID to carry | Requester | Booking's Copy to |
| `booking.allocated.desk` | Allocation record | Manager + caretaker | Approval chain |
| `booking.cancellation_requested.manager` | Cancellation requested | Manager | Approval chain |
| `booking.cancellation_decided.requester` | Cancellation approved / declined | Requester | Booking's Copy to |
| `booking.cancelled.requester` / `.desk` | Cancelled (by the office) | Requester / the desk if rooms were held | Copy to / approval chain |
| `booking.extension_requested.manager` | Requester asked to extend | Manager | Approval chain |
| `booking.extension_decided.requester` | Extension approved / declined | Requester | Booking's Copy to |
| `booking.no_show.requester` | Released as a no-show | Requester | Booking's Copy to |
| `stay.reminder.requester` | Day before check-in | Requester | Booking's Copy to |
| `queue.digest.reviewer` | Daily digest of waiting requests | Each reviewer with a non-empty queue | — |
| `queue.escalation.reviewer` | Waiting over 48 h | Reviewer | Manager |
| `desk.daily_report` | Day-wise log per guest house (arrivals, departures, in house, awaiting check-out, pending allocation, kitchen plates) | Manager + caretaker | — |
| `invoice.issued.accounts` | Official invoice, PDF attached; the summary lists Rooms (A), Dining (B) and — since 25 Sep 2026 — Other charges (no GST) when there are any | Accounts email (Setting) | Requester's HOD, the requester (+ Copy to) |
| `booking.cancellation_requested.reviewer` | *Retired* — reviewers are CC on the manager's mail now | — | — |

**Two different "Copy to" lists — keep them apart.** The **approval chain**
(`lib/academic/copy-to.ts`: everyone who approves any stage of the booking's
route, plus an office's head) is CC on **staff** mail. The **booking's own
Copy to** (`bookings.copy_to_emails`, typed on New Booking, ≤ 25; pre-filled
with the council secretary when a Faculty Advisor books) is CC on
**requester** mail, together with the Faculty Advisor who raised a club
booking (`requesterCopyTo`).

Every template's wording can be overridden in Console → Email Templates
(subject, intro, outro, extra CC, on/off); the facts in the mail stay in code.

## Scheduling

| Route | Does | Schedule (`vercel.json`, Hobby plan) |
| --- | --- | --- |
| `/api/mail/cron` | No-show release (if the Setting > 0) → purge dead sessions / throttles → retention erasure → digests, reminders, desk reports, escalations → drain the outbox | `30 2 * * *` (08:00 IST) |
| `/api/mail/dispatch` | Drain the outbox (safety net — mail normally leaves within a second via `after()`) | `0 3 * * *` (Hobby allows daily crons only; `*/10` on Pro) |

Both need `CRON_SECRET` as a bearer token in production (a GET is accepted only
with Vercel's `x-vercel-cron` header). Every job is idempotent per institute
day, so a missed run self-heals and a double run sends nothing.

## How it works


Built 16 Sep 2026. Two Administration Section requirements (allocation mail,
the day-wise log) plus the meeting note about single-threaded email, all of
which needed the same missing piece.

### The shape

| File | What it is |
| --- | --- |
| `types.ts` | `Mailer`, `OutboundMessage`, the `MailEventKey` union, the outbox row |
| `config.ts` | Env reading, `portalUrl()`, `cronAuthorized()` |
| `index.ts` | `getMailer()` — picks the transport from the environment |
| `smtp.ts` | `SmtpMailer` (nodemailer, pooled) |
| `file.ts` | `FileMailer` → `.local-mail/*.eml`, and `DryRunMailer` |
| `redirect.ts` | `MAIL_REDIRECT_ALL_TO`, applied at **send** time |
| `render.ts` | Blocks → HTML **and** plain text, from one description |
| `templates.ts` | What each mail says. Pure functions, no store access |
| `thread.ts` | Daily per-person thread roots and subjects; the `[reference]` subject for standalone mail |
| `recipients.ts` | Who gets told — via `canReview()`, never a re-derived rule; `copyToAddresses()` for CC |
| `addressing.ts` | `addressStaffMail(to, copyTo)`: CC minus anyone in To, de-duplicated ignoring case |
| `notify.ts` | `notify*()` per workflow event: queue, then `after()` a dispatch |
| `dispatch.ts` | The worker: claim → send → settle, with backoff |
| `digest.ts` | The scheduled jobs (digests, reminders, desk report, escalations) |

Transport is chosen the way `lib/store/index.ts` chooses a backend:

| Condition | Transport | Mail goes to |
| --- | --- | --- |
| `MAIL_DRY_RUN=true` | `DryRunMailer` | nowhere (one log line) |
| `MAIL_USER` + `MAIL_APP_PASSWORD` | `SmtpMailer` | the SMTP host |
| otherwise | `FileMailer` | `.local-mail/*.eml` |

The file mailer exists for the same reason `MockStore` does: a first run needs
no credentials and no network. Open an `.eml` in any mail client to see exactly
what a recipient would have got.

### Nothing sends inside a server action

Actions **queue**; `lib/mail/dispatch.ts` sends. Three reasons, and the third
is the one that bites silently:

1. A slow SMTP host would add its latency to every booking submission.
2. A failed send must not fail a booking that is already stored.
3. On a serverless host, un-awaited work is frozen the moment the function
   responds — mail started and not awaited simply vanishes.

So `notify.ts` writes to `email_outbox` (migration 10) and schedules a dispatch
with `after()` from `next/server`, which runs once the response is out. The
cron route is the safety net for anything queued while SMTP was down.

**Every `notify*()` swallows its own errors.** If migration 10 is not applied,
or a profile has no address, the booking still succeeds and the failure is a
log line. A notification is worth less than the request it describes.

### The hooks are in the actions, not in `updateBookingStatus()`

Tempting, and wrong. The store method sees a status pair; only the action knows
*why* — which reason the reviewer typed, which rooms the manager picked,
whether a cancellation was approved or declined. Hooking the store would mean
reconstructing intent from a status transition, and would also mail on the
developer console's **force-status override**, which is a repair tool: a
developer fixing a bad row should not send a parent a confirmation.

### What is sent — To is the actioner, "Copy to" is CC

The owner's rule (Phase 2, 21 Sep 2026): on every **staff** mail about a
booking, **To is the one person who must act next** — found through
`canReview()` for the booking's current status (`reviewersForStatus`), or the
desk for a desk record — and **CC is the booking's Copy-to list**
(`lib/academic/copy-to.ts`): everyone who approves any stage of its chain
(`approvalStagesFor`) and, for an office, its head (Departments & Clubs
console first, else the academic record). `addressStaffMail` removes anyone
already in To from CC and de-duplicates both ignoring case. When the booking
moves on, the next mail's To moves with it and the approver who forwarded it
stays in CC.

**Requester mail has its own CC** (24 Sep 2026, `requesterCopyTo()` in
`lib/mail/recipients.ts`): the addresses the requester added under **Copy to**
on New Booking (`bookings.copy_to_emails`), and — on a club booking raised by
its Faculty Advisor — that professor, since the To is the club's account. Every "Requester" row below carries it, as do the check-in reminder
and the official invoice to Accounts. Staff mail does not: an outsider has no
use for "awaiting your review". Two different lists both called Copy to — the
card's (approvers, staff CC) and the booking's (named by the requester,
requester CC).

| Event | To | CC | Carries |
| --- | --- | --- | --- |
| Submitted | Requester | — | Reference, summary, "nothing needed yet" |
| Submitted | First actioner (warden / advisor or council secretary / HOD / IAR Office / manager) | Copy to | Who asked, a link to their queue |
| Tier approved | Requester | — | Progress, what happens next |
| Tier approved | Next actioner | Copy to (incl. who forwarded it) | Who forwarded it |
| Rejected | Requester | — | **The reason, verbatim** |
| Rooms allocated | Requester | — | Room numbers, check-in, what ID to carry |
| Rooms allocated | Manager + caretaker | Copy to | Copy for the desk register |
| Cancellation requested | Manager (decides) | Copy to (whoever reviewed it) | Reason; rooms stay held until they decide |
| Cancellation decided | Requester | — | Outcome, and that the booking stands if declined |
| Cancelled | Requester (unless they did it); desk if rooms were held | Copy to, on the desk mail | Reason |
| Day before check-in | Requester | — | Rooms, directions, what to bring |
| Daily | Each reviewer with a non-empty queue | — | One digest, not one mail per request |
| Daily | Manager + caretaker | — | Per guest house: the day-wise log |
| Pending > 48 h | Reviewer | Manager | Escalation nudge |

The separate "Cancellation requested — for your information" mail to
reviewers (`booking.cancellation_requested.reviewer`) was retired: they are CC
on the manager's mail instead. The key stays in the union for old outbox rows
and is hidden from the template editor (`RETIRED_MAIL_EVENTS`).

`email_outbox.cc_emails` has existed since migration 10, and every transport
already sent CC (`SmtpMailer`, `FileMailer` writes a `Cc:` header,
`DryRunMailer` logs it), so Phase 2 needed **no migration** — the change is who
goes in it. Addresses the office adds to a template's CC in Email Templates are
merged into the same CC line.

**Digests matter more than they look.** Per-request mail to a warden during
fest week trains them to filter the portal into spam, and then the portal stops
working. The manager is deliberately *not* digested — their pending
allocations are a section of the daily desk report, and two mails listing the
same queue is how a report stops being read.

### Recipients come from `canReview()`

`reviewersFor()` filters profiles through the very predicate that decides
whether their button works. Re-deriving "wardens of this hostel" in the mail
layer would be a second copy of the scoping rule, and the two would drift — the
Malhar warden would start getting mail about Saveri students while still,
correctly, being unable to act on them. `canReview` also refuses
`reviewer.id === requester.id`, so the IAR Office is never asked to approve its
own booking.

### Threads: per booking for staff, standalone for requesters

From the meeting notes: *"Email — try to send in a single thread instead of a
standalone email."* Staff mail about a booking joins that recipient's thread
**for that booking**; the scheduled mail that has no booking (digest,
escalation, desk report) joins a **daily log** thread; requester mail stands
alone with a `[reference]`-led subject. Two things must line up for mail
clients to group messages:

1. `bookingThreadRoot(referenceId, address)` — or `dailyThreadRoot("daily_log",
   day, address)` for the scheduled mail — is a deterministic root
   `Message-ID`; the first message actually **sent** claims it (decided in
   `dispatch.ts`), and every later one sets `In-Reply-To` / `References` to it.
2. Every message in a thread shares the thread's subject
   (`[IITPKD-GH-2026-AB12C] Guest house booking`, or `Guest house daily log —
   Mon 21 Sep 2026`); what the message is about moves to its heading and inbox
   preview.

Threaded mail is queued **one message per To address** (a message carries one
`References`). **CC rides on the first To's message only**, so a copied
warden or HOD receives it once and it joins that recipient's thread — every
later message about the same booking to the same To carries the same root.

> **Was per person per *day* until 23 Sep 2026.** Threading on the day grouped
> by when a message happened to be queued, so unrelated requests shared a
> conversation and one booking's messages were split across days. See
> [03-decisions.md](03-decisions.md), "Mail threads on the booking, not on the
> day".

### HTML and text from one description

`render.ts` takes a list of blocks (`paragraph`, `facts`, `callout`, `table`,
`list`, `button`, `note`) and renders both bodies. A template that wrote the
two separately would drift until the text part was wrong — and the text part is
what every HTML-refusing client and every screen reader reads.

Email constraints baked into the markup: tables for layout, inline styles only
(Gmail strips `<style>`), no external images (blocked by default, and the
portal may be on localhost). The header still uses the pre-redesign amber (dark brown on amber, which
passes WCAG AA); restyling mail to the site's navy/gold is an open item.

**Never put an ID document link in a mail body.** Reviewer mail says the
documents are in the portal and links to the page.

### `MAIL_REDIRECT_ALL_TO` is applied at send time

The outbox always records who the message was genuinely for; the redirect
rewrites the envelope in `dispatch.ts`. So flipping the variable changes where
mail goes without rewriting history, and the console's outbox still answers
"was the warden *supposed* to get this?". The redirected copy carries an
`X-Original-To` header and a banner in the body, because the header is exactly
what nobody looks at when wondering why a test mailbox is full of other
people's bookings. **CC is swallowed too**: the redirected message has an empty
CC, `X-Original-To` holds the original To and `X-Original-Cc` the original CC,
and the banner names both.

Set it on every non-production deployment. Without it, one person pointing a
staging server at real data mails a real parent.

### Idempotency is the whole safety story

`email_outbox.idempotency_key` is unique, and `enqueueEmails` inserts with
`on conflict do nothing`. The key is
`event:booking:stamp:recipients` — the stamp being the booking's `updated_at`
for a transition, or the institute calendar date for a digest. That gives:

- a retried server action queues nothing new;
- a digest is once per reviewer per day, so **the cron schedule is advisory** —
  a missed 8am run still delivers at 9am and a second run at 9:05 does nothing;
- two dispatchers never send the same message, because claiming is a single
  `for update skip locked` statement (`claim_queued_emails`, migration 10).

### Scheduling

`/api/mail/dispatch` drains the outbox; `/api/mail/cron` runs the daily jobs
and then drains. Both accept GET and POST (cron runners disagree), and both are
guarded by `CRON_SECRET` — **required in production**, optional outside it so
`npm run dev` stays usable. 8am IST is `30 2 * * *` in UTC.

### The Mail Outbox console

`/admin/mail` (manager and developer, behind the console lock) lists the queue, what
failed and why, and offers Retry, "Send queued now" and "Send a test message".
The test goes through the queue rather than calling the transport directly, so
a pass proves the whole path and not merely that a password was accepted.
Bodies are deliberately not returned to the client: the question there is
delivery, and the content is the booking, one click away in All Bookings.

