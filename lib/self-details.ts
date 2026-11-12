import type { Gender } from "./types";

/**
 * What the portal knows about the requester themselves, for auto-filling the
 * guest card when "Self" is chosen as the relationship (12 Nov 2026).
 *
 * Fields that are null remain editable on the form; fields with a value are
 * filled in and read-only - the same pattern as `lockedNameFor` for a parent.
 * The server writes the stored value regardless of what arrived.
 */
export type SelfDetails = {
  name: string | null;
  gender: Gender | null;
  id_number: string | null;
};

export const EMPTY_SELF_DETAILS: SelfDetails = {
  name: null,
  gender: null,
  id_number: null,
};

/** Whether the relationship string (case-insensitive) is "Self". */
export function isSelfRelationship(relationship: string | null | undefined): boolean {
  return !!relationship && relationship.trim().toLowerCase() === "self";
}
