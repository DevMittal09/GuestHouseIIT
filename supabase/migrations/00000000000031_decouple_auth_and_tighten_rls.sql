-- ============================================================================
-- Migration 31 - Decouple profiles from Supabase Auth, and close the
--                GoTrue / PostgREST door (13 Oct 2026)
-- ============================================================================
--
-- Found reviewing the schema before importing the institute's user list. Not a
-- new bug: a standing one whose consequence had been mis-stated in
-- `.memories/`, and which the import would have multiplied from 18 accounts to
-- a few thousand.
--
-- THE PROBLEM, link by link (each verified in the repository):
--
--   1. `profiles.id` referenced `auth.users (id)`, so **every** profile needed
--      a Supabase Auth user. `lib/store/supabase.ts` therefore called
--      `auth.admin.createUser` for each one - with the hardcoded password
--      `password123` and `email_confirm: true`.
--   2. `supabase/seed.sql` did the same for all 18 demo personas, including
--      `developer@iitpkd.ac.in`. That password is published in this
--      repository (README.md, AGENTS.md).
--   3. The project URL and anon key ship in the browser by design
--      (`app/(portal)/layout.tsx` -> `components/live-updates.tsx`).
--   4. So a GoTrue password grant on any of those addresses returned a valid
--      `authenticated` JWT - without going near the portal.
--   5. And the `authenticated` role had **38 policies** behind it, 21 of them
--      writes, including `developer manages profiles / guest_houses / rooms /
--      bookings / booking_guests / form_configs` - each gated only on
--      `my_role() = 'developer'`, which reads the role from the caller's own
--      profile row. Plus `profiles` readable with `using (true)` (the whole
--      directory), and `select` on the entire private `documents` bucket with
--      no per-user scoping (every uploaded ID document and alumni card).
--
-- The portal's own protections - the console password, TOTP, `requireConsole`,
-- `stepUpProblem`, the session rows of migration 21 - are all on a different
-- door and stopped none of it.
--
-- WHY THE FIX IS TO DECOUPLE RATHER THAN TO ROTATE A PASSWORD:
--
-- The portal does not authenticate with Supabase Auth and never has. Sign-in
-- is the institute's LDAP directory (`lib/ldap/`) or Google, and a session is
-- a row in `sessions` keyed by the SHA-256 of an opaque cookie token
-- (migration 21, `lib/sessions.ts`). `auth.users` existed only to satisfy this
-- foreign key. Removing the key removes the reason to mint credentials at all:
-- no Auth user, no password, no second door. It also halves the work of an
-- import, which was two HTTP round trips per person and is now one insert.
--
-- WHAT THIS MIGRATION DOES
--
--   A. Drops `profiles_id_fkey` and gives `profiles.id` its own default, so a
--      profile is an independent row. **No id changes**, so all 19 foreign
--      keys that point at `profiles.id` are untouched.
--   B. Drops all 38 `authenticated` policies. RLS stays **enabled**, so with
--      no policy the `authenticated` role is denied by default - exactly the
--      pattern migration 28 chose deliberately for `academic_records`, and
--      for the same reason. The server reads and writes with the service-role
--      key, which bypasses RLS.
--   C. Drops the two blanket `documents` bucket policies. Uploads and signed
--      URLs are issued server-side (`lib/store/supabase.ts`), never from the
--      browser.
--   D. Adds the three `profiles` indexes the console and approver lookups
--      want, and two `not valid` check constraints for hygiene.
--
-- WHAT IT DELIBERATELY DOES NOT DO
--
--   * It does not drop `public.my_role()` or `public.can_access_booking()`.
--     They become unused here, but a function is cheap and dropping one that
--     something still references is not. They are the starting point if the
--     app ever moves to real per-user Supabase sessions - at which point
--     per-user policies come back, written against whatever identity mapping
--     that uses, **not** against `auth.uid() = profiles.id`, which stops
--     holding the moment this migration runs.
--   * It does not touch the `auth.users` rows that already exist. They are now
--     orphaned credentials and are dealt with by
--     `supabase/repairs/2026-10-13-retire-seeded-auth-users.sql`, which is a
--     production action and is **not** applied automatically.
--   * It does not drop `profiles.department_or_club`, which is still read by
--     `lib/approval-routes.ts`, `lib/workflow.ts`, `lib/booking-search.ts`,
--     `lib/invoice.ts` and `lib/mail/templates.ts`.
--
-- ROLLBACK
--
-- Policies and constraints: `supabase/repairs/2026-10-13-rollback-migration-31.sql`
-- recreates every policy this file drops, verbatim.
--
-- The foreign key is the one part with a time limit. Re-adding it requires
-- every `profiles` row to still have a matching `auth.users` row, which stops
-- being true as soon as a profile is created after this migration. So:
-- re-addable immediately, not re-addable after the first import. That is the
-- intended direction of travel, and it is why the repair script above exists
-- separately from this one.
--
-- Additive where it can be, idempotent throughout, safe to re-run.
-- ============================================================================

-- ------------------------------------------------------------------ A. profiles
-- The constraint name Postgres gives a column-level `references` in migration
-- 1 is `profiles_id_fkey`. Named explicitly rather than discovered, so this
-- cannot drop something else by accident.
alter table public.profiles
  drop constraint if exists profiles_id_fkey;

-- Without the foreign key the application has to supply an id on every insert
-- unless the column generates one. `createProfile` now inserts without an id.
alter table public.profiles
  alter column id set default gen_random_uuid();

comment on column public.profiles.id is
  'Portal account id. Independent of auth.users since migration 31 - the portal authenticates through LDAP/Google and its own sessions table, so no Supabase Auth user is needed. 19 foreign keys across 11 tables reference this column, so it is never reassigned: an import matched on lower(email) updates the row in place.';

