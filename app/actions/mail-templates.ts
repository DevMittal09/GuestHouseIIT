"use server";

import { revalidatePath } from "next/cache";
import { canUseConsoleSection } from "@/lib/access";
import { isAdminUnlocked } from "@/lib/admin-lock";
import { requireUser } from "@/lib/auth";
import {
  defaultOverride,
  firstInvalidAddress,
  MAIL_TEMPLATES_MIGRATION_HINT,
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
  if (isMissingTable(e)) return { ok: false, error: MAIL_TEMPLATES_MIGRATION_HINT };
  return { ok: false, error: e instanceof Error ? e.message : "Something went wrong" };
}

/**
 * Whether the store failed because `mail_templates` does not exist.
 *
 * Postgres says `42P01`; PostgREST says `PGRST205` when the table is missing
 * from its schema cache, which is what you actually get from Supabase before
 * the migration has run. Both mean the same thing to the person reading the
 * page, and neither should look like a crash.
 */
function isMissingTable(e: unknown): boolean {
  const code = (e as { code?: string } | null)?.code;
  if (code === "42P01" || code === "PGRST205") return true;
  const message = e instanceof Error ? e.message : String(e ?? "");
  return /mail_templates/.test(message) && /(does not exist|schema cache)/i.test(message);
}

export type MailTemplateList =
  | { ok: true; templates: MailTemplateOverride[] }
  | { ok: false; error: string };

/**
 * Every event, with its stored edits folded in — so the console shows one row
 * per kind of mail whether or not it has been touched. Events with no row
 * come back as `defaultOverride`, which is what "unedited" looks like.
 *
 * Returns a result rather than throwing. It is read by a server component,
 * and an exception there replaces the whole console with "page cannot be
 * loaded" — which is a terrible way to be told that a migration has not been
 * run yet, or that this account cannot open this tab.
 */
export async function listMailTemplates(): Promise<MailTemplateList> {
  try {
    await requireMailConsole();
    const stored = new Map(
      (await getStore().listMailTemplates()).map((o) => [o.event_key, o])
    );
    return {
      ok: true,
      templates: (Object.keys(MAIL_EVENT_LABELS) as MailEventKey[]).map(
        (key) => stored.get(key) ?? defaultOverride(key)
      ),
    };
  } catch (e) {
    if (isMissingTable(e)) return { ok: false, error: MAIL_TEMPLATES_MIGRATION_HINT };
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Could not load the email templates",
    };
  }
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
