import { describe, expect, it } from "vitest";
import { bookingPayloadSchema } from "@/lib/booking-schema";
import { bookingTypesFor } from "@/lib/booking-types";
import {
  allowedHeads,
  debitCategoryFor,
  debitHeadsByType,
  debitRulesSchema,
  DEFAULT_DEBIT_RULES,
  type DebitRules,
} from "@/lib/debit-heads";
import { buildDefaultFormConfig } from "@/lib/form-config";
import { planProjectImport, type Project } from "@/lib/projects";
import { runBookingSearch } from "@/lib/booking-search";
import { seedProfiles, seedUnits } from "@/lib/store/seed";
import { addDaysToDateValue, toInstituteDateValue } from "@/lib/tz";
import { REQUESTER_ROLES, type BookingType, type Profile, type Role } from "@/lib/types";
import { hodApproversFor, hodUnitIdFor, type Unit } from "@/lib/units";
import {
  approvalStagesFor,
  canReview,
  historyScope,
  initialStatusFor,
  nextStatusAfter,
  routeFor,
} from "@/lib/workflow";
import { booking, GH } from "./helpers";

const P = (id: string) => seedProfiles.find((p) => p.id === id)!;
const units: Unit[] = seedUnits.map((u) => ({ ...u, hod_unit_id: u.hod_unit_id ?? null }));

describe("routeFor — every pipeline", () => {
  const hod = { hasHodApprover: true };
  it.each<[Role, string, object, string[]]>([
    ["student", "personal", {}, ["PENDING_WARDEN"]],
    ["club", "official", hod, ["PENDING_FA", "PENDING_HOD"]],
    ["club", "official", {}, ["PENDING_FA"]],
    ["employee", "official", hod, ["PENDING_HOD"]],
    ["employee", "personal", hod, []],
    ["official", "official", { ...hod, officeApproval: "direct" }, []],
    ["official", "official", { ...hod, officeApproval: "hod" }, ["PENDING_HOD"]],
    ["iar_cell", "official", { ...hod, officeApproval: "hod" }, ["PENDING_HOD"]],
    ["iar_cell", "alumni", { ...hod, officeApproval: "direct" }, []],
    ["iar_student_cell", "alumni", hod, ["PENDING_IAR"]],
    ["gh_manager", "official", hod, []],
  ])("%s / %s → %j", (role, bookingType, ctx, expected) => {
    expect(routeFor(role, "room", { bookingType, ...ctx })).toEqual(expected);
  });

  it("meals only skips every stage", () => {
    expect(routeFor("student", "meals_only", {})).toEqual([]);
    expect(initialStatusFor("employee", "meals_only", { bookingType: "official", hasHodApprover: true })).toBe(
      "PENDING_GH_MANAGER"
    );
  });

  it("staff official bookings need the HOD too (not only faculty)", () => {
    const ravi = P("staff-ravi");
    const stages = approvalStagesFor({ user_role: "employee", booking_type: "official" }, ravi, units);
    expect(stages).toEqual(["PENDING_HOD"]);
  });

  it("a role that cannot book throws", () => {
    expect(() => routeFor("warden", "room", {})).toThrow();
  });
});

