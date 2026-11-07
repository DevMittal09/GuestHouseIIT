import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  guestNameRule,
  isRecordedGuest,
  isRelationshipWithheld,
  lockedNameError,
  lockedNameFor,
  NO_GUEST_NAME_RULE,
  withheldRelationshipError,
} from "@/lib/academic/guest-names";
import { splitCsvLine } from "@/lib/csv";
import {
  columnForKind,
  csvColumnsFor,
  csvHeaderFor,
  describeImport,
  headerColumnsForKind,
  planInstituteImport,
} from "@/lib/institute/import";
import type { EmployeeRecord, StudentRecord } from "@/lib/academic/types";
import { bookingPayloadSchema } from "@/lib/booking-schema";
import { buildDefaultFormConfig, sanitizeFormConfig } from "@/lib/form-config";
import { DEFAULT_RULES } from "@/lib/settings";
import type { DataStore } from "@/lib/store/types";
import { addDaysToDateValue, toInstituteDateValue } from "@/lib/tz";
import { GH, useThrowawayMockDb } from "./helpers";

/**
 * The office's eighth list (7 Oct 2026), phase 2: the institute's records
 * kept in the portal (migration 28 -> migration 35), the "Fill in..." list
 * withdrawn, and a student's parents taken from the record instead of typed.
 */

const ANJALI: StudentRecord = {
  kind: "student",
  roll_number: "112201001",
  name: "Nikhil Varma",
  program: "B.Tech",
  department: "Computer Science and Engineering",
  email: "phd.malhar@smail.iitpkd.ac.in",
  phone: "+91 90000 00101",
  father_name: "Ramesh Menon",
  mother_name: "Sreeja Menon",
  guardian_name: null,
  hostel: "Malhar Boys",
};

/** Rahul has neither parent on record - the one persona with a guardian. */
const RAHUL: StudentRecord = {
  ...ANJALI,
  roll_number: "142202014",
  name: "Arjun Pillai",
  email: "btech.saveri@smail.iitpkd.ac.in",
  father_name: null,
  mother_name: null,
  guardian_name: "Gopinath Nair",
  hostel: "Saveri Boys",
};

const STUDENT_OPTIONS = ["Mother", "Father", "Guardian", "Grandmother", "Grandfather", "Siblings", "Self"];

// -------------------------------------------- parents locked from the record

