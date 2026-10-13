import { describe, expect, it } from "vitest";
import {
  approverFromValue,
  approverValue,
  categoryChains,
  categoryRouteName,
  chainFor,
  freeSlots,
  insertStage,
  MAX_STEPS,
  moveStage,
  removeStage,
  REQUEST_CATEGORIES,
  setCategoryStages,
  setStageApprover,
  setStageLabel,
  slotForApprover,
  uncoveredRules,
} from "@/lib/approval-categories";
import {
  approvalRulesSchema,
  DEFAULT_APPROVAL_RULES,
  describeChain,
  stagesFor,
  type ApprovalRules,
  type ApprovalStage,
  type ApproverRule,
} from "@/lib/approval-routes";

const draft = (): ApprovalRules => JSON.parse(JSON.stringify(DEFAULT_APPROVAL_RULES));

/** One kind of request's chain, in the words the card shows. */
const chainOf = (rules: ApprovalRules, id: string) =>
  describeChain(chainFor(rules, id)?.stages ?? []);

const stage = (
  status: ApprovalStage["status"],
  approver: ApproverRule,
  label: string | null = null
): ApprovalStage => ({ status, approver, label });

describe("the cards show what the engine does", () => {
  it("reads every kind of request off the institute's own pipeline", () => {
    const rules = draft();
    expect(
      Object.fromEntries(categoryChains(rules).map((c) => [c.category.id, describeChain(c.stages)]))
    ).toEqual({
      student: "Assistant Warden - Guest House Manager",
      "faculty-official": "HOD - Guest House Manager",
      "staff-official": "HOD - Guest House Manager",
      "employee-personal": "Guest House Manager",
      "club-advisor": "Guest House Manager",
      "office-direct": "Guest House Manager",
      "office-hod": "HOD - Guest House Manager",
      "iar-office": "Guest House Manager",
      "iar-student-cell": "IAR Office - Guest House Manager",
      dining: "Guest House Manager",
      desk: "Guest House Manager",
    });
  });

  it("never works a chain out for itself - it asks the engine", () => {
    const rules = draft();
    for (const { category, stages } of categoryChains(rules)) {
      expect(stages, category.id).toEqual(stagesFor(category.facts, rules));
    }
  });

  it("says which kinds share one route, so an edit can say what it will do", () => {
    const chains = categoryChains(draft());
    const shared = (id: string) =>
      chains
        .find((c) => c.category.id === id)!
        .sharedWith.map((c) => c.id)
        .sort();

    // The defaults put faculty and non-teaching staff on one official route,
    // and both classes of office on one direct route.
    expect(shared("faculty-official")).toEqual(["staff-official"]);
    expect(shared("staff-official")).toEqual(["faculty-official"]);
    expect(shared("office-direct")).toEqual(["iar-office"]);
    expect(shared("student")).toEqual([]);
  });

  it("names a route no card governs rather than hiding it", () => {
    // The club's own account cannot submit since 24 Sep 2026, so its route
    // is reachable only by a booking stored before then.
    expect(uncoveredRules(draft()).map((r) => r.id)).toEqual(["club-own"]);
  });

  it("covers every kind with a unique id and a representative request", () => {
    const ids = REQUEST_CATEGORIES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const category of REQUEST_CATEGORIES) {
      expect(chainFor(draft(), category.id), category.id).not.toBeNull();
    }
  });
});

describe("editing the chain of a kind that has a route to itself", () => {
  it("changes that route where it is, and adds nothing", () => {
    const before = draft();
    const after = setCategoryStages(before, "student", [
      stage("PENDING_WARDEN", { kind: "warden" }),
      stage("PENDING_HOD", { kind: "profile", profile_id: "p-dean" }, "Dean of Students"),
    ]);
    expect(after.rules).toHaveLength(before.rules.length);
    expect(chainOf(after, "student")).toBe(
      "Assistant Warden - Dean of Students - Guest House Manager"
    );
    expect(after.rules.find((r) => r.id === "student")?.stages).toHaveLength(2);
  });

  it("sends a kind straight to the desk when every step is removed", () => {
    const after = setCategoryStages(draft(), "student", []);
    expect(chainOf(after, "student")).toBe("Guest House Manager");
    expect(after.rules.find((r) => r.id === "student")?.stages).toEqual([]);
  });

  it("leaves every other kind alone", () => {
    const before = categoryChains(draft());
    const after = categoryChains(setCategoryStages(draft(), "student", []));
    for (const [i, chain] of after.entries()) {
      if (chain.category.id === "student") continue;
      expect(describeChain(chain.stages), chain.category.id).toBe(
        describeChain(before[i].stages)
      );
    }
  });
});

