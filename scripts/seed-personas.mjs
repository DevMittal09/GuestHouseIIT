#!/usr/bin/env node
/**
 * Put the demo personas into a PostgreSQL database - **one account per kind
 * of user**, and nothing else.
 *
 *   npm run seed:personas                     # apply
 *   npm run seed:personas -- --dry-run        # print the plan, change nothing
 *   npm run seed:personas -- --keep-extra     # leave accounts not in the set
 *   npm run seed:personas -- --drop-orphans   # also delete those accounts'
 *                                             # bookings, so they can go too
 *
 * Written on 7 Nov 2026, when the office's database held two overlapping
 * sets of test accounts: the portal's own demo personas and a spreadsheet of
 * `test1@`…`test009@` / `wardenhos1@`… rows that had been imported with
 * every warden rank flattened to one role. Neither set could be used to walk
 * a workflow end to end, which is what these accounts are for.
 *
 * **The persona set is `lib/store/seed.ts`** - that is the one place it is
 * written down for the mock store, and `tests/seed-parity.test.ts` compares
 * this file against it on every run, so the two cannot drift. This file
 * exists separately only because a Node script cannot import TypeScript.
 *
 * What it does, in order:
 *
 * 1. Adds `deputy_warden` and `assistant_warden` to the `user_role` enum if
 *    the database predates them. Postgres will not let a new enum value be
 *    *used* in the transaction that adds it, so this runs first and alone.
 * 2. Replaces `profiles_v` with the definition in `scripts/init-postgres.sql`
 *    (all three warden ranks resolve a hostel, not just `warden`).
 * 3. Upserts the hostels, units, profiles, institute records and the
 *    official whitelist, by natural key - re-running changes nothing.
 * 4. Deletes every other account, **except any that a booking points at**,
 *    which it names and leaves. Nothing with history is ever removed.
 *
 * It never touches guest houses, rooms, tariffs or bookings.
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { Client } from "pg";

// ------------------------------------------------------------ the persona set
// Mirrors lib/store/seed.ts. tests/seed-parity.test.ts pins them together.

export const HOSTELS = [
  { hostel_id: "HOS1", hostel_name: "Malhar Girls" },
  { hostel_id: "HOS2", hostel_name: "Malhar Boys" },
  { hostel_id: "HOS3", hostel_name: "Saveri Boys" },
  { hostel_id: "HOS4", hostel_name: "Saveri Girls" },
  { hostel_id: "HOS5", hostel_name: "Tilang A Girls" },
  { hostel_id: "HOS6", hostel_name: "Tilang B" },
  { hostel_id: "HOS7", hostel_name: "Brindavani" },
];

/**
 * `head`, `advisor` and `parent` are persona / unit **keys**, resolved to
 * uuids once everything is inserted - the ids in `lib/store/seed.ts` are
 * mock-store strings and mean nothing to Postgres.
 */
export const UNITS = [
  { key: "unit-cse", name: "Computer Science & Engineering", category: "department", office_type: null, parent: null, head: "hod-cse", advisor: null, secretary_email: null },
  { key: "unit-dse", name: "Data Science & Engineering", category: "department", office_type: null, parent: null, head: "hod-dse", advisor: null, secretary_email: null },
  { key: "unit-cultural", name: "Cultural Affairs Council", category: "council", office_type: null, parent: null, head: "student-secretary", advisor: "faculty-advisor", secretary_email: "sec_arts@iitpkd.ac.in" },
  { key: "unit-petrichor", name: "Petrichor", category: "club", office_type: null, parent: "unit-cultural", head: null, advisor: "faculty-advisor", secretary_email: null },
  { key: "unit-director-office", name: "Director's Office", category: "office", office_type: "officer", parent: null, head: null, advisor: null, secretary_email: null },
  { key: "unit-registrar-office", name: "Registrar's Office", category: "office", office_type: "officer", parent: null, head: "registrar", advisor: null, secretary_email: null },
  { key: "unit-iar-office", name: "International & Alumni Relations", category: "office", office_type: "officer", parent: null, head: null, advisor: null, secretary_email: null },
  { key: "unit-cse-office", name: "CSE Department Office", category: "office", office_type: "department", parent: "unit-cse", head: null, advisor: null, secretary_email: null },
  { key: "unit-dse-office", name: "Data Science Department Office", category: "office", office_type: "department", parent: "unit-dse", head: null, advisor: null, secretary_email: null },
];

