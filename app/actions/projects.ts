"use server";

import { revalidatePath } from "next/cache";
import { canUseConsoleSection } from "@/lib/access";
import { isAdminUnlocked } from "@/lib/admin-lock";
import { recordAudit } from "@/lib/audit-server";
import { requireUser } from "@/lib/auth";
import { planProjectImport, type Project, type ProjectImportPlan } from "@/lib/projects";
import { getStore } from "@/lib/store";
import type { Profile } from "@/lib/types";
import type { ActionResult } from "./bookings";

/**
 * The project list behind the Project debitable head (Phase 4). The same gate
 * as the rest of the console — the section and the unlock — checked here, on
 * the action. Every change is audited: this list decides what can be debited.
 */
async function requireProjectsConsole(): Promise<Profile> {
  const user = await requireUser();
  if (!canUseConsoleSection(user.role, "projects")) {
    throw new Error("You do not have access to Projects");
  }
  if (!(await isAdminUnlocked())) {
    throw new Error("The console is locked — enter the console password again");
  }
  return user;
}

function fail(e: unknown): ActionResult {
  const code = (e as { code?: string } | null)?.code;
  if (code === "42P01" || code === "PGRST205") {
    return {
      ok: false,
      error: "The projects table is not there yet — apply supabase/migrations/00000000000018_hod_approval_and_projects.sql.",
    };
  }
  return { ok: false, error: e instanceof Error ? e.message : "Something went wrong" };
}

function done(): ActionResult {
  revalidatePath("/admin/projects");
  revalidatePath("/book");
  return { ok: true };
}

export async function listProjectsForConsole(): Promise<
  { ok: true; projects: (Project & { bookings: number })[] } | { ok: false; error: string }
> {
  try {
    await requireProjectsConsole();
    const store = getStore();
    const [projects, bookings] = await Promise.all([store.listProjects(), store.listBookings({})]);
    return {
      ok: true,
      projects: projects.map((p) => ({
        ...p,
        bookings: bookings.filter((b) => b.project_id === p.id).length,
      })),
    };
  } catch (e) {
    const result = fail(e);
    return { ok: false, error: result.ok ? "Could not load projects" : result.error };
  }
}

/** Preview a paste without applying it, so the console can show what will change. */
export async function previewProjectImport(
  text: string
): Promise<{ ok: true; plan: ProjectImportPlan } | { ok: false; error: string }> {
  try {
    await requireProjectsConsole();
    return { ok: true, plan: planProjectImport(text, await getStore().listProjects()) };
  } catch (e) {
    const result = fail(e);
    return { ok: false, error: result.ok ? "Could not read the paste" : result.error };
  }
}

/** All or nothing: any problem in the paste and nothing is applied. */
export async function importProjects(
  text: string
): Promise<{ ok: true; added: number; updated: number } | { ok: false; error: string; problems?: string[] }> {
  try {
    const user = await requireProjectsConsole();
    const store = getStore();
    const plan = planProjectImport(text, await store.listProjects());
    if (plan.problems.length > 0) {
      return { ok: false, error: "Nothing was imported — fix these lines first.", problems: plan.problems };
    }
    await store.createProjects(plan.added);
    for (const change of plan.updated) await store.updateProject(change.id, change.patch);
    await recordAudit(user, "settings.changed", "projects", {
      imported: { added: plan.added.map((p) => p.project_number), updated: plan.updated.length },
    });
    done();
    return { ok: true, added: plan.added.length, updated: plan.updated.length };
  } catch (e) {
    const result = fail(e);
    return { ok: false, error: result.ok ? "Import failed" : result.error };
  }
}

/** Deactivate a finished project, or bring one back. */
export async function setProjectActive(id: string, active: boolean): Promise<ActionResult> {
  try {
    const user = await requireProjectsConsole();
    await getStore().updateProject(id, { active });
    await recordAudit(user, "settings.changed", "projects", { [active ? "activated" : "deactivated"]: id });
    return done();
  } catch (e) {
    return fail(e);
  }
}

/** Refused while a booking is debited to it — deactivate it instead. */
export async function deleteProjectAction(id: string): Promise<ActionResult> {
  try {
    const user = await requireProjectsConsole();
    const project = (await getStore().listProjects()).find((p) => p.id === id);
    await getStore().deleteProject(id);
    await recordAudit(user, "settings.changed", "projects", { deleted: project?.project_number ?? id });
    return done();
  } catch (e) {
    return fail(e);
  }
}
