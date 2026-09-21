"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { canUseConsoleSection } from "@/lib/access";
import { isAdminUnlocked } from "@/lib/admin-lock";
import { requireUser } from "@/lib/auth";
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
});

export type UnitInput = z.input<typeof unitSchema>;

export async function createUnitAction(input: UnitInput): Promise<ActionResult> {
  try {
    await requireUnitsConsole();
    const parsed = unitSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid unit" };
    await getStore().createUnit(parsed.data as Omit<Unit, "id">);
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
    await requireUnitsConsole();
    const parsed = unitSchema.partial().safeParse(patch);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid unit" };
    if (parsed.data.parent_id !== undefined) {
      const loop = parentError(id, parsed.data.parent_id, await getStore().listUnits());
      if (loop) return { ok: false, error: loop };
    }
    await getStore().updateUnit(id, parsed.data as Partial<Omit<Unit, "id">>);
    return done();
  } catch (e) {
    return fail(e);
  }
}

export async function deleteUnitAction(id: string): Promise<ActionResult> {
  try {
    await requireUnitsConsole();
    await getStore().deleteUnit(id);
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