export const PROFILES = [
  { key: "student-btech-saveri", email: "btech.saveri@smail.iitpkd.ac.in", full_name: "Arjun Pillai", role: "student", unit: null },
  { key: "student-phd-malhar", email: "phd.malhar@smail.iitpkd.ac.in", full_name: "Nikhil Varma", role: "student", unit: null },
  { key: "student-ms-tilang", email: "ms.tilang@smail.iitpkd.ac.in", full_name: "Fathima Rasheed", role: "student", unit: null },
  { key: "student-day-scholar", email: "dayscholar@smail.iitpkd.ac.in", full_name: "Devika Iyer (day scholar - no hostel)", role: "student", unit: null },
  { key: "student-secretary", email: "secretary.arts@smail.iitpkd.ac.in", full_name: "Meera Nair (Cultural Secretary)", role: "student", unit: null },

  { key: "faculty-cse", email: "faculty.cse@iitpkd.ac.in", full_name: "Dr. Priya Sharma", role: "employee", unit: "unit-cse" },
  { key: "hod-cse", email: "hod.cse@iitpkd.ac.in", full_name: "Prof. R. Venkatesh (HOD, CSE)", role: "employee", unit: "unit-cse" },
  { key: "hod-dse", email: "hod.dse@iitpkd.ac.in", full_name: "Prof. S. Anand (HOD, Data Science)", role: "employee", unit: "unit-dse" },
  { key: "staff-cse", email: "staff.cse@iitpkd.ac.in", full_name: "Ravi Kumar (Technical Staff, CSE)", role: "employee", unit: "unit-cse" },
  { key: "faculty-advisor", email: "advisor.cultural@iitpkd.ac.in", full_name: "Dr. Arun Prasad", role: "employee", unit: "unit-cse" },
  { key: "registrar", email: "registrar@iitpkd.ac.in", full_name: "Dr. Mohan Das (Registrar)", role: "employee", unit: "unit-registrar-office" },

  { key: "office-director", email: "director_iitpkd@iitpkd.ac.in", full_name: "Director's Office", role: "official", unit: "unit-director-office" },
  { key: "office-registrar", email: "ro@iitpkd.ac.in", full_name: "Registrar's Office", role: "official", unit: "unit-registrar-office" },
  { key: "office-cse", email: "office_cs@iitpkd.ac.in", full_name: "CSE Department Office", role: "official", unit: "unit-cse-office" },
  { key: "office-dse", email: "office_ds@iitpkd.ac.in", full_name: "Data Science Department Office", role: "official", unit: "unit-dse-office" },

  { key: "iar-cell", email: "iar@iitpkd.ac.in", full_name: "IAR Office", role: "iar_cell", unit: "unit-iar-office" },
  { key: "iar-student-cell", email: "alumnicell@iitpkd.ac.in", full_name: "IAR Student Cell", role: "iar_student_cell", unit: null },

  { key: "club-cultural", email: "sec_arts@iitpkd.ac.in", full_name: "Cultural Affairs Council", role: "club", unit: "unit-cultural" },
  { key: "club-petrichor", email: "petrichor@iitpkd.ac.in", full_name: "Petrichor Fest Council", role: "club", unit: "unit-petrichor" },

  { key: "warden-malhar", email: "warden.malharboys@iitpkd.ac.in", full_name: "Dr. Suresh Kumar", role: "warden", unit: null },
  { key: "dwarden-malhar", email: "dwarden.malharboys@iitpkd.ac.in", full_name: "Dr. Geetha Menon", role: "deputy_warden", unit: null },
  { key: "awarden-malhar", email: "awarden.malharboys@iitpkd.ac.in", full_name: "Mr. Sajeev Thomas", role: "assistant_warden", unit: null },
  { key: "warden-saveri", email: "warden.saveriboys@iitpkd.ac.in", full_name: "Dr. Lakshmi Devi", role: "warden", unit: null },
  { key: "dwarden-saveri", email: "dwarden.saveriboys@iitpkd.ac.in", full_name: "Dr. Vinod Raj", role: "deputy_warden", unit: null },
  { key: "awarden-saveri", email: "awarden.saveriboys@iitpkd.ac.in", full_name: "Ms. Anu George", role: "assistant_warden", unit: null },
  { key: "warden-tilang", email: "warden.tilangagirls@iitpkd.ac.in", full_name: "Dr. Shalini Rao", role: "warden", unit: null },

  { key: "gh-manager", email: "guesthouse@iitpkd.ac.in", full_name: "Guest House Manager", role: "gh_manager", unit: null },
  { key: "gh-caretaker", email: "gh.reception@iitpkd.ac.in", full_name: "Guest House Caretaker", role: "gh_caretaker", unit: null },
  { key: "developer", email: "developer@iitpkd.ac.in", full_name: "Portal Developer", role: "developer", unit: null },
];

