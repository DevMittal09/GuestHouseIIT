-- Migration 35: Institute data tables (2 Nov 2026)
--
-- Six tables matching the institute's own spreadsheet structures for students,
-- employees, offices, fests/councils/clubs, hostels and wardens. These are the
-- office's master records - imported via CSV/XLSX from their spreadsheets.
--
-- Aadhar numbers are stored encrypted by the application (`lib/crypto.ts`);
-- the column type is text because the value is a hex-encoded ciphertext.
--
-- Additive, safe to re-run (all CREATE IF NOT EXISTS). Until applied, the
-- store methods degrade to empty results - existing functionality is unaffected.

-- ---- students --------------------------------------------------------------

create table if not exists public.institute_students (
  id                      uuid primary key default gen_random_uuid(),
  email                   text not null,
  batch_year              text,
  roll_number             text,
  full_name               text,
  programme               text,
  faculty_advisor_guide_name text,
  department              text,
  year_of_admission       text,
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

create unique index if not exists institute_students_email_idx
  on public.institute_students (lower(email));

create trigger institute_students_updated_at
  before update on public.institute_students
  for each row execute function public.set_updated_at();

-- ---- employees -------------------------------------------------------------

create table if not exists public.institute_employees (
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

create unique index if not exists institute_employees_email_idx
  on public.institute_employees (lower(email));

create trigger institute_employees_updated_at
  before update on public.institute_employees
  for each row execute function public.set_updated_at();

-- ---- offices ---------------------------------------------------------------

create table if not exists public.institute_offices (
  id                uuid primary key default gen_random_uuid(),
  office_email      text not null,
  office_name       text,
  office_class      text,
  phone             text,
  department_head   text,
  head_name         text,
  head_email        text,
  imported_by       uuid references public.profiles (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create unique index if not exists institute_offices_email_idx
  on public.institute_offices (lower(office_email));

create trigger institute_offices_updated_at
  before update on public.institute_offices
  for each row execute function public.set_updated_at();

-- ---- fests, councils and clubs ---------------------------------------------

create table if not exists public.institute_fcc (
  id                      uuid primary key default gen_random_uuid(),
  council_email           text not null,
  council_name            text,
  event_or_council        text,
  faculty_advisor_email   text,
  imported_by             uuid references public.profiles (id) on delete set null,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create unique index if not exists institute_fcc_email_idx
  on public.institute_fcc (lower(council_email));

create trigger institute_fcc_updated_at
  before update on public.institute_fcc
  for each row execute function public.set_updated_at();

-- ---- institute hostels (richer than the portal's hostels table) ------------

create table if not exists public.institute_hostels (
  id                uuid primary key default gen_random_uuid(),
  hostel_id         text not null unique,
  hostel_name       text not null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create trigger institute_hostels_updated_at
  before update on public.institute_hostels
  for each row execute function public.set_updated_at();

-- ---- wardens ---------------------------------------------------------------

create table if not exists public.institute_wardens (
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

create unique index if not exists institute_wardens_email_idx
  on public.institute_wardens (lower(warden_email));

create trigger institute_wardens_updated_at
  before update on public.institute_wardens
  for each row execute function public.set_updated_at();
