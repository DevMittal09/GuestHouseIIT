# Known gaps and next steps

Ordered roughly by priority.

## 1. Real authentication (blocks production)

Replace `getCurrentUser()` in `lib/auth.ts` with Supabase Auth or institute SSO,
delete both sign-in doors (the credential form on `/` and the persona picker at
`/mock-login`) along with `DEMO_PASSWORD`, and switch request-scoped database
access to the anon key so RLS becomes the real boundary. Everything else in the
app already re-checks authorization server-side, so this change is contained.

## 2. ~~Notifications and the day-wise occupancy report~~ ✅ Done

Shipped 16 Sep 2026 in `lib/mail/`, essentially as the sketch below proposed —
one `Mailer` seam mirroring how `lib/auth.ts` is the swap point for identity,
an env-configured transport, and a cron route. Differences from the plan, all
deliberate:

- **An `email_outbox` table (migration 10) sits between the action and the
  transport.** Sending inside the action would make the requester wait for
  SMTP, would raise the question of whether a failed send fails a booking, and
  on a serverless host would silently lose any un-awaited send.
- **The notification hooks are in the server actions, not
  `updateBookingStatus()`.** The store method sees a status pair; only the
  action knows *why* — which reason the reviewer typed, which rooms were
  picked, whether a cancellation was approved or declined. Hooking the store
  would also have mailed on the developer console's force-status override,
  which is a repair tool.
- **The mailed report is HTML tables, not a PDF**, exactly as predicted here:
  `lib/report-pdf.ts` is client-side (jsPDF, dynamically imported) and a cron
  job has no browser.
- **Digests, not per-item mail, for reviewers.** Per-request mail to a warden
  during fest week is how a portal gets filtered into spam.

Still open, and deliberately so:

- **No SMS.** It would be a second seam of the same shape; nobody has asked.
- **The cron is external.** `/api/mail/cron` and `/api/mail/dispatch` are
  ordinary routes guarded by `CRON_SECRET`; something has to call them
  (systemd timer, Vercel cron, `pg_cron` + `net.http_post`). Every job is
  idempotent per institute day, so a missed run self-heals on the next one and
  a double run sends nothing.

## 3. ~~Push the repository~~ ✅ Resolved

`git push` used to fail because the local GitHub identity is **Rizzwan285**
while the remote is `https://github.com/DevMittal09/GuestHouseIIT.git`. Access
has since been granted — pushes to `main` succeed as of 10 Sep 2026. If it comes
back it is still a credentials issue and not a code one: add Rizzwan285 as a
collaborator, use a DevMittal09 personal access token, or push to a repository
under Rizzwan285.

## 4. Automated tests

No framework is installed. The highest-value targets, in order:

1. `lib/workflow.ts` — status transitions, `canReview` and `historyScope`
   scoping;
2. `lib/booking-search.ts` — tokenizer, matchers, faceting, query-string
   validation (a throwaway suite of 43 checks already exists for this; it is
   worth keeping the next time someone installs a runner);
3. `lib/form-config.ts` + `lib/booking-schema.ts` — that `hidden` / `optional` /
   `required` produce the right schema, **and that the schema accepts its own
   output**: the form sends `parsed.data` and the server re-parses it, so a
   transform whose output is not a valid input breaks every submission. A
   throwaway suite of 15 checks covering that round trip for all six requester
   roles (plus that accepting null did not weaken the alumni / ID-number /
   parent-dependency rules) was written on 17 Sep 2026 when exactly that bug
   shipped — see [07-troubleshooting.md](07-troubleshooting.md);
4. occupancy overlap and `allocateRooms` clash re-checking;
5. `components/ui/time-select.tsx` conversion helpers;
6. `lib/mail/*` — rendering (HTML and text from one block list), outbox
   claim/retry semantics, and that recipients follow `canReview`. Throwaway
   suites of 23 + 18 + 22 checks were written with the mail layer on 16 Sep
   2026 but lived in a temp directory and are gone; they are worth recreating
   as real tests rather than rewriting as throwaways again.

Vitest fits the stack. Until then, the ad-hoc `npx tsx` approach in
[05-deployment.md](05-deployment.md#verifying-changes) works.

## 5. Accessibility pass

- White-on-amber buttons are low contrast (WCAG AA fails). Fix by setting
  `--primary-foreground` to a dark brown in `app/globals.css`.
- The room grid conveys availability through colour alone; add a text or icon
  indicator for colour-blind users.
- Audit focus order and labels in the multi-step booking form.

## 6. Features the Administration Section will likely ask for next

- **Booking modification** — currently a booking can be cancelled and resubmitted
  but not edited. Note that `room_holds.during` is built from the booking's
  dates, so any feature that changes dates must rewrite the holds through
  `set_room_holds()` (and may now legitimately fail on a clash).
- **Manager reassignment of rooms** after approval. `set_room_holds()` already
  replaces a booking's holds transactionally, so this is mostly UI.
- **Bulk room creation** — adding 20 rooms one at a time is tedious.
- **Attachments on rejection** so reviewers can explain with a document.
- **Per-guest-house managers.** The `gh_manager` role currently sees every guest
  house; the original spec hinted at separate managers per property. The data
  model supports scoping this the way wardens are scoped, via a field on the
  profile.

## 7. Operational hardening

- **Move archive keyword search into Postgres.** `SupabaseStore.searchBookings`
  scans up to 1000 candidate rows and refines in JS, because keyword matching
  spans joined tables. It flags `truncated` when it hits the cap. Once the
  archive is genuinely large, add a `tsvector` column on `bookings` maintained by
  a trigger (covering reference id, purpose, guest names) and push the match
  down. Raising the cap is not the fix.

- **Narrow `revalidatePath`.** All 11 call sites in `app/actions/bookings.ts`
  and `app/actions/admin.ts` use `revalidatePath("/", "layout")`, so every
  action re-renders every route and re-runs the layout's queries before the
  button's spinner clears. Scoping each to the routes it actually changes is
  the biggest code-level win for click latency (measured 17 Sep 2026 —
  see [07-troubleshooting.md](07-troubleshooting.md)). The catch: the 5 s poll
  is currently what makes *other* tabs notice a change, so narrowing
  revalidation and changing the poll have to be thought about together.
- Rate-limit booking submission.
- Decide a retention policy for uploaded Aadhaar/ID documents with the
  Administration Section, and implement deletion.
- Add a proper migration workflow if the schema starts changing regularly —
  today there are manual SQL files (e.g. `00000000000001_init.sql` and `00000000000002_booking_lifecycle.sql`).
- Replace the 5-second polling in `components/auto-refresh.tsx` with Supabase
  realtime subscriptions if queue volume grows. It re-renders the whole tree
  per open tab every 5 s, which against hosted Supabase is a continuous stream
  of queries competing with whatever the user just clicked. Raising the
  interval to 20–30 s is the cheap interim step; realtime is the real fix,
  because it pushes instead of polling and would let `revalidatePath` be
  narrowed at the same time.
