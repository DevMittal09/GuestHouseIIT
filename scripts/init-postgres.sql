-- ==========================================================================
-- IIT Palakkad Guest House Booking Portal — PostgreSQL schema
-- ==========================================================================
--
-- A single script that creates the entire database from scratch on plain
-- PostgreSQL (16+). Consolidated from the 34 Supabase migration files with
-- every Supabase-specific construct removed:
--
--   * No auth.users foreign key on profiles
--   * No RLS policies (the app connects as the database owner)
--   * No GRANT / REVOKE (single-role access)
--   * No storage.buckets / storage.objects (files live on disk)
--   * No my_role() / can_access_booking() (used auth.uid())
--
-- The original migration files in supabase/migrations/ are kept because
-- tests/rls-surface.test.ts reads them to verify the security surface.
--
-- Usage:
--   createdb guesthouse
--   psql guesthouse < scripts/init-postgres.sql
--   psql guesthouse < supabase/seed.sql
--
-- ==========================================================================

-- ============================= EXTENSIONS =================================

create extension if not exists btree_gist;

-- =============================== ENUMS ====================================

-- user_role: migrations 1 + 9
create type public.user_role as enum (
  'student', 'employee', 'official', 'club',
  'warden', 'deputy_warden', 'assistant_warden', 'faculty_advisor', 'iar_cell', 'gh_manager', 'developer',
  'iar_student_cell', 'gh_caretaker'
);

-- booking_status: migrations 1 + 2 + 15 + 29
create type public.booking_status as enum (
  'PENDING_WARDEN_REVIEW',
  'PENDING_FA_REVIEW',
  'PENDING_IAR_REVIEW',
  'PENDING_GH_MANAGER',
  'APPROVED',
  'REJECTED',
  'CANCELLED',
  'CANCELLATION_REQUESTED',
  'CANCELLATION_APPROVED',
  'OCCUPIED',
  'VACATED',
  'PENDING_HOD',
  'MISSED'
);

-- room_type: migration 1
create type public.room_type as enum ('single', 'double_sharing');

-- guest_gender: migration 1
create type public.guest_gender as enum ('male', 'female', 'other');

-- booking_type: migration 9
create type public.booking_type as enum ('official', 'personal', 'alumni');

-- email_status: migration 10
create type public.email_status as enum ('QUEUED', 'SENDING', 'SENT', 'FAILED');

-- citizenship: migration 11
create type public.citizenship as enum ('indian', 'other');

-- service_type: migration 11
create type public.service_type as enum ('room', 'room_meals', 'meals_only');

-- meal_preference: migration 11
create type public.meal_preference as enum ('veg', 'non_veg');

-- ========================= UTILITY FUNCTIONS ==============================

-- set_updated_at: migration 1
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- rule_int: migration 16 — reads an integer from a jsonb settings row
create or replace function public.rule_int(p_key text, p_path text[], p_default integer)
returns integer
language plpgsql
stable
set search_path = public
as $$
declare
  v_val jsonb;
begin
  select s.value into v_val
    from public.app_settings s
   where s.key = p_key;
  if v_val is null or jsonb_typeof(v_val) <> 'object' then
    return p_default;
  end if;
  v_val := v_val #> p_path;
  if v_val is null or jsonb_typeof(v_val) <> 'number' then
    return p_default;
  end if;
  return v_val::int;
end;
$$;

-- ============================== TABLES ====================================
-- Ordered by foreign-key dependencies.

-- ------------------------------ profiles ----------------------------------
-- Migration 1, columns from 11, 12, 15; id default from 31
create table public.profiles (
  id                  uuid primary key default gen_random_uuid(),
  email               text unique not null,
  full_name           text not null,
  role                public.user_role not null,
  -- migration 15
  unit_id             uuid,
  -- email+password login (for testing)
  password_hash       text,
  -- active / relieved / graduated / suspended / retired
  account_status      text not null default 'active'
);

comment on table public.profiles is
  'One row per portal user. Role is an authorisation level, not a category of person.';
comment on column public.profiles.id is
  'Portal account id. Independent of auth — the portal authenticates through LDAP/Google and its own sessions table.';

-- ------------------------------ guest_houses ------------------------------
-- Migration 1, serves_meals from 8
create table public.guest_houses (
  id           uuid primary key default gen_random_uuid(),
  name         text unique not null,
  total_rooms  integer not null default 0,
  -- migration 8
  serves_meals boolean not null default false
);

comment on column public.guest_houses.total_rooms is
  'Number of active rooms. Derived, and maintained by the rooms_recount_total trigger — do not set it by hand.';

-- ------------------------------ rooms -------------------------------------
-- Migration 1
create table public.rooms (
  id             uuid primary key default gen_random_uuid(),
  guest_house_id uuid not null references public.guest_houses (id) on delete cascade,
  room_number    text not null,
  room_type      public.room_type not null,
  is_active      boolean not null default true,
  unique (guest_house_id, room_number)
);

