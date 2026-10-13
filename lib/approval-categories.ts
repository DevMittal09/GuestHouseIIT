/**
 * The approval workflow **as a kind of request rather than as a rule**.
 *
 * `lib/approval-routes.ts` is the engine: an ordered list of routes, and the
 * first active one whose conditions match a request decides where it goes.
 * That is the right shape for the thing that runs, and the wrong shape for
 * the person who maintains it. The office does not think "route 5, matching
 * employee and official, below route 4"; it thinks "a faculty member's
 * official stay goes to their HOD". Asked to edit the former, a manager has
 * to hold first-match precedence in their head and know that a narrow route
 * under a broad one never fires.
 *
 * So this module is the **view the office actually has**: eleven kinds of
 * request, each with the chain it takes now, worked out by running the real
 * engine over a representative request of that kind. Nothing here is a second
 * source of truth - {@link categoryChains} answers with `matchingRule`, so
 * what a card shows is what the portal will do.
 *
 * Writing back is the only interesting part, and it has one rule:
 *
 * - The route that governs this kind governs **nothing else**, so editing it
 *   can only change this kind: edit it where it is.
 * - It governs other kinds too, so editing it would change them as well:
 *   this kind gets **a route of its own, immediately above** the one it is
 *   leaving. Above, because the engine takes the first match; immediately,
 *   so no route that used to win for some other request stops winning.
 *
 * That second case is not a workaround. It is the feature the ordered list
 * could only express by hand: the defaults put faculty and non-teaching staff
 * on one official-stay route, and giving faculty a different chain means
 * faculty needing a route of their own.
 */

import {
  BUILT_IN_STAGE_APPROVERS,
  describeApprover,
  matchingRule,
  STAGE_STATUSES,
  type ApprovalRouteRule,
  type ApprovalRouteWhen,
  type ApprovalRules,
  type ApprovalStage,
  type ApproverRule,
  type NamedDirectory,
  type RequestFacts,
  type StageStatus,
} from "@/lib/approval-routes";
import type { Role } from "@/lib/types";

// ------------------------------------------------------------ the categories

export type RequestCategory = {
  /** Stable: it names a forked route and keys the open card. */
  id: string;
  /** Who books. */
  title: string;
  /** What they are booking, where the title does not say it. */
  summary: string;
  /** Who submits, in the first box of the chain. */
  submits: string;
  /** A representative request of this kind, run through the engine. */
  facts: RequestFacts;
  /** What a route of this kind's own would match. */
  when: ApprovalRouteWhen;
};

/**
 * Every kind of request the portal can receive, in the order the office
 * reads them: the people first, then the offices, then what is not a stay.
 *
 * One card per kind, and a kind is a question the office can answer. Where
 * two of them differ only by something the requester chooses per booking -
 * an office's Direct or Requires HOD approval - both are cards, because the
 * chains genuinely differ and the office needs to set both.
 *
 * `facts` is one request, not a set: it is what gets handed to
 * `matchingRule`. `when` is the set, and it is deliberately the narrowest
 * condition that still describes the whole kind, so a forked route catches
 * every request of it and nothing else.
 */
export const REQUEST_CATEGORIES: RequestCategory[] = [
  {
    id: "student",
    title: "Student",
    summary: "a personal stay",
    submits: "Student",
    facts: { role: "student", service: "room", bookingType: "personal" },
    when: { roles: ["student"] },
  },
  {
    id: "faculty-official",
    title: "Faculty",
    summary: "an official stay",
    submits: "Faculty",
    facts: {
      role: "employee",
      service: "room",
      bookingType: "official",
      staffCategory: "faculty",
    },
    when: { roles: ["employee"], booking_types: ["official"], staff_categories: ["faculty"] },
  },
  {
    id: "staff-official",
    title: "Non-teaching staff",
    summary: "an official stay",
    submits: "Staff",
    facts: {
      role: "employee",
      service: "room",
      bookingType: "official",
      staffCategory: "staff",
    },
    when: { roles: ["employee"], booking_types: ["official"], staff_categories: ["staff"] },
  },
  {
    id: "employee-personal",
    title: "Faculty or staff",
    summary: "a personal stay",
    submits: "Employee",
    // No staff category: the kind covers both, so a route that demanded one
    // is not the route that governs it.
    facts: { role: "employee", service: "room", bookingType: "personal", staffCategory: null },
    when: { roles: ["employee"], booking_types: ["personal"] },
  },
  {
    id: "club-advisor",
    title: "Club, council or fest",
    summary: "booked by its Faculty Advisor",
    submits: "Club",
    facts: {
      role: "club",
      service: "room",
      bookingType: "official",
      raisedByFacultyInCharge: true,
    },
    when: { roles: ["club"], raised_by_advisor: true },
  },
  {
    id: "office-direct",
    title: "Institute office",
    summary: "direct, the office's usual choice",
    submits: "Office",
    facts: {
      role: "official",
      service: "room",
      bookingType: "official",
      officeApproval: "direct",
    },
    when: { roles: ["official"], office_approval: ["direct"] },
  },
  {
    id: "office-hod",
    title: "Institute office",
    summary: "where it asks for HOD approval",
    submits: "Office",
    facts: {
      role: "official",
      service: "room",
      bookingType: "official",
      officeApproval: "hod",
    },
    when: { roles: ["official"], office_approval: ["hod"] },
  },
  {
    id: "iar-office",
    title: "IAR Office",
    summary: "its own booking",
    submits: "IAR Office",
    facts: {
      role: "iar_cell",
      service: "room",
      bookingType: "official",
      officeApproval: "direct",
    },
    when: { roles: ["iar_cell"], office_approval: ["direct"] },
  },
  {
    id: "iar-student-cell",
    title: "IAR Student Cell",
    summary: "on behalf of an alumnus",
    submits: "Student Cell",
    facts: { role: "iar_student_cell", service: "room", bookingType: "alumni" },
    when: { roles: ["iar_student_cell"] },
  },
  {
    id: "dining",
    title: "Any requester",
    summary: "a dining booking, no room",
    submits: "Requester",
    // Dining is matched on what is booked, not on who booked it, so the role
    // here only has to be one that can book at all.
    facts: { role: "employee", service: "meals_only", bookingType: "official" },
    when: { service_types: ["meals_only"] },
  },
  {
    id: "desk",
    title: "The guest house desk",
    summary: "a booking it makes itself",
    submits: "Desk",
    facts: { role: "gh_manager", service: "room", bookingType: "official" },
    when: { roles: ["gh_manager"] },
  },
];

