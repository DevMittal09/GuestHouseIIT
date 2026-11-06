-- Migration 15: approval by appointment, and who pays (Sep 2026).
--
-- Two requests from the office, landing together because they share a form:
--
-- 1. A faculty member's *official* booking needs their HOD's approval; a
--    club's booking needs its advisor's, or better, the student secretary of
--    the council the club belongs to. Those people change every two years.
--
--    Until now an approver was found by matching free text — a faculty
--    advisor was whoever had the same "Department / Club" string as the club
--    asking. That broke on a stray space, and a change of advisor meant
--    editing two profiles by hand and keeping them spelled identically.
--
--    So the approver moves onto the *unit*: departments, clubs, councils and
--    offices each have a head and an optional acting head, and a unit with no
--    head of its own takes its parent's. Changing an HOD is one field on one
--    row. Approvers are resolved when someone looks, never stored on the
--    booking, so waiting requests follow the new head on their own.
--
-- 2. Every booking records the budget it is charged to — the "debitable
--    head". A student or personal booking is always personal funds, settled
--    at checkout; everything else chooses. A Special Budget carries its
--    justification and the uploaded sanction.
--
-- Apply after migration 14. Safe to re-run.

-- ---------------------------------------------------------------- status

-- A value added here cannot be *used* in the same transaction, and nothing
-- below uses it — the application writes it once this has committed.
alter type public.booking_status add value if not exists 'PENDING_HOD';

-- ---------------------------------------------------------------- units

create table if not exists public.units (
  id             uuid primary key default gen_random_uuid(),
  name           text not null unique,
  kind           text not null check (kind in ('department', 'club', 'council', 'office')),
  -- A club's council, say. A unit with no head of its own takes its parent's.
  parent_id      uuid references public.units (id) on delete restrict,
  head_id        uuid references public.profiles (id) on delete set null,
  -- Stands in for the head while set: leave, or a gap between appointments.
  acting_head_id uuid references public.profiles (id) on delete set null,
  created_at     timestamptz not null default now(),
  check (parent_id is null or parent_id <> id)
);

comment on table public.units is
  'Departments, clubs, councils and offices, and who heads each. Approvers are found through these (lib/units.ts), resolved at the moment someone looks, so a change of HOD moves the waiting requests with it.';

-- ---------------------------------------------------------------- profiles

alter table public.profiles
  add column if not exists unit_id uuid references public.units (id) on delete restrict,
  add column if not exists staff_category text
    check (staff_category is null or staff_category in ('faculty', 'staff'));

comment on column public.profiles.unit_id is
  'The department, club or office this person belongs to. Their approver is the head of it, or of the unit above it.';
comment on column public.profiles.staff_category is
  'Faculty or non-teaching staff, for employees. A faculty member''s official booking waits for their HOD; staff bookings go straight to the Guest House Manager.';

-- ---------------------------------------------------------------- bookings

alter table public.bookings
  add column if not exists debit_head text
    check (debit_head is null or debit_head in (
      'institute_grant', 'professional_development_fund', 'project_grant',
      'department_budget', 'special_budget', 'personal_funds',
      'alumni_fund', 'student_fund', 'hostel_funds'
    )),
  add column if not exists debit_details text,
  add column if not exists debit_document_url text;

-- A personal booking was always paid personally, so that much of the past
-- can be filled in honestly. An official booking made before the question
-- existed is left null: guessing its budget would be inventing an accounting
-- record.
update public.bookings
set debit_head = 'personal_funds'
where debit_head is null
  and booking_type = 'personal';

comment on column public.bookings.debit_head is
  'The budget this stay is charged to. Null only on non-personal bookings made before migration 15.';
comment on column public.bookings.debit_details is
  'The project for a Project Grant, or the justification for a Special Budget.';
comment on column public.bookings.debit_document_url is
  'The uploaded sanction behind a Special Budget.';

-- ---------------------------------------------------------------- access

alter table public.units enable row level security;

drop policy if exists "units are readable" on public.units;
create policy "units are readable"
  on public.units for select to authenticated using (true);

drop policy if exists "console manages units" on public.units;
create policy "console manages units"
  on public.units for all to authenticated
  using (public.my_role() in ('gh_manager', 'developer'))
  with check (public.my_role() in ('gh_manager', 'developer'));

-- A unit head sees the bookings they are asked to approve. The original rule
-- matched faculty advisors by department string; this adds approval by
-- appointment beside it, walking up to a parent unit the same way the app
-- does.
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
    or exists (
      with recursive chain as (
        select u.id, u.parent_id, u.head_id, u.acting_head_id, 1 as depth
        from public.profiles r
        join public.units u on u.id = r.unit_id
        where r.id = b.user_id
        union all
        select p.id, p.parent_id, p.head_id, p.acting_head_id, c.depth + 1
        from chain c
        join public.units p on p.id = c.parent_id
        where c.depth < 8
      )
      select 1 from chain
      where auth.uid() in (chain.head_id, chain.acting_head_id)
    )
$$;
