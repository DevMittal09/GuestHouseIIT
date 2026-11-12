"use server";

import { revalidatePath } from "next/cache";
import { MEAL_BOOKING_PATH, ROOM_BOOKING_PATH } from "@/lib/routes";
import { canUseConsoleSection } from "@/lib/access";
import { forgetAcademicRecords } from "@/lib/academic";
import { isAdminUnlocked } from "@/lib/admin-lock";
import { recordAudit } from "@/lib/audit-server";
import { requireUser } from "@/lib/auth";
import { getStore } from "@/lib/store";
import type { Profile } from "@/lib/types";
import type { ActionResult } from "./bookings";
import type { InstituteTableKind } from "@/lib/institute/types";
import {
  planInstituteImport,
  describeImport,
  type InstituteImportPlan,
} from "@/lib/institute/import";

/**
 * Institute records (migration 35, 2 Nov 2026): the institute's records as the
 * guest house office imports them via CSV into the six institute_* tables.
 *
 * Same gate as the rest of the console. Every change is audited.
 */
async function requireAcademicConsole(): Promise<Profile> {
  const user = await requireUser();
  if (!canUseConsoleSection(user.role, "academic")) {
    throw new Error("You do not have access to Employees & Students");
  }
  if (!(await isAdminUnlocked())) {
    throw new Error("The console is locked - enter the console password again");
  }
  return user;
}

const MIGRATION_HINT =
  "The institute tables are not there yet - apply scripts/init-postgres.sql (migration 35).";

function fail(e: unknown): ActionResult {
  const code = (e as { code?: string } | null)?.code;
  if (code === "42P01" || code === "PGRST205") return { ok: false, error: MIGRATION_HINT };
  return { ok: false, error: e instanceof Error ? e.message : "Something went wrong" };
}

function done(): void {
  forgetAcademicRecords();
  revalidatePath("/admin/academic");
  revalidatePath(ROOM_BOOKING_PATH);
  revalidatePath(MEAL_BOOKING_PATH);
  revalidatePath("/warden");
}

type InstituteRecord = { id: string; email: string; [key: string]: unknown };

async function listByKind(kind: InstituteTableKind): Promise<InstituteRecord[]> {
  const store = getStore();
  switch (kind) {
    case "student": return (await store.listStudents()) as unknown as InstituteRecord[];
    case "employee": return (await store.listEmployees()) as unknown as InstituteRecord[];
    case "office": return (await store.listOffices()).map((o) => ({ ...o, email: o.office_email })) as unknown as InstituteRecord[];
    case "fcc": return (await store.listFCCs()).map((f) => ({ ...f, email: f.council_email })) as unknown as InstituteRecord[];
    case "hostel": return (await store.listInstituteHostels()).map((h) => ({ ...h, email: h.hostel_id })) as unknown as InstituteRecord[];
    case "warden": return (await store.listWardens()).map((w) => ({ ...w, email: w.warden_email })) as unknown as InstituteRecord[];
  }
}

async function deleteByKindAndId(kind: InstituteTableKind, id: string): Promise<void> {
  const store = getStore();
  switch (kind) {
    case "student": return store.deleteStudent(id);
    case "employee": return store.deleteEmployee(id);
    case "office": return store.deleteOffice(id);
    case "fcc": return store.deleteFCC(id);
    case "hostel": return store.deleteInstituteHostel(id);
    case "warden": return store.deleteWarden(id);
  }
}

async function clearByKind(kind: InstituteTableKind): Promise<number> {
  const store = getStore();
  switch (kind) {
    case "student": return store.deleteAllStudents();
    case "employee": return store.deleteAllEmployees();
    case "office": return store.deleteAllOffices();
    case "fcc": return store.deleteAllFCCs();
    case "hostel": return store.deleteAllInstituteHostels();
    case "warden": return store.deleteAllWardens();
  }
}

export async function listInstituteRecordsForConsole(kind: InstituteTableKind): Promise<
  { ok: true; records: InstituteRecord[] } | { ok: false; error: string }
> {
  try {
    await requireAcademicConsole();
    return { ok: true, records: await listByKind(kind) };
  } catch (e) {
    const problem = fail(e);
    return { ok: false, error: problem.ok ? "Something went wrong" : problem.error };
  }
}

