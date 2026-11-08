-- ==========================================================================
-- IIT Palakkad Guest House Portal - the office's own reference data
--
-- Run this AFTER scripts/init-postgres.sql (which builds the schema) and
-- BEFORE or after `npm run seed:personas` (which fills the accounts):
--
--   psql "$DATABASE_URL" -f scripts/init-postgres.sql
--   psql "$DATABASE_URL" -f scripts/seed-reference-data.sql   -- or npm run seed:reference
--   npm run seed:personas
--
-- It holds the three things the office owns and no seeder used to write into
-- PostgreSQL: the two guest houses, their rooms, and **the tariff sheet**.
-- Until 8 Nov 2026 the rate sheet lived in init-postgres.sql, where the room
-- rows were written as
--   (select id from guest_houses where name = 'Bageshri')
-- and filtered out by `where (s.item <> 'room' or s.gh is not null)`. The
-- guest houses were created by supabase/seed.sql, which ran *afterwards* - and
-- which no longer exists at all - so on every direct-PostgreSQL install those
-- three subselects were NULL and **every room rate was silently skipped**.
-- A database then held the nine meal rates and no room rate, the booking
-- form's tariff panel read "no rates published", and no invoice could be
-- issued. That is why this file creates the guest houses first.
--
-- Every statement is idempotent and additive:
--   * guest houses are matched by their fixed ids;
--   * rooms are written only into a guest house that has none at all, so an
--     inventory the office has edited by hand is never touched;
--   * a tariff row is written only where no row with the same scope and the
--     same effective_from exists. `tariffs_guard` refuses an UPDATE or a
--     DELETE of a rate already in force, so this file only ever inserts.
-- ==========================================================================

begin;

-- ---- The two guest houses (Bageshri has no kitchen; Hamsanandi serves) ----
-- Fixed ids, shared with the mock store's seed and the hosted project the
-- rates were taken from, so an export can be moved between them.
insert into public.guest_houses (id, name, total_rooms, serves_meals)
values
  ('22222222-2222-2222-2222-222222222201', 'Bageshri',   10, false),
  ('22222222-2222-2222-2222-222222222202', 'Hamsanandi', 13, true)
on conflict (id) do nothing;

-- ---- The rooms the office actually has (23 Sep 2026) ----
-- The same lists as BAGESHRI_ROOM_NUMBERS / HAMSANANDI_ROOM_NUMBERS in
-- lib/store/seed.ts - keep the three in step. Bageshri numbers by floor and
-- skips 205, 301 and 304; Hamsanandi is four blocks and only A4 exists in A.
-- Both guest houses are all double sharing. `rooms_recount_total` keeps
-- guest_houses.total_rooms right, so nothing sets it by hand.
insert into public.rooms (guest_house_id, room_number, room_type)
select '22222222-2222-2222-2222-222222222201'::uuid, n, 'double_sharing'
from unnest(array['201','202','203','204','206','302','303','305','306','307']) as n
where not exists (
  select 1 from public.rooms
  where guest_house_id = '22222222-2222-2222-2222-222222222201'::uuid
);

insert into public.rooms (guest_house_id, room_number, room_type)
select '22222222-2222-2222-2222-222222222202'::uuid, n, 'double_sharing'
from unnest(array['A4','B1','B2','B3','B4','C1','C2','C3','C4','D1','D2','D3','D4']) as n
where not exists (
  select 1 from public.rooms
  where guest_house_id = '22222222-2222-2222-2222-222222222202'::uuid
);

