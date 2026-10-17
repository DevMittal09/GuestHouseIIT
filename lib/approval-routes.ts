import { z } from "zod";
import type {
  BookingStatus,
  BookingType,
  Profile,
  Role,
  ServiceType,
  StaffCategory,
} from "./types";
import { BOOKING_TYPE_LABELS, ROLE_LABELS, SERVICE_TYPE_LABELS, STATUS_LABELS } from "./types";
import { approversOf, hodApproversFor, type Unit } from "./units";

/**
 * **Who forwards whose request - as data the Guest House Manager edits.**
 *
 * Until 11 Oct 2026 the pipeline was a `switch` in `lib/workflow.ts`:
 * a student went to their warden, a faculty member's official booking to
 * their HOD, the Student Cell's to the IAR Office. Every one of those was the
 * institute's instruction at the time, and every one of them has changed at
 * least once - which meant a deploy. The office asked for the chain itself to
 * be theirs: to insert a stage, delete one, reorder them, and change who
 * decides each.
 *
 * So the pipeline is now a **list of rules**, read from Settings
 * (`rules.approval`) and edited at Console -> Approval Workflow. The code
 * that *applies* a route is unchanged in shape: `routeFor` still returns an
 * ordered list of statuses, `canReview` still answers whether one person may
 * act on one request. What changed is that both read this list instead of a
 * hardcoded switch.
 *
 * Three rules keep it honest, the same three Settings has:
 *
 * 1. **The defaults are today's behaviour.** {@link DEFAULT_APPROVAL_RULES}
 *    reproduces the old `switch` exactly, case for case, and
 *    `tests/approval-routes.test.ts` compares the two over every requester,
 *    booking type and service type. A deployment where nobody opens the new
 *    console behaves as it did.
 * 2. **The rules are a parameter**, never a module-level singleton: a page
 *    reads them once and hands the same object to the form, the schema and
 *    the server action, exactly as it does with `rules.capacity`.
 * 3. **A change that would strand a request already waiting is refused**, and
 *    the requests are named (`approvalChangeBlockers` in
 *    `lib/settings-impact.ts`).
 *
 * ## What cannot be configured, and why
 *
 * **The four waiting statuses.** `booking_status` is a Postgres enum, and a
 * new value needs a migration - which Postgres will not even let you *use* in
 * the transaction that adds it (see migration 29). So a route is built from
 * the four intermediate slots that exist - {@link STAGE_STATUSES} - and the
 * manager decides which of them a request passes through, in what order, and
 * who decides each. Four stages before the desk is twice the deepest chain
 * the institute has ever asked for. A stage may carry its own `label` where
 * the slot's own name is wrong for the job it has been given.
 *
 * **The last stage is always the Guest House Manager**, because approval
 * there *is* room allocation (`allocateRooms`), not a decision that can be
 * delegated. Every route ends at `PENDING_GH_MANAGER` whether it says so or
 * not.
 */

// --------------------------------------------------------------- the slots

/**
 * The statuses a configurable stage can wait in: the four intermediate
 * approval stages in `booking_status`. `PENDING_GH_MANAGER` is not one - it
 * is where every route ends.
 */
export const STAGE_STATUSES = [
  "PENDING_WARDEN",
  "PENDING_FA",
  "PENDING_HOD",
  "PENDING_IAR",
] as const;

export type StageStatus = (typeof STAGE_STATUSES)[number];

export function isStageStatus(status: BookingStatus): status is StageStatus {
  return (STAGE_STATUSES as readonly BookingStatus[]).includes(status);
}

// ------------------------------------------------------------- the model

/**
 * Who decides a stage.
 *
 * The first three are **relative to the requester** - they follow a change of
 * HOD or a student changing hostel with nobody editing a route. The last
 * three name somebody outright, which is what the office needs for "all
 * requests from Civil also go to the Dean of Students".
 */
export type ApproverRule =
  /** The Assistant Warden of the requester's own hostel. Needs a hostel on both profiles. */
  | { kind: "warden" }
  /** Whoever gives HOD approval for the requester's unit (`hodApproversFor`). */
  | { kind: "hod" }
  /** The head (or acting head) of the requester's own unit, inherited from its parent. */
  | { kind: "unit_head" }
  /** Everyone holding a role - how the IAR Office decides the Student Cell's requests. */
  | { kind: "role"; role: Role }
  /** The head of one named unit, whoever the requester is. */
  | { kind: "unit"; unit_id: string }
  /** One named account. */
  | { kind: "profile"; profile_id: string };

