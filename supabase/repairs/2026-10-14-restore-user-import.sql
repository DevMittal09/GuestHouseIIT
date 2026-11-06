-- ============================================================================
-- Repair, 14 Oct 2026 - undo a spreadsheet import of accounts, in plain SQL
-- ============================================================================
--
-- NOT A MIGRATION. Read this whole header before running it. It writes to
-- `public.profiles` on the project you point it at.
--
-- WHEN TO USE THIS RATHER THAN THE CONSOLE
--
-- **Prefer the console.** Users & Roles -> Recent imports -> Undo does
-- everything this script does, checks the per-account rules the console
-- enforces (`userEditError`), records the undo in `security_audit`, and names
-- back whatever it could not undo. Use this script only when the application
-- cannot be relied on:
--
--   * the portal will not start, or the console will not open;
--   * the import was run against the wrong project and nobody can sign in to
--     the right one;
--   * `user_import_batches` has a row the console refuses to act on and you
--     need to see exactly what it would write.
--
-- This script is the reason migration 32 keeps the whole undo record in **one
-- row** with two jsonb arrays instead of child tables: a recovery path that
-- needs a join and a working application is not a recovery path.
--
-- WHAT AN UNDO MEANS HERE
--
-- An import adds accounts and **updates** the accounts it matched by email.
-- Undoing it means:
--
--   * putting back the values in `updated[].before` - but **only** where the
--     account still holds `updated[].after`. An account somebody has corrected
--     by hand since the import must be left alone: reverting it would throw
--     away the newer, better value. Section 2 lists those separately and does
--     not touch them.
--   * deleting the accounts in `added[]` - but **only** those with no
--     bookings. A booking's `user_id` references `profiles.id`, so the delete
--     would be refused anyway; section 4 names them instead.
--
-- Ids are never reassigned by an import or by this script. 19 foreign keys
-- across 11 tables point at `profiles.id`.
--
-- HOW TO RUN IT
--
--   1. Take a backup first - `supabase db dump`, the drill in
--      `.memories/04-production.md` ("Backup and restore"). This script writes
--      to the user table.
--   2. Find the batch:   select id, at, actor_name, status,
--                               jsonb_array_length(added)   as added,
--                               jsonb_array_length(updated) as updated
--                          from public.user_import_batches order by at desc;
--   3. Put its id in the \set below, or replace :'batch' throughout.
--   4. Run sections 0-2 first and **read them**. They change nothing.
--   5. Run sections 3-5 to apply the undo.
--
-- Sections 0, 1, 2 and 4 are read-only. Sections 3 and 5 write.
-- ============================================================================

-- Stop at the first error. Without this, a failure in section 3 would leave
-- the later sections to run anyway - which in testing marked a batch
-- `reverted` whose restore had just rolled back.
\set ON_ERROR_STOP on

\set batch '00000000-0000-0000-0000-000000000000'

-- The id is carried in a session setting, not only in the psql variable:
-- psql does **not** interpolate `:'batch'` inside a dollar-quoted `do` block,
-- so section 0 could not see it. This is the one place it is interpolated.
select set_config('gh.restore_batch', :'batch', false);

-- ---------------------------------------------------------------- 0. the batch
-- Refuses to go on if the id names nothing, or if it has already been undone.
do $$
declare
  v_batch public.user_import_batches;
begin
  select * into v_batch from public.user_import_batches
   where id = current_setting('gh.restore_batch')::uuid;
  if not found then
    raise exception 'No import batch %. List them with: select id, at, actor_name, status from public.user_import_batches order by at desc;',
      current_setting('gh.restore_batch');
  end if;
  if v_batch.status = 'reverted' then
    raise exception 'Batch % was already undone at % by %',
      v_batch.id, v_batch.reverted_at, coalesce(v_batch.reverted_actor_name, 'unknown');
  end if;
  raise notice 'Batch % of % by %: % added, % updated, status %',
    v_batch.id, v_batch.at, v_batch.actor_name,
    jsonb_array_length(v_batch.added), jsonb_array_length(v_batch.updated),
    v_batch.status;
