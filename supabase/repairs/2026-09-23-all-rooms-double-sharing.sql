-- ============================================================================
-- Repair — every room becomes double sharing (23 Sep 2026)
-- ============================================================================
--
-- NOT a migration. Nothing applies this automatically. Read it, decide, run it.
--
-- WHY: the office confirmed both guest houses have **only double sharing
-- rooms**. The booking form no longer asks for a room-type preference and the
-- developer console creates doubles, but rows created earlier — including
-- `supabase/seed.sql`'s old B-201..B-210 and H-201..H-208 — are still recorded
-- as `single`. While any single exists:
--
--   * the manager's allocation grid splits into "Double sharing rooms" and
--     "Single rooms" (`splitByType` in components/room-grid.tsx);
--   * a single holds 1 guest, 2 with an extra bed, so allocating one to a
--     three-guest room card is refused (`roomAssignmentError`);
--   * the invoice prices it from the `single` tariff.
--
-- WHAT IT DOES: sets every active room's type to `double_sharing`. Nothing
-- else — no room is created, renamed, deactivated or deleted, and no booking,
-- hold or invoice is touched.
--
-- BEFORE YOU RUN IT
--
--   1. If the institute really does have single rooms, do not run this. Leave
--      them as they are: the portal handles a mixed guest house correctly.
--   2. An **invoice already issued** against a single keeps the amount it was
--      issued with (invoice lines are stored, not recomputed), so this does
--      not rewrite history. A stay that is approved but not yet invoiced will
--      be priced as a double from now on — check the `double_sharing` tariff
--      is the rate the office means to charge for these rooms.
--   3. Run the SELECT first and keep its output: it is the only record of
--      which rooms were singles.
--
-- Safe to re-run. Idempotent.
-- ============================================================================

-- 1. What would change. Keep this.
select gh.name as guest_house, r.id, r.room_number, r.is_active
from public.rooms r
join public.guest_houses gh on gh.id = r.guest_house_id
where r.room_type = 'single'
order by gh.name, r.room_number;

-- 2. Stays that are approved or in progress in one of those rooms, so you know
--    whose bill changes basis. Empty is the comfortable answer.
select b.booking_reference_id, b.status, r.room_number, b.check_in, b.check_out
from public.room_holds h
join public.rooms r on r.id = h.room_id
join public.bookings b on b.id = h.booking_id
where r.room_type = 'single'
order by b.check_in;

-- 3. The change itself. Uncomment to apply.
-- begin;
--   update public.rooms
--      set room_type = 'double_sharing'
--    where room_type = 'single';
--   -- `total_rooms` counts active rooms and is unaffected by the type, so
--   -- there is nothing to recount.
-- commit;