describe("a student's parents come from the record", () => {
  it("locks the names the record has and withholds the ones it does not", () => {
    const rule = guestNameRule(ANJALI, STUDENT_OPTIONS);
    expect(rule.fromRecord).toBe(true);
    expect(rule.locked).toEqual({ Father: "Ramesh Menon", Mother: "Sreeja Menon" });
    // A parent on record, so no guardian may be booked.
    expect(rule.withheld).toEqual(["Guardian"]);
    expect(lockedNameFor(rule, "father")).toBe("Ramesh Menon");
    expect(lockedNameFor(rule, "Siblings")).toBeNull();
    expect(isRelationshipWithheld(rule, "guardian")).toBe(true);
    expect(isRelationshipWithheld(rule, "Grandmother")).toBe(false);
  });

  it("offers the guardian only when the record names neither parent", () => {
    const rule = guestNameRule(RAHUL, STUDENT_OPTIONS);
    expect(rule.locked).toEqual({ Guardian: "Gopinath Nair" });
    // Neither parent is on record, so neither is offered.
    expect(rule.withheld.sort()).toEqual(["Father", "Mother"]);
  });

  it("leaves the guardian open when the record names nobody at all", () => {
    const bare = { ...RAHUL, guardian_name: null };
    const rule = guestNameRule(bare, STUDENT_OPTIONS);
    expect(rule.locked).toEqual({});
    // Guardian is still selectable: the record has nothing to say about them,
    // and the student has to be able to bring somebody.
    expect(rule.withheld.sort()).toEqual(["Father", "Mother"]);
    expect(isRelationshipWithheld(rule, "Guardian")).toBe(false);
  });

  it("locks and withholds nothing without a record, and nothing for other kinds", () => {
    expect(guestNameRule(null, STUDENT_OPTIONS)).toEqual(NO_GUEST_NAME_RULE);
    const employee: EmployeeRecord = {
      kind: "employee",
      employee_id: "F1",
      name: "Dr. Priya Sharma",
      department: null,
      employee_type: null,
      phone: null,
      email: "faculty.cse@iitpkd.ac.in",
      office_number: null,
    };
    expect(guestNameRule(employee, STUDENT_OPTIONS)).toEqual(NO_GUEST_NAME_RULE);
  });

  it("follows the Form Builder's own spelling, and drops a renamed option", () => {
    // Matched ignoring case, and keyed by the option as the console spells it.
    expect(guestNameRule(ANJALI, ["father", "MOTHER", "Siblings"]).locked).toEqual({
      father: "Ramesh Menon",
      MOTHER: "Sreeja Menon",
    });
    // Renamed out of recognition: nothing is locked, and nothing is withheld
    // either - a form that offers no "Father" cannot be refused one.
    const renamed = guestNameRule(ANJALI, ["Dad", "Mum", "Siblings"]);
    expect(renamed.locked).toEqual({});
    expect(renamed.withheld).toEqual([]);
  });

  it("names the guest whose name is not the record's, and the one who cannot be booked", () => {
    const rule = guestNameRule(ANJALI, STUDENT_OPTIONS);
    expect(lockedNameError(rule, { name: "Ramesh Menon", relationship: "Father" })).toBeNull();
    // Spacing and case are not differences.
    expect(lockedNameError(rule, { name: "  ramesh   menon ", relationship: "Father" })).toBeNull();
    expect(lockedNameError(rule, { name: "Someone Else", relationship: "Father" })).toMatch(
      /on your academic record as Ramesh Menon/
    );
    // Nothing is said about a relationship the record does not fix.
    expect(lockedNameError(rule, { name: "Priya", relationship: "Siblings" })).toBeNull();
    expect(withheldRelationshipError(rule, { relationship: "Guardian" })).toMatch(
      /neither parent/
    );
    expect(withheldRelationshipError(rule, { relationship: "Siblings" })).toBeNull();
    expect(withheldRelationshipError(guestNameRule(RAHUL, STUDENT_OPTIONS), { relationship: "Father" })).toMatch(
      /does not name a father/i
    );
  });

  it("counts a recorded guest as identified, and a typed one as not", () => {
    const rule = guestNameRule(ANJALI, STUDENT_OPTIONS);
    expect(isRecordedGuest(rule, { relationship: "Mother" })).toBe(true);
    expect(isRecordedGuest(rule, { relationship: "Siblings" })).toBe(false);
    expect(isRecordedGuest(rule, { relationship: null })).toBe(false);
  });
});

// ------------------------------------------------- the same rules, on submit

