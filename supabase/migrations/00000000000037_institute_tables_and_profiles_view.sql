-- ============================================================================
-- Migration 37 - the institute's own tables, and `profiles_v`
--                (6 November 2026)
-- ============================================================================
--
-- WHY
--
-- `academic_records` (migration 28) is **one flat table with every kind's
-- fields as nullable columns**, keyed by `(kind, lower(email))`. It was built
-- that way in a hurry, when the institute's academic database did not exist
-- and the booking form needed a student's parents immediately. The office has
-- since sent its real spreadsheets, and they are six different shapes with
-- fields that table has no column for: a parent's Aadhaar and phone number, a
-- spouse, a batch year, an employee's designation and gender, a warden's
-- hostel and which kind of warden they are, a council's Faculty Advisor's
-- address.
--
-- So this migration gives each kind its own table, with the columns the
-- office's sheet actually has:
--
--   institute_hostels    the hostels, with the institute's own id for each
--   institute_students   a student, their parents, their guardian, a spouse
--   institute_employees  faculty and non-teaching staff
--   institute_offices    an office mailbox and who heads it
--   institute_fcc        a council or fest, and its Faculty Advisor
--   institute_wardens    a warden, their hostel and their kind of wardenship
--
-- and a view, `profiles_v`, that resolves a person's hostel, department, roll
-- number and staff category **from those tables**, falling back to the column
-- stored on `profiles` where no institute row names them.
--
-- EXPAND AND CONTRACT - what this migration does NOT do
--
-- It does not drop anything. In particular:
--
--   * `academic_records` is **kept**, with every row in it, and is backfilled
--     **from**, never deleted. Nothing in the application reads it after this
--     migration; it stays so that the backfill below can be checked against
--     its source and re-run, and so that a rollback is a matter of pointing
--     the code back at it. Dropping it is a later, separate decision, and
--     belongs in `supabase/repairs/` once the institute tables have been
--     verified against the office's sheets.
--   * `hostels` is **kept** and keeps `profiles_hostel_fk` pointing at it, so
--     the existing `profiles.hostel_name` values stay valid and the console's
--     hostel list goes on working whichever table it reads.
--   * `profiles.hostel_name`, `department_or_club`, `roll_number`,
--     `staff_category` and `ldap_uid` are **kept**. `profiles_v` reads them as
--     the fallback, the console still writes them, and every one of them holds
--     live production data today: on this project `units` is empty and the
--     academic records have not been loaded, so a view that read the institute
--     tables *only* would return NULL for every warden's hostel and every
--     student's - which is the scope `canReview()` and the approval route are
--     computed from. That is the regression this COALESCE exists to prevent.
--
-- The contract step - dropping `academic_records`, and then the four profile
-- columns - needs the institute data loaded and checked first, and is written
-- up in `.memories/04-production.md`.
--
-- Additive and idempotent: every statement is `if not exists` or guarded, and
-- the backfill is `on conflict do nothing`, so re-running it changes nothing.
--
-- UNTIL IT IS APPLIED: the Academic records console reports the missing table
-- by name and every record lookup falls through to the published dummies, as
-- it already does when migration 28 is missing. Nothing else is refused.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. institute_hostels
-- ---------------------------------------------------------------------------
-- The institute's own hostel id (MALHAR, SAVERI...) alongside the name, because
-- the warden sheet keys on the id and the student sheet on the name.

create table if not exists public.institute_hostels (
  id          uuid primary key default gen_random_uuid(),
  hostel_id   text not null unique,
  hostel_name text not null unique
    check (length(btrim(hostel_name)) between 1 and 60 and hostel_name = btrim(hostel_name)),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.institute_hostels enable row level security;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'institute_hostels_updated_at') then
    create trigger institute_hostels_updated_at
      before update on public.institute_hostels
      for each row execute function public.set_updated_at();
  end if;
end $$;

-- Every hostel the office has already entered, keeping its name. The id is
-- derived from the name the same way the application derives one for a hostel
-- added from the console, so the two agree.
insert into public.institute_hostels (hostel_id, hostel_name)
select
  coalesce(nullif(regexp_replace(upper(h.name), '[^A-Z0-9]', '', 'g'), ''), 'HOS'),
  h.name
