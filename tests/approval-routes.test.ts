import { describe, expect, it } from "vitest";
import {
  approvalRulesSchema,
  BUILT_IN_STAGE_APPROVERS,
  configuredStageName,
  DEFAULT_APPROVAL_RULES,
  describeChain,
  describeConditions,
  decidesStage,
  matchingRule,
  stageApproverIds,
  stagesDecidedBy,
  STAGE_STATUSES,
  type ApprovalRouteRule,
  type ApprovalRules,
} from "@/lib/approval-routes";
import { approvalRouteBlockers } from "@/lib/settings-impact";
import { DEFAULT_RULES, parseRuleGroup } from "@/lib/settings";
import { seedProfiles, seedUnits } from "@/lib/store/seed";
import type { BookingWithDetails, Profile, Role, ServiceType } from "@/lib/types";
import { type Unit } from "@/lib/units";
import {
  approvalStagesFor,
  asksOfficeApproval,
  canReview,
  canReviewBooking,
  initialStatusFor,
  nextStatusAfter,
  routeFor,
  skippedStages,
} from "@/lib/workflow";
import { booking, GH, profile } from "./helpers";

const P = (id: string) => seedProfiles.find((p) => p.id === id)!;
const units: Unit[] = seedUnits.map((u) => ({ ...u, hod_unit_id: u.hod_unit_id ?? null }));

/** Every route rule the office starts with, as a mutable draft. */
const draft = (): ApprovalRules => JSON.parse(JSON.stringify(DEFAULT_APPROVAL_RULES));

/**
 * The pipeline the portal had before the routes were configurable, written
 * out again here rather than imported: that is the whole point of the
 * comparison below. If `DEFAULT_APPROVAL_RULES` ever stops reproducing it,
 * this table is what says so.
 */
function hardcodedRoute(
  role: Role,
  service: ServiceType,
  ctx: { bookingType?: string; officeApproval?: string; hasHodApprover?: boolean; raisedByFacultyInCharge?: boolean }
): string[] {
  if (service === "meals_only") return [];
  const hod = ctx.hasHodApprover ? ["PENDING_HOD"] : [];
  switch (role) {
    case "student":
      return ["PENDING_WARDEN"];
    case "club":
      return ctx.raisedByFacultyInCharge ? [] : ["PENDING_FA", ...hod];
    case "employee":
      return ctx.bookingType === "official" ? hod : [];
    case "official":
    case "iar_cell":
      return ctx.officeApproval === "hod" ? hod : [];
    case "alumni":
    case "iar_student_cell":
      return ["PENDING_IAR"];
    case "gh_manager":
      return [];
    default:
      throw new Error(`Role ${role} cannot create bookings`);
  }
}

describe("the default routes are the pipeline the portal had", () => {
  const roles: Role[] = [
    "student",
    "employee",
    "official",
    "club",
    "iar_cell",
    "iar_student_cell",
    "alumni",
    "gh_manager",
  ];
  const services: ServiceType[] = ["room", "room_meals", "meals_only"];

  it("agrees with the hardcoded switch over every combination", () => {
    let checked = 0;
    for (const role of roles) {
      for (const service of services) {
        for (const bookingType of ["official", "personal", "alumni"]) {
          for (const officeApproval of ["direct", "hod"] as const) {
            for (const hasHodApprover of [true, false]) {
              for (const raisedByFacultyInCharge of [true, false]) {
                const ctx = {
                  bookingType,
                  officeApproval,
                  hasHodApprover,
                  raisedByFacultyInCharge,
                };
                expect(routeFor(role, service, ctx)).toEqual(hardcodedRoute(role, service, ctx));
                checked++;
              }
            }
          }
        }
      }
    }
    // 8 roles x 3 services x 3 types x 2 choices x 2 x 2
    expect(checked).toBe(576);
  });

  it("still refuses a role that does not book", () => {
    expect(() => routeFor("warden", "room", {})).toThrow();
    expect(() => routeFor("developer", "room", {})).toThrow();
    // `approvalStagesFor` swallows it, as it always did.
    expect(approvalStagesFor({ user_role: "warden" }, profile(), units)).toEqual([]);
  });

  it("is what Settings falls back to, and what a stored row merges over", () => {
    expect(DEFAULT_RULES.approval).toEqual(DEFAULT_APPROVAL_RULES);
    expect(parseRuleGroup("approval", null)).toEqual(DEFAULT_APPROVAL_RULES);
    expect(parseRuleGroup("approval", { nonsense: true })).toEqual(DEFAULT_APPROVAL_RULES);
    // A saved list replaces the default list wholesale rather than merging
    // into it - two routes with the same id would otherwise be unreachable.
    const one = { revision: 1, rules: [DEFAULT_APPROVAL_RULES.rules[1]] };
    expect(parseRuleGroup("approval", one).rules).toHaveLength(1);
  });
});

