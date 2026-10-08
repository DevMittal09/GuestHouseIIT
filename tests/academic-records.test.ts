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
import {
  csvColumnsFor,
  csvHeaderFor,
  describeImport,
  planAcademicImport,
  sameRecord,
  splitCsvLine,
  type StoredAcademicRecord,
} from "@/lib/academic/stored";
import type { EmployeeRecord, StudentRecord } from "@/lib/academic/types";
import { bookingPayloadSchema } from "@/lib/booking-schema";
import { buildDefaultFormConfig, sanitizeFormConfig } from "@/lib/form-config";
import { DEFAULT_RULES } from "@/lib/settings";
import type { DataStore } from "@/lib/store/types";
import { addDaysToDateValue, toInstituteDateValue } from "@/lib/tz";
import { GH, useThrowawayMockDb } from "./helpers";

/**
 * The office's eighth list (7 Oct 2026), phase 2: the institute's records
 * kept in the portal (migration 28), the "Fill in…" list withdrawn, and a
 * student's parents taken from the record instead of typed.
 */

const ANJALI: StudentRecord = {
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
};

/** Rahul has neither parent on record - the one persona with a guardian. */
const RAHUL: StudentRecord = {
  ...ANJALI,
  roll_number: "142202014",
  name: "Rahul Nair",
  email: "142202014@smail.iitpkd.ac.in",
  father_name: null,
  mother_name: null,
  guardian_name: "Gopinath Nair",
  hostel: "Saveri",
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
      email: "priya@iitpkd.ac.in",
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
    privacy_consent: true,
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

describe("pasting records in", () => {
  it("puts the email first and every field of that kind after it", () => {
    expect(csvColumnsFor("student")[0]).toBe("email");
    expect(csvColumnsFor("student")).toEqual([
      "email",
      "roll_number",
      "name",
      "program",
      "department",
      "phone",
      "father_name",
      "mother_name",
      "guardian_name",
      "hostel",
    ]);
    expect(csvHeaderFor("warden")).toBe("email, name, phone, hostel");
  });

  it("splits a spreadsheet's quoting, commas, tabs and semicolons", () => {
    expect(splitCsvLine('a@b.c, 112, Anjali Menon')).toEqual(["a@b.c", "112", "Anjali Menon"]);
    expect(splitCsvLine('a@b.c\t112\tAnjali')).toEqual(["a@b.c", "112", "Anjali"]);
    expect(splitCsvLine('a@b.c; 112; Anjali')).toEqual(["a@b.c", "112", "Anjali"]);
    // A quoted field keeps its commas, and "" is one quote.
    expect(splitCsvLine('a@b.c, "Physics, Applied", "O""Brien"')).toEqual([
      "a@b.c",
      "Physics, Applied",
      'O"Brien',
    ]);
  });

  const stored = (patch: Partial<StudentRecord> = {}): StoredAcademicRecord => ({
    id: "row-1",
    email: ANJALI.email!,
    record: { ...ANJALI, ...patch },
    imported_by: null,
    created_at: "2026-10-01T00:00:00.000Z",
    updated_at: "2026-10-01T00:00:00.000Z",
  });

  it("adds, updates and leaves alone, and reads the header and comments past", () => {
    const text = [
      "# the office's list",
      csvHeaderFor("student"),
      "",
      "112201001@smail.iitpkd.ac.in, 112201001, Anjali Menon, B.Tech, Computer Science and Engineering, +91 90000 00101, Ramesh Menon, Sreeja Menon, , Malhar",
      "142202014@smail.iitpkd.ac.in, 142202014, Rahul Nair, M.Tech, Electrical Engineering, , , , Gopinath Nair, Saveri",
    ].join("\n");
    const plan = planAcademicImport("student", text, [stored()], "p-admin");
    expect(plan.problems).toEqual([]);
    expect(plan.unchanged).toBe(1);
    expect(plan.added).toHaveLength(1);
    expect(plan.added[0].email).toBe("142202014@smail.iitpkd.ac.in");
    expect(plan.added[0].record).toMatchObject({
      kind: "student",
      father_name: null,
      guardian_name: "Gopinath Nair",
      hostel: "Saveri",
    });
    expect(plan.added[0].imported_by).toBe("p-admin");
    expect(describeImport(plan)).toBe("1 added, 1 unchanged");
  });

  it("updates a stored record the paste disagrees with, matching the email case-insensitively", () => {
    const plan = planAcademicImport(
      "student",
      "112201001@SMAIL.IITPKD.AC.IN, 112201001, Anjali Menon, B.Tech, Computer Science and Engineering, +91 90000 00101, Ramesh Menon, Latha Menon, , Malhar",
      [stored()],
      null
    );
    expect(plan.problems).toEqual([]);
    expect(plan.added).toEqual([]);
    expect(plan.updated).toHaveLength(1);
    expect(plan.updated[0].id).toBe("row-1");
    expect(plan.updated[0].input.record).toMatchObject({ mother_name: "Latha Menon" });
  });

  it("reads a short line as gaps rather than refusing it", () => {
    const plan = planAcademicImport("student", "new@smail.iitpkd.ac.in, 999", [], null);
    expect(plan.problems).toEqual([]);
    expect(plan.added[0].record).toMatchObject({
      kind: "student",
      roll_number: "999",
      name: null,
      father_name: null,
      hostel: null,
    });
  });

  it("reads the office's dashes and N/A as a gap, not as a name", () => {
    const plan = planAcademicImport(
      "student",
      "new@smail.iitpkd.ac.in, 999, Someone, -, N/A, nil, none, NULL, --, Malhar",
      [],
      null
    );
    expect(plan.added[0].record).toMatchObject({
      program: null,
      department: null,
      phone: null,
      father_name: null,
      mother_name: null,
      guardian_name: null,
      hostel: "Malhar",
    });
  });

  /** All or nothing: a half-applied list is worse than a rejected one. */
  it("imports nothing when any line is wrong, and says which", () => {
    const plan = planAcademicImport(
      "student",
      [
        "good@smail.iitpkd.ac.in, 1, Fine",
        "not-an-email, 2, Broken",
        ", 3, No email at all",
        "good@smail.iitpkd.ac.in, 4, Twice",
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
    const plan = planAcademicImport(
      "warden",
      "w@iitpkd.ac.in, A Warden, +91 90000 00601, Malhar, something extra",
      [],
      null
    );
    expect(plan.problems[0]).toContain("5 columns");
    expect(plan.problems[0]).toContain("email, name, phone, hostel");
  });

  it("says so when there is nothing to import", () => {
    expect(planAcademicImport("student", "", [], null).problems[0]).toMatch(/Nothing to import/);
    expect(planAcademicImport("student", `# only a comment\n${csvHeaderFor("student")}`, [], null).problems[0]).toMatch(
      /Nothing to import/
    );
  });

  it("compares records field by field", () => {
    expect(sameRecord(ANJALI, { ...ANJALI })).toBe(true);
    expect(sameRecord(ANJALI, { ...ANJALI, hostel: "Saveri" })).toBe(false);
    expect(sameRecord(ANJALI, RAHUL)).toBe(false);
  });
});

// --------------------------------------------------------- the store, and the source

describe("the records the office imported", () => {
  const db = useThrowawayMockDb({
    profiles: [],
    guest_houses: [],
    rooms: [],
    bookings: [],
    booking_guests: [],
    booking_logs: [],
    form_configs: [],
    room_holds: [],
  });
  let store: DataStore;

  beforeAll(async () => {
    store = (await import("@/lib/store")).getStore();
  });
  afterAll(() => db.cleanup());

  it("stores, finds, updates and removes a record", async () => {
    expect(await store.listAcademicRecords()).toEqual([]);
    await store.saveAcademicRecords(
      [
        { email: ANJALI.email!, record: ANJALI, imported_by: "p-admin" },
        { email: RAHUL.email!, record: RAHUL, imported_by: "p-admin" },
      ],
      []
    );
    const rows = await store.listAcademicRecords("student");
    expect(rows).toHaveLength(2);

    // Found case-insensitively, as `AcademicSource.find` asks.
    expect(await store.findAcademicRecord("student", ANJALI.email!.toUpperCase())).toMatchObject({
      kind: "student",
      father_name: "Ramesh Menon",
    });
    expect(await store.findAcademicRecord("employee", ANJALI.email!)).toBeNull();
    expect(await store.findAcademicRecord("student", "nobody@iitpkd.ac.in")).toBeNull();

    // The unique index on (kind, lower(email)), emulated.
    await expect(
      store.saveAcademicRecords([{ email: ANJALI.email!.toUpperCase(), record: ANJALI, imported_by: null }], [])
    ).rejects.toThrow(/already stored/);

    const anjali = rows.find((r) => r.email === ANJALI.email)!;
    await store.saveAcademicRecords(
      [],
      [{ id: anjali.id, input: { email: anjali.email, record: { ...ANJALI, hostel: "Saveri" }, imported_by: null } }]
    );
    expect(await store.findAcademicRecord("student", ANJALI.email!)).toMatchObject({ hostel: "Saveri" });

    await store.deleteAcademicRecord(anjali.id);
    expect(await store.listAcademicRecords("student")).toHaveLength(1);
    expect(await store.deleteAcademicRecords("student")).toBe(1);
    expect(await store.listAcademicRecords()).toEqual([]);
  });

  /**
   * An imported record wins; where there is none the published dummies are
   * still behind it, so a fresh install and the demo personas keep working
   * with nothing imported.
   */
  it("prefers an imported record to the dummy one, and says which it gave", async () => {
    const { StoreAcademicSource } = await import("@/lib/academic/store-source");
    const source = new StoreAcademicSource();

    const sample = await source.find("student", "112201001@smail.iitpkd.ac.in");
    expect(sample?.origin).toBe("sample");
    expect(sample?.record).toMatchObject({ name: "Anjali Menon", hostel: "Malhar" });

    await store.saveAcademicRecords(
      [
        {
          email: "112201001@smail.iitpkd.ac.in",
          record: { ...ANJALI, father_name: "Ramesh K. Menon", hostel: "Saveri" },
          imported_by: null,
        },
      ],
      []
    );
    const imported = await source.find("student", "112201001@smail.iitpkd.ac.in");
    expect(imported?.origin).toBe("imported");
    expect(imported?.record).toMatchObject({ father_name: "Ramesh K. Menon", hostel: "Saveri" });

    // Nobody at all: neither source has them, so their names stay editable.
    expect(await source.find("student", "999999999@smail.iitpkd.ac.in")).toBeNull();
    await store.deleteAcademicRecords();
  });
});
