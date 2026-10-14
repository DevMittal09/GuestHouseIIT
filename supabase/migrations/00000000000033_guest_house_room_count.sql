-- ============================================================================
-- Migration 33 - `guest_houses.total_rooms` keeps itself (14 Oct 2026)
-- ============================================================================
--
-- The one genuine normalization defect the schema review of 13 Oct 2026 found
-- and did not fix. It was recorded in `.memories/21-database.md` under
-- "Normalization - the review of 13 Oct 2026" and left out of migration 31
-- deliberately, because a derived-value trigger has nothing to do with closing
-- an authentication hole and the two would have had to be rolled back
-- together.
--
-- THE DEFECT
--
-- `total_rooms` is a **stored derived value**: it is `count(*)` over the
-- guest house's active rooms, and nothing but application code maintained it.
-- `SupabaseStore.recountRooms()` recomputes and writes it after every room
-- the console adds, edits or removes - which is correct, and is also the whole
-- of the enforcement. So:
--
--   * a room inserted, deactivated or deleted by SQL - a repair script, a
--     bulk load, the dashboard's table editor - leaves the count stale;
--   * two consoles adding a room at the same moment can both read the old
--     count;
--   * and nothing anywhere says the value is wrong, because a count has no
--     way to look wrong.
--
-- That is an update anomaly in the textbook sense: one fact (how many rooms a
-- guest house has) stored in two places, with only one of them guarded.
--
-- WHY NOT DROP THE COLUMN INSTEAD
--
-- Dropping it and counting on read would be the stricter normalization, and it
-- was rejected: `GuestHouse.total_rooms` is in `lib/types.ts` and is read by
-- `/manager` and `/caretaker` to label each guest house, the mock store seeds
-- it, and both stores hydrate it. Removing it is a change to the application's
-- domain type to fix a problem a trigger closes completely. The column stays;
-- the database now maintains it.
--
-- WHAT THIS DOES
--
--   * `public.recount_guest_house_rooms()` recomputes the count for the guest
--     house or houses a row touched, and
--   * one row-level `after insert or update or delete` trigger on
--     `public.rooms` calls it.
--
-- `OLD` and `NEW` are both handled, so a room **moved** between guest houses
-- recounts the one it left as well as the one it joined. `is_active` is part
-- of the count, so deactivating a room is a change like any other.
--
-- The application's own `recountRooms()` is left in place. It is not
-- redundant: the mock store has no triggers and needs it, and in Supabase mode
-- it now writes the same number the trigger has already written, which costs
-- one statement and keeps the console working against a database that has not
-- had this migration applied.
--
-- Additive, and **optional**: no application code requires it. It changes no
-- column and no row's meaning, only brings existing counts into line with the
-- rooms. Idempotent and safe to re-run.
--
-- ROLLBACK
--   drop trigger if exists rooms_recount_total on public.rooms;
--   drop function if exists public.recount_guest_house_rooms();
-- Nothing else has to be undone - the counts it corrected were simply wrong.
-- ============================================================================

create or replace function public.recount_guest_house_rooms()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- A room that moved between guest houses changes two counts, so both ends
  -- are recounted and the `is distinct from` keeps the common case to one
  -- update.
  if tg_op in ('UPDATE', 'DELETE') and old.guest_house_id is not null then
    update public.guest_houses g
       set total_rooms = (
             select count(*)
               from public.rooms r
              where r.guest_house_id = old.guest_house_id
                and r.is_active
           )
     where g.id = old.guest_house_id;
  end if;

  if tg_op in ('INSERT', 'UPDATE') and new.guest_house_id is not null then
    if tg_op = 'INSERT' or new.guest_house_id is distinct from old.guest_house_id
       or new.is_active is distinct from old.is_active then
      update public.guest_houses g
         set total_rooms = (
               select count(*)
                 from public.rooms r
                where r.guest_house_id = new.guest_house_id
                  and r.is_active
             )
       where g.id = new.guest_house_id;
    end if;
  end if;

  return null; -- after trigger: the return value is ignored
end;
$$;

comment on function public.recount_guest_house_rooms() is
  'Keeps guest_houses.total_rooms equal to the number of active rooms (migration 33). The column is a stored derived value; before this trigger only application code maintained it, so a room added or deactivated by SQL left the count stale.';

drop trigger if exists rooms_recount_total on public.rooms;
create trigger rooms_recount_total
  after insert or update or delete on public.rooms
  for each row execute function public.recount_guest_house_rooms();

-- Bring every existing count into line, once. This is the only row-changing
-- statement in the file, and it can only replace a wrong count with the right
-- one.
update public.guest_houses g
   set total_rooms = coalesce(
         (select count(*) from public.rooms r
           where r.guest_house_id = g.id and r.is_active),
         0
       )
 where g.total_rooms is distinct from coalesce(
         (select count(*) from public.rooms r
           where r.guest_house_id = g.id and r.is_active),
         0
       );

comment on column public.guest_houses.total_rooms is
  'Number of active rooms. Derived, and maintained by the rooms_recount_total trigger since migration 33 - do not set it by hand.';
