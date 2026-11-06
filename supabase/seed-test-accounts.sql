-- ============================================================================
-- Test accounts from the office's PostgreSQL handout (6 Nov 2026)
-- ============================================================================
--
-- The 29 accounts in `PostgreSQL.pdf`, and the institute reference rows that
-- give them a hostel, a department and a parent. **Local and staging only.**
-- It is not a migration and nothing applies it automatically; run it by hand:
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/seed-test-accounts.sql
--
-- It is **idempotent** - every statement is `on conflict ... do update`, so
-- re-running it restores the seeded values and changes nothing else. The
-- accounts' UUIDs are the ones the office's backup carries, so anything that
-- already references them keeps pointing at the right person.
--
-- ## Where this data came from, and the four things that were corrected
--
-- The office supplied `database_backup.sql`, a pg_dump 18.1 of a database
-- built from the consolidated `scripts/init-postgres.sql` that the 6 Nov 2026
-- integration deleted. **That dump's schema cannot run this application** -
-- `.memories/21-database.md` has the full comparison - so the data is seeded
-- here onto the schema the migrations build, rather than the dump being
-- restored. The corrections:
--
--   1. **Roles.** The dump gives 7 accounts `deputy_warden` or
--      `assistant_warden`, two values this application's `user_role` does not
--      have. The portal has one reviewer role, `warden`, which `lib/types.ts`
--      already labels "Assistant Warden"; the kind of warden is a property of
--      the person, and it is kept in `institute_wardens.warden_role` (4
--      warden, 3 deputy, 4 assistant). All 11 are seeded as `warden`, which is
--      what scopes them to their hostel through `profiles_v`.
--   2. **Names.** `profiles.full_name` in the dump carries a junk suffix on
--      every row - "AA" stored as "AAAAAA", "Dr. A" as "Dr. AbbAAAA". The
--      institute tables carry the names the PDF lists, and those are seeded.
--      Two of them do not fit: migration 31's `profiles_full_name_present`
--      wants at least two characters, and the PDF names `test8` and `test9`
--      "A" and "B". They are seeded as **"Student A"** and **"Student B"**;
--      `institute_students.full_name` keeps the single letter, which has no
--      such constraint and is what the PDF lists.
--   3. **No booking data.** Every operational table in the dump is empty
--      (bookings, guests, logs, holds, invoices, sessions, audit). Nothing
--      operational is lost by not restoring it.
--   4. **Settings left out.** The dump's `app_settings`, `form_configs` and
--      `mail_templates` rows are the other branch's placeholders. A saved
--      `form_configs` row *wins* over the spec defaults
--      (`getEffectiveFormConfig`), so seeding them would quietly replace the
--      forms with a three-key stub. They parse to the defaults anyway; the
--      application's own defaults are used instead.
--
-- Guest houses, rooms and tariffs are **not** here: `supabase/seed.sql` owns
-- them, with the demo personas. The two seeds are disjoint and may both be
-- applied - no email, UUID or guest house name is shared.
--
-- ## The password
--
-- Every account's password is **test@gh**, as the PDF says. The hash is the
-- dump's own, unchanged: scrypt, 16-byte salt, 64-byte key, written the way
-- `hashSecret()` writes it and read by `verifySecret()` (`lib/crypto.ts`) -
-- verified against both. No plaintext password is stored anywhere, and the
-- hash never leaves the `profiles` base table: `profiles_v`, which is what a
-- `Profile` is read from, does not select it.
--
-- These are published test credentials on published accounts. Do not apply
-- this file to the hosted project. Requires migration 38.
-- ============================================================================

begin;

insert into public.institute_hostels (hostel_id, hostel_name) values
  ('HOS1', 'Malhar Girls'),
  ('HOS2', 'Malhar Boys'),
  ('HOS3', 'Saveri Boys'),
  ('HOS4', 'Saveri Girls'),
  ('HOS5', 'Tilang A Girls'),
  ('HOS6', 'Tilang B'),
  ('HOS7', 'Brindavani')