export const STUDENTS = [
  { email: "btech.saveri@smail.iitpkd.ac.in", batch_year: "2023", roll_number: "112301007", full_name: "Arjun Pillai", programme: "B.Tech", department: "Computer Science and Engineering", hostel: "Saveri Boys", father_name: "Mohanan Pillai", father_phone_number: "+91 90000 00201", mother_name: "Radhika Pillai", mother_phone_number: "+91 90000 00202", guardian_name: null, guardian_phone_number: null },
  { email: "phd.malhar@smail.iitpkd.ac.in", batch_year: "2021", roll_number: "202104003", full_name: "Nikhil Varma", programme: "PhD", department: "Chemistry", hostel: "Malhar Boys", father_name: "Sudhakara Varma", father_phone_number: "+91 90000 00203", mother_name: null, mother_phone_number: null, guardian_name: null, guardian_phone_number: null },
  { email: "ms.tilang@smail.iitpkd.ac.in", batch_year: "2023", roll_number: "142303011", full_name: "Fathima Rasheed", programme: "MS", department: "Data Science and Engineering", hostel: "Tilang A Girls", father_name: null, father_phone_number: null, mother_name: null, mother_phone_number: null, guardian_name: "Abdul Rasheed", guardian_phone_number: "+91 90000 00204" },
  { email: "dayscholar@smail.iitpkd.ac.in", batch_year: "2023", roll_number: "122303099", full_name: "Devika Iyer", programme: "B.Tech", department: "Mechanical Engineering", hostel: null, father_name: "Krishnan Iyer", father_phone_number: null, mother_name: "Sudha Iyer", mother_phone_number: null, guardian_name: null, guardian_phone_number: null },
  { email: "secretary.arts@smail.iitpkd.ac.in", batch_year: "2023", roll_number: "112301045", full_name: "Meera Nair", programme: "B.Tech", department: "Computer Science and Engineering", hostel: "Malhar Girls", father_name: "Rajan Nair", father_phone_number: null, mother_name: "Bindu Nair", mother_phone_number: null, guardian_name: null, guardian_phone_number: null },
];

