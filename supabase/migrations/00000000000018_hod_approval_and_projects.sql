-- Migration 18: HOD approval routing and the project list (Phase 4, Sep 2026).
--
-- From the meeting notes:
--
--   * Faculty and staff OFFICIAL bookings need their HOD's approval; personal
--     bookings do not. (Migration 15 routed faculty only; staff now too.)
--   * Club bookings are official and go to the respective HOD, after the
--     club's Faculty Advisor / council secretary.
--   * Offices choose per booking: "Direct" (straight to the Guest House
--     Manager, as before) or "Requires HOD approval".
--   * Every official booking names a debitable head; "Project" means picking
--     a project from a list the office maintains.
--
-- The routing itself lives in lib/workflow.ts (`routeFor`); this adds the
-- data it needs:
--
--   * `units.hod_unit_id` — whose HOD approves a unit's requests when it is
--     not the default (a club's, say). Null means the default: a department
--     is its own, a department office answers to its parent department, an
--     officer office to its own head, a club or council has no HOD stage.
--   * `bookings.office_approval` — an office's choice for that booking,
--     'direct' or 'hod'. Existing office bookings are backfilled 'direct',
--     which is what happened to them.
--   * `projects`, and `bookings.project_id` referencing it (on delete
--     restrict: a project a booking used is deactivated, never deleted, so
--     its invoices still name it).
--
-- `can_access_booking()` gains the HOD reached through `hod_unit_id`, so an
-- HOD can read the requests they are asked to approve when RLS is the
-- boundary (Phase 8).
--
-- Apply after migration 17. Safe to re-run.

-- ---------------------------------------------------------------- units

alter table public.units
  add column if not exists hod_unit_id uuid references public.units (id) on delete set null;

alter table public.units drop constraint if exists units_hod_unit_not_self;
alter table public.units
  add constraint units_hod_unit_not_self check (hod_unit_id is null or hod_unit_id <> id);

comment on column public.units.hod_unit_id is
  'Whose HOD approves this unit''s official requests, when not the default (lib/units.ts hodUnitIdFor): a department is its own; a department office answers to its parent; an officer office to its own head; clubs and councils have no HOD stage unless this is set.';

comment on column public.profiles.staff_category is
  'Faculty or non-teaching staff, for employees. Both need their HOD''s approval for an official booking (Phase 4); the category decides the debitable heads offered (faculty: Department / Project / PDF; staff: Department).';

-- ---------------------------------------------------------------- projects

create table if not exists public.projects (
  id             uuid primary key default gen_random_uuid(),
  project_number text not null check (project_number ~ '^[A-Za-z0-9][A-Za-z0-9/._-]{1,39}$'),
  title          text not null check (length(btrim(title)) > 0),
  pi_name        text,
  active         boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create unique index if not exists projects_number_key on public.projects (lower(project_number));

drop trigger if exists projects_updated_at on public.projects;
create trigger projects_updated_at
  before update on public.projects
  for each row execute function public.set_updated_at();

comment on table public.projects is
  'Sponsored and consultancy projects a stay can be debited to. Maintained in the console (Projects), bulk-loaded by pasting a spreadsheet; deactivated rather than deleted once used.';

-- ---------------------------------------------------------------- bookings

alter table public.bookings
  add column if not exists office_approval text,
  add column if not exists project_id uuid references public.projects (id) on delete restrict;

alter table public.bookings drop constraint if exists bookings_office_approval_check;
alter table public.bookings
  add constraint bookings_office_approval_check
  check (office_approval is null or office_approval in ('direct', 'hod'));

-- What already happened to them: office bookings went straight to the
-- manager before this choice existed.
update public.bookings
set office_approval = 'direct'
where office_approval is null
  and user_role in ('official', 'iar_cell');

create index if not exists bookings_project_idx on public.bookings (project_id) where project_id is not null;

comment on column public.bookings.office_approval is
  'An office''s choice for this booking: direct to the Guest House Manager, or through its HOD first. Null for non-office bookings.';
comment on column public.bookings.project_id is
  'The project debited when debit_head is project_grant. debit_details keeps the project''s number and title as they were at booking.';

-- ---------------------------------------------------------------- access

alter table public.projects enable row level security;

drop policy if exists "projects are readable" on public.projects;
create policy "projects are readable"
  on public.projects for select to authenticated using (active);

drop policy if exists "service role manages projects" on public.projects;
create policy "service role manages projects"
  on public.projects for all to service_role using (true) with check (true);

-- An approver by appointment reads the bookings they approve: the head up the
-- requester's unit chain (migration 15), and now also the head up the chain
-- of the unit named as the requester's unit's HOD unit.
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
        join public.units ru on ru.id = r.unit_id
        join public.units u on u.id in (ru.id, ru.hod_unit_id)
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