on conflict (hostel_id) do update set
  hostel_name = excluded.hostel_name;

insert into public.profiles (id, email, full_name, role, password_hash, account_status) values
  ('d315e947-4ae4-4d9f-a495-0c234c6eeef2', 'test1@smail.iitpkd.ac.in', 'AA', 'student', 'scrypt$50b39605a7cf805e05861040a2d55022$faf84127769af359cbc7f17e610880e958f57e231085c8c3eb888316df00f550d3e8e6f11023e365c8a39cd43e48e99f1940df3b216160a7eb1674a38056739f', 'active'),
  ('4a6e4005-1147-4bff-834d-c7fa6cb573d8', 'test2@smail.iitpkd.ac.in', 'BB', 'student', 'scrypt$50b39605a7cf805e05861040a2d55022$faf84127769af359cbc7f17e610880e958f57e231085c8c3eb888316df00f550d3e8e6f11023e365c8a39cd43e48e99f1940df3b216160a7eb1674a38056739f', 'active'),
  ('23ac9afb-be98-4324-8876-bc9ed822dfa3', 'test3@smail.iitpkd.ac.in', 'CC', 'student', 'scrypt$50b39605a7cf805e05861040a2d55022$faf84127769af359cbc7f17e610880e958f57e231085c8c3eb888316df00f550d3e8e6f11023e365c8a39cd43e48e99f1940df3b216160a7eb1674a38056739f', 'active'),
  ('f781ed9b-9863-4322-9ef7-988cf2eff3dc', 'test4@smail.iitpkd.ac.in', 'DD', 'student', 'scrypt$50b39605a7cf805e05861040a2d55022$faf84127769af359cbc7f17e610880e958f57e231085c8c3eb888316df00f550d3e8e6f11023e365c8a39cd43e48e99f1940df3b216160a7eb1674a38056739f', 'active'),
  ('6a4d7a82-5eea-49eb-b05d-9ebf11444fdf', 'test5@smail.iitpkd.ac.in', 'EE', 'student', 'scrypt$50b39605a7cf805e05861040a2d55022$faf84127769af359cbc7f17e610880e958f57e231085c8c3eb888316df00f550d3e8e6f11023e365c8a39cd43e48e99f1940df3b216160a7eb1674a38056739f', 'active'),
  ('aeaf5ba1-e296-4381-887c-9882ea6777a9', 'test6@smail.iitpkd.ac.in', 'FF', 'student', 'scrypt$50b39605a7cf805e05861040a2d55022$faf84127769af359cbc7f17e610880e958f57e231085c8c3eb888316df00f550d3e8e6f11023e365c8a39cd43e48e99f1940df3b216160a7eb1674a38056739f', 'active'),
  ('7492bbdd-149d-43b7-b1db-fb882cc2825b', 'test7@smail.iitpkd.ac.in', 'GG', 'student', 'scrypt$50b39605a7cf805e05861040a2d55022$faf84127769af359cbc7f17e610880e958f57e231085c8c3eb888316df00f550d3e8e6f11023e365c8a39cd43e48e99f1940df3b216160a7eb1674a38056739f', 'active'),
  ('f6b4698b-ad90-4fe6-9578-60aa93c6c5d7', 'test8@smail.iitpkd.ac.in', 'Student A', 'student', 'scrypt$50b39605a7cf805e05861040a2d55022$faf84127769af359cbc7f17e610880e958f57e231085c8c3eb888316df00f550d3e8e6f11023e365c8a39cd43e48e99f1940df3b216160a7eb1674a38056739f', 'active'),
  ('a54aaf68-a1cc-4de3-9c98-695b325c02f5', 'test9@smail.iitpkd.ac.in', 'Student B', 'student', 'scrypt$50b39605a7cf805e05861040a2d55022$faf84127769af359cbc7f17e610880e958f57e231085c8c3eb888316df00f550d3e8e6f11023e365c8a39cd43e48e99f1940df3b216160a7eb1674a38056739f', 'active'),
  ('4b1f9fcc-40ea-4637-a50d-4072d4b2e42c', 'test001@iitpkd.ac.in', 'Dr. A', 'developer', 'scrypt$50b39605a7cf805e05861040a2d55022$faf84127769af359cbc7f17e610880e958f57e231085c8c3eb888316df00f550d3e8e6f11023e365c8a39cd43e48e99f1940df3b216160a7eb1674a38056739f', 'active'),
  ('9d673ec4-5313-473d-8b96-17dfeb7ed825', 'test002@iitpkd.ac.in', 'Dr. B', 'developer', 'scrypt$50b39605a7cf805e05861040a2d55022$faf84127769af359cbc7f17e610880e958f57e231085c8c3eb888316df00f550d3e8e6f11023e365c8a39cd43e48e99f1940df3b216160a7eb1674a38056739f', 'active'),
  ('7c1f354f-a165-48c7-b530-6768ecec9269', 'test003@iitpkd.ac.in', 'Dr. C', 'employee', 'scrypt$50b39605a7cf805e05861040a2d55022$faf84127769af359cbc7f17e610880e958f57e231085c8c3eb888316df00f550d3e8e6f11023e365c8a39cd43e48e99f1940df3b216160a7eb1674a38056739f', 'active'),
  ('fb15fbbe-b5e1-49a0-b3a4-71c75568c4ba', 'test004@iitpkd.ac.in', 'Dr. D', 'employee', 'scrypt$50b39605a7cf805e05861040a2d55022$faf84127769af359cbc7f17e610880e958f57e231085c8c3eb888316df00f550d3e8e6f11023e365c8a39cd43e48e99f1940df3b216160a7eb1674a38056739f', 'active'),
  ('c113a50e-efce-444e-8b5a-54d2d7b4d2ea', 'test005@iitpkd.ac.in', 'Mr. A', 'employee', 'scrypt$50b39605a7cf805e05861040a2d55022$faf84127769af359cbc7f17e610880e958f57e231085c8c3eb888316df00f550d3e8e6f11023e365c8a39cd43e48e99f1940df3b216160a7eb1674a38056739f', 'active'),
  ('b546bb8a-435d-4536-b4f8-f00c091d9885', 'test006@iitpkd.ac.in', 'Mr. B', 'employee', 'scrypt$50b39605a7cf805e05861040a2d55022$faf84127769af359cbc7f17e610880e958f57e231085c8c3eb888316df00f550d3e8e6f11023e365c8a39cd43e48e99f1940df3b216160a7eb1674a38056739f', 'active'),
  ('114bd3ae-a2df-4b9b-b4bd-720f282a83c5', 'test007@iitpkd.ac.in', 'Mr. C', 'employee', 'scrypt$50b39605a7cf805e05861040a2d55022$faf84127769af359cbc7f17e610880e958f57e231085c8c3eb888316df00f550d3e8e6f11023e365c8a39cd43e48e99f1940df3b216160a7eb1674a38056739f', 'active'),
  ('2a26c73d-755c-4781-9825-c2520a09940e', 'test008@iitpkd.ac.in', 'Mr. D', 'employee', 'scrypt$50b39605a7cf805e05861040a2d55022$faf84127769af359cbc7f17e610880e958f57e231085c8c3eb888316df00f550d3e8e6f11023e365c8a39cd43e48e99f1940df3b216160a7eb1674a38056739f', 'active'),
  ('f290c430-fdeb-4a33-b03b-10add9970aba', 'test009@iitpkd.ac.in', 'Prof. A', 'employee', 'scrypt$50b39605a7cf805e05861040a2d55022$faf84127769af359cbc7f17e610880e958f57e231085c8c3eb888316df00f550d3e8e6f11023e365c8a39cd43e48e99f1940df3b216160a7eb1674a38056739f', 'active'),
  ('df56967c-d958-4c97-98e6-108c0265d6f4', 'wardenhos1@iitpkd.ac.in', 'Dr. AA', 'warden', 'scrypt$50b39605a7cf805e05861040a2d55022$faf84127769af359cbc7f17e610880e958f57e231085c8c3eb888316df00f550d3e8e6f11023e365c8a39cd43e48e99f1940df3b216160a7eb1674a38056739f', 'active'),
  ('6166de9a-f03b-4f75-bacd-31484ee00ab7', 'wardenhos2@iitpkd.ac.in', 'Dr. BB', 'warden', 'scrypt$50b39605a7cf805e05861040a2d55022$faf84127769af359cbc7f17e610880e958f57e231085c8c3eb888316df00f550d3e8e6f11023e365c8a39cd43e48e99f1940df3b216160a7eb1674a38056739f', 'active'),
  ('32e01e47-6b68-4539-b372-121d22b4e30a', 'wardenhos3@iitpkd.ac.in', 'Dr. CC', 'warden', 'scrypt$50b39605a7cf805e05861040a2d55022$faf84127769af359cbc7f17e610880e958f57e231085c8c3eb888316df00f550d3e8e6f11023e365c8a39cd43e48e99f1940df3b216160a7eb1674a38056739f', 'active'),
  ('c32ac566-6b5d-4bf7-b522-7ca9969430e0', 'wardenhos4@iitpkd.ac.in', 'Dr. DD', 'warden', 'scrypt$50b39605a7cf805e05861040a2d55022$faf84127769af359cbc7f17e610880e958f57e231085c8c3eb888316df00f550d3e8e6f11023e365c8a39cd43e48e99f1940df3b216160a7eb1674a38056739f', 'active'),
  ('d433af6c-d19e-40a5-934c-06fb9fed2e9c', 'deputy_wardenhos1@iitpkd.ac.in', 'Dr. EE', 'warden', 'scrypt$50b39605a7cf805e05861040a2d55022$faf84127769af359cbc7f17e610880e958f57e231085c8c3eb888316df00f550d3e8e6f11023e365c8a39cd43e48e99f1940df3b216160a7eb1674a38056739f', 'active'),
  ('f66fb9dd-38d3-4b39-af91-b4c5fb490ce1', 'deputy_wardenhos2@iitpkd.ac.in', 'Dr. FF', 'warden', 'scrypt$50b39605a7cf805e05861040a2d55022$faf84127769af359cbc7f17e610880e958f57e231085c8c3eb888316df00f550d3e8e6f11023e365c8a39cd43e48e99f1940df3b216160a7eb1674a38056739f', 'active'),
  ('ccb1618d-f655-4549-84cb-479c2a27c4c5', 'deputy_wardenhos3@iitpkd.ac.in', 'Dr. GG', 'warden', 'scrypt$50b39605a7cf805e05861040a2d55022$faf84127769af359cbc7f17e610880e958f57e231085c8c3eb888316df00f550d3e8e6f11023e365c8a39cd43e48e99f1940df3b216160a7eb1674a38056739f', 'active'),
  ('9245925c-69d8-4bd6-97b4-977ef23ff9f7', 'assistant_wardenhos3@iitpkd.ac.in', 'Mr. MM', 'warden', 'scrypt$50b39605a7cf805e05861040a2d55022$faf84127769af359cbc7f17e610880e958f57e231085c8c3eb888316df00f550d3e8e6f11023e365c8a39cd43e48e99f1940df3b216160a7eb1674a38056739f', 'active'),
  ('27851355-fe4f-47c4-a4ce-20bbabe8f743', 'assistant_wardenhos4@iitpkd.ac.in', 'Ms. AA', 'warden', 'scrypt$50b39605a7cf805e05861040a2d55022$faf84127769af359cbc7f17e610880e958f57e231085c8c3eb888316df00f550d3e8e6f11023e365c8a39cd43e48e99f1940df3b216160a7eb1674a38056739f', 'active'),
  ('394c4015-a63d-48d9-893e-b9539c8817c9', 'assistant_wardenhos5@iitpkd.ac.in', 'Ms. GG', 'warden', 'scrypt$50b39605a7cf805e05861040a2d55022$faf84127769af359cbc7f17e610880e958f57e231085c8c3eb888316df00f550d3e8e6f11023e365c8a39cd43e48e99f1940df3b216160a7eb1674a38056739f', 'active'),
  ('e8daf5f2-adb8-4bd5-bc4c-082c30591fd6', 'assistant_wardenhos6@iitpkd.ac.in', 'Mr. MMM', 'warden', 'scrypt$50b39605a7cf805e05861040a2d55022$faf84127769af359cbc7f17e610880e958f57e231085c8c3eb888316df00f550d3e8e6f11023e365c8a39cd43e48e99f1940df3b216160a7eb1674a38056739f', 'active')
