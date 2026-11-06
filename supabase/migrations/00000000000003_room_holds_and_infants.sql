-- Room occupancy moves out of bookings.assigned_room_ids and into its own table
-- whose exclusion constraint makes a double-booking impossible to write.
--
-- Why: allocateRooms() re-checked for clashes and then wrote, which is a
-- check-then-act race. With one manager it almost never loses; with two
-- managers (or one double-click) it can write two holds on the same room for
-- overlapping dates. The database is the only place that can settle this.
--
-- Also adds bookings.infants — children under 10 share their guardians' room
-- and do not count towards room occupancy.

create extension if not exists btree_gist;

create table public.room_holds (
  booking_id uuid not null references public.bookings (id) on delete cascade,
  room_id    uuid not null references public.rooms (id) on delete cascade,
  -- Half-open [check_in, check_out): a checkout and a same-instant check-in do
  -- NOT overlap, which is exactly the strict-overlap rule the app applies.
  during     tstzrange not null,
  primary key (booking_id, room_id),
  constraint room_holds_no_overlap
    exclude using gist (room_id with =, during with &&)
);

create index room_holds_room_idx on public.room_holds (room_id);

-- Backfill from the array column. Only statuses that actually hold a room get
-- a row — that is the whole invariant: a row exists exactly while the booking
-- is holding the room, so ROOM_HOLDING_STATUSES stops being a filter that
-- callers must remember to apply.
--
-- `on conflict do nothing` also covers the exclusion constraint, so if the old
-- check-then-act race ever did double-book a room, the later of the two rows
-- is dropped here rather than failing the migration. Check for orphans after
-- running this against real data:
--   select b.booking_reference_id, r.room_number
--     from bookings b cross join lateral unnest(b.assigned_room_ids) as room_id
--     join rooms r on r.id = room_id
--    where b.status in ('APPROVED','OCCUPIED','CANCELLATION_REQUESTED')
--      and not exists (select 1 from room_holds h
--                       where h.booking_id = b.id and h.room_id = room_id);
insert into public.room_holds (booking_id, room_id, during)
select b.id, room_id, tstzrange(b.check_in, b.check_out, '[)')
from public.bookings b
cross join lateral unnest(b.assigned_room_ids) as room_id
where b.status in ('APPROVED', 'OCCUPIED', 'CANCELLATION_REQUESTED')
on conflict do nothing;

-- Dropped rather than kept as a fallback: two sources of truth for the same
-- fact is what this migration exists to remove. Booking.assigned_room_ids
-- still exists in the domain type, derived from room_holds on read.
alter table public.bookings drop column assigned_room_ids;

alter table public.bookings
  add column infants integer not null default 0 check (infants between 0 and 20);

-- ---------------------------------------------------------------- allocation
-- Delete-then-insert in one transaction, so a clash rolls the whole thing back
-- and leaves the booking's existing holds intact. Doing this as two PostgREST
-- calls would drop the old holds before discovering the new ones do not fit.
create or replace function public.set_room_holds(
  p_booking_id uuid,
  p_room_ids   uuid[],
  p_check_in   timestamptz,
  p_check_out  timestamptz
) returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from public.room_holds where booking_id = p_booking_id;
  if array_length(p_room_ids, 1) is null then
    return;
  end if;
  insert into public.room_holds (booking_id, room_id, during)
  select p_booking_id, unnest(p_room_ids), tstzrange(p_check_in, p_check_out, '[)');
end $$;

-- ---------------------------------------------------------------- RLS
alter table public.room_holds enable row level security;

-- Occupancy is public to signed-in users: /availability shows every role which
-- rooms are free. The booking behind a hold is guarded separately.
create policy "room holds are readable"
  on public.room_holds for select to authenticated using (true);

create policy "room holds follow their booking"
  on public.room_holds for all to authenticated
  using (exists (select 1 from public.bookings b
                 where b.id = booking_id and public.can_access_booking(b)))
  with check (exists (select 1 from public.bookings b
                      where b.id = booking_id and public.can_access_booking(b)));

create policy "developer manages room holds"
  on public.room_holds for all to authenticated
  using (public.my_role() = 'developer') with check (public.my_role() = 'developer');
