import { describe, expect, it } from "vitest";
import {
  seedInstituteEmployees,
  seedInstituteFCCs,
  seedInstituteHostels,
  seedInstituteOffices,
  seedInstituteStudents,
  seedInstituteWardens,
  seedOfficialEmails,
  seedProfiles,
  seedUnits,
} from "@/lib/store/seed";
// The Postgres seed is a plain Node script, because a Node script cannot
// import TypeScript. That is the only reason the persona set is written
// twice, and this file is what stops the two copies drifting.
import {
  EMPLOYEES,
  FCCS,
  HOSTELS,
  OFFICES,
  PROFILES,
  STUDENTS,
  UNITS,
  WARDENS,
  WHITELIST,
} from "../scripts/seed-personas.mjs";

/**
 * **`lib/store/seed.ts` and `scripts/seed-personas.mjs` describe the same
 * people.** One seeds the JSON mock store, the other a PostgreSQL database;
 * an account that exists in one and not the other is a persona that works
 * in the tests and not in the office's database, or the reverse.
 *
 * Compared on the natural keys - email, name, role, which unit, which
 * hostel - rather than field by field: the two files carry different ids
 * (mock strings against uuids Postgres mints) and the script leaves a few
 * nullable columns out.
 */

const sorted = <T>(xs: T[]) => [...xs].sort();