describe("the HOD, scoped to their department", () => {
  const priya = P("employee-priya");
  const hodCse = P("hod-cse");

  it("the CSE HOD approves CSE faculty's official bookings", () => {
    expect(canReview(hodCse, "PENDING_HOD", priya, units)).toBe(true);
  });

  it("and not another department's", () => {
    const mech: Unit = { id: "unit-mech", name: "Mechanical", kind: "department", parent_id: null, head_id: "someone", acting_head_id: null };
    const outsider = { ...priya, id: "p-mech", unit_id: "unit-mech" };
    expect(canReview(hodCse, "PENDING_HOD", outsider, [...units, mech])).toBe(false);
  });

  it("never their own: an HOD's own official booking skips the stage", () => {
    expect(hodApproversFor(hodCse, units)).toEqual([]);
    expect(canReview(hodCse, "PENDING_HOD", hodCse, units)).toBe(false);
    expect(approvalStagesFor({ user_role: "employee", booking_type: "official" }, hodCse, units)).toEqual([]);
  });

  it("an acting HOD may approve the HOD's own booking", () => {
    const withActing = units.map((u) => (u.id === "unit-cse" ? { ...u, acting_head_id: "employee-priya" } : u));
    expect(hodApproversFor(hodCse, withActing)).toEqual(["employee-priya"]);
    expect(canReview(priya, "PENDING_HOD", hodCse, withActing)).toBe(true);
  });

  it("a department office answers to its department's HOD", () => {
    const office = P("office-cse");
    expect(hodUnitIdFor(office.unit_id, units)).toBe("unit-cse");
    expect(canReview(hodCse, "PENDING_HOD", office, units)).toBe(true);
    expect(
      approvalStagesFor({ user_role: "official", booking_type: "official", office_approval: "hod" }, office, units)
    ).toEqual(["PENDING_HOD"]);
    expect(
      approvalStagesFor({ user_role: "official", booking_type: "official", office_approval: "direct" }, office, units)
    ).toEqual([]);
  });

  it("an officer office's HOD approval is its own head — none set, so the stage is skipped", () => {
    const director = P("official-admin");
    expect(hodUnitIdFor(director.unit_id, units)).toBe("unit-director-office");
    expect(
      approvalStagesFor({ user_role: "official", booking_type: "official", office_approval: "hod" }, director, units)
    ).toEqual([]);
  });

  it("the warden, the manager or a stranger cannot act at the HOD stage", () => {
    for (const id of ["warden-malhar", "gh-manager", "faculty-arun"]) {
      expect(canReview(P(id), "PENDING_HOD", priya, units)).toBe(false);
    }
  });
});

describe("club: advisor or council secretary first, then the HOD it answers to", () => {
  const club = P("club-petrichor");
  const withHod = units.map((u) => (u.id === "unit-petrichor" ? { ...u, hod_unit_id: "unit-cse" } : u));

  it("with no HOD unit, FA → manager", () => {
    const stages = approvalStagesFor({ user_role: "club", booking_type: "official" }, club, units);
    expect(stages).toEqual(["PENDING_FA"]);
    expect(nextStatusAfter("PENDING_FA", stages)).toBe("PENDING_GH_MANAGER");
  });

  it("with one, FA → HOD → manager, and the HOD approves", () => {
    const stages = approvalStagesFor({ user_role: "club", booking_type: "official" }, club, withHod);
    expect(stages).toEqual(["PENDING_FA", "PENDING_HOD"]);
    expect(nextStatusAfter("PENDING_FA", stages)).toBe("PENDING_HOD");
    expect(nextStatusAfter("PENDING_HOD", stages)).toBe("PENDING_GH_MANAGER");
    expect(canReview(P("secretary-cultural"), "PENDING_FA", club, withHod)).toBe(true);
    expect(canReview(P("hod-cse"), "PENDING_HOD", club, withHod)).toBe(true);
    expect(canReview(P("secretary-cultural"), "PENDING_HOD", club, withHod)).toBe(false);
  });

  it("the manager's approval makes it APPROVED", () => {
    expect(nextStatusAfter("PENDING_GH_MANAGER", [])).toBe("APPROVED");
    expect(() => nextStatusAfter("APPROVED", [])).toThrow();
  });
});