-- ---- The tariff sheet ----
-- Effective-dated rows (migration 19). `resolveTariff` takes the most
-- specific row in force on the night being charged - guest house (8) >
-- requester role (4) > booking type (2) > room type (1) - and, between rows
-- of equal specificity, the latest effective_from. So a later row never has
-- to repeat a scope an earlier one already covers, and an older row is left
-- in place as the record of what past stays were priced with.
--
-- Three generations, all kept:
--   2024-01-01  the sheet the portal was built with (meals, and the first
--               room rates)
--   2026-09-23  Bageshri raised from 750 to 1,000
--   2026-11-05  the office's Category I / II / III sheet, which is what is
--               charged today
insert into public.tariffs (guest_house_id, item, room_type, booking_type, requester_role, rate, effective_from, note)
select s.gh, s.item, null, s.booking_type, s.requester_role, s.rate, s.effective_from, s.note
from (
  values
    -- Meals, per head. No guest house: only a kitchen can sell them, and the
    -- invoice prints no dining section where there is none.
    (null::uuid, 'breakfast', null::text, null::text,  80::numeric, date '2024-01-01', 'Tariff sheet: per head'),
    (null,       'lunch',     null,       null,       120,          date '2024-01-01', 'Tariff sheet: per head'),
    (null,       'dinner',    null,       null,       100,          date '2024-01-01', 'Tariff sheet: per head'),
    (null,       'breakfast', null,       'student',    0,          date '2024-01-01', 'Tariff sheet: meals free to students'),
    (null,       'lunch',     null,       'student',    0,          date '2024-01-01', 'Tariff sheet: meals free to students'),
    (null,       'dinner',    null,       'student',    0,          date '2024-01-01', 'Tariff sheet: meals free to students'),
    (null,       'breakfast', 'alumni',   null,         0,          date '2024-01-01', 'Tariff sheet: meals free to alumni'),
    (null,       'lunch',     'alumni',   null,         0,          date '2024-01-01', 'Tariff sheet: meals free to alumni'),
    (null,       'dinner',    'alumni',   null,         0,          date '2024-01-01', 'Tariff sheet: meals free to alumni'),

    -- The room rates the portal was built with, superseded below but kept.
    ('22222222-2222-2222-2222-222222222201', 'room', null, null,       750,  date '2024-01-01', 'Tariff sheet: Bageshri, per room per day'),
    ('22222222-2222-2222-2222-222222222202', 'room', null, null,      2000,  date '2024-01-01', 'Tariff sheet: Hamsanandi types 1 and 2'),
    ('22222222-2222-2222-2222-222222222202', 'room', null, 'official',4000,  date '2024-01-01', 'Tariff sheet: Hamsanandi type 3, government officers'),
    ('22222222-2222-2222-2222-222222222201', 'room', null, null,      1000,  date '2026-09-23', 'Tariff sheet: Bageshri, per room per day (raised from 750)'),

    -- Category I - guests and relatives of employees, parents of students on
    -- a personal visit. The unscoped row is the floor; the `official`
    -- requester row exists to outrank the 4,000 row of 2024-01-01, which has
    -- the same specificity and would otherwise still win for that role.
    ('22222222-2222-2222-2222-222222222201', 'room', null,       null,       1000, date '2026-11-05', 'Category I: guests and relatives of employees, parents of students on a personal visit'),
    ('22222222-2222-2222-2222-222222222201', 'room', null,       'official', 1000, date '2026-11-05', 'Category I: guests and relatives of employees, parents of students on a personal visit'),
    ('22222222-2222-2222-2222-222222222202', 'room', null,       null,       1500, date '2026-11-05', 'Category I: guests and relatives of employees, parents of students on a personal visit'),
    ('22222222-2222-2222-2222-222222222202', 'room', null,       'official', 1500, date '2026-11-05', 'Category I: guests and relatives of employees, parents of students on a personal visit'),

    -- Category II - institute guests on official duty: ministers, directors,
    -- BOG, selection committees, external examiners, official guests.
    ('22222222-2222-2222-2222-222222222201', 'room', 'official', null,       1500, date '2026-11-05', 'Category II: institute guests on official duty - ministers, directors, BOG, selection committees, external examiners, official guests'),
    ('22222222-2222-2222-2222-222222222201', 'room', 'official', 'official', 1500, date '2026-11-05', 'Category II: institute guests on official duty - ministers, directors, BOG, selection committees, external examiners, official guests'),
    ('22222222-2222-2222-2222-222222222202', 'room', 'official', null,       2000, date '2026-11-05', 'Category II: institute guests on official duty - ministers, directors, BOG, selection committees, external examiners, official guests'),
    ('22222222-2222-2222-2222-222222222202', 'room', 'official', 'official', 2000, date '2026-11-05', 'Category II: institute guests on official duty - ministers, directors, BOG, selection committees, external examiners, official guests'),

    -- Category III - academic visitors. An `employee` on an official booking.
    ('22222222-2222-2222-2222-222222222201', 'room', 'official', 'employee', 2000, date '2026-11-05', 'Category III: academic visitors'),
    ('22222222-2222-2222-2222-222222222202', 'room', 'official', 'employee', 2500, date '2026-11-05', 'Category III: academic visitors')
) as s(gh, item, booking_type, requester_role, rate, effective_from, note)
where (s.gh is null or exists (select 1 from public.guest_houses g where g.id = s.gh))
  and not exists (
    select 1 from public.tariffs t
    where t.guest_house_id is not distinct from s.gh
      and t.item = s.item
      and t.room_type is null
      and t.booking_type is not distinct from s.booking_type
      and t.requester_role is not distinct from s.requester_role
      and t.effective_from = s.effective_from
  );

commit;

-- ==========================================================================
-- There is deliberately **no extra_bed rate**: the office has never sent one,
-- and `resolveTariff` returning null is reported as a problem rather than
-- printed as a zero, so an invoice for a stay with an extra bed cannot be
-- issued until the office supplies the figure and the manager adds it at
-- Console -> Tariffs & Invoicing. See .memories/04-production.md section 3.
-- ==========================================================================