export type ApproverKind = ApproverRule["kind"];

export const APPROVER_KINDS: ApproverKind[] = [
  "warden",
  "hod",
  "unit_head",
  "role",
  "unit",
  "profile",
];

export const APPROVER_KIND_LABELS: Record<ApproverKind, string> = {
  warden: "The Assistant Warden of the requester's hostel",
  hod: "The HOD for the requester's department or office",
  unit_head: "The head of the requester's own unit",
  role: "Everyone holding a role",
  unit: "The head of one named unit",
  profile: "One named person",
};

export type ApprovalStage = {
  /** Which waiting status the request sits in. Unique within a route. */
  status: StageStatus;
  approver: ApproverRule;
  /** What to call this stage, where the status's own name is wrong for it. */
  label?: string | null;
};

/** What a rule matches. An omitted or empty condition matches anything. */
export type ApprovalRouteWhen = {
  roles?: Role[];
  booking_types?: BookingType[];
  service_types?: ServiceType[];
  staff_categories?: StaffCategory[];
  /** An office's Direct / Requires HOD approval choice for the booking. */
  office_approval?: ("direct" | "hod")[];
  /** A club booking raised by its Faculty Advisor (`lib/club-booking.ts`). */
  raised_by_advisor?: boolean | null;
  /** The requester's own unit. */
  unit_ids?: string[];
  /** The requester's hostel, by name, as the warden scoping reads it. */
  hostels?: string[];
};

export type ApprovalRouteRule = {
  /** Stable, so reordering and the audit log can name one rule. */
  id: string;
  /** What the office calls this connection. */
  name: string;
  /** Off without being deleted - the route stops matching, nothing else changes. */
  active: boolean;
  when: ApprovalRouteWhen;
  /** The stages before the Guest House Manager, in order. Empty goes straight there. */
  stages: ApprovalStage[];
};

export type ApprovalRules = {
  /** Which shape of the defaults a saved row was made from. See `upgradeApprovalRules`. */
  revision: number;
  /** Tried in order; the **first** active rule that matches decides the route. */
  rules: ApprovalRouteRule[];
};

/**
 * Revision 1 (11 Oct 2026): the pipeline as the `switch` in `lib/workflow.ts`
 * had it. Bump this and add a branch to `upgradeApprovalRules` when a default
 * route changes in a way an existing saved row cannot reach by an edit.
 */
export const APPROVAL_RULES_REVISION = 1;

// ------------------------------------------------------------- the defaults

/**
 * `label` is spelled out as null rather than omitted, so the defaults have
 * the same shape the schema produces for a saved row. Otherwise a fresh
 * install never compares equal to its own defaults, and "Restore the
 * institute's routes" would read as enabled on a portal nobody had touched.
 */
const stage = (status: StageStatus, approver: ApproverRule, label: string | null = null): ApprovalStage => ({
  status,
  approver,
  label,
});

/**
 * The pipeline the portal had before it was configurable - the `switch` in
 * `routeFor`, rule for rule, in the order it tested.
 *
 * Order matters: the first active match wins. `meals-only` is first because
 * the old code returned `[]` for a dining booking before it looked at the
 * role at all; `club-advisor` precedes `club-own` because the advisor case
 * was an early return inside the club branch.
 */
