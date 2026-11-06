# Recent changes - the last round, and only the last round

This file is **replaced** every round, not appended to. The round before this
one is written up where every round is: what was asked in
[01-background.md](01-background.md), why it was done that way in
[02-decisions.md](02-decisions.md).

---

## Round of 6 November 2026

Two pieces of work the same day. The sign-in one is **on `main` and pushed**
(`c62cb5f`); the integration is on **`integration/main-into-production`** and
has that commit merged in.

### Part 1 - mock authentication beside Google (on `main`)

> The owner: *"Can you add mock authentication along with google oauth in the
> sign in page for now. Right now its only google oauth."*

The owner had put `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` into
`.env.local` and the account picker vanished - which is what
`mockLoginEnabled()` was written to do on 28 Oct 2026. The rule became **where**
rather than **whether**: outside production both doors are drawn (Google solid
with its mark, **Mock Authentication** outlined beneath), and in production
nothing changed. `MOCK_LOGIN=true` is now a startup error rather than a way to
force the picker open. `LoginForm` takes `doors: { google, mock }`.

It also found the **e2e suite broken by those credentials**: Next loads
`.env.local` for `next start`, so the Playwright run had become a
Google-configured deployment and all 55 journeys were failing at sign-in.
`playwright.config.ts` now pins `GOOGLE_CLIENT_ID=""`, and on this branch
**`DATABASE_URL`, `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` as well** -
without those the suite would have selected `PostgresStore` against the real
project and put every e2e ID document into the production `documents` bucket.
`ALLOW_MOCK_STORE` only tells `assertEnv()` not to insist on them; it does not
unset them.

Reasoning in [02-decisions.md](02-decisions.md), *Mock authentication stands
beside Google*.

### Part 2 - integrating `main` into `production_migration`

