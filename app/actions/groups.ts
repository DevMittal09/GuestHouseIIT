"use server";

import { assignableRoles, canUseConsoleSection, userEditError } from "@/lib/access";
import { isAdminUnlocked } from "@/lib/admin-lock";
import { recordAudit } from "@/lib/audit-server";
import { requireUser, stepUpProblem } from "@/lib/auth";
import { revalidateConsole } from "@/lib/revalidate";
import { getRules } from "@/lib/settings-server";
import { getStore } from "@/lib/store";
import { ROLE_LABELS, type Profile, type Role } from "@/lib/types";
import {
  planAccessChange,
  planGroupMembers,
  userGroupSchema,
  type AccessAction,
  type AccessPlan,
  type MemberPlan,
} from "@/lib/user-groups";
import type { ActionResult } from "./bookings";

/**
 * Console -> User Groups (5 Nov 2026, the owner). Every action re-checks the
 * section and the console lock, the page hiding a control being no boundary.
 * The list-driven ones plan on the server each time: the preview the manager
 * read and the write that follows run the same function, and the write never
 * trusts a list of ids from the browser.
 */
async function requireGroupsConsole({ stepUp = false }: { stepUp?: boolean } = {}): Promise<Profile> {
  const user = await requireUser();
  if (!canUseConsoleSection(user.role, "groups")) {
    throw new Error("Only the Guest House Manager or a developer can change user groups");
  }
  if (!(await isAdminUnlocked())) {
    throw new Error("The console is locked - enter the console password again");
  }
  if (stepUp) {
    const problem = await stepUpProblem();
    if (problem) throw new Error(problem);
  }
  return user;
}

function fail(e: unknown): { ok: false; error: string } {
  return { ok: false, error: e instanceof Error ? e.message : "Something went wrong" };
}

// ------------------------------------------------------------------- groups

