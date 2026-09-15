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
— allowing for the 56 px sticky header.

**Point the dev server at the mock store for any test that writes.**
`.env.local` holds the hosted Supabase keys, so a plain `npm run dev` writes to
the shared database. `NEXT_PUBLIC_SUPABASE_URL= npm run dev` — the variable set
to an empty string — wins over `.env.local` (Next never overrides a variable
already present in the process environment), so `supabaseConfigured()` is false
and the mock store is used. Delete the `.local-db.json` it creates afterwards if
there was none before.

**Always run before finishing:**

```bash
npm run build     # includes the TypeScript typecheck
npm run lint      # must stay clean
```

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
3. **Remove the persona picker** from `app/page.tsx`, or hide it behind a
   development-only flag.
4. **Change the seeded password** (`password123`) and re-seed, or delete the demo
   accounts entirely.

**Deployment steps once those are done:**

1. Push the repository to GitHub (see [08-roadmap.md](08-roadmap.md) for the
   current permissions blocker).
2. Import the project in Vercel.
3. Set the three environment variables in Vercel's project settings — mark
   `SUPABASE_SERVICE_ROLE_KEY` as server-only (do **not** prefix it with
   `NEXT_PUBLIC_`).
4. Deploy; Vercel detects Next.js automatically. `npm run build` must pass first.
5. Apply **all** migrations, in order, and the seed to the production Supabase
   project if it is separate from the development one.

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
