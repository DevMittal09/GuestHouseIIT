import fs from "fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  canBeFacultyAdvisor,
  clubsBookableBy,
  defaultCopyToFor,
  facultyInChargeOf,
  mightBeFacultyInCharge,
} from "@/lib/club-booking";
import { seedProfiles, seedUnits } from "@/lib/store/seed";
import type { DataStore } from "@/lib/store/types";
import type { Profile } from "@/lib/types";
import { facultyAdvisorOf, secretaryEmailOf, type Unit } from "@/lib/units";
import { approvalStagesFor, initialStatusFor, routeFor } from "@/lib/workflow";
import { profile, useThrowawayMockDb } from "./helpers";

/**
 * Faculty Advisors (24 Sep 2026, migration 25). The student bodies are a
 * hierarchy — a Faculty Advisor and a student secretary for each council,
 * clubs under it, a fest with an advisor of its own — and the advisor is an
 * appointment in the console, not an account: whoever is named books for the
 * council or its clubs from their own faculty login, straight to the Guest
 * House Manager, with the secretary's mailbox in Copy to.
 */

const P = (id: string) => seedProfiles.find((p) => p.id === id)!;

describe("who the Faculty Advisor is", () => {
  const units: Unit[] = [
    { id: "tech", name: "Technical Affairs", kind: "council", parent_id: null, head_id: "sec", acting_head_id: null, faculty_advisor_id: "prof-a", secretary_email: "sec_tech@iitpkd.ac.in" },
    { id: "robotics", name: "Robotics Club", kind: "club", parent_id: "tech", head_id: null, acting_head_id: null },
    { id: "fest", name: "Fest", kind: "club", parent_id: "tech", head_id: null, acting_head_id: null, faculty_advisor_id: "prof-b", secretary_email: " fest@iitpkd.ac.in " },
    { id: "loose", name: "Unattached Club", kind: "club", parent_id: null, head_id: null, acting_head_id: null },
  ];

  it("is the unit's own, else its council's — the clubs under a council share its advisor", () => {
    expect(facultyAdvisorOf("tech", units)).toBe("prof-a");
    expect(facultyAdvisorOf("robotics", units)).toBe("prof-a");
    // A fest with an advisor of its own keeps them.
    expect(facultyAdvisorOf("fest", units)).toBe("prof-b");
    expect(facultyAdvisorOf("loose", units)).toBeNull();
    expect(facultyAdvisorOf(null, units)).toBeNull();
  });

  it("and the secretary's mailbox follows the same rule, trimmed", () => {
    expect(secretaryEmailOf("robotics", units)).toBe("sec_tech@iitpkd.ac.in");
    expect(secretaryEmailOf("fest", units)).toBe("fest@iitpkd.ac.in");
    expect(secretaryEmailOf("loose", units)).toBeNull();
  });

  it("survives a parent loop someone typed in", () => {
    const loop: Unit[] = [
      { id: "a", name: "A", kind: "club", parent_id: "b", head_id: null, acting_head_id: null },
      { id: "b", name: "B", kind: "club", parent_id: "a", head_id: null, acting_head_id: null },
    ];
    expect(facultyAdvisorOf("a", loop)).toBeNull();
  });

  it("may only be a faculty member", () => {
    expect(canBeFacultyAdvisor({ role: "employee", staff_category: "faculty" })).toBe(true);
    // An employee nobody has categorised is taken as faculty, not refused.
    expect(canBeFacultyAdvisor({ role: "employee", staff_category: null })).toBe(true);
    // The old dedicated accounts still count.
    expect(canBeFacultyAdvisor({ role: "faculty_advisor", staff_category: null })).toBe(true);
    for (const role of ["student", "club", "warden", "gh_manager", "developer", "official"] as const) {
      expect(canBeFacultyAdvisor({ role, staff_category: null })).toBe(false);
    }
    expect(canBeFacultyAdvisor({ role: "employee", staff_category: "staff" })).toBe(false);
  });

  it("a stored row naming someone who is not faculty books for nobody", () => {
    const student = profile({ id: "prof-a", role: "student" });
    const club = profile({ id: "robotics-acct", role: "club", unit_id: "robotics" });
    expect(facultyInChargeOf(club, [student, club], units)).toEqual([]);
    expect(mightBeFacultyInCharge(student, units)).toBe(false);
  });
});

