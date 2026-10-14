# Recent changes - the last round, and only the last round

This file is **replaced** every round, not appended to. The round before this
one is written up where every round is: what was asked in
[01-background.md](01-background.md), why it was done that way in
[02-decisions.md](02-decisions.md).

---

## Round of 14 October 2026 - an import you can undo

The brief was to make the project secure, normalized and ready for the real
user import. The item at the top of it was the one gap
[04-production.md](04-production.md) §1a.7 had named outright:

> "A wrong batch of updates is the dangerous one. There is no undo: the
> previous values are not kept."

**Three migrations, one new module, one SQL recovery script, 12 new tests. No
table split, no column dropped, no feature changed, nothing applied to the
hosted project.**

### 1. The import can be undone (migration 32)

An import matches on `lower(email)` and **updates** whoever it finds. That is
what makes it safe to run twice, and it is what makes a stale sheet dangerous:
re-importing a file a month old overwrites every correction the office has made
by hand since - the `hostel_name` a warden is scoped to, the `unit_id` an HOD is
found through, the `role` itself.

`importUsersAction` now writes a record of what it is about to do **before it
does it**: the accounts it will create, and the previous values of every account
it will change. Then **Users & Roles -> Recent imports -> Undo**
(`revertUserImportAction`, type `UNDO`, audited, TOTP step-up) puts them back.

**Writing the record first is the whole design.** §1a.6 had warned that the
import "can still time out part-way, and nothing records where it stopped" - a
record written at the end would be missing for exactly the imports that need it.
Written first, it is complete whatever happens next, and `status` starts at
`applying`, so a batch still reading that **is** the report that an import did
not finish.

Three rules it does not bend:

- **an account changed since the import is left alone and named.** The undo
  takes back what that import did; it does not roll the directory back to a
  date. Reverting a hand correction would destroy the newer, better value.
- only the **eight fields an import may write** are restored.
- the accounts the import created are deleted **first**, because one of them may
  hold an LDAP username a restore is about to ask for.

Partial by design, like `deleteUsersAction`: whatever cannot be undone is named
back and the rest still is.

### 2. Two bugs in the username-swap path, both pre-existing

`planUserImport` deliberately allows one paste to move an LDAP username between
two accounts. `lower(ldap_uid)` is unique, and both bugs come from that.

1. **The import failed part-way on a swap.** The account *receiving* the
   username was written while the account *giving it up* still held it. The old
   holder now releases it first - the same two passes as `importLdapUidsAction`,
   and before the inserts too, because a *new* account can be the one taking it.
2. **An undo could leave an account unable to sign in.** If one half of a swap
   has since been corrected by hand, the other half cannot have its old username
   back. The first implementation released the username and then failed to write
   the old one, leaving that account with **none**. It is now classified as a
   conflict before anything is written, and skipped whole.

### 3. `total_rooms` gets its trigger (migration 33)

Finding 2 of the 13 Oct normalization review, recorded then and fixed now: a
stored derived value maintained only by application code, so a room inserted or
deactivated by SQL left the count stale. The column stays - dropping it would
change `GuestHouse` in `lib/types.ts` and two console pages to fix something a
trigger closes. Its own migration, because 32 is required by the code and 33 is
optional.

### 4. Twenty foreign-key indexes, measured (migration 34)

**A ninth normalization finding, found while building the undo.** Postgres
indexes the key being *referenced*, never the column *referencing* it. 22
foreign keys had no supporting index, 15 of them pointing at `profiles` - so
deleting one profile scanned 15 child tables in full, and **undoing an import
deletes every account it created, up to 2000.**

Measured in a throwaway Postgres with 200,000 `booking_logs` rows:

| | 300 profiles deleted |
| --- | --- |
| before | 2,580 ms |
| after | 64 ms (3 samples: 63.4 / 64.1 / 63.8) |

The before figure grows with the history; the after figure does not. Only the 20
whose parent is actually deleted - `invoices.replaces_invoice_id` earns nothing
(invoices are never deleted) and `booking_guests` already has an index on the
composite key's leading column.

### 5. The provider question, answered

The last two rounds recorded that whether the hosted project has the
email/password provider enabled "cannot be read with the service-role key" and
was therefore unverified. True, and beside the point: **GoTrue publishes it.**
`GET /auth/v1/settings` needs only the anon key that already ships in the
browser, writes nothing, and answers in one request.

**It is enabled, with `disable_signup: false`.** So there is a worse path than
the published `password123`: with signup open an attacker needs no portal
account and no leaked password - they sign up with an address they control and
hold an `authenticated` JWT, which until migration 31 is applied means the whole
directory and every uploaded ID document.

So **turning the provider off moves to the front of the queue** - a dashboard
toggle, no migration, and the portal does not use it. §1a.1 has it as step 1.

