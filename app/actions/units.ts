"use server";

import { revalidateEverything } from "@/lib/revalidate";
import { z } from "zod";
import { canUseConsoleSection } from "@/lib/access";
import { isAdminUnlocked } from "@/lib/admin-lock";
import { requireUser } from "@/lib/auth";
import { recordAudit } from "@/lib/audit-server";
import { getStore } from "@/lib/store";
import { canBeFacultyAdvisor } from "@/lib/club-booking";
import { isStudentBody, parentError, type Unit, type UnitKind } from "@/lib/units";
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
  // 42703 / PGRST204: a column the database does not have yet — the Faculty
  // Advisor and secretary's mailbox, before migration 25.
  if (code === "42703" || code === "PGRST204") {
    return {
      ok: false,
      error:
        "Faculty Advisors are not in the database yet — apply supabase/migrations/00000000000025_faculty_advisors.sql.",
    };
  }
  return { ok: false, error: e instanceof Error ? e.message : "Something went wrong" };
}

function done(): ActionResult {
  revalidateEverything();
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
  // Whose HOD approves this unit's official requests, when not the default.
  hod_unit_id: blankToNull,
  // Offices only: officer (Institute Grant) or department (its Department).
  office_class: z
    .enum(["officer", "department", ""])
    .nullish()
    .transform((v) => (v ? v : null)),
  // Councils, fests and clubs only (migration 25): who the Faculty Advisor
  // is now, and the secretary's mailbox copied on the advisor's bookings.
  faculty_advisor_id: blankToNull,
  secretary_email: z
    .string()
    .nullish()
    .transform((v) => (v && v.trim() ? v.trim().toLowerCase() : null))
    .pipe(z.email("Enter the secretary's mailbox as a full address, e.g. sec_arts@iitpkd.ac.in").max(254).nullable()),
});

export type UnitInput = z.input<typeof unitSchema>;

/**
 * Why a unit may not have this Faculty Advisor or secretary's mailbox, or
 * null when it may. Only a council, fest or club has either, and the advisor
 * must be a faculty member: the console lists every professor, and anyone it
 * names can book for the unit straight to the Guest House Manager — so a
 * crafted request naming a student or a desk account is refused here.
 */
async function studentBodyError(
  kind: UnitKind,
  fields: { faculty_advisor_id?: string | null; secretary_email?: string | null }
): Promise<string | null> {
  if (!fields.faculty_advisor_id && !fields.secretary_email) return null;
  if (!isStudentBody(kind)) {
    return "Only a council, fest or club has a Faculty Advisor and a secretary's mailbox";
  }
  if (fields.faculty_advisor_id) {
    const advisor = (await getStore().listProfiles()).find((p) => p.id === fields.faculty_advisor_id);
    if (!advisor) return "That Faculty Advisor's account was not found";
    if (!canBeFacultyAdvisor(advisor)) {
      return `${advisor.full_name} cannot be a Faculty Advisor — choose a faculty member`;
    }
  }
  return null;
}

export async function createUnitAction(input: UnitInput): Promise<ActionResult> {
  try {
    const user = await requireUnitsConsole();
    const parsed = unitSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid unit" };
    const unit = {
      ...parsed.data,
      office_class: parsed.data.kind === "office" ? (parsed.data.office_class ?? null) : null,
    };
    const refused = await studentBodyError(unit.kind, unit);
    if (refused) return { ok: false, error: refused };
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
    if (parsed.data.hod_unit_id && parsed.data.hod_unit_id === id) {
      return { ok: false, error: "A unit cannot give HOD approval for itself this way — leave it on the default" };
    }
    // The database refuses an office class on anything but an office; say so
    // in words rather than as a constraint name.
    const kind = parsed.data.kind ?? before.kind;
    if (parsed.data.office_class && kind !== "office") {
      return { ok: false, error: "Only an office can be an officer or department office" };
    }
    const refused = await studentBodyError(kind, {
      faculty_advisor_id: parsed.data.faculty_advisor_id,
      secretary_email: parsed.data.secretary_email,
    });
    if (refused) return { ok: false, error: refused };
    const next = { ...parsed.data } as Partial<Omit<Unit, "id">>;
    if (parsed.data.kind && parsed.data.kind !== "office") next.office_class = null;
    // A unit that stops being a council or club loses its advisor and
    // mailbox, as the database would refuse to keep them.
    if (parsed.data.kind && !isStudentBody(parsed.data.kind)) {
      if (before.faculty_advisor_id) next.faculty_advisor_id = null;
      if (before.secretary_email) next.secretary_email = null;
    }
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
