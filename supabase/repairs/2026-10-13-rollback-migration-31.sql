-- ============================================================================
-- Repair, 13 Oct 2026 - roll back migration 31's RLS changes
-- ============================================================================
--
-- NOT A MIGRATION. This recreates every row-level-security policy that
-- migration 31 dropped, verbatim from the migration that first created each
-- one. Generated from the migration files themselves rather than retyped, so
-- what comes back is exactly what was there.
--
-- WHEN YOU WOULD RUN THIS
--
-- Only if dropping the `authenticated` policies turns out to have broken
-- something that legitimately connects as `authenticated`. At the time of
-- writing nothing does: the portal reads and writes with the service-role key,
-- sign-in is LDAP plus the `sessions` table (migration 21), and the one
-- client-side Supabase user - `components/live-updates.tsx`, for Realtime -
-- connects with `persistSession: false`, i.e. as `anon`, for which no policy
-- has ever existed.
--
-- WHAT THIS DOES NOT UNDO
--
--   * **The foreign key.** `profiles.id -> auth.users (id)` is not recreated
--     here. It can only come back while every profile still has a matching
--     `auth.users` row, which stops being true as soon as one profile is
--     created after migration 31. If you genuinely need it back and that
--     still holds:
--       alter table public.profiles
--         add constraint profiles_id_fkey
--         foreign key (id) references auth.users (id) on delete cascade;
--     It will fail, correctly, if any profile has no Auth user.
--   * **The indexes and check constraints** migration 31 added. They are
--     additive and harmless; drop them by name if you must
--     (`profiles_role_idx`, `profiles_unit_idx`, `profiles_hostel_idx`,
--     `profiles_email_lower_idx`, `profiles_email_shape`,
--     `profiles_full_name_present`).
--   * **The deleted Auth users.** Nothing here recreates them, and
--     `2026-10-13-retire-seeded-auth-users.sql` is deliberately one-way.
--
-- Each statement is preceded by `drop policy if exists`, so this is safe to
-- re-run.
-- ============================================================================

\set ON_ERROR_STOP on

-- ---------------------------------------------------------------------------
-- From 00000000000001_initial_schema.sql
-- ---------------------------------------------------------------------------

drop policy if exists "profiles are readable by authenticated users" on public.profiles;
create policy "profiles are readable by authenticated users"
    on public.profiles for select to authenticated using (true);

drop policy if exists "developer manages profiles" on public.profiles;
create policy "developer manages profiles"
    on public.profiles for all to authenticated
    using (public.my_role() = 'developer') with check (public.my_role() = 'developer');

drop policy if exists "guest houses are readable" on public.guest_houses;
create policy "guest houses are readable"
    on public.guest_houses for select to authenticated using (true);

drop policy if exists "developer manages guest houses" on public.guest_houses;
create policy "developer manages guest houses"
    on public.guest_houses for all to authenticated
    using (public.my_role() = 'developer') with check (public.my_role() = 'developer');

drop policy if exists "rooms are readable" on public.rooms;
create policy "rooms are readable"
    on public.rooms for select to authenticated using (true);

drop policy if exists "developer manages rooms" on public.rooms;
create policy "developer manages rooms"
    on public.rooms for all to authenticated
    using (public.my_role() = 'developer') with check (public.my_role() = 'developer');

drop policy if exists "requesters create their own bookings" on public.bookings;
create policy "requesters create their own bookings"
    on public.bookings for insert to authenticated
    with check (user_id = auth.uid());

drop policy if exists "bookings visible to requester and responsible reviewers" on public.bookings;
create policy "bookings visible to requester and responsible reviewers"
    on public.bookings for select to authenticated
    using (public.can_access_booking(bookings));

drop policy if exists "reviewers and requester update bookings" on public.bookings;
create policy "reviewers and requester update bookings"
    on public.bookings for update to authenticated
    using (public.can_access_booking(bookings));

drop policy if exists "developer manages bookings" on public.bookings;
create policy "developer manages bookings"
    on public.bookings for all to authenticated
    using (public.my_role() = 'developer') with check (public.my_role() = 'developer');

drop policy if exists "guests follow their booking" on public.booking_guests;
create policy "guests follow their booking"
    on public.booking_guests for select to authenticated
    using (exists (select 1 from public.bookings b
                  where b.id = booking_id and public.can_access_booking(b)));

drop policy if exists "guests insert with own booking" on public.booking_guests;
create policy "guests insert with own booking"
    on public.booking_guests for insert to authenticated
    with check (exists (select 1 from public.bookings b
                        where b.id = booking_id and b.user_id = auth.uid()));

drop policy if exists "developer manages booking guests" on public.booking_guests;
create policy "developer manages booking guests"
    on public.booking_guests for all to authenticated
    using (public.my_role() = 'developer') with check (public.my_role() = 'developer');

drop policy if exists "logs follow their booking" on public.booking_logs;
create policy "logs follow their booking"
    on public.booking_logs for select to authenticated
    using (exists (select 1 from public.bookings b
                  where b.id = booking_id and public.can_access_booking(b)));

drop policy if exists "logs insert by involved users" on public.booking_logs;
create policy "logs insert by involved users"
    on public.booking_logs for insert to authenticated
    with check (action_by = auth.uid());

drop policy if exists "form configs are readable" on public.form_configs;
create policy "form configs are readable"
    on public.form_configs for select to authenticated using (true);

drop policy if exists "developer manages form configs" on public.form_configs;
create policy "developer manages form configs"
    on public.form_configs for all to authenticated
    using (public.my_role() = 'developer') with check (public.my_role() = 'developer');

drop policy if exists "authenticated users upload documents" on storage.objects;
create policy "authenticated users upload documents"
    on storage.objects for insert to authenticated
    with check (bucket_id = 'documents');