export const DEFAULT_APPROVAL_RULES: ApprovalRules = {
  revision: APPROVAL_RULES_REVISION,
  rules: [
    {
      id: "meals-only",
      name: "Dining booking - straight to the desk",
      active: true,
      when: { service_types: ["meals_only"] },
      stages: [],
    },
    {
      id: "student",
      name: "Student - Assistant Warden",
      active: true,
      when: { roles: ["student"] },
      stages: [stage("PENDING_WARDEN", { kind: "warden" })],
    },
    {
      id: "club-advisor",
      name: "Club booking raised by its Faculty Advisor - straight to the desk",
      active: true,
      when: { roles: ["club"], raised_by_advisor: true },
      stages: [],
    },
    {
      id: "club-own",
      name: "Club's own request (before 24 Sep 2026) - secretary, then HOD",
      active: true,
      when: { roles: ["club"] },
      stages: [
        stage("PENDING_FA", { kind: "unit_head" }),
        stage("PENDING_HOD", { kind: "hod" }),
      ],
    },
    {
      id: "employee-official",
      name: "Faculty or staff, official - HOD",
      active: true,
      when: { roles: ["employee"], booking_types: ["official"] },
      stages: [stage("PENDING_HOD", { kind: "hod" })],
    },
    {
      id: "employee-personal",
      name: "Faculty or staff, personal - straight to the desk",
      active: true,
      when: { roles: ["employee"] },
      stages: [],
    },
    {
      id: "office-hod",
      name: "Office that asked for HOD approval - its HOD",
      active: true,
      when: { roles: ["official", "iar_cell"], office_approval: ["hod"] },
      stages: [stage("PENDING_HOD", { kind: "hod" })],
    },
    {
      id: "office-direct",
      name: "Office, direct - straight to the desk",
      active: true,
      when: { roles: ["official", "iar_cell"] },
      stages: [],
    },
    {
      id: "alumni",
      name: "On behalf of an alumnus - IAR Office",
      active: true,
      // `alumni` is retired as a login but stored bookings carry it, so a
      // resubmitted legacy booking still routes sanely.
      when: { roles: ["iar_student_cell", "alumni"] },
      stages: [stage("PENDING_IAR", { kind: "role", role: "iar_cell" })],
    },
    {
      id: "desk",
      name: "The desk's own booking - its own queue",
      active: true,
      when: { roles: ["gh_manager"] },
      stages: [],
    },
  ],
};

/**
 * What each slot means when nothing configures it.
 *
 * Two jobs. It is what `canReview` falls back to for a request waiting at a
 * stage the current rules no longer describe - a booking stored under an
 * older configuration must never become un-actionable because somebody
 * edited a route. And it is what the console offers as the obvious approver
 * when a stage is added.
 */
export const BUILT_IN_STAGE_APPROVERS: Record<StageStatus, ApproverRule> = {
  PENDING_WARDEN: { kind: "warden" },
  PENDING_FA: { kind: "unit_head" },
  PENDING_HOD: { kind: "hod" },
  PENDING_IAR: { kind: "role", role: "iar_cell" },
};

// -------------------------------------------------------------- matching

/** The facts about a request a rule is matched against. */
export type RequestFacts = {
  role: Role;
  service?: ServiceType;
  bookingType?: BookingType | string | null;
  staffCategory?: StaffCategory | null;
  officeApproval?: "direct" | "hod" | null;
  raisedByFacultyInCharge?: boolean;
  /** The requester's own unit and hostel, for the two conditions that name them. */
  unitId?: string | null;
  hostelName?: string | null;
};

function matchesList<T>(wanted: readonly T[] | undefined, value: T | null | undefined): boolean {
  if (!wanted || wanted.length === 0) return true;
  return value != null && wanted.includes(value);
}

/** Whether one rule's conditions all hold for this request. */
export function ruleMatches(rule: ApprovalRouteRule, facts: RequestFacts): boolean {
  const w = rule.when;
  if (!matchesList(w.roles, facts.role)) return false;
  if (!matchesList(w.service_types, facts.service ?? "room")) return false;
  if (!matchesList(w.booking_types, facts.bookingType as BookingType | null | undefined))
    return false;
  if (!matchesList(w.staff_categories, facts.staffCategory)) return false;
  if (!matchesList(w.office_approval, facts.officeApproval)) return false;
  if (!matchesList(w.unit_ids, facts.unitId)) return false;
  if (!matchesList(w.hostels, facts.hostelName)) return false;
  if (w.raised_by_advisor != null && w.raised_by_advisor !== Boolean(facts.raisedByFacultyInCharge))
    return false;
  return true;
}

/**
 * The rule that governs this request: the first active one that matches.
 * Null when none does, which routes the request straight to the desk - the
 * same answer the old `switch`'s `default` gave a role with no chain.
 */
