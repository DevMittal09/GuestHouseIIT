-- ==========================================================================
-- Migration 36 - the meeting of 9 November 2026
--
-- Four things the office decided, and nothing else:
--
--   1. A room carries a **class**: the general inventory, a VIP room only
--      authorised people may be allotted, or a room reserved off-portal and
--      never offered to a booking at all. Hamsanandi A1-A3 are let to faculty
--      for three years; C1 and C2 are the Director's.
--   2. A booking carries the **tariff category** the Guest House Manager put
--      it in - Category I, II or III - decided at allocation and by nobody
--      else.
--   3. A **rate** can be scoped to one of those categories, which is what
--      stops the name on the booking being a second source of truth for
--      money. `resolveTariff` ranks a category above every other qualifier.
--   4. A booking remembers the **dates originally requested** where the desk
--      has since changed them, so a stay cut from ten nights to three is
--      legible as a decision afterwards.
--
-- **Additive, nullable and safe to re-run.** Every column is added with
-- `if not exists` and either a default that matches today's behaviour
-- (`rooms.room_class` = 'general') or a null that reads as "nothing was
-- decided" (`bookings.tariff_category`, the original dates). No row is
-- changed and nothing is backfilled: a booking made before today prices from
-- the uncategorised rate sheet exactly as it did, and every existing room
-- stays in the general inventory until somebody says otherwise.
--
-- Apply this migration before running the updated application.
-- Existing invoices keep their stored snapshots and are not repriced.
--
-- Run order for an existing database:
--
--   psql "$DATABASE_URL" -f scripts/migrations/00000000000036_room_classes_and_tariff_categories.sql
--   npm run seed:reference      -- marks C1/C2 VIP, adds A1-A3 reserved,
--                               -- and writes the Category I/II/III rates
--
-- Use the **session pooler** (port 5432): this runs DDL.
-- ==========================================================================

begin;

-- ---------------------------------------------------------------- 1. rooms
alter table public.rooms
  add column if not exists room_class text not null default 'general';

alter table public.rooms
  add column if not exists reservation_note text;

alter table public.rooms
  add column if not exists reserved_until date;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.rooms'::regclass and conname = 'rooms_room_class_known'
  ) then
    alter table public.rooms
      add constraint rooms_room_class_known
      check (room_class in ('general', 'vip', 'director_only', 'reserved'));
  end if;
end $$;

-- A reservation note or an end date only means something on a reserved room.
-- Not a constraint: the office may well type the note before changing the
-- class, and refusing that would be a form that fights the person filling it
-- in. The application clears both when the class leaves 'reserved'.

-- Every availability query filters on the class, and on a room's guest house
-- at the same time.
create index if not exists rooms_class_idx on public.rooms (guest_house_id, room_class);

-- ------------------------------------------------------------- 2. bookings
alter table public.bookings
  add column if not exists tariff_category text;

alter table public.bookings
  add column if not exists original_check_in timestamptz;

alter table public.bookings
  add column if not exists original_check_out timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.bookings'::regclass and conname = 'bookings_tariff_category_known'
  ) then
    alter table public.bookings
      add constraint bookings_tariff_category_known
      check (tariff_category is null or tariff_category in ('I', 'II', 'III'));
  end if;
end $$;

-- -------------------------------------------------------------- 3. tariffs
alter table public.tariffs
  add column if not exists tariff_category text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.tariffs'::regclass and conname = 'tariffs_tariff_category_known'
  ) then
    alter table public.tariffs
      add constraint tariffs_tariff_category_known
      check (tariff_category is null or tariff_category in ('I', 'II', 'III'));
  end if;
end $$;

-- A category is part of a rate's scope, so two rates differing only by
-- category are two different rates. Without this the office could not publish
-- a Category I and a Category II rate for the same guest house on the same
-- day - which is the whole sheet.
drop index if exists public.tariffs_one_per_scope_and_date;

create unique index tariffs_one_per_scope_and_date on public.tariffs (
  coalesce(guest_house_id, '00000000-0000-0000-0000-000000000000'::uuid),
  item,
  coalesce(room_type, ''),
  coalesce(booking_type, ''),
  coalesce(requester_role, ''),
  coalesce(tariff_category, ''),
  effective_from
);

commit;

-- ==========================================================================
-- Afterwards, check it took:
--
--   select column_name from information_schema.columns
--   where table_name = 'rooms' and column_name = 'room_class';
--
--   select indexdef from pg_indexes
--   where indexname = 'tariffs_one_per_scope_and_date';
--
-- `npm run check:migrations` probes rooms.room_class for this migration and
-- names the index query it cannot see from PostgREST.
-- ==========================================================================