end $$;

-- ------------------------------------------------------------ 1. the plan
--
-- One classification, in a temporary view, read by every section below. The
-- eight-field comparison appeared three times in the first draft of this
-- script, which is three places to get it wrong; and the comparison is the
-- whole safety property, so it gets one home here.
--
-- `skip_reason` null means "put this one back". Anything else is a row the
-- undo leaves alone, and section 2 prints it.
--
-- **A table, not a view.** A view is re-evaluated by every statement that
-- reads it, and section 3 writes to `profiles` twice: the first write releases
-- the usernames, which made `matches_after` false for exactly the rows about
-- to be restored, so the second write matched nothing. The plan has to be a
-- snapshot taken before any of it is applied. (Found by running this script
-- against a throwaway Postgres, 14 Oct 2026.)
create temp table restore_base as
with b as (
  select * from public.user_import_batches
   where id = current_setting('gh.restore_batch')::uuid
),
u as (
  select (r->>'id')::uuid as id, r->>'email' as email,
         r->'before' as before, r->'after' as after
    from b, jsonb_array_elements(b.updated) as r
)
select u.id, u.email, u.before, u.after,
       p.id is not null as still_exists,
       -- Does the account still hold exactly what the import gave it?
       (p.id is not null
        and p.full_name          is not distinct from u.after->>'full_name'
        and p.role::text         is not distinct from u.after->>'role'
        and p.hostel_name        is not distinct from u.after->>'hostel_name'
        and p.department_or_club is not distinct from u.after->>'department_or_club'
        and p.roll_number        is not distinct from u.after->>'roll_number'
        and p.ldap_uid           is not distinct from u.after->>'ldap_uid'
        and p.staff_category     is not distinct from u.after->>'staff_category'
        and p.unit_id::text      is not distinct from u.after->>'unit_id'
       ) as matches_after,
       p.ldap_uid as uid_now,
       p.full_name as name_now, p.role::text as role_now,
       p.hostel_name as hostel_now, p.unit_id::text as unit_now
  from u
  left join public.profiles p on p.id = u.id;

create temp table restore_plan as
select r.*,
       case
         when not r.still_exists then 'the account has since been deleted'
         when not r.matches_after then 'changed since the import - left as it is'
         -- The username it had before is now somebody else's, and that
         -- somebody is not itself being restored (a row that is gets its
         -- username released first, in section 3). Restoring this one would
         -- violate the unique index on lower(ldap_uid), so it is skipped
         -- whole - which is exactly what the console's undo does with it.
         when r.before->>'ldap_uid' is not null and exists (
                select 1 from public.profiles q
                 where lower(q.ldap_uid) = lower(r.before->>'ldap_uid')
                   and q.id <> r.id
                   and q.id not in (select b2.id from restore_base b2 where b2.matches_after)
              )
           then 'LDAP username ' || (r.before->>'ldap_uid') || ' is now held by '
                || coalesce((select q.email from public.profiles q
                              where lower(q.ldap_uid) = lower(r.before->>'ldap_uid')
                                and q.id <> r.id limit 1), 'another account')
         else null
       end as skip_reason
  from restore_base r;

-- What section 3 will put back.
select email, name_now, before->>'full_name' as name_before,
       role_now, before->>'role' as role_before,
       hostel_now, before->>'hostel_name' as hostel_before,
       unit_now, before->>'unit_id' as unit_before,
       uid_now, before->>'ldap_uid' as uid_before
  from restore_plan
 where skip_reason is null
 order by email;

-- ------------------------------- 2. what section 3 will NOT touch, and why
-- **Read this list.** Each row is a decision for somebody, not an error:
-- putting one back would discard a correction made after the import.
select email, skip_reason, name_now, role_now, hostel_now, unit_now
  from restore_plan
 where skip_reason is not null
 order by email;

-- -------------------------------------------------------- 3. restore (WRITES)
--
-- One transaction. Usernames are released first, because `lower(ldap_uid)` is
-- unique and two accounts that swapped usernames in the import cannot be
-- restored one at a time - the first write would collide with the second
-- account, which still holds the username.
begin;