export function matchingRule(
  facts: RequestFacts,
  rules: ApprovalRules = DEFAULT_APPROVAL_RULES
): ApprovalRouteRule | null {
  return rules.rules.find((rule) => rule.active && ruleMatches(rule, facts)) ?? null;
}

/**
 * The stages this request passes through, before any are dropped for want of
 * somebody to decide them. `routeFor` in `lib/workflow.ts` is what callers
 * use; this is the raw chain, which the console shows.
 */
export function stagesFor(
  facts: RequestFacts,
  rules: ApprovalRules = DEFAULT_APPROVAL_RULES
): ApprovalStage[] {
  return matchingRule(facts, rules)?.stages ?? [];
}

/** The configured stage that governs a status for this request, if any. */
export function stageForStatus(
  status: BookingStatus,
  facts: RequestFacts,
  rules: ApprovalRules = DEFAULT_APPROVAL_RULES
): ApprovalStage | null {
  if (!isStageStatus(status)) return null;
  return stagesFor(facts, rules).find((s) => s.status === status) ?? null;
}

// ------------------------------------------------------- who decides a stage

/** Everything needed to turn an {@link ApproverRule} into people. */
export type ApproverDirectory = {
  units?: Unit[];
  profiles?: Profile[];
};

/**
 * Whether a profile names a hostel. **NULL and a blank string are both "no
 * hostel"** - a day scholar's account, not a broken one.
 *
 * One reader for the question, because the answer decides a route: a student
 * with no hostel has no Assistant Warden, and the request goes straight to
 * the desk (17 Oct 2026, {@link approverNotApplicable}).
 */
export function hasHostel(profile: Pick<Profile, "hostel_name">): boolean {
  return typeof profile.hostel_name === "string" && profile.hostel_name.trim() !== "";
}

/** Why a `warden` stage cannot apply, in the words the booking's log uses. */
export const NO_HOSTEL_REASON = "no hostel is recorded on the requester's account";

/**
 * Why this approver rule cannot apply to this requester **at all**, or null
 * when it can.
 *
 * A fact about the requester's own account, not about who the console has
 * appointed - which is exactly what distinguishes it from
 * {@link stageApproverIds} returning nothing. **A student with no hostel has
 * no Assistant Warden** (17 Oct 2026, the owner): a day scholar is a real
 * kind of student, so the stage is dropped and the request enters at the
 * Guest House Manager, as it does for any stage nobody can decide - but the
 * booking's log says *why* in these words rather than reporting a console
 * somebody forgot to fill in.
 *
 * Answered from the requester alone, so a caller with no directory at all -
 * a mail module, the Copy-to chain - reaches the same answer as
 * `createBooking`. Relying on `stageApproverIds` returning nothing would have
 * left those callers assuming the stage was staffed, and copying a warden who
 * does not exist.
 *
 * Only the `warden` kind: every other kind is relative to a unit or names
 * somebody outright, where "nobody is appointed" is the honest reading.
 */
export function approverNotApplicable(
  approver: ApproverRule,
  requester: Pick<Profile, "hostel_name">
): string | null {
  if (approver.kind !== "warden") return null;
  return hasHostel(requester) ? null : NO_HOSTEL_REASON;
}

/**
 * The accounts that may decide a stage, **never the requester themselves**.
 *
 * Returns an empty list both for "nobody is set" and for "we were not given
 * the directory to look in", so a caller that cares about the difference asks
 * {@link canResolveApprover} first. That distinction is what keeps
 * `approvalStagesFor` - which is often called with units but no profiles -
 * from quietly dropping a stage it simply could not count.
 */
export function stageApproverIds(
  approver: ApproverRule,
  requester: Pick<Profile, "id" | "unit_id" | "hostel_name">,
  directory: ApproverDirectory = {}
): string[] {
  const units = directory.units ?? [];
  const profiles = directory.profiles ?? [];
  const notRequester = (id: string) => id !== requester.id;
  switch (approver.kind) {
    case "warden":
      // Neither side may be hostel-less: a student with no hostel has no
      // warden (`approverNotApplicable`), and a warden with none is nobody's.
      return hasHostel(requester)
        ? profiles
            .filter(
              (p) => p.role === "warden" && hasHostel(p) && p.hostel_name === requester.hostel_name
            )
            .map((p) => p.id)
            .filter(notRequester)
        : [];
    case "hod":
      return hodApproversFor(requester, units);
    case "unit_head":
      return approversOf(requester.unit_id, units).filter(notRequester);
    case "role":
      return profiles
        .filter((p) => p.role === approver.role)
        .map((p) => p.id)
        .filter(notRequester);
    case "unit":
      return approversOf(approver.unit_id, units).filter(notRequester);
    case "profile":
      return [approver.profile_id].filter(notRequester);
  }
}