from public.hostels h
on conflict do nothing;

-- A hostel named on a profile but not on the list (possible only on a database
-- before migration 16 added the foreign key) still has to resolve, or a
-- warden's scope would read as NULL.
insert into public.institute_hostels (hostel_id, hostel_name)
select distinct
  coalesce(nullif(regexp_replace(upper(p.hostel_name), '[^A-Z0-9]', '', 'g'), ''), 'HOS'),
  p.hostel_name
from public.profiles p
where p.hostel_name is not null
  and btrim(p.hostel_name) <> ''
  and not exists (
    select 1 from public.institute_hostels ih where ih.hostel_name = p.hostel_name
  )
on conflict do nothing;


-- ---------------------------------------------------------------------------
-- 2. institute_students
-- ---------------------------------------------------------------------------
-- Parents' and a guardian's names, phone numbers and Aadhaar numbers, and a
-- research scholar's spouse (the owner's sixteenth list, 4 Nov 2026). Read by
-- the booking form, which locks a student's father and mother to what is here.

create table if not exists public.institute_students (
  id                         uuid primary key default gen_random_uuid(),
  email                      text not null,
  batch_year                 text,
  roll_number                text,
  full_name                  text,
  programme                  text,
  faculty_advisor_guide_name text,
  department                 text,
  phone                      text,
  aadhar_number              text,
  father_name                text,
  father_aadhar_number       text,
  father_phone_number        text,
  mother_name                text,
  mother_aadhar_number       text,
  mother_phone_number        text,
  spouse_name                text,
  spouse_aadhar_number       text,
  spouse_phone_number        text,
  guardian_name              text,
  guardian_aadhar_number     text,
  guardian_phone_number      text,
  hostel                     text,
  imported_by                uuid references public.profiles (id) on delete set null,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now()
);

create unique index if not exists institute_students_email_idx
  on public.institute_students (lower(email));

-- The hostel on a student's row must be one on the list, and follows a rename.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'institute_students_hostel_fk'
  ) then
    alter table public.institute_students
      add constraint institute_students_hostel_fk
      foreign key (hostel) references public.institute_hostels (hostel_name)
      on update cascade on delete set null;
  end if;
end $$;

-- RLS on with no `authenticated` policy - the pattern migrations 28, 31, 32
-- and 36 use. These rows hold parents' names, phone numbers and Aadhaar
-- numbers: service-role (or owner) connections only, and nothing reachable
-- through PostgREST with the published anon key. See the note at the foot of
-- this file.
alter table public.institute_students enable row level security;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'institute_students_updated_at') then
    create trigger institute_students_updated_at
      before update on public.institute_students
      for each row execute function public.set_updated_at();
  end if;
end $$;


-- ---------------------------------------------------------------------------
-- 3. institute_employees
-- ---------------------------------------------------------------------------

create table if not exists public.institute_employees (
  id            uuid primary key default gen_random_uuid(),
  email         text not null,
  employee_id   text,
  full_name     text,
  department    text,
  employee_type text,
  designation   text,
  phone         text,
  office_number text,
  gender        text,
  imported_by   uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create unique index if not exists institute_employees_email_idx
  on public.institute_employees (lower(email));

alter table public.institute_employees enable row level security;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'institute_employees_updated_at') then
    create trigger institute_employees_updated_at
      before update on public.institute_employees
      for each row execute function public.set_updated_at();
  end if;
end $$;


-- ---------------------------------------------------------------------------
-- 4. institute_offices
-- ---------------------------------------------------------------------------

create table if not exists public.institute_offices (
  id              uuid primary key default gen_random_uuid(),
  office_email    text not null,
  office_name     text,
  office_type     text,
  phone           text,
  department_head text,
  head_name       text,
  head_email      text,
  imported_by     uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create unique index if not exists institute_offices_email_idx
  on public.institute_offices (lower(office_email));

alter table public.institute_offices enable row level security;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'institute_offices_updated_at') then
    create trigger institute_offices_updated_at
      before update on public.institute_offices
      for each row execute function public.set_updated_at();
  end if;
end $$;


