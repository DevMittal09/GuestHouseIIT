-- ============================================================================
-- Migration 35 - the tariff category the Guest House Manager approved under
-- ============================================================================
--
-- 31 October 2026, the owner: the New Booking page's tariff table becomes
-- read-only and "the final authority for determining the applicable tariff
-- category must rest with the GHM", whose choice is what the invoice is
-- priced from.
--
-- Until now a booking's rates were resolved from the booking's own facts -
-- its guest house, the kind of booking and the requester's role
-- (lib/tariffs.ts `resolveTariff`). Two of those three the requester answered
-- on the form, so a requester chose, in effect, which published rate they
-- would be charged at. The office's sheet prices Hamsanandi's rooms at one
-- rate generally and another "for government officers": which of them a
-- visit falls under is a judgement about the visit, and it is the desk's.
--
--   * `tariff_booking_type` / `tariff_requester_role` are the two dimensions
--     of a tariff's scope that the desk decides. Together they are the
--     category. The guest house is settled by then (the rooms are in it) and
--     the room type is the room the party was actually given, so neither is
--     anybody's choice and neither is stored here.
--
-- **These are not facts about the requester.** `tariff_requester_role` is the
-- role whose *rate* applies - which is how an ordinary employee's visitor is
-- charged the office's government-officer rate. Who asked is still
-- `user_role` and what kind of stay it is is still `booking_type`; the
-- approval route, the debitable heads and every scoping rule read those two
-- and must go on reading those two.
--
-- **There is deliberately no rate column.** A stay crossing a rate change is
-- priced night by night, so one stored figure would be wrong for it; and a
-- rupee amount on the booking would be a second source of truth for money
-- the moment the office published a new row. The price stands in two places
-- that cannot drift: the booking's log, which records what the category
-- stood at on the day it was chosen, and the issued invoice's snapshot,
-- which is what was actually charged.
--
-- Nothing is backfilled. A booking approved before today had no category
-- chosen for it, and inventing one would be exactly the "default tariff" this
-- change exists to rule out: `pricingScopeFor` prices such a booking from its
-- own facts, which is what every invoice in the portal was priced at until
-- now, and its invoice prints no category line.
--
-- Additive, nullable and safe to re-run. Until it is applied the store names
-- the columns only on an approval that carried a category, so nothing that
-- worked before stops working - only the Guest House Manager's approval is
-- refused, with "column does not exist" in the log.

alter table public.bookings
  add column if not exists tariff_booking_type text,
  add column if not exists tariff_requester_role text;

-- The same vocabulary as `tariffs.booking_type` / `tariffs.requester_role`,
-- because the category *is* a scope on that table: a value these checks would
-- refuse could never resolve a rate.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'bookings_tariff_booking_type_check'
  ) then
    alter table public.bookings
      add constraint bookings_tariff_booking_type_check
      check (tariff_booking_type is null
             or tariff_booking_type in ('official', 'personal', 'alumni'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'bookings_tariff_requester_role_check'
  ) then
    alter table public.bookings
      add constraint bookings_tariff_requester_role_check
      check (tariff_requester_role is null
             or tariff_requester_role in (
               'student', 'employee', 'official', 'club', 'alumni',
               'iar_cell', 'iar_student_cell', 'gh_manager'));
  end if;

  -- Half a category prices nothing: a row with one of the two set would send
  -- `pricingScopeFor` back to the booking's own facts while reading, to
  -- anyone looking at the table, as though a decision had been recorded.
  if not exists (
    select 1 from pg_constraint where conname = 'bookings_tariff_category_pair'
  ) then
    alter table public.bookings
      add constraint bookings_tariff_category_pair
      check ((tariff_booking_type is null) = (tariff_requester_role is null));
  end if;
end $$;

comment on column public.bookings.tariff_booking_type is
  'The booking type whose RATE applies, as chosen by the Guest House Manager when they approved it (migration 35). Not the kind of booking - that is booking_type. Null on bookings approved before 31 Oct 2026, which are priced from their own facts.';

comment on column public.bookings.tariff_requester_role is
  'The requester role whose RATE applies, as chosen by the Guest House Manager when they approved it (migration 35). Not who booked - that is user_role. Set with tariff_booking_type or not at all.';
