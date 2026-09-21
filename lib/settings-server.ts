import { cache } from "react";
import { getStore } from "@/lib/store";
import {
  DEFAULT_OFFICIAL_EMAILS,
  DEFAULT_RULES,
  parseRuleGroup,
  RULE_GROUPS,
  ruleKey,
  type RuleGroup,
  type Rules,
} from "./settings";

/**
 * The office's Settings, read once per request.
 *
 * `cache()` dedupes within a render and a server action, so the booking page,
 * its form and the schema it builds all see one read. Every reader falls back
 * to the defaults rather than throwing: a missing `app_settings` row means
 * "nobody has changed this", and a missing table (migration 16 not yet
 * applied) must not take the public site or the booking form down with it.
 */
export const getRules = cache(async (): Promise<Rules> => {
  const store = getStore();
  const stored = await Promise.all(
    RULE_GROUPS.map(async (group) => {
      try {
        return [group, await store.getJsonSetting(ruleKey(group))] as const;
      } catch (error) {
        console.error(`[settings] could not read ${ruleKey(group)}; using the defaults`, error);
        return [group, null] as const;
      }
    })
  );
  const rules = { ...DEFAULT_RULES } as Record<RuleGroup, unknown>;
  for (const [group, value] of stored) rules[group] = parseRuleGroup(group, value);
  return rules as Rules;
});

/** The official-booking whitelist, or the old hardcoded list before migration 16. */
export const getOfficialEmails = cache(async (): Promise<string[]> => {
  try {
    return await getStore().listOfficialEmails();
  } catch (error) {
    console.error("[settings] could not read the official whitelist; using the defaults", error);
    return DEFAULT_OFFICIAL_EMAILS;
  }
});

/** Hostels for dropdowns. Empty on failure — a free-text field is still usable. */
export const getHostels = cache(async (): Promise<string[]> => {
  try {
    return await getStore().listHostels();
  } catch (error) {
    console.error("[settings] could not read hostels", error);
    return [];
  }
});
