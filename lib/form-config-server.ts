import { buildDefaultFormConfig, sanitizeFormConfig, type RoleFormConfig } from "./form-config";
import { getStore } from "./store";
import type { Role } from "./types";

/**
 * The form configuration actually in force for a role: the developer-saved
 * one if present, otherwise the spec defaults — always sanitized against the
 * current guest house list. Server-side only (touches the data store).
 */
export async function getEffectiveFormConfig(role: Role): Promise<RoleFormConfig> {
  const store = getStore();
  const [stored, guestHouses] = await Promise.all([
    store.getFormConfig(role),
    store.listGuestHouses(),
  ]);
  return sanitizeFormConfig(stored ?? buildDefaultFormConfig(role, guestHouses), guestHouses);
}
