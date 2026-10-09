import { describe, expect, it } from "vitest";
import {
  DEFAULT_DEBIT_RULES,
  STANDARD_DEBIT_HEADS,
  debitHeadsByType,
  type DebitRules,
} from "@/lib/debit-heads";
import {
  OFFICE_DEBIT_HEADS,
  narrowToOffice,
  officeDebitHeads,
} from "@/lib/office-debit-heads";
import { seedUnits } from "@/lib/store/seed";
import type { DebitHead } from "@/lib/types";
import { profile } from "./helpers";

/**
 * The office's spreadsheet of 9 October 2026: which budget each institute
 * office may charge a guest house stay to, one row per mailbox.
 *
 * Settings keys the allowed heads by *category*, so every office - the
 * Director's Office, a department office, the Students Section - shared one
 * list of six. The spreadsheet is finer than that, and these tests pin the
 * two ways it has to behave: it narrows the office that is on it, and it
 * leaves alone everyone who is not.
 */

const units = seedUnits;

/** The Director's Office persona from the seed, which is the demo `official`. */
const directorsOffice = profile({
  id: "official-admin",
  email: "admin@iitpkd.ac.in",
  full_name: "Director's Office",
  role: "official",
  unit_id: "unit-director-office",
});

const roomHeads = (p: ReturnType<typeof profile>, rules: DebitRules = DEFAULT_DEBIT_RULES) =>
  debitHeadsByType(p.role, ["official"], p, units, rules, "room").official ?? [];

describe("the offices' debitable heads, per office", () => {
  /**
   * The ask, in the owner's words: "Only show the debitable heads marked as Y
   * do not show those which are not." The Director Office row is Institute
   * Grant and Special grant; before this it was offered all six.
   */
  it("the Director's Office is offered the Institute Grant and Special Budget only", () => {
    expect(roomHeads(directorsOffice)).toEqual(["institute_grant", "special_budget"]);
  });

  it("and not the four heads its row does not mark", () => {
    const heads = roomHeads(directorsOffice);
    for (const head of ["department_budget", "student_fund", "hostel_funds", "alumni_fund"]) {
      expect(heads).not.toContain(head);
    }
  });

  /**
   * The spreadsheet has no column for either, which is the office saying an
   * office does not spend them: a project is held by its investigator, and an
   * office has no private money.
   */
  it("Project Grant and Personal Funds are on no office's row", () => {
    for (const row of OFFICE_DEBIT_HEADS) {
      expect(row.heads).not.toContain("project_grant");
      expect(row.heads).not.toContain("personal_funds");
    }
  });

  /**
   * The reason this is per mailbox and not per `office_class`: both of these
   * are offices, and they draw on different budgets. A class boundary cuts
   * the list in the wrong place.
   */
  it("a department office gets its department's budget, not the grant", () => {
    const cseOffice = profile({
      id: "office-cse",
      email: "cse.office@iitpkd.ac.in",
      role: "official",
      unit_id: "unit-cse-office",
    });
    expect(roomHeads(cseOffice)).toEqual(["department_budget", "special_budget"]);
  });

  it("the IAR Office's official bookings get Special Budget and the Alumni Fund", () => {
    const iar = profile({
      id: "iar-cell",
      email: "iar@iitpkd.ac.in",
      role: "iar_cell",
      unit_id: "unit-iar-office",
    });
    expect(roomHeads(iar).sort()).toEqual(["alumni_fund", "special_budget"]);
  });

  it("the Students Section is the one office that may spend the student and hostel funds", () => {
    expect(officeDebitHeads("office_studentssection@iitpkd.ac.in")).toEqual([
      "special_budget",
      "student_fund",
      "hostel_funds",
    ]);
    const others = OFFICE_DEBIT_HEADS.filter((r) => r.mailbox !== "office_studentssection");
    for (const row of others) expect(row.heads).not.toContain("student_fund");
  });

  /**
   * An office the spreadsheet does not name keeps the Settings list. Guessing
   * a narrower one would stop it booking; guessing a wider one is what this
   * table exists to prevent. Leaving it alone is the honest answer, and the
   * office adds the row when it has one.
   */
  it("an office that is not on the spreadsheet keeps its category's list", () => {
    const unlisted = profile({
      id: "office-new",
      email: "brand.new.office@iitpkd.ac.in",
      role: "official",
      unit_id: "unit-director-office",
    });
    expect(officeDebitHeads(unlisted.email)).toBeNull();
    expect(roomHeads(unlisted)).toEqual(DEFAULT_DEBIT_RULES.room.officer_office);
  });

  /**
   * The spreadsheet is a ceiling laid over Settings, not a replacement for
   * it: an intersection, so neither can widen the other. Settings taking the
   * grant away from offices has to take it away from the Director's Office
   * too, even though its row marks it.
   */
  it("it narrows the Settings list and never widens it", () => {
    const narrowed: DebitRules = {
      ...DEFAULT_DEBIT_RULES,
      room: { ...DEFAULT_DEBIT_RULES.room, officer_office: ["special_budget"] },
    };
    expect(roomHeads(directorsOffice, narrowed)).toEqual(["special_budget"]);

    // And a head the office's row marks is still not offered when Settings
    // does not list it for offices at all.
    expect(narrowToOffice(["special_budget"], "director_iitpkd@iitpkd.ac.in")).toEqual([
      "special_budget",
    ]);
  });

  /**
   * `people@` is an Administration mailbox on the spreadsheet. It must not
   * narrow a *person* who happens to sign in from a similar address: the
   * spreadsheet maps offices' official spending, and an employee's heads come
   * from their own category.
   */
  it("it does not touch anyone but the two office categories", () => {
    const facultyOnAnOfficeAddress = profile({
      id: "faculty-x",
      email: "people@iitpkd.ac.in",
      role: "employee",
      staff_category: "faculty",
      unit_id: "unit-cse",
    });
    expect(roomHeads(facultyOnAnOfficeAddress)).toEqual(DEFAULT_DEBIT_RULES.room.faculty);

    const student = profile({ id: "s-1", email: "people@iitpkd.ac.in", role: "student" });
    expect(
      debitHeadsByType("student", ["personal"], student, units, DEFAULT_DEBIT_RULES).personal
    ).toEqual(["personal_funds"]);
  });
});

describe("the spreadsheet itself", () => {
  it("names every mailbox and alias once", () => {
    const keys = OFFICE_DEBIT_HEADS.flatMap((r) => [r.mailbox, ...(r.aliases ?? [])]);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("marks at least one head on every row, all of them real heads", () => {
    for (const row of OFFICE_DEBIT_HEADS) {
      expect(row.heads.length).toBeGreaterThan(0);
      for (const head of row.heads) expect(STANDARD_DEBIT_HEADS).toContain(head);
      expect(new Set(row.heads).size).toBe(row.heads.length);
    }
  });

  /**
   * Every head the spreadsheet marks has to be one Settings offers offices,
   * or the intersection would silently drop it and the office would be unable
   * to charge a budget it was told it could.
   */
  it("marks nothing the offices' category lists do not already carry", () => {
    const offered: DebitHead[] = [
      ...new Set([
        ...DEFAULT_DEBIT_RULES.room.officer_office,
        ...DEFAULT_DEBIT_RULES.room.department_office,
      ]),
    ];
    for (const row of OFFICE_DEBIT_HEADS) {
      for (const head of row.heads) expect(offered).toContain(head);
    }
  });

  it("has the 34 mailboxes the office sent", () => {
    expect(OFFICE_DEBIT_HEADS).toHaveLength(34);
  });
});
