-- Seed data for local Supabase development (supabase db reset applies this).
-- Creates confirmed auth users (password: "password123") plus their profiles,
-- their dummy LDAP usernames, the two guest houses and their rooms.
--
-- Signing in to the portal does not use those auth users' passwords: the
-- sign-in page checks LDAP (lib/ldap/) and the mock Google door picks a
-- persona. They exist for `auth.users` foreign keys and a future Supabase Auth.
--
-- There is no alumni persona: alumni have no institute login, so the IAR
-- Office and the IAR Student Cell raise those bookings for them (migration 9).

-- ---------------------------------------------------------------- auth users
create or replace function pg_temp.seed_user(uid uuid, user_email text)
returns void language plpgsql as $$
begin
  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) values (
    uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    user_email, crypt('password123', gen_salt('bf')),
    now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()
  ) on conflict (id) do nothing;

  insert into auth.identities (
    id, user_id, provider_id, identity_data, provider, created_at, updated_at
  ) values (
    gen_random_uuid(), uid, uid::text,
    jsonb_build_object('sub', uid::text, 'email', user_email),
    'email', now(), now()
  ) on conflict do nothing;
end $$;

select pg_temp.seed_user('11111111-1111-1111-1111-111111111101', '112201001@smail.iitpkd.ac.in');
select pg_temp.seed_user('11111111-1111-1111-1111-111111111102', '142202014@smail.iitpkd.ac.in');
select pg_temp.seed_user('11111111-1111-1111-1111-111111111103', 'priya@iitpkd.ac.in');
select pg_temp.seed_user('11111111-1111-1111-1111-111111111104', 'admin@iitpkd.ac.in');
select pg_temp.seed_user('11111111-1111-1111-1111-111111111105', 'petrichor@iitpkd.ac.in');
select pg_temp.seed_user('11111111-1111-1111-1111-111111111107', 'warden.malhar@iitpkd.ac.in');
select pg_temp.seed_user('11111111-1111-1111-1111-111111111108', 'warden.saveri@iitpkd.ac.in');
select pg_temp.seed_user('11111111-1111-1111-1111-111111111109', 'fa.petrichor@iitpkd.ac.in');
select pg_temp.seed_user('11111111-1111-1111-1111-111111111110', 'iar@iitpkd.ac.in');
select pg_temp.seed_user('11111111-1111-1111-1111-111111111111', 'guesthouse@iitpkd.ac.in');
select pg_temp.seed_user('11111111-1111-1111-1111-111111111112', 'developer@iitpkd.ac.in');
select pg_temp.seed_user('11111111-1111-1111-1111-111111111113', 'alumnicell@iitpkd.ac.in');
select pg_temp.seed_user('11111111-1111-1111-1111-111111111114', 'gh.reception@iitpkd.ac.in');
select pg_temp.seed_user('11111111-1111-1111-1111-111111111115', 'hod.cse@iitpkd.ac.in');
select pg_temp.seed_user('11111111-1111-1111-1111-111111111116', '112301045@smail.iitpkd.ac.in');

-- ---------------------------------------------------------------- hostels
-- Migration 16: profiles.hostel_name references hostels(name), so the
-- hostels go in before anyone who lives in one.
insert into public.hostels (name) values ('Malhar'), ('Saveri')
on conflict (name) do nothing;

-- ---------------------------------------------------------------- profiles
insert into public.profiles (id, email, full_name, role, hostel_name, department_or_club, roll_number) values
  ('11111111-1111-1111-1111-111111111101', '112201001@smail.iitpkd.ac.in', 'Anjali Menon', 'student', 'Malhar', null, '112201001'),
  ('11111111-1111-1111-1111-111111111102', '142202014@smail.iitpkd.ac.in', 'Rahul Nair', 'student', 'Saveri', null, '142202014'),
  ('11111111-1111-1111-1111-111111111103', 'priya@iitpkd.ac.in', 'Dr. Priya Sharma', 'employee', null, 'Computer Science & Engineering', null),
  ('11111111-1111-1111-1111-111111111104', 'admin@iitpkd.ac.in', 'Director''s Office', 'official', null, 'Administration', null),
  ('11111111-1111-1111-1111-111111111105', 'petrichor@iitpkd.ac.in', 'Petrichor Fest Council', 'club', null, 'Petrichor', null),
  ('11111111-1111-1111-1111-111111111107', 'warden.malhar@iitpkd.ac.in', 'Dr. Suresh Kumar (Warden, Malhar)', 'warden', 'Malhar', null, null),
  ('11111111-1111-1111-1111-111111111108', 'warden.saveri@iitpkd.ac.in', 'Dr. Lakshmi Devi (Warden, Saveri)', 'warden', 'Saveri', null, null),
  ('11111111-1111-1111-1111-111111111109', 'fa.petrichor@iitpkd.ac.in', 'Dr. Arun Prasad (FA, Petrichor)', 'faculty_advisor', null, 'Petrichor', null),
  ('11111111-1111-1111-1111-111111111110', 'iar@iitpkd.ac.in', 'IAR Office', 'iar_cell', null, 'International & Alumni Relations', null),
  ('11111111-1111-1111-1111-111111111111', 'guesthouse@iitpkd.ac.in', 'Guest House Manager', 'gh_manager', null, null, null),
  ('11111111-1111-1111-1111-111111111112', 'developer@iitpkd.ac.in', 'Portal Developer', 'developer', null, null, null),
  ('11111111-1111-1111-1111-111111111113', 'alumnicell@iitpkd.ac.in', 'IAR Student Cell', 'iar_student_cell', null, 'International & Alumni Relations', null),
  ('11111111-1111-1111-1111-111111111114', 'gh.reception@iitpkd.ac.in', 'Guest House Caretaker', 'gh_caretaker', null, null, null),
  -- Unit heads (migration 15): approvers by appointment, not by role.
  ('11111111-1111-1111-1111-111111111115', 'hod.cse@iitpkd.ac.in', 'Prof. R. Venkatesh (HOD, CSE)', 'employee', null, 'Computer Science & Engineering', null),
  ('11111111-1111-1111-1111-111111111116', '112301045@smail.iitpkd.ac.in', 'Meera Nair (Cultural Secretary)', 'student', 'Malhar', null, '112301045')