export const EMPLOYEES = [
  { email: "faculty.cse@iitpkd.ac.in", employee_id: "EMP001", full_name: "Dr. Priya Sharma", department: "Computer Science & Engineering", employee_type: "Teaching Staff", designation: "Assistant Professor", phone: "9876543230", office_number: "A-201", gender: "Female" },
  { email: "hod.cse@iitpkd.ac.in", employee_id: "EMP002", full_name: "Prof. R. Venkatesh", department: "Computer Science & Engineering", employee_type: "Teaching Staff", designation: "Professor", phone: "9876543231", office_number: "A-101", gender: "Male" },
  { email: "hod.dse@iitpkd.ac.in", employee_id: "EMP003", full_name: "Prof. S. Anand", department: "Data Science & Engineering", employee_type: "Teaching Staff", designation: "Professor", phone: "9876543232", office_number: "B-101", gender: "Male" },
  { email: "advisor.cultural@iitpkd.ac.in", employee_id: "EMP004", full_name: "Dr. Arun Prasad", department: "Computer Science & Engineering", employee_type: "Teaching Staff", designation: "Associate Professor", phone: "9876543233", office_number: "A-202", gender: "Male" },
  { email: "staff.cse@iitpkd.ac.in", employee_id: "EMP010", full_name: "Ravi Kumar", department: "Computer Science & Engineering", employee_type: "Non Teaching Staff", designation: "Junior Technical Superintendent", phone: "9876543240", office_number: "A-105", gender: "Male" },
  { email: "registrar@iitpkd.ac.in", employee_id: "EMP011", full_name: "Dr. Mohan Das", department: "Administration", employee_type: "Non Teaching Staff", designation: "Registrar", phone: "9876543241", office_number: "Admin-01", gender: "Male" },
];

export const OFFICES = [
  { office_email: "director_iitpkd@iitpkd.ac.in", office_name: "Office of the Director", office_type: "officer", phone: "04923-226000", department_head: "Yes", head_name: "Director", head_email: "director@iitpkd.ac.in" },
  { office_email: "ro@iitpkd.ac.in", office_name: "Office of the Registrar", office_type: "officer", phone: "04923-226001", department_head: "Yes", head_name: "Dr. Mohan Das", head_email: "registrar@iitpkd.ac.in" },
  { office_email: "office_cs@iitpkd.ac.in", office_name: "CSE Department Office", office_type: "department", phone: "04923-226100", department_head: "Yes", head_name: "Prof. R. Venkatesh", head_email: "hod.cse@iitpkd.ac.in" },
  { office_email: "office_ds@iitpkd.ac.in", office_name: "Data Science Department Office", office_type: "department", phone: "04923-226200", department_head: "Yes", head_name: "Prof. S. Anand", head_email: "hod.dse@iitpkd.ac.in" },
];

export const FCCS = [
  { council_email: "sec_arts@iitpkd.ac.in", council_name: "Cultural Affairs Council", event_or_council: "Council", faculty_advisor_email: "advisor.cultural@iitpkd.ac.in" },
  { council_email: "petrichor@iitpkd.ac.in", council_name: "Petrichor", event_or_council: "Fest", faculty_advisor_email: "advisor.cultural@iitpkd.ac.in" },
];

export const WARDENS = [
  { warden_email: "warden.malharboys@iitpkd.ac.in", full_name: "Dr. Suresh Kumar", warden_phone: "9876543250", warden_role: "Warden", hostel_id: "HOS2" },
  { warden_email: "dwarden.malharboys@iitpkd.ac.in", full_name: "Dr. Geetha Menon", warden_phone: "9876543251", warden_role: "Deputy Warden", hostel_id: "HOS2" },
  { warden_email: "awarden.malharboys@iitpkd.ac.in", full_name: "Mr. Sajeev Thomas", warden_phone: "9876543252", warden_role: "Assistant Warden", hostel_id: "HOS2" },
  { warden_email: "warden.saveriboys@iitpkd.ac.in", full_name: "Dr. Lakshmi Devi", warden_phone: "9876543253", warden_role: "Warden", hostel_id: "HOS3" },
  { warden_email: "dwarden.saveriboys@iitpkd.ac.in", full_name: "Dr. Vinod Raj", warden_phone: "9876543254", warden_role: "Deputy Warden", hostel_id: "HOS3" },
  { warden_email: "awarden.saveriboys@iitpkd.ac.in", full_name: "Ms. Anu George", warden_phone: "9876543255", warden_role: "Assistant Warden", hostel_id: "HOS3" },
  { warden_email: "warden.tilangagirls@iitpkd.ac.in", full_name: "Dr. Shalini Rao", warden_phone: "9876543256", warden_role: "Warden", hostel_id: "HOS5" },
];