describe("the office edits the chain", () => {
  it("inserts a stage: a student's request goes to the HOD after the warden", () => {
    const rules = draft();
    const student = rules.rules.find((r) => r.id === "student")!;
    student.stages.push({ status: "PENDING_HOD", approver: { kind: "hod" } });
    expect(routeFor("student", "room", { rules, hasHodApprover: true })).toEqual([
      "PENDING_WARDEN",
      "PENDING_HOD",
    ]);
    // And forwarding follows it, because `nextStatusAfter` reads the chain.
    const stages = routeFor("student", "room", { rules, hasHodApprover: true });
    expect(nextStatusAfter("PENDING_WARDEN", stages)).toBe("PENDING_HOD");
    expect(nextStatusAfter("PENDING_HOD", stages)).toBe("PENDING_GH_MANAGER");
  });

  it("deletes a stage: a student's request goes straight to the desk", () => {
    const rules = draft();
    rules.rules.find((r) => r.id === "student")!.stages = [];
    expect(initialStatusFor("student", "room", { rules })).toBe("PENDING_GH_MANAGER");
  });

  it("reorders the stages of a club's own request", () => {
    const rules = draft();
    const club = rules.rules.find((r) => r.id === "club-own")!;
    club.stages.reverse();
    expect(routeFor("club", "room", { rules, hasHodApprover: true })).toEqual([
      "PENDING_HOD",
      "PENDING_FA",
    ]);
  });

  it("turns a route off without deleting it, and the next one takes over", () => {
    const rules = draft();
    rules.rules.find((r) => r.id === "employee-official")!.active = false;
    // The personal rule below it has no booking-type condition, so it catches
    // the official booking too - which is exactly why order is editable.
    expect(
      routeFor("employee", "room", { rules, bookingType: "official", hasHodApprover: true })
    ).toEqual([]);
    expect(matchingRule({ role: "employee", bookingType: "official" }, rules)?.id).toBe(
      "employee-personal"
    );
  });

  it("the first matching route wins, so order is the rule", () => {
    const rules = draft();
    const narrow: ApprovalRouteRule = {
      id: "cse-dean",
      name: "CSE staff go to the Dean",
      active: true,
      when: { roles: ["employee"], unit_ids: ["unit-cse"] },
      stages: [{ status: "PENDING_FA", approver: { kind: "unit", unit_id: "unit-cultural" } }],
    };
    // Below the broad employee rules it never fires...
    const below = { ...rules, rules: [...rules.rules, narrow] };
    expect(matchingRule({ role: "employee", bookingType: "official", unitId: "unit-cse" }, below)?.id).toBe(
      "employee-official"
    );
    // ...and above them it does.
    const above = { ...rules, rules: [narrow, ...rules.rules] };
    expect(matchingRule({ role: "employee", bookingType: "official", unitId: "unit-cse" }, above)?.id).toBe(
      "cse-dean"
    );
  });

  it("routes one hostel's students somewhere else", () => {
    const rules = draft();
    const malhar: ApprovalRouteRule = {
      id: "malhar-direct",
      name: "Malhar students straight to the desk",
      active: true,
      when: { roles: ["student"], hostels: ["Malhar"] },
      stages: [],
    };
    rules.rules.unshift(malhar);
    expect(routeFor("student", "room", { rules, hostelName: "Malhar" })).toEqual([]);
    expect(routeFor("student", "room", { rules, hostelName: "Saveri" })).toEqual([
      "PENDING_WARDEN",
    ]);
  });

  it("names a stage, and the name reaches the queue page and the nav", () => {
    const rules = draft();
    const club = rules.rules.find((r) => r.id === "club-own")!;
    club.stages[0].label = "Dean of Students";
    expect(configuredStageName("PENDING_FA", rules)).toBe("Dean of Students");
    // Two different names for one slot is no name at all - the slot's own is
    // the only honest heading for a queue holding both.
    const second = JSON.parse(JSON.stringify(club)) as ApprovalRouteRule;
    second.id = "club-two";
    second.stages[0].label = "Students' Council";
    rules.rules.push(second);
    expect(configuredStageName("PENDING_FA", rules)).toBeNull();
    expect(configuredStageName("PENDING_HOD", DEFAULT_APPROVAL_RULES)).toBeNull();
  });
});

