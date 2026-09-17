-- Repair: seat the Guest House Caretaker persona.
--
-- NOT a migration. Run it after 2026-09-17-retire-alumni-persona.sql.
--
-- Why: migration 9 added `gh_caretaker` to the `user_role` enum but, like every
-- migration, did not touch seed rows. A hosted project seeded before that
-- migration therefore has the `/caretaker` route and no account that can reach
-- it — the reception desk console is unreachable until this runs.
--
-- Creates exactly what supabase/seed.sql creates: an auth user (password
-- "password123"), its email identity, and the profile. Adds nothing else — the
-- caretaker holds no hostel, club or roll number, and its console is a read-
-- mostly subset of /manager gated in the app by LIFECYCLE_ROLES.
--
-- Re-running is safe: it returns early once the persona exists.
--
-- Note: migration 9 must already be applied (it adds the `gh_caretaker` value
-- to the `user_role` enum). A value added by `alter type` cannot be used in the
-- same transaction that added it, so do not paste migration 9 and this file in
-- together — run migration 9, then this.

begin;

do $$
declare
  care_id uuid := '11111111-1111-1111-1111-111111111114';
  care_email text := 'gh.reception@iitpkd.ac.in';
begin
  -- Either check answers "already seated": the role is what the app gates on,
  -- the email is what `profiles_email_key` would reject.
  if exists (
    select 1 from public.profiles
     where role = 'gh_caretaker' or email = care_email
  ) then
    raise notice 'Guest House Caretaker already present - nothing to do';
    return;
  end if;

  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) values (
    care_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    care_email, crypt('password123', gen_salt('bf')),
    now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()
  ) on conflict (id) do nothing;

  insert into auth.identities (
    id, user_id, provider_id, identity_data, provider, created_at, updated_at
  ) values (
    gen_random_uuid(), care_id, care_id::text,
    jsonb_build_object('sub', care_id::text, 'email', care_email),
    'email', now(), now()
  ) on conflict do nothing;

  insert into public.profiles (id, email, full_name, role, hostel_name, department_or_club, roll_number)
  values (care_id, care_email, 'Guest House Caretaker', 'gh_caretaker', null, null, null)
  on conflict (id) do nothing;

  raise notice 'Guest House Caretaker seated as %', care_email;
end $$;

commit;

-- Verify — expect 13 rows, one of them gh_caretaker:
--   select email, full_name, role from public.profiles order by role;
