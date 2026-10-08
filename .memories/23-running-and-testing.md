# Running locally and verifying changes

How to run the portal on a developer machine, point it at a database, and
prove a change works. Deploying and operating it live is
[24-deployment-runbook.md](24-deployment-runbook.md); every login and secret is
in [30-credentials-and-access.md](30-credentials-and-access.md).

> **Node 20.** The machine's default Node is v18 and Next.js 16 needs
> ≥ 20.9. Load nvm first in every new shell:
> `export NVM_DIR="$HOME/.nvm" && . "$NVM_DIR/nvm.sh" && nvm use 20`.

## Local, zero setup

```bash
npm install
npm run dev            # http://localhost:3000
```

With no Supabase variables set, the app uses the mock store: data in
`.local-db.json`, uploads in `.uploads/` (outside `public/`), mail written to
`.local-mail/*.eml`, and sign-in with the dummy LDAP accounts
([30-credentials-and-access.md](30-credentials-and-access.md)). The one-click
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

## The test suites

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

## Local with Supabase

Requires Docker.

```bash
npm install -g supabase      # or: brew install supabase/tap/supabase
supabase start
supabase db reset            # applies migrations + seed
supabase status              # prints URL, anon key, service_role key
```

## Hosted Supabase

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
[22-database.md](22-database.md#migrations).

`supabase/repairs/` holds one-off data fixes, some of which the hosted project
may still need — the timezone repair for bookings stored 5h30m late, the real
room numbers, all rooms double sharing, and the Bageshri ₹1,000 rate. The list
is in [22-database.md](22-database.md#one-off-repairs--supabaserepairs).

### One-off repairs

`supabase/repairs/` holds data fixes that are **not** migrations and are never
applied automatically. Each file's header explains what it is for and how to
check whether it applies to your data. Read it, take a backup, and run it
deliberately in the SQL editor. They are not idempotent — the timezone repair in
particular would shift already-correct rows a second time if re-run.

## Verifying changes

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
> [25-troubleshooting.md](25-troubleshooting.md#re-running-the-playwright-suite-bites-twice-23-sep-2026).

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

See [25-troubleshooting.md](25-troubleshooting.md) for the other two causes of
click latency that were measured — whole-app `revalidatePath` on every action
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