Two branches had diverged for a week: **3 commits on `main`** (the owner's
sixteenth list, the MS/PhD spouse rule, user groups and login blocking) and
**13 on `production_migration`** (another developer's rewrite of the data layer
from the Supabase JS client to direct PostgreSQL over `pg`, plus the
institute's own data tables, a CSV/XLSX import and a security pass). The merge
base is `fb696f6`, 28 Oct 2026.

The owner's brief: `production_migration` becomes the one working branch; keep
**Supabase as the database host**; keep **every existing row**; lose nothing
from either side; and treat the hosted project as production, never as a test
database.

The work is on **`integration/main-into-production`**, a real merge commit with
both parents. `main` and `production_migration` are untouched, and
`backup/main-pre-integration` / `backup/production_migration-pre-integration`
tag where each stood. Nothing has been pushed, and nothing has been run against
the hosted project.

### What the two branches actually disagreed about

36 files were touched by both. Eleven content conflicts and four
delete-against-modify ones; each resolution is in
[02-decisions.md](02-decisions.md). Four things mattered more than the rest,
and three of them were **silent**:

1. **Git took `production_migration`'s deletion of the entire migration
   history.** All 34 files in `supabase/migrations/`, all ten in
   `supabase/repairs/` and `supabase/seed.sql` had been deleted there and
   replaced by one consolidated `scripts/init-postgres.sql`; `main` had not
   touched them, so the merge removed them **without reporting a conflict**.
   They are the applied history of the live database. **Restored, all 45
   files.**

2. **`scripts/init-postgres.sql` could not run the application.** It declared
   `booking_status` with `PENDING_WARDEN_REVIEW`, `PENDING_FA_REVIEW` and
   `PENDING_IAR_REVIEW`; the code on **both** branches writes
   `PENDING_WARDEN`, `PENDING_FA`, `PENDING_IAR`. Checked against a throwaway
   Postgres: `select 'PENDING_WARDEN'::booking_status` is an error on a
   database built from that file, so **no student, club or IAR booking could be
   stored at all**. It had also lost `bookings_debit_head_check`,
   `bookings_meals_shape` and `projects_title_check`; turned
   `bookings.project_id` from `on delete restrict` into `on delete set null`
   (deleting a project would silently blank the debit reference on every
   booking charged to it); replaced `room_holds`' `(booking_id, room_id)`
   primary key with a surrogate `id`; and dropped `NOT NULL` from
   `booking_guests.gender` and `bookings.copy_to_emails`. **The file is
   deleted.** A hand-maintained second copy of 37 migrations will drift again;
   the migrations are the one source of truth, and the 19 "apply
   scripts/init-postgres.sql" messages in the code now name the migration that
   adds the thing.

3. **`profiles_v` would have emptied every warden's scope.** The rewrite drops
   `hostel_name`, `department_or_club`, `roll_number` and `staff_category` from
   `profiles` and resolves them from the institute tables at read time - which
   is the better design, and is where this is going. But those tables are
   **empty on this project**, and `profiles.hostel_name` is what `canReview()`
   and `routeFor()` scope a warden and a student's approval route by. A view
   reading the institute tables alone would have returned NULL for all of it,
   with no error anywhere: a student's booking would simply have stopped
   routing to their Assistant Warden. The columns are **kept**, the view
   `COALESCE`s institute-first-stored-second, and migration 37 backfills.

4. **An email + password sign-in door had been added**, with
   `setUserPasswordAction` requiring `requireConsole("users")` but **not** the
   TOTP step-up that `deleteUserAction` requires - so the console unlock (a
   shared secret, default `0000`) was enough to set the developer's password
   and sign in as them: a shorter path to every protected operation than the
   one the step-up exists to guard. Minimum length was 4 characters. The
   owner's decision was to **drop it**, Google only.
   [`archive/password-sign-in/`](../archive/password-sign-in/) keeps it
   verbatim, with the two defects named and the restore written out.

### The architecture now

| Concern | Before | Now |
| --- | --- | --- |
| SQL | Supabase JS → PostgREST | **`pg` straight to Supabase Postgres** (`lib/db/client.ts`) |
| Documents | Supabase Storage | **Supabase Storage** (`lib/storage/`) - *not* the local folder the rewrite used |
| Sign-in | Google / LDAP / account picker | **Google / LDAP / account picker** - the password door is withdrawn |
| Live updates | Realtime websocket | **Polling, 30 s** - which also takes the anon key out of the browser |
| RLS | enabled, `authenticated` surface closed by migration 31 | **unchanged, and it still matters**: PostgREST is still listening on the project and the anon key is public |
| Academic data | `academic_records`, one flat table | **six institute tables**, with `academic_records` kept and backfilled from |

The one new seam is `lib/storage/`: `getDocumentStore()` picks the Supabase
bucket when `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set and a local
folder otherwise - the same shape of decision as `getStore()` and
`getMailer()`. `assertEnv()` refuses to start a production server with no
storage configured, so the folder cannot be reached by accident in production.

`PostgresStore` also gained everything `main` had added to `SupabaseStore`:
`tariff_scope` on a status update (migration 35), the four user-group methods
and `updateProfiles` (migration 36), and `profileWriteError`'s mapping of the
LDAP-uniqueness and group-not-found cases. Its three profile writers build
their column list from the keys of the object they are handed, so they now go
through a `PROFILE_COLUMNS` allow-list: an unexpected key would become an
identifier in SQL, and identifiers cannot be parameterised.

### Migration 37

One migration,
[`00000000000037_institute_tables_and_profiles_view.sql`](../supabase/migrations/00000000000037_institute_tables_and_profiles_view.sql),
in eleven guarded sections. Expand only - **nothing is dropped**:

- the six institute tables (`institute_hostels`, `institute_students`,
  `institute_employees`, `institute_offices`, `institute_fcc`,
  `institute_wardens`), each with RLS enabled and no `authenticated` policy;
- **backfilled from `academic_records`**, which is kept intact, and then from
  `profiles` for the people the portal knows but the office has not pasted in -
  a student's hostel and roll number, a warden's hostel, an employee's
  department and staff category;
- `profiles.account_status` (the office's word for *why* an account has gone),
  defaulted to `active`, with accounts already blocked under migration 36 given
  `relieved` so a status and a timestamp cannot disagree;
- the four `units` column renames the rewrite needs (`kind` → `category`,
  `office_class` → `office_type`, `parent_id` → `parent_department_id`,
  `hod_unit_id` → `hod_approval_from_id`) - renames, so no data moves, and
  `units` is empty on this project anyway;
- `profiles_v`, `security_invoker`, with the COALESCE described above.

**Verified on a throwaway `postgres:16-alpine`**, never on the hosted project:
migrations 1-36 applied, a production-like fixture loaded (10 profiles
including a day scholar with no hostel and an account blocked under migration
36, 8 academic records, 2 bookings with holds, guests and logs), then 37
applied. Row counts in every pre-existing table **identical** before and after;
`profiles_v` reproduces the old `profiles` scope row for row; and with the four
`profiles` columns deliberately blanked inside a transaction, the institute
tables alone still resolve every hostel, roll number and staff category -
which is what makes the later contract step safe. 37 runs three times with no
error.

### What the e2e suite found, once it could run at all

The 55 journeys had not been runnable on `production_migration` since its
security pass, so they were the first real check of the merged tree. Six
defects, all of them in the rewrite and none visible from a build:

1. **`ALLOW_MOCK_STORE=true` exempted `DATABASE_URL` and nothing else**, so
   `next start` refused to boot once Google became a production requirement and
   the only symptom was Playwright timing out on its own web server.
   `isRealDeployment()` (`lib/env.ts`) is now the one name for "a production
   build with real services behind it", and the whole set is exempted together.
2. **`E2E_TEST_SECRET` was set for the server only.** `signIn()` reads it in
   the *runner* to put in the request body, so every journey failed before
   opening a page. `playwright.config.ts` now assigns it in both.
3. **The factory-password guard refused the suite.** The same pass added "no
   console action in production while the password is still `0000`" - right,
   but it asked `NODE_ENV` rather than `isRealDeployment()`, and a mock-store
   server has no records to protect. (Its message also carried an em dash,
   which `AGENTS.md` bans in source.)
4. **`e2e/helpers.ts` derived the unlock cookie's name from the runner's
   `NODE_ENV`**, so against a production server it looked for the unprefixed
   name, never cached the unlock, re-typed the password in every console spec
   and hit the 6-per-15-minutes throttle. It showed up as **eight unrelated
   console journeys** failing on a lock screen that would not go away.
5. **`resolveComputed()` in the mock store had the `profiles_v` bug**, which is
   why it is worth saying twice: it read the institute tables *only*. A roll
   number written by the import read back as null, so re-pasting the same sheet
   reported every row as changed. `tests/profiles-view-parity.test.ts` is new
   and asserts the property directly - a profile reads back what was written to
   it - because `tests/user-import-idempotency.test.ts` missed it (its sheet
   carries no roll number).
6. **The import's undo had been cut from eight restorable fields to four**,
   dropping hostel, department, roll number, LDAP username and staff category.
   An undo would have reported success and silently not restored a warden's
   hostel. `AGENTS.md` names eight; all of them are back.

Two smaller ones: the academic-records console's textarea had been relabelled
"Or paste", which names the field's relationship to its neighbour rather than
its content (a screen reader announced nothing useful, and the file picker's
own button already carries the contrast), and the seeded institute row for the
**day scholar** named neither parent - which `guestNameRule` reads as "withhold
Father and Mother", leaving the demo day scholar unable to book for a parent.

### Left open

[03-roadmap.md](03-roadmap.md) has the list. The two that block a deployment:

- **`DATABASE_URL` is not set anywhere yet.** `.env.local` has the Supabase
  project URL and the service-role key but no connection string, so the portal
  still runs on the mock store. Which pooler to use, and the TLS note, are in
  `lib/db/client.ts`.
- **Migrations 31, 33, 34, 35, 36 and 37 are not applied to the hosted
  project** (1-30 and 32 are, re-verified 27 Oct 2026). 31 and 37 are the two
  that are *not optional once this branch is deployed*. Running them is a
  production change and needs the owner's go-ahead, a backup and the order in
  [04-production.md](04-production.md).
