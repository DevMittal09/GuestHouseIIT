-- Migration 14: the Guest House Manager may accept a turnover overlap.
--
-- A room booked "until 12:00" is usually empty by 10:00 — the outgoing guest
-- leaves after breakfast. The portal refused the 10:00 arrival outright, so
-- the desk took it by telephone and the portal stopped describing reality.
--
-- The exclusion constraint that makes double-booking *unrepresentable*
-- (migration 3) is what has to bend, and it must bend by a bounded amount
-- rather than being switched off. So:
--
--   * `override_by` records the manager who accepted the overlap. Null on
--     every ordinary hold, which is almost all of them.
--   * `guard` is the range the exclusion constraint actually compares. It is
--     the hold's true period normally, and the period shrunk by two hours at
--     each end when overridden.
--
-- That single change gives both halves of the rule for free:
--
--   * two ordinary holds still cannot overlap by one second, and
--   * an overridden hold can overlap a neighbour by **at most two hours**,
--     because a three-hour overlap still collides after the shrink and the
--     constraint refuses it.
--
-- `during` stays truthful throughout, so the availability grid and the
-- occupancy reports keep showing when the room is really taken. Only the
-- constraint's opinion changes.
--
-- Apply after migration 13. Safe to re-run.

alter table public.room_holds
  add column if not exists override_by uuid references public.profiles (id) on delete set null,
  add column if not exists guard tstzrange;

comment on column public.room_holds.override_by is
  'The manager who accepted a turnover overlap on this hold. Null on an ordinary hold. See lib/turnover.ts.';
comment on column public.room_holds.guard is
  'What the no-overlap constraint compares: `during` normally, shrunk by two hours at each end when overridden. Maintained by a trigger — never write it directly.';

-- `timestamptz + interval` is only STABLE (adding months depends on the
-- session timezone), so this cannot be a generated column. A trigger can.
create or replace function public.set_room_hold_guard()
returns trigger language plpgsql as $$
declare
  grace constant interval := interval '2 hours';
  lo timestamptz := lower(new.during);
  hi timestamptz := upper(new.during);
  mid timestamptz;
begin
  if new.override_by is null then
    new.guard := new.during;
    return new;
  end if;

  if hi - lo > 2 * grace then
    new.guard := tstzrange(lo + grace, hi - grace, '[)');
  else
    -- A stay shorter than twice the grace would shrink to nothing, and an
    -- empty range overlaps nothing at all — which would turn a bounded
    -- override into an unlimited one. Keep a sliver at the midpoint instead,
    -- so the room is still guarded against a wholly separate booking.
    mid := lo + (hi - lo) / 2;
    new.guard := tstzrange(mid - interval '1 second', mid + interval '1 second', '[)');
  end if;
  return new;
end $$;

drop trigger if exists room_holds_guard on public.room_holds;
create trigger room_holds_guard
  before insert or update of during, override_by on public.room_holds
  for each row execute function public.set_room_hold_guard();

-- Backfill before the constraint moves onto the column, or every existing
-- row would compare a null guard.
update public.room_holds set guard = during where guard is null;
alter table public.room_holds alter column guard set not null;

-- The constraint moves from the true period to the guarded one. Same rule,
-- same protection against a concurrent double allocation; the only holds it
-- now treats differently are the ones a manager explicitly overrode.
alter table public.room_holds drop constraint if exists room_holds_no_overlap;
alter table public.room_holds drop constraint if exists room_holds_no_overlap_guard;
alter table public.room_holds
  add constraint room_holds_no_overlap_guard
    exclude using gist (room_id with =, guard with &&);

-- ---------------------------------------------------------------- allocation

-- `set_room_holds` gains the overridden rooms. Dropped rather than replaced:
-- adding a parameter changes the signature, and `create or replace` would
-- leave the old three-argument version behind as an overload that silently
-- ignores overrides.
drop function if exists public.set_room_holds(uuid, uuid[], timestamptz, timestamptz);
drop function if exists public.set_room_holds(uuid, uuid[], timestamptz, timestamptz, uuid[], uuid);

create function public.set_room_holds(
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
  -- Delete and insert in one transaction: doing it as two PostgREST calls
  -- drops the old holds before finding out the new ones do not fit.
  delete from public.room_holds where booking_id = p_booking_id;

  insert into public.room_holds (booking_id, room_id, during, override_by)
  select
    p_booking_id,
    room_id,
    tstzrange(p_check_in, p_check_out, '[)'),
    case when room_id = any (p_override_room_ids) then p_override_by end
  from unnest(p_room_ids) as room_id;
end $$;

comment on function public.set_room_holds is
  'Replaces a booking''s room holds transactionally. Rooms named in p_override_room_ids are recorded as turnover overrides by p_override_by, which relaxes the no-overlap constraint for those rows by at most two hours — see the guard column.';