describe("the mock seed and the Postgres seed hold the same accounts", () => {
  it("the same emails, with the same names and roles", () => {
    const mock = seedProfiles.map((p) => `${p.email}|${p.full_name}|${p.role}`);
    const sql = PROFILES.map((p: { email: string; full_name: string; role: string }) =>
      `${p.email}|${p.full_name}|${p.role}`
    );
    expect(sorted(sql)).toEqual(sorted(mock));
  });

  it("puts each account in the same unit", () => {
    const unitName = new Map(seedUnits.map((u) => [u.id, u.name]));
    const mock = seedProfiles.map((p) => `${p.email}|${p.unit_id ? unitName.get(p.unit_id) : ""}`);
    const sqlUnitName = new Map(
      UNITS.map((u: { key: string; name: string }) => [u.key, u.name])
    );
    const sql = PROFILES.map((p: { email: string; unit: string | null }) =>
      `${p.email}|${p.unit ? sqlUnitName.get(p.unit) : ""}`
    );
    expect(sorted(sql)).toEqual(sorted(mock));
  });

  it("the same units, with the same category, class, parent, head and advisor", () => {
    const name = new Map(seedUnits.map((u) => [u.id, u.name]));
    const person = new Map(seedProfiles.map((p) => [p.id, p.email]));
    const mock = seedUnits.map((u) =>
      [
        u.name,
        u.category,
        u.office_type ?? "",
        u.parent_department_id ? name.get(u.parent_department_id) : "",
        u.head_id ? person.get(u.head_id) : "",
        u.faculty_advisor_id ? person.get(u.faculty_advisor_id) : "",
        u.secretary_email ?? "",
      ].join("|")
    );
    const sqlName = new Map(UNITS.map((u: { key: string; name: string }) => [u.key, u.name]));
    const sqlPerson = new Map(
      PROFILES.map((p: { key: string; email: string }) => [p.key, p.email])
    );
    type SqlUnit = {
      key: string; name: string; category: string; office_type: string | null;
      parent: string | null; head: string | null; advisor: string | null;
      secretary_email: string | null;
    };
    const sql = (UNITS as SqlUnit[]).map((u) =>
      [
        u.name,
        u.category,
        u.office_type ?? "",
        u.parent ? sqlName.get(u.parent) : "",
        u.head ? sqlPerson.get(u.head) : "",
        u.advisor ? sqlPerson.get(u.advisor) : "",
        u.secretary_email ?? "",
      ].join("|")
    );
    expect(sorted(sql)).toEqual(sorted(mock));
  });

  it("the same hostels", () => {
    const mock = seedInstituteHostels.map((h) => `${h.hostel_id}|${h.hostel_name}`);
    const sql = HOSTELS.map((h: { hostel_id: string; hostel_name: string }) =>
      `${h.hostel_id}|${h.hostel_name}`
    );
    expect(sorted(sql)).toEqual(sorted(mock));
  });

  it("the same students, in the same hostels, with the same family on record", () => {
    const key = (s: {
      email: string; roll_number: string | null; programme: string | null; hostel: string | null;
      father_name: string | null; mother_name: string | null; guardian_name: string | null;
    }) =>
      [s.email, s.roll_number ?? "", s.programme ?? "", s.hostel ?? "", s.father_name ?? "",
       s.mother_name ?? "", s.guardian_name ?? ""].join("|");
    expect(sorted(STUDENTS.map(key))).toEqual(sorted(seedInstituteStudents.map(key)));
  });

  it("the same employees, with the same teaching / non-teaching category", () => {
    const key = (e: { email: string; employee_type: string | null; department: string | null }) =>
      [e.email, e.employee_type ?? "", e.department ?? ""].join("|");
    expect(sorted(EMPLOYEES.map(key))).toEqual(sorted(seedInstituteEmployees.map(key)));
  });

  it("the same offices and councils", () => {
    const office = (o: { office_email: string; office_type: string | null; head_email: string | null }) =>
      [o.office_email, o.office_type ?? "", o.head_email ?? ""].join("|");
    expect(sorted(OFFICES.map(office))).toEqual(sorted(seedInstituteOffices.map(office)));
    const fcc = (f: { council_email: string; faculty_advisor_email: string | null }) =>
      [f.council_email, f.faculty_advisor_email ?? ""].join("|");
    expect(sorted(FCCS.map(fcc))).toEqual(sorted(seedInstituteFCCs.map(fcc)));
  });

  it("the same wardens, at the same rank and hostel", () => {
    const key = (w: { warden_email: string; warden_role: string | null; hostel_id: string | null }) =>
      [w.warden_email, w.warden_role ?? "", w.hostel_id ?? ""].join("|");
    expect(sorted(WARDENS.map(key))).toEqual(sorted(seedInstituteWardens.map(key)));
  });

  it("the same official whitelist", () => {
    expect(sorted(WHITELIST as string[])).toEqual(sorted(seedOfficialEmails));
  });

  it("gives every warden account a row in institute_wardens, and the reverse", () => {
    const wardenRoles = ["warden", "deputy_warden", "assistant_warden"];
    const accounts = sorted(
      seedProfiles.filter((p) => wardenRoles.includes(p.role)).map((p) => p.email.toLowerCase())
    );
    const records = sorted(seedInstituteWardens.map((w) => w.warden_email.toLowerCase()));
    expect(records).toEqual(accounts);
  });

  it("gives every student account a row in institute_students, and the reverse", () => {
    const accounts = sorted(
      seedProfiles.filter((p) => p.role === "student").map((p) => p.email.toLowerCase())
    );
    const records = sorted(seedInstituteStudents.map((s) => s.email.toLowerCase()));
    expect(records).toEqual(accounts);
  });

  it("points every warden record at a hostel that exists", () => {
    const ids = new Set(seedInstituteHostels.map((h) => h.hostel_id));
    for (const w of seedInstituteWardens) expect(ids.has(w.hostel_id ?? "")).toBe(true);
  });

  it("puts every student in a hostel that exists, or in none", () => {
    const names = new Set(seedInstituteHostels.map((h) => h.hostel_name));
    for (const s of seedInstituteStudents) {
      if (s.hostel !== null) expect(names.has(s.hostel)).toBe(true);
    }
  });

  it("whitelists exactly the accounts that book as an office", () => {
    const officials = sorted(
      seedProfiles.filter((p) => p.role === "official").map((p) => p.email.toLowerCase())
    );
    expect(sorted(seedOfficialEmails.map((e) => e.toLowerCase()))).toEqual(officials);
  });
});
