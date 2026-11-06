-- ============================================================================
-- Repair — the real room numbers replace the dummy ones (23 Sep 2026)
-- ============================================================================
--
-- NOT a migration. Nothing applies this automatically. Read it, decide, run it.
--
-- WHY: `supabase/seed.sql` used to invent 20 Bageshri rooms (B-101..B-120) and
-- 16 Hamsanandi rooms (H-101..H-116) so the demo had a grid to look at. The
-- office has since given the real list:
--
--   Bageshri (10):    201 202 203 204 206  302 303 305 306 307
--   Hamsanandi (13):  A4  B1 B2 B3 B4  C1 C2 C3 C4  D1 D2 D3 D4
--
-- The seed now creates exactly these, so a database created from scratch after
-- this date needs nothing. A database seeded earlier still holds the dummies.
--
-- WHAT IT DOES
--
--   * creates any of the real rooms that are missing, as `double_sharing`;
--   * **deletes** a dummy room that no booking, hold, maintenance block or
--     invoice has ever touched;
--   * **deactivates** (never deletes) a dummy room that something references,
--     so its history stays readable — the allocation grid stops offering it
--     and the stays it held still name it;
--   * recounts `guest_houses.total_rooms` from the active rooms, the way the
--     developer console does.
--
-- BEFORE YOU RUN IT
--
--   1. If a dummy number is in fact a real room under another name, rename it
--      instead (`update public.rooms set room_number = '203' where ...`) so
--      its bookings follow it. Do that first, then run this.
--   2. Step 2 lists the dummy rooms currently holding a stay. Those bookings
--      keep their rooms; the desk should re-allot them to a real room from the
--      manager's console afterwards, or the guests arrive to a room number
--      that is not on any door.
--   3. This does not touch prices. The Bageshri rate is
--      supabase/repairs/2026-09-23-bageshri-rate-1000.sql.
--
-- Safe to re-run. Idempotent.
-- ============================================================================

-- 1. What is there now.
select gh.name as guest_house, r.room_number, r.room_type, r.is_active
from public.rooms r
join public.guest_houses gh on gh.id = r.guest_house_id
order by gh.name, r.room_number;

-- 2. Dummy rooms that something references — these will be deactivated, not
--    deleted. Keep this output: it is the list the desk has to re-allot.
select gh.name as guest_house, r.room_number, b.booking_reference_id, b.status,
       b.check_in, b.check_out
from public.rooms r
join public.guest_houses gh on gh.id = r.guest_house_id
left join public.room_holds h on h.room_id = r.id
left join public.bookings b on b.id = h.booking_id
where (gh.name = 'Bageshri'
         and r.room_number <> all (array['201','202','203','204','206','302','303','305','306','307']))
   or (gh.name = 'Hamsanandi'
         and r.room_number <> all (array['A4','B1','B2','B3','B4','C1','C2','C3','C4','D1','D2','D3','D4']))
order by gh.name, r.room_number;

-- 3. The change itself. Uncomment to apply.
-- begin;
--
--   -- 3a. Create the real rooms that are missing.
--   insert into public.rooms (guest_house_id, room_number, room_type)
--   select gh.id, n, 'double_sharing'::public.room_type
--     from public.guest_houses gh,
--          unnest(array['201','202','203','204','206','302','303','305','306','307']) n
--    where gh.name = 'Bageshri'
--   on conflict do nothing;
--
--   insert into public.rooms (guest_house_id, room_number, room_type)
--   select gh.id, n, 'double_sharing'::public.room_type
--     from public.guest_houses gh,
--          unnest(array['A4','B1','B2','B3','B4','C1','C2','C3','C4','D1','D2','D3','D4']) n
--    where gh.name = 'Hamsanandi'
--   on conflict do nothing;
--
--   -- 3b. Every room that is not on the office's list.
--   create temporary table _dummy_rooms on commit drop as
--   select r.id
--     from public.rooms r
--     join public.guest_houses gh on gh.id = r.guest_house_id
--    where (gh.name = 'Bageshri'
--             and r.room_number <> all (array['201','202','203','204','206','302','303','305','306','307']))
--       or (gh.name = 'Hamsanandi'
--             and r.room_number <> all (array['A4','B1','B2','B3','B4','C1','C2','C3','C4','D1','D2','D3','D4']));
--
--   -- 3c. Deactivate the ones something references.
--   update public.rooms r
--      set is_active = false
--    where r.id in (select id from _dummy_rooms)
--      and (exists (select 1 from public.room_holds h where h.room_id = r.id)
--        or exists (select 1 from public.booking_rooms br where br.assigned_room_id = r.id)
--        or exists (select 1 from public.room_blocks rb where rb.room_id = r.id));
--
--   -- 3d. Delete the ones nothing references. `room_holds`, `booking_rooms`
--   --     and `room_blocks` all cascade from `rooms`, so this order matters:
--   --     3c has already spared every room that would lose history here.
--   delete from public.rooms r
--    where r.id in (select id from _dummy_rooms)
--      and r.is_active;
--
--   -- 3e. Recount, as the console does on every room change.
--   update public.guest_houses gh
--      set total_rooms = (select count(*) from public.rooms r
--                          where r.guest_house_id = gh.id and r.is_active);
--
-- commit;
