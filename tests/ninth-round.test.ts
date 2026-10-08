import { describe, expect, it } from "vitest";
import { bookingPayloadSchema } from "@/lib/booking-schema";
import {
  allowedHeads,
  DEBIT_RULES_REVISION,
  DEFAULT_DEBIT_RULES,
  debitDetailsRequired,
  debitHeadsByType,
  FUND_DECLARATION,
  fundDeclarationError,
  requiresFundDeclaration,
  STANDARD_DEBIT_HEADS,
  upgradeDebitRules,
} from "@/lib/debit-heads";
import { buildDefaultFormConfig, sanitizeFormConfig } from "@/lib/form-config";
import { MAIL_THREAD_OF, type MailEventKey } from "@/lib/mail/types";
import { DEFAULT_RULES } from "@/lib/settings";
import { addDaysToDateValue, toInstituteDateValue } from "@/lib/tz";
import { DEBIT_HEAD_LABELS, type DebitHead, type Profile, type Role } from "@/lib/types";
import type { Unit } from "@/lib/units";
import {
  changedFields,
  columnFor,
  DEFAULT_COLUMNS,
  headerColumns,
  MAX_USER_IMPORT_ROWS,
  planUserImport,
  USER_CSV_HEADER,
} from "@/lib/users-import";
import { GH, profile } from "./helpers";

/**
 * The office's ninth list (8 October 2026): the nine debitable heads and who
 * may use which, the funds declaration, one email thread per booking, less
 * explanation on screen, and loading the accounts from a spreadsheet.
 */

// ----------------------------------------------------- the heads and the map

describe("the office's nine debitable heads", () => {
  it("are all in use, and named as the office names them", () => {
    expect(STANDARD_DEBIT_HEADS).toEqual([
      "institute_grant",
      "professional_development_fund",
      "project_grant",
      "department_budget",
      "special_budget",
      "personal_funds",
      "alumni_fund",
      "student_fund",
      "hostel_funds",
    ]);
    // Relabelled from "Special Funds" (24 Sep 2026) back to the office's own
    // words on this list.
    expect(DEBIT_HEAD_LABELS.special_budget).toBe("Special Budget");
  });

  it("gives every requester category the heads the office listed", () => {
    const OFFICES: DebitHead[] = [
      "institute_grant",
      "department_budget",
      "special_budget",
      "student_fund",
      "hostel_funds",
      "alumni_fund",
    ];
    expect(DEFAULT_DEBIT_RULES.room.student).toEqual(["personal_funds"]);
    expect(DEFAULT_DEBIT_RULES.room.faculty).toEqual([
      "professional_development_fund",
      "project_grant",
      "department_budget",
      "special_budget",
      "personal_funds",
    ]);
    expect(DEFAULT_DEBIT_RULES.room.staff).toEqual(["personal_funds"]);
    expect(DEFAULT_DEBIT_RULES.room.officer_office).toEqual(OFFICES);
    expect(DEFAULT_DEBIT_RULES.room.department_office).toEqual(OFFICES);
    expect(DEFAULT_DEBIT_RULES.room.club).toEqual(["student_fund", "special_budget"]);
    expect(DEFAULT_DEBIT_RULES.room.alumni).toEqual(["alumni_fund", "special_budget"]);
    expect(DEFAULT_DEBIT_RULES.room.iar_student_cell).toEqual(["alumni_fund", "special_budget"]);
  });

  /**
   * "All funds except Institute Grant, Alumni, Student Fund and Hostel" is a
   * floor under Settings, not only a default: a stored row that still lists
   * one is ignored on read.
   */
  it("never lets faculty reach the institute's, alumni's, students' or hostels' money", () => {
    for (const head of ["institute_grant", "alumni_fund", "student_fund", "hostel_funds"] as const) {
      expect(allowedHeads("faculty", [head, "department_budget"])).toEqual(["department_budget"]);
      expect(allowedHeads("faculty", [head, "department_budget"], "dining")).toEqual([
        "department_budget",
      ]);
    }
    // The offices that do hold those funds keep them.
    expect(allowedHeads("officer_office", DEFAULT_DEBIT_RULES.room.officer_office)).toEqual(
      DEFAULT_DEBIT_RULES.room.officer_office
    );
  });

  it("brings a Settings row saved before the mapping onto it, exactly once", () => {
    expect(DEBIT_RULES_REVISION).toBe(6);
    const saved = {
      revision: 5,
      room: { ...DEFAULT_DEBIT_RULES.room, staff: ["department_budget"] },
      dining: { ...DEFAULT_DEBIT_RULES.dining, club: ["department_budget"] },
    };
    const upgraded = upgradeDebitRules(saved) as typeof DEFAULT_DEBIT_RULES;
    expect(upgraded.revision).toBe(DEBIT_RULES_REVISION);
    expect(upgraded.room).toEqual(DEFAULT_DEBIT_RULES.room);
    expect(upgraded.dining).toEqual(DEFAULT_DEBIT_RULES.dining);
    // And then leaves the office's own edits alone for good.
    const own = { ...upgraded, room: { ...upgraded.room, club: [] } };
    expect(upgradeDebitRules(own)).toEqual(own);
  });

  it("asks which special fund, and will not take Special Budget without it", () => {
    expect(debitDetailsRequired("special_budget")).toBe(true);
    expect(debitDetailsRequired("project_grant")).toBe(true);
    expect(debitDetailsRequired("department_budget")).toBe(false);
  });
});

