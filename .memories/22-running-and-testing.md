# Running, testing, and every trap already hit

How to run the portal on a developer machine, point it at a database, prove a
change works — and, in Part 3, every error this project has already produced
with its cause and its fix. Read Part 3 before debugging anything that smells
familiar: most of it cost hours the first time.

Deploying and operating it live is [04-production.md](04-production.md); every
login and secret is
[05-credentials-and-security.md](05-credentials-and-security.md).

> **Node 20.** The machine's default Node is v18 and Next.js 16 needs
> ≥ 20.9. Load nvm first in every new shell:
> `export NVM_DIR="$HOME/.nvm" && . "$NVM_DIR/nvm.sh" && nvm use 20`.

---

## Part 1 — Running it

### Local, zero setup

```bash
npm install
npm run dev            # http://localhost:3000
```

With no Supabase variables set, the app uses the mock store: data in
`.local-db.json`, uploads in `.uploads/` (outside `public/`), mail written to
`.local-mail/*.eml`, and sign-in with the dummy LDAP accounts
([05-credentials-and-security.md](05-credentials-and-security.md)). The one-click
persona picker — **Mock Authentication** on the sign-in card — is open whenever
Google sign-in is not configured (`mockLoginEnabled()` in `lib/env.ts`), so it
works in a plain `npm run dev` with no flag. Everything works — every booking
form, all approval tiers, the room grid, invoices, the desk and the console.

> **This machine's `.env.local` points at the hosted Supabase project.** A
> plain `npm run dev` therefore reads and writes the shared database. For
> anything that creates or changes data, run
> `NEXT_PUBLIC_SUPABASE_URL= npm run dev` — the empty value in the process
> environment beats `.env.local` and selects the mock store.

`next dev` refuses to start if another dev server is already running. Check port
3000 before launching a second one. **`npm run build` kills a running
`next dev`** (both write `.next/`), so build first and start the server after.

### The test suites

| Command | What | Notes |
| --- | --- | --- |
| `npm run lint` | ESLint incl. the strict React Compiler rules | must stay clean |
| `npm run typecheck` | `next typegen && tsc --noEmit` | `npm run build` also typechecks |
| `npm test` | Vitest, `tests/` — 24 files, 431 checks (8 Oct 2026) | mock store on a throwaway file (`MOCK_DB_PATH`), `TZ=UTC`; never touches `.local-db.json` |
| `npm run test:e2e` | Playwright, `e2e/` — 36 journeys (about 70 s) | needs a prior `NEXT_PUBLIC_SUPABASE_URL= npm run build`; starts `next start` on :3100 against `./.e2e-db.json` (wiped by `e2e/global-setup.ts`) |
| `npm run check:migrations` | Which migrations the project in `.env.local` actually has | **Read-only** (`GET`, one row, shape only). Exits 1 if any marker is missing. Migrations 17 and 23 are function-only and cannot be seen — it says so and gives the SQL. **Not a CI step** — CI runs with no secrets, where it prints "no project configured" and exits 0. Run it against a deployment, before relying on one |
| `npm run check:lockfile` | The npm optional-dependency bug that breaks `npm ci` | Runs in CI |