**The `anon` role was checked the same way and is not exposed**: 200 and zero
rows on `profiles`, `bookings`, `booking_guests` and `academic_records`. That
independently confirms the 13 Oct claim that dropping the `authenticated`
policies cannot break Realtime, which connects as `anon`.

**Deliberately not tested:** the ID-document download the policies permit.
Confirming it would mean creating an account on the production project and
opening real guests' identity documents.

### 6. Excel preparation, without inventing the file

The file still has not been provided. **No column names were invented.** New
§1a.3a is eight things to check against the real sheet, what the silent failure
looks like (an unrecognised header line is read as *data*, and reports "line 1
is not an email address"), and an explicit statement of what is **not**
prepared and why. No new personal field is collected.

### Files

**New:** `lib/users-import-undo.ts`,
`supabase/migrations/00000000000032_user_import_batches.sql`,
`00000000000033_guest_house_room_count.sql`,
`00000000000034_foreign_key_indexes.sql`,
`supabase/repairs/2026-10-14-restore-user-import.sql`,
`tests/user-import-undo.test.ts`.

**Changed:** `app/actions/admin.ts` (`importUsersAction` rewritten,
`revertUserImportAction` and `listUserImportsAction` added),
`lib/store/types.ts` (`SeededProfileInput`, `createProfiles`, four batch ops),
`lib/store/mock.ts`, `lib/store/supabase.ts` (`createProfiles`,
`userImportFromRow`, `importBatchError`), `lib/supabase/database.types.ts`,
`components/admin/users-manager.tsx` (Recent imports + the Undo dialog),
`app/(portal)/admin/users/page.tsx`, `e2e/ninth-round.spec.ts` (the undo
journey), `scripts/check-migrations.mjs` (markers
32, 33, 34), `AGENTS.md` (migrations 31-34, which it was missing entirely, and
two stale claims: that creating a user mints an Auth user with `password123`,
and that `total_rooms` is kept only by application code).

**Unchanged, deliberately:** `lib/users-import.ts` (verified correct last
round; only where its plan is *applied* changed), every rule module, both
forms, the approval engine, `profiles` and `academic_records`.

### How it was checked

- `npm run lint`, `npm run typecheck` - clean.
- **`npm test` - 546 passing, 32 files** (up from 535 / 31; +11 new).
- `NEXT_PUBLIC_SUPABASE_URL= npm run build` - clean.
- `npm run check:memories`; `npm run check:migrations` against the hosted
  project read-only - **1-30 applied**, 32 correctly reported missing, and 17,
  23, 31, 33, 34 named as the five it cannot probe, each printing its SQL.
- **A fresh throwaway `postgres:16-alpine`**: 1-34 applied in order, then
  `supabase/seed.sql` - **18 profiles, 0 `auth.users`, 0 `authenticated`
  policies**, and `total_rooms` equal to the active room count for both guest
  houses. 32, 33, 34 each re-applied with no error. Migration 33's trigger
  checked over insert, deactivation, delete and a room **moved** between guest
  houses. Migration 32's constraints checked by refusing a `reverted` batch with
  no timestamp and a non-array `added`. The 31 rollback re-run on top: policies
  **0 -> 38 -> 0** with the profiles untouched, the auth foreign key still gone.
  The unindexed-foreign-key query returns exactly the two rows 34 leaves.
- **The SQL recovery script run end to end, twice**, on a fixture built to be
  awkward: an account corrected by hand after the import, a username swap, and
  an imported account that had since been booked on. Clean case restores
  everything including the swap; nasty case names both skips, leaves the hand
  correction untouched, deletes the un-booked account and keeps the booked one.
  **Three bugs found by running it** - see
  [22-running-and-testing.md](22-running-and-testing.md).
- **Mutation-verified**: removing the "changed since the import" guard, and
  disabling `uidsToRelease`, each fail a named test.
- **`npm run test:e2e` - 41 passing** (was 40), including a new journey that
  imports through the real console, runs a **stale sheet** over it, undoes that
  batch and checks the accounts are restored, then undoes the first batch and
  checks its accounts are deleted. This is what proves the **wiring** - the
  unit tests prove the rules. It found one thing nothing else would have: the
  e2e database is shared across a run, so a batch list is not only this test's,
  and rows must be picked by what they did rather than by position.

**Not verifiable from here, and so not claimed:** live production rows (the
sandbox blocks production reads), and whether the document download the
policies permit actually works - deliberately not tested, above.

### Left open

[03-roadmap.md](03-roadmap.md) §1 gate 10 (now **three** production steps: the
provider toggle, migrations 31-34, the Auth-user repair - in that order) and
§2f for the rest: an import's **updates** are still one request per person
(gate 11 is no longer a gate, because a failure is now recoverable), nothing
purges `user_import_batches`, the academic-records import has no undo of its
own, no `is_active` for people who leave, the 2000-row ceiling, and
`department_or_club`'s duplication - whose practical risk at import time is a
sheet that fills the free text and leaves `unit` blank, producing people whose
official bookings have **no HOD**.