on conflict (id) do update set
  email = excluded.email,
  full_name = excluded.full_name,
  role = excluded.role,
  password_hash = excluded.password_hash,
  account_status = excluded.account_status;

insert into public.institute_students (email, batch_year, roll_number, full_name, programme, faculty_advisor_guide_name, department, phone, aadhar_number, father_name, father_aadhar_number, father_phone_number, mother_name, mother_aadhar_number, mother_phone_number, spouse_name, spouse_aadhar_number, spouse_phone_number, guardian_name, guardian_aadhar_number, guardian_phone_number, hostel) values
  ('test1@smail.iitpkd.ac.in', '2021', '102101031', 'AA', 'B. Tech.', 'Dr. Subhasis Mitra', 'Civil Engineering', '9988774466', '374617372201', NULL, 'Not available', NULL, NULL, 'Not available', NULL, 'Not available', 'Not available', 'Not available', NULL, 'Not available', NULL, NULL),
  ('test2@smail.iitpkd.ac.in', '2023', '112301001', 'BB', 'B. Tech.', 'Dr. Anish Hirwe', 'Computer Science and Engineering', '9988774466', '653090435901', 'A', 'Not available', NULL, NULL, 'Not available', NULL, 'Not available', 'Not available', 'Not available', 'A', 'Not available', NULL, 'Malhar Boys'),
  ('test3@smail.iitpkd.ac.in', '2019', '121901008', 'CC', 'B. Tech.', 'Dr. Jobin Francis', 'Electrical Engineering', '9988774466', '948260562601', 'B', 'Not available', '9988774466', 'A', 'Not available', '9988774466', 'Not available', 'Not available', 'Not available', 'B', 'Not available', '9988774466', NULL),
  ('test4@smail.iitpkd.ac.in', '2021', '122101001', 'DD', 'B. Tech.', 'Dr. Arun Rahul S', 'Electrical Engineering', '9988774466', '776923683001', NULL, 'Not available', '9988774466', NULL, 'Not available', '9988774466', 'Not available', 'Not available', 'Not available', NULL, 'Not available', '9988774466', NULL),
  ('test5@smail.iitpkd.ac.in', '2022', '142201034', 'EE', 'B. Tech.', 'Dr. Albert Sunny', 'Data Science and Engineering', '9988774466', '165161345701', 'C', 'Not available', '9988774466', NULL, 'Not available', '9988774466', 'Not available', 'Not available', 'Not available', 'C', 'Not available', '9988774466', 'Saveri Boys'),
  ('test6@smail.iitpkd.ac.in', '2023', '112301045', 'FF', 'B. Tech.', 'Dr. Anish Hirwe', 'Computer Science and Engineering', '9988774466', '338644426010', 'D', 'Not available', '9988774466', 'B', 'Not available', '9988774466', 'Not available', 'Not available', 'Not available', 'D', 'Not available', '9988774466', 'Malhar Boys'),
  ('test7@smail.iitpkd.ac.in', '2023', '122301042', 'GG', 'B. Tech.', 'Dr. Naga Brahmendra Yadav Gorla', 'Electrical engineering', '9988774466', '606003454010', 'E', 'Not available', '9988774466', 'C', 'Not available', '9988774466', 'Not available', 'Not available', 'Not available', 'E', 'Not available', '9988774466', 'Saveri Boys'),
  ('test8@smail.iitpkd.ac.in', '2018', '201804102', 'A', 'PhD', 'Dr. Dinesh Jagadeesan', 'Chemistry', '8606207353', '126003454010', NULL, 'Not available', NULL, NULL, 'Not available', NULL, 'Not available', 'Not available', 'Not available', 'F', 'Not available', NULL, NULL),
  ('test9@smail.iitpkd.ac.in', '2020', '202014003', 'B', 'PhD', 'Dr. Dinesh Jagadeesan', 'Chemistry', '9656129803', '136003454010', 'F', 'Not available', NULL, NULL, 'Not available', NULL, 'Not available', 'Not available', 'Not available', NULL, 'Not available', NULL, NULL)
