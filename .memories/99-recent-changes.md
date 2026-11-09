# Recent changes - the last round, and only the last round

This file is **replaced** every round, not appended to. The round before this
one is written up where every round is: what was asked in
[01-background.md](01-background.md), why it was done that way in
[02-decisions.md](02-decisions.md).

---

## Round of 8 November 2026 (second) - the Supabase project becomes the shared database

The owner, in three steps: *"Can you tell me whether if i book a room from
localhost in my laptop will my collaborators be able to see it. Also whether
it is better to do it in Supabase or local database for now for testing
before migrating to institute database"*, then *"which is better for our
case"*, then *"I want this same database in supabase and set the same
supabase we were using till now... Issue is that the entire schema is
different in supabase"* - and *"update the database url in the
.env.local and also comment out the local database url"*.

### 1. The answer to the question

**No.** A booking made on `localhost` was visible to nobody else, for two
independent reasons, and both had to be fixed:

- The data was in a PostgreSQL on that laptop (`127.0.0.1:5433/guesthouse_dev`),
  bound to loopback only. A collaborator who cloned the repository got their
  own `guesthouse_dev`.
- `next dev` does bind `0.0.0.0` (it prints a `Network:` address), so the LAN
  could reach the pages - but `next.config.ts` sets
  `serverActions.allowedOrigins` from `APP_URL`, which was
  `http://localhost:3000`, so **every booking submission from any other
  origin was refused**. Browsing worked; submitting did not.

What makes a booking shared is **the database, not where the app runs**. Both
laptops can keep running `npm run dev` on `localhost`; pointing
`DATABASE_URL` at one database is the whole change.

### 2. Supabase is a managed PostgreSQL now, not a store

The move of 8 Nov deleted `lib/store/supabase.ts` and the `supabase/`
directory, so "use Supabase" cannot mean the old client path. It means
**Supabase's PostgreSQL over `DATABASE_URL`**, through the same
`PostgresStore` the institute's database will use. That is the reason to
prefer it over any other host: the only line that changes when the institute
hands over its database is that one.

### 3. The schemas were never the obstacle - the data was

