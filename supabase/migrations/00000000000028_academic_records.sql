-- ============================================================================
-- Migration 28 - The institute's records, held in the portal
-- ============================================================================
--
-- The office's eighth list of corrections (7 Oct 2026): "student guest details
-- from your own database". The academic database the portal was designed to
-- read (`ACADEMIC_DB_URL`, `lib/academic/http-source.ts`) does not exist yet
-- and nobody can say when it will, so the office will paste the records in
-- themselves, as CSV, from the console - and from today the Requester details
-- card, the Assistant Warden's check of a student's family and the booking
-- form's locked parent names all read this table.
--
-- One table for all six kinds of record, with every field of every kind as a
-- nullable column. The kinds share more than they differ by (an email, a
-- phone, a name, a department) and the alternative - six tables, six
-- importers, six console sections - would be six times the surface for the
-- same six CSV pastes. `kind` says which columns mean anything; the app reads
-- a row back through `ACADEMIC_RECORD_FIELDS`, so a column named here and not
-- in the record type (or the other way round) is a compile error rather than
-- a field that is silently never filled.
--
-- **This table holds parents' names and phone numbers.** It is therefore
-- service-role only, exactly like `app_settings`: no `authenticated` policy,
-- so no browser session can read it even with a valid JWT. What reaches a
-- browser is only ever what the server chose to show - the person's own card,
-- or the warden's check of the requests already in their queue.
--
-- One row per (kind, email), matched case-insensitively, because that is how
-- `AcademicSource.find` asks. A second paste of the same person updates the
-- row rather than adding another.
--
-- Additive and idempotent. Until it is applied, the lookups fall back to the
-- dummy records in `lib/academic/mock-source.ts` exactly as they did before,
-- and the Academic records console reports the missing table by name.
--
-- Safe to re-run.
-- ============================================================================

do $$
begin
  if not exists (select 1 from pg_type where typname = 'academic_record_kind') then
    create type public.academic_record_kind as enum (
      'student',
      'employee',
      'office',
      'student_rep',
      'alumni_office',
      'warden'
    );
  end if;
end $$;

create table if not exists public.academic_records (
  id uuid primary key default gen_random_uuid(),
  kind public.academic_record_kind not null,
  -- The institute email the record is found by. Stored as the office typed
  -- it; matched on `lower(email)` through the unique index below.
  email text not null,

  -- Shared
  name text,
  department text,
  phone text,

  -- Students
  roll_number text,
  program text,
  father_name text,
  mother_name text,
  -- Shown, and offered as a guest, only when the record has neither parent.
  guardian_name text,
  hostel text,

  -- Faculty and non-faculty staff
  employee_id text,
  employee_type text,
  office_number text,

  -- Offices: the head is the office's own "Copy to"
  head_name text,
  head_email text,

  -- Student representatives: a club, a fest council
  representative_type text,
  faculty_in_charge_email text,

  -- Who pasted it in, and when it last changed. The importer is kept so a
  -- wrong record can be traced back to the import that made it; the audit log
  -- records the import itself (`recordAudit`).
  imported_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists academic_records_kind_email_key
  on public.academic_records (kind, lower(email));

-- The console lists a kind at a time, newest import first.
create index if not exists academic_records_kind_idx
  on public.academic_records (kind, lower(email));

alter table public.academic_records enable row level security;

-- Deliberately no policy for `authenticated`: the rows hold parents' names
-- and phone numbers, and only the server decides who is shown what. The
-- service-role key bypasses RLS, which is how the app reads them.
drop policy if exists "academic_records are service-role only" on public.academic_records;

create or replace function public.touch_academic_record()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists academic_records_touch on public.academic_records;
create trigger academic_records_touch
  before update on public.academic_records
  for each row execute function public.touch_academic_record();

comment on table public.academic_records is
  'The institute''s records as the guest house office pasted them in (migration 28, 7 Oct 2026): one row per (kind, email), every kind''s fields as nullable columns. Read by the Requester details card, the Assistant Warden''s family check and the booking form''s locked parent names. Service-role only - it holds parents'' names and phone numbers.';

comment on column public.academic_records.guardian_name is
  'Offered as a guest, and shown on the card, only when the record has neither parent''s name.';
