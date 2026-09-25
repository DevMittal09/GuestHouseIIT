import type { AcademicRecord, AcademicRecordKind, AcademicSource } from "./types";

/**
 * Dummy academic records, one per seeded persona that the academic database
 * would describe, standing in until the real database is connected
 * (`ACADEMIC_DB_URL`). Listed in `.memories/17-academic-records.md` — keep the
 * two in step.
 *
 * Matched by institute email, so these line up with the profiles in
 * `lib/store/seed.ts` and `supabase/seed.sql`. Every value is invented; the
 * phone numbers are the obviously fake `+91 90000 …` range.
 *
 * Rahul has no parents' names on record, so his card shows the guardian
 * instead — the one persona that exercises that rule.
 */
const RECORDS: AcademicRecord[] = [
  // ----- Students -----
  {
    kind: "student",
    roll_number: "112201001",
    name: "Anjali Menon",
    program: "B.Tech",
    department: "Computer Science and Engineering",
    email: "112201001@smail.iitpkd.ac.in",
    phone: "+91 90000 00101",
    father_name: "Ramesh Menon",
    mother_name: "Sreeja Menon",
    guardian_name: null,
    hostel: "Malhar",
  },
  {
    kind: "student",
    roll_number: "142202014",
    name: "Rahul Nair",
    program: "M.Tech",
    department: "Electrical Engineering",
    email: "142202014@smail.iitpkd.ac.in",
    phone: "+91 90000 00102",
    father_name: null,
    mother_name: null,
    guardian_name: "Gopinath Nair",
    hostel: "Saveri",
  },
  // ----- Faculty and non-faculty -----
  {
    kind: "employee",
    employee_id: "FAC-1042",
    name: "Dr. Priya Sharma",
    department: "Computer Science and Engineering",
    employee_type: "Faculty — Assistant Professor",
    phone: "+91 90000 00201",
    email: "priya@iitpkd.ac.in",
    office_number: "0491 000 1042",
  },
  {
    kind: "employee",
    employee_id: "FAC-1057",
    name: "Dr. Arun Prasad",
    department: "Computer Science and Engineering",
    employee_type: "Faculty — Associate Professor",
    phone: "+91 90000 00202",
    email: "arun.prasad@iitpkd.ac.in",
    office_number: "0491 000 1057",
  },
  // ----- Offices -----
  {
    kind: "office",
    department: "Director's Office",
    email: "admin@iitpkd.ac.in",
    phone: "+91 90000 00301",
    head_name: "Director",
    head_email: "director@iitpkd.ac.in",
  },
  {
    kind: "office",
    department: "International & Alumni Relations",
    email: "iar@iitpkd.ac.in",
    phone: "+91 90000 00302",
    head_name: "Dean, International & Alumni Relations",
    head_email: "dean.iar@iitpkd.ac.in",
  },
  // ----- Student representatives -----
  {
    kind: "student_rep",
    representative_type: "Fest Council — Petrichor",
    email: "petrichor@iitpkd.ac.in",
    phone: "+91 90000 00401",
    faculty_in_charge_email: "arun.prasad@iitpkd.ac.in",
  },
  {
    kind: "student_rep",
    representative_type: "Council — Cultural Affairs (Secretary)",
    email: "sec_arts@iitpkd.ac.in",
    phone: "+91 90000 00402",
    faculty_in_charge_email: "arun.prasad@iitpkd.ac.in",
  },
  // ----- Alumni office -----
  {
    kind: "alumni_office",
    department: "International & Alumni Relations — Alumni Cell",
    email: "alumnicell@iitpkd.ac.in",
    phone: "+91 90000 00501",
  },
  // ----- Wardens -----
  {
    kind: "warden",
    name: "Dr. Suresh Kumar",
    phone: "+91 90000 00601",
    email: "warden.malhar@iitpkd.ac.in",
    hostel: "Malhar",
  },
  {
    kind: "warden",
    name: "Dr. Lakshmi Devi",
    phone: "+91 90000 00602",
    email: "warden.saveri@iitpkd.ac.in",
    hostel: "Saveri",
  },
];

export class MockAcademicSource implements AcademicSource {
  readonly description = "mock academic records";

  async find(kind: AcademicRecordKind, email: string): Promise<AcademicRecord | null> {
    return RECORDS.find((r) => r.kind === kind && r.email?.toLowerCase() === email) ?? null;
  }
}