on conflict (lower(email)) do update set
  batch_year = excluded.batch_year,
  roll_number = excluded.roll_number,
  full_name = excluded.full_name,
  programme = excluded.programme,
  department = excluded.department,
  phone = excluded.phone,
  father_name = excluded.father_name,
  mother_name = excluded.mother_name,
  guardian_name = excluded.guardian_name,
  hostel = excluded.hostel;

insert into public.institute_employees (email, employee_id, full_name, department, employee_type, designation, phone, office_number, gender) values
  ('test001@iitpkd.ac.in', 'TEST001', 'Dr. A', 'Mechanical Engineering', 'Teaching Staff', 'Assistant Professor Grade I', '9988776655', NULL, 'Male'),
  ('test002@iitpkd.ac.in', 'TEST002', 'Dr. B', 'Mathematics', 'Teaching Staff', 'Assistant Professor Grade I', '9988776655', NULL, 'Male'),
  ('test003@iitpkd.ac.in', 'TEST003', 'Dr. C', 'Mathematics', 'Teaching Staff', 'Assistant Professor Grade I', '9988776655', NULL, 'Male'),
  ('test004@iitpkd.ac.in', 'TEST004', 'Dr. D', 'Civil Engineering', 'Teaching Staff', 'Assistant Professor Grade I', '9988776655', NULL, 'Male'),
  ('test005@iitpkd.ac.in', 'TEST005', 'Mr. A', 'Academics', 'Non Teaching Staff', 'Junior Attendant', '9988776655', NULL, 'Female'),
  ('test006@iitpkd.ac.in', 'TEST006', 'Mr. B', 'EWD', 'Non Teaching Staff', 'Junior Engineer (Electrical)', '9988776655', NULL, 'Male'),
  ('test007@iitpkd.ac.in', 'TEST007', 'Mr. C', 'EWD', 'Non Teaching Staff', 'Junior Engineer (Electrical)', '9988776655', NULL, 'Male'),
  ('test008@iitpkd.ac.in', 'TEST008', 'Mr. D', 'Systems', 'Non Teaching Staff', 'Junior Technical Superintendent', '9988776655', NULL, 'Male'),
  ('test009@iitpkd.ac.in', 'TEST009', 'Prof. A', 'Director', 'Director', 'Director', '9988776655', NULL, 'Male')
