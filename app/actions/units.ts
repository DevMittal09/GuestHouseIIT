"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { canUseConsoleSection } from "@/lib/access";
import { isAdminUnlocked } from "@/lib/admin-lock";
import { requireUser } from "@/lib/auth";
import { recordAudit } from "@/lib/audit-server";
import { getStore } from "@/lib/store";
import { parentError, type Unit } from "@/lib/units";
import type { ActionResult } from "./bookings";

/**
 * Managing departments, clubs, councils and offices — and who heads each.
 *
 * The same gate as the rest of the console: the section and the unlock, both
 * checked here on the action rather than trusted from the page.
 */
async function requireUnitsConsole() {
  const user = await requireUser();
  if (!canUseConsoleSection(user.role, "units")) {
    throw new Error("You do not have access to Departments & Clubs");
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
      error:
        "The units table is not there yet — apply supabase/migrations/00000000000015_units_and_debit_heads.sql.",
    };
  }
  return { ok: false, error: e instanceof Error ? e.message : "Something went wrong" };
}

function done(): ActionResult {
  revalidatePath("/", "layout");
  return { ok: true };
}

const blankToNull = z
  .string()
  .nullish()
  .transform((v) => (v && v.trim() ? v.trim() : null));

const unitSchema = z.object({
  name: z.string().trim().min(2, "Give the unit a name"),
  kind: z.enum(["department", "club", "council", "office"]),
  parent_id: blankToNull,
  head_id: blankToNull,
  acting_head_id: blankToNull,
  // Offices only: officer (Institute Grant) or department (its Department).
  office_class: z
    .enum(["officer", "department", ""])
    .nullish()
    .transform((v) => (v ? v : null)),
});

export type UnitInput = z.input<typeof unitSchema>;

export async function createUnitAction(input: UnitInput): Promise<ActionResult> {
  try {
    const user = await requireUnitsConsole();
    const parsed = unitSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid unit" };
    const unit = {
      ...parsed.data,
      office_class: parsed.data.kind === "office" ? (parsed.data.office_class ?? null) : null,
    };
    await getStore().createUnit(unit as Omit<Unit, "id">);
    await recordAudit(user, "settings.changed", `unit:${unit.name}`, { created: unit });
    return done();
  } catch (e) {
    return fail(e);
  }
}

/**
 * Change any part of a unit. The usual one is the head: a new HOD is one call,
 * and every request waiting on that department moves to them at once, because
 * approvers are resolved when someone looks rather than stored on the booking.
 */
export async function updateUnitAction(
  id: string,
  patch: Partial<UnitInput>
): Promise<ActionResult> {
  try {
    const user = await requireUnitsConsole();
    const parsed = unitSchema.partial().safeParse(patch);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid unit" };
    const units = await getStore().listUnits();
    const before = units.find((u) => u.id === id);
    if (!before) return { ok: false, error: "Unit not found" };
    if (parsed.data.parent_id !== undefined) {
      const loop = parentError(id, parsed.data.parent_id, units);
      if (loop) return { ok: false, error: loop };
    }
    // The database refuses an office class on anything but an office; say so
    // in words rather than as a constraint name.
    const kind = parsed.data.kind ?? before.kind;
    if (parsed.data.office_class && kind !== "office") {
      return { ok: false, error: "Only an office can be an officer or department office" };
    }
    const next = { ...parsed.data } as Partial<Omit<Unit, "id">>;
    if (parsed.data.kind && parsed.data.kind !== "office") next.office_class = null;
    await getStore().updateUnit(id, next);
    // Who heads a unit decides who approves its requests, so an appointment
    // is a security-relevant change and goes in the audit log.
    await recordAudit(user, "settings.changed", `unit:${before.name}`, {
      changes: Object.fromEntries(
        Object.entries(next).map(([k, v]) => [k, { from: before[k as keyof Unit] ?? null, to: v }])
      ),
    });
    return done();
  } catch (e) {
    return fail(e);
  }
}

export async function deleteUnitAction(id: string): Promise<ActionResult> {
  try {
    const user = await requireUnitsConsole();
    const before = (await getStore().listUnits()).find((u) => u.id === id);
    await getStore().deleteUnit(id);
    await recordAudit(user, "settings.changed", `unit:${before?.name ?? id}`, { deleted: before ?? id });
    return done();
  } catch (e) {
    return fail(e);
  }
}

/** For the page: every unit, or why they could not be read. */
export async function listUnitsForConsole(): Promise<
  { ok: true; units: Unit[] } | { ok: false; error: string }
> {
  try {
    await requireUnitsConsole();
    return { ok: true, units: await getStore().listUnits() };
  } catch (e) {
    const result = fail(e);
    return { ok: false, error: result.ok ? "Could not load units" : result.error };
  }
}
