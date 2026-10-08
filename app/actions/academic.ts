"use server";

import { revalidatePath } from "next/cache";
import { canUseConsoleSection } from "@/lib/access";
import {
  describeImport,
  planAcademicImport,
  type AcademicImportPlan,
  type StoredAcademicRecord,
} from "@/lib/academic/stored";
import type { AcademicRecordKind } from "@/lib/academic/types";
import { forgetAcademicRecords } from "@/lib/academic";
import { isAdminUnlocked } from "@/lib/admin-lock";
import { recordAudit } from "@/lib/audit-server";
import { requireUser } from "@/lib/auth";
import { getStore } from "@/lib/store";
import type { Profile } from "@/lib/types";
import type { ActionResult } from "./bookings";

/**
 * Academic records (migration 28, 7 Oct 2026): the institute's records as the
 * guest house office pastes them in.
 *
 * The same gate as the rest of the console - the section and the unlock -
 * checked here on the action, not only in the layout, because a crafted
 * request with no unlock must get nothing. **Every change is audited.** These
 * rows decide what a student's booking form locks their parents' names to, so
 * a wrong import is a thing someone will need to trace.
 *
 * What is *not* here: any way to read a record for somebody else. The console
 * lists what is stored - the office typed it in, so it is already theirs -
 * and nothing else returns a record to a browser.
 */
async function requireAcademicConsole(): Promise<Profile> {
  const user = await requireUser();
  if (!canUseConsoleSection(user.role, "academic")) {
    throw new Error("You do not have access to Academic records");
  }
  if (!(await isAdminUnlocked())) {
    throw new Error("The console is locked - enter the console password again");
  }
  return user;
}

const MIGRATION_HINT =
  "The academic records table is not there yet - apply supabase/migrations/00000000000028_academic_records.sql.";

function fail(e: unknown): ActionResult {
  const code = (e as { code?: string } | null)?.code;
  if (code === "42P01" || code === "PGRST205") return { ok: false, error: MIGRATION_HINT };
  return { ok: false, error: e instanceof Error ? e.message : "Something went wrong" };
}

function done(): void {
  // The lookups are cached for ten minutes, so a paste would otherwise read
  // back as the record it replaced - and the booking form would go on
  // locking a student's parent to the old name.
  forgetAcademicRecords();
  revalidatePath("/admin/academic");
  // The card at the top of New Booking, the warden's family check and the
  // locked parent names all read these rows.
  revalidatePath("/book");
  revalidatePath("/warden");
}

export async function listAcademicRecordsForConsole(): Promise<
  { ok: true; records: StoredAcademicRecord[] } | { ok: false; error: string }
> {
  try {
    await requireAcademicConsole();
    return { ok: true, records: await getStore().listAcademicRecords() };
  } catch (e) {
    const problem = fail(e);
    return { ok: false, error: problem.ok ? "Something went wrong" : problem.error };
  }
}

/**
 * What a paste would do, without doing it. The console shows the plan and
 * asks; the office is pasting hundreds of rows and should see "412 added, 3
 * updated" before it happens, not afterwards.
 */
export async function planAcademicImportAction(
  kind: AcademicRecordKind,
  text: string
): Promise<{ ok: true; plan: AcademicImportPlan } | { ok: false; error: string }> {
  try {
    const user = await requireAcademicConsole();
    const existing = await getStore().listAcademicRecords(kind);
    return { ok: true, plan: planAcademicImport(kind, text, existing, user.id) };
  } catch (e) {
    const problem = fail(e);
    return { ok: false, error: problem.ok ? "Something went wrong" : problem.error };
  }
}

/**
 * Apply a paste. The plan is rebuilt here from the text rather than taken
 * from the browser: a plan the client could edit would be a way to write any
 * row into the table, and rebuilding it also means a record changed between
 * the preview and the Import is seen as it is now.
 */
export async function importAcademicRecordsAction(
  kind: AcademicRecordKind,
  text: string
): Promise<ActionResult & { summary?: string }> {
  try {
    const user = await requireAcademicConsole();
    const store = getStore();
    const existing = await store.listAcademicRecords(kind);
    const plan = planAcademicImport(kind, text, existing, user.id);
    if (plan.problems.length > 0) return { ok: false, error: plan.problems[0] };
    await store.saveAcademicRecords(plan.added, plan.updated);
    const summary = describeImport(plan);
    await recordAudit(user, "settings.changed", "academic_records", {
      kind,
      added: plan.added.length,
      updated: plan.updated.length,
      unchanged: plan.unchanged,
    });
    done();
    return { ok: true, summary };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteAcademicRecordAction(id: string): Promise<ActionResult> {
  try {
    const user = await requireAcademicConsole();
    const store = getStore();
    const row = (await store.listAcademicRecords()).find((r) => r.id === id);
    if (!row) return { ok: false, error: "That record is already gone" };
    await store.deleteAcademicRecord(id);
    await recordAudit(user, "settings.changed", "academic_records", {
      removed: { kind: row.record.kind, email: row.email },
    });
    done();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/**
 * Clear one kind, or everything. The office needs it when a paste went in
 * against the wrong kind - there is no other way to undo that in bulk - and
 * the console makes them type the word.
 */
export async function clearAcademicRecordsAction(
  kind?: AcademicRecordKind
): Promise<ActionResult & { summary?: string }> {
  try {
    const user = await requireAcademicConsole();
    const removed = await getStore().deleteAcademicRecords(kind);
    await recordAudit(user, "settings.changed", "academic_records", {
      cleared: kind ?? "all kinds",
      removed,
    });
    done();
    return { ok: true, summary: `${removed} record${removed === 1 ? "" : "s"} removed` };
  } catch (e) {
    return fail(e);
  }
}
