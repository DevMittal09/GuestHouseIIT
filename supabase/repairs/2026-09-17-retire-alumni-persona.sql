-- Repair: retire the demo `alumni` persona, seat the IAR Student Cell.
--
-- NOT a migration. Read this before running it; it deletes a profile row.
--
-- Why: hosted projects seeded before migration 9 still carry the demo alumni
-- account (Vikram Iyer). Alumni have no institute login — the IAR Office and
-- the IAR Student Cell raise those bookings for them — so that account should
-- not be on the persona picker at all. Worse, it hung: `alumni` is not in
-- `REQUESTER_ROLES`, so `/dashboard` redirected it to `homeForRole('alumni')`,
-- which was `/dashboard`. Signing in as it looped until the browser gave up.
-- `lib/routes.ts` now floors non-requester roles at `/availability`, but the
-- account still does not belong here.
--
-- Re-running is safe: every statement is conditional.
--
-- Note: migration 9 must already be applied (it adds the `iar_student_cell`
-- and `gh_caretaker` values to the `user_role` enum).

begin;

-- 1. The seed shipped this persona as "IAR Cell Office" before migration 9.
update public.profiles
   set full_name = 'IAR Office'
 where email = 'iar@iitpkd.ac.in'
   and full_name <> 'IAR Office';

-- 2. Seat the IAR Student Cell if the pre-migration-9 seed never created it.
--    Same shape as supabase/seed.sql; password is "password123".
do $$
declare
  cell_id uuid := '11111111-1111-1111-1111-111111111113';
begin
  if exists (select 1 from public.profiles where role = 'iar_student_cell') then
    return;
  end if;

  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) values (
    cell_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'alumnicell@iitpkd.ac.in', crypt('password123', gen_salt('bf')),
    now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()
  ) on conflict (id) do nothing;

  insert into auth.identities (
    id, user_id, provider_id, identity_data, provider, created_at, updated_at
  ) values (
    gen_random_uuid(), cell_id, cell_id::text,
    jsonb_build_object('sub', cell_id::text, 'email', 'alumnicell@iitpkd.ac.in'),
    'email', now(), now()
  ) on conflict do nothing;

  insert into public.profiles (id, email, full_name, role, hostel_name, department_or_club, roll_number)
  values (cell_id, 'alumnicell@iitpkd.ac.in', 'IAR Student Cell', 'iar_student_cell',
          null, 'International & Alumni Relations', null)
  on conflict (id) do nothing;
end $$;

-- 3. Drop the alumni persona — but only where it never booked anything.
--    A real alumni account with stored bookings is left alone: `alumni` stays
--    in the `Role` union and in `BOOKING_CATEGORY_ROLES` precisely so those
--    bookings keep reading. Re-point such a row at the IAR Student Cell by
--    hand instead, or leave it; the redirect no longer loops either way.
delete from auth.users u
 where u.id in (
   select p.id from public.profiles p
    where p.role = 'alumni'
      and not exists (select 1 from public.bookings b where b.user_id = p.id)
      and not exists (select 1 from public.booking_logs l where l.action_by = p.id)
 );
-- profiles.id is `on delete cascade` from auth.users, so the profile goes too.

commit;

-- Left over afterwards, if anything: alumni profiles that did book.
--   select id, email, full_name from public.profiles where role = 'alumni';