on conflict (lower(email)) do update set
  employee_id = excluded.employee_id,
  full_name = excluded.full_name,
  department = excluded.department,
  employee_type = excluded.employee_type,
  designation = excluded.designation,
  phone = excluded.phone,
  gender = excluded.gender;

insert into public.institute_offices (office_email, office_name, office_type, phone, department_head, head_name, head_email) values
  ('director_iitpkd@iitpkd.ac.in', 'Office of the Director', 'officer', NULL, 'Director Office', 'Director', 'director@iitpkd.ac.in'),
  ('ro@iitpkd.ac.in', 'Office of the Registrar', 'officer', NULL, 'Administration', 'Registrar', 'registrar@iitpkd.ac.in'),
  ('office_cs@iitpkd.ac.in', 'CSE Department Office', 'department', NULL, 'Computer Science', 'HoD CSE', 'hod_cs@iitpkd.ac.in'),
  ('office_ee@iitpkd.ac.in', 'EE Department Office', 'department', NULL, 'Electrical Eng', 'HoD EE', 'hod_ee@iitpkd.ac.in'),
  ('personnel@iitpkd.ac.in', 'Academic Affairs Section', 'department', NULL, 'Administration', 'AR Admn', 'aradmn@iitpkd.ac.in')
on conflict (lower(office_email)) do update set
  office_name = excluded.office_name,
  office_type = excluded.office_type,
  department_head = excluded.department_head,
  head_name = excluded.head_name,
  head_email = excluded.head_email;