/** Whether the directory given is enough to count a stage's approvers at all. */
export function canResolveApprover(
  approver: ApproverRule,
  directory: ApproverDirectory = {}
): boolean {
  switch (approver.kind) {
    case "warden":
    case "role":
      return Boolean(directory.profiles);
    case "hod":
    case "unit_head":
    case "unit":
      return Boolean(directory.units);
    case "profile":
      return true;
  }
}

/**
 * Whether this person decides that stage for that requester.
 *
 * Two paths, and which one is taken depends on what the caller could supply.
 * **With a directory that can resolve the rule**, the approvers are counted
 * and the reviewer has to be one of them. **Without one** - a mail module
 * that has units but not every profile, say - the question is answered from
 * the reviewer's own account, which is exactly what the hardcoded
 * `REVIEWER_STAGE` map did: a warden of the requester's hostel, or somebody
 * holding the named role.
 *
 * The legacy fallback on `unit_head` is deliberate: before migration 25 a
 * club's approver was whoever held the `faculty_advisor` role with the same
 * "Department / Club" text. Club requests stored then are still waiting at
 * `PENDING_FA`, and a unit nobody has filled in would otherwise strand them.
 */
export function decidesStage(
  reviewer: Profile,
  approver: ApproverRule,
  requester: Profile,
  directory: ApproverDirectory = {}
): boolean {
  if (reviewer.id === requester.id) return false;
  // A stage that cannot apply to this requester is decided by nobody, whether
  // or not the caller handed us a directory to count in.
  if (approverNotApplicable(approver, requester)) return false;
  if (canResolveApprover(approver, directory)) {
    const ids = stageApproverIds(approver, requester, directory);
    if (ids.includes(reviewer.id)) return true;
    if (approver.kind === "unit_head" && ids.length === 0) {
      return legacyAdvisorMatch(reviewer, requester);
    }
    return false;
  }
  switch (approver.kind) {
    case "warden":
      return (
        reviewer.role === "warden" &&
        hasHostel(reviewer) &&
        reviewer.hostel_name === requester.hostel_name
      );
    case "role":
      return reviewer.role === approver.role;
    default:
      return false;
  }
}

/** A club's approver before migration 25: the advisor with the same club text. */
function legacyAdvisorMatch(reviewer: Profile, requester: Profile): boolean {
  return (
    reviewer.role === "faculty_advisor" &&
    Boolean(reviewer.department_or_club) &&
    reviewer.department_or_club === requester.department_or_club
  );
}

// ------------------------------------------------------------- description

/**
 * Just enough of a directory to put a name to a unit or an account.
 *
 * Narrower than {@link ApproverDirectory} on purpose: the console's editor
 * runs in the browser and is handed trimmed rows, not whole `Unit` and
 * `Profile` objects, and a description has no business needing a head id or
 * an LDAP username. A full `ApproverDirectory` satisfies this too.
 */
export type NamedDirectory = {
  units?: { id: string; name: string }[];
  profiles?: { id: string; full_name: string }[];
};

/** One stage in words, for the console, a page heading and the audit log. */
export function describeStage(stage: ApprovalStage, directory: NamedDirectory = {}): string {
  return stage.label?.trim() || describeApprover(stage.approver, directory);
}

export function describeApprover(
  approver: ApproverRule,
  directory: NamedDirectory = {}
): string {
  switch (approver.kind) {
    case "warden":
      return "Assistant Warden";
    case "hod":
      return "HOD";
    case "unit_head":
      return "Head of the requester's unit";
    case "role":
      return ROLE_LABELS[approver.role] ?? approver.role;
    case "unit": {
      const unit = directory.units?.find((u) => u.id === approver.unit_id);
      return unit ? `Head of ${unit.name}` : "Head of a unit that no longer exists";
    }
    case "profile": {
      const person = directory.profiles?.find((p) => p.id === approver.profile_id);
      return person ? person.full_name : "An account that no longer exists";
    }
  }
}