-- ------------------------------ app_settings ------------------------------
-- Migration 5
create table public.app_settings (
  key        text primary key,
  value      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create trigger app_settings_updated_at
  before update on public.app_settings
  for each row execute function public.set_updated_at();

-- ------------------------------ institute_hostels --------------------------
-- Migration 35 (consolidated; replaces legacy hostels table)
create table public.institute_hostels (
  id                uuid primary key default gen_random_uuid(),
  hostel_id         text not null unique,
  hostel_name       text not null unique check (length(btrim(hostel_name)) between 1 and 60 and hostel_name = btrim(hostel_name)),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create trigger institute_hostels_updated_at
  before update on public.institute_hostels
  for each row execute function public.set_updated_at();

-- ------------------------------ units -------------------------------------
-- Migration 15, columns from 16, 18, 25
create table public.units (
  id               uuid primary key default gen_random_uuid(),
  name             text not null unique,
  category         text not null check (category in ('department', 'club', 'council', 'office')),
  parent_department_id uuid references public.units (id) on delete restrict,
  head_id          uuid references public.profiles (id) on delete set null,
  acting_head_id   uuid references public.profiles (id) on delete set null,
  created_at       timestamptz not null default now(),
  -- migration 16
  office_type      text check (office_type is null or office_type in ('officer', 'department')),
  -- migration 18
  hod_approval_from_id uuid references public.units (id) on delete set null,
  -- migration 25
  faculty_advisor_id uuid references public.profiles (id) on delete set null,
  secretary_email    text,
  constraint units_hod_unit_not_self check (hod_approval_from_id is distinct from id),
  constraint units_student_body_fields_check check (
    category in ('club', 'council') or (faculty_advisor_id is null and secretary_email is null)
  ),
  constraint units_secretary_email_check check (
    secretary_email is null or (char_length(secretary_email) <= 254 and secretary_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')
  )
);

-- FK from profiles.unit_id to units
alter table public.profiles
  add constraint profiles_unit_fk
  foreign key (unit_id) references public.units (id)
  on delete restrict;

-- ------------------------------ bookings ----------------------------------
-- Migration 1, with columns from 6,7,8,9,11,15,18,20,21,22,24,27,30
-- Note: assigned_room_ids (mig 1, dropped mig 3) and infants (mig 3, dropped mig 4) are skipped.
create table public.bookings (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references public.profiles (id),
  guest_house_id        uuid not null references public.guest_houses (id),
  user_role             public.user_role not null,
  status                public.booking_status not null,
  purpose_of_visit      text not null,
  check_in              timestamptz not null,
  check_out             timestamptz not null,
  rooms_requested       integer not null check (rooms_requested between 0 and 10),
  booking_reference_id  text not null unique,
  rejection_reason      text,
  alumni_id_url         text,
  custom_fields         jsonb,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  -- migration 6 / 8: meals
  meals                 jsonb not null default '[]'::jsonb
                          check (
                            jsonb_typeof(meals) = 'array'
                            and not jsonb_path_exists(
                              meals,
                              '$[*] ? (@.type() != "object"
                                       || !exists(@.date) || !exists(@.breakfast) || !exists(@.lunch) || !exists(@.dinner)
                                       || @.date.type() != "string"
                                       || !(@.date like_regex "^[0-9]{4}-[0-9]{2}-[0-9]{2}$")
                                       || @.breakfast.type() != "boolean"
                                       || @.lunch.type() != "boolean"
                                       || @.dinner.type() != "boolean")'
                            )
                          ),
  -- migration 7
  has_infant            boolean not null default false,
  -- migration 9
  booking_type          public.booking_type not null default 'personal',
  alumni_name           text,
  alumni_roll_number    text,
  -- migration 11
  service_type          public.service_type not null default 'room',
  meal_preference       public.meal_preference,
  meal_guest_count      integer,
  pets_policy_acknowledged    boolean not null default false,
  pets_policy_acknowledged_at timestamptz,
  has_foreign_national  boolean not null default false,
  created_by            uuid references public.profiles (id) on delete set null,
  on_behalf_of_name     text,
  on_behalf_of_email    text,
  on_behalf_of_phone    text,
  -- migration 15
  debit_head            text,
  debit_details         text,
  debit_document_url    text,
  -- migration 18
  office_approval       text,
  project_id            uuid,
  -- migration 20
  extension_requested_until timestamptz,
  extension_reason          text,
  extension_requested_at    timestamptz,
  no_show_released_at       timestamptz,
  -- migration 21
  privacy_notice_version text,
  privacy_consent_at     timestamptz,
  -- migration 22 (generated column)
  search_text tsvector generated always as (
    setweight(to_tsvector('simple', coalesce(booking_reference_id, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(purpose_of_visit, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(on_behalf_of_name, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(alumni_name, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(alumni_roll_number, '')), 'A')
  ) stored,
  -- migration 24
  copy_to_emails        text[],
  debit_subhead          text,
  -- migration 27
  meal_diet_counts      jsonb,
  -- migration 30
  fund_declaration_at   timestamptz,

  -- constraints
  constraint bookings_alumni_details check (
    booking_type <> 'alumni'
    or (alumni_name is not null and length(btrim(alumni_name)) > 0
        and alumni_roll_number is not null and length(btrim(alumni_roll_number)) > 0)
  ),
  constraint bookings_rooms_for_service check (
    case
      when service_type = 'meals_only' then rooms_requested = 0
      else rooms_requested between 1 and 10
    end
  ),
  constraint bookings_meal_guest_count check (
    case
      when service_type = 'meals_only' then meal_guest_count between 1 and 100
      else meal_guest_count is null
    end
  ),
  constraint bookings_office_approval_check check (
    office_approval is null or office_approval in ('direct', 'hod')
  ),
  constraint bookings_copy_to_emails_check check (
    copy_to_emails is null or cardinality(copy_to_emails) <= 25
  ),
  constraint bookings_debit_subhead_check check (
    debit_subhead is null or debit_head = 'project'
  ),
  constraint bookings_meal_diet_counts_shape check (
    meal_diet_counts is null
    or (
      jsonb_typeof(meal_diet_counts) = 'object'
      and (meal_diet_counts ->> 'veg') ~ '^[0-9]+$'
      and (meal_diet_counts ->> 'non_veg') ~ '^[0-9]+$'
      and (meal_diet_counts - 'veg' - 'non_veg') = '{}'::jsonb
    )
  ),
  check (check_out > check_in)
);

-- FK from bookings.project_id to projects (added after projects table below)

create trigger bookings_updated_at
  before update on public.bookings
  for each row execute function public.set_updated_at();

-- ------------------------------ booking_rooms -----------------------------
-- Migration 11
create table public.booking_rooms (
  id               uuid primary key default gen_random_uuid(),
  booking_id       uuid not null references public.bookings (id) on delete cascade,
  room_index       integer not null check (room_index >= 1),
  room_type        public.room_type,
  assigned_room_id uuid references public.rooms (id) on delete set null,
  is_legacy        boolean not null default false,
  unique (booking_id, room_index)
);

-- Composite unique for the booking_guests FK
create unique index booking_rooms_id_booking_idx
  on public.booking_rooms (id, booking_id);

-- ------------------------------ booking_guests ----------------------------
-- Migration 1, columns from 4, 11; age check from 24
create table public.booking_guests (
  id               uuid primary key default gen_random_uuid(),
  booking_id       uuid not null references public.bookings (id) on delete cascade,
  name             text not null,
  gender           public.guest_gender,
  age              integer check (age is null or age between 0 and 120),
  relationship     text,
  id_number        text,
  id_document_url  text,
  -- migration 4
  is_infant        boolean not null default false,
  -- migration 11
  booking_room_id  uuid,
  citizenship      public.citizenship not null default 'indian',
  nationality      text,
  passport_number  text,
  -- composite FK to booking_rooms
  constraint booking_guests_room_fk
    foreign key (booking_room_id, booking_id)
    references public.booking_rooms (id, booking_id)
    on delete cascade,
  constraint booking_guests_citizenship check (
    case citizenship
      when 'other' then
        nationality is not null and length(btrim(nationality)) > 0
        and passport_number is not null and length(btrim(passport_number)) > 0
      else nationality is null and passport_number is null
    end
  )
);

-- ------------------------------ booking_logs ------------------------------
-- Migration 1
create table public.booking_logs (
  id              uuid primary key default gen_random_uuid(),
  booking_id      uuid not null references public.bookings (id) on delete cascade,
  action_by       uuid references public.profiles (id) on delete set null,
  action_by_name  text not null,
  previous_status public.booking_status,
  new_status      public.booking_status not null,
  remarks         text,
  timestamp       timestamptz not null default now()
);

-- ------------------------------ form_configs ------------------------------
-- Migration 1
create table public.form_configs (
  role       public.user_role primary key,
  config     jsonb not null,
  updated_at timestamptz not null default now()
);

-- ------------------------------ room_holds --------------------------------
-- Migration 3, columns from 14; constraint from 17
create table public.room_holds (
  id          uuid primary key default gen_random_uuid(),
  booking_id  uuid not null references public.bookings (id) on delete cascade,
  room_id     uuid not null references public.rooms (id) on delete cascade,
  during      tstzrange not null,
  created_at  timestamptz not null default now(),
  -- migration 14
  override_by uuid references public.profiles (id) on delete set null,
  guard       tstzrange not null,
  -- migration 17: exclusion on guard, DEFERRABLE
  constraint room_holds_no_overlap_guard
    exclude using gist (room_id with =, guard with &&)
    deferrable initially immediate
);

-- ------------------------------ email_outbox ------------------------------
-- Migration 10, attachments from 19
create table public.email_outbox (
  id              uuid primary key default gen_random_uuid(),
  booking_id      uuid references public.bookings (id) on delete set null,
  event_key       text not null,
  idempotency_key text not null unique,
  to_emails       text[] not null,
  cc_emails       text[] not null default '{}',
  subject         text not null,
  body_html       text not null,
  body_text       text not null,
  thread_root     text,
  is_thread_root  boolean not null default false,
  status          public.email_status not null default 'QUEUED',
  attempts        int not null default 0,
  last_error      text,
  scheduled_for   timestamptz not null default now(),
  sent_at         timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  attachments     jsonb not null default '[]'::jsonb
);

create trigger email_outbox_updated_at
  before update on public.email_outbox
  for each row execute function public.set_updated_at();

-- ------------------------------ mail_templates ----------------------------
-- Migration 13
create table public.mail_templates (
  event_key  text primary key,
  enabled    boolean not null default true,
  subject    text,
  intro      text,
  outro      text,
  cc_emails  text[] not null default '{}',
  updated_at timestamptz not null default now()
);

create trigger mail_templates_updated_at
  before update on public.mail_templates
  for each row execute function public.set_updated_at();

-- ------------------------------ projects ----------------------------------
-- Migration 18
create table public.projects (
  id             uuid primary key default gen_random_uuid(),
  project_number text not null check (project_number ~ '^[A-Za-z0-9][A-Za-z0-9/._-]{1,39}$'),
  title          text not null,
  pi_name        text,
  active         boolean not null default true,
  created_by     uuid references public.profiles (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create unique index projects_number_key on public.projects (lower(project_number));

create trigger projects_updated_at
  before update on public.projects
  for each row execute function public.set_updated_at();

-- FK from bookings.project_id to projects
alter table public.bookings
  add constraint bookings_project_fk
  foreign key (project_id) references public.projects (id) on delete set null;

-- ------------------------------ tariffs -----------------------------------
-- Migration 19
create table public.tariffs (
  id             uuid primary key default gen_random_uuid(),
  guest_house_id uuid references public.guest_houses (id) on delete cascade,
  item           text not null check (item in ('room', 'extra_bed', 'breakfast', 'lunch', 'dinner')),
  room_type      text check (room_type in ('single', 'double_sharing')),
  booking_type   text check (booking_type in ('official', 'personal', 'alumni')),
  requester_role text check (requester_role in (
                   'student', 'employee', 'official', 'club', 'alumni',
                   'iar_cell', 'iar_student_cell', 'gh_manager')),
  rate           numeric(10, 2) not null check (rate >= 0),
  effective_from date not null,
  note           text,
  created_by     uuid references public.profiles (id) on delete set null,
  created_at     timestamptz not null default now(),
  constraint tariffs_room_type_for_rooms
    check (room_type is null or item in ('room', 'extra_bed'))
);

create unique index tariffs_one_per_scope_and_date on public.tariffs (
  coalesce(guest_house_id, '00000000-0000-0000-0000-000000000000'::uuid),
  item,
  coalesce(room_type, ''),
  coalesce(booking_type, ''),
  coalesce(requester_role, ''),
  effective_from
);

-- ------------------------------ invoice_counters --------------------------
-- Migration 19
create table public.invoice_counters (
  fy       text primary key check (fy ~ '^\d{4}-\d{2}$'),
  last_seq integer not null check (last_seq >= 0)
);

-- ------------------------------ invoices ----------------------------------
-- Migration 19, extra_charges from 26
create table public.invoices (
  id                  uuid primary key default gen_random_uuid(),
  booking_id          uuid not null references public.bookings (id) on delete restrict,
  status              text not null default 'draft'
                        check (status in ('draft', 'issued', 'paid', 'cancelled')),
  invoice_number      text unique,
  fy                  text,
  seq                 integer,
  document            jsonb not null default '{}'::jsonb,
  meal_counts         jsonb,
  debit_head          text,
  project_number      text,
  subtotal_rooms      numeric(12, 2) not null default 0,
  subtotal_dining     numeric(12, 2) not null default 0,
  total               numeric(12, 2) not null default 0,
  gst_percent         numeric(5, 2) not null default 0,
  gst_amount          numeric(12, 2) not null default 0,
  grand_total         numeric(12, 2) not null default 0,
  payment_mode        text check (payment_mode in ('cash', 'upi', 'account_transfer')),
  payment_reference   text,
  paid_at             timestamptz,
  paid_by             uuid references public.profiles (id) on delete set null,
  issued_at           timestamptz,
  issued_by           uuid references public.profiles (id) on delete set null,
  cancelled_at        timestamptz,
  cancelled_by        uuid references public.profiles (id) on delete set null,
  cancel_reason       text,
  replaces_invoice_id uuid references public.invoices (id) on delete restrict,
  created_by          uuid references public.profiles (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  -- migration 26
  extra_charges       jsonb not null default '[]'::jsonb,
  constraint invoices_serial_unique unique (fy, seq),
  constraint invoices_issued_is_numbered
    check (status = 'draft' or (invoice_number is not null and issued_at is not null and fy is not null and seq is not null)),
  constraint invoices_paid_has_payment
    check (status <> 'paid' or (payment_mode is not null and paid_at is not null)),
  constraint invoices_transfer_has_reference
    check (payment_mode is null or payment_mode = 'cash' or length(btrim(coalesce(payment_reference, ''))) > 0),
  constraint invoices_cancel_has_reason
    check (status <> 'cancelled' or (cancelled_at is not null and length(btrim(coalesce(cancel_reason, ''))) > 0)),
  constraint invoices_extra_charges_shape
    check (jsonb_typeof(extra_charges) = 'array' and jsonb_array_length(extra_charges) <= 20)
);

-- ------------------------------ room_blocks -------------------------------
-- Migration 20
create table public.room_blocks (
  id         uuid primary key default gen_random_uuid(),
  room_id    uuid not null references public.rooms (id) on delete cascade,
  during     tstzrange not null check (not isempty(during) and lower(during) is not null and upper(during) is not null),
  reason     text not null check (length(btrim(reason)) between 3 and 300),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint room_blocks_no_overlap exclude using gist (room_id with =, during with &&)
);

-- ------------------------------ sessions ----------------------------------
-- Migration 21
create table public.sessions (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references public.profiles (id) on delete cascade,
  token_hash          text not null unique,
  created_at          timestamptz not null default now(),
  last_seen_at        timestamptz not null default now(),
  idle_expires_at     timestamptz not null,
  absolute_expires_at timestamptz not null,
  revoked_at          timestamptz,
  verified_at         timestamptz,
  rotated_from        uuid references public.sessions (id) on delete set null,
  ip                  text,
  user_agent          text
);

-- ------------------------------ user_mfa ----------------------------------
-- Migration 21
create table public.user_mfa (
  user_id        uuid primary key references public.profiles (id) on delete cascade,
  secret_enc     text not null,
  key_version    integer not null default 1,
  recovery_codes jsonb not null default '[]'::jsonb,
  last_step      bigint,
  confirmed_at   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- ------------------------------ rate_limits --------------------------------
-- Migration 21
create table public.rate_limits (
  key          text primary key,
  window_start timestamptz not null default now(),
  count        integer not null default 0
);

-- ------------------------------ privacy_requests --------------------------
-- Migration 21
create table public.privacy_requests (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  kind         text not null check (kind in ('export', 'deletion')),
  status       text not null default 'open' check (status in ('open', 'done', 'refused')),
  note         text,
  response     text,
  created_at   timestamptz not null default now(),
  handled_at   timestamptz,
  handled_by   uuid references public.profiles (id) on delete set null
);

-- ------------------------------ security_audit ----------------------------
-- Migration 16
create table public.security_audit (
  id         bigint generated always as identity primary key,
  at         timestamptz not null default now(),
  actor_id   uuid references public.profiles (id) on delete set null,
  actor_name text not null,
  actor_role text,
  event      text not null,
  target     text,
  details    jsonb not null default '{}'::jsonb,
  ip         text,
  user_agent text
);

-- ------------------------------ user_import_batches -----------------------
-- Migration 32
create table public.user_import_batches (
  id              uuid primary key default gen_random_uuid(),
  at              timestamptz not null default now(),
  actor_id        uuid references public.profiles (id) on delete set null,
  actor_name      text not null,
  status          text not null default 'applying'
                    check (status in ('applying', 'applied', 'failed', 'reverted')),
  columns_used    text not null default '',
  added           jsonb not null default '[]'::jsonb
                    check (jsonb_typeof(added) = 'array'),
  updated         jsonb not null default '[]'::jsonb
                    check (jsonb_typeof(updated) = 'array'),
  unchanged_count integer not null default 0 check (unchanged_count >= 0),
  error           text,
  applied_at      timestamptz,
  reverted_at         timestamptz,
  reverted_by         uuid references public.profiles (id) on delete set null,
  reverted_actor_name text,
  constraint user_import_reverted_shape
    check ((status = 'reverted') = (reverted_at is not null))
);

-- ------------------------------ official_email_whitelist -------------------
-- Migration 16
create table public.official_email_whitelist (
  email      text primary key check (email = lower(btrim(email)) and email like '_%@_%'),
  created_at timestamptz not null default now()
);

-- ------------------------------ institute_students -------------------------
-- Migration 35
create table public.institute_students (
  id                      uuid primary key default gen_random_uuid(),
  email                   text not null,
  batch_year              text,
  roll_number             text,
  full_name               text,
  programme               text,
  faculty_advisor_guide_name text,
  department              text,
  phone                   text,
  aadhar_number           text,
  father_name             text,
  father_aadhar_number    text,
  father_phone_number     text,
  mother_name             text,
  mother_aadhar_number    text,
  mother_phone_number     text,
  spouse_name             text,
  spouse_aadhar_number    text,
  spouse_phone_number     text,
  guardian_name           text,
  guardian_aadhar_number  text,
  guardian_phone_number   text,
  hostel                  text,
  imported_by             uuid references public.profiles (id) on delete set null,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create unique index institute_students_email_idx
  on public.institute_students (lower(email));

create trigger institute_students_updated_at
  before update on public.institute_students
  for each row execute function public.set_updated_at();

-- FK from institute_students.hostel to institute_hostels
alter table public.institute_students
  add constraint institute_students_hostel_fk
  foreign key (hostel) references public.institute_hostels (hostel_name)
  on update cascade on delete set null;

-- ------------------------------ institute_employees ------------------------
-- Migration 35
create table public.institute_employees (
  id                uuid primary key default gen_random_uuid(),
  email             text not null,
  employee_id       text,
  full_name         text,
  department        text,
  employee_type     text,
  designation       text,
  phone             text,
  office_number     text,
  gender            text,
  imported_by       uuid references public.profiles (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create unique index institute_employees_email_idx
  on public.institute_employees (lower(email));

create trigger institute_employees_updated_at
  before update on public.institute_employees
  for each row execute function public.set_updated_at();

-- ------------------------------ institute_offices --------------------------
-- Migration 35
create table public.institute_offices (
  id                uuid primary key default gen_random_uuid(),
  office_email      text not null,
  office_name       text,
  office_type       text,
  phone             text,
  department_head   text,
  head_name         text,
  head_email        text,
  imported_by       uuid references public.profiles (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create unique index institute_offices_email_idx
  on public.institute_offices (lower(office_email));

create trigger institute_offices_updated_at
  before update on public.institute_offices
  for each row execute function public.set_updated_at();

-- ------------------------------ institute_fcc ------------------------------
-- Migration 35
create table public.institute_fcc (
  id                      uuid primary key default gen_random_uuid(),
  council_email           text not null,
  council_name            text,
  event_or_council        text,
  faculty_advisor_email   text,
  imported_by             uuid references public.profiles (id) on delete set null,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create unique index institute_fcc_email_idx
  on public.institute_fcc (lower(council_email));

create trigger institute_fcc_updated_at
  before update on public.institute_fcc
  for each row execute function public.set_updated_at();

-- ------------------------------ institute_wardens --------------------------
-- Migration 35
create table public.institute_wardens (
  id                uuid primary key default gen_random_uuid(),
  warden_email      text not null,
  full_name         text,
  warden_phone      text,
  warden_role       text,
  hostel_id         text references public.institute_hostels (hostel_id) on update cascade on delete set null,
  imported_by       uuid references public.profiles (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create unique index institute_wardens_email_idx
  on public.institute_wardens (lower(warden_email));

create trigger institute_wardens_updated_at
  before update on public.institute_wardens
  for each row execute function public.set_updated_at();

-- =============================== VIEWS ====================================

-- booking_meals: migration 11 — one row per (booking, date, meal)
create or replace view public.booking_meals
with (security_invoker = true) as
select
  b.id as booking_id,
  b.guest_house_id,
  b.status,
  b.meal_preference,
  (day ->> 'date')::date as meal_date,
  meal.meal_type,
  case
    when b.service_type = 'meals_only' then coalesce(b.meal_guest_count, 0)
    else (select count(*) from public.booking_guests g
          where g.booking_id = b.id and not g.is_infant)
  end as guest_count
from public.bookings b
cross join lateral jsonb_array_elements(b.meals) as day
cross join lateral (values ('breakfast'), ('lunch'), ('dinner')) as meal(meal_type)
where jsonb_typeof(b.meals) = 'array'
  and (day ->> meal.meal_type)::boolean;

-- profiles_v: computed columns from institute tables
-- department_or_club, roll_number, staff_category and hostel_name are no longer
-- stored on profiles; they are resolved at read time from the institute tables.
create or replace view public.profiles_v as
select
  p.id, p.email, p.full_name, p.role,
  p.account_status,
  case
    when p.role = 'student' then s.hostel
    when p.role = 'warden'  then ih.hostel_name
    else null
  end as hostel_name,
  u.name as department_or_club,
  s.roll_number,
  p.unit_id,
  case
    when e.employee_type is null then null
    when lower(e.employee_type) like '%non%teaching%'
      or lower(e.employee_type) like '%non teaching%' then 'staff'
    else 'faculty'
  end as staff_category
from public.profiles p
left join public.institute_students s
  on lower(s.email) = lower(p.email) and p.role = 'student'
left join public.institute_wardens w
  on lower(w.warden_email) = lower(p.email) and p.role = 'warden'
left join public.institute_hostels ih
  on w.hostel_id = ih.hostel_id
left join public.units u
  on u.id = p.unit_id
left join public.institute_employees e
  on lower(e.email) = lower(p.email) and p.role = 'employee';

-- ============================= FUNCTIONS ==================================

-- ---- Room holds: guard computation (migration 17) ----

create or replace function public.room_hold_guard(
  p_during tstzrange,
  p_overridden boolean,
  p_buffer interval
)
returns tstzrange
language plpgsql
immutable
as $$
declare
  grace constant interval := interval '2 hours';
  lo timestamptz := lower(p_during);
  hi timestamptz := upper(p_during);
  mid timestamptz;
begin
  if not p_overridden then
    return tstzrange(lo, hi + p_buffer, '[)');
  end if;
  if (hi - grace) - (lo + grace + p_buffer) > interval '0' then
    return tstzrange(lo + grace + p_buffer, hi - grace, '[)');
  end if;
  mid := lo + (hi - lo) / 2;
  return tstzrange(mid - interval '1 second', mid + interval '1 second', '[)');
end $$;

-- ---- Booking buffer from settings (migration 17) ----

create or replace function public.booking_buffer()
returns interval
language sql
stable
set search_path = public
as $$
  select make_interval(mins => public.rule_int('rules.booking', array['buffer_minutes'], 240))
$$;

-- ---- Room hold guard trigger function (migration 17 FINAL) ----

create or replace function public.set_room_hold_guard()
returns trigger language plpgsql as $$
begin
  new.guard := public.room_hold_guard(new.during, new.override_by is not null, public.booking_buffer());
  return new;
end $$;

-- ---- set_room_holds: transactional room allocation (migration 14) ----

create or replace function public.set_room_holds(
  p_booking_id uuid,
  p_room_ids uuid[],
  p_check_in timestamptz,
  p_check_out timestamptz,
  p_override_room_ids uuid[] default '{}',
  p_override_by uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.room_holds where booking_id = p_booking_id;
  insert into public.room_holds (booking_id, room_id, during, override_by)
  select
    p_booking_id,
    room_id,
    tstzrange(p_check_in, p_check_out, '[)'),
    case when room_id = any (p_override_room_ids) then p_override_by end
  from unnest(p_room_ids) as room_id;
end $$;

-- ---- Buffer clash detection (migration 17) ----

create or replace function public.buffer_clashes(p_buffer interval)
returns table (room text, first_booking text, first_stay text, second_booking text, second_stay text)
language sql
stable
set search_path = public
as $$
  select
    coalesce(r.room_number, a.room_id::text),
    coalesce(ba.booking_reference_id, a.booking_id::text),
    to_char(lower(a.during) at time zone 'Asia/Kolkata', 'DD Mon YYYY HH24:MI') || ' -> ' ||
      to_char(upper(a.during) at time zone 'Asia/Kolkata', 'DD Mon YYYY HH24:MI'),
    coalesce(bb.booking_reference_id, b.booking_id::text),
    to_char(lower(b.during) at time zone 'Asia/Kolkata', 'DD Mon YYYY HH24:MI') || ' -> ' ||
      to_char(upper(b.during) at time zone 'Asia/Kolkata', 'DD Mon YYYY HH24:MI')
  from public.room_holds a
  join public.room_holds b
    on b.room_id = a.room_id
   and b.booking_id <> a.booking_id
   and lower(b.during) >= lower(a.during)
   and (lower(b.during), b.booking_id) > (lower(a.during), a.booking_id)
  left join public.rooms r on r.id = a.room_id
  left join public.bookings ba on ba.id = a.booking_id
  left join public.bookings bb on bb.id = b.booking_id
  where public.room_hold_guard(a.during, a.override_by is not null, p_buffer)
     && public.room_hold_guard(b.during, b.override_by is not null, p_buffer)
  order by 1, 2
$$;

-- ---- Rebuild all room holds (migration 17) ----

create or replace function public.rebuild_room_holds()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  rec record;
  n integer := 0;
begin
  for rec in
    select
      booking_id,
      array_agg(room_id order by room_id) as rooms,
      coalesce(array_agg(room_id order by room_id) filter (where override_by is not null), '{}') as overridden,
      min(override_by::text)::uuid as override_by,
      min(lower(during)) as check_in,
      max(upper(during)) as check_out
    from public.room_holds
    group by booking_id
  loop
    perform public.set_room_holds(
      rec.booking_id, rec.rooms, rec.check_in, rec.check_out, rec.overridden, rec.override_by
    );
    n := n + 1;
  end loop;
  return n;
end $$;

-- ---- Change turnaround buffer (migration 17) ----

create or replace function public.set_booking_buffer(p_minutes integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  buffer interval;
  clash record;
  listing text := '';
  total integer := 0;
begin
  if p_minutes is null or p_minutes < 0 or p_minutes > 1440 then
    raise exception 'The turnaround buffer must be between 0 and 1440 minutes (asked for %)', p_minutes;
  end if;
  buffer := make_interval(mins => p_minutes);

  for clash in select * from public.buffer_clashes(buffer) loop
    total := total + 1;
    if total <= 10 then
      listing := listing || format('%s%s: %s and %s', case when total > 1 then '; ' else '' end,
        clash.room, clash.first_booking, clash.second_booking);
    end if;
  end loop;
  if total > 0 then
    raise exception using
      errcode = 'P0001',
      message = format('BUFFER_CLASH|%s|%s%s', total, listing, case when total > 10 then '; ...' else '' end);
  end if;

  insert into public.app_settings (key, value)
  values ('rules.booking', jsonb_build_object('buffer_minutes', p_minutes))
  on conflict (key) do update
    set value = case
      when jsonb_typeof(public.app_settings.value) = 'object'
        then public.app_settings.value || jsonb_build_object('buffer_minutes', p_minutes)
      else jsonb_build_object('buffer_minutes', p_minutes)
    end,
    updated_at = now();

  set constraints public.room_holds_no_overlap_guard deferred;
  return public.rebuild_room_holds();
end $$;

-- ---- Email outbox claim (migration 10) ----

create or replace function public.claim_queued_emails(p_limit int, p_stale_after interval)
returns setof public.email_outbox
language sql
security definer
set search_path = public
as $$
  with due as (
    select id
    from public.email_outbox
    where scheduled_for <= now()
      and (
        status = 'QUEUED'
        or (status = 'SENDING' and updated_at < now() - p_stale_after)
      )
    order by scheduled_for
    limit p_limit
    for update skip locked
  )
  update public.email_outbox o
  set status = 'SENDING',
      attempts = o.attempts + 1,
      updated_at = now()
  from due
  where o.id = due.id
  returning o.*;
$$;

-- ---- Infant derivation (migration 11) ----

create or replace function public.derive_is_infant()
returns trigger language plpgsql as $$
declare
  legacy boolean;
begin
  select r.is_legacy into legacy
  from public.booking_rooms r
  where r.id = new.booking_room_id;

  if coalesce(legacy, false) then
    return new;
  end if;

  new.is_infant := new.age is not null and new.age < 5;
  return new;
end $$;

-- ---- Room occupancy check — FINAL (migration 23) ----

create or replace function public.check_room_occupancy()
returns trigger language plpgsql as $$
declare
  room_id uuid := coalesce(new.booking_room_id, old.booking_room_id);
  legacy boolean;
  guests integer;
  infants integer;
  max_guests integer := public.rule_int('rules.capacity', array['max_guests_per_room'], 3);
  max_occupants integer := public.rule_int('rules.capacity', array['max_occupants_per_room'], 4);
  combined_saved boolean := exists (
    select 1 from public.app_settings s
     where s.key = 'rules.capacity'
       and jsonb_typeof(s.value) = 'object'
       and s.value ? 'max_occupants_per_room'
  );
  max_infants integer := case
    when combined_saved
      then public.rule_int('rules.capacity', array['max_infants_per_room'], 3)
    else 3
  end;
begin
  if room_id is null then
    return null;
  end if;

  select r.is_legacy into legacy from public.booking_rooms r where r.id = room_id;
  if coalesce(legacy, false) then
    return null;
  end if;

  select
    count(*) filter (where not g.is_infant),
    count(*) filter (where g.is_infant)
  into guests, infants
  from public.booking_guests g
  where g.booking_room_id = room_id;

  if guests > max_guests then
    raise exception 'A room takes at most % guests (this one has %)', max_guests, guests
      using errcode = 'check_violation';
  end if;
  if infants > max_infants then
    raise exception 'A room takes at most % infant(s) (this one has %)', max_infants, infants
      using errcode = 'check_violation';
  end if;
  if guests + infants > max_occupants then
    raise exception
      'A room takes at most % people in total including infants (this one has % guests and % infant(s))',
      max_occupants, guests, infants
      using errcode = 'check_violation';
  end if;
  return null;
end $$;

-- ---- Tariffs guard (migration 19) ----

create or replace function public.tariffs_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.effective_from <= (now() at time zone 'Asia/Kolkata')::date then
    raise exception 'TARIFF_IN_FORCE|This rate is already in force, so stays have been priced with it. Add a new rate from a later date instead.'
      using errcode = 'P0001';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

-- ---- Invoices guard (migration 19) ----

create or replace function public.invoices_guard()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_mutable text[];
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then
      raise exception 'INVOICE_IMMUTABLE|Invoice % has been issued and cannot be deleted — cancel it with a reason instead.', old.invoice_number
        using errcode = 'P0001';
    end if;
    return old;
  end if;

  if old.status = 'draft' then
    return new;
  end if;

  if old.status = 'cancelled' then
    raise exception 'INVOICE_IMMUTABLE|Invoice % is cancelled and cannot change.', old.invoice_number
      using errcode = 'P0001';
  end if;

  if old.status = 'issued' and new.status = 'paid' then
    v_mutable := array['status', 'payment_mode', 'payment_reference', 'paid_at', 'paid_by', 'updated_at'];
  elsif old.status in ('issued', 'paid') and new.status = 'cancelled' then
    v_mutable := array['status', 'cancelled_at', 'cancelled_by', 'cancel_reason', 'updated_at'];
  elsif new.status = old.status then
    v_mutable := array['updated_at'];
  else
    raise exception 'INVOICE_IMMUTABLE|Invoice % cannot go from % to %.', old.invoice_number, old.status, new.status
      using errcode = 'P0001';
  end if;

  if (to_jsonb(new) - v_mutable) is distinct from (to_jsonb(old) - v_mutable) then
    raise exception 'INVOICE_IMMUTABLE|Invoice % has been issued; its contents cannot change. Cancel it and issue a new one.', old.invoice_number
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

-- ---- Issue invoice (migration 19) ----

create or replace function public.issue_invoice(
  p_booking_id uuid,
  p_fy text,
  p_prefix text,
  p_digits integer,
  p_document jsonb,
  p_meal_counts jsonb,
  p_issued_by uuid,
  p_replaces uuid default null
)
returns public.invoices
language plpgsql
security definer
set search_path = public
as $$
declare
  v_live   public.invoices;
  v_seq    integer;
  v_number text;
  v_doc    jsonb;
  v_row    public.invoices;
begin
  select * into v_live from public.invoices
   where booking_id = p_booking_id and status <> 'cancelled'
   for update;
  if found and v_live.status <> 'draft' then
    raise exception 'INVOICE_EXISTS|This booking already has invoice % — cancel it first to issue a corrected one.', v_live.invoice_number
      using errcode = 'P0001';
  end if;

  insert into public.invoice_counters (fy, last_seq) values (p_fy, 1)
  on conflict (fy) do update set last_seq = public.invoice_counters.last_seq + 1
  returning last_seq into v_seq;

  v_number := p_prefix || '/' || p_fy || '/' || lpad(v_seq::text, greatest(p_digits, length(v_seq::text)), '0');
  v_doc := jsonb_set(p_document, '{invoice_number}', to_jsonb(v_number));

  if v_live.id is not null then
    update public.invoices set
      status = 'issued', invoice_number = v_number, fy = p_fy, seq = v_seq,
      document = v_doc, meal_counts = p_meal_counts,
      debit_head = v_doc->>'debit_head', project_number = v_doc->>'project_number',
      subtotal_rooms = (v_doc->>'subtotal_rooms')::numeric / 100,
      subtotal_dining = (v_doc->>'subtotal_dining')::numeric / 100,
      total = (v_doc->>'total')::numeric / 100,
      gst_percent = (v_doc->>'gst_percent')::numeric,
      gst_amount = (v_doc->>'gst')::numeric / 100,
      grand_total = (v_doc->>'grand_total')::numeric / 100,
      issued_at = (v_doc->>'invoice_date')::timestamptz, issued_by = p_issued_by,
      replaces_invoice_id = p_replaces, updated_at = now()
    where id = v_live.id
    returning * into v_row;
  else
    insert into public.invoices (
      booking_id, status, invoice_number, fy, seq, document, meal_counts,
      debit_head, project_number, subtotal_rooms, subtotal_dining, total,
      gst_percent, gst_amount, grand_total, issued_at, issued_by,
      replaces_invoice_id, created_by)
    values (
      p_booking_id, 'issued', v_number, p_fy, v_seq, v_doc, p_meal_counts,
      v_doc->>'debit_head', v_doc->>'project_number',
      (v_doc->>'subtotal_rooms')::numeric / 100, (v_doc->>'subtotal_dining')::numeric / 100,
      (v_doc->>'total')::numeric / 100, (v_doc->>'gst_percent')::numeric,
      (v_doc->>'gst')::numeric / 100, (v_doc->>'grand_total')::numeric / 100,
      (v_doc->>'invoice_date')::timestamptz, p_issued_by, p_replaces, p_issued_by)
    returning * into v_row;
  end if;
  return v_row;
end;
$$;

-- ---- Room blocks / holds mutual exclusion (migration 20) ----

create or replace function public.room_blocks_respect_holds()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_ref text;
  v_room text;
begin
  perform 1 from public.rooms where id = new.room_id for update;
  select b.booking_reference_id into v_ref
    from public.room_holds h join public.bookings b on b.id = h.booking_id
   where h.room_id = new.room_id and h.guard && new.during
   limit 1;
  if v_ref is not null then
    select room_number into v_room from public.rooms where id = new.room_id;
    raise exception 'ROOM_BLOCKED|Room % is held for % during that time — move that stay first, or block a different period.', v_room, v_ref
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create or replace function public.room_holds_respect_blocks()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_reason text;
  v_room text;
begin
  perform 1 from public.rooms where id = new.room_id for update;
  select reason into v_reason
    from public.room_blocks
   where room_id = new.room_id and during && new.guard
   limit 1;
  if v_reason is not null then
    select room_number into v_room from public.rooms where id = new.room_id;
    raise exception 'ROOM_BLOCKED|Room % is out of service for maintenance then (%).', v_room, v_reason
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

-- ---- Sessions / rate-limits purge (migration 21) ----

create or replace function public.purge_expired_sessions()
returns integer
language sql
security definer
set search_path = public
as $$
  with gone as (
    delete from public.sessions
     where absolute_expires_at < now() - interval '1 day'
        or (revoked_at is not null and revoked_at < now() - interval '1 day')
    returning 1
  )
  select count(*)::int from gone;
$$;

create or replace function public.hit_rate_limit(p_key text, p_limit integer, p_window_seconds integer)
returns table (allowed boolean, attempts integer, retry_after integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.rate_limits;
begin
  insert into public.rate_limits (key, window_start, count)
  values (p_key, now(), 1)
  on conflict (key) do update
    set count = case
          when public.rate_limits.window_start < now() - make_interval(secs => p_window_seconds) then 1
          else public.rate_limits.count + 1
        end,
        window_start = case
          when public.rate_limits.window_start < now() - make_interval(secs => p_window_seconds) then now()
          else public.rate_limits.window_start
        end
  returning * into v_row;

  return query select
    v_row.count <= p_limit,
    v_row.count,
    greatest(0, ceil(extract(epoch from (v_row.window_start + make_interval(secs => p_window_seconds) - now())))::int);
end;
$$;

create or replace function public.purge_rate_limits()
returns integer
language sql
security definer
set search_path = public
as $$
  with gone as (
    delete from public.rate_limits where window_start < now() - interval '1 day' returning 1
  )
  select count(*)::int from gone;
$$;

-- ---- Security audit guards (migration 16) ----

create or replace function public.security_audit_guard()
returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' then
    raise exception 'security_audit is append-only' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(current_setting('app.audit_purge', true), '') <> 'on' then
    raise exception 'security_audit rows are removed only by purge_security_audit()'
      using errcode = 'insufficient_privilege';
  end if;
  if old.at > now() - interval '180 days' then
    raise exception 'security_audit rows are kept for at least 180 days'
      using errcode = 'insufficient_privilege';
  end if;
  return old;
end $$;

create or replace function public.security_audit_no_truncate()
returns trigger language plpgsql as $$
begin
  raise exception 'security_audit cannot be truncated' using errcode = 'insufficient_privilege';
end $$;

create or replace function public.purge_security_audit(p_keep_days integer default 365)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  removed integer;
begin
  if p_keep_days < 180 then
    raise exception 'Audit rows must be kept for at least 180 days (asked for %)', p_keep_days;
  end if;
  perform set_config('app.audit_purge', 'on', true);
  delete from public.security_audit where at < now() - make_interval(days => p_keep_days);
  get diagnostics removed = row_count;
  perform set_config('app.audit_purge', 'off', true);
  return removed;
end $$;


-- ---- Guest house room count (migration 33) ----

create or replace function public.recount_guest_house_rooms()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') and old.guest_house_id is not null then
    update public.guest_houses g
       set total_rooms = (
             select count(*)
               from public.rooms r
              where r.guest_house_id = old.guest_house_id
                and r.is_active
           )
     where g.id = old.guest_house_id;
  end if;

  if tg_op in ('INSERT', 'UPDATE') and new.guest_house_id is not null then
    if tg_op = 'INSERT' or new.guest_house_id is distinct from old.guest_house_id
       or new.is_active is distinct from old.is_active then
      update public.guest_houses g
         set total_rooms = (
               select count(*)
                 from public.rooms r
                where r.guest_house_id = new.guest_house_id
                  and r.is_active
             )
       where g.id = new.guest_house_id;
    end if;
  end if;

  return null;
end;
$$;

-- ============================== TRIGGERS ==================================

-- room_holds guard (migration 17 — fires on during, override_by or guard)
create trigger room_holds_guard
  before insert or update of during, override_by, guard on public.room_holds
  for each row execute function public.set_room_hold_guard();

-- booking_guests infant derivation (migration 11)
create trigger booking_guests_derive_infant
  before insert or update of age, booking_room_id on public.booking_guests
  for each row execute function public.derive_is_infant();

-- booking_guests room occupancy (migration 23)
create trigger booking_guests_room_occupancy
  after insert or update on public.booking_guests
  for each row execute function public.check_room_occupancy();

-- tariffs guard (migration 19)
create trigger tariffs_guard
  before update or delete on public.tariffs
  for each row execute function public.tariffs_guard();

-- invoices guard (migration 19)
create trigger invoices_guard
  before update or delete on public.invoices
  for each row execute function public.invoices_guard();

-- room blocks vs holds (migration 20)
create trigger room_blocks_respect_holds
  before insert or update on public.room_blocks
  for each row execute function public.room_blocks_respect_holds();

create trigger room_holds_respect_blocks
  before insert or update on public.room_holds
  for each row execute function public.room_holds_respect_blocks();

-- security audit (migration 16)
create trigger security_audit_append_only
  before update or delete on public.security_audit
  for each row execute function public.security_audit_guard();

create trigger security_audit_no_truncate
  before truncate on public.security_audit
  for each statement execute function public.security_audit_no_truncate();

-- rooms recount total (migration 33)
create trigger rooms_recount_total
  after insert or update or delete on public.rooms
  for each row execute function public.recount_guest_house_rooms();

-- ============================== INDEXES ===================================

-- profiles (migration 31)
create index profiles_role_idx on public.profiles (role);
create index profiles_unit_idx on public.profiles (unit_id) where unit_id is not null;
create index profiles_email_lower_idx on public.profiles (lower(email));

-- bookings (migrations 1, 18, 22)
create index bookings_status_idx on public.bookings (status);
create index bookings_guest_house_idx on public.bookings (guest_house_id);
create index bookings_user_idx on public.bookings (user_id);
create index bookings_search_idx on public.bookings using gin (search_text);
create index bookings_check_in_idx on public.bookings (check_in);
create index bookings_check_out_idx on public.bookings (check_out);
create index bookings_status_created_idx on public.bookings (status, created_at desc);
create index bookings_user_created_idx on public.bookings (user_id, created_at desc);
create index bookings_guest_house_check_in_idx on public.bookings (guest_house_id, check_in);
create index bookings_project_idx on public.bookings (project_id) where project_id is not null;

-- booking_rooms (migration 11)
create index booking_rooms_booking_idx on public.booking_rooms (booking_id);
create index booking_rooms_assigned_idx on public.booking_rooms (assigned_room_id) where assigned_room_id is not null;

-- booking_guests (migrations 1, 4, 11)
create index booking_guests_booking_idx on public.booking_guests (booking_id);
create index booking_guests_infant_idx on public.booking_guests (booking_id) where is_infant = true;
create index booking_guests_room_idx on public.booking_guests (booking_room_id) where booking_room_id is not null;

-- booking_logs (migrations 1, 22)
create index booking_logs_booking_idx on public.booking_logs (booking_id, timestamp);

-- room_holds (migration 3)
create index room_holds_room_idx on public.room_holds (room_id);

-- email_outbox (migrations 10, 22)
create index email_outbox_pending on public.email_outbox (scheduled_for) where status = 'QUEUED';
create index email_outbox_booking on public.email_outbox (booking_id) where booking_id is not null;
create index email_outbox_due_idx on public.email_outbox (status, scheduled_for);

-- invoices (migrations 19, 22)
create unique index invoices_one_live_per_booking on public.invoices (booking_id) where status <> 'cancelled';
create index invoices_issued_at on public.invoices (issued_at) where issued_at is not null;
create index invoices_paid_at on public.invoices (paid_at) where paid_at is not null;
create index invoices_booking_idx on public.invoices (booking_id);

-- room_blocks (migration 20)
create index room_blocks_room_idx on public.room_blocks (room_id);

-- sessions (migrations 21, 34)
create index sessions_user_idx on public.sessions (user_id);
create index sessions_expiry_idx on public.sessions (absolute_expires_at);

-- privacy_requests (migration 21)
create index privacy_requests_open_idx on public.privacy_requests (status, created_at);

-- security_audit (migrations 16, 22)
create index security_audit_at_idx on public.security_audit (at desc);
create index security_audit_event_idx on public.security_audit (event, at desc);
create index security_audit_actor_idx on public.security_audit (actor_id, at desc);

-- units (migration 25)
create index units_faculty_advisor_idx on public.units (faculty_advisor_id) where faculty_advisor_id is not null;

-- user_import_batches (migration 32)
create index user_import_batches_at_idx on public.user_import_batches (at desc);

-- ---- Foreign-key indexes (migration 34) ----
create index booking_logs_action_by_idx on public.booking_logs (action_by) where action_by is not null;
create index bookings_created_by_idx on public.bookings (created_by) where created_by is not null;
create index invoices_created_by_idx on public.invoices (created_by) where created_by is not null;
create index invoices_issued_by_idx on public.invoices (issued_by) where issued_by is not null;
create index invoices_paid_by_idx on public.invoices (paid_by) where paid_by is not null;
create index invoices_cancelled_by_idx on public.invoices (cancelled_by) where cancelled_by is not null;
create index privacy_requests_user_idx on public.privacy_requests (user_id);
create index privacy_requests_handled_by_idx on public.privacy_requests (handled_by) where handled_by is not null;
create index room_blocks_created_by_idx on public.room_blocks (created_by) where created_by is not null;
create index room_holds_override_by_idx on public.room_holds (override_by) where override_by is not null;
create index tariffs_created_by_idx on public.tariffs (created_by) where created_by is not null;
create index units_head_idx on public.units (head_id) where head_id is not null;
create index units_acting_head_idx on public.units (acting_head_id) where acting_head_id is not null;
create index user_import_batches_actor_idx on public.user_import_batches (actor_id) where actor_id is not null;
create index user_import_batches_reverted_by_idx on public.user_import_batches (reverted_by) where reverted_by is not null;
create index units_parent_idx on public.units (parent_department_id) where parent_department_id is not null;
create index units_hod_unit_idx on public.units (hod_approval_from_id) where hod_approval_from_id is not null;
create index tariffs_guest_house_idx on public.tariffs (guest_house_id) where guest_house_id is not null;
create index sessions_rotated_from_idx on public.sessions (rotated_from) where rotated_from is not null;

-- ---- Check constraints added by migration 31 (not valid — for new rows only) ----
alter table public.profiles
  add constraint profiles_email_shape
  check (email = btrim(email) and email like '_%@_%._%') not valid;

alter table public.profiles
  add constraint profiles_full_name_present
  check (length(btrim(full_name)) >= 2) not valid;

-- ========================== SEED DATA =====================================

-- Tariff seed (migration 19): the office's tariff sheet.
-- These run only on an empty tariffs table (fresh install).
insert into public.tariffs (guest_house_id, item, room_type, booking_type, requester_role, rate, effective_from, note)
select s.gh, s.item, null, s.booking_type, s.requester_role, s.rate, date '2024-01-01', s.note
from (
  select (select id from public.guest_houses where name = 'Bageshri') as gh, 'room' as item,
         null::text as booking_type, null::text as requester_role, 1000::numeric as rate,
         'Tariff sheet: Bageshri, per room per day' as note
  union all
  select (select id from public.guest_houses where name = 'Hamsanandi'), 'room', null, null, 2000,
         'Tariff sheet: Hamsanandi types 1 and 2'
  union all
  select (select id from public.guest_houses where name = 'Hamsanandi'), 'room', null, 'official', 4000,
         'Tariff sheet: Hamsanandi type 3, government officers'
  union all select null, 'breakfast', null, null, 80, 'Tariff sheet: per head'
  union all select null, 'lunch', null, null, 120, 'Tariff sheet: per head'
  union all select null, 'dinner', null, null, 100, 'Tariff sheet: per head'
  union all select null, 'breakfast', null, 'student', 0, 'Tariff sheet: meals free to students'
  union all select null, 'lunch', null, 'student', 0, 'Tariff sheet: meals free to students'
  union all select null, 'dinner', null, 'student', 0, 'Tariff sheet: meals free to students'
  union all select null, 'breakfast', 'alumni', null, 0, 'Tariff sheet: meals free to alumni'
  union all select null, 'lunch', 'alumni', null, 0, 'Tariff sheet: meals free to alumni'
  union all select null, 'dinner', 'alumni', null, 0, 'Tariff sheet: meals free to alumni'
) s
where (s.item <> 'room' or s.gh is not null)
  and not exists (
    select 1 from public.tariffs t
    where t.guest_house_id is not distinct from s.gh
      and t.item = s.item
      and t.room_type is null
      and t.booking_type is not distinct from s.booking_type
      and t.requester_role is not distinct from s.requester_role
      and t.effective_from = date '2024-01-01'
  );

-- Official whitelist seed (migration 16): conditional on empty table.
insert into public.official_email_whitelist (email)
select e from unnest(array[
  'admin@iitpkd.ac.in',
  'director.office@iitpkd.ac.in',
  'registrar@iitpkd.ac.in'
]) as e
where not exists (select 1 from public.official_email_whitelist);

-- ==========================================================================
-- Done. Run supabase/seed.sql next for the demo personas and guest houses.
-- ==========================================================================