// ------------------------------------------------------------- the declaration

describe("the funds declaration", () => {
  it("is the office's sentence, word for word", () => {
    expect(FUND_DECLARATION).toBe(
      "I have the necessary approval for the usage of funds from the competent authority and verified that sufficient balance is there in the debitable head."
    );
  });

  it("is asked for by every head except Personal Funds", () => {
    for (const head of STANDARD_DEBIT_HEADS) {
      expect(requiresFundDeclaration(head)).toBe(head !== "personal_funds");
    }
    // Nothing chosen yet is nothing to declare about.
    expect(requiresFundDeclaration(null)).toBe(false);
    expect(fundDeclarationError("personal_funds", false)).toBeNull();
    expect(fundDeclarationError("department_budget", true)).toBeNull();
    expect(fundDeclarationError("department_budget", false)).toMatch(/approved and available/);
  });

  const houses = [GH];
  const config = sanitizeFormConfig(buildDefaultFormConfig("employee", houses), houses);
  const today = toInstituteDateValue(new Date());
  const payload = (patch: Record<string, unknown>) => ({
    guest_house_id: GH.id,
    service_type: "room",
    booking_type: "official",
    purpose_of_visit: "A collaborator's visit",
    check_in: `${addDaysToDateValue(today, 1)}T12:00`,
    check_out: `${addDaysToDateValue(today, 2)}T10:00`,
    rooms: [
      { room_type: null, guests: [{ name: "Guest", age: "40", gender: "male", citizenship: "indian" }] },
    ],
    meals: [],
    privacy_consent: true,
    ...patch,
  });
  const schema = bookingPayloadSchema(config, {
    mealsAvailable: false,
    debitHeads: { room: { official: ["department_budget", "personal_funds"] }, dining: {} },
    rules: DEFAULT_RULES,
  });

  it("is enforced on the server, not only drawn on the form", () => {
    const bare = schema.safeParse(payload({ debit_head: "department_budget" }));
    expect(bare.success).toBe(false);
    expect(!bare.success && JSON.stringify(bare.error.issues)).toContain("fund_declaration");
    const declared = schema.safeParse(
      payload({ debit_head: "department_budget", fund_declaration: true })
    );
    if (!declared.success) throw new Error(JSON.stringify(declared.error.issues));
    expect(declared.data.fund_declaration).toBe(true);
    // Round trip: the schema takes its own output, which is what the form
    // sends over the wire.
    expect(schema.safeParse(declared.data).success).toBe(true);
  });

  it("is not asked for on the requester's own money, ticked or not", () => {
    for (const declared of [undefined, false, true]) {
      const result = schema.safeParse(
        payload({ debit_head: "personal_funds", fund_declaration: declared })
      );
      expect(result.success).toBe(true);
    }
  });

  /**
   * A personal booking is not asked which budget pays (7 Oct 2026), so it is
   * not asked to declare anything either - the schema overwrites the head
   * with Personal Funds whatever arrived.
   */
  it("never reaches a personal booking", () => {
    const personal = bookingPayloadSchema(config, {
      mealsAvailable: false,
      debitHeads: { room: { personal: ["personal_funds"] }, dining: {} },
      rules: DEFAULT_RULES,
    }).safeParse(payload({ booking_type: "personal" }));
    if (!personal.success) throw new Error(JSON.stringify(personal.error.issues));
    expect(personal.data.debit_head).toBe("personal_funds");
    expect(personal.data.fund_declaration).toBe(false);
  });

  it("is on the form for every category whose heads are not all personal", () => {
    const requester: Pick<Profile, "staff_category" | "unit_id"> = {
      staff_category: "faculty",
      unit_id: null,
    };
    const heads = debitHeadsByType("employee", ["official"], requester, [], DEFAULT_DEBIT_RULES);
    expect(heads.official?.some((h) => requiresFundDeclaration(h))).toBe(true);
    // A non-teaching staff member has Personal Funds alone, so they are never
    // asked - which is right: it is their own money.
    const staff = debitHeadsByType(
      "employee",
      ["official"],
      { staff_category: "staff", unit_id: null },
      [],
      DEFAULT_DEBIT_RULES
    );
    expect(staff.official?.every((h) => !requiresFundDeclaration(h))).toBe(true);
  });
});