describe("debitable heads from the brief, per category", () => {
  it.each<[string, Role, BookingType, string[]]>([
    // Special Funds on every official booking since 24 Sep 2026.
    ["faculty", "employee-priya" as Role, "official", ["department_budget", "project_grant", "professional_development_fund", "special_budget"]],
    ["staff", "staff-ravi" as Role, "official", ["department_budget", "special_budget"]],
    ["officer office", "official-admin" as Role, "official", ["institute_grant", "special_budget"]],
    ["department office", "office-cse" as Role, "official", ["department_budget", "special_budget"]],
    // Special Funds for everyone except students since 25 Sep 2026.
    ["personal", "employee-priya" as Role, "personal", ["personal_funds", "special_budget"]],
    ["student", "student-anjali" as Role, "personal", ["personal_funds"]],
  ])("%s", (_label, id, type, heads) => {
    const p = P(id as string);
    const cat = debitCategoryFor(p.role, type, p, units);
    expect(DEFAULT_DEBIT_RULES.room[cat]).toEqual(heads);
  });

  it("dining never offers Project; staff get Department only", () => {
    const priya = P("employee-priya");
    const dining = debitHeadsByType("employee", ["official"], priya, units, DEFAULT_DEBIT_RULES, "dining");
    expect(dining.official).toEqual(["department_budget", "professional_development_fund", "personal_funds", "special_budget"]);
    expect(DEFAULT_DEBIT_RULES.dining.staff).toEqual(["department_budget", "special_budget"]);
  });

  /**
   * 23 Sep 2026: the Institute Grant is the offices' money, not a fourth
   * budget a faculty member can reach. It is a floor under Settings, not just
   * a default — a stored row that still lists it is ignored on read, and the
   * console cannot save it.
   */
  it("never offers faculty the Institute Grant, whatever Settings says", () => {
    expect(DEFAULT_DEBIT_RULES.room.faculty).not.toContain("institute_grant");
    expect(allowedHeads("faculty", ["department_budget", "institute_grant"])).toEqual([
      "department_budget",
    ]);
    // The offices that do hold it keep it.
    expect(allowedHeads("officer_office", ["institute_grant"])).toEqual(["institute_grant"]);

    const tampered: DebitRules = {
      ...DEFAULT_DEBIT_RULES,
      room: {
        ...DEFAULT_DEBIT_RULES.room,
        faculty: ["department_budget", "institute_grant"],
      },
    };
    const priya = P("employee-priya");
    expect(
      debitHeadsByType("employee", ["official"], priya, units, tampered, "room").official
    ).toEqual(["department_budget"]);
    expect(debitRulesSchema.safeParse(tampered).success).toBe(false);
    expect(debitRulesSchema.safeParse(DEFAULT_DEBIT_RULES).success).toBe(true);
  });
});

describe("who may book what", () => {
  /**
   * 23 Sep 2026: the desk account is the guest house, not a person. A manager
   * books their own family from their ordinary institute account, so
   * "personal" is gone from the console that also approves bookings.
   */
  it("gives the Guest House Manager no personal booking type", () => {
    expect(bookingTypesFor("gh_manager")).toEqual(["official", "alumni"]);
    expect(bookingTypesFor("employee")).toContain("personal");
  });
});

describe("the schema accepts its own output for every requester role", () => {
  const checkIn = addDaysToDateValue(toInstituteDateValue(new Date()), 3);
  const checkOut = addDaysToDateValue(checkIn, 1);
  const personaFor: Record<string, string> = {
    student: "student-anjali",
    employee: "employee-priya",
    official: "official-admin",
    club: "club-petrichor",
    iar_cell: "iar-cell",
    iar_student_cell: "iar-student-cell",
  };

  for (const role of REQUESTER_ROLES) {
    const persona = P(personaFor[role]);
    for (const type of bookingTypesFor(role)) {
      it(`${role} / ${type}`, () => {
        const config = { ...buildDefaultFormConfig(role, [GH]), alumni_card: "optional" as const };
        const lists = {
          room: debitHeadsByType(role, bookingTypesFor(role), persona, units, DEFAULT_DEBIT_RULES, "room"),
          dining: debitHeadsByType(role, bookingTypesFor(role), persona, units, DEFAULT_DEBIT_RULES, "dining"),
        };
        const head = lists.room[type]![0];
        const payload = {
          guest_house_id: GH.id,
          service_type: "room",
          privacy_consent: true,
          booking_type: type,
          debit_head: head,
          project_id: head === "project_grant" ? "proj-storage" : null,
          office_approval: role === "official" || role === "iar_cell" ? "hod" : null,
          alumni_name: type === "alumni" ? "A. Alumnus" : null,
          alumni_roll_number: type === "alumni" ? "101" : null,
          purpose_of_visit: "Visiting the institute",
          check_in: `${checkIn}T12:00`,
          check_out: `${checkOut}T10:00`,
          rooms: [
            {
              room_type: null,
              guests: [
                { name: "Guest One", age: 40, gender: "female", relationship: config.relationship_options[0] ?? "Guest", id_number: "1234 5678 9012", citizenship: "indian" },
              ],
            },
          ],
        };
        const schema = bookingPayloadSchema(config, {
          mealsAvailable: true,
          debitHeads: lists,
          projectIds: ["proj-storage"],
        });
        const first = schema.safeParse(payload);
        expect(first.success, JSON.stringify(first.error?.issues?.[0])).toBe(true);
        expect(schema.safeParse(first.data).success).toBe(true);
      });
    }
  }

  const config = buildDefaultFormConfig("employee", [GH]);
  const lists = {
    room: debitHeadsByType("employee", ["official", "personal"], P("staff-ravi"), units, DEFAULT_DEBIT_RULES, "room"),
    dining: {},
  };
  const base = {
    guest_house_id: GH.id,
    service_type: "room",
    privacy_consent: true,
    booking_type: "official",
    purpose_of_visit: "Visiting the institute",
    check_in: `${checkIn}T12:00`,
    check_out: `${checkOut}T10:00`,
    rooms: [{ room_type: null, guests: [{ name: "Guest One", age: 40, gender: "male", relationship: "Colleague", id_number: "1234 5678 9012", citizenship: "indian" }] }],
  };

  it("staff cannot charge a project, even by a crafted request", () => {
    const r = bookingPayloadSchema(config, { mealsAvailable: true, debitHeads: lists }).safeParse({
      ...base,
      debit_head: "project_grant",
      project_id: "proj-storage",
    });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].message).toMatch(/cannot be used/);
  });

  it("Project needs a project from the active list", () => {
    const faculty = {
      room: debitHeadsByType("employee", ["official"], P("employee-priya"), units, DEFAULT_DEBIT_RULES, "room"),
      dining: {},
    };
    const schema = bookingPayloadSchema(config, { mealsAvailable: true, debitHeads: faculty, projectIds: ["proj-storage"] });
    expect(schema.safeParse({ ...base, debit_head: "project_grant" }).error?.issues[0].message).toMatch(/Choose the project/);
    expect(schema.safeParse({ ...base, debit_head: "project_grant", project_id: "proj-old" }).error?.issues[0].message).toMatch(/not on the list/);
    expect(schema.safeParse({ ...base, debit_head: "department_budget", project_id: "proj-storage" }).success).toBe(false);
  });

  it("only offices choose an approval route", () => {
    const r = bookingPayloadSchema(config, { mealsAvailable: true, debitHeads: lists }).safeParse({
      ...base,
      debit_head: "department_budget",
      office_approval: "hod",
    });
    expect(r.error?.issues[0].message).toMatch(/Only an office/);
  });
});