describe("the schema applies the record on both sides", () => {
  const houses = [GH];
  const config = sanitizeFormConfig(buildDefaultFormConfig("student", houses), houses);
  const rule = guestNameRule(ANJALI, config.relationship_options);
  const today = toInstituteDateValue(new Date());

  const schema = (withRecord = true) =>
    bookingPayloadSchema(config, {
      mealsAvailable: false,
      rules: DEFAULT_RULES,
      debitHeads: { room: { personal: ["personal_funds"] }, dining: {} },
      guestNames: withRecord ? rule : undefined,
    });

  const payload = (guests: Record<string, unknown>[]) => ({
    guest_house_id: GH.id,
    service_type: "room",
    booking_type: "personal",
    purpose_of_visit: "My parents are visiting",
    check_in: `${addDaysToDateValue(today, 1)}T12:00`,
    check_out: `${addDaysToDateValue(today, 2)}T10:00`,
    rooms: [{ room_type: null, guests }],
    meals: [],
  });

  const father = {
    name: "Ramesh Menon",
    age: "55",
    gender: "male",
    relationship: "Father",
    citizenship: "indian",
  };

  it("takes the father the record names", () => {
    const ok = schema().safeParse(payload([father]));
    if (!ok.success) throw new Error(JSON.stringify(ok.error.issues));
    expect(ok.data.rooms[0].guests[0].name).toBe("Ramesh Menon");
  });

  it("refuses a different name under a locked relationship", () => {
    const bad = schema().safeParse(payload([{ ...father, name: "Someone Else" }]));
    expect(bad.success).toBe(false);
    expect(!bad.success && JSON.stringify(bad.error.issues)).toContain("academic record as Ramesh Menon");
  });

  it("refuses a relationship the record rules out", () => {
    const bad = schema().safeParse(
      payload([{ ...father, name: "Gopinath Nair", relationship: "Guardian" }])
    );
    expect(bad.success).toBe(false);
    expect(!bad.success && JSON.stringify(bad.error.issues)).toContain("neither parent");
  });

  /**
   * The Aadhaar relaxation. The student form demands an Aadhaar number, so
   * this is the one place the two kinds of guest come apart: the record's
   * father needs none, and a sibling typed by hand still does.
   */
  it("asks no Aadhaar of a guest the record named, and still asks a sibling", () => {
    expect(config.guest_fields.id_number).toBe("required");
    const recorded = schema().safeParse(payload([father]));
    expect(recorded.success).toBe(true);

    const sibling = schema().safeParse(
      payload([
        father,
        { name: "Priya Menon", age: "19", gender: "female", relationship: "Siblings", citizenship: "indian" },
      ])
    );
    expect(sibling.success).toBe(false);
    expect(!sibling.success && JSON.stringify(sibling.error.issues)).toContain("Aadhaar number is required");

    // With the sibling's Aadhaar given, and the father's still absent.
    const both = schema().safeParse(
      payload([
        father,
        {
          name: "Priya Menon",
          age: "19",
          gender: "female",
          relationship: "Siblings",
          citizenship: "indian",
          id_number: "432112345678",
        },
      ])
    );
    if (!both.success) throw new Error(JSON.stringify(both.error.issues));
    expect(both.data.rooms[0].guests[0].id_number).toBeNull();
  });

  it("asks for everything as before when there is no record", () => {
    const bare = schema(false).safeParse(payload([{ ...father, name: "Anyone At All" }]));
    expect(bare.success).toBe(false);
    // Not the locked-name error - the Aadhaar, which is what it always was.
    expect(!bare.success && JSON.stringify(bare.error.issues)).toContain("Aadhaar number is required");
    const withId = schema(false).safeParse(
      payload([{ ...father, name: "Anyone At All", id_number: "432112345678" }])
    );
    if (!withId.success) throw new Error(JSON.stringify(withId.error.issues));
    expect(withId.data.rooms[0].guests[0].name).toBe("Anyone At All");
  });
});

// ------------------------------------------------------------- the CSV paste

