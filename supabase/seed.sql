-- Seed data for local Supabase development (supabase db reset applies this).
-- Creates confirmed auth users (password: "password123") plus their profiles,
-- the two guest houses and their rooms.

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
select pg_temp.seed_user('11111111-1111-1111-1111-111111111106', 'vikram.iyer@alumni.iitpkd.ac.in');
select pg_temp.seed_user('11111111-1111-1111-1111-111111111107', 'warden.malhar@iitpkd.ac.in');
select pg_temp.seed_user('11111111-1111-1111-1111-111111111108', 'warden.saveri@iitpkd.ac.in');
select pg_temp.seed_user('11111111-1111-1111-1111-111111111109', 'fa.petrichor@iitpkd.ac.in');
select pg_temp.seed_user('11111111-1111-1111-1111-111111111110', 'iar@iitpkd.ac.in');
select pg_temp.seed_user('11111111-1111-1111-1111-111111111111', 'guesthouse@iitpkd.ac.in');
select pg_temp.seed_user('11111111-1111-1111-1111-111111111112', 'developer@iitpkd.ac.in');

-- ---------------------------------------------------------------- profiles
insert into public.profiles (id, email, full_name, role, hostel_name, department_or_club, roll_number) values
  ('11111111-1111-1111-1111-111111111101', '112201001@smail.iitpkd.ac.in', 'Anjali Menon', 'student', 'Malhar', null, '112201001'),
  ('11111111-1111-1111-1111-111111111102', '142202014@smail.iitpkd.ac.in', 'Rahul Nair', 'student', 'Saveri', null, '142202014'),
  ('11111111-1111-1111-1111-111111111103', 'priya@iitpkd.ac.in', 'Dr. Priya Sharma', 'employee', null, 'Computer Science & Engineering', null),
  ('11111111-1111-1111-1111-111111111104', 'admin@iitpkd.ac.in', 'Director''s Office', 'official', null, 'Administration', null),
  ('11111111-1111-1111-1111-111111111105', 'petrichor@iitpkd.ac.in', 'Petrichor Fest Council', 'club', null, 'Petrichor', null),
  ('11111111-1111-1111-1111-111111111106', 'vikram.iyer@alumni.iitpkd.ac.in', 'Vikram Iyer', 'alumni', null, null, '101601023'),
  ('11111111-1111-1111-1111-111111111107', 'warden.malhar@iitpkd.ac.in', 'Dr. Suresh Kumar (Warden, Malhar)', 'warden', 'Malhar', null, null),
  ('11111111-1111-1111-1111-111111111108', 'warden.saveri@iitpkd.ac.in', 'Dr. Lakshmi Devi (Warden, Saveri)', 'warden', 'Saveri', null, null),
  ('11111111-1111-1111-1111-111111111109', 'fa.petrichor@iitpkd.ac.in', 'Dr. Arun Prasad (FA, Petrichor)', 'faculty_advisor', null, 'Petrichor', null),
  ('11111111-1111-1111-1111-111111111110', 'iar@iitpkd.ac.in', 'IAR Cell Office', 'iar_cell', null, 'International & Alumni Relations', null),
  ('11111111-1111-1111-1111-111111111111', 'guesthouse@iitpkd.ac.in', 'Guest House Manager', 'gh_manager', null, null, null),
  ('11111111-1111-1111-1111-111111111112', 'developer@iitpkd.ac.in', 'Portal Developer', 'developer', null, null, null)
on conflict (id) do nothing;

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
