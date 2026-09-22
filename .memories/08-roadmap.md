# Known gaps and next steps

Ordered roughly by priority.

## 1. Real authentication (blocks production)

**Mostly done (Phase 8, 22 Sep 2026).** Sessions are rows in `sessions` with an
opaque token in the cookie, 30 minutes idle and 12 hours absolute, rotated on
privilege; "Sign in with Google" is the real OpenID Connect flow (state, PKCE,
the id_token verified against Google's JWKS, institute domains only); the
developer sign-in doors refuse to exist in a production build, and
`instrumentation.ts` will not start one that is not fit. Developers have a
second factor and are asked for it again before role changes, Settings and
deletes. Details in [14-security.md](14-security.md).

Still to do, and both are environment or plumbing rather than design:

- **Connect the institute directory** (env only) and load the real usernames
  ([11-ldap-accounts.md](11-ldap-accounts.md) §3). Until `LDAP_URL` is set the
  dummy accounts work, and their passwords are published in this repository —
  so this gates the first real deployment.
- **Connect the academic database** behind the Requester details card —
  `ACADEMIC_DB_URL` for an API on the documented contract, or a new
  `AcademicSource` for anything else. Dummy records until then
  ([12-academic-records.md](12-academic-records.md) §4).
- **Switch request-scoped database access to the anon key** so RLS becomes the
  enforcement boundary rather than a second line behind the server. Every table
  has RLS on with no `authenticated` write policy, and the policies are tested
  in the migration harness, but the server still reaches the database with the
  service-role key. This is the next security phase.

Everything else in the app already re-checks authorization server-side, so
that last change is contained.

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

## 4. ~~Automated tests~~ ✅ Done, and what is still thin

**Vitest since 21 Sep 2026** (`npm test`, `tests/`, 192 checks) and
**Playwright since 23 Sep 2026** (`npm run test:e2e`, `e2e/`), both run by
`.github/workflows/ci.yml` on every push and pull request along with lint and
`npm run typecheck`. The end-to-end journeys walk a student's stay from request
to a paid invoice, a faculty official stay through the HOD, a dining booking,
and the public site at 320 px — against a **production build on the mock
store**, on a throwaway database file.

Two defects the journeys caught that the unit tests could not: a checked-out
stay could not be invoiced at all, and a meals-only booking could not be
submitted. Both are written up in
[06-decisions.md](06-decisions.md#phase-9-performance-and-tests-2223-sep-2026).

Still thin, in order of what would catch the most:

1. the mail layer — rendering, outbox claim and retry, and that recipients
   follow `canReview`;
2. the availability grid's overlap arithmetic, beyond what the store tests
   cover;
3. an end-to-end pass for the developer console: Settings, tariffs, units;
4. accessibility assertions inside the Playwright run (axe) rather than by eye.

The original list of targets, all of which now have unit coverage:

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

- ~~White-on-amber buttons are low contrast (WCAG AA fails).~~ Fixed 19 Sep
  2026 by the redesign: primary is navy with white text (≈13:1), and gold
  buttons carry navy text. The public site was checked at 320 px (no page
  scroll, one `<h1>` per page, labelled fields, gold focus ring) — see
  [10-ui-design.md](10-ui-design.md).
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
- **"Copy to" as real mail, or HOD approval for offices.** The Requester
  details card shows Copy to but sends nothing; the office's HOD hears nothing
  today. Also: snapshot the academic record onto the booking if reviewers need
  the requester's phone, and fill `hostel_name` from the record at sign-in so
  warden routing stops depending on a hand-typed profile field
  ([12-academic-records.md](12-academic-records.md) §5).
- **Attachments on rejection** so reviewers can explain with a document.
- **Per-guest-house managers.** The `gh_manager` role currently sees every guest
  house; the original spec hinted at separate managers per property. The data
  model supports scoping this the way wardens are scoped, via a field on the
  profile.

## 7. Operational hardening

- ~~**Move archive keyword search into Postgres.**~~ ✅ Done (migration 22,
  Phase 9). `bookings.search_text` is a **generated** tsvector — no trigger to
  keep in step — with a GIN index, and `SupabaseStore.searchBookings` pushes
  the keyword down, falling back to the unfiltered scan when it matches
  nothing. Guests' names are deliberately not in the vector: personal data in a
  column anything can query. The JavaScript matcher still covers them for the
  staff allowed to see them.

- ~~**Narrow `revalidatePath`.**~~ ✅ Done (Phase 9). `lib/revalidate.ts` names
  the three sets that change together — booking views, console views,
  everything — in place of 25 whole-application invalidations. As predicted
  here, it had to be done together with the polling: it was, in the same phase.
- ~~Rate-limit booking submission.~~ ✅ Done (Phase 8): throttles live in the
  database (`hit_rate_limit`), so they survive a restart and are shared between
  instances.
- ~~Decide a retention policy for uploaded Aadhaar/ID documents with the
  Administration Section, and implement deletion.~~ ✅ Implemented (Phase 8):
  `id_retention_days` (Setting, default 365) erases identity fields and their
  documents nightly. **The office still has to confirm the number** — see the
  Settings the office must fill in, in [05-deployment.md](05-deployment.md).
- Add a proper migration workflow if the schema starts changing regularly —
  today there are manual SQL files (e.g. `00000000000001_init.sql` and `00000000000002_booking_lifecycle.sql`).
- ~~Replace the 5-second polling in `components/auto-refresh.tsx` with Supabase
  realtime subscriptions.~~ ✅ Done (Phase 9). `components/live-updates.tsx`
  subscribes to `postgres_changes` on bookings, room holds, blocks and
  invoices, and polls every 30 seconds only where there is no Supabase to
  subscribe to. A reception screen open for a shift made ~5,800 requests and
  now makes one subscription.

## 8. Public website follow-ups (from the 19 Sep 2026 redesign)

Everything tagged `TODO(site)` in `lib/site.ts` and `lib/site-content.ts`:
confirm the guest house phone and email, a guest-house map pin, the guidelines
PDF URL (the download button appears once `GUIDELINES_PDF_URL` is set), the
amenity lines and house rules, and which guest house each photograph shows (so
the Gallery can have per-guest-house sections and the home cards get covers).
Optionally restyle the mail templates to the navy/gold palette. Detail in
[10-ui-design.md](10-ui-design.md).
