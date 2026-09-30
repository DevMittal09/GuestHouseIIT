import { describe, expect, it } from "vitest";
import type { EmployeeRecord, StudentRecord } from "@/lib/academic/types";
import { PAY_AT_CHECKOUT_NOTE } from "@/lib/debit-heads";
import {
  buildDefaultFormConfig,
  duplicateRelationshipError,
  parentDependencyError,
  sanitizeFormConfig,
} from "@/lib/form-config";
import {
  describeKnownGuest,
  knownGuestSelf,
  knownGuestsFromBookings,
  knownGuestsFromRecord,
  knownSourceOf,
  mergeKnownGuests,
  prefillFor,
  SELF_RELATIONSHIP,
} from "@/lib/known-guests";
import { booking, GH, guest, profile } from "./helpers";

/**
 * The office's corrections of 30 Sep 2026 that are rules rather than copy:
 * a requester can fill themselves in as a guest ("Yourself"), and the note
 * on a personal booking about paying. The invoice's new lettering is tested
 * with the rest of the invoice in `fifth-round.test.ts`.
 */

const ANJALI: StudentRecord = {
  kind: "student",
  roll_number: "112201001",
  name: "Anjali Menon",
  program: "B.Tech",
  department: "Computer Science",
  email: "anjali@smail.iitpkd.ac.in",
  phone: null,
  father_name: "Ramesh Menon",
  mother_name: "Sreeja Menon",
  guardian_name: null,
  hostel: "Malhar",
};

const EMPLOYEE: EmployeeRecord = {
  kind: "employee",
  employee_id: "F1",
  name: "Dr. Priya Nair",
  department: null,
  employee_type: null,
  phone: null,
  email: null,
  office_number: null,
};

describe("Yourself, as a guest on your own request", () => {
  it("offers a student or member of staff themselves, by the record's name, else the profile's", () => {
    const student = profile({ role: "student", full_name: "anjali m" });
    expect(knownGuestSelf(student, ANJALI)).toMatchObject({
      name: "Anjali Menon",
      relationship: SELF_RELATIONSHIP,
      gender: null,
      source: "self",
    });
    expect(knownGuestSelf(student, null)?.name).toBe("anjali m");
    expect(knownGuestSelf(profile({ role: "employee" }), EMPLOYEE)?.name).toBe("Dr. Priya Nair");
  });

  it("offers nobody for an account that is not one person", () => {
    for (const role of ["official", "club", "iar_cell", "iar_student_cell", "gh_manager"] as const) {
      expect(knownGuestSelf(profile({ role, full_name: "Registrar's Office" }), null)).toBeNull();
    }
  });

  it("comes first, fills in when Self is chosen, and reads as Yourself in the list", () => {
    const self = knownGuestSelf(profile({ role: "student" }), ANJALI)!;
    // An earlier booking that already had the student on it adds no second entry.
    const fromBookings = knownGuestsFromBookings(
      [booking({ user_id: "p-1" }, [{ guests: [guest({ name: "Anjali Menon", relationship: "Self" }), guest({ name: "Priya", relationship: "Siblings" })] }])],
      "p-1"
    );
    const known = mergeKnownGuests([self, ...knownGuestsFromRecord(ANJALI)], fromBookings);
    expect(known.map((k) => k.name)).toEqual(["Anjali Menon", "Ramesh Menon", "Sreeja Menon", "Priya"]);
    expect(prefillFor(known, "self")?.source).toBe("self");
    expect(knownSourceOf(known, "anjali menon", "Self")?.source).toBe("self");
    expect(describeKnownGuest(self)).toBe("Yourself — Anjali Menon");
  });

  it("gives the student form a Self relationship, once per request, that lets no sibling in", () => {
    const houses = [GH];
    const student = sanitizeFormConfig(buildDefaultFormConfig("student", houses), houses);
    expect(student.relationship_options).toContain("Self");
    expect(student.unique_relationships).toContain("Self");
    expect(student.parent_relationships).not.toContain("Self");
    expect(student.dependent_relationships).not.toContain("Self");
    expect(parentDependencyError(student, ["Self"])).toBeNull();
    expect(parentDependencyError(student, ["Self", "Siblings"])).toMatch(/only be accommodated/);
    expect(duplicateRelationshipError(student, ["Self", "Mother"])).toBeNull();
    expect(duplicateRelationshipError(student, ["Self", "Self"])).not.toBeNull();
  });
});

describe("paying for a personal booking", () => {
  it("uses the office's wording, which names no particular way to pay", () => {
    expect(PAY_AT_CHECKOUT_NOTE).toBe(
      "An invoice will be generated and can be settled at the time of checkout. Multiple payment options are available at the guest house."
    );
  });
});
