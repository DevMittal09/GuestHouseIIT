-- Point four demo accounts at real inboxes, so Gmail delivery can be observed
-- end to end without MAIL_REDIRECT_ALL_TO.
--
-- 9 Nov 2026. NOT a migration: it changes no structure. Not applied
-- automatically. Run it once against the shared database, on a connection
-- that holds a session - the Supabase **session pooler, port 5432**, not the
-- 6543 the app uses.
--
-- WHY. The redirect replaces To and drops CC, so while it is set nothing about
-- the real addressing can be watched - which is the office's "copy to mail is
-- not working" of 1 Oct 2026 seen from the other side. To watch a real chain
-- work, the accounts in one chain need addresses that exist. These four are
-- the Saveri Boys chain plus the desk:
--
--   asst. warden   Ms. Anu George    -> student.iitpkd01@gmail.com   (decides)
--   warden         Dr. Lakshmi Devi  -> muhamed.rizwan2222@gmail.com (copied)
--   gh manager     the desk          -> muhamed.rizwan2458@gmail.com (allocates)
--
-- THE STUDENT IS NOT RENAMED, and this is the part to read before editing.
-- `142301026@smail.iitpkd.ac.in` was going to be the Saveri student's new
-- address - except the shared database **already had a real account on it**
-- ("Rizwan", a student, with 3 bookings and 3 log entries). Renaming the demo
-- persona onto it would have put somebody else's name on those bookings, so
-- the guard below refuses it and the demo persona keeps its fake address.
--
-- Instead this gives the **existing** account what it was missing: an
-- `institute_students` row putting it in **Saveri Boys**. It had none, so
-- `profiles_v.hostel_name` was null - and a student with no hostel has no
-- Assistant Warden (`approverNotApplicable`), so its bookings went straight to
-- the desk and skipped the very stage this test is for.
--
-- The **Deputy Warden is deliberately left on its fake address**: it is the one
-- rank in that office with no real inbox, so it also proves that
-- MAIL_ALLOWED_RECIPIENTS drops an address out of a live CC list.
--
-- This matches `lib/store/seed.ts` and `scripts/seed-personas.mjs` as of the
-- same date, so `npm run seed:personas` agrees with it rather than creating a
-- second set of accounts. **Revert this if you revert the seeds** - otherwise
-- the seeder sees four accounts outside its set and retires them.
--
-- WHAT IT UPDATES. Three tables key a person by email and all three must move
-- together, or `profiles_v` stops resolving the wardens' hostel:
--   profiles.email, institute_students.email, institute_wardens.warden_email
-- `academic_records` is keyed by email too; it held no row for these four when
-- this was written, and the update below covers it anyway.
--
-- Idempotent: re-running changes nothing. Safe before or after
-- `npm run seed:personas`.

begin;

create temporary table mail_test_addresses (
  old_email text primary key,
  new_email text not null
) on commit drop;

insert into mail_test_addresses (old_email, new_email) values
  ('awarden.saveriboys@iitpkd.ac.in', 'student.iitpkd01@gmail.com'),
  ('warden.saveriboys@iitpkd.ac.in',  'muhamed.rizwan2222@gmail.com'),
  ('guesthouse@iitpkd.ac.in',         'muhamed.rizwan2458@gmail.com');

-- Refuse rather than half-apply: if a target address already belongs to some
-- other account, the unique index on lower(email) would fail part way through.
do $$
declare clash text;
begin
  select string_agg(p.email, ', ') into clash
    from profiles p
    join mail_test_addresses m on lower(p.email) = lower(m.new_email)
   where lower(p.email) not in (select lower(old_email) from mail_test_addresses);
  if clash is not null then
    raise exception 'Target address already belongs to another account: %', clash;
  end if;
end $$;

-- `profiles` has no updated_at column; the other three do.
update profiles p
   set email = m.new_email
  from mail_test_addresses m
 where lower(p.email) = lower(m.old_email);

update institute_students s
   set email = m.new_email, updated_at = now()
  from mail_test_addresses m
 where lower(s.email) = lower(m.old_email);

update institute_wardens w
   set warden_email = m.new_email, updated_at = now()
  from mail_test_addresses m
 where lower(w.warden_email) = lower(m.old_email);

update academic_records a
   set email = m.new_email, updated_at = now()
  from mail_test_addresses m
  where lower(a.email) = lower(m.old_email);

-- The real student account joins Saveri Boys, so its request reaches that
-- hostel's Assistant Warden instead of going straight to the desk. Only the
-- hostel and the identifying columns are set: no parents, because nothing
-- should invent a real person's family, and a student with no record on file
-- simply types their guests in (`guestNameRule` locks nothing).
insert into institute_students (email, full_name, roll_number, programme, department, hostel)
select '142301026@smail.iitpkd.ac.in', p.full_name, '142301026', 'B.Tech',
       'Computer Science and Engineering', 'Saveri Boys'
  from profiles p
 where lower(p.email) = '142301026@smail.iitpkd.ac.in'
   and not exists (
     select 1 from institute_students s
      where lower(s.email) = '142301026@smail.iitpkd.ac.in'
   );

update institute_students
   set hostel = 'Saveri Boys', updated_at = now()
 where lower(email) = '142301026@smail.iitpkd.ac.in'
   and coalesce(hostel, '') <> 'Saveri Boys';

commit;

-- What the four accounts now are, and that each still resolves through
-- profiles_v. A warden whose hostel_name is null here means institute_wardens
-- did not move with profiles.
select v.role, v.email, v.full_name, v.hostel_name
  from profiles_v v
 where v.email in (
   '142301026@smail.iitpkd.ac.in',
   'student.iitpkd01@gmail.com',
   'muhamed.rizwan2222@gmail.com',
   'muhamed.rizwan2458@gmail.com'
 )
 order by v.role;
