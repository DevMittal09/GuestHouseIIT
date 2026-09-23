# Running and deploying

## Local, zero setup

```bash
npm install
npm run dev            # http://localhost:3000
```

With no Supabase variables set, the app uses the mock store: data in
`.local-db.json`, uploads outside `public/`, and sign-in with the dummy LDAP
accounts ([11-ldap-accounts.md](11-ldap-accounts.md)). The one-click persona
picker is a developer door: run `DEV_LOGIN=true npm run dev` to see it at all.
Everything works — all five booking forms, all approval tiers, the room grid,
invoices, the desk and the developer console.

`next dev` refuses to start if another dev server is already running. Check port
3000 before launching a second one.

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
   order** (there are 22 as of Sep 2026 — count the directory, not this
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
> it, never expose it to the client. It is required only for the developer
> console's user management (it creates Supabase Auth users).

The current hosted project already has the schema, seed data and the private
`documents` bucket applied. As last recorded (10 Sep 2026) it was on migration
5, and **migrations 6 to 22 have been written since** — the production
programme of Sep 2026 added Settings, invoices, operational states, sessions
and search. Before the portal is pointed at that project, check which
migrations it actually has and apply the rest **in order**; every one from 6
onwards is re-runnable, so applying a file twice is safe. The list, and what
each one needs, is in [04-database.md](04-database.md#migrations).

`supabase/repairs/2026-09-10-utc-parsed-bookings.sql` still needs running to
correct four bookings stored 5h30m late (see below).

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
and migrations are checked:

> **`npm run test:e2e` has a re-run trap** — a reused `next start` serving the
> previous build, which looks like an application bug. (The other one, a
> persisted throwaway database carrying the sign-in rate limit forward, was
> fixed on 23 Sep 2026 by `e2e/global-setup.ts`.) The clean loop is in
> [07-troubleshooting.md](07-troubleshooting.md#re-running-the-playwright-suite-bites-twice-23-sep-2026).

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

**4. Client-rendered UI in headless Chrome**

Dialogs, the meal grid and the week/month charts only render after client-side
interaction, so `curl` cannot see them. `/usr/bin/google-chrome` is installed,
and Node 20 has a WebSocket client behind `--experimental-websocket`, which is
enough to drive Chrome over the DevTools protocol with no extra packages:

- launch `google-chrome --headless=new --remote-debugging-port=9333 --user-data-dir=<tmp dir>`;
- read the page's `webSocketDebuggerUrl` from `http://127.0.0.1:9333/json/list`;
- `Network.setCookie` (`gh_mock_user` = a profile id, which needs
  `DEV_LOGIN=true`), `Page.navigate`, then
  `Runtime.evaluate` to click and fill — set input values through the native
  `value` setter and dispatch `input` / `change`, or react-hook-form never sees
  them;
- `Page.captureScreenshot` with a `clip`, and subscribe to
  `Runtime.exceptionThrown` / `Runtime.consoleAPICalled` to catch client errors.

Two gotchas that cost a rerun: `innerText` applies CSS `text-transform`, so an
`uppercase` label reads "ROOMS SELECTED" (match on `textContent`); and panels
that finish loading move the page, so scroll, wait, and *then* measure the clip
— allowing for the sticky navy nav bar in the portal (~47 px since the 19 Sep
2026 restyle; it was a 56 px header before).

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

See [07-troubleshooting.md](07-troubleshooting.md) for the other two causes of
click latency (`revalidatePath("/", "layout")` on every action, and the 5 s
poll).

**5. The invoice against the office's template**

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

## Deploying to production

Not yet deployed. The intended path is Vercel + hosted Supabase.

**What used to block this is done** (Phase 8, Sep 2026): sessions are rows with
an opaque cookie that cannot be forged, Google sign-in is the real OpenID
Connect flow, and the developer doors refuse to exist in a production build —
`instrumentation.ts` will not let the server start if `DEV_LOGIN` is set, or if
Supabase, `APP_URL`, `CRON_SECRET` or `ID_ENCRYPTION_KEY` is missing.

**Still to settle before the first real deployment:**

1. **Connect the directory.** Set `LDAP_URL` and friends (`.env.example`) and
   load the real usernames onto profiles (migration 12, then the console import
   — [11-ldap-accounts.md](11-ldap-accounts.md) §3). **Never deploy without
   `LDAP_URL`:** with it unset the portal accepts the dummy accounts, whose
   passwords are published in this repository.
2. **Delete or disable the demo personas** once the real accounts exist.
3. **Per-request, user-scoped database clients.** Every table has RLS with no
   `authenticated` write policy, but the server still uses the service-role
   key from one server-only module. The boundary today is the server: every
   action re-checks the caller. See
   [14-security.md](14-security.md#6-what-is-deliberately-not-done-yet).

**Deployment steps once those are done:**

1. Push the repository to GitHub (see [08-roadmap.md](08-roadmap.md) for the
   current permissions blocker).
2. Import the project in Vercel.
3. Set the environment variables in Vercel's project settings — mark
   `SUPABASE_SERVICE_ROLE_KEY`, `MAIL_APP_PASSWORD`, `CRON_SECRET`,
   `ID_ENCRYPTION_KEY` and `GOOGLE_CLIENT_SECRET` as server-only (do **not**
   prefix them with `NEXT_PUBLIC_`). The full table is in
   [§ Environment variables](#environment-variables) below. Set `APP_URL` and
   `APP_BASE_URL`, or sign-in redirects break and every link in an email points
   at localhost.
4. Deploy; Vercel detects Next.js automatically. `npm run build` must pass first.
5. Apply **all** migrations, in order, and the seed to the production Supabase
   project if it is separate from the development one.
6. Schedule the two mail routes (`vercel.json` `crons`, or a systemd timer):
   `/api/mail/dispatch` every few minutes, `/api/mail/cron` at 08:00 IST
   (`30 2 * * *` UTC). Without the second, digests, reminders and the day-wise
   log never go out — per-event mail still does, via `after()`.
7. **Decide `MAIL_REDIRECT_ALL_TO` deliberately.** Production is the one place
   it should be unset. Anywhere else, leaving it unset means the portal mails
   real parents and wardens from a staging database.

**Configuration that must survive deployment:**

- **The host's timezone no longer matters — keep it that way.** `lib/tz.ts`
  pins every wall-clock operation to `Asia/Kolkata`, so the app is correct on a
  UTC host (Vercel) and on an IST laptop alike. Do not "fix" a date problem by
  setting `TZ` on the deployment: that would make correctness depend on a deploy
  setting and would still leave browsers outside IST wrong. This is the bug that
  stored bookings 5h30m late once already — see
  [07-troubleshooting.md](07-troubleshooting.md).
- `next.config.ts` raises `experimental.serverActions.bodySizeLimit` to `25mb`
  for document uploads. Without it, uploads fail as an opaque browser
  `NetworkError`.
- Per-file limits (5 MB; JPG/PNG/WEBP/PDF) are enforced in
  `app/actions/bookings.ts`.

**Operational notes:**

- The mock store must never be used in production — it is a single JSON file
  rewritten on every mutation, with no concurrency safety. In production the
  Supabase variables will always be set, so this is automatic, but do not
  "temporarily" unset them on a live deployment.
- Uploaded documents contain Aadhaar/ID data. Keep the bucket private, keep
  signed-URL lifetimes reasonable, and confirm retention expectations with the
  Administration Section before going live.

---

# Production runbook

Everything below is for whoever operates the portal once it is live.

## Environment variables

`instrumentation.ts` checks these at boot and refuses to start a production
server that is not fit, naming exactly what is wrong. `.env.example` documents
every one with an example value.

**Required in production**

| Variable | Example | What breaks without it |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://abcdefgh.supabase.co` | The portal has no database |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `eyJhbGciOi...` | The browser cannot subscribe for live updates |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJhbGciOi...` | Every server read and write |
| `APP_URL` | `https://guesthouse.iitpkd.ac.in` | Sign-in redirects, server-action origins |
| `CRON_SECRET` | 32+ random characters | The daily jobs would be open to anyone |
| `ID_ENCRYPTION_KEY` | `openssl rand -base64 32` | Guests' ID numbers would be stored in clear |

**Needed for the portal to be useful**

| Variable | Example | What it turns on |
| --- | --- | --- |
| `LDAP_URL`, `LDAP_BASE_DN` | `ldaps://ldap.iitpkd.ac.in:636`, `dc=iitpkd,dc=ac,dc=in` | Real sign-in. **Without it the dummy accounts work** |
| `LDAP_BIND_DN`, `LDAP_BIND_PASSWORD` | a read-only service account | Directory search where anonymous search is refused |
| `MAIL_USER`, `MAIL_APP_PASSWORD`, `MAIL_HOST` | the institute's relay | Sending mail instead of writing `.eml` files |
| `APP_BASE_URL` | `https://guesthouse.iitpkd.ac.in` | Absolute links inside mail |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | from the Google Cloud console | "Sign in with Google"; the button is hidden entirely if unset |
| `ACADEMIC_DB_URL`, `ACADEMIC_DB_TOKEN` | the institute ERP | Real requester details instead of the dummy records |

**Optional**

| Variable | Effect |
| --- | --- |
| `ID_ENCRYPTION_KEYS_OLD` | Reads rows written under a retired key: `v1:<base64>,v2:<base64>` |
| `CLAMAV_HOST`, `CLAMAV_PORT` | Virus-scans uploads; an unreachable scanner refuses the upload |
| `SENTRY_DSN` | Error reporting |
| `MAIL_REDIRECT_ALL_TO` | **Set this on every non-production deployment** |
| `MAIL_DRY_RUN` | Logs mail and sends nothing |

**Must never be set in production:** `DEV_LOGIN` (the server refuses to start)
and `ALLOW_MOCK_STORE` (it lets a production build run on a JSON file).

## What `vercel.json` may and may not ask for

A deployment that fails **with no build log, and never appears in the
project's Deployments list**, was rejected before it was built. Vercel does
that when `vercel.json` asks for something the plan does not include — and it
reports the failure only as a red check on the commit in GitHub, which is a
miserable way to find out. It cost us three pushes to work out (23 Sep 2026).

On the **Hobby** plan:

- **Cron jobs run once a day, and there may be two of them.** Anything more
  frequent — `*/10 * * * *` for the outbox worker, which is what this file
  asked for first — is refused. Both crons are daily now: `/api/mail/cron` at
  02:30 UTC (08:00 IST) and `/api/mail/dispatch` at 03:00 UTC. That is enough,
  because dispatch is only a safety net: mail normally leaves within a second
  of the action that queued it, through `after()`.
- **`regions` is a Pro feature.** `["bom1"]` (Mumbai) would put the functions
  next to the institute and next to a Supabase project in that region; on
  Hobby it is simply not allowed, so it is out of the file.

**On upgrading to Pro, restore both** — put `"regions": ["bom1"]` back and set
the dispatch cron to `*/10 * * * *`. Nothing else in the file is plan-specific:
`installCommand` is there because `npm ci` cannot install this lockfile on
Linux (see the CI workflow's comment).

## Settings the office must fill in

Everything below is edited in the portal, not in code, and everything has a
working default — but a default is a guess, and some of these are guesses the
office must replace before real money and real people are involved. Ordered by
what hurts most if it is left alone.

**Must be changed before go-live**

| Setting | Where | Default, and why it must change |
| --- | --- | --- |
| Console password | Console → Access | **`0000`.** It guards every developer action. |
| Room, extra-bed and meal rates | Console → Tariffs & Invoicing | Seeded from the office's tariff sheet (Bageshri ₹750/day; Hamsanandi ₹2,000, and ₹4,000 for government officers; breakfast ₹80, lunch ₹120, dinner ₹100; free to students and alumni). **There is no extra-bed rate at all** — an invoice for a room with an extra bed cannot be issued until one is entered. Confirm every rate and its effective date. |
| GSTIN | Console → Tariffs & Invoicing | Carried over from the invoice template. Confirm it against the institute's registration — it is printed on every invoice. |
| Accounts email | Console → Tariffs & Invoicing | **Empty**, so nothing is mailed to Accounts when an official booking's invoice is issued. |
| Bank details (holder, account number, IFSC, branch) | Console → Tariffs & Invoicing | From the template. Guests pay against these. |
| Guest house contact (address, phone, email) | Console → Tariffs & Invoicing | From the template; also shown on the public site. |
| Departments, clubs and their heads | Console → Departments & Clubs | The HOD queue follows whoever heads a unit. Nobody set means the HOD stage is skipped and the log says so. |
| Hostels and their wardens | Console → Users & Roles | A student's request goes to the warden of the hostel on their profile. |
| Official email whitelist | Console → Settings | Which addresses may book as an office. |

**Should be reviewed, because the default is a policy choice**

| Setting | Default | What it decides |
| --- | --- | --- |
| Advance booking window | 1 month | How far ahead a check-in may be requested. Officials and the manager are exempt. |
| Longest stay | 14 nights | 0 removes the limit. |
| Turnaround buffer | 240 minutes | The least gap between one stay's check-out and the next check-in on the same room. Changing it rebuilds every hold and is refused if that would make two stays clash. |
| No-show release | 0 (off) | Hours after the booked check-in at which an unclaimed stay is released automatically, with mail to the requester. |
| Day basis and grace hours | Nights, 4 hours | What "Day(s)" on an invoice counts. |
| Rates include GST | Yes | The office's rates do, so the Grand Total is the quoted price and the tax is shown inside it. |
| GST percentages and SAC codes | 5% up to ₹7,500/day, 18% above, 5% on food | As in force since 22 Sep 2025. Check before the next Council revision bites. |
| Meal windows | 07:30–09:30, 12:30–14:00, 19:30–21:00 | Which meals a stay can include, and the kitchen's day. |
| Room capacity | Single 1 (2 with an extra bed), double 2 (3) | Enforced at submission and at allocation. |
| Debitable heads per category | Department / Project / PDF / Institute Grant | What each kind of requester may charge a stay to. **Faculty can never be given the Institute Grant** (`FORBIDDEN_DEBIT_HEADS`) — that cell is greyed, and the rule is applied on read as well as on save. |
| ID retention | 365 days after the stay | When identity numbers and ID documents are erased. |
| Audit retention | 180 days | Cannot be set lower — CERT-In expects 180 days of logs. |

**Outside Settings, still the office's to confirm:** the guest house phone and
email on the public site and the house rules on `/guidelines` (everything
tagged `TODO(site)` in `lib/site.ts` and `lib/site-content.ts`), and the
wording of the automatic mail (Console → Mail Templates).

## Rotating a secret

Rotation is routine, not an emergency measure. Do it on a schedule, and after
anyone with access leaves.

**The service-role key.** Supabase -> Settings -> API -> *Reset service role
key*. Put the new value in the hosting provider's environment, redeploy, then
confirm the portal reads and writes. The old key stops working the moment it is
reset, so this is a short outage if the redeploy is slow -- do it outside desk
hours.

**`ID_ENCRYPTION_KEY`.** This one needs care: rows encrypted with the old key
must stay readable.

```bash
openssl rand -base64 32          # the new key
```

1. Move the current `ID_ENCRYPTION_KEY` value into `ID_ENCRYPTION_KEYS_OLD`,
   prefixed with its version -- `v1:<old key>`, comma-separated if there are
   already old keys.
2. Set `ID_ENCRYPTION_KEY` to the new value.
3. Redeploy. New writes use the new key; old rows are still read through the
   old one, and are re-encrypted whenever they are written.
4. Keep the old key until the retention window has passed
   (`id_retention_days`, default 365), then drop it.

**`CRON_SECRET`.** Generate, set it in the environment *and* in the cron
configuration, redeploy. The endpoints refuse the old value immediately.

**Mail, Google, LDAP.** Rotate at the source (the mail administrator, the
Google Cloud console, the directory administrators), then update the
environment and redeploy.

After any rotation, read Console -> Audit Log for the period the old secret was
live.

## Backup and restore

Supabase takes daily backups on its paid plans; on the free plan **there are
none**, which is not acceptable for a guest register. Confirm which plan the
project is on before go-live.

**A backup that has never been restored is not a backup.** Run this drill once
before go-live, and then every six months:

```bash
# 1. Dump the production database (read-only; safe at any time).
supabase db dump --db-url "$PROD_DB_URL" -f backup-$(date +%F).sql

# 2. Restore it into a throwaway local Postgres -- never into production.
docker run --rm -d --name gh-restore -e POSTGRES_PASSWORD=pw -p 55432:5432 postgres:16
psql "postgresql://postgres:pw@127.0.0.1:55432/postgres" -f backup-$(date +%F).sql

# 3. Check the numbers agree with production.
psql "postgresql://postgres:pw@127.0.0.1:55432/postgres" -c \
  "select (select count(*) from bookings), (select count(*) from invoices);"

# 4. Throw the copy away.
docker rm -f gh-restore
```

Record the date of the drill and the counts in
[07-troubleshooting.md](07-troubleshooting.md).

**Uploaded documents are not in the database dump.** They live in Supabase
Storage; back up the bucket separately, and remember it holds ID documents --
the copy needs the same protection as the original.

**Restoring into production** is Supabase's own point-in-time restore. Tell the
Guest House Manager before doing it: any booking made after the restore point
is gone, and the office will have to re-enter it.

## Incident response

A personal-data breach here means guests' ID numbers, ID documents or the guest
register. The portal's part is containment and evidence; the institute's own
incident process decides who reports.

1. **Contain** -- rotate the secret involved (above), revoke sessions from
   Console -> Security, and if necessary take the deployment down. A portal
   that is off leaks nothing.
2. **Preserve evidence** -- export Console -> Audit Log for the period, and
   pull the hosting and Supabase logs before their own retention closes.
3. **Report inside 6 hours.** CERT-In's directions of 28 April 2022 require
   specified cyber incidents, data breaches among them, to be reported **within
   6 hours of noticing them**, to `incident@cert-in.org.in` (forms at
   cert-in.org.in). The DPDP Act 2023 separately requires informing the Data
   Protection Board and every affected person. The institute's Data Protection
   Officer / IT Section files these -- contact them first, and do not wait for
   a full diagnosis: an initial report inside the window can be corrected
   later.
4. **Keep the logs** that CERT-In expects Indian ICT systems to retain for
   **180 days**. That is why `audit_retention_days` cannot be set below 180.
5. **Write it up** in [07-troubleshooting.md](07-troubleshooting.md): what
   happened, what was done, and what would have prevented it.

## Retention, in practice

| Data | Kept for | Set where |
| --- | --- | --- |
| Guests' ID numbers and documents | `id_retention_days` after the stay ends (default 365) | Console -> Settings -> Privacy |
| Audit log | `audit_retention_days` (default 400, floor 180) | Console -> Settings -> Privacy |
| The booking itself | Indefinitely -- it is the guest house's own record | -- |
| Mail outbox | Kept; it is the evidence that a notice was sent | -- |

`/api/mail/cron` runs the erasure nightly. Check Console -> Audit Log after
changing a retention Setting: the change is recorded, and so is what the next
run deleted.

## Branch protection

The repository should not accept a push straight to `main`.

On GitHub: **Settings -> Branches -> Add branch ruleset**, targeting `main`:

- Require a pull request before merging (1 approval).
- Require these status checks to pass: `Lint, types and unit tests` and
  `End-to-end journeys` -- the two jobs in `.github/workflows/ci.yml`.
- Require branches to be up to date before merging.
- Block force pushes and deletions.
- Require conversation resolution before merging.

For a one-person repository, keep the status checks and the force-push block
even if the approval requirement is relaxed: the checks are what stop a broken
migration or a failing journey from reaching production.

**Never add a repository secret that can reach the hosted project.** CI is
offline by construction -- it runs with `NEXT_PUBLIC_SUPABASE_URL` empty and
`MAIL_DRY_RUN` on, against the mock store on a throwaway file.