-- ---------------------------------------------------------------------------
-- 5. institute_fcc - the councils, clubs and fests, and their Faculty Advisor
-- ---------------------------------------------------------------------------

create table if not exists public.institute_fcc (
  id                    uuid primary key default gen_random_uuid(),
  council_email         text not null,
  council_name          text,
  event_or_council      text,
  faculty_advisor_email text,
  imported_by           uuid references public.profiles (id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create unique index if not exists institute_fcc_email_idx
  on public.institute_fcc (lower(council_email));

alter table public.institute_fcc enable row level security;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'institute_fcc_updated_at') then
    create trigger institute_fcc_updated_at
      before update on public.institute_fcc
      for each row execute function public.set_updated_at();
  end if;
end $$;


-- ---------------------------------------------------------------------------
-- 6. institute_wardens
-- ---------------------------------------------------------------------------
-- `warden_role` is the office's own word for the appointment - Warden, Deputy
-- Warden, Assistant Warden. It is **data about the person, not a portal role**:
-- all three decide the same queue with the same scope, so `user_role` keeps one
-- value, `warden`, and nothing was added to that enum. Which kind of warden
-- somebody is belongs here, where the office's sheet puts it.

create table if not exists public.institute_wardens (
  id           uuid primary key default gen_random_uuid(),
  warden_email text not null,
  full_name    text,
  warden_phone text,
  warden_role  text,
  hostel_id    text references public.institute_hostels (hostel_id)
                 on update cascade on delete set null,
  imported_by  uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create unique index if not exists institute_wardens_email_idx
  on public.institute_wardens (lower(warden_email));

alter table public.institute_wardens enable row level security;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'institute_wardens_updated_at') then
    create trigger institute_wardens_updated_at
      before update on public.institute_wardens
      for each row execute function public.set_updated_at();
  end if;
end $$;


-- ---------------------------------------------------------------------------
-- 7. Backfill from `academic_records` (migration 28)
-- ---------------------------------------------------------------------------
-- One statement per kind, `on conflict do nothing` so a row the office has
-- already pasted into the new table is never overwritten by the old one, and
-- so the whole section is safe to re-run. `academic_records` is left untouched.
--
-- `academic_record_kind` may not exist (a database that never had migration 28);
-- each statement is wrapped so that is not an error.

do $$
begin
  if to_regclass('public.academic_records') is null then
    raise notice 'migration 37: no academic_records table - nothing to backfill';
    return;
  end if;

  insert into public.institute_students
    (email, roll_number, full_name, programme, department, phone,
     father_name, mother_name, guardian_name, hostel, imported_by, created_at)
  select
    a.email, a.roll_number, a.name, a.program, a.department, a.phone,
    a.father_name, a.mother_name, a.guardian_name,
    -- Only a hostel that is on the list; anything else would be refused by the
    -- foreign key and take the whole migration down with it.
    (select ih.hostel_name from public.institute_hostels ih where ih.hostel_name = a.hostel),
    a.imported_by, a.created_at
  from public.academic_records a
  where a.kind = 'student'
  on conflict do nothing;

  insert into public.institute_employees
    (email, employee_id, full_name, department, employee_type, phone,
     office_number, imported_by, created_at)
  select
    a.email, a.employee_id, a.name, a.department, a.employee_type, a.phone,
    a.office_number, a.imported_by, a.created_at
  from public.academic_records a
  where a.kind = 'employee'
  on conflict do nothing;

  -- `office` and `alumni_office` are both office mailboxes; the Alumni Office
  -- is one of them, and `KIND_FOR_ROLE` is what tells them apart on the way in.
  insert into public.institute_offices
    (office_email, office_name, office_type, phone, head_name, head_email,
     imported_by, created_at)
  select
    a.email, a.department,
    case when a.kind = 'alumni_office' then 'alumni' else null end,
    a.phone, a.head_name, a.head_email, a.imported_by, a.created_at
  from public.academic_records a
  where a.kind in ('office', 'alumni_office')
  on conflict do nothing;

  insert into public.institute_fcc
    (council_email, council_name, event_or_council, faculty_advisor_email,
     imported_by, created_at)
  select
    a.email, a.representative_type, a.representative_type,
    a.faculty_in_charge_email, a.imported_by, a.created_at
  from public.academic_records a
  where a.kind = 'student_rep'
  on conflict do nothing;

  insert into public.institute_wardens
    (warden_email, full_name, warden_phone, hostel_id, imported_by, created_at)
  select
    a.email, a.name, a.phone,
    (select ih.hostel_id from public.institute_hostels ih where ih.hostel_name = a.hostel),
    a.imported_by, a.created_at
  from public.academic_records a
  where a.kind = 'warden'
  on conflict do nothing;
end $$;


-- ---------------------------------------------------------------------------
-- 8. Backfill from `profiles` - the people the portal already knows
-- ---------------------------------------------------------------------------
-- A student whose profile carries a hostel and a roll number, but who has no
-- academic record, still needs a row here, or `profiles_v` would have nothing
-- to read and the warden's queue would lose them. The same for a warden's
-- hostel. Only rows that do not already exist, and only the fields `profiles`
-- actually holds - this invents nothing.

insert into public.institute_students (email, roll_number, full_name, hostel, department)
select
  p.email,
  p.roll_number,
  p.full_name,
  (select ih.hostel_name from public.institute_hostels ih where ih.hostel_name = p.hostel_name),
  p.department_or_club
from public.profiles p
where p.role = 'student'
  and not exists (
    select 1 from public.institute_students s where lower(s.email) = lower(p.email)
  )
on conflict do nothing;

insert into public.institute_employees (email, full_name, department, employee_type)
select
  p.email,
  p.full_name,
  p.department_or_club,
  case p.staff_category
    when 'faculty' then 'Faculty'
    when 'staff'   then 'Non-Teaching Staff'
    else null
  end
from public.profiles p
where p.role = 'employee'
  and not exists (
    select 1 from public.institute_employees e where lower(e.email) = lower(p.email)
  )
on conflict do nothing;

insert into public.institute_wardens (warden_email, full_name, hostel_id)
select
  p.email,
  p.full_name,
  (select ih.hostel_id from public.institute_hostels ih where ih.hostel_name = p.hostel_name)
from public.profiles p
where p.role = 'warden'
  and not exists (
    select 1 from public.institute_wardens w where lower(w.warden_email) = lower(p.email)
  )
on conflict do nothing;


-- ---------------------------------------------------------------------------
-- 9. profiles.account_status
-- ---------------------------------------------------------------------------
-- The office's word for why somebody has gone. Migration 36's
-- `login_disabled_at` records *when* access was withdrawn and is what refuses
-- a request; this records *why*, in the vocabulary the office uses, and the two
-- are written together by `bulkUpdateAccountStatus`. `signInRefusal`
-- (`lib/user-groups.ts`) reads both, so there is still one answer to "may this
-- person sign in".
--
-- Defaulted to 'active', so every existing account behaves exactly as it does
-- today.

alter table public.profiles
  add column if not exists account_status text not null default 'active';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_account_status_check'
  ) then
    alter table public.profiles
      add constraint profiles_account_status_check
      check (account_status in ('active', 'relieved', 'graduated', 'suspended', 'retired'));
  end if;