export const WHITELIST = [
  "director_iitpkd@iitpkd.ac.in",
  "ro@iitpkd.ac.in",
  "office_cs@iitpkd.ac.in",
  "office_ds@iitpkd.ac.in",
];

/**
 * The columns some databases carry on `profiles` and this branch does not
 * read. They are kept in the view where they exist, because dropping a
 * column from `profiles_v` would break a deployment running a branch that
 * does read them - and this script's job is the personas, not the schema.
 */
const OPTIONAL_PROFILE_COLUMNS = [
  "ldap_uid",
  "group_id",
  "login_disabled_at",
  "login_disabled_reason",
];

/** `profiles_v`, as `scripts/init-postgres.sql` defines it. */
const profilesView = (extra) => `
create view public.profiles_v as
select
  p.id, p.email, p.full_name, p.role,
  p.account_status,
  ${extra.map((c) => `p.${c},`).join("\n  ")}
  case
    when p.role = 'student' then s.hostel
    when p.role in ('warden', 'deputy_warden', 'assistant_warden') then ih.hostel_name
    else null
  end as hostel_name,
  u.name as department_or_club,
  s.roll_number,
  p.unit_id,
  case
    when e.employee_type is null then null
    when lower(e.employee_type) like '%non%teaching%'
      or lower(e.employee_type) like '%non teaching%' then 'staff'
    else 'faculty'
  end as staff_category
from public.profiles p
left join public.institute_students s
  on lower(s.email) = lower(p.email) and p.role = 'student'
left join public.institute_wardens w
  on lower(w.warden_email) = lower(p.email)
  and p.role in ('warden', 'deputy_warden', 'assistant_warden')
left join public.institute_hostels ih
  on w.hostel_id = ih.hostel_id
left join public.units u
  on u.id = p.unit_id
left join public.institute_employees e
  on lower(e.email) = lower(p.email) and p.role = 'employee'`;

// ------------------------------------------------------------------- running