export async function deleteInstituteRecordAction(kind: InstituteTableKind, id: string): Promise<ActionResult> {
  try {
    const user = await requireAcademicConsole();
    await deleteByKindAndId(kind, id);
    await recordAudit(user, "settings.changed", "institute_records", {
      kind,
      removed: id,
    });
    done();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function clearInstituteRecordsAction(
  kind: InstituteTableKind
): Promise<ActionResult & { summary?: string }> {
  try {
    const user = await requireAcademicConsole();
    const removed = await clearByKind(kind);
    await recordAudit(user, "settings.changed", "institute_records", {
      cleared: kind,
      removed,
    });
    done();
    return { ok: true, summary: `${removed} record${removed === 1 ? "" : "s"} removed` };
  } catch (e) {
    return fail(e);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function saveByKind(kind: InstituteTableKind, plan: InstituteImportPlan<any>): Promise<void> {
  const store = getStore();
  switch (kind) {
    case "student": return store.saveStudents(plan.added, plan.updated);
    case "employee": return store.saveEmployees(plan.added, plan.updated);
    case "office": return store.saveOffices(plan.added, plan.updated);
    case "fcc": return store.saveFCCs(plan.added, plan.updated);
    case "hostel": return store.saveInstituteHostels(plan.added, plan.updated);
    case "warden": return store.saveWardens(plan.added, plan.updated);
  }
}

export async function planInstituteImportAction(
  kind: InstituteTableKind,
  text: string,
): Promise<{ ok: true; plan: InstituteImportPlan } | { ok: false; error: string }> {
  try {
    const user = await requireAcademicConsole();
    const existing = await listByKind(kind);
    const plan = planInstituteImport(kind, text, existing, user.id);
    return { ok: true, plan };
  } catch (e) {
    const problem = fail(e);
    return { ok: false, error: problem.ok ? "Something went wrong" : problem.error };
  }
}

export async function updateInstituteRecordAction(
  kind: InstituteTableKind,
  id: string,
  data: Record<string, string | null>,
): Promise<ActionResult> {
  try {
    const user = await requireAcademicConsole();
    const store = getStore();
    switch (kind) {
      case "student": {
        const existing = (await store.listStudents()).find((r) => r.id === id);
        if (!existing) return { ok: false, error: "Record not found" };
        const input = { ...existing, ...data, imported_by: existing.imported_by } as unknown as import("@/lib/institute/types").NewStudentInput;
        delete (input as Record<string, unknown>)["id"];
        delete (input as Record<string, unknown>)["created_at"];
        delete (input as Record<string, unknown>)["updated_at"];
        await store.saveStudents([], [{ id, input }]);
        break;
      }
      case "employee": {
        const existing = (await store.listEmployees()).find((r) => r.id === id);
        if (!existing) return { ok: false, error: "Record not found" };
        const input = { ...existing, ...data, imported_by: existing.imported_by } as unknown as import("@/lib/institute/types").NewEmployeeInput;
        delete (input as Record<string, unknown>)["id"];
        delete (input as Record<string, unknown>)["created_at"];
        delete (input as Record<string, unknown>)["updated_at"];
        await store.saveEmployees([], [{ id, input }]);
        break;
      }
      case "office": {
        const existing = (await store.listOffices()).find((r) => r.id === id);
        if (!existing) return { ok: false, error: "Record not found" };
        const input = { ...existing, ...data, imported_by: existing.imported_by } as unknown as import("@/lib/institute/types").NewOfficeInput;
        delete (input as Record<string, unknown>)["id"];
        delete (input as Record<string, unknown>)["created_at"];
        delete (input as Record<string, unknown>)["updated_at"];
        await store.saveOffices([], [{ id, input }]);
        break;
      }
      case "fcc": {
        const existing = (await store.listFCCs()).find((r) => r.id === id);
        if (!existing) return { ok: false, error: "Record not found" };
        const input = { ...existing, ...data, imported_by: existing.imported_by } as unknown as import("@/lib/institute/types").NewFCCInput;
        delete (input as Record<string, unknown>)["id"];
        delete (input as Record<string, unknown>)["created_at"];
        delete (input as Record<string, unknown>)["updated_at"];
        await store.saveFCCs([], [{ id, input }]);
        break;
      }
      case "hostel": {
        const existing = (await store.listInstituteHostels()).find((r) => r.id === id);
        if (!existing) return { ok: false, error: "Record not found" };
        const input = { ...existing, ...data } as unknown as import("@/lib/institute/types").NewHostelInput;
        delete (input as Record<string, unknown>)["id"];
        delete (input as Record<string, unknown>)["created_at"];
        delete (input as Record<string, unknown>)["updated_at"];
        await store.saveInstituteHostels([], [{ id, input }]);
        break;
      }
      case "warden": {
        const existing = (await store.listWardens()).find((r) => r.id === id);
        if (!existing) return { ok: false, error: "Record not found" };
        const input = { ...existing, ...data, imported_by: existing.imported_by } as unknown as import("@/lib/institute/types").NewWardenInput;
        delete (input as Record<string, unknown>)["id"];
        delete (input as Record<string, unknown>)["created_at"];
        delete (input as Record<string, unknown>)["updated_at"];
        await store.saveWardens([], [{ id, input }]);
        break;
      }
    }
    await recordAudit(user, "settings.changed", "institute_records", {
      kind,
      updated: id,
    });
    done();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function importInstituteRecordsAction(
  kind: InstituteTableKind,
  text: string,
): Promise<ActionResult & { summary?: string }> {
  try {
    const user = await requireAcademicConsole();
    const existing = await listByKind(kind);
    const plan = planInstituteImport(kind, text, existing, user.id);
    if (plan.problems.length > 0) {
      return { ok: false, error: plan.problems.join("\n") };
    }
    if (plan.added.length + plan.updated.length === 0) {
      return { ok: true, summary: "Nothing changed - every line matches what is already stored." };
    }
    await saveByKind(kind, plan);
    const summary = describeImport(plan);
    await recordAudit(user, "settings.changed", "institute_records", {
      kind,
      imported: summary,
    });
    done();
    return { ok: true, summary };
  } catch (e) {
    return fail(e);
  }
}