end $$;

comment on column public.profiles.account_status is
  'Why this account is or is not in use, in the office''s vocabulary (migration 37). Anything but ''active'' refuses sign-in, through signInRefusal(); login_disabled_at beside it records when.';

-- An account already blocked under migration 36 gets a status that says so,
-- rather than reading as active beside a timestamp that says it is not.
update public.profiles
   set account_status = 'relieved'
 where login_disabled_at is not null
   and account_status = 'active';


-- ---------------------------------------------------------------------------
-- 10. units: the column names the application now uses
-- ---------------------------------------------------------------------------
-- Renames only - no data moves and nothing is dropped, and each one is guarded
-- so the migration is idempotent and so a database already carrying the new
-- name is left alone.
--
--   kind        -> category              (it holds 'department'/'club'/'council'/'office')
--   office_class-> office_type
--   parent_id   -> parent_department_id
--   hod_unit_id -> hod_approval_from_id  (whose HOD approves this unit's requests)
--
-- `units` is configuration, not history: on this project it is empty. A rename
-- is instant, keeps every row and every foreign key, and `alter table ... rename
-- column` back is the whole rollback.

do $$
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'units' and column_name = 'kind')
     and not exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'units' and column_name = 'category') then
    alter table public.units rename column kind to category;
  end if;

  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'units' and column_name = 'office_class')
     and not exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'units' and column_name = 'office_type') then
    alter table public.units rename column office_class to office_type;
  end if;

  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'units' and column_name = 'parent_id')
     and not exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'units' and column_name = 'parent_department_id') then
    alter table public.units rename column parent_id to parent_department_id;
  end if;

  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'units' and column_name = 'hod_unit_id')
     and not exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'units' and column_name = 'hod_approval_from_id') then
    alter table public.units rename column hod_unit_id to hod_approval_from_id;
  end if;