/** The whole chain in words, ending where every route ends. */
export function describeChain(
  stages: ApprovalStage[],
  directory: NamedDirectory = {}
): string {
  return [...stages.map((s) => describeStage(s, directory)), "Guest House Manager"].join(" - ");
}

/** What a rule matches, in words. Empty means "every request not caught above". */
export function describeConditions(
  rule: ApprovalRouteRule,
  directory: NamedDirectory = {}
): string[] {
  const w = rule.when;
  const parts: string[] = [];
  if (w.roles?.length) parts.push(w.roles.map((r) => ROLE_LABELS[r] ?? r).join(" or "));
  if (w.booking_types?.length)
    parts.push(w.booking_types.map((t) => BOOKING_TYPE_LABELS[t] ?? t).join(" or "));
  if (w.service_types?.length)
    parts.push(w.service_types.map((s) => SERVICE_TYPE_LABELS[s] ?? s).join(" or "));
  if (w.staff_categories?.length)
    parts.push(w.staff_categories.map((c) => (c === "faculty" ? "Faculty" : "Non-teaching staff")).join(" or "));
  if (w.office_approval?.length)
    parts.push(
      w.office_approval.map((c) => (c === "hod" ? "Requires HOD approval" : "Direct")).join(" or ")
    );
  if (w.raised_by_advisor != null)
    parts.push(w.raised_by_advisor ? "raised by the Faculty Advisor" : "raised by the account itself");
  if (w.unit_ids?.length)
    parts.push(
      w.unit_ids
        .map((id) => directory.units?.find((u) => u.id === id)?.name ?? "a deleted unit")
        .join(" or ")
    );
  if (w.hostels?.length) parts.push(w.hostels.join(" or "));
  return parts;
}

/**
 * What changed between two sets of routes, for the confirmation dialog and
 * the audit log.
 *
 * `describeRuleChanges` (`lib/settings.ts`) walks the JSON and names every
 * leaf, which is the right thing for a handful of numbers and the wrong thing
 * here: inserting one stage produces a dozen lines like
 * `rules.1.stages.1.approver.kind: undefined -> "profile"`, which nobody can
 * read and which made the dialog taller than the screen. A route change is
 * about chains and conditions, so it is described as those.
 */
export function describeRouteChanges(
  before: ApprovalRules,
  after: ApprovalRules,
  directory: NamedDirectory = {}
): string[] {
  const was = new Map(before.rules.map((r) => [r.id, r]));
  const now = new Map(after.rules.map((r) => [r.id, r]));
  const lines: string[] = [];

  for (const rule of before.rules) {
    if (!now.has(rule.id)) lines.push(`Removed "${rule.name}"`);
  }
  for (const [index, rule] of after.rules.entries()) {
    const old = was.get(rule.id);
    if (!old) {
      lines.push(
        `Added "${rule.name}" at ${index + 1}: ${describeChain(rule.stages, directory)}`
      );
      continue;
    }
    if (old.name !== rule.name) lines.push(`Renamed "${old.name}" to "${rule.name}"`);
    if (old.active !== rule.active) {
      lines.push(`"${rule.name}" turned ${rule.active ? "on" : "off"}`);
    }
    const oldChain = describeChain(old.stages, directory);
    const newChain = describeChain(rule.stages, directory);
    if (oldChain !== newChain) lines.push(`"${rule.name}": ${oldChain} -> ${newChain}`);
    const oldWhen = describeConditions(old, directory).join(" · ") || "everything else";
    const newWhen = describeConditions(rule, directory).join(" · ") || "everything else";
    if (oldWhen !== newWhen) lines.push(`"${rule.name}" now matches ${newWhen}`);
    const oldAt = before.rules.findIndex((r) => r.id === rule.id);
    if (oldAt !== index) lines.push(`"${rule.name}" moved from ${oldAt + 1} to ${index + 1}`);
  }
  return lines;
}