describe("a stage nobody can decide is skipped, not stranded", () => {
  const priya = P("student-anjali");
  const directory = { units, profiles: seedProfiles };

  it("drops the warden stage when the hostel has no warden", () => {
    const orphan: Profile = { ...priya, hostel_name: "Nowhere" };
    const context = { rules: draft(), directory, requester: orphan, hostelName: "Nowhere" };
    expect(routeFor("student", "room", context)).toEqual([]);
    expect(skippedStages("student", "room", context).map((s) => s.status)).toEqual([
      "PENDING_WARDEN",
    ]);
  });

  it("keeps it where the hostel does have one", () => {
    const context = { rules: draft(), directory, requester: priya, hostelName: priya.hostel_name };
    expect(routeFor("student", "room", context)).toEqual(["PENDING_WARDEN"]);
    expect(skippedStages("student", "room", context)).toEqual([]);
  });

  it("drops a stage pointing at a named account that is the requester", () => {
    const rules = draft();
    rules.rules.find((r) => r.id === "student")!.stages = [
      { status: "PENDING_WARDEN", approver: { kind: "profile", profile_id: priya.id } },
    ];
    expect(
      routeFor("student", "room", { rules, directory, requester: priya })
    ).toEqual([]);
  });

  it("assumes a stage is staffed when it cannot count - the old behaviour", () => {
    // No directory: only the HOD stage is judged, from `hasHodApprover`.
    expect(routeFor("student", "room", { rules: draft() })).toEqual(["PENDING_WARDEN"]);
  });
});

