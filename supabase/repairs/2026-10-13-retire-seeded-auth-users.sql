-- ============================================================================
-- Repair, 13 Oct 2026 - retire the Supabase Auth users and their passwords
-- ============================================================================
--
-- NOT A MIGRATION. Read this whole header before running it. It deletes rows
-- from `auth.users` on the project you point it at.
--
-- WHY
--
-- Until migration 31, `profiles.id` referenced `auth.users (id)`, so every
-- portal account needed a Supabase Auth user. `supabase/seed.sql` created 18
-- of them - including `developer@iitpkd.ac.in` - as **confirmed** email
-- identities with `encrypted_password = crypt('password123', ...)`, and
-- `lib/store/supabase.ts` gave the same password to every account created from
-- the console.
--
-- That password is published in this repository. The project's anon key ships
-- in the browser by design, and until migration 31 the `authenticated` role
-- had 38 policies behind it - 21 of them writes, including `developer manages
-- profiles / bookings / rooms / guest_houses / booking_guests / form_configs`,
-- plus `select` on the whole private `documents` bucket. So anyone could
-- obtain an `authenticated` JWT through GoTrue, without going near the
-- portal's LDAP sign-in, and read or write the database with it.
--
-- Migration 31 removed the policies and the foreign key, which closes the
-- door. **This script removes the keys that were left in it.** Run it after
-- migration 31, not before: before, the foreign key's `on delete cascade`
-- would take every profile with it.
--
-- ORDER MATTERS
--
--   1. Apply migration 31 (drops `profiles_id_fkey`).
--   2. Confirm the key is gone - section 0 below refuses to run otherwise.
--   3. Run this.
--
-- WHAT IT DOES NOT TOUCH
--
-- `public.profiles`. Portal accounts, their ids and every foreign key that
-- points at them are untouched, so bookings, approvals, logs, invoices and
-- sessions are unaffected. Deleting an `auth.users` row has no effect on the
-- portal: nothing signs in with it.
--
-- RECOVERY
--
-- There is nothing to recover - these rows have no portal function once
-- migration 31 has run. If something unexpected does depend on an Auth user,
-- recreate it from the Supabase dashboard with a password nobody publishes.
-- Take a `supabase db dump` first anyway; §"Backup and restore" in
-- .memories/04-production.md has the drill.
--
-- SEPARATELY, AND BY HAND: disable the email/password provider
--
-- Dashboard -> Authentication -> Providers -> Email -> off. This script cannot
-- do it (it is not in the database) and it is the control that stops a *new*
-- password being usable. Whether it is currently on could not be verified from
-- the repository and must be checked.
-- ============================================================================

\set ON_ERROR_STOP on

-- ---------------------------------------------------- 0. refuse to run early
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and contype = 'f'
      and confrelid = 'auth.users'::regclass
  ) then
    raise exception
      'profiles still references auth.users - apply migration 31 first, or deleting these rows would cascade and remove every profile.';
  end if;
end $$;

-- ------------------------------------------------- 1. what is about to go
\echo ''
\echo 'Auth users that will be deleted:'
select u.id, u.email,
       (select count(*) from public.profiles p where p.id = u.id) as has_portal_profile
from auth.users u
order by u.email;

-- ------------------------------------------------- 2. the deletion
--
-- Every Auth user, not only the seeded ones: after migration 31 the portal
-- has no use for any of them, and the console-created accounts carry the same
-- password as the seeded personas. `auth.identities` is removed by its own
-- cascade from `auth.users`; it is named here as well for a project whose
-- version does not cascade it.
delete from auth.identities
where user_id in (select id from auth.users);

delete from auth.users;

-- ------------------------------------------------- 3. prove it
\echo ''
\echo 'After - auth users should be 0, profiles unchanged:'
select (select count(*) from auth.users)       as auth_users,
       (select count(*) from public.profiles)  as profiles,
       (select count(*) from public.bookings)  as bookings;

\echo ''
\echo 'Remaining authenticated RLS policies (should be 0 after migration 31):'
select count(*) from pg_policies
where 'authenticated' = any(roles) and schemaname in ('public', 'storage');
