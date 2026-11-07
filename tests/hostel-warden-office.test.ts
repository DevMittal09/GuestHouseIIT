import { describe, expect, it } from "vitest";
import {
  hostelWardenApproverIds,
  hostelWardenCopyIds,
  stageApproverIds,
  decidesStage,
} from "@/lib/approval-routes";
import { personaGroupFor, personaRoute, PERSONA_GROUPS } from "@/lib/mock-personas";
import { seedProfiles, seedUnits } from "@/lib/store/seed";
import { canReview, historyScope } from "@/lib/workflow";
import { homeForRole } from "@/lib/routes";
import { HOSTEL_WARDEN_ROLES, isHostelWardenRole, ROLE_LABELS, type Profile, type Role } from "@/lib/types";
import { asProfile, asProfiles } from "./helpers";
import type { Unit } from "@/lib/units";

/**
 * **The hostel warden office** (7 Nov 2026, the office: "Saveri Hostel
 * residing student -> request sent to Saveri Assistant warden [mail copied
 * to Warden] -> Forwarded to GHM").
 *
 * Three ranks per hostel, the most junior one present decides, the rest are
 * copied. The seed gives Malhar Boys and Saveri Boys all three and Tilang A
 * Girls only a Warden, which is what makes the fallback testable.
 */

const profiles: Profile[] = asProfiles(seedProfiles);
const units: Unit[] = seedUnits.map((u) => ({ ...u, hod_approval_from_id: u.hod_approval_from_id ?? null }));
const P = (id: string) => profiles.find((p) => p.id === id)!;

describe("who the hostel's warden office is", () => {
  it("reads every rank's hostel off institute_wardens, not off the profile", () => {
    expect(P("warden-saveri").hostel_name).toBe("Saveri Boys");
    expect(P("dwarden-saveri").hostel_name).toBe("Saveri Boys");
    expect(P("awarden-saveri").hostel_name).toBe("Saveri Boys");
    expect(P("warden-tilang").hostel_name).toBe("Tilang A Girls");
  });

  it("sends a Saveri student's request to the Saveri Assistant Warden alone", () => {
    const student = P("student-btech-saveri");
    expect(student.hostel_name).toBe("Saveri Boys");
    expect(hostelWardenApproverIds(student, profiles)).toEqual(["awarden-saveri"]);
  });

  it("copies that hostel's Warden and Deputy Warden, and nobody else's", () => {
    const copied = hostelWardenCopyIds(P("student-btech-saveri"), profiles);
    expect(copied).toEqual(["warden-saveri", "dwarden-saveri"]);
    expect(copied).not.toContain("awarden-saveri");
    expect(copied.some((id) => P(id).hostel_name !== "Saveri Boys")).toBe(false);
  });

  it("falls back down the ranks where a hostel has no Assistant Warden", () => {
    // Tilang A Girls has a Warden and nothing else, so the Warden decides -
    // and is therefore not also copied.
    const meera = P("student-secretary");
    const tilang = asProfile(
      seedProfiles.find((p) => p.id === "student-secretary")!,
      { hostel_name: "Tilang A Girls" }
    );
    expect(meera.hostel_name).toBe("Malhar Girls");
    expect(hostelWardenApproverIds(tilang, profiles)).toEqual(["warden-tilang"]);
    expect(hostelWardenCopyIds(tilang, profiles)).toEqual([]);
  });

  it("gives a hostel with nobody appointed no approver and copies nobody", () => {
    const nobody = asProfile(seedProfiles[0], { hostel_name: "Brindavani" });
    expect(hostelWardenApproverIds(nobody, profiles)).toEqual([]);
    expect(hostelWardenCopyIds(nobody, profiles)).toEqual([]);
  });

  it("gives a day scholar no approver at all", () => {
    const dayScholar = P("student-day-scholar");
    expect(dayScholar.hostel_name).toBeNull();
    expect(hostelWardenApproverIds(dayScholar, profiles)).toEqual([]);
    expect(hostelWardenCopyIds(dayScholar, profiles)).toEqual([]);
  });

  it("never names the requester, even where they are in the warden office", () => {
    // A warden who somehow submits is not their own approver.
    const self = P("awarden-saveri");
    expect(hostelWardenApproverIds(self, profiles)).toEqual(["awarden-saveri"]);
    expect(hostelWardenCopyIds(self, profiles)).toEqual(["warden-saveri", "dwarden-saveri"]);
    // `stageApproverIds` is where the requester is dropped.
    expect(stageApproverIds({ kind: "warden" }, self, { profiles, units })).toEqual([]);
  });
});

describe("the warden stage, through the route", () => {
  const ctx = { profiles };

  it("lets the Assistant Warden act and the other two ranks not", () => {
    const student = P("student-btech-saveri");
    expect(canReview(P("awarden-saveri"), "PENDING_WARDEN", student, units, ctx)).toBe(true);
    expect(canReview(P("warden-saveri"), "PENDING_WARDEN", student, units, ctx)).toBe(false);
    expect(canReview(P("dwarden-saveri"), "PENDING_WARDEN", student, units, ctx)).toBe(false);
  });

  it("keeps another hostel's Assistant Warden out", () => {
    expect(
      canReview(P("awarden-malhar"), "PENDING_WARDEN", P("student-btech-saveri"), units, ctx)
    ).toBe(false);
  });

  it("without a directory, assumes any rank of the right hostel decides", () => {
    // The mail module and the Copy-to chain call `decidesStage` with units
    // but no profiles; the rank cannot be compared, so the stage is assumed
    // staffed - the same assumption every other stage makes.
    const student = P("student-btech-saveri");
    for (const warden of ["awarden-saveri", "dwarden-saveri", "warden-saveri"]) {
      expect(decidesStage(P(warden), { kind: "warden" }, student)).toBe(true);
    }
    expect(decidesStage(P("awarden-malhar"), { kind: "warden" }, student)).toBe(false);
  });
});