describe("who decides a stage", () => {
  const priya = P("student-anjali");
  const directory = { units, profiles: seedProfiles };

  it("resolves each kind of approver", () => {
    expect(stageApproverIds({ kind: "warden" }, priya, directory)).toContain("warden-malhar");
    expect(stageApproverIds({ kind: "hod" }, P("staff-ravi"), directory)).toContain("hod-cse");
    expect(stageApproverIds({ kind: "role", role: "iar_cell" }, priya, directory).length).toBeGreaterThan(0);
    expect(stageApproverIds({ kind: "profile", profile_id: "hod-cse" }, priya, directory)).toEqual([
      "hod-cse",
    ]);
    // Never the requester themselves, whatever the rule says.
    expect(stageApproverIds({ kind: "profile", profile_id: priya.id }, priya, directory)).toEqual([]);
  });

  it("lets a named person act on the stage a route gives them", () => {
    const rules = draft();
    rules.rules.find((r) => r.id === "student")!.stages = [
      { status: "PENDING_WARDEN", approver: { kind: "profile", profile_id: "hod-cse" }, label: "Dean" },
    ];
    const request = { role: "student" as Role, service: "room" as ServiceType };
    const ctx = { rules, request, profiles: seedProfiles };
    expect(canReview(P("hod-cse"), "PENDING_WARDEN", priya, units, ctx)).toBe(true);
    // ...and takes it away from the warden who used to have it.
    expect(canReview(P("warden-malhar"), "PENDING_WARDEN", priya, units, ctx)).toBe(false);
  });

  it("falls back to the stage's built-in meaning for a request no route describes", () => {
    const rules: ApprovalRules = { revision: 1, rules: [] };
    const request = { role: "student" as Role, service: "room" as ServiceType };
    // No route, so nothing configures PENDING_WARDEN - the warden keeps it,
    // which is what stops a reconfiguration stranding a waiting request.
    expect(
      canReview(P("warden-malhar"), "PENDING_WARDEN", priya, units, {
        rules,
        request,
        profiles: seedProfiles,
      })
    ).toBe(true);
    expect(BUILT_IN_STAGE_APPROVERS.PENDING_WARDEN).toEqual({ kind: "warden" });
  });

  it("never lets anyone approve their own request", () => {
    const rules = draft();
    rules.rules.find((r) => r.id === "student")!.stages = [
      { status: "PENDING_WARDEN", approver: { kind: "profile", profile_id: priya.id } },
    ];
    expect(
      canReview(priya, "PENDING_WARDEN", priya, units, {
        rules,
        request: { role: "student", service: "room" },
        profiles: seedProfiles,
      })
    ).toBe(false);
    expect(decidesStage(priya, { kind: "profile", profile_id: priya.id }, priya, directory)).toBe(false);
  });

  it("keeps the manager stage out of the office's hands", () => {
    expect(canReview(P("gh-manager"), "PENDING_GH_MANAGER", priya, units)).toBe(true);
    expect(canReview(P("warden-malhar"), "PENDING_GH_MANAGER", priya, units)).toBe(false);
    // There is no PENDING_GH_MANAGER slot to configure.
    expect(STAGE_STATUSES).not.toContain("PENDING_GH_MANAGER");
  });

  it("gives an approver the queue the route points them at", () => {
    const rules = draft();
    rules.rules.find((r) => r.id === "student")!.stages = [
      { status: "PENDING_WARDEN", approver: { kind: "profile", profile_id: "hod-cse" } },
    ];
    expect(stagesDecidedBy(P("hod-cse"), rules, directory)).toContain("PENDING_WARDEN");
    // The warden no longer decides anything under these routes.
    expect(stagesDecidedBy(P("warden-malhar"), rules, directory)).not.toContain("PENDING_WARDEN");
  });

  it("reads a stored booking's own route, through canReviewBooking", () => {
    const stored = {
      ...booking({
        status: "PENDING_WARDEN",
        user_role: "student",
        user_id: priya.id,
        guest_house_id: GH.id,
      }),
      requester: priya,
    } as BookingWithDetails;
    expect(canReviewBooking(P("warden-malhar"), stored, units, { profiles: seedProfiles })).toBe(true);
    const rules = draft();
    rules.rules.find((r) => r.id === "student")!.stages = [
      { status: "PENDING_WARDEN", approver: { kind: "profile", profile_id: "hod-cse" } },
    ];
    expect(
      canReviewBooking(P("warden-malhar"), stored, units, { rules, profiles: seedProfiles })
    ).toBe(false);
    expect(canReviewBooking(P("hod-cse"), stored, units, { rules, profiles: seedProfiles })).toBe(true);
  });
});

describe("an office is asked how its booking is approved only where it matters", () => {
  it("not when the two answers lead to the same place", () => {
    const rules = draft();
    expect(asksOfficeApproval("official", "room", true, { rules })).toBe(true);
    expect(asksOfficeApproval("official", "room", false, { rules })).toBe(false);
    // Take the HOD stage off the office's route and the question goes too.
    rules.rules.find((r) => r.id === "office-hod")!.stages = [];
    expect(asksOfficeApproval("official", "room", true, { rules })).toBe(false);
  });

  it("never for a dining booking, and never for anyone but an office", () => {
    expect(asksOfficeApproval("official", "meals_only", true)).toBe(false);
    expect(asksOfficeApproval("employee", "room", true)).toBe(false);
    expect(asksOfficeApproval("student", "room", true)).toBe(false);
  });
});