end $$;


-- ---------------------------------------------------------------------------
-- 11. profiles_v - the read path
-- ---------------------------------------------------------------------------
-- What the application selects a profile from. Four fields are resolved from
-- the institute tables **with the stored column underneath**:
--
--   hostel_name        a student's hostel, or a warden's, else profiles.hostel_name
--   department_or_club the unit's name, else profiles.department_or_club
--   roll_number        the student row's, else profiles.roll_number
--   staff_category     derived from employee_type, else profiles.staff_category
--
-- The COALESCE is the whole point and must not be simplified away: the
-- institute tables are empty on this project today, and a view that read them
-- alone would return NULL for every warden's hostel - which is the scope
-- `canReview()` and the approval route are computed from. A student's booking
-- would stop routing to their Assistant Warden, silently, with no error
-- anywhere. The institute data wins where it exists, because that is the
-- office's own record; the stored column answers where it does not.
--
-- `security_invoker` so the view is read with the caller's own privileges
-- rather than the definer's: a view is otherwise a way round the row-level
-- security on the tables beneath it.

create or replace view public.profiles_v
with (security_invoker = true) as
select
  p.id,
  p.email,
  p.full_name,
  p.role,
  p.account_status,
  p.unit_id,
  p.ldap_uid,
  p.group_id,
  p.login_disabled_at,
  p.login_disabled_reason,
  coalesce(
    case
      when p.role = 'student' then s.hostel
      when p.role = 'warden'  then ih.hostel_name
    end,
    p.hostel_name
  ) as hostel_name,
  coalesce(u.name, p.department_or_club) as department_or_club,
  coalesce(s.roll_number, p.roll_number)  as roll_number,
  coalesce(
    case
      when e.employee_type is null then null
      when lower(e.employee_type) like '%non%teaching%' then 'staff'
      else 'faculty'
    end,
    p.staff_category
  ) as staff_category
from public.profiles p
left join public.institute_students s
  on lower(s.email) = lower(p.email) and p.role = 'student'
left join public.institute_wardens w
  on lower(w.warden_email) = lower(p.email) and p.role = 'warden'
left join public.institute_hostels ih
  on ih.hostel_id = w.hostel_id
left join public.units u
  on u.id = p.unit_id
left join public.institute_employees e
  on lower(e.email) = lower(p.email) and p.role = 'employee';

comment on view public.profiles_v is
  'How the application reads a profile (migration 37). Hostel, department, roll number and staff category are resolved from the institute tables, falling back to the column stored on profiles - do not remove the COALESCE until the institute data is loaded and verified, or every warden loses their scope.';


-- ---------------------------------------------------------------------------
-- RLS, and why it still matters on a Supabase-hosted project
-- ---------------------------------------------------------------------------
-- The application now connects as the database owner over `pg`, which bypasses
-- row-level security entirely - so it is tempting to read RLS as dead weight.
-- It is not, as long as the database is hosted on Supabase: **PostgREST is
-- still listening** on the project's REST endpoint, the anon key that reaches
-- it is published in every browser that has ever loaded the site, and `anon`
-- and `authenticated` are real roles in this cluster. RLS enabled with no
-- policy for those roles is what makes the new tables unreachable that way.
--
-- Every table above therefore does what migrations 28, 31, 32 and 36 do:
-- `enable row level security` and **no `authenticated` policy at all**. Do not
-- add one, and do not disable RLS on the grounds that the application no
-- longer relies on it.
-- ============================================================================