// ----------------------------------------------------------------- threading

describe("one email thread per booking id", () => {
  /**
   * The office asked for every message about one request to arrive as one
   * conversation. Requester mail stood alone until now; the staff mail has
   * threaded on the booking since 23 Sep 2026.
   */
  it("threads every mail about a booking, for the requester too", () => {
    const perBooking: MailEventKey[] = [
      "booking.submitted.requester",
      "booking.submitted.reviewer",
      "booking.tier_approved.requester",
      "booking.pending.reviewer",
      "booking.rejected.requester",
      "booking.allocated.requester",
      "booking.allocated.desk",
      "booking.cancellation_requested.manager",
      "booking.cancellation_decided.requester",
      "booking.cancelled.requester",
      "booking.cancelled.desk",
      "booking.extension_requested.manager",
      "booking.extension_decided.requester",
      "booking.no_show.requester",
      "booking.missed.requester",
      "stay.reminder.requester",
      "invoice.issued.accounts",
    ];
    for (const event of perBooking) expect(MAIL_THREAD_OF[event]).toBe("booking");
  });

  it("keeps the daily log for mail that is about a queue, not a booking", () => {
    for (const event of ["queue.digest.reviewer", "queue.escalation.reviewer", "desk.daily_report"] as const) {
      expect(MAIL_THREAD_OF[event]).toBe("daily_log");
    }
  });
});

// -------------------------------------------------------- the users import