describe("project import", () => {
  const existing: Project[] = [
    { id: "p1", project_number: "SP/2025/017", title: "Storage", pi_name: "Dr A", active: true },
  ];

  it("adds, updates and counts unchanged rows from a spreadsheet paste", () => {
    const plan = planProjectImport(
      "Project number\tTitle\tPI\nSP/2025/017\tStorage\tDr A\nsp/2025/017x\tNew one\t\nCP/1\tRenamed\tDr B",
      existing
    );
    expect(plan.problems).toEqual([]);
    expect(plan.unchanged).toBe(1);
    expect(plan.added.map((p) => p.project_number)).toEqual(["sp/2025/017x", "CP/1"]);
  });

  it("is all or nothing", () => {
    const plan = planProjectImport("SP/1, One\n bad number here, Two\nSP/1, Again", existing);
    expect(plan.problems).toHaveLength(2);
    expect(plan.added).toEqual([]);
  });

  it("an existing number with a new title updates it and reactivates it", () => {
    const plan = planProjectImport("SP/2025/017, Storage II, Dr A", [{ ...existing[0], active: false }]);
    expect(plan.updated).toEqual([{ id: "p1", patch: { title: "Storage II", pi_name: "Dr A", active: true } }]);
  });
});

describe("history scope for an HOD", () => {
  const hodCse = P("hod-cse") as Profile;

  it("their own bookings and their department's, not others", () => {
    const scope = historyScope(hodCse, units);
    if (!scope.ok) throw new Error("scope refused");
    expect(scope.isOwnBookings).toBe(false);
    const mine = booking({ id: "own", user_id: "hod-cse", requester: hodCse });
    const dept = booking({ id: "dept", user_id: "employee-priya", requester: P("employee-priya") });
    const office = booking({ id: "office", user_id: "office-cse", requester: P("office-cse") });
    const other = booking({ id: "other", user_id: "student-anjali", requester: P("student-anjali") });
    const result = runBookingSearch([mine, dept, office, other], { ...scope.criteria });
    expect(result.rows.map((b) => b.id).sort()).toEqual(["dept", "office", "own"]);
  });

  it("an ordinary employee still sees only their own", () => {
    const scope = historyScope(P("staff-ravi"), units);
    expect(scope.ok && scope.isOwnBookings).toBe(true);
  });
});
