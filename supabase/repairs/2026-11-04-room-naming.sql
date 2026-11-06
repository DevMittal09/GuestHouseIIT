-- ============================================================================
-- Repair - the room naming convention of 4 Nov 2026, and Categories I-III
-- ============================================================================
--
-- NOT a migration. Nothing applies this automatically. Read it, decide, run it.
--
-- WHY: the owner's sixteenth list (4 Nov 2026) names the rooms
--
--   Bageshri (10):    B1 B2 B3 B4 B5 B6 B7 B8 B9 B10
--   Hamsanandi (10):  A1 A2 A3 A4  C1 C2 (the VIP rooms)  D1 D2 D3 D4
--
-- where the 23 Sep 2026 list had Bageshri 201-307 and Hamsanandi A4, B1-B4,
-- C1-C4, D1-D4. `supabase/seed.sql` now creates the new names, so a database
-- created from scratch needs nothing.
--
-- A rename keeps the room's id, so every booking, hold, block and invoice
-- that names a room follows it. Nothing is deleted.
--
-- PART 1 - Bageshri. Ten rooms to ten names, in floor order. Safe.
-- PART 2 - Hamsanandi. **The office has not said which old room becomes which
--          new one**: thirteen rooms become ten. The mapping below is a
--          guess (B1-B3 -> A1-A3; B4, C3 and C4 deactivated) and is
--          commented out. Confirm it with the Guest House Office first.
-- PART 3 - the tariff. Categories I-III, in force from TODAY, institute time
--          (the owner, 5 Nov 2026). A rate in force can never be changed or
--          removed (`tariffLockedError`, trigger `tariffs_guard`), so CHECK
--          THE FIGURES BEFORE RUNNING THIS. The console refuses a start date
--          of today (`tariffStartError`); this insert does not go through it.
--
-- The VIP rooms need no SQL: C1 and C2 are VIP by default, by room number,
-- until the manager saves a list at Console -> VIP Rooms & Guidelines.
-- ============================================================================

-- 0. What is there now.
select gh.name as guest_house, r.room_number, r.is_active
from public.rooms r
join public.guest_houses gh on gh.id = r.guest_house_id
order by gh.name, r.room_number;

-- 1. Bageshri.
update public.rooms r
set room_number = m.new_number
from public.guest_houses gh,
     (values ('201','B1'),('202','B2'),('203','B3'),('204','B4'),('206','B5'),
             ('302','B6'),('303','B7'),('305','B8'),('306','B9'),('307','B10')) as m(old_number, new_number)
where gh.id = r.guest_house_id
  and gh.name = 'Bageshri'
  and r.room_number = m.old_number;

-- 2. Hamsanandi - CONFIRM THE MAPPING WITH THE OFFICE, then uncomment.
-- update public.rooms r
-- set room_number = m.new_number
-- from public.guest_houses gh,
--      (values ('B1','A1'),('B2','A2'),('B3','A3')) as m(old_number, new_number)
-- where gh.id = r.guest_house_id
--   and gh.name = 'Hamsanandi'
--   and r.room_number = m.old_number;
--
-- update public.rooms r
-- set is_active = false
-- from public.guest_houses gh
-- where gh.id = r.guest_house_id
--   and gh.name = 'Hamsanandi'
--   and r.room_number in ('B4','C3','C4');

-- Recount, the way the developer console does.
update public.guest_houses gh
set total_rooms = (select count(*) from public.rooms r where r.guest_house_id = gh.id and r.is_active);

-- 3. Categories I-III, room per day, GST included, from today.
--    The second row replaces migration 19's Rs 4,000 "type 3, government
--    officers" rate, which is in force and cannot be deleted. Left alone it
--    stays on the published sheet and the desk is offered it for a personal
--    or alumni stay at Hamsanandi, because it names a role and no booking type.
insert into public.tariffs (guest_house_id, item, room_type, booking_type, requester_role, rate, effective_from, note)
select gh.id, 'room', null, t.booking_type::public.booking_type, t.requester_role::public.user_role,
       case gh.name when 'Hamsanandi' then t.hamsanandi else t.bageshri end,
       (now() at time zone 'Asia/Kolkata')::date, t.note
from public.guest_houses gh,
     (values
       (null, null, 1500, 1000, 'Category I: guests and relatives of employees, parents of students on a personal visit'),
       (null, 'official', 1500, 1000, 'Category I: guests and relatives of employees, parents of students on a personal visit'),
       ('official', null, 2000, 1500, 'Category II: institute guests on official duty - ministers, directors, BOG, selection committees, external examiners, official guests'),
       ('official', 'official', 2000, 1500, 'Category II: institute guests on official duty - ministers, directors, BOG, selection committees, external examiners, official guests'),
       ('official', 'employee', 2500, 2000, 'Category III: academic visitors')
     ) as t(booking_type, requester_role, hamsanandi, bageshri, note)
where gh.name in ('Hamsanandi', 'Bageshri');
