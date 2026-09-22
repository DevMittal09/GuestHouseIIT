"use server";

import { revalidatePath } from "next/cache";
import { canUseConsoleSection } from "@/lib/access";
import { isAdminUnlocked } from "@/lib/admin-lock";
import { recordAudit } from "@/lib/audit-server";
import { requireUser } from "@/lib/auth";
import {
  describeRuleChanges,
  hostelNameSchema,
  officialEmailSchema,
  RULE_SCHEMAS,
  ruleKey,
  type RuleGroup,
  type Rules,
} from "@/lib/settings";
import {
  capacityChangeBlockers,
  mealWindowBlockers,
  refusalMessage,
  whitelistRemovalBlockers,
} from "@/lib/settings-impact";
import { getOfficialEmails, getRules } from "@/lib/settings-server";
import { isInstituteEmail } from "@/lib/site";
import { getStore } from "@/lib/store";
import { BufferClashError, type Profile } from "@/lib/types";
import type { ActionResult } from "./bookings";

/**
 * The developer console's Settings (Phase 1): every rule the office can
 * change without a deploy.
 *
 * Each action re-checks, server-side, that the caller may use the Settings
 * section and that the console is unlocked — the page hiding a form is not the
 * boundary. Each validates the proposed value, refuses a change that would
 * break stored data (naming what it would break), and records what changed in
 * the security audit log.
 */

/**
 * The invoice group is priced and run by the office, so it belongs to the
 * Tariffs & Invoicing section (manager and developer); every other group is
 * Settings (developer only).
 */
async function requireConsoleFor(group: RuleGroup): Promise<Profile> {
  if (group !== "invoice") return requireSettingsConsole();
  const user = await requireUser();
  if (!canUseConsoleSection(user.role, "billing")) {
    throw new Error("Only the Guest House Manager or a developer can change invoice settings");
  }
  if (!(await isAdminUnlocked())) {
    throw new Error("The console is locked — enter the console password again");
  }
  return user;
}

async function requireSettingsConsole(): Promise<Profile> {
  const user = await requireUser();
  if (!canUseConsoleSection(user.role, "settings")) {
    throw new Error("Only a developer can change Settings");
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
        "The settings tables are not there yet — apply supabase/migrations/00000000000016_settings_and_audit.sql.",
    };
  }
  return { ok: false, error: e instanceof Error ? e.message : "Something went wrong" };
}

/**
 * Settings change what the booking form offers and what the public site says
 * (meal times, the advance window), so the whole layout is revalidated — this
 * is one of the few actions that genuinely changes every page.
 */
function done(): ActionResult {
  revalidatePath("/", "layout");
  return { ok: true };
}

export type SettingsConsoleData = {
  rules: Rules;
  hostels: { name: string; accounts: number }[];
  officialEmails: { email: string; account: string | null }[];
};

/** Everything the Settings page shows, or why it could not be read. */
export async function getSettingsConsoleData(): Promise<
  { ok: true; data: SettingsConsoleData } | { ok: false; error: string }
> {
  try {
    await requireSettingsConsole();
    const store = getStore();
    const [rules, hostels, emails, profiles] = await Promise.all([
      getRules(),
      store.listHostels(),
      store.listOfficialEmails(),
      store.listProfiles(),
    ]);
    return {
      ok: true,
      data: {
        rules,
        hostels: hostels.map((name) => ({
          name,
          accounts: profiles.filter((p) => p.hostel_name === name).length,
        })),
        officialEmails: emails.map((email) => ({
          email,
          account:
            profiles.find((p) => p.email.toLowerCase() === email.toLowerCase())?.full_name ?? null,
        })),
      },
    };
  } catch (e) {
    const result = fail(e);
    return { ok: false, error: result.ok ? "Could not load settings" : result.error };
  }
}

/**
 * Save one group of scalar rules (capacity, booking window, meal times).
 *
 * Refused, with the bookings named, when the new value would make a live
 * booking invalid: a room no longer holding the party already allocated to
 * it, or meals no longer served during a stay.
 */