describe("loading the accounts from a spreadsheet", () => {
  const units: Unit[] = [
    {
      id: "unit-cse",
      name: "Computer Science and Engineering",
      kind: "department",
      parent_id: null,
      head_id: null,
      acting_head_id: null,
    },
  ];
  const context = (profiles: Profile[] = [], assignable: Role[] = ["student", "employee", "warden"]) => ({
    profiles,
    assignable,
    hostels: ["Malhar", "Saveri"],
    units,
  });

  it("reads a paste with no header in the default column order", () => {
    expect(USER_CSV_HEADER).toBe(DEFAULT_COLUMNS.join(", "));
    const plan = planUserImport(
      "112201001@smail.iitpkd.ac.in, A. Student, student, Malhar, , 112201001, 112201001",
      context()
    );
    expect(plan.problems).toEqual([]);
    expect(plan.hadHeader).toBe(false);
    expect(plan.added).toEqual([
      {
        email: "112201001@smail.iitpkd.ac.in",
        full_name: "A. Student",
        role: "student",
        hostel_name: "Malhar",
        department_or_club: null,
        roll_number: "112201001",
        ldap_uid: "112201001",
        staff_category: null,
        unit_id: null,
      },
    ]);
  });

  /**
   * "Edit the columns": the office's own sheet has its columns in its own
   * order, and holds only some of them.
   */
  it("takes the columns in whatever order the header names them", () => {
    expect(columnFor("Roll No.")).toBe("roll_number");
    expect(columnFor("Dept / Club")).toBe("department_or_club");
    expect(columnFor("nonsense")).toBeNull();
    expect(headerColumns(["email", "name"])).toEqual(["email", "full_name"]);
    // A data line is not a header, even though its first cell matches "email".
    expect(headerColumns(["someone@iitpkd.ac.in", "A Person"])).toBeNull();

    const plan = planUserImport(
      ["Name, Email, Role", "Dr. Priya N, priya@iitpkd.ac.in, faculty"].join("\n"),
      context()
    );
    // A header has to start with the email column, so this one is not taken
    // as a header and the line is read as data - which has no email first.
    expect(plan.problems[0]).toMatch(/not an email address/);

    const ordered = planUserImport(
      ["email, name, role, category", "priya@iitpkd.ac.in, Dr. Priya N, employee, faculty"].join("\n"),
      context()
    );
    expect(ordered.problems).toEqual([]);
    expect(ordered.hadHeader).toBe(true);
    expect(ordered.added[0].staff_category).toBe("faculty");
  });

  it("reads the office's word for a kind of employee as the role and the category", () => {
    const plan = planUserImport("ravi@iitpkd.ac.in, Ravi K, staff", context());
    expect(plan.problems).toEqual([]);
    expect(plan.added[0].role).toBe("employee");
    expect(plan.added[0].staff_category).toBe("staff");
  });

  it("updates somebody already on the list, and leaves out what the paste does not carry", () => {
    const existing = profile({
      id: "p-ravi",
      email: "ravi@iitpkd.ac.in",
      full_name: "Ravi K",
      role: "employee",
      hostel_name: null,
      department_or_club: "Mechanical",
      roll_number: "EMP0142",
      ldap_uid: "ravi",
    });
    const plan = planUserImport(
      ["email, name", "ravi@iitpkd.ac.in, Ravi Kumar"].join("\n"),
      context([existing])
    );
    expect(plan.problems).toEqual([]);
    expect(plan.added).toEqual([]);
    expect(plan.updated).toHaveLength(1);
    const { before, row } = plan.updated[0];
    expect(row.full_name).toBe("Ravi Kumar");
    // Not cleared by a paste that never mentioned them.
    expect(row.department_or_club).toBe("Mechanical");
    expect(row.roll_number).toBe("EMP0142");
    expect(row.ldap_uid).toBe("ravi");
    expect(changedFields(before, row)).toEqual(["Name"]);
  });

  it("counts a line that changes nothing as unchanged", () => {
    const existing = profile({ id: "p-1", email: "a@iitpkd.ac.in", full_name: "A B", role: "student" });
    const plan = planUserImport(
      ["email, name, role", "a@iitpkd.ac.in, A B, student"].join("\n"),
      context([existing])
    );
    expect(plan.problems).toEqual([]);
    expect(plan.unchanged).toBe(1);
    expect(plan.added).toEqual([]);
    expect(plan.updated).toEqual([]);
  });

  /**
   * All or nothing: one bad line and nothing is imported. Half an imported
   * list is worse than none, because nobody can tell which half landed - and
   * these rows decide who can sign in.
   */
  it("refuses the whole paste when any line is wrong", () => {
    const plan = planUserImport(
      [
        "email, name, role, hostel",
        "good@iitpkd.ac.in, Good Person, student, Malhar",
        "not-an-email, Bad Person, student, Malhar",
        "third@iitpkd.ac.in, Third Person, student, Nowhere",
      ].join("\n"),
      context()
    );
    expect(plan.added).toEqual([]);
    expect(plan.updated).toEqual([]);
    expect(plan.problems).toHaveLength(2);
    expect(plan.problems[0]).toMatch(/Line 3/);
    expect(plan.problems[1]).toMatch(/"Nowhere" is not a hostel on record/);
  });

  it("refuses a role this console user may not hand out", () => {
    const plan = planUserImport(
      "dev@iitpkd.ac.in, A Dev, developer",
      context([], ["student", "employee"])
    );
    expect(plan.problems[0]).toMatch(/not a role this console can assign/);
  });

  it("refuses the same person twice, and one LDAP username on two accounts", () => {
    expect(
      planUserImport(
        ["a@iitpkd.ac.in, A Person, student", "a@iitpkd.ac.in, A Person again, student"].join("\n"),
        context()
      ).problems[0]
    ).toMatch(/also given on line 1/);

    const held = profile({ id: "p-held", email: "held@iitpkd.ac.in", ldap_uid: "shared" });
    expect(
      planUserImport(
        "new@iitpkd.ac.in, New Person, student, , , , shared",
        context([held])
      ).problems[0]
    ).toMatch(/already belongs to held@iitpkd.ac.in/);
  });

  it("will not import an account this console user may not edit", () => {
    const dev = profile({ id: "p-dev", email: "dev@iitpkd.ac.in", role: "developer" });
    const plan = planUserImport("dev@iitpkd.ac.in, Renamed, student", {
      ...context([dev]),
      locked: (p) => (p.role === "developer" ? "Only a developer can change a developer account" : null),
    });
    expect(plan.added).toEqual([]);
    expect(plan.problems[0]).toMatch(/Only a developer/);
  });

  it("asks for a long list to be split rather than truncating it", () => {
    const rows = Array.from(
      { length: MAX_USER_IMPORT_ROWS + 1 },
      (_, i) => `p${i}@iitpkd.ac.in, Person ${i}, student`
    );
    const plan = planUserImport(rows.join("\n"), context());
    expect(plan.problems[0]).toMatch(/split the list/);
    expect(plan.added).toEqual([]);
  });

  it("says so when there is nothing to import", () => {
    expect(planUserImport("", context()).problems[0]).toMatch(/Nothing to import/);
    expect(planUserImport("# only a comment", context()).problems[0]).toMatch(/Nothing to import/);
  });
});
