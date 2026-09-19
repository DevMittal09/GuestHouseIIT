# Running and deploying

## Local, zero setup

```bash
npm install
npm run dev            # http://localhost:3000
```

With no Supabase variables set, the app uses the mock store: data in
`.local-db.json`, uploads in `public/uploads/`, login via the persona picker.
Everything works — all five booking forms, all approval tiers, the room grid, the
developer console.

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
   order** (there are eight), then `supabase/seed.sql`.
3. Copy the keys from **Project Settings → API**.

> **Migrations are not applied automatically and an existing project will not
> pick up new ones.** Migrations 6 (`bookings.meals`), 7
> (`bookings.has_infant`) and 8 (per-day meals, `guest_houses.serves_meals`) are
> the current examples: the booking insert names `meals` and `has_infant`, and
> migration 6's check refuses a per-day plan until 8 replaces it, so until all
> three are applied **submissions fail** while every page still renders — reads
> degrade (`normalizeMeals` reads either meals shape, a missing `has_infant` is
> derived from infant guest rows, and a missing `serves_meals` reads as false,
> which hides the meals card). After pulling changes, check whether
> `supabase/migrations/` has grown.

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
`documents` bucket applied. As last recorded (10 Sep 2026) it was on migration 5;
migrations 7 and 8 were added on 15 Sep 2026, so **check which of migrations 6,
7 and 8 are missing and apply them in order** — and
`supabase/repairs/2026-09-10-utc-parsed-bookings.sql` still needs running to
correct four bookings stored 5h30m late (see below).

### One-off repairs

`supabase/repairs/` holds data fixes that are **not** migrations and are never
applied automatically. Each file's header explains what it is for and how to
check whether it applies to your data. Read it, take a backup, and run it
deliberately in the SQL editor. They are not idempotent — the timezone repair in
particular would shift already-correct rows a second time if re-run.

## Verifying changes

There is no test framework. Two techniques were used throughout and both work
well:

**1. Ad-hoc TypeScript tests**

```bash
npx tsx --tsconfig ./tsconfig.json /path/to/test.ts
```

Write them outside the repo (a temp directory); `@/` path aliases resolve fine.
Good for store operations, workflow transitions, form-config resolution and the
time-conversion helpers.

**2. HTTP smoke tests against a running dev server**

Auth is a cookie holding a profile id, so you can impersonate anyone:

```bash
curl -s -b "gh_mock_user=<profile-id>" http://localhost:3000/book
curl -s -o /dev/null -w "%{http_code}\n" -b "gh_mock_user=<id>" http://localhost:3000/admin/users
```

Use this to confirm a page renders (200), that access control redirects (307),
and that scoping holds — e.g. the Malhar warden sees only Malhar students.

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
- `Network.setCookie` (`gh_mock_user` = a profile id), `Page.navigate`, then
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

## Deploying to production

Not yet deployed. The intended path is Vercel + hosted Supabase.

**Blocking items — do these first:**

1. **Replace mock authentication.** Swap `getCurrentUser()` in `lib/auth.ts` for
   Supabase Auth or institute SSO. Until then anyone can impersonate anyone by
   setting a cookie. This is the single most important gate.
2. **Stop using the service-role key for request-scoped reads.** Once real
   sessions exist, use the anon key with a per-request client so RLS becomes the
   enforcement boundary. Keep the service-role client only for genuine admin
   operations.
3. **Remove both sign-in doors** — the credential form
   (`components/login-form.tsx`, rendered on `/sign-in`, `/book-room` and
   `/book-meal`) and the persona picker at `/mock-login`. Keep the pages and
   `SignInPanel`; swap the form for the SSO button. Not
   behind a flag; see 09-production-plan.md step 5.
4. **Change the seeded password** (`password123`) and re-seed, or delete the demo
   accounts entirely.

**Deployment steps once those are done:**

1. Push the repository to GitHub (see [08-roadmap.md](08-roadmap.md) for the
   current permissions blocker).
2. Import the project in Vercel.
3. Set the environment variables in Vercel's project settings — mark
   `SUPABASE_SERVICE_ROLE_KEY`, `MAIL_APP_PASSWORD` and `CRON_SECRET` as
   server-only (do **not** prefix them with `NEXT_PUBLIC_`). Set
   `APP_BASE_URL` too, or every link in an email points at localhost.
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