comment on table public.profiles is
  'One row per portal user - the only user table (auth.users is Supabase''s own). Role is an authorisation level, not a category of person, which is why students, faculty, staff and offices share this table rather than having one each (see .memories/02-decisions.md, 13 Oct 2026).';

-- ------------------------------------------------------- B. the authenticated surface
--
-- Every policy below was granted `to authenticated`. Each `drop policy if
-- exists` is a no-op on a database where this has already run.

-- profiles: the whole directory, and a developer's full write access.
drop policy if exists "profiles are readable by authenticated users" on public.profiles;
drop policy if exists "developer manages profiles"                  on public.profiles;

-- guest_houses, rooms
drop policy if exists "guest houses are readable"      on public.guest_houses;
drop policy if exists "developer manages guest houses" on public.guest_houses;
drop policy if exists "rooms are readable"             on public.rooms;
drop policy if exists "developer manages rooms"        on public.rooms;

-- bookings
drop policy if exists "requesters create their own bookings"                on public.bookings;
drop policy if exists "bookings visible to requester and responsible reviewers" on public.bookings;
drop policy if exists "reviewers and requester update bookings"            on public.bookings;
drop policy if exists "developer manages bookings"                         on public.bookings;
drop policy if exists "manager creates bookings for others"                on public.bookings;
drop policy if exists "manager manages bookings"                           on public.bookings;

-- booking_guests
drop policy if exists "guests follow their booking"         on public.booking_guests;
drop policy if exists "guests insert with own booking"      on public.booking_guests;
drop policy if exists "developer manages booking guests"    on public.booking_guests;
drop policy if exists "manager manages booking guests"      on public.booking_guests;

-- booking_rooms (migration 11)
drop policy if exists "rooms follow their booking"                  on public.booking_rooms;
drop policy if exists "rooms insert with own booking"               on public.booking_rooms;
drop policy if exists "manager and developer manage booking rooms"  on public.booking_rooms;
drop policy if exists "developer manages booking rooms"             on public.booking_rooms;

-- booking_logs
drop policy if exists "logs follow their booking"      on public.booking_logs;
drop policy if exists "logs insert by involved users"  on public.booking_logs;

-- form_configs
drop policy if exists "form configs are readable"        on public.form_configs;
drop policy if exists "developer manages form configs"   on public.form_configs;

-- room_holds (migration 3)
drop policy if exists "room holds are readable"          on public.room_holds;
drop policy if exists "room holds follow their booking"  on public.room_holds;
drop policy if exists "developer manages room holds"     on public.room_holds;

-- units, hostels (migrations 15, 16)
drop policy if exists "units are readable"     on public.units;
drop policy if exists "console manages units"  on public.units;
drop policy if exists "hostels are readable"   on public.hostels;

-- mail_templates (migration 13)
drop policy if exists "console reads mail templates"    on public.mail_templates;
drop policy if exists "console manages mail templates"  on public.mail_templates;

-- tariffs, invoices (migration 19), room_blocks (20), projects (18)
drop policy if exists "tariffs are readable"    on public.tariffs;
drop policy if exists "invoices are readable by the desk and the requester" on public.invoices;
drop policy if exists "room blocks are readable" on public.room_blocks;
drop policy if exists "projects are readable"   on public.projects;

-- ------------------------------------------------------- C. the documents bucket
--
-- `using (bucket_id = 'documents')` with no owner check meant any
-- `authenticated` JWT could list and download every guest's ID document and
-- every alumni card. The bucket is private and the server issues signed URLs
-- (`createSignedUrl`), so the browser never needs a policy of its own.
drop policy if exists "authenticated users upload documents" on storage.objects;
drop policy if exists "authenticated users read documents"   on storage.objects;

-- Belt and braces: the bucket must not be public either.
update storage.buckets set public = false where id = 'documents';

-- --------------------------------------------------------- D. indexes and checks
--
-- `profiles` carried only its primary key, the unique email and the unique
-- `lower(ldap_uid)`. These three are what the console and the approver
-- lookups actually filter on, and they matter once the table holds the
-- institute rather than 18 personas.
create index if not exists profiles_role_idx   on public.profiles (role);
create index if not exists profiles_unit_idx   on public.profiles (unit_id) where unit_id is not null;
create index if not exists profiles_hostel_idx on public.profiles (hostel_name) where hostel_name is not null;

-- Case-insensitive email lookup. The import matches on `lower(email)`, and
-- `profiles_email_key` (plain, case-sensitive) cannot serve that.
--
-- Deliberately **not** unique: making it unique would fail on any existing
-- pair of addresses differing only in case, and this migration must not
-- refuse to apply. The uniqueness that matters is enforced in
-- `planUserImport` and both stores, which compare lowercased.
create index if not exists profiles_email_lower_idx on public.profiles (lower(email));

-- Hygiene, `not valid` so existing rows are left alone and only new writes
-- are checked. Neither can be satisfied retroactively by this file without
-- editing data, which a migration tightening constraints should not do.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_email_shape'
  ) then
    alter table public.profiles
      add constraint profiles_email_shape
      check (email = btrim(email) and email like '_%@_%._%') not valid;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'profiles_full_name_present'
  ) then
    alter table public.profiles
      add constraint profiles_full_name_present
      check (length(btrim(full_name)) >= 2) not valid;
  end if;
end $$;

comment on constraint profiles_email_shape on public.profiles is
  'Added not valid by migration 31: new and updated rows are checked, pre-existing rows are not. Run `alter table public.profiles validate constraint profiles_email_shape` once the stored addresses are known to be clean.';