describe("pasting institute records in", () => {
  it("puts the key column first and every field of that kind after it", () => {
    expect(csvColumnsFor("student")[0]).toBe("email");
    expect(csvColumnsFor("employee")[0]).toBe("email");
    expect(csvColumnsFor("office")[0]).toBe("office_email");
    expect(csvColumnsFor("fcc")[0]).toBe("council_email");
    expect(csvColumnsFor("warden")[0]).toBe("warden_email");
    expect(csvHeaderFor("hostel")).toBe("hostel_id, hostel_name");
  });

  it("splits a spreadsheet's quoting, commas, tabs and semicolons", () => {
    expect(splitCsvLine('a@b.c, 112, Nikhil Varma')).toEqual(["a@b.c", "112", "Nikhil Varma"]);
    expect(splitCsvLine('a@b.c\t112\tAnjali')).toEqual(["a@b.c", "112", "Anjali"]);
    expect(splitCsvLine('a@b.c; 112; Anjali')).toEqual(["a@b.c", "112", "Anjali"]);
    // A quoted field keeps its commas, and "" is one quote.
    expect(splitCsvLine('a@b.c, "Physics, Applied", "O""Brien"')).toEqual([
      "a@b.c",
      "Physics, Applied",
      'O"Brien',
    ]);
  });

  it("adds, updates and leaves alone, and reads the header and comments past", () => {
    const existing = [
      {
        id: "row-1",
        email: "phd.malhar@smail.iitpkd.ac.in",
        batch_year: "2022",
        roll_number: "112201001",
        full_name: "Nikhil Varma",
        programme: "B.Tech",
        faculty_advisor_guide_name: null,
        department: "Computer Science and Engineering",
        phone: "+91 90000 00101",
        aadhar_number: null,
        father_name: "Ramesh Menon",
        father_aadhar_number: null,
        father_phone_number: null,
        mother_name: "Sreeja Menon",
        mother_aadhar_number: null,
        mother_phone_number: null,
        spouse_name: null,
        spouse_aadhar_number: null,
        spouse_phone_number: null,
        guardian_name: null,
        guardian_aadhar_number: null,
        guardian_phone_number: null,
        hostel: "Malhar Boys",
      },
    ];
    const text = [
      "# the office's list",
      csvHeaderFor("student"),
      "",
      "phd.malhar@smail.iitpkd.ac.in, 2022, 112201001, Nikhil Varma, B.Tech, , Computer Science and Engineering, +91 90000 00101, , Ramesh Menon, , , Sreeja Menon, , , , , , , , , Malhar Boys",
      "btech.saveri@smail.iitpkd.ac.in, 2022, 142202014, Arjun Pillai, M.Tech, , Electrical Engineering, , , , , , , , , , , , Gopinath Nair, , , Saveri Boys",
    ].join("\n");
    const plan = planInstituteImport("student", text, existing, "p-admin");
    expect(plan.problems).toEqual([]);
    expect(plan.unchanged).toBe(1);
    expect(plan.added).toHaveLength(1);
    expect(plan.added[0].email).toBe("btech.saveri@smail.iitpkd.ac.in");
    expect(plan.added[0].guardian_name).toBe("Gopinath Nair");
    expect(plan.added[0].hostel).toBe("Saveri Boys");
    expect(plan.added[0].imported_by).toBe("p-admin");
    expect(describeImport(plan)).toBe("1 added, 1 unchanged");
  });

  it("reads a short line as gaps rather than refusing it", () => {
    const plan = planInstituteImport("student", "new@smail.iitpkd.ac.in, 2022, 999", [], null);
    expect(plan.problems).toEqual([]);
    expect(plan.added[0]).toMatchObject({
      email: "new@smail.iitpkd.ac.in",
      batch_year: "2022",
      roll_number: "999",
      full_name: null,
      father_name: null,
      hostel: null,
    });
  });

  it("reads the office's dashes and N/A as a gap", () => {
    const plan = planInstituteImport(
      "employee",
      "new@iitpkd.ac.in, -, Dr. Someone, N/A, nil, none, NULL, --, Female",
      [],
      null
    );
    expect(plan.added[0]).toMatchObject({
      employee_id: null,
      full_name: "Dr. Someone",
      department: null,
      employee_type: null,
      designation: null,
      phone: null,
      office_number: null,
      gender: "Female",
    });
  });

  it("imports nothing when any line is wrong, and says which", () => {
    const plan = planInstituteImport(
      "employee",
      [
        "good@iitpkd.ac.in, F1, Fine",
        "not-an-email, F2, Broken",
        ", F3, No email at all",
        "good@iitpkd.ac.in, F4, Twice",
      ].join("\n"),
      [],
      null
    );
    expect(plan.added).toEqual([]);
    expect(plan.updated).toEqual([]);
    expect(plan.problems).toHaveLength(3);
    expect(plan.problems[0]).toContain("Line 2");
    expect(plan.problems[1]).toContain("Line 3");
    expect(plan.problems[2]).toContain("also given on line 1");
  });

  it("refuses a line with more columns than the kind has", () => {
    const plan = planInstituteImport(
      "warden",
      "w@iitpkd.ac.in, A Warden, +91 90000 00601, Chief Warden, H1, something extra",
      [],
      null
    );
    expect(plan.problems[0]).toContain("6 columns");
  });

  it("says so when there is nothing to import", () => {
    expect(planInstituteImport("student", "", [], null).problems[0]).toMatch(/Nothing to import/);
    expect(
      planInstituteImport("student", `# only a comment\n${csvHeaderFor("student")}`, [], null).problems[0]
    ).toMatch(/Nothing to import/);
  });
});

// ---------------------------------------------- header detection and column aliases

