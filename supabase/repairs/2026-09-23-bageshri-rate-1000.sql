-- ============================================================================
-- Repair — Bageshri goes to ₹1,000 a room a day (23 Sep 2026)
-- ============================================================================
--
-- NOT a migration. Nothing applies this automatically. Read it, decide, run it.
--
-- WHY: the office raised the Bageshri room rate from ₹750 to ₹1,000 per room
-- per day. `supabase/seed.sql` and migration 19 now seed ₹1,000, so a database
-- created from scratch after this date needs nothing. A database seeded
-- earlier still holds the ₹750 row, and that row is **in force**: the
-- `tariffs_guard` trigger refuses to update or delete it, deliberately, because
-- stays have already been priced with it.
--
-- WHAT IT DOES: inserts a **second** Bageshri room row at ₹1,000, effective
-- from a date you choose. `resolveTariff` (lib/tariffs.ts) then prices every
-- night from that date at ₹1,000 and every earlier night at ₹750, so past
-- stays and invoices keep the rate they were charged. Nothing is overwritten.
--
-- BEFORE YOU RUN IT
--
--   1. Decide the date the new rate starts. It is written twice below as
--      `date '2026-09-23'` — change both. A date in the past re-prices
--      uninvoiced stays that have already happened; today or a future date is
--      usually what the office means.
--   2. Run the SELECT first: if it already shows a ₹1,000 row, this has been
--      applied and there is nothing to do.
--   3. Invoices already issued keep their stored line amounts either way
--      (they are snapshots, not recomputed), so this never rewrites a bill.
--   4. Hamsanandi and the meal rates are untouched.
--
-- Safe to re-run. Idempotent.
-- ============================================================================

-- 1. The Bageshri room rates on file now.
select t.effective_from, t.rate, t.booking_type, t.requester_role, t.note
from public.tariffs t
join public.guest_houses gh on gh.id = t.guest_house_id
where gh.name = 'Bageshri' and t.item = 'room'
order by t.effective_from;

-- 2. Approved or current Bageshri stays that are not yet invoiced, so you know
--    whose bill changes. Compare their dates against the date you pick.
select b.booking_reference_id, b.status, b.check_in, b.check_out
from public.bookings b
join public.guest_houses gh on gh.id = b.guest_house_id
where gh.name = 'Bageshri'
  and b.status in ('APPROVED', 'OCCUPIED', 'CANCELLATION_REQUESTED')
order by b.check_in;

-- 3. The change itself. Uncomment to apply.
-- insert into public.tariffs
--   (guest_house_id, item, room_type, booking_type, requester_role, rate, effective_from, note)
-- select gh.id, 'room', null, null, null, 1000, date '2026-09-23',
--        'Tariff sheet: Bageshri, per room per day (raised from 750)'
--   from public.guest_houses gh
--  where gh.name = 'Bageshri'
--    and not exists (
--      select 1 from public.tariffs t
--       where t.guest_house_id = gh.id
--         and t.item = 'room'
--         and t.room_type is null
--         and t.booking_type is null
--         and t.requester_role is null
--         and t.effective_from = date '2026-09-23'
--    );
