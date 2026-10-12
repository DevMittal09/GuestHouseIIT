"use server";

import { canUseConsoleSection } from "@/lib/access";
import { isAdminUnlocked } from "@/lib/admin-lock";
import { recordAudit } from "@/lib/audit-server";
import { requireUser } from "@/lib/auth";
import {
  approvalRulesSchema,
  DEFAULT_APPROVAL_RULES,
  describeChain,
  describeRouteChanges,
  describeStage,
  matchingRule,
  stageApproverIds,
  stageLabel,
  type ApprovalRules,
  type ApprovalStage,
} from "@/lib/approval-routes";
import { getApprovalRules } from "@/lib/approval-routes-server";
import { revalidateEverything } from "@/lib/revalidate";
import { ruleKey } from "@/lib/settings";
import { approvalRouteBlockers, refusalMessage } from "@/lib/settings-impact";
import { getStore } from "@/lib/store";
import { BOOKING_CATEGORY_ROLES, type Profile, type ServiceType } from "@/lib/types";
import type { Unit } from "@/lib/units";
import { ACTIVE_STATUSES, routeStagesFor, skippedStages } from "@/lib/workflow";
import type { ActionResult } from "./bookings";

/**
 * Console -> **Approval Workflow**: who forwards whose request.
 *
 * The one console section the Guest House Manager opens that changes how a
 * request *travels*, rather than what it says. The routes are a Settings
 * group (`rules.approval`), so this writes one `app_settings` row - but it is
 * **not** in the developer's Settings page, because the office runs the
 * approval chain and the developer runs the portal.
 *
 * The contract is the one every Setting has: validate, refuse a change that
 * would break something already stored - naming it - and record what changed
 * in the security audit log.
 */

async function requireWorkflowConsole(): Promise<Profile> {
  const user = await requireUser();
  if (!canUseConsoleSection(user.role, "workflow")) {
    throw new Error("Only the Guest House Manager or a developer can change the approval workflow");
  }
  if (!(await isAdminUnlocked())) {
    throw new Error("The console is locked - enter the console password again");
  }
  return user;
}

function fail(e: unknown): ActionResult {
  const code = (e as { code?: string } | null)?.code;
  if (code === "42P01" || code === "PGRST205") {
    return {
      ok: false,
      error:
        "The settings table is not there yet - apply supabase/migrations/00000000000016_settings_and_audit.sql.",
    };
  }
  return { ok: false, error: e instanceof Error ? e.message : "Something went wrong" };
}

/**
 * Every request still waiting for a decision - five bounded queries, not
 * every booking ever made. `BookingFilter` takes one status at a time, and
 * the impact check and the console's counts both only care about the active
 * ones.
 */
async function waitingBookings() {
  const store = getStore();
  const lists = await Promise.all(
    ACTIVE_STATUSES.map((status) => store.listBookings({ status }).catch(() => []))
  );
  return lists.flat();
}

/** An account the console can name as an approver, or route requests from. */
export type WorkflowPerson = {
  id: string;
  name: string;
  email: string;
  role: string;
  /** The units they head or act as head of, so the console can say why they qualify. */
  heads: string[];
};

export type WorkflowConsoleData = {
  rules: ApprovalRules;
  defaults: ApprovalRules;
  units: { id: string; name: string; kind: string; hasHead: boolean }[];
  people: WorkflowPerson[];
  hostels: string[];
  /** Roles a booking can be stored under, so the console offers only those. */
  requesterRoles: string[];
  /** How many requests are waiting at each stage right now. */
  waiting: Record<string, number>;
};

/** Everything the Approval Workflow page shows, or why it could not be read. */
export async function getWorkflowConsoleData(): Promise<
  { ok: true; data: WorkflowConsoleData } | { ok: false; error: string }
