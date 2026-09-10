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
   order** (there are six), then `supabase/seed.sql`.
3. Copy the keys from **Project Settings → API**.

> **Migrations are not applied automatically and an existing project will not
> pick up new ones.** Migration 6 (`bookings.meals`) is the current example: the
> booking insert names the column, so until it is applied **every submission
> fails** while every page still renders — reads degrade to "no meals
> requested" via `normalizeMeals`. After pulling changes, check whether
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
`documents` bucket applied. As of 10 Sep 2026 it is on migration 5 — **migration
6 still needs applying**, and
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