export async function saveUserGroupAction(id: string | null, input: unknown): Promise<ActionResult & { id?: string }> {
  try {
    const actor = await requireGroupsConsole({ stepUp: true });
    const parsed = userGroupSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid group" };
    // The same rule as Users & Roles: a CSV must not hand out what a form could not.
    if (!assignableRoles(actor.role, Object.keys(ROLE_LABELS) as Role[]).includes(parsed.data.role)) {
      return { ok: false, error: `Only a developer can assign the ${ROLE_LABELS[parsed.data.role]} role` };
    }
    const store = getStore();
    if (id) {
      const profiles = await store.listProfiles();
      const groups = await store.listUserGroups();
      const current = groups.find((g) => g.id === id);
      if (!current) return { ok: false, error: "That group no longer exists" };
      if (current.role !== parsed.data.role && profiles.some((p) => p.group_id === id)) {
        return { ok: false, error: "This group has members, so what they are cannot be changed here" };
      }
      await store.updateUserGroup(id, parsed.data);
    } else {
      id = (await store.createUserGroup(parsed.data)).id;
    }
    await recordAudit(actor, "settings.changed", "user_groups", { what: "group saved", group: parsed.data.name });
    revalidateConsole();
    return { ok: true, id };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteUserGroupAction(id: string): Promise<ActionResult> {
  try {
    const actor = await requireGroupsConsole({ stepUp: true });
    const store = getStore();
    const [profiles, rules, groups] = await Promise.all([store.listProfiles(), getRules(), store.listUserGroups()]);
    const group = groups.find((g) => g.id === id);
    if (!group) return { ok: false, error: "That group no longer exists" };
    const members = profiles.filter((p) => p.group_id === id).length;
    if (members > 0) {
      return { ok: false, error: `${group.name} has ${members} member(s). Move or remove them first.` };
    }
    const route = rules.approval.rules.find((r) => r.when.group_ids?.includes(id));
    if (route) {
      return { ok: false, error: `The approval route "${route.name}" is limited to this group. Change it first.` };
    }
    await store.deleteUserGroup(id);
    await recordAudit(actor, "settings.changed", "user_groups", { what: "group deleted", group: group.name });
    revalidateConsole();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ------------------------------------------------------------------ members

async function memberPlan(actor: Profile, groupId: string, text: string): Promise<MemberPlan> {
  const store = getStore();
  const [groups, profiles] = await Promise.all([store.listUserGroups(), store.listProfiles()]);
  const group = groups.find((g) => g.id === groupId);
  if (!group) throw new Error("That group no longer exists");
  return planGroupMembers(group, text, profiles, groups, (target) => userEditError(actor, target));
}

/** Add people who already have accounts. Someone new comes in through the CSV. */
export async function addGroupMembersAction(
  groupId: string,
  text: string
): Promise<ActionResult & { plan?: MemberPlan }> {
  try {
    const actor = await requireGroupsConsole({ stepUp: true });
    const plan = await memberPlan(actor, groupId, text);
    if (plan.add.length > 0) {
      await getStore().updateProfiles(plan.add.map((p) => p.id), { group_id: groupId });
      await recordAudit(actor, "settings.changed", "user_groups", {
        what: "members added",
        group: groupId,
        added: plan.add.length,
      });
      revalidateConsole();
    }
    return { ok: true, plan };
  } catch (e) {
    return fail(e);
  }
}

export async function removeGroupMemberAction(groupId: string, profileId: string): Promise<ActionResult> {
  try {
    const actor = await requireGroupsConsole({ stepUp: true });
    const store = getStore();
    const target = await store.getProfile(profileId);
    if (!target || target.group_id !== groupId) return { ok: false, error: "They are not in this group" };
    const stop = userEditError(actor, target);
    if (stop) return { ok: false, error: stop };
    await store.updateProfile(profileId, { group_id: null });
    await recordAudit(actor, "settings.changed", "user_groups", { what: "member removed", group: groupId, email: target.email });
    revalidateConsole();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ---------------------------------------------------------- who may sign in

async function accessPlan(actor: Profile, action: AccessAction, text: string): Promise<AccessPlan> {
  const store = getStore();
  const [profiles, units, bookings] = await Promise.all([
    store.listProfiles(),
    store.listUnits().catch(() => []),
    // Only a block warns about bookings, so a restore need not read them.
    action === "block" ? store.listBookings({}) : Promise.resolve([]),
  ]);
  return planAccessChange(action, text, {
    profiles,
    units,
    bookings,
    actorId: actor.id,
    locked: (target) => userEditError(actor, target),
  });
}

/** What the list would do, for the manager to read. Writes nothing. */
export async function previewAccessChangeAction(
  action: AccessAction,
  text: string
): Promise<{ ok: true; plan: AccessPlan } | { ok: false; error: string }> {
  try {
    const actor = await requireGroupsConsole();
    return { ok: true, plan: await accessPlan(actor, action, text) };
  } catch (e) {
    return fail(e);
  }
}

/**
 * Stop these people signing in, or let them again. Nobody is deleted, and their
 * bookings stay: `lib/auth.ts` refuses a blocked account on every request, and
 * their sessions are ended so a restore does not revive an old browser.
 */
export async function applyAccessChangeAction(
  action: AccessAction,
  text: string,
  reason: string
): Promise<ActionResult & { changed?: number }> {
  try {
    const actor = await requireGroupsConsole({ stepUp: true });
    const why = reason.trim().slice(0, 200);
    if (action === "block" && !why) return { ok: false, error: "Say why - it is shown beside their account" };
    const plan = await accessPlan(actor, action, text);
    if (plan.targets.length === 0) return { ok: false, error: "Nobody on this list would change" };
    const ids = plan.targets.map((t) => t.id);
    const store = getStore();
    await store.updateProfiles(
      ids,
      action === "block"
        ? { login_disabled_at: new Date().toISOString(), login_disabled_reason: why }
        : { login_disabled_at: null, login_disabled_reason: null }
    );
    if (action === "block") {
      // Belt and braces: the check in `lib/auth.ts` already refuses them. One
      // that fails must not read as the block having failed.
      for (const id of ids) await store.revokeUserSessions(id).catch(() => 0);
    }
    await recordAudit(actor, "settings.changed", "profiles", {
      what: action === "block" ? "sign-in blocked" : "sign-in restored",
      changed: ids.length,
      reason: why || null,
      emails: plan.targets.map((t) => t.email).slice(0, 500),
    });
    revalidateConsole();
    return { ok: true, changed: ids.length };
  } catch (e) {
    return fail(e);
  }
}