insert into public.institute_wardens (warden_email, full_name, warden_phone, warden_role, hostel_id) values
  ('wardenhos1@iitpkd.ac.in', 'Dr. AA', '9977886644', 'warden', 'HOS1'),
  ('wardenhos2@iitpkd.ac.in', 'Dr. BB', '9977886644', 'warden', 'HOS2'),
  ('wardenhos3@iitpkd.ac.in', 'Dr. CC', '9977886644', 'warden', 'HOS3'),
  ('wardenhos4@iitpkd.ac.in', 'Dr. DD', '9977886644', 'warden', 'HOS4'),
  ('deputy_wardenhos1@iitpkd.ac.in', 'Dr. EE', '9977886644', 'deputy_warden', 'HOS1'),
  ('deputy_wardenhos2@iitpkd.ac.in', 'Dr. FF', '9977886644', 'deputy_warden', 'HOS2'),
  ('deputy_wardenhos3@iitpkd.ac.in', 'Dr. GG', '9977886644', 'deputy_warden', 'HOS3'),
  ('assistant_wardenhos3@iitpkd.ac.in', 'Mr. MM', '9977886644', 'assistant_warden', 'HOS3'),
  ('assistant_wardenhos4@iitpkd.ac.in', 'Ms. AA', '9977886644', 'assistant_warden', 'HOS4'),
  ('assistant_wardenhos5@iitpkd.ac.in', 'Ms. GG', '9977886644', 'assistant_warden', 'HOS5'),
  ('assistant_wardenhos6@iitpkd.ac.in', 'Mr. MMM', '9977886644', 'assistant_warden', 'HOS6')