on conflict (id) do nothing;

-- ---------------------------------------------------------------- units
-- Migrations 15 and 16: a department with its HOD, a council whose secretary
-- approves for the club under it, and two officer offices. The same demo
-- units as lib/store/seed.ts.
insert into public.units (id, name, kind, parent_id, head_id, office_class) values
  ('33333333-3333-3333-3333-333333333301', 'Computer Science & Engineering', 'department', null, '11111111-1111-1111-1111-111111111115', null),
  ('33333333-3333-3333-3333-333333333302', 'Cultural Council', 'council', null, '11111111-1111-1111-1111-111111111116', null),
  ('33333333-3333-3333-3333-333333333303', 'Petrichor', 'club', '33333333-3333-3333-3333-333333333302', null, null),
  ('33333333-3333-3333-3333-333333333304', 'Director''s Office', 'office', null, null, 'officer'),
  ('33333333-3333-3333-3333-333333333305', 'International & Alumni Relations', 'office', null, null, 'officer')
on conflict (id) do nothing;

update public.profiles p set unit_id = v.unit_id::uuid, staff_category = v.category
from (values
  ('priya@iitpkd.ac.in', '33333333-3333-3333-3333-333333333301', 'faculty'),
  ('hod.cse@iitpkd.ac.in', '33333333-3333-3333-3333-333333333301', 'faculty'),
  ('petrichor@iitpkd.ac.in', '33333333-3333-3333-3333-333333333303', null),
  ('admin@iitpkd.ac.in', '33333333-3333-3333-3333-333333333304', null),
  ('iar@iitpkd.ac.in', '33333333-3333-3333-3333-333333333305', null)
) as v(email, unit_id, category)
where p.email = v.email and p.unit_id is null;

-- LDAP usernames (migration 12) — the dummy directory's uids, whose passwords
-- are in lib/ldap/mock-directory.ts and .memories/11-ldap-accounts.md. An
-- update rather than a column in the insert above so that re-running the seed
-- fills them in on a database seeded before migration 12.
update public.profiles p set ldap_uid = v.uid
from (values
  ('112201001@smail.iitpkd.ac.in', '112201001'),
  ('142202014@smail.iitpkd.ac.in', '142202014'),
  ('priya@iitpkd.ac.in', 'priya'),
  ('admin@iitpkd.ac.in', 'admin'),
  ('petrichor@iitpkd.ac.in', 'petrichor'),
  ('alumnicell@iitpkd.ac.in', 'alumnicell'),
  ('warden.malhar@iitpkd.ac.in', 'warden.malhar'),
  ('warden.saveri@iitpkd.ac.in', 'warden.saveri'),
  ('fa.petrichor@iitpkd.ac.in', 'fa.petrichor'),
  ('iar@iitpkd.ac.in', 'iar'),
  ('guesthouse@iitpkd.ac.in', 'guesthouse'),
  ('gh.reception@iitpkd.ac.in', 'gh.reception'),
  ('developer@iitpkd.ac.in', 'developer'),
  ('hod.cse@iitpkd.ac.in', 'hod.cse'),
  ('112301045@smail.iitpkd.ac.in', '112301045')
) as v(email, uid)
where p.email = v.email and p.ldap_uid is null;

-- ---------------------------------------------------------------- guest houses
-- Meals are served at Hamsanandi only (migration 8); editable in the console.
insert into public.guest_houses (id, name, total_rooms, serves_meals) values
  ('22222222-2222-2222-2222-222222222201', 'Bageshri', 20, false),
  ('22222222-2222-2222-2222-222222222202', 'Hamsanandi', 16, true)
on conflict (name) do nothing;

-- ---------------------------------------------------------------- rooms
-- Bageshri: B-101..B-110 double sharing, B-201..B-210 single
insert into public.rooms (guest_house_id, room_number, room_type)
select '22222222-2222-2222-2222-222222222201', 'B-' || (100 + n), 'double_sharing'::public.room_type
from generate_series(1, 10) n
on conflict do nothing;

insert into public.rooms (guest_house_id, room_number, room_type)
select '22222222-2222-2222-2222-222222222201', 'B-' || (200 + n), 'single'::public.room_type
from generate_series(1, 10) n
on conflict do nothing;

-- Hamsanandi: H-101..H-108 double sharing, H-201..H-208 single
insert into public.rooms (guest_house_id, room_number, room_type)
select '22222222-2222-2222-2222-222222222202', 'H-' || (100 + n), 'double_sharing'::public.room_type
from generate_series(1, 8) n
on conflict do nothing;

insert into public.rooms (guest_house_id, room_number, room_type)
select '22222222-2222-2222-2222-222222222202', 'H-' || (200 + n), 'single'::public.room_type
from generate_series(1, 8) n
on conflict do nothing;