/** The label a stage carries on a queue page and in mail. */
export function stageLabel(stage: ApprovalStage): string {
  return stage.label?.trim() || STATUS_LABELS[stage.status];
}

// -------------------------------------------------------------- validation

const approverSchema: z.ZodType<ApproverRule> = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("warden") }),
  z.object({ kind: z.literal("hod") }),
  z.object({ kind: z.literal("unit_head") }),
  z.object({
    kind: z.literal("role"),
    role: z.string().trim().min(1, "Choose the role that decides this stage"),
  }),
  z.object({
    kind: z.literal("unit"),
    unit_id: z.string().trim().min(1, "Choose the unit whose head decides this stage"),
  }),
  z.object({
    kind: z.literal("profile"),
    profile_id: z.string().trim().min(1, "Choose the person who decides this stage"),
  }),
]) as z.ZodType<ApproverRule>;

const stageSchema = z.object({
  status: z.enum(STAGE_STATUSES, { message: "Choose which waiting stage this is" }),
  approver: approverSchema,
  label: z
    .string()
    .trim()
    .max(60, "Keep a stage name under 60 characters")
    .nullish()
    .transform((v) => (v ? v : null)),
});

const optionalList = <T extends z.ZodType>(inner: T) =>
  z
    .array(inner)
    .max(20, "That is too many values for one condition")
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined));

const whenSchema = z.object({
  roles: optionalList(z.string().trim().min(1)),
  booking_types: optionalList(z.enum(["official", "personal", "alumni"])),
  service_types: optionalList(z.enum(["room", "room_meals", "meals_only"])),
  staff_categories: optionalList(z.enum(["faculty", "staff"])),
  office_approval: optionalList(z.enum(["direct", "hod"])),
  raised_by_advisor: z
    .boolean()
    .nullish()
    .transform((v) => (v == null ? undefined : v)),
  unit_ids: optionalList(z.string().trim().min(1)),
  hostels: optionalList(z.string().trim().min(1)),
}) as unknown as z.ZodType<ApprovalRouteWhen, ApprovalRouteWhen>;

const ruleSchema = z
  .object({
    id: z
      .string()
      .trim()
      .min(1, "Every route needs an id")
      .max(64, "That id is too long")
      .regex(/^[A-Za-z0-9_-]+$/, "An id may hold letters, digits, hyphens and underscores only"),
    name: z
      .string()
      .trim()
      .min(3, "Give the route a name - what the office calls this connection")
      .max(90, "Keep the route name under 90 characters"),
    active: z.boolean(),
    when: whenSchema,
    stages: z.array(stageSchema).max(STAGE_STATUSES.length, "A route has at most four stages"),
  })
  .superRefine((rule, ctx) => {
    // `nextStatusAfter` finds the next stage by the index of the current
    // status, so one status twice in a chain has no single successor.
    const seen = new Set<string>();
    for (const stage of rule.stages) {
      if (seen.has(stage.status)) {
        ctx.addIssue({
          code: "custom",
          message: `${rule.name}: ${STATUS_LABELS[stage.status]} appears twice - a request can only wait in it once`,
        });
      }
      seen.add(stage.status);
    }
  }) as unknown as z.ZodType<ApprovalRouteRule, ApprovalRouteRule>;

export const approvalRulesSchema = z
  .object({
    revision: z.number().int().optional().default(APPROVAL_RULES_REVISION),
    rules: z.array(ruleSchema).max(60, "That is more routes than the portal will read"),
  })
  .superRefine((value, ctx) => {
    const seen = new Set<string>();
    for (const rule of value.rules) {
      if (seen.has(rule.id)) {
        ctx.addIssue({ code: "custom", message: `Two routes share the id "${rule.id}"` });
      }
      seen.add(rule.id);
    }
  }) as unknown as z.ZodType<ApprovalRules, ApprovalRules>;

/**
 * Repair a saved row from before a default route changed shape, the way
 * `upgradeInvoiceRules` and `upgradeDebitRules` do. Nothing to do at revision
 * 1; the hook is here so the first change has one place to go.
 */
export function upgradeApprovalRules(stored: Record<string, unknown>): Record<string, unknown> {
  const revision = typeof stored.revision === "number" ? stored.revision : 0;
  if (revision >= APPROVAL_RULES_REVISION) return stored;
  return { ...stored, revision: APPROVAL_RULES_REVISION };
}

