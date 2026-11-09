import type { AcademicFind, AcademicRecord, AcademicRecordKind, AcademicSource } from "./types";

/**
 * Dummy academic records, one per seeded persona that the academic database
 * would describe, standing in until the real database is connected
 * (`ACADEMIC_DB_URL`) and sitting **behind** whatever the office has pasted
 * into Console -> Academic records (`StoreAcademicSource`). Listed in
 * `.memories/11-booking-forms.md` Part 2 - keep the two in step.
 *
 * Matched by institute email, so these line up with the profiles in
 * `lib/store/seed.ts` and with `seedInstituteStudents` beside them. Every
 * value is invented; the phone numbers are the obviously fake `+91 90000 …`
 * range.
 *
 * The four students differ in what the record names, because that is what
 * `guestNameRule` locks: **both parents** (Arjun), **the father only**
 * (Nikhil - his mother is not offered at all, there being no name to lock
 * it to), **neither, so the guardian** (Fathima), and a day scholar with no
 * hostel (Devika).
 */
const RECORDS: AcademicRecord[] = [
  // ----- Students -----
  {
    kind: "student",
    roll_number: "112301007",
    name: "Arjun Pillai",
    program: "B.Tech",
    department: "Computer Science and Engineering",
    email: "btech.saveri@smail.iitpkd.ac.in",
    phone: "+91 90000 00101",
    father_name: "Mohanan Pillai",
    mother_name: "Radhika Pillai",
    guardian_name: null,
    hostel: "Saveri Boys",
  },
  {
    kind: "student",
    roll_number: "202104003",
    name: "Nikhil Varma",
    program: "PhD",
    department: "Chemistry",
    email: "phd.malhar@smail.iitpkd.ac.in",
    phone: "+91 90000 00102",
    father_name: "Sudhakara Varma",
    mother_name: null,
    guardian_name: null,
    hostel: "Malhar Boys",
  },
  {
    kind: "student",
    roll_number: "142303011",
    name: "Fathima Rasheed",
    program: "MS",
    department: "Data Science and Engineering",
    email: "ms.tilang@smail.iitpkd.ac.in",
    phone: "+91 90000 00103",
    father_name: null,
    mother_name: null,
    guardian_name: "Abdul Rasheed",
    hostel: "Tilang A Girls",
  },
  {
    kind: "student",
    roll_number: "122303099",
    name: "Devika Iyer",
    program: "B.Tech",
    department: "Mechanical Engineering",
    email: "dayscholar@smail.iitpkd.ac.in",
    phone: "+91 90000 00104",
    father_name: "Krishnan Iyer",
    mother_name: "Sudha Iyer",
    guardian_name: null,
    hostel: null,
  },
  {
    kind: "student",
    roll_number: "112301045",
    name: "Meera Nair",
    program: "B.Tech",
    department: "Computer Science and Engineering",
    email: "secretary.arts@smail.iitpkd.ac.in",
    phone: "+91 90000 00105",
    father_name: "Rajan Nair",
    mother_name: "Bindu Nair",
    guardian_name: null,
    hostel: "Malhar Girls",
  },
  // ----- Faculty and non-faculty -----
  {
    kind: "employee",
    employee_id: "FAC-1042",
    name: "Dr. Priya Sharma",
    department: "Computer Science and Engineering",
    employee_type: "Faculty - Assistant Professor",
    phone: "+91 90000 00201",
    email: "faculty.cse@iitpkd.ac.in",
    office_number: "0491 000 1042",
  },
  {
    kind: "employee",
    employee_id: "FAC-1001",
    name: "Prof. R. Venkatesh",
    department: "Computer Science and Engineering",
    employee_type: "Faculty - Professor",
    phone: "+91 90000 00202",
    email: "hod.cse@iitpkd.ac.in",
    office_number: "0491 000 1001",
  },
  {
    kind: "employee",
    employee_id: "FAC-1002",
    name: "Prof. S. Anand",
    department: "Data Science and Engineering",
    employee_type: "Faculty - Professor",
    phone: "+91 90000 00203",
    email: "hod.dse@iitpkd.ac.in",
    office_number: "0491 000 1002",
  },
  {
    kind: "employee",
    employee_id: "FAC-1057",
    name: "Dr. Arun Prasad",
    department: "Computer Science and Engineering",
    employee_type: "Faculty - Associate Professor",
    phone: "+91 90000 00204",
    email: "advisor.cultural@iitpkd.ac.in",
    office_number: "0491 000 1057",
  },
  {
    kind: "employee",
    employee_id: "STF-2210",
    name: "Ravi Kumar",
    department: "Computer Science and Engineering",
    employee_type: "Non Teaching Staff - Junior Technical Superintendent",
    phone: "+91 90000 00205",
    email: "staff.cse@iitpkd.ac.in",
    office_number: "0491 000 2210",
  },
  {
    kind: "employee",
    employee_id: "STF-1000",
    name: "Dr. Mohan Das",
    department: "Administration",
    employee_type: "Non Teaching Staff - Registrar",
    phone: "+91 90000 00206",
    email: "registrar@iitpkd.ac.in",
    office_number: "0491 000 1000",
  },
  // ----- Offices -----
  {
    kind: "office",
    department: "Office of the Director",
    email: "director_iitpkd@iitpkd.ac.in",
    phone: "+91 90000 00301",
    head_name: "Director",
    head_email: "director@iitpkd.ac.in",
  },
  {
    kind: "office",
    department: "Office of the Registrar",
    email: "ro@iitpkd.ac.in",
    phone: "+91 90000 00302",
    head_name: "Dr. Mohan Das",
    head_email: "registrar@iitpkd.ac.in",
  },
  {
    kind: "office",
    department: "CSE Department Office",
    email: "office_cs@iitpkd.ac.in",
    phone: "+91 90000 00303",
    head_name: "Prof. R. Venkatesh",
    head_email: "hod.cse@iitpkd.ac.in",
  },
  {
    kind: "office",
    department: "Data Science Department Office",
    email: "office_ds@iitpkd.ac.in",
    phone: "+91 90000 00304",
    head_name: "Prof. S. Anand",
    head_email: "hod.dse@iitpkd.ac.in",
  },
  {
    kind: "office",
    department: "International & Alumni Relations",
    email: "iar@iitpkd.ac.in",
    phone: "+91 90000 00305",
    head_name: "Dean, International & Alumni Relations",
    head_email: "dean.iar@iitpkd.ac.in",
  },
  // ----- Student representatives -----
  {
    kind: "student_rep",
    representative_type: "Fest Council - Petrichor",
    email: "petrichor@iitpkd.ac.in",
    phone: "+91 90000 00401",
    faculty_in_charge_email: "advisor.cultural@iitpkd.ac.in",
  },
  {
    kind: "student_rep",
    representative_type: "Council - Cultural Affairs (Secretary)",
    email: "sec_arts@iitpkd.ac.in",
    phone: "+91 90000 00402",
    faculty_in_charge_email: "advisor.cultural@iitpkd.ac.in",
  },
  // ----- Alumni office -----
  {
    kind: "alumni_office",
    department: "International & Alumni Relations - Alumni Cell",
    email: "alumnicell@iitpkd.ac.in",
    phone: "+91 90000 00501",
  },
  // ----- Wardens -----
  // The three ranks per hostel, and the one hostel with only a Warden.
  {
    kind: "warden",
    name: "Dr. Suresh Kumar",
    phone: "+91 90000 00601",
    email: "warden.malharboys@iitpkd.ac.in",
    hostel: "Malhar Boys",
  },
  {
    kind: "warden",
    name: "Dr. Geetha Menon",
    phone: "+91 90000 00602",
    email: "dwarden.malharboys@iitpkd.ac.in",
    hostel: "Malhar Boys",
  },
  {
    kind: "warden",
    name: "Mr. Sajeev Thomas",
    phone: "+91 90000 00603",
    email: "awarden.malharboys@iitpkd.ac.in",
    hostel: "Malhar Boys",
  },
  {
    kind: "warden",
    name: "Dr. Lakshmi Devi",
    phone: "+91 90000 00604",
    email: "muhamed.rizwan2222@gmail.com",
    hostel: "Saveri Boys",
  },
  {
    kind: "warden",
    name: "Dr. Vinod Raj",
    phone: "+91 90000 00605",
    email: "dwarden.saveriboys@iitpkd.ac.in",
    hostel: "Saveri Boys",
  },
  {
    kind: "warden",
    name: "Ms. Anu George",
    phone: "+91 90000 00606",
    email: "student.iitpkd01@gmail.com",
    hostel: "Saveri Boys",
  },
  {
    kind: "warden",
    name: "Dr. Shalini Rao",
    phone: "+91 90000 00607",
    email: "warden.tilangagirls@iitpkd.ac.in",
    hostel: "Tilang A Girls",
  },
];

export class MockAcademicSource implements AcademicSource {
  readonly description = "mock academic records";

  async find(kind: AcademicRecordKind, email: string): Promise<AcademicFind | null> {
    const record = RECORDS.find((r) => r.kind === kind && r.email?.toLowerCase() === email);
    return record ? { record, origin: "sample" } : null;
  }
}