describe("the three ranks are first-class roles", () => {
  it("lands all three on the warden queue", () => {
    for (const role of HOSTEL_WARDEN_ROLES) expect(homeForRole(role)).toBe("/warden");
  });

  it("gives all three their hostel's archive", () => {
    for (const id of ["warden-saveri", "dwarden-saveri", "awarden-saveri"]) {
      const scope = historyScope(P(id), units);
      expect(scope.ok).toBe(true);
      if (scope.ok) expect(scope.criteria.hostelName).toBe("Saveri Boys");
    }
  });

  it("labels each rank by its rank", () => {
    expect(ROLE_LABELS.warden).toBe("Warden");
    expect(ROLE_LABELS.deputy_warden).toBe("Deputy Warden");
    expect(ROLE_LABELS.assistant_warden).toBe("Assistant Warden");
  });

  it("answers isHostelWardenRole for the three and nothing else", () => {
    const others: Role[] = ["student", "employee", "official", "club", "gh_manager", "developer"];
    for (const role of HOSTEL_WARDEN_ROLES) expect(isHostelWardenRole(role)).toBe(true);
    for (const role of others) expect(isHostelWardenRole(role)).toBe(false);
  });
});

describe("the account picker's catalogue", () => {
  it("puts every seeded account in a group that exists", () => {
    const ids = new Set(PERSONA_GROUPS.map((g) => g.id));
    for (const p of profiles) expect(ids.has(personaGroupFor(p))).toBe(true);
  });

  it("has at least one account in every group but 'other'", () => {
    for (const group of PERSONA_GROUPS) {
      if (group.id === "other") continue;
      expect(profiles.some((p) => personaGroupFor(p) === group.id)).toBe(true);
    }
  });

  it("describes a Saveri student's route as the office stated it", () => {
    const route = personaRoute(P("student-btech-saveri"), { profiles, units });
    expect(route.chain).toEqual([
      "Assistant Warden (Ms. Anu George)",
      "Guest House Manager",
    ]);
    expect(route.copiedTo).toEqual([
      "Warden Dr. Lakshmi Devi",
      "Deputy Warden Dr. Vinod Raj",
    ]);
  });

  it("names the rank that actually decides, not the slot", () => {
    // Tilang A Girls has only a Warden, so the chain says Warden - calling
    // her the Assistant Warden is the one thing this panel must not do.
    const tilang = asProfile(
      seedProfiles.find((p) => p.id === "student-ms-tilang")!,
      { hostel_name: "Tilang A Girls" }
    );
    expect(personaRoute(tilang, { profiles, units }).chain).toEqual([
      "Warden (Dr. Shalini Rao)",
      "Guest House Manager",
    ]);
  });

  it("sends a day scholar straight to the desk", () => {
    expect(personaRoute(P("student-day-scholar"), { profiles, units }).chain).toEqual([
      "Guest House Manager",
    ]);
  });

  it("says a club account cannot submit, and names who books for it", () => {
    const route = personaRoute(P("club-petrichor"), { profiles, units });
    expect(route.chain).toEqual([]);
    expect(route.cannotBook).toContain("Dr. Arun Prasad");
  });

  it("names the clubs a Faculty Advisor books for", () => {
    expect(personaRoute(P("faculty-advisor"), { profiles, units }).advisorFor).toEqual([
      "Cultural Affairs Council",
      "Petrichor Fest Council",
    ]);
  });

  it("routes a faculty official booking through the HOD of their department", () => {
    expect(personaRoute(P("faculty-cse"), { profiles, units }).chain).toEqual([
      "HOD (Prof. R. Venkatesh (HOD, CSE))",
      "Guest House Manager",
    ]);
  });

  it("sends the Director's Office straight to the desk - it has no HOD", () => {
    const route = personaRoute(P("office-director"), { profiles, units });
    expect(route.chain).toEqual(["Guest House Manager"]);
    // Nobody heads it, so the form never asks Direct or Requires HOD.
    expect(route.ifHodApproval).toBeNull();
  });

  it("shows both chains for an office that is asked Direct or HOD", () => {
    for (const [id, hod] of [
      ["office-cse", "Prof. R. Venkatesh (HOD, CSE)"],
      ["office-dse", "Prof. S. Anand (HOD, Data Science)"],
      ["office-registrar", "Dr. Mohan Das (Registrar)"],
    ] as const) {
      const route = personaRoute(P(id), { profiles, units });
      expect(route.chain).toEqual(["Guest House Manager"]);
      expect(route.ifHodApproval).toEqual([`HOD (${hod})`, "Guest House Manager"]);
    }
  });

  it("sends the Student Cell's alumni booking through the IAR Office", () => {
    expect(personaRoute(P("iar-student-cell"), { profiles, units }).chain).toEqual([
      "IAR Office (IAR Office)",
      "Guest House Manager",
    ]);
  });
});