update public.profiles p
   set ldap_uid = null
  from restore_plan r
 where p.id = r.id
   and r.skip_reason is null
   and p.ldap_uid is not null
   and p.ldap_uid is distinct from r.before->>'ldap_uid';

update public.profiles p
   set full_name          = r.before->>'full_name',
       role               = (r.before->>'role')::public.user_role,
       hostel_name        = r.before->>'hostel_name',
       department_or_club = r.before->>'department_or_club',
       roll_number        = r.before->>'roll_number',
       ldap_uid           = r.before->>'ldap_uid',
       -- `staff_category` is plain text (migration 15), and `->>` on a JSON
       -- null is already SQL NULL, so only the role enum and the uuid cast.
       staff_category     = r.before->>'staff_category',
       unit_id            = nullif(r.before->>'unit_id', '')::uuid
  from restore_plan r
 where p.id = r.id
   and r.skip_reason is null;

commit;

-- ------------------------------- 4. the accounts the import added (read-only)
-- Anyone with a booking cannot be deleted and is listed here so the office can
-- decide: a booking made on an imported account is real.
with b as (
  select * from public.user_import_batches
   where id = current_setting('gh.restore_batch')::uuid
),
a as (
  select (r->>'id')::uuid as id, r->>'email' as email
    from b, jsonb_array_elements(b.added) as r
)
select a.email,
       p.id is not null as still_exists,
       (select count(*) from public.bookings k where k.user_id = a.id) as bookings
  from a
  left join public.profiles p on p.id = a.id
 order by a.email;

-- --------------------------------- 5. delete the added accounts (WRITES)
--
-- Only those with no bookings. Everything else that references a profile
-- (`booking_logs.action_by`, `units.head_id`, `sessions.user_id`, ...) is
-- `on delete set null` or `cascade`; `bookings.user_id` is the one that
-- restricts, which is why it is the condition here.
begin;

with b as (
  select * from public.user_import_batches
   where id = current_setting('gh.restore_batch')::uuid
),
a as (
  select (r->>'id')::uuid as id from b, jsonb_array_elements(b.added) as r
)
delete from public.profiles p
 using a
 where p.id = a.id
   and not exists (select 1 from public.bookings k where k.user_id = p.id);

-- Mark the batch undone, so the console shows it as undone and will not offer
-- Undo again. `user_import_reverted_shape` requires the timestamp.
update public.user_import_batches
   set status              = 'reverted',
       reverted_at         = now(),
       reverted_actor_name = 'SQL repair 2026-10-14'
 where id = current_setting('gh.restore_batch')::uuid;

commit;

-- ------------------------------------------------------------- 6. verify
-- Expect: the batch reads `reverted`, and section 1 returns nothing but the
-- rows section 2 already named.
select id, status, reverted_at, reverted_actor_name
  from public.user_import_batches
 where id = current_setting('gh.restore_batch')::uuid;

-- Checked against the live rows, not against the snapshot above: every row
-- the undo claimed to restore should now hold its `before` values. Any
-- `restored` of false here is a write that did not take, which is the one
-- outcome this script must not report as success.
select r.email,
       coalesce(r.skip_reason, 'restored') as outcome,
       case when r.skip_reason is not null then null else
         (p.full_name          is not distinct from r.before->>'full_name'
      and p.role::text         is not distinct from r.before->>'role'
      and p.hostel_name        is not distinct from r.before->>'hostel_name'
      and p.department_or_club is not distinct from r.before->>'department_or_club'
      and p.roll_number        is not distinct from r.before->>'roll_number'
      and p.ldap_uid           is not distinct from r.before->>'ldap_uid'
      and p.staff_category     is not distinct from r.before->>'staff_category'
      and p.unit_id::text      is not distinct from r.before->>'unit_id')
       end as restored
  from restore_plan r
  left join public.profiles p on p.id = r.id
 order by r.email;

drop table if exists restore_plan;
drop table if exists restore_base;
