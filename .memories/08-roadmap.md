# Known gaps and next steps

Ordered roughly by priority.

## 1. Real authentication (blocks production)

Replace `getCurrentUser()` in `lib/auth.ts` with Supabase Auth or institute SSO,
remove the persona picker from `app/page.tsx`, and switch request-scoped database
access to the anon key so RLS becomes the real boundary. Everything else in the
app already re-checks authorization server-side, so this change is contained.

## 2. Notifications and the day-wise occupancy report (both asked for)

**Still the largest open gap, and it is two Administration Section requirements,
not a nice-to-have** — see the status table in
[01-background.md](01-background.md#follow-up-requirements-from-the-administration-section).

There is **no mail transport anywhere in the project**: no `nodemailer`, no
provider SDK, no SMTP settings in `.env.example`. That single missing piece
blocks both of these:

- **Email on room allocation** (requirement 5). Requesters currently have to
  open the dashboard to learn a decision. `allocateRooms()` in
  `app/actions/bookings.ts` is the hook point for the allocation mail, and
  `updateBookingStatus()` is the funnel every other transition passes through —
  submitted, approved at each tier, rejected (with reason).
- **A day-wise guest house log / occupancy report mailed to the GH Manager**
  (requirement 3). The *content* already exists: `exportHistoryPdf`
  (`app/actions/history-pdf.ts`) plus `lib/report-pdf.ts` render an A4-landscape
  report from the same search criteria, and `listRoomOccupancy` gives per-room
  occupancy for a date range. What is missing is a scheduled job and delivery.

Do them together. Sketch: a `lib/mail.ts` with one `sendMail()` seam (mirroring
how `lib/auth.ts` is the single swap point for identity), an env-configured
transport, and a daily cron — Supabase Edge Function + `pg_cron`, or a Vercel
cron route — that builds the previous day's occupancy and posts it to the
manager's address. Keep the render server-side for the mailed copy;
`lib/report-pdf.ts` is client-side (jsPDF, dynamically imported), so the mailed
report needs either a server-side renderer or an HTML table body.

## 3. Push the repository

`git push` currently fails: the local GitHub identity is **Rizzwan285** while the
remote is `https://github.com/DevMittal09/GuestHouseIIT.git`, which denies write
access. This is a credentials issue, not a code issue. Options: add Rizzwan285 as
a collaborator, use a DevMittal09 personal access token, or push to a repository
under Rizzwan285. Two commits are ready on `main`.

## 4. Automated tests

No framework is installed. The highest-value targets, in order:

1. `lib/workflow.ts` — status transitions, `canReview` and `historyScope`
   scoping;
2. `lib/booking-search.ts` — tokenizer, matchers, faceting, query-string
   validation (a throwaway suite of 43 checks already exists for this; it is
   worth keeping the next time someone installs a runner);
3. `lib/form-config.ts` + `lib/booking-schema.ts` — that `hidden` / `optional` /
   `required` produce the right schema;
4. occupancy overlap and `allocateRooms` clash re-checking;
5. `components/ui/time-select.tsx` conversion helpers.

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

- Rate-limit booking submission.
- Decide a retention policy for uploaded Aadhaar/ID documents with the
  Administration Section, and implement deletion.
- Add a proper migration workflow if the schema starts changing regularly —
  today there are manual SQL files (e.g. `00000000000001_init.sql` and `00000000000002_booking_lifecycle.sql`).
- Replace the 5-second polling in `components/auto-refresh.tsx` with Supabase
  realtime subscriptions if queue volume grows.
