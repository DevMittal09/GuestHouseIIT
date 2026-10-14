# Recent changes - the last round, and only the last round

This file is **replaced** every round, not appended to. The round before this
one is written up where every round is: what was asked in
[01-background.md](01-background.md), why it was done that way in
[02-decisions.md](02-decisions.md).

---

## Round of 13 October 2026 (second) - the second door is closed, the schema is left alone

The morning round reviewed the schema before the college's user import and
found that `password123` was not harmless. This round **implements** the fix,
answers the normalization question with evidence, and prepares the import.

**One migration, three code changes, two repair scripts, two test files. No
table split, no column dropped, no feature changed.**

### 1. Normalization: three fixes, one recorded, four confirmed correct

Full list in [21-database.md](21-database.md), *"Normalization - the review of
13 Oct 2026"*. The headline is that **the schema is in good shape** and needed
no restructuring to hold the college's data.

**Fixed** (migration 31): `profiles` had almost no indexes (nothing on `role`,
`unit_id` or `hostel_name`), no case-insensitive index behind the very key the
import matches on, and no check constraints at all.

**Recorded, not fixed:** `guest_houses.total_rooms` is a stored derived value
recounted by application code, so a room inserted by SQL leaves it stale - a
plain update anomaly. The fix is a trigger; it is not what the import needs,
and it does not belong in a security migration.

