-- ============================================================================
-- Migration 23 — the per-room occupancy rule becomes a combination
-- ============================================================================
--
-- The office's rule is not two independent caps. A room holds **four people**
-- however they are made up, of whom at most **three** may need a bed:
--
--     3 guests + 1 infant   fits        3 guests + 2 infants   does not
--     2 guests + 2 infants  fits        2 guests + 3 infants   does not
--     1 guest  + 3 infants  fits        1 guest  + 4 infants   does not
--
-- Migration 16's trigger checked `max_guests_per_room` (3) and
-- `max_infants_per_room` (1) separately, which refused 2 guests + 2 infants
-- and 1 guest + 3 infants — two of the combinations the office allows.
--
-- This replaces `check_room_occupancy()` with one that reads a third setting,
-- `rules.capacity.max_occupants_per_room` (default 4), and raises the infant
-- default to 3 so the combined cap is what does the work. Both are read
-- through `rule_int()` (migration 16), so the developer console's Settings
-- still govern.
--
-- Additive and idempotent: it only replaces a function. No row is rewritten,
-- and nothing already stored becomes invalid — the new rule is strictly more
-- permissive in the infant direction and unchanged for guests.
--
-- Safe to re-run.
-- ============================================================================

create or replace function public.check_room_occupancy()
returns trigger language plpgsql as $$
declare
  room_id uuid := coalesce(new.booking_room_id, old.booking_room_id);
  legacy boolean;
  guests integer;
  infants integer;
  max_guests integer := public.rule_int('rules.capacity', array['max_guests_per_room'], 3);
  max_occupants integer := public.rule_int('rules.capacity', array['max_occupants_per_room'], 4);
  -- A stored rules.capacity row with no combined cap was saved before the rule
  -- became a combination, so its max_infants_per_room is the old default of 1 —
  -- a number nobody chose, and one that refuses two of the three combinations
  -- the office allows. Take the current default instead. This is the same
  -- repair `upgradeStoredGroup` in lib/settings.ts applies on read, so the
  -- database and the app cannot disagree; saving capacity once from the console
  -- writes the combined cap and settles it for good.
  combined_saved boolean := exists (
    select 1 from public.app_settings s
     where s.key = 'rules.capacity'
       and jsonb_typeof(s.value) = 'object'
       and s.value ? 'max_occupants_per_room'
  );
  max_infants integer := case
    when combined_saved
      then public.rule_int('rules.capacity', array['max_infants_per_room'], 3)
    else 3
  end;
begin
  if room_id is null then
    return null;
  end if;

  -- Room cards migration 11 synthesised for pre-existing bookings were never
  -- held to the per-room rule, and must not start failing now.
  select r.is_legacy into legacy from public.booking_rooms r where r.id = room_id;
  if coalesce(legacy, false) then
    return null;
  end if;

  select
    count(*) filter (where not g.is_infant),
    count(*) filter (where g.is_infant)
  into guests, infants
  from public.booking_guests g
  where g.booking_room_id = room_id;

  if guests > max_guests then
    raise exception 'A room takes at most % guests (this one has %)', max_guests, guests
      using errcode = 'check_violation';
  end if;
  if infants > max_infants then
    raise exception 'A room takes at most % infant(s) (this one has %)', max_infants, infants
      using errcode = 'check_violation';
  end if;
  if guests + infants > max_occupants then
    raise exception
      'A room takes at most % people in total including infants (this one has % guests and % infant(s))',
      max_occupants, guests, infants
      using errcode = 'check_violation';
  end if;
  return null;
end $$;

comment on function public.check_room_occupancy() is
  'Per-room-card occupancy (lib/occupancy.ts roomPartyError): at most max_guests_per_room needing a bed, at most max_infants_per_room infants, and at most max_occupants_per_room people in all. The third makes the rule a combination — 2 guests + 2 infants fit, 3 guests + 2 infants do not. All three come from rules.capacity in app_settings via rule_int().';
