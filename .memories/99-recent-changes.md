# Recent changes - the last round, and only the last round

This file is **replaced** every round, not appended to. The round before this
one is written up where every round is: what was asked in
[01-background.md](01-background.md), why it was done that way in
[02-decisions.md](02-decisions.md).

---

## Round of 2 November 2026 (fourth session) - Supabase removal: Postgres only

Continuation of the auth cleanup. The owner's instruction: **"I want only
postgres."** The Supabase store, its migration files, seed SQL, repair scripts
and the `@supabase/supabase-js` dependency were already removed in prior
sessions. This session removed the `supabase/` directory itself and every
remaining reference to it.

### What was delivered

**Deleted `supabase/` directory** (393 KB): 35 migration SQL files, 10 repair
scripts, `seed.sql`, and `.temp/` scratch files. None were executed by any code
path — `lib/store/index.ts` already selected only `PostgresStore` or
`MockStore`. The consolidated schema lives in `scripts/init-postgres.sql`.

**Deleted `tests/rls-surface.test.ts`** (174 lines): asserted RLS invariants
by reading `supabase/migrations/`. With direct Postgres and no Supabase Auth,
the `authenticated` role is not reachable and the RLS surface it guarded is
moot. The invariants it proved (no `authenticated` policy, RLS enabled, no
public bucket) are structural to `init-postgres.sql`.

**Fixed `tests/fourteenth-round.test.ts`**: removed the assertion that read
`supabase/seed.sql` (the day-scholar persona test). The seed fact it checked
(`122203099` is a student with null hostel) is still tested from the mock
store's seed data.

**Updated `scripts/check-migrations.mjs`**: the final output message no longer
references `supabase/migrations/` paths. The script itself is unchanged — it
probes the live database with SQL queries, not migration files.

**Cleaned up supabase comments** in 6 source files: `lib/store/seed.ts`,
`lib/store/mock.ts`, `lib/types.ts`, `tests/user-import-undo.test.ts`,
`lib/users-import-undo.ts`, `lib/academic/mock-source.ts`.

### What stays

- **`scripts/init-postgres.sql`** is the single schema source of truth.
- **`scripts/check-migrations.mjs`** (`npm run check:migrations`) still probes
  the live database for schema markers — useful for verifying a deployment.
- **`lib/store/postgres.ts`** (direct `pg` driver) and **`lib/store/mock.ts`**
  (JSON file) are the two `DataStore` implementations.
- **`ldap_uid`** column stays on profiles (37 references, harmless).

### What is open

- The `supabase` references in `.memories/` markdown files and `AGENTS.md` are
  now historical. Architecture file (`20-architecture.md`) updated this round.
- `AGENTS.md` still carries extensive Supabase migration documentation — that
  file is generated/maintained separately and describes the project as last
  committed.

### Validation

`npm run lint`, `npm run typecheck`, `npm test` (599 tests, 34 files) and
`npm run build` all clean.