**Confirmed correct as they are:** `profiles` staying one table (19 foreign
keys, and a role is an authorisation level, not a category of person);
`academic_records` staying one table with nullable per-kind columns (migration
28 decided it, and the sheet feeds it); its `hostel` staying free text (the
institute's own spelling, display-only - checked, no reader authorises on it);
and `profiles.department_or_club` staying although it duplicates `unit_id`,
because **five modules read it** - dropping it is a feature removal, not a
normalization.

Four denormalizations examined and kept because they are right:
`bookings.user_role` and `booking_logs.action_by_name` preserve history
deliberately, issued invoices are snapshots, and `bookings.search_text` turned
out not to be a denormalization at all - it is `generated always as ... stored`.

### 2. The security fix: remove the reason for the credential

Rotating `password123` to a random password was **rejected**: it would leave
every imported person with a working GoTrue credential, just an unknown one,
and `authenticated` would still have 38 policies behind it. The problem was
never a weak password - it was that **a portal account implied a database
credential at all**.

**Migration 31** (`00000000000031_decouple_auth_and_tighten_rls.sql`):

- **drops `profiles.id -> auth.users (id)`** and gives the column its own
  `gen_random_uuid()` default. The portal has never authenticated with
  Supabase Auth (LDAP or Google, then a session row - migration 21), so the
  key was the only reason those users existed. **No id changes**, so all 19
  foreign keys are untouched;
- **drops all 38 `authenticated` policies**, 21 of them writes, including
  `developer manages profiles / bookings / rooms / guest_houses /
  booking_guests / form_configs`. RLS stays **enabled**, so `authenticated` is
  denied by default - migration 28's deliberate pattern for
  `academic_records`, now applied to the rest;
- **drops the two blanket `documents` bucket policies** and forces
  `public = false`. Any JWT could previously download every guest's ID
  document and alumni card;
- **adds** the three `profiles` indexes, `profiles_email_lower_idx` (not
  unique - see the migration) and two `not valid` check constraints.

Beside it: `createProfile` is **one insert with no Auth user**; `deleteProfile`
still removes an Auth user best-effort for accounts that predate the
migration; `supabase/seed.sql` creates **no Auth users** (it used to create 18
with that password); `database.types.ts` marks `id` generated.

**Three facts checked, not assumed, before dropping 38 policies:**

1. nothing legitimate connects as `authenticated` - the server uses the
   service-role key, which bypasses RLS;
2. **Realtime connects as `anon`**, not `authenticated`
   (`components/live-updates.tsx`, `persistSession: false`), and there has
   never been an `anon` policy - so live updates cannot break. This was the
   one thing that could have made the change a regression;
3. RLS stays on, which is **not** the same as dropping every policy - with RLS
   off, every role reads everything.

### 3. The one coupling, made legible

`createProfile` now inserts without an id and without an Auth user, which a
database still on migration 30 refuses two ways. **So the code and migration
31 ship together** - there is no version that works on both schemas, because
the foreign key fundamentally requires an Auth user.

Accepted rather than engineered around (a client-generated id does not help -
the foreign key still fails), and made legible instead: `profileWriteError`
catches both error codes and **names the migration**, the way migration 25's
absence names itself. Verified against a throwaway database on migration 30 -
the insert fails with `null value in column "id"` (23502), which without the
handler sends somebody looking at the application code.

This is the **first migration that is not optional once the code is
deployed**, and [04-production.md](04-production.md) §5 now says so.

### 4. Tests, because the prose was wrong

- **`tests/rls-surface.test.ts` (7 checks)** asserts the invariant against the
  SQL itself: no `authenticated` policy survives, RLS is never disabled, the
  seed creates no Auth user, the store mints no password. It pins the
  historical count at 38 so the parser cannot stop matching and pass
  vacuously. **Mutation-verified**: removing one `drop policy` line from
  migration 31 fails it with that policy named. It exists because two written
  claims in this folder were false and had been read forward twice - a
  regression test is the only form of that claim that cannot rot.
- **`tests/user-import-idempotency.test.ts` (9 checks)** asserts the property
  the college's *repeated* sheets depend on and `ninth-round` does not cover:
  a person imported twice is **one row with one id, for ever**. If a re-import
  inserted a second row or reassigned an id, everyone's booking history would
  detach in one press and nothing on screen would say so.

### 5. What was deliberately NOT done

- **Migration 31 is not applied to the hosted project**, and the 18 Auth users
  are **not deleted**. Both are production actions on live data and need the
  owner's approval. The order matters and is in
  [04-production.md](04-production.md) §1a.1: the repair **refuses to run
  before** the migration, because the old key's `on delete cascade` would take
  every profile with the Auth users it deletes.
- **The Excel mapping.** The file still has not been provided. §1a.3 lists the
  columns the portal can consume plus an explicit drop-list; mapping the
  college's actual headers needs one pass over the real sheet.
- **No column or table dropped**, and `total_rooms`' trigger left for its own
  round.

### Files

**New:** `supabase/migrations/00000000000031_decouple_auth_and_tighten_rls.sql`,
`supabase/repairs/2026-10-13-retire-seeded-auth-users.sql`,
`supabase/repairs/2026-10-13-rollback-migration-31.sql`,
`tests/rls-surface.test.ts`, `tests/user-import-idempotency.test.ts`.

**Changed:** `lib/store/supabase.ts` (`createProfile`, `deleteProfile`,
`profileWriteError`), `lib/supabase/database.types.ts` (`id` generated),
`supabase/seed.sql` (no Auth users), `scripts/check-migrations.mjs` (a
`kind: "sql"` marker for 31, and the closing report generalised).

**Unchanged, deliberately:** every rule module, both forms, the approval
engine, `lib/users-import.ts` (already correct - verified, not rebuilt), and
`public.my_role()` / `public.can_access_booking()` (unused now, but the
starting point if the app ever moves to per-user Supabase sessions - at which
point note that **`auth.uid() = profiles.id` stops being true at migration
31**, so the old policies cannot simply be restored).

### How it was checked

- `npm run lint`, `npm run typecheck` - clean.
- **`npm test` - 535 passing, 31 files** (up from 519 / 29; +16 new).
- `NEXT_PUBLIC_SUPABASE_URL= npm run build` - clean.
- `npm run check:memories`, and `npm run check:migrations` against the hosted
  project read-only: **1-30 applied**, with 17, 23 and **31** reported as the
  three it cannot probe, each printing its SQL.
- **Migration 31 in a throwaway `postgres:16-alpine`**: 1-31 applied in order;
  auth foreign key gone; **0** `authenticated` policies; RLS still enabled on
  six core tables; new indexes present; an insert with **no id** accepted; both
  check constraints refusing a bad address, an untrimmed address and a
  one-character name; 31 re-applied with no error; the new seed giving **19
  profiles and 0 auth users**; the rollback script taking policies 0 -> 38 and
  31 taking them back to 0 with profiles untouched; and, on a database held at
  migration 30, the exact failure the new error message is written for.

**Not verifiable from here, and so not claimed:** whether the hosted project
has the email/password provider enabled (a dashboard setting, not in the
repository, not readable with the service-role key - **still the control that
matters most until the repair runs**), and live production rows (the sandbox
blocks production reads).

### Left open

[03-roadmap.md](03-roadmap.md) §1 gate 10 (three production steps) and gate 11
(the import is still applied row by row - halved, not fixed), and §2f for the
rest: `total_rooms`' trigger, no undo for an import's *updates*, no
`is_active` for people who leave, the 2000-row ceiling, and
`department_or_club`'s duplication - whose practical risk at import time is a
sheet that fills the free text and leaves `unit` blank, producing people whose
official bookings have **no HOD**.