// ------------------------------------------------------------------ queues

/**
 * Where each waiting stage is worked, and what the link is called.
 *
 * One page per slot, because each has grown something the others do not need:
 * the warden's shows every student's academic record beside their request,
 * the IAR Office's shows the alumni ID card, the HOD's names the departments
 * they govern. A route that puts somebody new on one of those slots sends
 * them to the page that already exists for it.
 */
export const STAGE_QUEUES: Record<StageStatus, { href: string; label: string }> = {
  PENDING_WARDEN: { href: "/warden", label: "Assistant Warden Queue" },
  PENDING_FA: { href: "/approvals", label: "Club Approvals" },
  PENDING_HOD: { href: "/hod", label: "HOD Queue" },
  PENDING_IAR: { href: "/iar", label: "IAR Queue" },
};

/**
 * The name the office gave this slot, where they gave it exactly one.
 *
 * A stage carries an optional `label` for the case where the slot's own name
 * is wrong for the job it has been given - "Pending Club Approval" on a slot
 * now used for the Dean of Students. A queue page and its navigation link
 * read it from here. Null where no route renames the slot, or where two
 * routes rename it differently: then the slot's own name is the only honest
 * heading for a queue holding both.
 */
export function configuredStageName(
  status: StageStatus,
  rules: ApprovalRules = DEFAULT_APPROVAL_RULES
): string | null {
  const names = new Set<string>();
  for (const rule of rules.rules) {
    if (!rule.active) continue;
    for (const stage of rule.stages) {
      if (stage.status !== status) continue;
      const name = stage.label?.trim();
      if (!name) return null;
      names.add(name);
    }
  }
  return names.size === 1 ? [...names][0] : null;
}

/**
 * Every waiting status this person decides for somebody, under these rules.
 *
 * What the portal's navigation asks: an approver gets a queue because a route
 * points at them, not because they hold a reviewer role. A person named as
 * the approver of one stage of one route heads no unit and holds no reviewer
 * role, and still has a queue.
 */
export function stagesDecidedBy(
  reviewer: Profile,
  rules: ApprovalRules,
  directory: ApproverDirectory
): StageStatus[] {
  const found = new Set<StageStatus>();
  for (const rule of rules.rules) {
    if (!rule.active) continue;
    for (const stage of rule.stages) {
      if (found.has(stage.status)) continue;
      if (couldDecide(reviewer, stage.approver, rule, directory)) found.add(stage.status);
    }
  }
  return STAGE_STATUSES.filter((s) => found.has(s));
}

/**
 * Whether this person could be the approver of a stage for *somebody* - the
 * question a navigation link asks, as against `decidesStage`, which asks
 * about one named requester.
 *
 * The requester-relative kinds are answered by the reviewer's own account:
 * a warden with a hostel is the warden of somebody's hostel, an HOD is the
 * HOD of the unit they head. That is deliberately generous - a queue link to
 * an empty queue costs nothing, and hiding a queue somebody is in costs a
 * request.
 */
function couldDecide(
  reviewer: Profile,
  approver: ApproverRule,
  rule: ApprovalRouteRule,
  directory: ApproverDirectory
): boolean {
  const units = directory.units ?? [];
  // `rule` is unused today; it is a parameter so a future condition (a
  // hostel, a unit) can narrow which queues a person is offered.
  void rule;
  switch (approver.kind) {
    case "warden":
      return reviewer.role === "warden" && hasHostel(reviewer);
    case "hod":
      return units.some(
        (u) => u.head_id === reviewer.id || u.acting_head_id === reviewer.id
      );
    case "unit_head":
      return (
        units.some((u) => u.head_id === reviewer.id || u.acting_head_id === reviewer.id) ||
        reviewer.role === "faculty_advisor"
      );
    case "role":
      return reviewer.role === approver.role;
    case "unit": {
      const unit = units.find((u) => u.id === approver.unit_id);
      return Boolean(unit && approversOf(unit.id, units).includes(reviewer.id));
    }
    case "profile":
      return approver.profile_id === reviewer.id;
  }
}