on conflict (lower(warden_email)) do update set
  full_name = excluded.full_name,
  warden_phone = excluded.warden_phone,
  warden_role = excluded.warden_role,
  hostel_id = excluded.hostel_id;

insert into public.official_email_whitelist (email) values
  ('director@iitpkd.ac.in'),
  ('registrar@iitpkd.ac.in'),
  ('dean_admin@iitpkd.ac.in'),
  ('ghm@iitpkd.ac.in'),
  ('iar_office@iitpkd.ac.in'),
  ('personnel@iitpkd.ac.in'),
  ('test001@iitpkd.ac.in'),
  ('test002@iitpkd.ac.in'),
  ('test003@iitpkd.ac.in'),
  ('test004@iitpkd.ac.in'),
  ('test005@iitpkd.ac.in'),
  ('test006@iitpkd.ac.in'),
  ('test007@iitpkd.ac.in'),
  ('test008@iitpkd.ac.in'),
  ('test009@iitpkd.ac.in'),
  ('test1@smail.iitpkd.ac.in'),
  ('test2@smail.iitpkd.ac.in'),
  ('test3@smail.iitpkd.ac.in'),
  ('test4@smail.iitpkd.ac.in'),
  ('test5@smail.iitpkd.ac.in'),
  ('test6@smail.iitpkd.ac.in'),
  ('test7@smail.iitpkd.ac.in'),
  ('test8@smail.iitpkd.ac.in'),
  ('test9@smail.iitpkd.ac.in')
on conflict (email) do nothing;

commit;