describe("validation refuses a workflow that cannot work", () => {
  it("refuses one status twice in a chain", () => {
    const rules = draft();
    rules.rules.find((r) => r.id === "student")!.stages.push({
      status: "PENDING_WARDEN",
      approver: { kind: "hod" },
    });
    const parsed = approvalRulesSchema.safeParse(rules);
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.message).toContain("appears twice");
  });

  it("refuses two routes sharing an id", () => {
    const rules = draft();
    rules.rules.push({ ...rules.rules[1] });
    expect(approvalRulesSchema.safeParse(rules).success).toBe(false);
  });

  it("refuses a nameless route and an unnamed target", () => {
    const rules = draft();
    rules.rules[0].name = "x";
    expect(approvalRulesSchema.safeParse(rules).success).toBe(false);
    const other = draft();
    other.rules[1].stages = [{ status: "PENDING_FA", approver: { kind: "unit", unit_id: "" } }];
    expect(approvalRulesSchema.safeParse(other).success).toBe(false);
  });

  it("accepts the defaults, and accepts its own output", () => {
    const parsed = approvalRulesSchema.safeParse(DEFAULT_APPROVAL_RULES);
    expect(parsed.success).toBe(true);
    expect(approvalRulesSchema.safeParse(parsed.data).success).toBe(true);
  });
});

describe("a change that would strand a waiting request is refused", () => {
  const priya = P("student-anjali");
  const waiting = {
    ...booking({
      status: "PENDING_WARDEN",
      user_role: "student",
      user_id: priya.id,
      guest_house_id: GH.id,
      check_out: new Date(Date.now() + 86_400_000 * 5).toISOString(),
    }),
    requester: priya,
  } as BookingWithDetails;

  it("names the request whose stage the new routes drop", () => {
    const rules = draft();
    rules.rules.find((r) => r.id === "student")!.stages = [];
    const blockers = approvalRouteBlockers(rules, [waiting], units, seedProfiles);
    expect(blockers.join(" ")).toContain(waiting.booking_reference_id);
  });

  it("names a stage pointing at a unit nobody heads, or an account that is gone", () => {
    const rules = draft();
    const headless: Unit = {
      id: "unit-empty",
      name: "Empty Office",
      kind: "office",
      parent_id: null,
      head_id: null,
      acting_head_id: null,
    };
    rules.rules.find((r) => r.id === "student")!.stages = [
      { status: "PENDING_WARDEN", approver: { kind: "unit", unit_id: headless.id } },
    ];
    expect(
      approvalRouteBlockers(rules, [], [...units, headless], seedProfiles).join(" ")
    ).toContain("nobody heads Empty Office");

    const gone = draft();
    gone.rules.find((r) => r.id === "student")!.stages = [
      { status: "PENDING_WARDEN", approver: { kind: "profile", profile_id: "nobody" } },
    ];
    expect(approvalRouteBlockers(gone, [], units, seedProfiles).join(" ")).toContain(
      "no longer exists"
    );
  });

  it("passes the defaults against the seeded data", () => {
    expect(approvalRouteBlockers(DEFAULT_APPROVAL_RULES, [waiting], units, seedProfiles)).toEqual([]);
  });
});

describe("a route reads back in words", () => {
  it("describes the chain and the conditions", () => {
    const student = DEFAULT_APPROVAL_RULES.rules.find((r) => r.id === "student")!;
    expect(describeChain(student.stages)).toBe("Assistant Warden - Guest House Manager");
    expect(describeChain([])).toBe("Guest House Manager");
    expect(describeConditions(student)).toEqual(["Student"]);
    const office = DEFAULT_APPROVAL_RULES.rules.find((r) => r.id === "office-hod")!;
    expect(describeConditions(office).join(" · ")).toContain("Requires HOD approval");
  });
});

describe("one door to the routes", () => {
  it("Settings refuses the approval group and names the right section", async () => {
    const { saveRuleGroup } = await import("@/app/actions/settings");
    const result = await saveRuleGroup("approval", DEFAULT_APPROVAL_RULES);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toContain("Approval Workflow");
  });
});