describe("header-aware import", () => {
  it("recognises column aliases", () => {
    expect(columnForKind("student", "email")).toBe("email");
    expect(columnForKind("student", "Email Address")).toBe("email");
    expect(columnForKind("student", "year_of_admission")).toBe("batch_year");
    expect(columnForKind("student", "Year of Admission")).toBe("batch_year");
    expect(columnForKind("student", "hostel_id")).toBe("hostel");
    expect(columnForKind("student", "Hostel ID")).toBe("hostel");
    expect(columnForKind("student", "programme")).toBe("programme");
    expect(columnForKind("student", "program")).toBe("programme");
    expect(columnForKind("student", "unknown_column")).toBeNull();
  });

  it("detects a header row and maps columns by name", () => {
    const fields = ["email", "roll_number", "full_name", "hostel_id"];
    const result = headerColumnsForKind("student", fields);
    expect(result).not.toBeNull();
    expect(result!.mapping).toEqual(["email", "roll_number", "full_name", "hostel"]);
    expect(result!.skipped).toEqual([]);
  });

  it("skips unknown columns in a header and reports them", () => {
    const fields = ["email", "role", "roll_number", "full_name"];
    const result = headerColumnsForKind("student", fields);
    expect(result).not.toBeNull();
    expect(result!.mapping).toEqual(["email", null, "roll_number", "full_name"]);
    expect(result!.skipped).toEqual(["role"]);
  });

  it("rejects a line that does not start with the key column", () => {
    expect(headerColumnsForKind("student", ["roll_number", "email"])).toBeNull();
    expect(headerColumnsForKind("student", [])).toBeNull();
  });

  it("imports with a header in non-default column order", () => {
    const text = [
      "email, hostel_id, full_name, roll_number",
      "a@smail.iitpkd.ac.in, Malhar Boys, Anjali, 112201001",
    ].join("\n");
    const plan = planInstituteImport("student", text, [], null);
    expect(plan.problems).toEqual([]);
    expect(plan.hadHeader).toBe(true);
    expect(plan.added).toHaveLength(1);
    expect(plan.added[0].hostel).toBe("Malhar Boys");
    expect(plan.added[0].full_name).toBe("Anjali");
    expect(plan.added[0].roll_number).toBe("112201001");
    expect(plan.added[0].father_name).toBeNull();
  });

  it("maps year_of_admission header to batch_year column", () => {
    const text = [
      "email, year_of_admission, roll_number",
      "a@smail.iitpkd.ac.in, 2022, 112201001",
    ].join("\n");
    const plan = planInstituteImport("student", text, [], null);
    expect(plan.problems).toEqual([]);
    expect(plan.hadHeader).toBe(true);
    expect(plan.added[0].batch_year).toBe("2022");
  });

  it("ignores unknown columns like 'role' in header mode", () => {
    const text = [
      "email, role, roll_number, full_name, hostel_id",
      "a@smail.iitpkd.ac.in, Student, 112201001, Anjali, Malhar Boys",
    ].join("\n");
    const plan = planInstituteImport("student", text, [], null);
    expect(plan.problems).toEqual([]);
    expect(plan.hadHeader).toBe(true);
    expect(plan.skippedHeaders).toEqual(["role"]);
    expect(plan.added[0].roll_number).toBe("112201001");
    expect(plan.added[0].full_name).toBe("Anjali");
    expect(plan.added[0].hostel).toBe("Malhar Boys");
  });

  it("allows more data columns than the kind has when a header is present", () => {
    const text = [
      "email, roll_number, role, full_name",
      "a@smail.iitpkd.ac.in, 112201001, Student, Anjali",
    ].join("\n");
    const plan = planInstituteImport("student", text, [], null);
    expect(plan.problems).toEqual([]);
    expect(plan.added).toHaveLength(1);
  });

  it("falls back to positional import without a header", () => {
    const plan = planInstituteImport(
      "student",
      "a@smail.iitpkd.ac.in, 2022, 112201001",
      [],
      null,
    );
    expect(plan.problems).toEqual([]);
    expect(plan.hadHeader).toBe(false);
    expect(plan.added[0].batch_year).toBe("2022");
    expect(plan.added[0].roll_number).toBe("112201001");
  });

  it("reports the detected columns and skipped headers in the plan", () => {
    const text = [
      "email, role, department, hostel",
      "a@smail.iitpkd.ac.in, Student, CSE, Malhar",
    ].join("\n");
    const plan = planInstituteImport("student", text, [], null);
    expect(plan.hadHeader).toBe(true);
    expect(plan.columns).toEqual(["email", "department", "hostel"]);
    expect(plan.skippedHeaders).toEqual(["role"]);
  });
});

// --------------------------------------------------------- the store, and the source

