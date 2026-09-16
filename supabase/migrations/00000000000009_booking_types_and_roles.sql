-- Migration 9: why a stay is booked, and two new staff roles.
--
-- Three requests from the guest house office (16 Sep 2026):
--
-- 1. Faculty and regular staff book either officially or privately, and the
--    two are approved and settled differently. That is a property of the
--    *request*, not of the person, so it is a column on `bookings`. Roles that
--    only ever book one way (a club, a dignitary's office) are simply never
--    asked — see `bookingTypesFor` in lib/booking-types.ts.
--
-- 2. Alumni have no institute login, so nobody signs in as one any more. The
--    IAR Office books for them, and so does a new IAR Student Cell whose
--    requests the IAR Office approves. An alumni booking carries the alumnus's
--    name and student id alongside the ID card already stored in
--    `alumni_id_url`, because that person cannot log in to speak for
--    themselves and the IAR Office has nothing else to verify against.
--
-- 3. A Guest House Caretaker role for the reception desk: a subset of the
--    manager's console — current occupants, upcoming stays, and marking
--    guests in and out. No allocation, no approvals.
--
-- The `alumni` role is kept in the enum. Bookings made before this migration
-- still carry it, and dropping an enum value would orphan them.
--
-- Apply after migration 8. Safe to re-run.

-- ---------------------------------------------------------------- roles
-- `alter type ... add value` is transactional since PG12, but a value added in
-- a transaction cannot be *used* in that same transaction. Nothing below
-- writes these values, so this is safe as one migration; a later migration
-- that inserts rows with them would need its own.
alter type public.user_role add value if not exists 'iar_student_cell';
alter type public.user_role add value if not exists 'gh_caretaker';

-- ---------------------------------------------------------------- booking type
do $$
begin
  if not exists (select 1 from pg_type where typname = 'booking_type') then
    create type public.booking_type as enum ('official', 'personal', 'alumni');
  end if;
end $$;

alter table public.bookings
  add column if not exists booking_type public.booking_type not null default 'official',
  add column if not exists alumni_name text,
  add column if not exists alumni_roll_number text;

-- Backfill from the requester category, which is all the old rows recorded.
-- Students booked for family; alumni requests were alumni requests; everything
-- else was institute business. Only touches rows still at the column default,
-- so re-running cannot overwrite a real answer.
update public.bookings
set booking_type = case
  when user_role = 'student' then 'personal'::public.booking_type
  when user_role = 'alumni' then 'alumni'::public.booking_type
  else 'official'::public.booking_type
end
where booking_type = 'official'
  and user_role in ('student', 'alumni');

-- An alumni booking names the alumnus; every other kind must not, so a stray
-- value cannot sit on a booking whose form never collected it.
alter table public.bookings drop constraint if exists bookings_alumni_details;
alter table public.bookings
  add constraint bookings_alumni_details check (
    booking_type = 'alumni'
    or (alumni_name is null and alumni_roll_number is null)
  );

comment on column public.bookings.booking_type is
  'Why the stay was booked: official institute business, a private visit, or raised on behalf of an alumnus. Decides the approval route. See lib/booking-types.ts.';
comment on column public.bookings.alumni_name is
  'The alumnus this stay is for — only on booking_type = ''alumni''.';
comment on column public.bookings.alumni_roll_number is
  'That alumnus''s student / roll number, for the IAR Office to verify against.';