The premise checked and found wrong. Every column of both databases compared
(local over psql, hosted over PostgREST's OpenAPI): **387 columns against
386, and the single difference was `profiles.password_hash`**, which local has
and the hosted project did not. Same 34 tables, same 2 views.

What had actually forked was the **data**, each side holding what the other
lacked:

| | Supabase (before) | Local |
| --- | --- | --- |
| bookings / guests / logs | **35 / 61 / 98** | 6 / 6 / 12 |
| invoices | **8** | 0 |
| email_outbox / sessions / security_audit | 138 / 330 / 218 | 17 / 11 / 38 |
| profiles | 14 | **35** |
| units (drives HOD routing) | **0** | **9** |
| institute_offices / wardens / employees / students | 0 / 2 / 1 / 3 | **6 / 7 / 6 / 5** |
| user_groups / projects | 0 / 0 | **4 / 3** |

So the hosted project held the richer booking history and the only 8 invoices
in existence, and the local one held the only correct **directory** - with
`units` empty on the hosted project, HOD approval and office heads resolved to
nobody there. **The owner chose local as the truth**, knowing the cost.

### 4. The migration, and the three things that nearly stopped it

- **`pg_dump` 16 cannot dump a 17 server.** Supabase runs **PostgreSQL 17.6**,
  the laptop 16.15, and `pg_dump` refuses a newer server. The backup was taken
  with `pg_dump` 17 in a throwaway `postgres:17-alpine` container. The restore
  the other way (a 16 dump into 17) is the supported direction and needed
  nothing.
- **The direct host is IPv6-only.** `db.<ref>.supabase.co` resolves to AAAA
  only and the office network has no IPv6 route - *Network is unreachable*.
  The **session pooler** (`aws-0-ap-northeast-2.pooler.supabase.com:5432`) is
  the way in. Not the transaction pooler on **6543**, which breaks `pg_dump`
  and DDL.
- **`btree_gist` and `search_path`.** `pg_dump --schema=public` omits
  extensions (they are database-level), and its preamble sets
  `search_path` to `''`. With no schema in the path the **default gist
  operator class for `uuid` does not resolve**, and both exclusion constraints
  (`room_holds_no_overlap_guard`, `room_blocks_no_overlap`) fail to be
  created. So: `create extension btree_gist with schema public` on the target
  first, and the dump's one `set_config('search_path', '', false)` line
  rewritten to `'public, extensions'`. Every object in the dump is
  schema-qualified, so widening the path changes nothing else.

Order run: back up the hosted project, copy the local dump beside it,
`drop schema public cascade` + `create schema public` + the four Supabase
role grants + `btree_gist`, restore, verify. The only error in the restore
was `schema "public" already exists`, from the dump's own
`CREATE SCHEMA public`.

**Both dumps are kept outside the repository**, in
`~/guesthouse-db-backups/` - `supabase-before-<stamp>.sql` (1.7 MB, verified
to contain the 35 bookings, 8 invoices, 98 logs before anything was dropped)
and `local-guesthouse-<stamp>.sql`. The 8 invoices now exist **only** there.

### 5. Verified afterwards

- **Structure:** 34 tables, 2 views, 34 triggers, **2 exclusion constraints**,
  79 foreign keys.
- **Data:** every one of 24 tables checked holds exactly what local holds.
- **The app's own client:** `PostgresStore` over the pooler with SSL reads
  2 guest houses, 35 profiles, 31 tariffs, 6 bookings.
- **Rates:** all **36** (guest house x role x booking type) room combinations
  resolve through the real `resolveTariff` - Category I ₹1,000 / ₹1,500,
  II ₹1,500 / ₹2,000, III ₹2,000 / ₹2,500, breakfast ₹80. The "no rates
  published" fault of the previous round does not exist on this host.
- **The invariant:** two overlapping holds on one room from different
  bookings were **refused** by `room_holds_no_overlap_guard`, inside a
  transaction that was rolled back (no residue).
- **Pages:** `/`, `/guidelines`, `/sign-in`, `/contact` all 200 against
  Supabase.
- `npm run lint`, `npm run typecheck`, `npm test` (**661 passing**) and
  `npm run build` all clean.

### 6. `.env.local`

`DATABASE_URL` is the Supabase session pooler. **`DATABASE_SSL=true` and
`DATABASE_SSL_REJECT_UNAUTHORIZED=false`** are new and necessary: Supabase
presents its own CA, which node-postgres rejects by default, and
`lib/db/client.ts` already reads both. The local URL is kept **commented
directly below** it, so working offline is uncommenting one line. The
previous file is saved as `.env.local.bak-<stamp>` (gitignored, like
`.env.local` itself). The database password is a **real secret** and is
recorded by name and location only, in
[05-credentials-and-security.md](05-credentials-and-security.md).

### 7. Three stale things found and fixed on the way

- **`AGENTS.md`'s HTTP smoke-test recipe does not work.** `DEV_LOGIN` and the
  `gh_mock_user` cookie **no longer exist anywhere in the code**; the recipe
  was corrected to say so and to name `/api/auth/test-sign-in`. My Bookings is
  **`/dashboard`**, not `/my-bookings`.
- **`server-only` throws under `tsx`.** An ad-hoc script that imports the
  store dies on `This module cannot be imported from a Client Component
  module`. Run it with `NODE_OPTIONS="--conditions=react-server"`.
- **`pkill -f "next dev"` kills the shell that runs it**, because the pattern
  matches that shell's own command line. Use `pkill -f 'next[ ]dev'`.

### 8. What this opens

- **The password is now a shared secret** between collaborators, and resetting
  it in the dashboard breaks everyone's `DATABASE_URL` at once.
- **There is one database for everybody**, so a destructive experiment is
  destructive for everybody. A per-developer database is in
  [03-roadmap.md](03-roadmap.md).
- `guesthouse_dev` on the laptop is no longer what the app reads, and will
  drift from the shared database the moment anyone books.