> {
  try {
    await requireWorkflowConsole();
    const store = getStore();
    const [rules, units, profiles, hostels, pending] = await Promise.all([
      getApprovalRules(),
      store.listUnits().catch(() => [] as Unit[]),
      store.listProfiles().catch(() => [] as Profile[]),
      store.listHostels().catch(() => [] as string[]),
      waitingBookings(),
    ]);
    const waiting: Record<string, number> = {};
    for (const booking of pending) {
      waiting[booking.status] = (waiting[booking.status] ?? 0) + 1;
    }
    return {
      ok: true,
      data: {
        rules,
        defaults: DEFAULT_APPROVAL_RULES,
        units: units.map((u) => ({
          id: u.id,
          name: u.name,
          kind: u.kind,
          hasHead: Boolean(u.head_id || u.acting_head_id),
        })),
        people: profiles.map((p) => ({
          id: p.id,
          name: p.full_name,
          email: p.email,
          role: p.role,
          heads: units
            .filter((u) => u.head_id === p.id || u.acting_head_id === p.id)
            .map((u) => u.name),
        })),
        hostels,
        requesterRoles: [...BOOKING_CATEGORY_ROLES, "gh_manager"],
        waiting,
      },
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Something went wrong" };
  }
}

/**
 * Save the whole list of routes at once.
 *
 * Whole-list, not one rule at a time, because **order decides which route
 * applies**: the first active rule that matches wins. Two half-applied saves
 * could put a narrow rule below the broad one that swallows it, and the
 * office would see no error and no effect.
 */
export async function saveApprovalRoutes(proposed: unknown): Promise<ActionResult> {
  try {
    const user = await requireWorkflowConsole();
    const parsed = approvalRulesSchema.safeParse(proposed);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Those routes are not valid" };
    }
    const next = parsed.data;
    const store = getStore();
    const [current, bookings, units, profiles] = await Promise.all([
      getApprovalRules(),
      waitingBookings(),
      store.listUnits().catch(() => [] as Unit[]),
      store.listProfiles().catch(() => [] as Profile[]),
    ]);
    const blockers = approvalRouteBlockers(next, bookings, units, profiles);
    if (blockers.length > 0) {
      return { ok: false, error: refusalMessage("That approval workflow", blockers) };
    }
    // The same words the console showed on the way in, so the audit log and
    // the confirmation the office read say the same thing.
    const changes = describeRouteChanges(current, next, { units, profiles });
    if (changes.length === 0) return { ok: true };
    await store.setJsonSetting(ruleKey("approval"), next);
    await recordAudit(user, "settings.changed", ruleKey("approval"), { changes });
    revalidateEverything();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Put every route back to the institute's own pipeline. */
export async function resetApprovalRoutes(): Promise<ActionResult> {
  return saveApprovalRoutes(DEFAULT_APPROVAL_RULES);
}

export type RoutePreview = {
  /** The chain in words, ending at the Guest House Manager. */
  chain: string;
  /** The stage names, so the console can draw them as steps. */
  stages: { label: string; who: string[] }[];
  /** Which rule matched, by name - "nothing matched" is itself an answer. */
  matched: string | null;
  /** Stages the route names but which nobody can decide, so they are skipped. */
  skipped: string[];
};

/**
 * What would happen to a request from this account, under the routes being
 * edited - with the people who would actually decide each stage, by name.
 *
 * This is the part that makes the section safe to use. A list of conditions
 * is hard to read and easy to get subtly wrong (two rules in the wrong
 * order, a condition that matches nothing); a named chain for a real account
 * is not.
 */
export async function previewApprovalRoute(
  proposed: unknown,
  requesterId: string,
  bookingType: string,
  service: ServiceType,
  officeApproval: "direct" | "hod"
): Promise<{ ok: true; data: RoutePreview } | { ok: false; error: string }> {
  try {
    await requireWorkflowConsole();
    const parsed = approvalRulesSchema.safeParse(proposed);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Those routes are not valid" };
    }
    const rules = parsed.data;
    const store = getStore();
    const [profiles, units] = await Promise.all([
      store.listProfiles().catch(() => [] as Profile[]),
      store.listUnits().catch(() => [] as Unit[]),
    ]);
    const requester = profiles.find((p) => p.id === requesterId);
    if (!requester) return { ok: false, error: "That account is no longer on the list" };

    const directory = { units, profiles };
    const context = {
      bookingType,
      staffCategory: requester.staff_category ?? null,
      officeApproval,
      hasHodApprover: true,
      raisedByFacultyInCharge: false,
      rules,
      directory,
      requester,
    };
    let stages: ApprovalStage[] = [];
    try {
      stages = routeStagesFor(requester.role, service, context);
    } catch {
      return {
        ok: false,
        error: `A ${requester.role} account does not submit bookings, so it has no route.`,
      };
    }
    const byId = new Map(profiles.map((p) => [p.id, p]));
    return {
      ok: true,
      data: {
        chain: describeChain(stages, directory),
        stages: stages.map((stage) => ({
          label: `${stageLabel(stage)} - ${describeStage(stage, directory)}`,
          who: stageApproverIds(stage.approver, requester, directory)
            .map((id) => byId.get(id)?.full_name ?? "a deleted account")
            .sort((a, b) => a.localeCompare(b)),
        })),
        matched:
          matchingRule(
            {
              role: requester.role,
              service,
              bookingType,
              staffCategory: requester.staff_category ?? null,
              officeApproval,
              raisedByFacultyInCharge: false,
              unitId: requester.unit_id ?? null,
              hostelName: requester.hostel_name ?? null,
            },
            rules
          )?.name ?? null,
        skipped: skippedStages(requester.role, service, context).map((stage) => stageLabel(stage)),
      },
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Something went wrong" };
  }
}