describe("the demo: Dr. Arun Prasad advises the Cultural Affairs Council and Petrichor", () => {
  const units = seedUnits;
  const arun = P("faculty-arun");

  it("is an ordinary faculty account, not a Faculty Advisor role", () => {
    expect(arun.role).toBe("employee");
    expect(arun.staff_category).toBe("faculty");
    expect(seedProfiles.some((p) => p.role === "faculty_advisor")).toBe(false);
  });

  it("books for the council's account and for the fest — nobody else does", () => {
    expect(clubsBookableBy(arun, seedProfiles, units).map((c) => c.id)).toEqual([
      "council-cultural",
      "club-petrichor",
    ]);
    for (const id of ["employee-priya", "hod-cse", "secretary-cultural", "club-petrichor", "gh-manager"]) {
      expect(clubsBookableBy(P(id), seedProfiles, units)).toEqual([]);
    }
  });

  it("changing the advisor in the console moves the booking rights with it", () => {
    const next = units.map((u) => (u.id === "unit-cultural" ? { ...u, faculty_advisor_id: "employee-priya" } : u));
    // Petrichor has its own advisor, so it stays with Arun; the council moves.
    expect(clubsBookableBy(arun, seedProfiles, next).map((c) => c.id)).toEqual(["club-petrichor"]);
    expect(clubsBookableBy(P("employee-priya"), seedProfiles, next).map((c) => c.id)).toEqual(["council-cultural"]);
  });

  it("Copy to starts with the secretary's mailbox — not when the booking is the secretary's own account", () => {
    expect(defaultCopyToFor(P("club-petrichor"), units)).toEqual(["sec_arts@iitpkd.ac.in"]);
    // The council's account is sec_arts@ itself, and is mailed as the requester.
    expect(defaultCopyToFor(P("council-cultural"), units)).toEqual([]);
    expect(defaultCopyToFor({ email: "x@iitpkd.ac.in", unit_id: null }, units)).toEqual([]);
  });
});

describe("a booking by the Faculty Advisor needs no forwarding", () => {
  it("goes straight to the Guest House Manager, HOD or no HOD", () => {
    expect(routeFor("club", "room", { bookingType: "official", raisedByFacultyInCharge: true })).toEqual([]);
    expect(
      routeFor("club", "room", { bookingType: "official", hasHodApprover: true, raisedByFacultyInCharge: true })
    ).toEqual([]);
    expect(initialStatusFor("club", "room", { raisedByFacultyInCharge: true, hasHodApprover: true })).toBe(
      "PENDING_GH_MANAGER"
    );
  });

  it("a club request stored before the rule keeps its old route", () => {
    const petrichor = P("club-petrichor");
    const withHod = seedUnits.map((u) => (u.id === "unit-petrichor" ? { ...u, hod_unit_id: "unit-cse" } : u));
    const legacy = { user_role: "club" as const, user_id: petrichor.id, created_by: null, booking_type: "official" };
    expect(approvalStagesFor(legacy, petrichor, withHod)).toEqual(["PENDING_FA", "PENDING_HOD"]);
    expect(approvalStagesFor({ ...legacy, created_by: "faculty-arun" }, petrichor, withHod)).toEqual([]);
  });
});

describe("the mock store", () => {
  let db: ReturnType<typeof useThrowawayMockDb>;
  let store: DataStore;

  beforeAll(async () => {
    db = useThrowawayMockDb();
    store = new (await import("@/lib/store/mock")).MockStore();
    await store.listUnits(); // writes the seed
  });
  afterAll(() => db.cleanup());

  it("gives a database written before migration 25 the demo advisors, and other units none", async () => {
    const old = JSON.parse(fs.readFileSync(db.file, "utf8"));
    for (const u of old.units as Unit[]) {
      delete u.faculty_advisor_id;
      delete u.secretary_email;
    }
    old.units.push({ id: "unit-other", name: "Other Club", kind: "club", parent_id: null, head_id: null, acting_head_id: null, office_class: null, hod_unit_id: null });
    old.profiles = old.profiles.filter((p: Profile) => p.id !== "faculty-arun");
    fs.writeFileSync(db.file, JSON.stringify(old));

    const units = await store.listUnits();
    expect(units.find((u) => u.id === "unit-cultural")).toMatchObject({
      faculty_advisor_id: "faculty-arun",
      secretary_email: "sec_arts@iitpkd.ac.in",
    });
    expect(units.find((u) => u.id === "unit-other")).toMatchObject({ faculty_advisor_id: null, secretary_email: null });
    expect((await store.listProfiles()).some((p) => p.id === "faculty-arun")).toBe(true);
  });

  it("saves an advisor and a mailbox, and clears them", async () => {
    await store.updateUnit("unit-petrichor", { faculty_advisor_id: "employee-priya", secretary_email: "fest@iitpkd.ac.in" });
    let petrichor = (await store.listUnits()).find((u) => u.id === "unit-petrichor");
    expect(petrichor).toMatchObject({ faculty_advisor_id: "employee-priya", secretary_email: "fest@iitpkd.ac.in" });
    await store.updateUnit("unit-petrichor", { faculty_advisor_id: null, secretary_email: null });
    petrichor = (await store.listUnits()).find((u) => u.id === "unit-petrichor");
    // With none of its own, it takes the council's again.
    expect(facultyAdvisorOf("unit-petrichor", await store.listUnits())).toBe("faculty-arun");
    expect(petrichor?.secretary_email).toBeNull();
  });
});
