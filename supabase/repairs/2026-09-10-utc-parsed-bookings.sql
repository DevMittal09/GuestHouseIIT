-- ONE-OFF DATA REPAIR — read this before running it. It is not a migration.
--
-- WHAT WENT WRONG
--
-- Until `lib/tz.ts` existed, `createBooking` turned the form's wall-clock
-- string into an instant with `new Date("2026-09-15T12:00")`, which the
-- ECMAScript spec resolves in the *runtime's* timezone. On a developer machine
-- set to IST that was right by luck. On a host running in UTC it stored 12:00
-- UTC for a 12:00 IST booking, and the Guest House Manager then read it back
-- as 5:30 PM — the "05:30 and 3:30" report. The code fix stops new bookings
-- being written this way; rows already written are still 5h30m late.
--
-- WHICH ROWS
--
-- Bookings created from 4 Sep 2026 onward, when the app started running on a
-- UTC host. Verify the list before you shift anything:
--
--   select booking_reference_id, created_at, check_in, check_out
--   from public.bookings
--   where created_at >= timestamptz '2026-09-04 00:00:00+00'
--   order by created_at;
--
-- At the time of writing that is exactly four rows: TP3YW, 8S65H, W5SDE and
-- TYZYY, all with a check-in at 12:00Z that should be 06:30Z. Every earlier
-- booking already has 06:30Z and must NOT be touched — running this twice
-- would shift them a second time.
--
-- WHY THE HOLDS TOO
--
-- `room_holds.during` is built from the booking's dates, so shifting a booking
-- without rebuilding its holds leaves the occupancy grid disagreeing with the
-- booking. `set_room_holds()` (migration 3) replaces a booking's holds in one
-- transaction and is subject to the no-overlap exclusion constraint, so if a
-- shifted stay would collide with another booking this whole script aborts and
-- nothing changes. That is the intended behaviour: resolve the clash by hand.
--
-- HOW TO RUN
--
-- Paste into the Supabase SQL editor. Take a backup first. It runs in one
-- transaction, so it either fully applies or fully rolls back.

begin;

-- Narrow this window if your cutover happened at a different time.
create temporary table _to_shift on commit drop as
select id, check_in, check_out
from public.bookings
where created_at >= timestamptz '2026-09-04 00:00:00+00'
  -- Belt and braces: only rows whose check-in is NOT already at an IST-aligned
  -- half-hour offset from UTC. A correctly stored IST wall-clock time on the
  -- hour or half hour always lands on :30 or :00 minus 5:30 — i.e. 06:30,
  -- 04:30, 18:30. A UTC-parsed one keeps the typed minutes (12:00, 10:00).
  and extract(minute from check_in at time zone 'UTC') not in (30);

select count(*) as rows_to_shift from _to_shift;

update public.bookings b
set check_in  = b.check_in  - interval '5 hours 30 minutes',
    check_out = b.check_out - interval '5 hours 30 minutes',
    updated_at = now()
from _to_shift s
where b.id = s.id;

-- Rebuild the holds of every shifted booking that still holds rooms.
do $$
declare
  r record;
begin
  for r in
    select b.id,
           b.check_in,
           b.check_out,
           coalesce(array_agg(h.room_id) filter (where h.room_id is not null), '{}') as room_ids
    from public.bookings b
    join _to_shift s on s.id = b.id
    left join public.room_holds h on h.booking_id = b.id
    group by b.id, b.check_in, b.check_out
  loop
    if array_length(r.room_ids, 1) is not null then
      perform public.set_room_holds(r.id, r.room_ids, r.check_in, r.check_out);
    end if;
  end loop;
end $$;

-- Leave a trace in the audit trail, so the shift is not invisible later.
insert into public.booking_logs (booking_id, action_by, action_by_name, new_status, remarks)
select b.id, null, 'System',
       b.status,
       'Check-in and check-out corrected by 5h30m: they had been stored as UTC wall-clock times by a pre-timezone-fix server.'
from public.bookings b
join _to_shift s on s.id = b.id;

commit;

-- Verify: every booking should now read back at the time it was booked for.
-- select booking_reference_id, check_in at time zone 'Asia/Kolkata' as check_in_ist
-- from public.bookings order by created_at;
