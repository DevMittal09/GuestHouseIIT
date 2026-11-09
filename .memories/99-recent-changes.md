# Recent changes - the last round, and only the last round

This file is **replaced** every round, not appended to. The round before this
one is written up where every round is: what was asked in
[01-background.md](01-background.md), why it was done that way in
[02-decisions.md](02-decisions.md).

---

## Round of 9 November 2026 (third) - the shared database, on a laptop

The owner: *"i want to get the dump of the database in supabase to use in
another laptops local database can you give me that, and also instructions on
how to use that in the database. That database was already initialized, just
changes we made are left to make in that, issue is idk from which commit."*

**No code changed.** The deliverable is a package outside the repository, in
`~/guesthouse-db-backups/`:

| File | What it is |
| --- | --- |
| `guesthouse-shared-2026-11-09.sql` (+ `.gz`, 48 KB) | the shared database's `public` schema and data |
| `restore-shared-db.sh` | the restore, with its own verification; exits non-zero on anything but 2 exclusion constraints |
| `RESTORE-README.md` | the instructions, including what not to do |

### The question did not need answering

*"I don't know from which commit"* assumes a set of migrations to apply on top
of what is there. It is not: `drop schema public cascade` plus a full restore
makes the dump the definition, whatever state that laptop's database had
drifted into - half-applied migrations included. The same reasoning as 8 Nov's
decision to replace the hosted schema wholesale. The cost is stated in the
README: anything that existed only on that laptop is gone.

### Three incompatibilities fixed inside the dump itself

The source is **PostgreSQL 17.6** (hosted) and both laptops run **16.15**, so
a plain `pg_dump` output does not restore. Each is marked in the file.

| | What | Why it matters |
| --- | --- | --- |
| 1 | `search_path` was `''` | Already known from 8 Nov, and still the dangerous one: the default gist operator class for `uuid` cannot resolve, so **both exclusion constraints fail to be created** and the restore still reports success. That database accepts two guests in one room, silently. Now `'public, extensions'` |
| 2 | `\restrict` / `\unrestrict` | psql 17.6+ meta-commands; psql 16 says *invalid command* and `ON_ERROR_STOP` kills the restore at line 5 |
| 3 | `SET transaction_timeout = 0;` | PostgreSQL 17+ only; on 16, *unrecognized configuration parameter*, dead at line 13. 0 is that parameter's default, so commenting it loses nothing |

A fourth, found while testing: the dump's own `CREATE SCHEMA public` clashes
with the schema you must create first to install `btree_gist`, so it is
commented out and the recipe creates both.

### Verified, on a real PostgreSQL 16

Not "the dump was produced". The file was restored into a throwaway `gh_restore_test`
on this laptop's **16.15** server:

- `psql -v ON_ERROR_STOP=1` exited **0**, zero errors.
- **All 34 tables** matched the shared database's row counts (`query_to_xml`
  over `pg_class`, diffed).
- 34 tables, 2 views, **2 exclusion constraints**, 49 FKs, 22 triggers, 215
  functions, 118 indexes - identical on both sides.
- Two overlapping room holds were **refused**: `conflicting key value violates
  exclusion constraint "room_holds_no_overlap_guard"`.
- `restore-shared-db.sh` itself was run end to end, then the test database was
  dropped.

> A first comparison read **79 FKs and 34 triggers against 49 and 22** and
> looked like data loss. It was the query: `pg_constraint` and `pg_trigger`
> include Supabase's own `auth`, `storage` and `realtime` schemas, which a
> `--schema=public` dump never carried. Scoped to `public` they agree. Noted
> in [22-running-and-testing.md](22-running-and-testing.md) because the
> instinct on seeing 79 vs 49 is to distrust the dump.

### Found on the way

**Migration 36 is applied nowhere.**
`scripts/migrations/00000000000036_room_classes_and_tariff_categories.sql` is
in the working tree but the shared database has no `rooms.room_class` and no
`tariffs.tariff_category` - so it is not in this dump either, and code that
expects those columns works against neither database. The one match for
`tariff_category` in the dump is the unrelated pre-existing constraint
`bookings_tariff_category_pair`.

### Checks

No code changed, so nothing was rebuilt. The dump package was verified as
above; `npm run check:memories` passes.

### What this opens

[03-roadmap.md](03-roadmap.md) §2t: a copy on a laptop drifts from the shared
database the moment anybody books, and nothing reconciles them; and migration
36 now has to reach two places rather than one.