drop policy if exists "authenticated users read documents" on storage.objects;
create policy "authenticated users read documents"
    on storage.objects for select to authenticated
    using (bucket_id = 'documents');

-- ---------------------------------------------------------------------------
-- From 00000000000003_room_holds_and_infants.sql
-- ---------------------------------------------------------------------------

drop policy if exists "room holds are readable" on public.room_holds;
create policy "room holds are readable"
  on public.room_holds for select to authenticated using (true);

drop policy if exists "room holds follow their booking" on public.room_holds;
create policy "room holds follow their booking"
  on public.room_holds for all to authenticated
  using (exists (select 1 from public.bookings b
                 where b.id = booking_id and public.can_access_booking(b)))
  with check (exists (select 1 from public.bookings b
                      where b.id = booking_id and public.can_access_booking(b)));

drop policy if exists "developer manages room holds" on public.room_holds;
create policy "developer manages room holds"
  on public.room_holds for all to authenticated
  using (public.my_role() = 'developer') with check (public.my_role() = 'developer');

-- ---------------------------------------------------------------------------
-- From 00000000000011_rooms_guests_and_services.sql
-- ---------------------------------------------------------------------------

drop policy if exists "manager creates bookings for others" on public.bookings;
create policy "manager creates bookings for others"
  on public.bookings for insert to authenticated
  with check (public.my_role() = 'gh_manager' and created_by = auth.uid());

drop policy if exists "manager manages bookings" on public.bookings;
create policy "manager manages bookings"
  on public.bookings for all to authenticated
  using (public.my_role() = 'gh_manager')
  with check (public.my_role() = 'gh_manager');

drop policy if exists "manager manages booking guests" on public.booking_guests;
create policy "manager manages booking guests"
  on public.booking_guests for all to authenticated
  using (public.my_role() = 'gh_manager')
  with check (public.my_role() = 'gh_manager');

drop policy if exists "rooms follow their booking" on public.booking_rooms;
create policy "rooms follow their booking"
  on public.booking_rooms for select to authenticated
  using (exists (select 1 from public.bookings b
                 where b.id = booking_id and public.can_access_booking(b)));

drop policy if exists "rooms insert with own booking" on public.booking_rooms;
create policy "rooms insert with own booking"
  on public.booking_rooms for insert to authenticated
  with check (exists (select 1 from public.bookings b
                      where b.id = booking_id and b.user_id = auth.uid()));

drop policy if exists "manager and developer manage booking rooms" on public.booking_rooms;
create policy "manager and developer manage booking rooms"
  on public.booking_rooms for all to authenticated
  using (public.my_role() in ('gh_manager', 'developer'))
  with check (public.my_role() in ('gh_manager', 'developer'));

drop policy if exists "developer manages booking rooms" on public.booking_rooms;
create policy "developer manages booking rooms"
  on public.booking_rooms for all to authenticated
  using (public.my_role() = 'developer') with check (public.my_role() = 'developer');

-- ---------------------------------------------------------------------------
-- From 00000000000013_mail_templates.sql
-- ---------------------------------------------------------------------------

drop policy if exists "console reads mail templates" on public.mail_templates;
create policy "console reads mail templates"
  on public.mail_templates for select to authenticated
  using (public.my_role() in ('gh_manager', 'developer'));

drop policy if exists "console manages mail templates" on public.mail_templates;
create policy "console manages mail templates"
  on public.mail_templates for all to authenticated
  using (public.my_role() in ('gh_manager', 'developer'))
  with check (public.my_role() in ('gh_manager', 'developer'));

-- ---------------------------------------------------------------------------
-- From 00000000000015_units_and_debit_heads.sql
-- ---------------------------------------------------------------------------

drop policy if exists "units are readable" on public.units;
create policy "units are readable"
  on public.units for select to authenticated using (true);

drop policy if exists "console manages units" on public.units;
create policy "console manages units"
  on public.units for all to authenticated
  using (public.my_role() in ('gh_manager', 'developer'))
  with check (public.my_role() in ('gh_manager', 'developer'));

-- ---------------------------------------------------------------------------
-- From 00000000000016_settings_and_audit.sql
-- ---------------------------------------------------------------------------

drop policy if exists "hostels are readable" on public.hostels;
create policy "hostels are readable"
  on public.hostels for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- From 00000000000018_hod_approval_and_projects.sql
-- ---------------------------------------------------------------------------

drop policy if exists "projects are readable" on public.projects;
create policy "projects are readable"
  on public.projects for select to authenticated using (active);

-- ---------------------------------------------------------------------------
-- From 00000000000019_tariffs_and_invoices.sql
-- ---------------------------------------------------------------------------

drop policy if exists "tariffs are readable" on public.tariffs;
create policy "tariffs are readable"
  on public.tariffs for select to authenticated using (true);

drop policy if exists "invoices are readable by the desk and the requester" on public.invoices;
create policy "invoices are readable by the desk and the requester"
  on public.invoices for select to authenticated using (
    public.my_role() in ('gh_manager', 'gh_caretaker', 'developer')
    or (status <> 'draft' and exists (
      select 1 from public.bookings b where b.id = booking_id and b.user_id = auth.uid()))
  );

-- ---------------------------------------------------------------------------
-- From 00000000000020_operational_states.sql
-- ---------------------------------------------------------------------------

drop policy if exists "room blocks are readable" on public.room_blocks;
create policy "room blocks are readable"
  on public.room_blocks for select to authenticated using (true);
-- ---------------------------------------------------------------------------
-- Prove it
-- ---------------------------------------------------------------------------
\echo ''
\echo 'authenticated policies restored (expect 38):'
select count(*) from pg_policies
where 'authenticated' = any(roles) and schemaname in ('public', 'storage');
