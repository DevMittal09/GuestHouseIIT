-- ============================================================================
-- Migration 32 - The undo record for a spreadsheet import of accounts
--                (14 Oct 2026)
-- ============================================================================
--
-- WHY
--
-- `.memories/04-production.md` §1a.7 said this plainly before the import was
-- built out, and it is the one thing on the import path with no safety net:
--
--     "A wrong batch of updates is the dangerous one. There is no undo: the
--      previous values are not kept, and the audit row records only the counts
--      and the column list, not the old values."
--
-- An import matches on `lower(email)` and **updates** anybody already on the
-- list. That is what makes it safe to run twice, and it is also what makes a
-- stale sheet dangerous: re-importing a file that is a month old silently
-- overwrites every correction the office has made by hand since. The fields it
-- overwrites are not cosmetic - `hostel_name` is what an Assistant Warden's
-- queue is scoped to, `unit_id` is how an employee's HOD is found, and `role`
-- is the authorisation level itself.
--
-- Deleting the rows an import *added* was already possible from Users & Roles.
-- Restoring the rows it *changed* was not possible at all.
--
-- WHAT THIS TABLE IS
--
-- One row per import, written **before** the first profile is touched, holding
-- every account the import is about to create and, for every account it is
-- about to change, the values that account holds now. `app/actions/admin.ts`
-- writes it; `lib/users-import-undo.ts` turns it back into a list of writes.
--
-- Three consequences of writing it first, all deliberate:
--
--   * an import that times out part-way through - the failure
--     `04-production.md` §1a.6 warns about - still has a complete undo record,
--     because the record never depended on the import finishing;
--   * the ids of the accounts it creates are minted by the application, not by
--     this database's `gen_random_uuid()` default, so the record can name rows
--     that do not exist yet;
--   * `status` starts at `applying`. A batch left in that state is a report
--     that an import did not finish, which nothing recorded before.
--
-- WHY ONE TABLE WITH TWO JSONB ARRAYS, NOT CHILD TABLES
--
-- A batch is written whole, read whole, and never queried across: nobody asks
-- "which imports touched this person" - they ask "undo that import". Child
-- tables would add two foreign keys, two indexes and a join for no query that
-- exists. The deciding reason is the recovery path, though: an undo has to work
-- when the application cannot run, and
-- `supabase/repairs/2026-10-14-restore-user-import.sql` restores from **one
-- row** with plain SQL. That script is the reason the shape is what it is.
--
-- RLS: enabled with **no `authenticated` policy**, the pattern migration 28
-- chose for `academic_records` and migration 31 applied to everything else.
-- These rows hold names, institute email addresses, roll numbers and LDAP
-- usernames - the directory, with history. Service-role only.
--
-- Additive. Creates one table and nothing else, so it cannot affect an
-- existing row. Idempotent and safe to re-run.
--
-- SHIPS WITH THE CODE. `importUsersAction` refuses to run without this table
-- rather than importing with no undo record, so - like migration 31 - it is
-- not optional once the code is deployed. `importBatchError`
-- (`lib/store/supabase.ts`) names this file when it is missing.
-- ============================================================================

create table if not exists public.user_import_batches (
  id              uuid primary key default gen_random_uuid(),
  at              timestamptz not null default now(),

  -- Who pressed Import. `on delete set null` with the name kept beside it, the
  -- same pattern as `booking_logs.action_by` / `action_by_name`: the record of
  -- what happened has to outlive the account that did it.
  actor_id        uuid references public.profiles (id) on delete set null,
  actor_name      text not null,

  status          text not null default 'applying'
                    check (status in ('applying', 'applied', 'failed', 'reverted')),

  -- The columns the paste was read as, as the operator saw them on the plan.
  columns_used    text not null default '',

  -- [{ "id": uuid, "email": text }] - the accounts this import created.
  added           jsonb not null default '[]'::jsonb
                    check (jsonb_typeof(added) = 'array'),

  -- [{ "id": uuid, "email": text, "before": {...}, "after": {...} }] - the
  -- accounts it changed, with the eight import-writable fields on each side.
  -- `before` is the whole point of the table.
  updated         jsonb not null default '[]'::jsonb
                    check (jsonb_typeof(updated) = 'array'),

  unchanged_count integer not null default 0 check (unchanged_count >= 0),

  error           text,
  applied_at      timestamptz,

  reverted_at         timestamptz,
  reverted_by         uuid references public.profiles (id) on delete set null,
  reverted_actor_name text,

  -- An undone batch must say when, so the console can show it and refuse a
  -- second undo. Enforced here rather than only in the action, because the
  -- recovery script writes this column too.
  constraint user_import_reverted_shape
    check ((status = 'reverted') = (reverted_at is not null))
);

comment on table public.user_import_batches is
  'One row per spreadsheet import of accounts (migration 32). Written before the import runs and holds the previous values of every account it changed, so an import can be undone - including one that failed part-way. See lib/users-import-undo.ts and supabase/repairs/2026-10-14-restore-user-import.sql.';

comment on column public.user_import_batches.updated is
  'The accounts the import changed: [{id, email, before, after}], each side holding the eight fields an import may write. `before` is what an undo restores, and only where the account still holds `after` - a row corrected by hand since the import is left alone and named.';

comment on column public.user_import_batches.status is
  'applying -> applied | failed | reverted. `applying` is written first, so a batch still in that state is an import that did not finish.';

-- The console lists the newest few; nothing else reads this table.
create index if not exists user_import_batches_at_idx
  on public.user_import_batches (at desc);

-- Service-role only, like `academic_records` (migration 28) and like every
-- other table since migration 31. No `authenticated` policy is created here
-- deliberately: with RLS enabled and no policy, that role is denied by default.
alter table public.user_import_batches enable row level security;
