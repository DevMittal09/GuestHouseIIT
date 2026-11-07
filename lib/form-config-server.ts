import {
  buildDefaultFormConfig,
  isStoredFormConfig,
  sanitizeFormConfig,
  type RoleFormConfig,
} from "./form-config";
import { getStore } from "./store";
import type { Role } from "./types";

/**
 * The form configuration actually in force for a role: the developer-saved
 * one if present, otherwise the spec defaults - always sanitized against the
 * current guest house list. Server-side only (touches the data store).
 */
export async function getEffectiveFormConfig(role: Role): Promise<RoleFormConfig> {
  const store = getStore();
  const [stored, guestHouses] = await Promise.all([
    store.getFormConfig(role),
    store.listGuestHouses(),
  ]);
  // A row that is not a form configuration for this role is ignored, not
  // trusted - see `isStoredFormConfig` for the bug that made this necessary.
  const saved = isStoredFormConfig(stored, role) ? stored : null;
  if (stored && !saved) {
    console.warn(
      `[form-config] ignoring the saved form_configs row for "${role}": it is not a form configuration for that role. Open Form Builder and save, or press Reset to spec defaults, to replace it.`
    );
  }
  return sanitizeFormConfig(saved ?? buildDefaultFormConfig(role, guestHouses), guestHouses);
}
