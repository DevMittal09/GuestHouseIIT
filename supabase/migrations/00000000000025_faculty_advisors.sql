-- ============================================================================
-- Migration 25 — Faculty Advisors and secretaries' mailboxes on councils
-- ============================================================================
--
-- The student bodies are a hierarchy: a Faculty Advisor for each council
-- (Technical Affairs, Cultural Affairs), a student secretary for it, and the
-- clubs under it. A fest such as Petrichor has an advisor of its own. Clubs
-- do not book for themselves; the Faculty Advisor books for the council or
-- for any club under it, and the booking goes straight to the Guest House
-- Manager (24 Sep 2026, `lib/club-booking.ts`).
--
-- 1. **`units.faculty_advisor_id`** — who the Faculty Advisor is *now*. The
--    appointment is a contract of a year or two, so it is a field the
--    developer changes in Departments & Clubs rather than an account of its
--    own: any faculty member named here gets "Book as Faculty Advisor" on
--    New Booking, and loses it the moment someone else is named. A club with
--    none of its own takes its council's (`facultyAdvisorOf`).
--
-- 2. **`units.secretary_email`** — the council secretary's mailbox, such as
--    sec_arts@iitpkd.ac.in, which outlives any one secretary. It is filled
--    into Copy to on every booking the advisor raises for the council or a
--    club under it (`defaultCopyToFor`); the advisor may remove it or add
--    more. A club with none of its own takes its council's.
--
-- Both only make sense on a club or council; the console refuses them
-- elsewhere and so does the check below.
--
-- **Backfill.** Until today a club's faculty in-charge was found two other
-- ways: a non-student set as the club's own head, or a Faculty Advisor
-- account whose Department / Club matched the club's. The advisor field is
-- now the only way, so each of those is copied into it once, where the unit
-- has no advisor yet — nobody who could book for a club yesterday loses it.
--
-- Additive and idempotent. Until this is applied the portal reads every unit
-- as having no Faculty Advisor, so nobody can book for a club (and the club's
-- account is told so); saving an advisor in the console says which migration
-- is missing.
--
-- Safe to re-run.
-- ============================================================================

alter table public.units
  add column if not exists faculty_advisor_id uuid references public.profiles (id) on delete set null,
  add column if not exists secretary_email text;

alter table public.units drop constraint if exists units_student_body_fields_check;
alter table public.units
  add constraint units_student_body_fields_check
  check (
    kind in ('club', 'council')
    or (faculty_advisor_id is null and secretary_email is null)
  );

alter table public.units drop constraint if exists units_secretary_email_check;
alter table public.units
  add constraint units_secretary_email_check
  check (
    secretary_email is null
    or (char_length(secretary_email) <= 254 and secretary_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')
  );

create index if not exists units_faculty_advisor_idx
  on public.units (faculty_advisor_id)
  where faculty_advisor_id is not null;

comment on column public.units.faculty_advisor_id is
  'Councils, fests and clubs: the faculty member who is Faculty Advisor now, and books for the unit (straight to the Guest House Manager). A club with none takes its council''s.';
comment on column public.units.secretary_email is
  'Councils, fests and clubs: the student secretary''s mailbox (sec_arts@…), filled into Copy to on bookings the Faculty Advisor raises. A club with none takes its council''s.';

-- ---------------------------------------------------------------- backfill

-- A faculty member set as a club's or council's own head.
update public.units u
set faculty_advisor_id = u.head_id
from public.profiles p
where u.kind in ('club', 'council')
  and u.faculty_advisor_id is null
  and p.id = u.head_id
  and (p.role = 'faculty_advisor' or (p.role = 'employee' and coalesce(p.staff_category, 'faculty') <> 'staff'));

-- A Faculty Advisor account matched to a club's account by Department / Club.
update public.units u
set faculty_advisor_id = m.advisor_id
from (
  select distinct on (club.unit_id) club.unit_id, fa.id as advisor_id
  from public.profiles club
  join public.profiles fa
    on fa.role = 'faculty_advisor'
   and nullif(btrim(fa.department_or_club), '') = btrim(club.department_or_club)
  where club.role = 'club' and club.unit_id is not null
  order by club.unit_id, fa.full_name
) m
where u.id = m.unit_id
  and u.kind in ('club', 'council')
  and u.faculty_advisor_id is null;
