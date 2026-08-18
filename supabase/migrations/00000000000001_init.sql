-- IIT Palakkad Guest House Booking Portal — initial schema
-- Run with: supabase db push   (or supabase db reset to include seed.sql)

-- ---------------------------------------------------------------- enums
create type public.user_role as enum (
  'student', 'employee', 'official', 'club', 'alumni',
  'warden', 'faculty_advisor', 'iar_cell', 'gh_manager', 'developer'
);

create type public.booking_status as enum (
  'PENDING_WARDEN', 'PENDING_FA', 'PENDING_IAR', 'PENDING_GH_MANAGER',
  'APPROVED', 'REJECTED', 'CANCELLED'
);

create type public.room_type as enum ('single', 'double_sharing');
create type public.guest_gender as enum ('male', 'female', 'other');

-- ---------------------------------------------------------------- tables
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  full_name text not null,
  role public.user_role not null,
  hostel_name text,
  department_or_club text,
  roll_number text
);

-- Guest houses are managed from the developer console, so the name is free-form.
create table public.guest_houses (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  total_rooms integer not null default 0
);

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  guest_house_id uuid not null references public.guest_houses (id) on delete cascade,
  room_number text not null,
  room_type public.room_type not null,
  is_active boolean not null default true,
  unique (guest_house_id, room_number)
);

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  booking_reference_id text not null unique,
  user_id uuid not null references public.profiles (id),
  guest_house_id uuid not null references public.guest_houses (id),
  user_role public.user_role not null,
  status public.booking_status not null,
  purpose_of_visit text not null,
  check_in timestamptz not null,
  check_out timestamptz not null,
  rooms_requested integer not null check (rooms_requested between 1 and 10),
  assigned_room_ids uuid[] not null default '{}',
  rejection_reason text,
  alumni_id_url text,
  custom_fields jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (check_out > check_in)
);

create table public.booking_guests (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete cascade,
  name text not null,
  age integer check (age between 1 and 120),
  gender public.guest_gender not null,
  relationship text,
  id_number text,
  id_document_url text
);

create table public.booking_logs (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete cascade,
  -- action_by_name is denormalized so the audit trail survives account deletion
  action_by uuid references public.profiles (id) on delete set null,
  action_by_name text not null,
  previous_status public.booking_status,
  new_status public.booking_status not null,
  remarks text,
  timestamp timestamptz not null default now()
);

-- Per-role booking form configuration, edited from the developer console.
create table public.form_configs (
  role public.user_role primary key,
  config jsonb not null,
  updated_at timestamptz not null default now()
);

create index bookings_status_idx on public.bookings (status);
create index bookings_guest_house_idx on public.bookings (guest_house_id);
create index bookings_user_idx on public.bookings (user_id);
create index booking_guests_booking_idx on public.booking_guests (booking_id);
create index booking_logs_booking_idx on public.booking_logs (booking_id);

-- ---------------------------------------------------------------- updated_at
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger bookings_updated_at
  before update on public.bookings
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------- RLS
alter table public.profiles enable row level security;
alter table public.guest_houses enable row level security;
alter table public.rooms enable row level security;
alter table public.bookings enable row level security;
alter table public.booking_guests enable row level security;
alter table public.booking_logs enable row level security;
alter table public.form_configs enable row level security;

-- Helper: the caller's application role.
create or replace function public.my_role()
returns public.user_role
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

-- Helper: may the caller see/act on this booking?
create or replace function public.can_access_booking(b public.bookings)
returns boolean
language sql stable security definer set search_path = public as $$
  select
    b.user_id = auth.uid()
    or public.my_role() in ('iar_cell', 'gh_manager', 'developer')
    or (public.my_role() = 'warden' and exists (
      select 1 from public.profiles r, public.profiles me
      where r.id = b.user_id and me.id = auth.uid()
        and r.hostel_name = me.hostel_name))
    or (public.my_role() = 'faculty_advisor' and exists (
      select 1 from public.profiles r, public.profiles me
      where r.id = b.user_id and me.id = auth.uid()
        and r.department_or_club = me.department_or_club))
$$;

create policy "profiles are readable by authenticated users"
  on public.profiles for select to authenticated using (true);

create policy "guest houses are readable"
  on public.guest_houses for select to authenticated using (true);

create policy "rooms are readable"
  on public.rooms for select to authenticated using (true);

create policy "requesters create their own bookings"
  on public.bookings for insert to authenticated
  with check (user_id = auth.uid());

create policy "bookings visible to requester and responsible reviewers"
  on public.bookings for select to authenticated
  using (public.can_access_booking(bookings));

create policy "reviewers and requester update bookings"
  on public.bookings for update to authenticated
  using (public.can_access_booking(bookings));

create policy "guests follow their booking"
  on public.booking_guests for select to authenticated
  using (exists (select 1 from public.bookings b
                 where b.id = booking_id and public.can_access_booking(b)));

create policy "guests insert with own booking"
  on public.booking_guests for insert to authenticated
  with check (exists (select 1 from public.bookings b
                      where b.id = booking_id and b.user_id = auth.uid()));

create policy "logs follow their booking"
  on public.booking_logs for select to authenticated
  using (exists (select 1 from public.bookings b
                 where b.id = booking_id and public.can_access_booking(b)));

create policy "logs insert by involved users"
  on public.booking_logs for insert to authenticated
  with check (action_by = auth.uid());

create policy "form configs are readable"
  on public.form_configs for select to authenticated using (true);

-- Developer (superadmin) has full control over everything.
create policy "developer manages profiles"
  on public.profiles for all to authenticated
  using (public.my_role() = 'developer') with check (public.my_role() = 'developer');

create policy "developer manages guest houses"
  on public.guest_houses for all to authenticated
  using (public.my_role() = 'developer') with check (public.my_role() = 'developer');

create policy "developer manages rooms"
  on public.rooms for all to authenticated
  using (public.my_role() = 'developer') with check (public.my_role() = 'developer');

create policy "developer manages bookings"
  on public.bookings for all to authenticated
  using (public.my_role() = 'developer') with check (public.my_role() = 'developer');

create policy "developer manages booking guests"
  on public.booking_guests for all to authenticated
  using (public.my_role() = 'developer') with check (public.my_role() = 'developer');

create policy "developer manages form configs"
  on public.form_configs for all to authenticated
  using (public.my_role() = 'developer') with check (public.my_role() = 'developer');

-- ---------------------------------------------------------------- storage
insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

create policy "authenticated users upload documents"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'documents');

create policy "authenticated users read documents"
  on storage.objects for select to authenticated
  using (bucket_id = 'documents');
