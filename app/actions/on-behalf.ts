"use server";

import { revalidateConsole } from "@/lib/revalidate";
import { recordAudit } from "@/lib/audit-server";
import { requireUser } from "@/lib/auth";
import {
  canUseConsoleSection,
  CONSOLE_SECTIONS,
  type ConsoleSection,
} from "@/lib/access";
import {
  isAdminUnlocked,
  isDefaultAdminPassword,
} from "@/lib/admin-lock";
import { getStore } from "@/lib/store";
import { isNonTeachingStaff } from "@/lib/staff-booking";
import type { ActionResult } from "./bookings";
import type { Profile } from "@/lib/types";

async function requireConsole(section: ConsoleSection): Promise<Profile> {
  const user = await requireUser();
  if (!canUseConsoleSection(user.role, section)) {
    throw new Error(`You do not have access to ${CONSOLE_SECTIONS[section].label}`);
  }
  if (!(await isAdminUnlocked())) {
    throw new Error("The console is locked - enter the console password again");
  }
  if (
    process.env.NODE_ENV === "production" &&
    section !== "console_access" &&
    (await isDefaultAdminPassword())
  ) {
    throw new Error(
      "The console password is still the factory default - change it in Console Access before using the console in production",
    );
  }
  return user;
}

function fail(e: unknown): ActionResult {
  return { ok: false, error: e instanceof Error ? e.message : "Something went wrong" };
}

export async function addOnBehalfEntryAction(
  targetProfileId: string,
  bookerProfileId: string,
): Promise<ActionResult> {
  try {
    const user = await requireConsole("on_behalf");
    const store = getStore();

    const target = await store.getProfile(targetProfileId);
    if (!target) return { ok: false, error: "Target account not found" };
    if (!isNonTeachingStaff(target)) {
      return { ok: false, error: "Only non-teaching staff may be configured as on-behalf targets" };
    }

    const booker = await store.getProfile(bookerProfileId);
    if (!booker) return { ok: false, error: "Booker account not found" };

    await store.addOnBehalfEntry(targetProfileId, bookerProfileId, user.id);

    await recordAudit(
      user,
      "settings.changed",
      "on_behalf_config",
      {
        action: "add",
        target: `${target.full_name} (${target.email})`,
        booker: `${booker.full_name} (${booker.email})`,
      },
    );

    revalidateConsole();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function removeOnBehalfEntryAction(
  id: string,
): Promise<ActionResult> {
  try {
    const user = await requireConsole("on_behalf");
    const store = getStore();

    const entries = await store.listOnBehalfConfig();
    const entry = entries.find((e) => e.id === id);
    if (!entry) return { ok: false, error: "Entry not found" };

    const target = await store.getProfile(entry.target_profile_id);
    const booker = await store.getProfile(entry.booker_profile_id);

    await store.removeOnBehalfEntry(id);

    await recordAudit(
      user,
      "settings.changed",
      "on_behalf_config",
      {
        action: "remove",
        target: `${target?.full_name ?? "unknown"} (${target?.email ?? "?"})`,
        booker: `${booker?.full_name ?? "unknown"} (${booker?.email ?? "?"})`,
      },
    );

    revalidateConsole();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
