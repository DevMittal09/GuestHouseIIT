-- Migration 17: a turnaround buffer between bookings of the same room
-- (Sep 2026).
--
-- Meeting note: "±4 hr buffer for bookings". Implemented as a minimum gap
-- between one stay's check-out and the next check-in on the same room, so
-- housekeeping has time to turn the room round. Default 4 hours, configurable
-- in the developer console (Settings → `rules.booking.buffer_minutes`), 0
-- turns it off.
--
-- Only the END of a hold is padded: [check_in, check_out + buffer). Padding
-- both ends would make the real gap between two stays twice the buffer.
--
-- The padding goes into `room_holds.guard`, the range the exclusion
-- constraint compares since migration 14 — not into `during`, which stays the
-- truthful stay so the availability grid, the reports and the invoice read
-- when the guest was actually there. The exclusion constraint stays the only
-- clash check:
--
--   ordinary hold:   guard = [check_in,                      check_out + buffer)
--   overridden hold: guard = [check_in + 2 h + buffer,        check_out − 2 h)
--
-- The overridden form keeps migration 14's promise exactly: a turnover the
-- manager accepts may overlap a neighbour by at most two hours, buffer or no
-- buffer. (Shifting only the start by the buffer is what lets an accepted
-- overlap clear the previous stay's padded end.) A stay too short for that
-- keeps a sliver at its midpoint, as before, so an override is never
-- unlimited.
--
-- Applying this:
--
--   1. Lists every pair of holds that would clash under the buffer and STOPS
--      with a readable error naming them, rather than dropping anything. To
--      apply anyway, set a smaller buffer first —
--        insert into app_settings (key, value)
--        values ('rules.booking', '{"buffer_minutes": 0}')
--        on conflict (key) do update
--          set value = app_settings.value || '{"buffer_minutes": 0}';
--      — run this again, and raise the buffer from the console once the
--      listed stays are sorted out (the console refuses a buffer that clashes,
--      listing the stays, in the same way).
--   2. Makes the no-overlap constraint DEFERRABLE INITIALLY IMMEDIATE, so a
--      rebuild can move many holds and be checked once, at commit. Every
--      ordinary statement is still checked immediately, exactly as before.
--   3. Rebuilds every hold through set_room_holds(), inside one statement, so
--      it applies entirely or not at all.
--
-- `set_booking_buffer(minutes)` does 1–3 again when the setting is changed
-- later, and saves the setting in the same transaction.
--
-- Apply after migration 16. Safe to re-run.

-- ---------------------------------------------------------------- the guard

-- The guard for a hold, as a pure function of its period, whether it is an
-- accepted turnover, and the buffer. One definition, used by the trigger, the
-- preflight and set_booking_buffer(), so they cannot disagree.
create or replace function public.room_hold_guard(
  p_during tstzrange,
  p_overridden boolean,
  p_buffer interval
)
returns tstzrange
language plpgsql
immutable
as $$
declare
  grace constant interval := interval '2 hours';
  lo timestamptz := lower(p_during);
  hi timestamptz := upper(p_during);
  mid timestamptz;
begin
  if not p_overridden then
    return tstzrange(lo, hi + p_buffer, '[)');
  end if;
  if (hi - grace) - (lo + grace + p_buffer) > interval '0' then
    return tstzrange(lo + grace + p_buffer, hi - grace, '[)');
  end if;
  -- Too short to shrink: a two-second sliver at the midpoint still collides
  -- with any wholly separate booking of the room, so the override stays
  -- bounded.
  mid := lo + (hi - lo) / 2;
  return tstzrange(mid - interval '1 second', mid + interval '1 second', '[)');
end $$;

comment on function public.room_hold_guard(tstzrange, boolean, interval) is
  'What the no-overlap constraint compares for a hold: [check_in, check_out + buffer) normally; [check_in + 2h + buffer, check_out - 2h) for a manager-accepted turnover. See lib/turnover.ts, which computes the same ranges.';

-- The buffer in force, from Settings (lib/settings.ts), default 4 hours.
create or replace function public.booking_buffer()
returns interval
language sql
stable
set search_path = public
as $$
  select make_interval(mins => public.rule_int('rules.booking', array['buffer_minutes'], 240))
$$;

create or replace function public.set_room_hold_guard()
returns trigger language plpgsql as $$
begin
  new.guard := public.room_hold_guard(new.during, new.override_by is not null, public.booking_buffer());
  return new;
end $$;

-- Recreated so it also fires on a direct write to `guard`, which must never
-- stick: the column is derived.
drop trigger if exists room_holds_guard on public.room_holds;
create trigger room_holds_guard
  before insert or update of during, override_by, guard on public.room_holds
  for each row execute function public.set_room_hold_guard();

-- ------------------------------------------------------------ the preflight

-- Every pair of holds on the same room whose guards would overlap under a
-- buffer: what applying it would break. Readable, one line per pair.
create or replace function public.buffer_clashes(p_buffer interval)
returns table (room text, first_booking text, first_stay text, second_booking text, second_stay text)
language sql
stable
set search_path = public
as $$
  select
    coalesce(r.room_number, a.room_id::text),
    coalesce(ba.booking_reference_id, a.booking_id::text),
    to_char(lower(a.during) at time zone 'Asia/Kolkata', 'DD Mon YYYY HH24:MI') || ' → ' ||
      to_char(upper(a.during) at time zone 'Asia/Kolkata', 'DD Mon YYYY HH24:MI'),
    coalesce(bb.booking_reference_id, b.booking_id::text),
    to_char(lower(b.during) at time zone 'Asia/Kolkata', 'DD Mon YYYY HH24:MI') || ' → ' ||
      to_char(upper(b.during) at time zone 'Asia/Kolkata', 'DD Mon YYYY HH24:MI')
  from public.room_holds a
  join public.room_holds b
    on b.room_id = a.room_id
   and b.booking_id <> a.booking_id
   and lower(b.during) >= lower(a.during)
   and (lower(b.during), b.booking_id) > (lower(a.during), a.booking_id)
  left join public.rooms r on r.id = a.room_id
  left join public.bookings ba on ba.id = a.booking_id
  left join public.bookings bb on bb.id = b.booking_id
  where public.room_hold_guard(a.during, a.override_by is not null, p_buffer)
     && public.room_hold_guard(b.during, b.override_by is not null, p_buffer)
  order by 1, 2
$$;

comment on function public.buffer_clashes(interval) is
  'Pairs of room holds that would clash under this turnaround buffer. Empty means the buffer can be applied.';

-- Rebuild every hold's guard through set_room_holds(), booking by booking.
-- The caller must have deferred the constraint: the order bookings are
-- visited in would otherwise matter.
create or replace function public.rebuild_room_holds()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  rec record;
  n integer := 0;
begin
  for rec in
    select
      booking_id,
      array_agg(room_id order by room_id) as rooms,
      coalesce(array_agg(room_id order by room_id) filter (where override_by is not null), '{}') as overridden,
      min(override_by::text)::uuid as override_by,
      -- A booking's holds share one period (set_room_holds writes them together).
      min(lower(during)) as check_in,
      max(upper(during)) as check_out
    from public.room_holds
    group by booking_id
  loop
    perform public.set_room_holds(
      rec.booking_id, rec.rooms, rec.check_in, rec.check_out, rec.overridden, rec.override_by
    );
    n := n + 1;
  end loop;
  return n;
end $$;

-- --------------------------------------------------------- apply it, atomically

do $$
declare
  buffer interval := public.booking_buffer();
  clash record;
  listing text := '';
  total integer := 0;
begin
  for clash in select * from public.buffer_clashes(buffer) loop
    total := total + 1;
    if total <= 20 then
      listing := listing || format(E'\n  %s: %s (%s) and %s (%s)',
        clash.room, clash.first_booking, clash.first_stay, clash.second_booking, clash.second_stay);
    end if;
  end loop;

  if total > 0 then
    raise exception using
      message = format('Migration 17 stopped: %s pair(s) of existing bookings would break the %s turnaround buffer, and nothing was changed.%s%s',
        total, buffer, listing, case when total > 20 then E'\n  …' else '' end),
      hint = 'Move or reallocate those stays, or set a smaller buffer first (see the header of 00000000000017_turnaround_buffer.sql) and run this again.';
  end if;

  -- Deferrable, so the rebuild below is checked once, at the end.
  alter table public.room_holds drop constraint if exists room_holds_no_overlap_guard;
  alter table public.room_holds
    add constraint room_holds_no_overlap_guard
      exclude using gist (room_id with =, guard with &&)
      deferrable initially immediate;
  set constraints public.room_holds_no_overlap_guard deferred;

  perform public.rebuild_room_holds();
end $$;

-- ------------------------------------------------ changing the buffer later

-- Called by the console when the setting changes. Refuses — listing the
-- clashes — when the new buffer would break existing bookings; otherwise
-- saves it and rebuilds every hold in the same transaction.
create or replace function public.set_booking_buffer(p_minutes integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  buffer interval;
  clash record;
  listing text := '';
  total integer := 0;
begin
  if p_minutes is null or p_minutes < 0 or p_minutes > 1440 then
    raise exception 'The turnaround buffer must be between 0 and 1440 minutes (asked for %)', p_minutes;
  end if;
  buffer := make_interval(mins => p_minutes);

  for clash in select * from public.buffer_clashes(buffer) loop
    total := total + 1;
    if total <= 10 then
      listing := listing || format('%s%s: %s and %s', case when total > 1 then '; ' else '' end,
        clash.room, clash.first_booking, clash.second_booking);
    end if;
  end loop;
  if total > 0 then
    raise exception using
      errcode = 'P0001',
      message = format('BUFFER_CLASH|%s|%s%s', total, listing, case when total > 10 then '; …' else '' end);
  end if;

  insert into public.app_settings (key, value)
  values ('rules.booking', jsonb_build_object('buffer_minutes', p_minutes))
  on conflict (key) do update
    set value = case
      when jsonb_typeof(public.app_settings.value) = 'object'
        then public.app_settings.value || jsonb_build_object('buffer_minutes', p_minutes)
      else jsonb_build_object('buffer_minutes', p_minutes)
    end,
    updated_at = now();

  set constraints public.room_holds_no_overlap_guard deferred;
  return public.rebuild_room_holds();
end $$;

comment on function public.set_booking_buffer(integer) is
  'Changes the turnaround buffer: refuses with BUFFER_CLASH|count|listing when existing holds would clash, otherwise saves rules.booking.buffer_minutes and rebuilds every hold, atomically.';

revoke execute on function public.set_booking_buffer(integer) from public, anon, authenticated;
revoke execute on function public.rebuild_room_holds() from public, anon, authenticated;