describe("the institute records the office imported", () => {
  const db = useThrowawayMockDb({
    profiles: [],
    guest_houses: [],
    rooms: [],
    bookings: [],
    booking_guests: [],
    booking_logs: [],
    form_configs: [],
    room_holds: [],
    institute_students: [],
    institute_employees: [],
    institute_offices: [],
    institute_fcc: [],
    institute_hostels: [],
    institute_wardens: [],
  });
  let store: DataStore;

  beforeAll(async () => {
    store = (await import("@/lib/store")).getStore();
  });
  afterAll(() => db.cleanup());

  it("stores, finds, updates and removes a student record", async () => {
    expect(await store.listStudents()).toEqual([]);
    await store.saveStudents(
      [
        {
          email: "phd.malhar@smail.iitpkd.ac.in",
          batch_year: "2022",
          roll_number: "112201001",
          full_name: "Nikhil Varma",
          programme: "B.Tech",
          faculty_advisor_guide_name: null,
          department: "Computer Science and Engineering",
          phone: "+91 90000 00101",
          aadhar_number: null,
          father_name: "Ramesh Menon",
          father_aadhar_number: null,
          father_phone_number: null,
          mother_name: "Sreeja Menon",
          mother_aadhar_number: null,
          mother_phone_number: null,
          spouse_name: null,
          spouse_aadhar_number: null,
          spouse_phone_number: null,
          guardian_name: null,
          guardian_aadhar_number: null,
          guardian_phone_number: null,
          hostel: "Malhar Boys",
          imported_by: "p-admin",
        },
      ],
      [],
    );
    const rows = await store.listStudents();
    expect(rows).toHaveLength(1);

    const found = await store.findStudent("phd.malhar@smail.iitpkd.ac.in");
    expect(found).toMatchObject({ full_name: "Nikhil Varma", father_name: "Ramesh Menon" });

    // Case-insensitive lookup
    const upper = await store.findStudent("PHD.MALHAR@SMAIL.IITPKD.AC.IN");
    expect(upper).toMatchObject({ full_name: "Nikhil Varma" });

    // Not found for wrong email
    expect(await store.findStudent("nobody@iitpkd.ac.in")).toBeNull();

    // Update
    await store.saveStudents(
      [],
      [{ id: rows[0].id, input: { ...rows[0], hostel: "Saveri Boys", imported_by: null } }],
    );
    const updated = await store.findStudent("phd.malhar@smail.iitpkd.ac.in");
    expect(updated).toMatchObject({ hostel: "Saveri Boys" });

    // Delete
    await store.deleteStudent(rows[0].id);
    expect(await store.listStudents()).toEqual([]);
  });

  it("prefers an imported record to the dummy one via the adapter", async () => {
    const { StoreAcademicSource } = await import("@/lib/academic/store-source");
    const source = new StoreAcademicSource();

    const sample = await source.find("student", "phd.malhar@smail.iitpkd.ac.in");
    expect(sample?.origin).toBe("sample");
    expect(sample?.record).toMatchObject({ name: "Nikhil Varma", hostel: "Malhar Boys" });

    await store.saveStudents(
      [
        {
          email: "phd.malhar@smail.iitpkd.ac.in",
          batch_year: "2022",
          roll_number: "112201001",
          full_name: "Nikhil Varma",
          programme: "B.Tech",
          faculty_advisor_guide_name: null,
          department: "Computer Science and Engineering",
          phone: "+91 90000 00101",
          aadhar_number: null,
          father_name: "Ramesh K. Menon",
          father_aadhar_number: null,
          father_phone_number: null,
          mother_name: "Sreeja Menon",
          mother_aadhar_number: null,
          mother_phone_number: null,
          spouse_name: null,
          spouse_aadhar_number: null,
          spouse_phone_number: null,
          guardian_name: null,
          guardian_aadhar_number: null,
          guardian_phone_number: null,
          hostel: "Saveri Boys",
          imported_by: null,
        },
      ],
      [],
    );
    const imported = await source.find("student", "phd.malhar@smail.iitpkd.ac.in");
    expect(imported?.origin).toBe("imported");
    expect(imported?.record).toMatchObject({ father_name: "Ramesh K. Menon", hostel: "Saveri Boys" });

    expect(await source.find("student", "999999999@smail.iitpkd.ac.in")).toBeNull();
    await store.deleteAllStudents();
  });
});
