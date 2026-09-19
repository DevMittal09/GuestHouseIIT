"use server";

import { revalidatePath } from "next/cache";
import { canUseConsoleSection } from "@/lib/access";
import { isAdminUnlocked } from "@/lib/admin-lock";
import { requireUser } from "@/lib/auth";
import {
  defaultOverride,
  firstInvalidAddress,
  parseAddressList,
  type MailTemplateOverride,
} from "@/lib/mail/template-config";
import { MAIL_EVENT_LABELS, type MailEventKey } from "@/lib/mail/types";
import { getStore } from "@/lib/store";
import type { ActionResult } from "./bookings";

/**
 * Reading and editing what the automatic emails say.
 *
 * Separate from `admin.ts` only because that file is already long; the gate
 * is the same one — a console section plus the console unlock, checked on the
 * action rather than trusted from the page.
 */
async function requireMailConsole() {
  const user = await requireUser();
  if (!canUseConsoleSection(user.role, "mail_templates")) {
    throw new Error("You do not have access to Email Templates");
  }
  if (!(await isAdminUnlocked())) {
    throw new Error("The console is locked — enter the console password again");
  }
  return user;
}

function fail(e: unknown): ActionResult {
  return { ok: false, error: e instanceof Error ? e.message : "Something went wrong" };
}

/**
 * Every event, with its stored edits folded in — so the console shows one row
 * per kind of mail whether or not it has been touched. Events with no row
 * come back as `defaultOverride`, which is what "unedited" looks like.
 */
export async function listMailTemplates(): Promise<MailTemplateOverride[]> {
  await requireMailConsole();
  const stored = new Map(
    (await getStore().listMailTemplates()).map((o) => [o.event_key, o])
  );
  return (Object.keys(MAIL_EVENT_LABELS) as MailEventKey[]).map(
    (key) => stored.get(key) ?? defaultOverride(key)
  );
}

export interface MailTemplateInput {
  event_key: string;
  enabled: boolean;
  subject: string;
  intro: string;
  outro: string;
  /** One address per line, or comma separated. */
  cc: string;
}

export async function saveMailTemplateAction(input: MailTemplateInput): Promise<ActionResult> {
  try {
    await requireMailConsole();
    if (!(input.event_key in MAIL_EVENT_LABELS)) {
      return { ok: false, error: "Unknown email type" };
    }
    const cc = parseAddressList(input.cc);
    const bad = firstInvalidAddress(cc);
    if (bad) return { ok: false, error: `“${bad}” is not a valid email address` };

    // Blank means "use the built-in wording", which is why these are stored
    // as null rather than an empty string — an empty subject would send mail
    // with no subject at all.
    const trimmed = (v: string) => (v.trim() === "" ? null : v.trim());
    await getStore().saveMailTemplate({
      event_key: input.event_key as MailEventKey,
      enabled: input.enabled,
      subject: trimmed(input.subject),
      intro: trimmed(input.intro),
      outro: trimmed(input.outro),
      cc,
      updated_at: new Date().toISOString(),
    });
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Throw the edits away and go back to the wording in the code. */
export async function resetMailTemplateAction(key: string): Promise<ActionResult> {
  try {
    await requireMailConsole();
    if (!(key in MAIL_EVENT_LABELS)) return { ok: false, error: "Unknown email type" };
    await getStore().resetMailTemplate(key as MailEventKey);
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