export function categoryById(id: string): RequestCategory | null {
  return REQUEST_CATEGORIES.find((c) => c.id === id) ?? null;
}

/** The name a route forked for one kind of request carries, in the audit log. */
export function categoryRouteName(category: RequestCategory): string {
  return `${category.title} - ${category.summary}`;
}

// ------------------------------------------------------------- reading them

export type CategoryChain = {
  category: RequestCategory;
  /** The route that decides this kind now. Null means nothing does. */
  rule: ApprovalRouteRule | null;
  /** The steps before the desk. Empty goes straight there. */
  stages: ApprovalStage[];
  /** The other kinds the same route decides, so an edit can say what it will do. */
  sharedWith: RequestCategory[];
};

/**
 * What each kind of request does now, straight off the engine.
 *
 * `matchingRule` and nothing else: a card that worked out its own chain
 * would be a second implementation of precedence, and the two would disagree
 * the first time somebody wrote a route by hand.
 */
export function categoryChains(rules: ApprovalRules): CategoryChain[] {
  const governing = REQUEST_CATEGORIES.map((category) => ({
    category,
    rule: matchingRule(category.facts, rules),
  }));
  return governing.map(({ category, rule }) => ({
    category,
    rule,
    stages: rule?.stages ?? [],
    sharedWith: rule
      ? governing
          .filter((other) => other.rule?.id === rule.id && other.category.id !== category.id)
          .map((other) => other.category)
      : [],
  }));
}

export function chainFor(rules: ApprovalRules, categoryId: string): CategoryChain | null {
  return categoryChains(rules).find((c) => c.category.id === categoryId) ?? null;
}

/**
 * Routes no card governs: the legacy club route no account can reach any
 * more, and anything the office wrote by hand with conditions of its own.
 *
 * They are listed rather than hidden. A workflow screen that silently did
 * not mention a route which is in force would be worse than the ordered list
 * it replaced.
 */
export function uncoveredRules(rules: ApprovalRules): ApprovalRouteRule[] {
  const governing = new Set(
    categoryChains(rules)
      .map((c) => c.rule?.id)
      .filter((id): id is string => Boolean(id))
  );
  return rules.rules.filter((rule) => !governing.has(rule.id));
}

// ------------------------------------------------------------- writing them

/**
 * Give one kind of request this chain.
 *
 * Edits the governing route in place where it decides only this kind, and
 * otherwise forks a route for this kind alone, immediately above it. See the
 * module comment for why that position is the safe one.
 */
export function setCategoryStages(
  rules: ApprovalRules,
  categoryId: string,
  stages: ApprovalStage[],
  now: () => number = Date.now
): ApprovalRules {
  const chain = chainFor(rules, categoryId);
  if (!chain) return rules;

  if (chain.rule && chain.sharedWith.length === 0) {
    const id = chain.rule.id;
    return {
      ...rules,
      rules: rules.rules.map((rule) => (rule.id === id ? { ...rule, stages } : rule)),
    };
  }

  const forked: ApprovalRouteRule = {
    id: `${categoryId}-${now().toString(36)}`,
    name: categoryRouteName(chain.category),
    active: true,
    when: chain.category.when,
    stages,
  };
  const next = [...rules.rules];
  const at = chain.rule ? next.findIndex((rule) => rule.id === chain.rule?.id) : -1;
  if (at < 0) {
    // Nothing active matches this kind, so it already goes straight to the
    // desk and no position can take precedence away from another route.
    next.push(forked);
  } else {
    next.splice(at, 0, forked);
  }
  return { ...rules, rules: next };
}