export async function saveRuleGroup(group: RuleGroup, proposed: unknown): Promise<ActionResult> {
  try {
    const user = await requireConsoleFor(group);
    const schema = RULE_SCHEMAS[group];
    if (!schema) return { ok: false, error: "Unknown settings group" };
    const parsed = schema.safeParse(proposed);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid settings" };
    }
    const next = parsed.data as Rules[typeof group];
    const current = (await getRules())[group];
    const changes = describeRuleChanges(current, next);
    if (changes.length === 0) return { ok: true };

    const store = getStore();
    if (group === "capacity" || group === "meals") {
      const bookings = await store.listBookings({});
      const blockers =
        group === "capacity"
          ? capacityChangeBlockers(next as Rules["capacity"], bookings)
          : mealWindowBlockers(next as Rules["meals"], bookings);
      if (blockers.length > 0) {
        return {
          ok: false,
          error: refusalMessage(
            group === "capacity" ? "This capacity change" : "These serving times",
            blockers
          ),
        };
      }
    }

    // The turnaround buffer is enforced by the database's exclusion
    // constraint, so changing it rebuilds every hold — in Postgres, in one
    // transaction that refuses (naming the stays) if any two would clash.
    // That comes first: if it is refused, nothing in the group is saved.
    if (group === "booking") {
      const before = current as Rules["booking"];
      const after = next as Rules["booking"];
      if (before.buffer_minutes !== after.buffer_minutes) {
        try {
          await store.applyBookingBuffer(after.buffer_minutes);
        } catch (e) {
          if (e instanceof BufferClashError) return { ok: false, error: e.message };
          throw e;
        }
      }
    }

    await store.setJsonSetting(ruleKey(group), next);
    await recordAudit(user, "settings.changed", ruleKey(group), { changes });
    return done();
  } catch (e) {
    return fail(e);
  }
}

// ------------------------------------------------------------------ hostels

export async function addHostelAction(name: string): Promise<ActionResult> {
  try {
    const user = await requireSettingsConsole();
    const parsed = hostelNameSchema.safeParse(name);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid name" };
    await getStore().addHostel(parsed.data);
    await recordAudit(user, "settings.changed", "hostels", { added: parsed.data });
    return done();
  } catch (e) {
    return fail(e);
  }
}

/** Renames the hostel and moves every account in it — wardens' scoping follows. */
export async function renameHostelAction(from: string, to: string): Promise<ActionResult> {
  try {
    const user = await requireSettingsConsole();
    const parsed = hostelNameSchema.safeParse(to);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid name" };
    if (parsed.data === from) return { ok: true };
    await getStore().renameHostel(from, parsed.data);
    await recordAudit(user, "settings.changed", "hostels", { renamed: { from, to: parsed.data } });
    return done();
  } catch (e) {
    return fail(e);
  }
}

/** Refused while any account names the hostel — the store enforces it too. */
export async function removeHostelAction(name: string): Promise<ActionResult> {
  try {
    const user = await requireSettingsConsole();
    const profiles = await getStore().listProfiles();
    const inUse = profiles.filter((p) => p.hostel_name === name);
    if (inUse.length > 0) {
      return {
        ok: false,
        error: refusalMessage(
          `Removing ${name}`,
          inUse.map((p) => `${p.full_name} (${p.email}) lives in ${name}`)
        ),
      };
    }
    await getStore().removeHostel(name);
    await recordAudit(user, "settings.changed", "hostels", { removed: name });
    return done();
  } catch (e) {
    return fail(e);
  }
}

// -------------------------------------------------------- official whitelist

export async function addOfficialEmailAction(email: string): Promise<ActionResult> {
  try {
    const user = await requireSettingsConsole();
    const parsed = officialEmailSchema.safeParse(email);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid email" };
    // Official bookings are the institute's own; an outside address has no
    // business on this list, and could not sign in to use it anyway.
    if (!isInstituteEmail(parsed.data)) {
      return { ok: false, error: "Only institute addresses can be whitelisted for official bookings" };
    }
    if ((await getOfficialEmails()).includes(parsed.data)) {
      return { ok: false, error: `${parsed.data} is already on the list` };
    }
    await getStore().addOfficialEmail(parsed.data);
    await recordAudit(user, "settings.changed", "official_email_whitelist", { added: parsed.data });
    return done();
  } catch (e) {
    return fail(e);
  }
}

/** Refused while an Official / Dignitary account uses the address. */
export async function removeOfficialEmailAction(email: string): Promise<ActionResult> {
  try {
    const user = await requireSettingsConsole();
    const blockers = whitelistRemovalBlockers(email, await getStore().listProfiles());
    if (blockers.length > 0) {
      return { ok: false, error: refusalMessage(`Removing ${email}`, blockers) };
    }
    await getStore().removeOfficialEmail(email);
    await recordAudit(user, "settings.changed", "official_email_whitelist", { removed: email });
    return done();
  } catch (e) {
    return fail(e);
  }
}