/** `.env.local`, with inline `# comments` stripped from unquoted values. */
function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const m = /^\s*([\w.-]+)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    const [, key] = m;
    let value = m[2].trim();
    if (/^(['"]).*\1$/.test(value)) value = value.slice(1, -1);
    else value = value.replace(/\s+#.*$/, "").trim();
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const keepExtra = args.has("--keep-extra");
/**
 * Delete the bookings of accounts that are not in the persona set, so the
 * accounts themselves can go. **Off by default**: a booking is somebody's
 * stay, and a seeding script must not be the thing that throws one away. It
 * is for a development database full of half-finished test requests, which
 * is what asks for it; an invoiced booking is refused by the database
 * either way (`invoices.booking_id` is `on delete restrict`).
 */
const dropOrphans = args.has("--drop-orphans");

function say(line) {
  console.log(line);
}

async function main() {
  loadEnv(path.join(process.cwd(), ".env.local"));
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL is not set. Put it in .env.local or the environment.");
    process.exit(1);
  }
  const client = new Client({
    connectionString,
    ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined,
  });
  await client.connect();
  const where = connectionString.replace(/:\/\/[^:]+:[^@]*@/, "://***@");
  say(`Database: ${where}`);
  if (dryRun) say("Dry run: nothing will be written.\n");

  try {
    // 1. The two warden ranks, before anything uses them. `add value` cannot
    //    run inside a transaction block in older Postgres, and the value
    //    cannot be *used* in the same transaction, so this is on its own.
    for (const value of ["deputy_warden", "assistant_warden"]) {
      const { rows } = await client.query(
        "select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid where t.typname = 'user_role' and e.enumlabel = $1",
        [value]
      );
      if (rows.length > 0) continue;
      say(`user_role: adding '${value}'`);
      if (!dryRun) await client.query(`alter type public.user_role add value '${value}'`);
    }

    if (dryRun) {
      say("\nWould then replace profiles_v, upsert the persona set and retire the rest.");
      await reportPlan(client);
      return;
    }

    // 2. The view, which has to know the two new roles. Dropped and
    //    recreated rather than replaced: `create or replace view` refuses a
    //    changed column list, and some databases carry extra profile
    //    columns this branch does not read.
    const { rows: present } = await client.query(
      `select column_name from information_schema.columns
        where table_schema = 'public' and table_name = 'profiles'
          and column_name = any($1::text[])`,
      [OPTIONAL_PROFILE_COLUMNS]
    );
    const extra = OPTIONAL_PROFILE_COLUMNS.filter((c) =>
      present.some((r) => r.column_name === c)
    );
    await client.query("drop view if exists public.profiles_v");
    await client.query(profilesView(extra));
    say(
      `profiles_v: rebuilt (all three warden ranks resolve a hostel` +
        `${extra.length > 0 ? `; kept ${extra.join(", ")}` : ""})`
    );

    await client.query("begin");

    // 3. Hostels, by hostel_id.
    for (const h of HOSTELS) {
      await client.query(
        `insert into public.institute_hostels (hostel_id, hostel_name) values ($1, $2)
         on conflict (hostel_id) do update set hostel_name = excluded.hostel_name`,
        [h.hostel_id, h.hostel_name]
      );
    }
    say(`institute_hostels: ${HOSTELS.length} rows`);

    // 4. Units, by name. Heads, advisors and parents are filled in after the
    //    profiles exist - a unit's head is a profile and a profile's unit is
    //    a unit, so one of the two has to be written twice.
    const unitId = new Map();
    for (const u of UNITS) {
      const { rows } = await client.query(
        `insert into public.units (name, category, office_type)
         values ($1, $2, $3)
         on conflict (name) do update set category = excluded.category, office_type = excluded.office_type
         returning id`,
        [u.name, u.category, u.office_type]
      );
      unitId.set(u.key, rows[0].id);
    }
    for (const u of UNITS) {
      await client.query("update public.units set parent_department_id = $2 where id = $1", [
        unitId.get(u.key),
        u.parent ? unitId.get(u.parent) : null,
      ]);
    }
    say(`units: ${UNITS.length} rows`);

    // 5. Profiles, by email. `account_status` is reset to active: a persona
    //    somebody blocked while testing must come back on the next seed.
    const profileId = new Map();
    for (const p of PROFILES) {
      const { rows } = await client.query(
        `insert into public.profiles (email, full_name, role, unit_id, account_status)
         values ($1, $2, $3::public.user_role, $4, 'active')
         on conflict (email) do update
           set full_name = excluded.full_name,
               role = excluded.role,
               unit_id = excluded.unit_id,
               account_status = 'active'
         returning id`,
        [p.email, p.full_name, p.role, p.unit ? unitId.get(p.unit) : null]
      );
      profileId.set(p.key, rows[0].id);
    }
    say(`profiles: ${PROFILES.length} accounts`);

    // 6. Heads, acting heads, advisors and secretaries, now that both exist.
    for (const u of UNITS) {
      await client.query(
        `update public.units
            set head_id = $2, acting_head_id = null,
                faculty_advisor_id = $3, secretary_email = $4
          where id = $1`,
        [
          unitId.get(u.key),
          u.head ? profileId.get(u.head) : null,
          u.advisor ? profileId.get(u.advisor) : null,
          u.secretary_email,
        ]
      );
    }
    say("units: heads, Faculty Advisors and secretaries set");

    // 7. The institute records the computed profile fields are read from.
    for (const s of STUDENTS) {
      await client.query(
        `insert into public.institute_students
           (email, batch_year, roll_number, full_name, programme, department, hostel,
            father_name, father_phone_number, mother_name, mother_phone_number,
            guardian_name, guardian_phone_number)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         on conflict (lower(email)) do update set
           batch_year = excluded.batch_year, roll_number = excluded.roll_number,
           full_name = excluded.full_name, programme = excluded.programme,
           department = excluded.department, hostel = excluded.hostel,
           father_name = excluded.father_name, father_phone_number = excluded.father_phone_number,
           mother_name = excluded.mother_name, mother_phone_number = excluded.mother_phone_number,
           guardian_name = excluded.guardian_name, guardian_phone_number = excluded.guardian_phone_number`,
        [s.email, s.batch_year, s.roll_number, s.full_name, s.programme, s.department, s.hostel,
         s.father_name, s.father_phone_number, s.mother_name, s.mother_phone_number,
         s.guardian_name, s.guardian_phone_number]
      );
    }
    for (const e of EMPLOYEES) {
      await client.query(
        `insert into public.institute_employees
           (email, employee_id, full_name, department, employee_type, designation, phone, office_number, gender)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         on conflict (lower(email)) do update set
           employee_id = excluded.employee_id, full_name = excluded.full_name,
           department = excluded.department, employee_type = excluded.employee_type,
           designation = excluded.designation, phone = excluded.phone,
           office_number = excluded.office_number, gender = excluded.gender`,
        [e.email, e.employee_id, e.full_name, e.department, e.employee_type, e.designation, e.phone, e.office_number, e.gender]
      );
    }
    for (const o of OFFICES) {
      await client.query(
        `insert into public.institute_offices
           (office_email, office_name, office_type, phone, department_head, head_name, head_email)
         values ($1,$2,$3,$4,$5,$6,$7)
         on conflict (lower(office_email)) do update set
           office_name = excluded.office_name, office_type = excluded.office_type,
           phone = excluded.phone, department_head = excluded.department_head,
           head_name = excluded.head_name, head_email = excluded.head_email`,
        [o.office_email, o.office_name, o.office_type, o.phone, o.department_head, o.head_name, o.head_email]
      );
    }
    for (const f of FCCS) {
      await client.query(
        `insert into public.institute_fcc (council_email, council_name, event_or_council, faculty_advisor_email)
         values ($1,$2,$3,$4)
         on conflict (lower(council_email)) do update set
           council_name = excluded.council_name, event_or_council = excluded.event_or_council,
           faculty_advisor_email = excluded.faculty_advisor_email`,
        [f.council_email, f.council_name, f.event_or_council, f.faculty_advisor_email]
      );
    }
    for (const w of WARDENS) {
      await client.query(
        `insert into public.institute_wardens (warden_email, full_name, warden_phone, warden_role, hostel_id)
         values ($1,$2,$3,$4,$5)
         on conflict (lower(warden_email)) do update set
           full_name = excluded.full_name, warden_phone = excluded.warden_phone,
           warden_role = excluded.warden_role, hostel_id = excluded.hostel_id`,
        [w.warden_email, w.full_name, w.warden_phone, w.warden_role, w.hostel_id]
      );
    }
    say(
      `institute records: ${STUDENTS.length} students, ${EMPLOYEES.length} employees, ` +
        `${OFFICES.length} offices, ${FCCS.length} councils, ${WARDENS.length} wardens`
    );

    // 8. The official whitelist - replaced, not added to: an address left on
    //    it is an account that may still book as an office.
    await client.query("delete from public.official_email_whitelist");
    for (const email of WHITELIST) {
      await client.query("insert into public.official_email_whitelist (email) values ($1)", [email]);
    }
    say(`official_email_whitelist: ${WHITELIST.length} addresses`);

    // 9. Retire everything else.
    //
    //    **Deleted where the row is nobody's record, retired where it is.**
    //    Two things make an account undeletable, and neither is a problem
    //    with the account: a **booking** points at it (`bookings.user_id`
    //    is `no action`, and the booking is somebody's stay), or a
    //    **security_audit** row does - that table is append-only by
    //    trigger, so the FK's `on delete set null` is itself refused, and
    //    any account that has ever signed in has such a row. Those are set
    //    to `account_status = 'retired'`, which stops them signing in and
    //    takes them off the picker, and are named on screen.
    if (!keepExtra) {
      const keep = PROFILES.map((p) => p.email.toLowerCase());
      const { rows: extra } = await client.query(
        `select p.id, p.email, p.role,
                (select count(*) from public.bookings b
                  where b.user_id = p.id or b.created_by = p.id) as bookings,
                (select count(*) from public.security_audit a where a.actor_id = p.id) as audits
           from public.profiles p
          where lower(p.email) <> all($1::text[])
          order by p.email`,
        [keep]
      );
      if (dropOrphans) {
        const withBookings = extra.filter((r) => Number(r.bookings) > 0);
        for (const row of withBookings) {
          const { rowCount } = await client.query(
            "delete from public.bookings where user_id = $1 or created_by = $1",
            [row.id]
          );
          row.bookings = "0";
          say(`dropped ${rowCount} booking(s) belonging to ${row.email}`);
        }
      }
      const deletable = extra.filter(
        (r) => Number(r.bookings) === 0 && Number(r.audits) === 0
      );
      const held = extra.filter((r) => !deletable.includes(r));
      for (const row of extra) {
        await client.query("delete from public.institute_students where lower(email) = lower($1)", [row.email]);
        await client.query("delete from public.institute_employees where lower(email) = lower($1)", [row.email]);
        await client.query("delete from public.institute_wardens where lower(warden_email) = lower($1)", [row.email]);
        await client.query("delete from public.institute_offices where lower(office_email) = lower($1)", [row.email]);
        await client.query("delete from public.institute_fcc where lower(council_email) = lower($1)", [row.email]);
      }
      for (const row of deletable) {
        await client.query("delete from public.profiles where id = $1", [row.id]);
      }
      for (const row of held) {
        await client.query(
          "update public.profiles set account_status = 'retired' where id = $1",
          [row.id]
        );
        await client.query("delete from public.sessions where user_id = $1", [row.id]);
      }
      say(`deleted: ${deletable.length} accounts not in the set`);
      if (held.length > 0) {
        say(
          `retired (they have a booking or an audit trail, so the row stays): ` +
            held.map((r) => r.email).join(", ")
        );
      }
    }

    await client.query("commit");
    await report(client);
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  } finally {
    await client.end();
  }
}

/** What the database holds now, as the picker will group it. */
async function report(client) {
  const { rows } = await client.query(
    `select role, full_name, email, hostel_name, department_or_club
       from public.profiles_v where account_status = 'active' order by role, full_name`
  );
  say("\nAccounts now in the database:");
  let role = null;
  for (const r of rows) {
    if (r.role !== role) {
      role = r.role;
      say(`\n  ${role}`);
    }
    const where = [r.hostel_name, r.department_or_club].filter(Boolean).join(" · ");
    say(`    ${r.full_name.padEnd(38)} ${r.email}${where ? `  (${where})` : ""}`);
  }
  say(`\n${rows.length} accounts. Sign in at /mock-login - no password.`);
}

async function reportPlan(client) {
  const keep = PROFILES.map((p) => p.email.toLowerCase());
  const { rows } = await client.query(
    `select p.email,
            (select count(*) from public.bookings b
              where b.user_id = p.id or b.created_by = p.id) as bookings,
            (select count(*) from public.security_audit a where a.actor_id = p.id) as audits
       from public.profiles p where lower(p.email) <> all($1::text[]) order by p.email`,
    [keep]
  );
  say(`\nWould add or update ${PROFILES.length} accounts.`);
  const free = (r) => Number(r.bookings) === 0 && Number(r.audits) === 0;
  const deletable = rows.filter(free).map((r) => r.email);
  const held = rows.filter((r) => !free(r)).map((r) => r.email);
  say(`Would delete ${deletable.length}: ${deletable.join(", ") || "none"}`);
  if (held.length > 0) say(`Would retire ${held.length}: ${held.join(", ")}`);
}

main().catch((error) => {
  console.error("\nSeeding failed:", error.message ?? error);
  process.exit(1);
});