// -------------------------------------------------------------- the steps

/**
 * The slots this chain is not using.
 *
 * A route may hold each waiting status at most once - `nextStatusAfter`
 * finds the next step by `indexOf`, so a repeat has no single successor - and
 * `booking_status` is a Postgres enum, so there are four and a fifth needs a
 * migration. The office is never shown a slot; it is shown "at most four
 * approvers", which is what the limit means to them.
 */
export function freeSlots(stages: ApprovalStage[]): StageStatus[] {
  const used = new Set(stages.map((stage) => stage.status));
  return STAGE_STATUSES.filter((slot) => !used.has(slot));
}

export const MAX_STEPS = STAGE_STATUSES.length;

function sameKind(a: ApproverRule, b: ApproverRule): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "role" && b.kind === "role") return a.role === b.role;
  return true;
}

/**
 * Which slot a new step should wait in.
 *
 * Preference, not necessity: the slot whose built-in meaning **is** the
 * approver being added, so a warden step waits in the warden's own status
 * and drives the queue page it has always driven. Otherwise the first free
 * slot, and the step carries a name of its own instead.
 */
export function slotForApprover(
  approver: ApproverRule,
  stages: ApprovalStage[]
): StageStatus | null {
  const free = freeSlots(stages);
  if (free.length === 0) return null;
  return free.find((slot) => sameKind(BUILT_IN_STAGE_APPROVERS[slot], approver)) ?? free[0];
}

/**
 * Insert a step before position `at`.
 *
 * It starts as the slot's own built-in approver, which is the obvious
 * suggestion and needs no name of its own. Null when all four slots are in
 * use, which the console reports on the disabled button rather than here.
 */
export function insertStage(stages: ApprovalStage[], at: number): ApprovalStage[] | null {
  const free = freeSlots(stages);
  const slot = free[0];
  if (!slot) return null;
  const next = [...stages];
  next.splice(Math.max(0, Math.min(at, stages.length)), 0, {
    status: slot,
    approver: BUILT_IN_STAGE_APPROVERS[slot],
    label: null,
  });
  return next;
}

export function removeStage(stages: ApprovalStage[], at: number): ApprovalStage[] {
  return stages.filter((_, i) => i !== at);
}

/** Swap a step with its neighbour. Order is the order of approval. */
export function moveStage(stages: ApprovalStage[], at: number, by: -1 | 1): ApprovalStage[] {
  const to = at + by;
  if (at < 0 || at >= stages.length || to < 0 || to >= stages.length) return stages;
  const next = [...stages];
  [next[at], next[to]] = [next[to], next[at]];
  return next;
}

/**
 * Change who decides a step.
 *
 * **The slot never moves.** A request already waiting is sitting in that
 * status, and moving it would move the request. So where the new approver is
 * not what the slot means on its own, the step is named after them instead -
 * which is what the approver's queue page and the Forward button then read,
 * rather than the slot's own name, which would be somebody else's.
 *
 * A name the office typed is never overwritten.
 */
export function setStageApprover(
  stage: ApprovalStage,
  approver: ApproverRule,
  directory: NamedDirectory = {}
): ApprovalStage {
  if (stage.label?.trim()) return { ...stage, approver };
  const natural = sameKind(BUILT_IN_STAGE_APPROVERS[stage.status], approver);
  return { ...stage, approver, label: natural ? null : describeApprover(approver, directory) };
}

export function setStageLabel(stage: ApprovalStage, label: string): ApprovalStage {
  return { ...stage, label: label.trim() ? label : null };
}

// ------------------------------------------------- who decides, as one value

/**
 * An approver as one select value, so the console asks one question.
 *
 * The engine's `ApproverRule` is a kind plus, for three of the six, a target.
 * Asked as two controls that is a taxonomy the office has to learn - "unit
 * head" against "unit" against "profile" - so the console asks "who decides
 * this step" once, in groups, and these two functions are the whole
 * translation.
 */
export function approverValue(approver: ApproverRule): string {
  switch (approver.kind) {
    case "role":
      return `role:${approver.role}`;
    case "unit":
      return `unit:${approver.unit_id}`;
    case "profile":
      return `profile:${approver.profile_id}`;
    default:
      return approver.kind;
  }
}

export function approverFromValue(value: string): ApproverRule | null {
  if (value === "warden" || value === "hod" || value === "unit_head") return { kind: value };
  const at = value.indexOf(":");
  if (at < 0) return null;
  const kind = value.slice(0, at);
  const target = value.slice(at + 1);
  if (!target) return null;
  if (kind === "role") return { kind: "role", role: target as Role };
  if (kind === "unit") return { kind: "unit", unit_id: target };
  if (kind === "profile") return { kind: "profile", profile_id: target };
  return null;
}