describe("editing the chain of a kind that shares a route", () => {
  const forked = () =>
    setCategoryStages(
      draft(),
      "faculty-official",
      [
        stage("PENDING_HOD", { kind: "hod" }),
        stage("PENDING_FA", { kind: "profile", profile_id: "p-dean" }, "Dean of Students"),
      ],
      () => 1
    );

  it("gives that kind a route of its own", () => {
    const after = forked();
    expect(after.rules).toHaveLength(draft().rules.length + 1);
    expect(chainOf(after, "faculty-official")).toBe(
      "HOD - Dean of Students - Guest House Manager"
    );
  });

  it("does not touch the kind it was sharing with", () => {
    expect(chainOf(forked(), "staff-official")).toBe("HOD - Guest House Manager");
  });

  it("puts the new route immediately above the one it is leaving", () => {
    const after = forked();
    const shared = after.rules.findIndex((r) => r.id === "employee-official");
    const own = after.rules.findIndex((r) => r.when.staff_categories?.includes("faculty"));
    expect(own).toBe(shared - 1);
  });

  it("leaves every other kind alone", () => {
    const before = categoryChains(draft());
    const after = categoryChains(forked());
    for (const [i, chain] of after.entries()) {
      if (chain.category.id === "faculty-official") continue;
      expect(describeChain(chain.stages), chain.category.id).toBe(
        describeChain(before[i].stages)
      );
    }
  });

  it("forks once, however many times it is edited", () => {
    const once = forked();
    const twice = setCategoryStages(once, "faculty-official", [
      stage("PENDING_HOD", { kind: "hod" }),
    ]);
    expect(twice.rules).toHaveLength(once.rules.length);
    expect(chainOf(twice, "faculty-official")).toBe("HOD - Guest House Manager");
    expect(chainOf(twice, "staff-official")).toBe("HOD - Guest House Manager");
  });

  it("names the forked route after the kind, for the audit log", () => {
    const category = REQUEST_CATEGORIES.find((c) => c.id === "faculty-official")!;
    expect(forked().rules.some((r) => r.name === categoryRouteName(category))).toBe(true);
    expect(categoryRouteName(category)).toBe("Faculty - an official stay");
  });

  it("produces a workflow the server will accept", () => {
    expect(approvalRulesSchema.safeParse(forked()).success).toBe(true);
  });
});

describe("the steps of a chain", () => {
  it("inserts where it is asked to", () => {
    const one = [stage("PENDING_WARDEN", { kind: "warden" })];
    expect(insertStage(one, 0)?.map((s) => s.status)).toEqual([
      "PENDING_FA",
      "PENDING_WARDEN",
    ]);
    expect(insertStage(one, 1)?.map((s) => s.status)).toEqual([
      "PENDING_WARDEN",
      "PENDING_FA",
    ]);
  });

  it("gives a new step the slot's own approver, so it needs no name", () => {
    const added = insertStage([], 0)!;
    expect(added[0]).toEqual({
      status: "PENDING_WARDEN",
      approver: { kind: "warden" },
      label: null,
    });
  });

  it("runs out at four, because there are four waiting statuses", () => {
    let stages: ApprovalStage[] = [];
    for (let i = 0; i < MAX_STEPS; i += 1) {
      const next = insertStage(stages, stages.length);
      expect(next, `insert ${i}`).not.toBeNull();
      stages = next!;
    }
    expect(stages).toHaveLength(MAX_STEPS);
    expect(freeSlots(stages)).toEqual([]);
    expect(insertStage(stages, 0)).toBeNull();
    // Four steps, each in its own slot, is still a valid workflow.
    expect(
      approvalRulesSchema.safeParse({
        revision: 1,
        rules: [{ id: "r", name: "Four deep", active: true, when: {}, stages }],
      }).success
    ).toBe(true);
  });

  it("prefers the slot that already means this approver", () => {
    expect(slotForApprover({ kind: "hod" }, [])).toBe("PENDING_HOD");
    expect(slotForApprover({ kind: "warden" }, [])).toBe("PENDING_WARDEN");
    expect(slotForApprover({ kind: "role", role: "iar_cell" }, [])).toBe("PENDING_IAR");
    // Taken, so it takes the first slot that is free instead.
    expect(slotForApprover({ kind: "hod" }, [stage("PENDING_HOD", { kind: "hod" })])).toBe(
      "PENDING_WARDEN"
    );
  });

  it("reorders and removes", () => {
    const two = [
      stage("PENDING_WARDEN", { kind: "warden" }),
      stage("PENDING_HOD", { kind: "hod" }),
    ];
    expect(moveStage(two, 0, 1).map((s) => s.status)).toEqual([
      "PENDING_HOD",
      "PENDING_WARDEN",
    ]);
    expect(moveStage(two, 1, 1)).toEqual(two);
    expect(moveStage(two, 0, -1)).toEqual(two);
    expect(removeStage(two, 0).map((s) => s.status)).toEqual(["PENDING_HOD"]);
  });
});

describe("who decides a step", () => {
  it("never moves the slot, and names the step when the slot's name would be wrong", () => {
    const warden = stage("PENDING_WARDEN", { kind: "warden" });
    const named = setStageApprover(warden, { kind: "profile", profile_id: "p-dean" }, {
      profiles: [{ id: "p-dean", full_name: "Dr. Arun Prasad" }],
    });
    expect(named.status).toBe("PENDING_WARDEN");
    expect(named.label).toBe("Dr. Arun Prasad");
  });

  it("leaves the step unnamed where the approver is what the slot means", () => {
    const hod = stage("PENDING_HOD", { kind: "hod" });
    expect(setStageApprover(hod, { kind: "hod" }).label).toBeNull();
  });

  it("never overwrites a name the office typed", () => {
    const own = stage("PENDING_HOD", { kind: "hod" }, "Dean of Students");
    const changed = setStageApprover(own, { kind: "profile", profile_id: "p-x" });
    expect(changed.label).toBe("Dean of Students");
  });

  it("clears a name back to the approver's own", () => {
    const named = stage("PENDING_HOD", { kind: "hod" }, "Dean of Students");
    expect(setStageLabel(named, "   ").label).toBeNull();
    expect(setStageLabel(named, "Dean").label).toBe("Dean");
  });

  it("is one select value, both ways", () => {
    const approvers: ApproverRule[] = [
      { kind: "warden" },
      { kind: "hod" },
      { kind: "unit_head" },
      { kind: "role", role: "iar_cell" },
      { kind: "unit", unit_id: "u-cse" },
      { kind: "profile", profile_id: "p-dean" },
    ];
    for (const approver of approvers) {
      expect(approverFromValue(approverValue(approver))).toEqual(approver);
    }
    expect(approverFromValue("")).toBeNull();
    expect(approverFromValue("unit:")).toBeNull();
    expect(approverFromValue("nonsense")).toBeNull();
  });
});