Playwright journeys: `booking-journey` (student → warden → manager → desk →
invoice → paid), `official-and-dining` (faculty through the HOD; a meals-only
booking), `club-booking` (a club cannot book; its Faculty Advisor books from a
faculty login, straight to the manager, secretary pre-filled in Copy to),
`faculty-advisor-console` (changing a council's advisor in Departments & Clubs
moves who can book), `room-party` (2 guests + 2 infants in a room),
`alumni-and-relationships` (Student Cell alumni booking; no second Mother),
`sign-in` (Mock Authentication on a production build), `desk-links`
(Reception → kitchen → back; the developer turned away from New Booking; the
help line's number), `public-site` (320 px, desktop and phone), and
`fifth-round` (25 Sep 2026, rewritten 7 Oct: a student's Father **taken from
the record and locked**, the infant card, the warden's "✓ Matches record";
reception moving a check-in both ways; an invoice whose grand total follows
typed breakfasts and a "Broken vase" additional charge, then issued, then the
manager closing the stay off unpaid with a reason and finding it under
Awaiting payment), and `eighth-round` (7 Oct 2026: a student's form — one
guest house, no meals, no debitable head, the rates; the faculty rates and the
head question; **Change rate**; a record pasted into the console locking that
student's parents; and the whole **Missed** journey — a stay booked from
midnight this morning, the cron route POSTed as the runner does, the requester
told, the manager reinstating it, and the next two runs marking nothing).

> **The Missed journey books a stay from midnight today**, which is the
> earliest check-in the form accepts and is by definition already past. That
> is what makes a genuinely lapsed request reachable through the UI rather
> than forced with the developer's repair tool — which would not work anyway,
> since forcing a status needs a developer's TOTP step-up and the e2e
> developer has none enrolled.

**Each account signs in through the form once per run** (25 Sep 2026).
`signIn()` in `e2e/helpers.ts` keeps each account's session cookies for the
rest of the run and reuses them, falling back to the form if the server no
longer knows the session. The sign-in throttle counts every attempt (8 per
username per 15 minutes), and the suite had come to need the manager nine
times — the last journeys failed at sign-in with "Too many attempts", which
looked like broken tests. Keep it; a journey that must see the form itself
signs in without the helper (`sign-in.spec.ts`).

**Pick a room once the grid has loaded.** The allocation grid draws its tiles
before the stay's occupancy arrives ("Loading occupancy…"), so a tile clicked
at once may turn out to be inside another stay's turnaround and the dialog
asks for **Override & Allocate** instead. `fifth-round.spec.ts` waits for the
loading line to go and picks a tile whose title has its "Occupancy:" line —
only a simply free room's does.

A clean e2e loop — and kill a leftover server with a pattern that cannot match
its own shell (`pkill -f "[n]ext start"`; a bare `pkill -f "next start"` in the
same command kills that command, exit 144):

```bash
pkill -f "[n]ext start"
NEXT_PUBLIC_SUPABASE_URL= npm run build
NEXT_PUBLIC_SUPABASE_URL= npm run test:e2e
npm run build        # rebuild normally afterwards if you will `next start` against Supabase
```

CI (`.github/workflows/ci.yml`) runs lint, typecheck, unit tests, a mock-store
build and the journeys, **with no secrets at all**.

### Local with Supabase

Requires Docker.

```bash
npm install -g supabase      # or: brew install supabase/tap/supabase
supabase start
supabase db reset            # applies migrations + seed
supabase status              # prints URL, anon key, service_role key
```

### Hosted Supabase

1. Create a project at https://supabase.com/dashboard.
2. In the SQL Editor run **every file in `supabase/migrations/` in numerical
   order** (there are 25 as of 24 Sep 2026 — count the directory, not this
   sentence), then `supabase/seed.sql`.
3. Copy the keys from **Project Settings → API**.

> **Migrations are not applied automatically and an existing project will not
> pick up new ones.** After pulling changes, check whether
> `supabase/migrations/` has grown. Missing migrations rarely fail loudly:
> reads degrade and writes fail. Migrations 6 to 8 are the classic example —
> the booking insert names `meals` and `has_infant`, and migration 6's check
> refuses a per-day plan until 8 replaces it, so until all three are applied
> **submissions fail** while every page still renders. The same shape of
> problem applies to the Sep 2026 work: without 17 there are no Settings rows
> to read, without 19 no invoice can be numbered, without 21 nobody can sign
> in at all, and without 22 the archive search falls back to its scan.

Either way, fill `.env.local` and restart the dev server:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
SUPABASE_SERVICE_ROLE_KEY=<service role key>
```

The store switches automatically — no code change. `.env.example` documents these
variables; `.env.local` is gitignored and must stay that way.

> **The service-role key is a full-access credential.** Never commit it, never log
> it, never expose it to the client. The server uses it for **every** database
> read and write (it bypasses row-level security), and the console uses it to
> create Supabase Auth users.

The hosted project has the schema, seed data and the private `documents`
bucket.

**Which migrations it has is a question for the database, not for these
notes** (9 Oct 2026):

```bash
npm run check:migrations      # node scripts/check-migrations.mjs
```

It reads `.env.local`, asks the project whether each migration's marker - the
table, column or enum value that migration created - exists, and prints one
line each. **Read-only**: every request is a `GET` of at most one row, and
only the shape is read, never anybody's data. It exits 1 if anything is
missing, so a deploy step can gate on it.

> **This replaced a paragraph that was wrong for weeks.** The note used to say
> "which migrations it has is not recorded here", followed by a hand-written
> SQL query whose marker list stopped at migration **25**. So 26 onwards could
> not be checked at all, and the prose claim that 24-30 were "outstanding on
> the hosted project" was carried forward from round to round by hand - long
> after the owner had applied them in the SQL editor. A missing migration fails
> writes quietly; a migration *wrongly believed* missing sends somebody to
> re-apply files that were already there. Both are ended by asking.
>
> **Verified 9 Oct 2026: migrations 1-30 are all applied** on the hosted
> project (`azfd…`), except the two the script cannot see.

**The two it cannot see are 17 and 23**, which only add or replace a plpgsql
function - PostgREST cannot read `pg_proc`, and calling either function would
be a write. Run this in the SQL editor instead:

```sql
select proname from pg_proc
 where proname in ('set_booking_buffer', 'check_room_occupancy');
```

Both names present means both are applied. If in doubt, re-apply the file:
every migration from 6 onwards is re-runnable, so a file applied twice is
harmless. The observable symptom of **23** missing is that Supabase refuses a
*second* infant in one room although the form and the schema allow it; of
**17**, that changing the turnaround buffer in Settings fails.

The list, and what each migration needs, is in
[21-database.md](21-database.md#migrations).

`supabase/repairs/` holds one-off data fixes, some of which the hosted project
may still need — the timezone repair for bookings stored 5h30m late, the real
room numbers, all rooms double sharing, and the Bageshri ₹1,000 rate. The list
is in [21-database.md](21-database.md#one-off-repairs--supabaserepairs).

#### One-off repairs

`supabase/repairs/` holds data fixes that are **not** migrations and are never
applied automatically. Each file's header explains what it is for and how to
check whether it applies to your data. Read it, take a backup, and run it
deliberately in the SQL editor. They are not idempotent — the timezone repair in
particular would shift already-correct rows a second time if re-run.

### Verifying changes

**`npm test`** runs the Vitest suite in `tests/` (installed 21 Sep 2026). It
uses the mock store on a throwaway file (`MOCK_DB_PATH`) and `TZ=UTC`, so it
never touches `.local-db.json`. The techniques below are still how UI, HTTP
and migrations are checked.

> **The unit suite does not typecheck.** `npm test` passed with a fixture that
> named a column that does not exist; `npm run build` caught it. Run the build
> (or `npm run typecheck`) before calling a change done — twice in the 7 Oct
> round a test file was the only thing failing the build.

> **`npm run test:e2e` has a re-run trap** — a reused `next start` serving the
> previous build, which looks like an application bug. (The other one, a
> persisted throwaway database carrying the sign-in rate limit forward, was
> fixed on 23 Sep 2026 by `e2e/global-setup.ts`.) The clean loop is in
> [Part 2](#re-running-the-playwright-suite-bites-twice-23-sep-2026).

**1. Ad-hoc TypeScript tests**

```bash
npx tsx --tsconfig ./tsconfig.json /path/to/test.ts
```

Write them outside the repo (a temp directory); `@/` path aliases resolve fine.
Good for store operations, workflow transitions, form-config resolution and the
time-conversion helpers.

**2. HTTP smoke tests against a running dev server**

Since Phase 8 a session is a **row**, and the cookie holds an opaque token, so
there is no profile id to set by hand — a forged cookie gets nothing. Sign in
the way a person does and keep the cookie jar:

```bash
# Sign in through the LDAP form (dummy directory), keeping cookies.
curl -s -c jar.txt -b jar.txt http://localhost:3000/sign-in > /dev/null
# then drive the form in a browser, or use the end-to-end suite, which does
# exactly this: npm run test:e2e

# With a jar from a real sign-in, the ordinary checks still work:
curl -s -b jar.txt -o /dev/null -w "%{http_code}\n" http://localhost:3000/book
curl -s -b jar.txt -o /dev/null -w "%{http_code}\n" http://localhost:3000/admin/users
```

Use this to confirm a page renders (200) and that access control redirects
(307). For anything that needs a signed-in journey — scoping, approvals, the
desk, invoices — **`npm run test:e2e` is the tool**: it signs in through the
form as each role and walks the whole pipeline (`e2e/`).

**3. Migrations against a throwaway Postgres, never the hosted project**

Docker is installed and a `postgres:16-alpine` image is available locally. Plain
Postgres lacks Supabase's objects, so create stand-ins first, then pipe the
migrations in order:

```sql
create role authenticated nologin; create role anon nologin; create role service_role nologin;
create schema auth;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
create schema storage;
create table storage.buckets (id text primary key, name text, public boolean);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text);
```

```bash
docker run -d --name gh-migtest -e POSTGRES_PASSWORD=pw postgres:16-alpine
# wait until `docker logs` shows "ready to accept connections" twice (init restarts once)
{ cat stubs.sql; cat supabase/migrations/*.sql; cat checks.sql; } \
  | docker exec -i gh-migtest psql -U postgres -v ON_ERROR_STOP=1 -q -X
docker rm -f gh-migtest
```

**Without Docker (Windows, since 21 Sep 2026).** The same test on a real
PostgreSQL 16 server from the `embedded-postgres` npm package, installed in a
scratch directory (never in the repo):

```bash
npm install embedded-postgres@16.14.0-beta.17 pg   # in a scratch dir
```

A ~60-line Node script starts a cluster in a fresh temp directory with
`initdbFlags: ["--encoding=UTF8", "--locale=C"]` (the Windows default code page
rejects migration 12's `→`), runs a list of SQL steps in order with `pg`
(stand-ins, migrations, fixtures, checks — a step can be marked "must fail
with …"), prints result tables, then stops the server and deletes the
directory. The stand-ins above work unchanged; to run `supabase/seed.sql` as
well, add `create extension pgcrypto`, the extra `auth.users` columns the seed
names, and an `auth.identities` table. `auth.uid()` can read
`current_setting('request.jwt.claim.sub', true)` so RLS policies can be tested
per user with `set_config`.

Insert old-shape rows between the migration that created a shape and the one
that converts it, set `timezone` to something other than IST before converting,
apply the new migrations twice, and compare results with the TypeScript reader
on the same fixtures. That is how migrations 7 and 8 were checked.

**4. Client-rendered UI in headless Chrome** — *expensive; the owner asked for
cheaper checks first (tests, build, curl). Prefer the Playwright suite, which
drives a real browser already, and reach for this only when nothing else can
see the behaviour.*

Dialogs, the meal grid and the week/month charts only render after client-side
interaction, so `curl` cannot see them. `/usr/bin/google-chrome` is installed,
and Node 20 has a WebSocket client behind `--experimental-websocket`, which is
enough to drive Chrome over the DevTools protocol with no extra packages:

- launch `google-chrome --headless=new --remote-debugging-port=9333 --user-data-dir=<tmp dir>`;
- read the page's `webSocketDebuggerUrl` from `http://127.0.0.1:9333/json/list`;
- sign in through the page (or `Network.setCookie` with `gh_mock_user` = a
  profile id, honoured only under `DEV_LOGIN=true` in development),
  `Page.navigate`, then
  `Runtime.evaluate` to click and fill — set input values through the native
  `value` setter and dispatch `input` / `change`, or react-hook-form never sees
  them;
- `Page.captureScreenshot` with a `clip`, and subscribe to
  `Runtime.exceptionThrown` / `Runtime.consoleAPICalled` to catch client errors.

Two gotchas that cost a rerun: `innerText` applies CSS `text-transform`, so an
`uppercase` label reads "ROOMS SELECTED" (match on `textContent`); and panels
that finish loading move the page, so scroll, wait, and *then* measure the clip
— allowing for the sticky charcoal nav bar in the portal (~47 px since the
19 Sep 2026 restyle; it was a 56 px header before). For `next/image` photos,
scroll the whole page and wait ~1.5 s before a screenshot, or they are still
blank (26 Sep 2026).

Since the public website went in (19 Sep 2026), three more checks are cheap
and worth keeping: set the viewport to 320 px
(`Emulation.setDeviceMetricsOverride`) and assert
`document.documentElement.scrollWidth === 320` and one `<h1>` per page; fill the
sign-in form on `/book-room` and assert where `location.pathname` lands; and
list `[...document.images].filter(i => i.complete && !i.naturalWidth)` after
scrolling to the bottom to catch broken photos. Don't `pkill -f "next start"`
from the same shell command that mentions it — the pattern matches the shell
itself and kills it (exit 144); kill the PID from `ss -ltnp` instead.

**Point the dev server at the mock store for any test that writes.**
`.env.local` holds the hosted Supabase keys, so a plain `npm run dev` writes to
the shared database. `NEXT_PUBLIC_SUPABASE_URL= npm run dev` — the variable set
to an empty string — wins over `.env.local` (Next never overrides a variable
already present in the process environment), so `supabaseConfigured()` is false
and the mock store is used. Delete the `.local-db.json` it creates afterwards if
there was none before.

**5. Mail, without sending any**

Three ways, in increasing realism:

- **Pure logic** — `render.ts`, `templates.ts`, `thread.ts` and `redirect.ts`
  have no store or network dependency, so `npx tsx` covers them directly. Worth
  asserting: the plain-text part carries the same facts as the HTML (they are
  rendered from one block list and must stay that way), a rejection reason
  appears verbatim, dates render in IST, and a `purpose_of_visit` containing
  markup is escaped.
- **The outbox and the worker** — `chdir` to a temp directory **before**
  dynamically importing the store, because `MockStore` derives its paths from
  `process.cwd()` at module load. With no `MAIL_USER` set, `dispatchOutbox()`
  uses the `FileMailer`, so the assertions can read the `.eml` it wrote.
  `MAIL_DRY_RUN=true` sends nothing at all.
- **Live SMTP** — `tsx` does not read `.env.local` (Next does), so load it in
  the script. `new SmtpMailer(mailConfig()).verify()` proves the credentials
  without sending anything; `send()` then delivers one real message. With
  `MAIL_REDIRECT_ALL_TO` set it can only reach that mailbox.

Note that the test file must wrap top-level `await` in an async IIFE — this
tsconfig emits CJS, and esbuild refuses top-level await there.

**Always run before finishing:**

```bash
npm run build     # includes the TypeScript typecheck
npm run lint      # must stay clean
```

**6. Measuring performance — never in `next dev`**

Dev mode compiles on demand, ships source maps and runs the React Compiler
lint. Measured 17 Sep 2026 on identical data (5 bookings, 36 rooms), warm:

| Route | `next dev` | `next start` |
| --- | --- | --- |
| `/dashboard` | 175 ms | 21 ms |
| `/warden` | 159 ms | 24 ms |
| `/manager` | 178 ms | 27 ms |
| `/history` | 209 ms | 25 ms |

So build first and serve the build, on a spare port so a running dev server
survives:

```bash
NEXT_PUBLIC_SUPABASE_URL= npm run build   # empty at BUILD time too — see below
NEXT_PUBLIC_SUPABASE_URL= npx next start -p 3100
# then, warming each route first so you are not timing compilation:
curl -s -o /dev/null -w "%{time_total}\n" -b "gh_mock_user=gh-manager" \
  http://localhost:3100/manager
```

> **`NEXT_PUBLIC_*` is inlined at build time.** Emptying it only for
> `next start` is not enough: a build made with `.env.local` in force has the
> hosted URL compiled in, so the "mock" server still talks to hosted Supabase —
> reads go to the shared database, and mock persona cookies such as
> `gh-manager` fail to resolve (not uuids), so every portal route redirects to
> sign-in. Found 19 Sep 2026. Build with the variable empty, and **rebuild
> normally afterwards** so the `.next/` you leave behind matches `.env.local`.

**Develop against the mock store, not the hosted project — for speed as well
as safety.** One trivial query to hosted Supabase from the dev machine costs
270–580 ms, essentially all of it latency (`ttfb` ≈ `total`). A render is
several queries, so every navigation pays 0.5–1.5 s before the app does
anything. `NEXT_PUBLIC_SUPABASE_URL= npm run dev` removes that entirely; a
local `supabase start` keeps the real backend without the round trip.

See [Part 2](#the-portal-felt-slow-and-what-was-actually-measured-phase-9) for
the other two causes of click latency that were measured — whole-app `revalidatePath` on every action
and a 5 s poll — both fixed in Phase 9 (`lib/revalidate.ts`,
`components/live-updates.tsx`).

**7. The invoice against the office's template**

`INVOICE_PDF_OUT=/tmp/sample.pdf npx vitest run tests/invoice.test.ts` writes a
sample invoice. LibreOffice renders both it and the template to PNG for a
side-by-side look (`soffice --headless --convert-to pdf public/GHM_Invoice.docx`,
then `soffice --headless --convert-to png <file>.pdf`). The invoice's artwork
and fonts are compiled into `lib/invoice-assets.generated.ts`; after changing
anything in `public/invoice/` or `assets/invoice/fonts/`, run
`node scripts/build-invoice-assets.mjs`.

To run a one-off TypeScript script against the mock store (seeding a checked-in
stay, say), `npx vite-node --config vitest.config.ts script.ts` resolves the
`@/` aliases; `tsx` is not installed.


---

## Part 2 — Traps and fixes

Each of these cost real time.

### Uploads fail with an opaque `NetworkError`

**Symptom.** Submitting a booking with an ID document throws
`Uncaught TypeError: NetworkError when attempting to fetch resource`, pointing at
the page component rather than anything useful.

**Cause.** Next.js server actions have a **1 MB request body limit** by default.
Any real photo exceeds it; the request is dropped and the browser surfaces a
generic network failure.

**Fix.** `next.config.ts` sets
`experimental.serverActions.bodySizeLimit: "25mb"`. Per-file validation (5 MB,
JPG/PNG/WEBP/PDF) lives in `app/actions/bookings.ts`. If uploads start failing
again, check this setting first — and restart the dev server, since config
changes need a fresh process.

### "I can't select the time"

**Symptom.** The time field appears to accept typing only.

**Cause.** Firefox renders `datetime-local` and `type="time"` without a picker.

**Fix.** Use `components/ui/time-select.tsx` — hour / minute / AM-PM dropdowns,
controlled via `value` (`"HH:mm"`, 24-hour) and `onChange`. **Never reintroduce
native time inputs.** Its `parseTime` / `toTimeValue` handle the classic traps
(12 AM = `00:00`, 12 PM = `12:00`); re-test those if you touch the conversion.

### "Check-out must be after check-in" on times that clearly are

The AM/PM dropdown in `components/ui/time-select.tsx` keeps whatever it already
held when only the hour is changed, and the booking form's two time fields
default to **opposite periods**: check-in `12:00` displays as PM, check-out
`10:00` as AM. So a requester who wants 9 AM → 10 PM and changes only the two
hour dropdowns actually submits **9 PM → 10 AM**, which really is out of order.
The old message stated the rule back at them and named neither time, so there
was nothing to act on.

Fixed on 10 Sep 2026 by making the interpretation visible rather than by
loosening validation:

- `TimeSelect` prints the resolved time under the dropdowns ("Check-in: 9:00 PM").
- The booking form shows a live **Your stay** panel with both resolved instants,
  the duration, and the error inline — so it is caught while filling the form.
- `checkOutOrderError()` (`lib/booking-schema.ts`) is the shared message used by
  both the schema and that panel. It names both times and, when they fall on the
  same day, says the AM/PM dropdowns do not change on their own.

If this is reported again, first ask what the read-back line says — it is the
fastest way to tell a mis-set period from a genuine date mistake.

### Times are 5h30m late — a 12:00 booking shows as 5:30 PM

**Fixed.** `toIso()` in `app/actions/bookings.ts` used to be
`new Date(datetimeLocal).toISOString()`. A naked "2026-09-15T12:00" is resolved
in the **process** timezone, so it was right on a developer machine set to IST
and wrong on a UTC host: 12:00 was stored as `12:00Z`, which is 5:30 PM IST.
A 10:00 check-out became 3:30 PM. It goes through `lib/tz.ts` now.

Two things to know if you see it again:

- **Rows written during that period are still wrong in the database.** The code
  fix only affects new bookings. Compare the stored time-of-day: a correctly
  stored IST wall-clock time on the hour lands on `06:30Z` / `04:30Z`, a
  UTC-parsed one keeps the typed `12:00Z` / `10:00Z`.
  `supabase/repairs/2026-09-10-utc-parsed-bookings.sql` shifts them and rebuilds
  their room holds.
- **Anything that reintroduces `new Date(<datetime string>)` or an unzoned
  formatter brings it back.** Use `instituteIso()` to parse and `lib/format.ts`
  to render. Verify by running the app's logic under `TZ=UTC` — that is the
  environment where the bug appears, and a machine in IST will not show it.

### Bookings fail to submit against Supabase with a column error

The booking insert names columns that migrations add: `bookings.meals`
(migration 6) and `bookings.has_infant` (migration 7) — and until migration 8
runs, migration 6's check constraint refuses the per-day meal plan the form now
sends. Apply whichever of
`supabase/migrations/00000000000006_booking_meals.sql`,
`00000000000007_booking_infant_flag.sql` and `00000000000008_meal_plans.sql` is
missing, in order, in the SQL editor. Reads degrade gracefully (`normalizeMeals` fills in "none requested",
and a missing `has_infant` is derived from infant guest rows), so the symptom is
writes failing while every page still renders. The requester only sees
"Something went wrong while submitting the booking"; the server log carries the
PostgREST error naming the missing column.

### Every booking is rejected with "Invalid input: expected string, received null"

Reported 16 Sep 2026: submitting the booking form failed with that message and
nothing highlighted. It affected **every requester role**, not just the student
it was reported on — no booking could be submitted at all.

**Cause: the schema could not accept its own output.** The form validates on
the client and then sends `parsed.data` — the schema's *output* — over the wire
(`components/booking-form.tsx`), and `createBooking` re-parses it with the same
`bookingPayloadSchema`. `optionalTrimmed` was:

```ts
z.string().optional().transform((v) => (v && v.trim() ? v.trim() : null))
```

Its input rejects `null`; its output *is* `string | null`. So the first pass
turned a blank `alumni_name` into `null`, `JSON.stringify` kept that key (it
drops `undefined`, not `null`), and the second pass rejected it with zod's
default invalid-type message.

It was invisible from the form because the failing paths were `alumni_name`
and `alumni_roll_number` — fields a student's form never renders — so
`setError` had no visible field to attach to and the requester saw only the
toast.

**Fix:** `.nullish()` instead of `.optional()`, so the transform's output is
also a valid input. `countField` and the guest `age` field were already
round-trip safe this way, which is the pattern to follow.

**If you touch this schema, check the round trip** — parse a realistic payload,
`JSON.parse(JSON.stringify(...))` the result, and parse it again. A throwaway
suite doing exactly that for all six requester roles, plus checks that
accepting null did not weaken the alumni / ID-number / parent-dependency
requirements, is the regression guard.

### The app feels slow when you click a button

Reported 17 Sep 2026. Measured before changing anything, because the guess on
offer ("can we use multithreading?") was the wrong lever: Node already serves
requests concurrently, and the time here is spent *waiting* on compilation and
network round trips, not on CPU work a second core could split. The pages
already issue their independent queries together (`Promise.all` in `/manager`
and `/caretaker`), and `SupabaseStore.hydrate` batches room holds into one
query, so there is no N+1 to find.

Four real causes, in order of size. All measured with 5 bookings / 36 rooms, so
none of this is data volume:

**1. `next dev` is ~7× slower than a production build.** Same data, warm:

| Route | `next dev` | `next start` |
| --- | --- | --- |
| `/dashboard` | 175 ms | 21 ms |
| `/warden` | 159 ms | 24 ms |
| `/manager` | 178 ms | 27 ms |
| `/history` | 209 ms | 25 ms |

A route's *first* hit costs more again (`/dashboard` 376 ms cold vs 94 ms
warm) because dev compiles on demand. Never judge speed from `next dev`.

**2. Against hosted Supabase every query is an internet round trip.** One
trivial `select id from guest_houses limit 1` from the dev machine:

```
270ms · 269ms · 294ms · 569ms   (first sample 1.3s)
ttfb = 578ms of a 578ms total — pure latency, not query time
```

A render is several queries plus `getCurrentUser()`, so a navigation costs
0.5–1.5 s before any of the app's own work. `.env.local` points at the hosted
project, so a plain `npm run dev` pays this on every click. Develop against the
mock store (`NEXT_PUBLIC_SUPABASE_URL= npm run dev`) or a local Supabase.

**3. Every action invalidates the whole app.** All 11 call sites in
`app/actions/bookings.ts` and `app/actions/admin.ts` use
`revalidatePath("/", "layout")`, so approving one booking re-renders every
route and re-runs the layout's queries before the button's spinner clears.
Narrowing this to the routes an action actually changes is the main code-level
win — but narrowing it too far means another tab stops noticing the change,
which is what the 5 s poll is currently covering for.

**4. The 5 s poll re-renders the whole tree, per open tab**
(`components/auto-refresh.tsx`), competing with whatever was just clicked.
`/history`, `/availability` and `/admin/mail` are already excluded.

> **Both fixed in Phase 9 (22–23 Sep 2026)**, and together, exactly as this
> analysis said they would have to be: `lib/revalidate.ts` narrows the
> invalidation, and `components/live-updates.tsx` replaces the poll with a
> realtime subscription — so another tab still notices a change. The measured
> before and after is in Part 2 below.

**Not the cause:** the email layer. `after()` runs its dispatch *after* the
response is sent, so queuing and sending never delay a click.

### The Meals card is missing from the booking form

Meals are offered only where `guest_houses.serves_meals` is on — check the guest
house under Developer Console → Guest Houses & Rooms ("Serves meals"). Three
other causes, all expected:

- the role's allowed guest houses all have it off (students are Bageshri-only by
  default), so the card is not rendered at all;
- on Supabase before migration 8 the column does not exist and every guest house
  reads as serving no meals;
- the table itself appears only once a guest house that serves meals and a valid
  check-in / check-out are chosen — until then the card explains what is
  missing.

A meal showing a dash instead of a checkbox is served before check-in or after
check-out (hover for which); that is `stayMealDays` working, not a bug.

### A tab suddenly shows a different user

Expected, and not fixable in the UI. The session cookie belongs to the
browser, not to a tab, so signing in as another persona anywhere changes every
tab — and the live updates (`components/live-updates.tsx`) make the others
re-render as that persona. To use two accounts at once, use a private window or
a second browser profile.

A `TabSessionGuard` that detected the mismatch and blocked the affected tab was
built and then **reverted**: the blocking overlay was intrusive and it added
work to every page load for a demo-only concern. Don't rebuild it — see
[02-decisions.md](02-decisions.md). Genuine per-tab sessions need real
authentication.

### Form Builder changes appear to do nothing

**Symptom.** You edit `buildDefaultFormConfig` and the form is unchanged.

**Cause.** A saved config row for that role takes precedence over the defaults.

**Fix.** Check `form_configs` (Supabase) or `.local-db.json` (mock). "Reset to
spec defaults" in the Form Builder deletes the row and restores defaults.

### Status facet counts collapse on Supabase but not on the mock store

**Symptom.** The tiles on `/history` show the right numbers locally, but against
Supabase every tile except the selected one drops to zero the moment you click a
status.

**Cause.** `SupabaseStore.searchBookings` was pushing `criteria.statuses` down
into SQL (`.in("status", …)`). `runBookingSearch` computes per-status facet
counts *before* applying the status filter, so it needs the other statuses to
still be in the candidate set. The mock store filters everything in memory and
was unaffected — a textbook case of the two backends disagreeing.

**Fix.** Do not push `statuses` down. Guest house, requester role and the
check-in range are still filtered in SQL; the status filter is applied by the
shared matcher. The comment in `lib/store/supabase.ts` says so — leave it there.

**Lesson.** When a change touches `searchBookings`, exercise **both** stores.
The mock store can be driven directly with
`npx tsx --tsconfig ./tsconfig.json` and Supabase through the running dev server.

### An archive search misses old bookings

**Cause.** `SEARCH_SCAN_LIMIT` in `lib/store/supabase.ts` caps one search at
1000 candidate rows.

**Fix.** The result carries `truncated: true` and the UI shows an amber banner
asking for a date range or guest house filter. Since migration 22 the keyword
is pushed down to Postgres (`bookings.search_text`, a generated tsvector with
a GIN index), which narrows the candidates first; guests' names are
deliberately not in it and are still matched in JavaScript.

### shadcn/ui init fails

**Cause.** The registry changed. `-b neutral` is rejected.

**Fix.** `init` needs `-b radix -p nova --no-monorepo`. There is **no `form`
component** in this registry, which is why the project uses
`components/ui/native-select.tsx` plus manual `FieldError` rendering instead of
shadcn's `Form`.

### Lint fails on React Compiler rules

The React Compiler lint is strict and these all fail `npm run lint`:

- reading refs or calling `setState` during render;
- calling react-hook-form's `watch()` in render — use `useWatch({ control, name })`;
- calling `setState` synchronously in an effect body.

The `watch()` → `useWatch` conversion was needed for the time picker fields.

### `create-next-app` rejects the directory name

**Cause.** npm package names cannot contain capitals, and the directory is
`GuestHouseIIT`.

**Workaround used.** Scaffolded in a lowercase temporary directory and moved the
files in. Do not try to re-scaffold in place.

### `.env.example` silently not committed

**Cause.** `.gitignore` contains `.env*`, which matches `.env.example` too.

**Fix.** The `!.env.example` exception on the following line must stay.

### Missing seed persona after adding one

**Cause.** `.local-db.json` already exists and is not regenerated.

**Fix.** `loadDb()` self-heals — it adds missing seeded profiles and a missing
`form_configs` key on load. If something else is stale, delete `.local-db.json`.

### Supabase queries return empty with the anon key

**Cause.** RLS policies filter rows for unauthenticated callers.

**Explanation.** Server-side code uses the service-role key and bypasses RLS.
Debugging with the anon key from curl will legitimately show `[]`. Use the
service-role key for out-of-band inspection, and see the honesty note in
[21-database.md](21-database.md#row-level-security).

### `next dev` will not start

**Cause.** Another dev server is already running (it prints the PID and port).

**Fix.** Use the existing server, or kill that PID. Do not assume port 3000 is
free.

### Type errors after touching domain shapes

`lib/types.ts` uses `type` aliases rather than `interface` on purpose, so that
Supabase's generated `Insert` / `Update` helpers accept them. Converting one to an
`interface` will produce confusing assignability errors in `lib/store/supabase.ts`.

### `npm run dev` says Node.js >= 20.9.0 required

**Cause.** The system default is Node v18.19.1 and `nvm` is not loaded in the
current terminal session.

**Fix.** Load nvm first, then run:
```bash
export NVM_DIR="$HOME/.nvm" && [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" && nvm use 20
```
Then `npm run dev`, `npm run build`, etc. will work. Keep the terminal open;
the Node version persists for the session.

### `npx supabase` hangs or says `supabase: not found`

**Cause.** The Supabase CLI binary (`@supabase/cli-linux-x64`) is ~60 MB and
`npx` sometimes stalls downloading it, especially on slow networks. After a
`Ctrl+C` the partial install leaves no working binary.

**Fix.** Install it as a local dev dependency instead of using `npx`:
```bash
npm install -D supabase
npx supabase db push
```
Or apply migrations manually via the Supabase Dashboard SQL Editor.

### `next build` fails: "Cannot find module '../../../app/page.js'" in `.next/dev/types`

**Cause.** After moving or deleting a route (19 Sep 2026: `app/page.tsx` and
`app/mock-login/` moved into `app/(site)/`), `.next/dev/types/validator.ts` —
written by an earlier `next dev` — still imports the old paths. `next build`
type-checks it but does not regenerate the dev copy.

**Fix.** `rm -rf .next/dev/types` and build again; `next dev` recreates it. It
is generated output, nothing is lost.

### A production build on the mock store redirects every persona to `/sign-in`

**Cause.** `NEXT_PUBLIC_SUPABASE_URL` is inlined at **build** time. A build
made with `.env.local` in force has the hosted URL compiled in, so
`NEXT_PUBLIC_SUPABASE_URL= npx next start` still uses hosted Supabase, where a
mock id like `gh-manager` is not a uuid — `getCurrentUser()` returns null and
every guard redirects. (It also means the "mock" server read the shared
database.)

**Fix.** `NEXT_PUBLIC_SUPABASE_URL= npm run build` as well as for `next start`,
then rebuild normally when done. Recipe in [Part 1](#the-test-suites).

### Signed-out users land on the public home page instead of a sign-in form

**Cause.** A portal guard doing `redirect("/")`. Since 19 Sep 2026 `/` is the
public website.

**Fix.** `redirect(SIGN_IN_PATH)` from `lib/routes.ts`. `grep -rn 'redirect("/")' app`
should find nothing.

### "I can't sign in" with LDAP

Since 19 Sep 2026 the card takes an LDAP username, not an email address.

- **"Enter your LDAP username, not your email address"**: the username contains
  `@`, and the directory's `LDAP_UID_ATTRIBUTE` is not `mail` or
  `userPrincipalName`.
- **"Incorrect username or password"**: the directory refused the login. With
  no `LDAP_URL`, only the dummy accounts in
  [05-credentials-and-security.md](05-credentials-and-security.md) exist. `password123` is **not** a
  portal password any more.
- **"…valid but is not registered on the guest house portal"**: the password
  was right, but no profile has that `ldap_uid`. Set it in Users & Roles (Edit,
  or Import LDAP usernames). On Supabase, check that migration 12 is applied
  and the seed's `update` has been run.
- **"The institute directory could not be reached"**: the directory threw. The
  cause is in the server log (`[auth] LDAP sign-in failed:`). The usual
  suspects:
  - `LDAP_URL` set without `LDAP_BASE_DN`
  - a wrong service password
  - anonymous search refused, which shows up as `noSuchObject` (code 0x20)
  - an untrusted TLS certificate (use `NODE_EXTRA_CA_CERTS`)
- **"Too many attempts"**: 8 attempts in 15 minutes for that username
  (`RATE_LIMITS.signIn`). The count is a **row in the database**
  (`rate_limits` / the mock's `.local-db.json`), so a restart does not clear
  it — wait, or on a throwaway mock database delete the file.

A console-created account with no LDAP username can still sign in through
**Mock Authentication** while Google is unconfigured.

### Resizing the camera photos gets killed (exit 137)

**Cause.** The `Images/` originals are 24-megapixel JPEGs; decoding all of them
in one Python process exhausted memory and the kernel OOM-killed it.

**Fix.** One photo per process, and `im.draft("RGB", (2000, 2000))` before
loading so the JPEG decoder works at reduced scale. Recipe in
[14-public-site-and-ui.md](14-public-site-and-ui.md#photographs).

### The portal felt slow, and what was actually measured (Phase 9)

Three things were costing time. Each was measured before and after on the same
machine, with a production build (`next build && next start`) against the mock
store, so the numbers compare like with like — they are *relative*, not a
promise about the hosted project.

**1. The public pages queried the database on every request.** `/guidelines`
reads every guest house, its rooms, the effective form configuration of every
requester role and the rules. Those change when the office edits them, which is
rarely, so `lib/site-data.ts` now holds the answers under the `site` cache tag
for half an hour and `revalidateEverything()` expires the tag as soon as
anything behind them is saved.

| Page (warm, median of five) | Before | After |
| --- | --- | --- |
| `/guidelines` | 68 ms | 27 ms |
| `/contact` | 29 ms | 17 ms |
| `/` | 48 ms | 38 ms |

The pages themselves are still rendered per request, and cannot be otherwise:
the header greets whoever is signed in, so every render reads the session
cookie. An `export const revalidate` on those pages was written first and did
**nothing** for exactly that reason — a dynamic segment ignores it. Caching the
data rather than the page is what moved the numbers.

**2. Every desk screen re-rendered itself every five seconds.** A reception
screen left open for an eight-hour shift made ~5,800 full page requests and
found nothing new in almost all of them. `components/live-updates.tsx`
subscribes to Postgres changes instead (bookings, room holds, blocks,
invoices), and falls back to a 30-second poll only where there is no Supabase
to subscribe to — one subscription, or ~960 polls, in place of 5,800 renders.

**3. Every write threw away the whole cache.** Twenty-five call sites ran
`revalidatePath("/", "layout")`, which invalidates the entire application
because one booking moved. `lib/revalidate.ts` names the three sets that
actually change together, so approving a booking no longer re-renders the
public gallery.

**And one that was measured in Postgres, not here.** The archive search read up
to 1,000 bookings and matched keywords in JavaScript. Migration 22 adds a
generated `bookings.search_text` tsvector with a GIN index, and the store
pushes the keyword down. In the throwaway Postgres stand-in the plan changed
from a sequential scan to `Bitmap Index Scan on bookings_search_idx`. The
dataset there is small — the plan is the evidence, not a timing.

---

### Re-running the Playwright suite bites twice (23 Sep 2026)

Both of these cost a full debugging cycle, and neither announces itself:

**1. `.e2e-db.json` survives the run, and so does the sign-in throttle.**
*Fixed on 23 Sep 2026* — `e2e/global-setup.ts` now removes the throwaway
database before every run, so this one should not bite again. Keep it: since
migration 21 the sign-in rate limit is a *row* in that database (`hitRateLimit`,
`RATE_LIMITS.signIn`: 8 per uid per 15 minutes), counted there precisely so a
restart cannot clear it. A second run inside the window used to fail at
`signIn()` with the browser sitting on `/sign-in`, which reads exactly like a
broken sign-in page — and did, the day a spec was added that signed a few more
accounts in. Seeded data is rebuilt on load, so there is nothing to preserve by
keeping the file.

*And within one run (25 Sep 2026):* the suite came to sign the manager in nine
times — over the limit inside a single run — and the last journeys stopped at
sign-in with "Too many attempts — try again in 777s" in the page snapshot.
`signIn()` now reuses each account's session after its first form sign-in, so
the count is one per account per run.

**2. `reuseExistingServer` serves the previous build.** `playwright.config.ts`
sets `reuseExistingServer: !process.env.CI`, so a server left listening on 3100
from an earlier run is reused — and `next start` read `.next` when it *started*.
Rebuild and re-run, and the tests are exercising the old code while reporting on
the new. **`pkill -f "[n]ext start"` before re-running**, or expect to be
confused. (The brackets matter: a bare `pkill -f "next start"` inside a
compound shell command matches that command's own shell and kills it, exit
144.) (This is the `next start` cousin of the "`npm run build` kills a
running `next dev`" warning in `AGENTS.md`.)

A clean loop, then:

```bash
export NVM_DIR="$HOME/.nvm" && . "$NVM_DIR/nvm.sh" && nvm use 20
pkill -f "[n]ext start"                   # the database is wiped by global-setup
NEXT_PUBLIC_SUPABASE_URL= npm run build   # empty, or the bundle talks to hosted Supabase
npm run test:e2e
npm run build                             # rebuild normally afterwards
```

**And the build self-heals `.local-db.json`.** Generating the static pages reads
the store, and with `MOCK_DB_PATH` unset that is the developer's own
`.local-db.json` — `loadDb()` adds missing seeded profiles and any keys later
features introduced. Harmless by design, but it *does* modify the file, so back
it up first if it holds anything you care about.

**`npx playwright install chromium`, not `--with-deps`.** The `--with-deps` form
shells out to `sudo` for system packages and dies on a machine with no askpass
helper. The browser download on its own needs no root.

---

### Switching "Booking as" kept the previous person's form (24 Sep 2026)

**Symptom.** A professor chose "Faculty Advisor — Petrichor" on New Booking:
the heading changed, but the form below kept their own defaults — the
secretary never appeared in Copy to. Caught by `e2e/club-booking.spec.ts`.

**Cause.** "Booking as" is a set of links within `/book`. Next's client-side
navigation keeps the page's component tree, so the same `BookingForm` stayed
mounted, and `useForm` reads its `defaultValues` only on the first mount.

**Fix.** `app/(portal)/book/page.tsx` keys the form by
`${requester.id}:${service}`, so a new requester is a new form. Any page that
renders a stateful form from search params needs the same.

### A pending club request nobody can approve

Club requests stored before 24 Sep 2026 sit at **Pending Club Approval**
(`PENDING_FA`). Their approver is the head of the club's unit, or of the council
above it (a student secretary), or — when neither is set — a `faculty_advisor`
account matched by Department/Club. Name a head in Departments & Clubs, or let
the manager decide it (the manager may act past any stage). New club bookings
never enter this stage: their Faculty Advisor raises them and they go straight
to the manager.

### Nobody can book for a club

The club (and its council) has no **Faculty Advisor** named in Departments &
Clubs → Faculty Advisors, or the one named is not a faculty account, or — on
Supabase — migration 25 is not applied (every unit then reads as having no
advisor). The club's own account says "nobody is set as yours yet".
