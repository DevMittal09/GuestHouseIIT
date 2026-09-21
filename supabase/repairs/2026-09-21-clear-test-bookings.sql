-- Clear the test bookings made while the portal was being built (21 Sep 2026).
--
-- **This is a repair, not a migration.** Nothing applies it automatically, it
-- is not idempotent in any useful sense, and it destroys data. Read it, take
-- a backup, and run it deliberately in the SQL editor.
--
-- What it removes and why that is enough:
--
--   * `bookings` is the root. `booking_rooms`, `booking_guests`, `booking_logs`
--     and `room_holds` all reference it `on delete cascade`, so deleting a
--     booking takes its rooms, guests, approval trail and room holds with it.
--     That is also what frees the rooms — a hold row *is* the reservation.
--   * `email_outbox.booking_id` is `on delete set null`, so queued and sent
--     notifications would survive as orphans. They are cleared separately
--     below, because a test booking's mail is test mail.
--
-- What it deliberately leaves alone: profiles, guest houses, rooms, form
-- configs, the console password and the mail templates. Those are
-- configuration, not test data, and re-creating them by hand is the actual
-- work. Uploaded ID documents in the `documents` storage bucket are also left
-- — see the note at the foot.
--
-- ---------------------------------------------------------------------------
-- STEP 1. Look before you delete.
-- ---------------------------------------------------------------------------
-- Run this on its own first. It changes nothing and tells you what STEP 2
-- would remove.

select
  count(*)                                             as bookings,
  min(created_at)::date                                as oldest,
  max(created_at)::date                                as newest,
  count(*) filter (where status = 'OCCUPIED')          as currently_occupied,
  count(*) filter (where check_out > now())            as not_yet_finished
from public.bookings;

select status, count(*) from public.bookings group by status order by 2 desc;

-- ---------------------------------------------------------------------------
-- STEP 2. Delete.
-- ---------------------------------------------------------------------------
-- Pick ONE of the three, delete the others, and run it inside the transaction
-- so a mistake can still be rolled back.

begin;

-- (a) EVERYTHING. Every booking ever made, whatever its state.
delete from public.bookings;

-- (b) Only what was made before a cut-off — use this if real bookings have
--     started arriving and only the earlier ones are tests.
--     Change the date, then uncomment.
-- delete from public.bookings where created_at < timestamptz '2026-09-21 00:00+05:30';

-- (c) Only the seeded demo rows, leaving anything typed in by hand.
-- delete from public.bookings where booking_reference_id like 'IITPKD-GH-2026-DM%';

-- The mail these bookings generated. Queued messages must go too, or the
-- dispatcher will send notifications about bookings that no longer exist.
delete from public.email_outbox
where booking_id is null
   or booking_id not in (select id from public.bookings);

-- Confirm before committing: all three should now be zero (or whatever the
-- variant you chose should leave behind).
select
  (select count(*) from public.bookings)      as bookings_left,
  (select count(*) from public.room_holds)    as holds_left,
  (select count(*) from public.booking_guests) as guests_left;

-- Satisfied? Then:
commit;
-- Not satisfied? Then instead:
-- rollback;

-- ---------------------------------------------------------------------------
-- Afterwards
-- ---------------------------------------------------------------------------
-- * Booking reference numbers are generated per booking and do not run off a
--   sequence, so nothing needs resetting.
-- * Uploaded ID documents stay in the `documents` storage bucket. They are
--   orphaned once their booking is gone and are not reachable from the portal,
--   but they are still someone's identity document — clear the bucket from
--   Storage in the dashboard if this was test data, and leave it if any of it
--   was real.
