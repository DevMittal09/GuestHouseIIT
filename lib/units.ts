/**
 * Departments, clubs, councils and offices — and who heads each one.
 *
 * Approvers used to be found by matching free text: a faculty advisor was
 * whoever had the same "Department / Club" string as the club asking. That
 * broke on a stray space, and it meant that when the advisor changed — which
 * happens every two years — two profiles had to be edited by hand and kept
 * spelled identically.
 *
 * Now the *unit* holds the approver, not the people in it:
 *
 * - A person belongs to one unit (`Profile.unit_id`). That rarely changes.
 * - A unit has a **head** and, optionally, an **acting head** for leave or a
 *   gap between appointments. Changing the HOD is one field on one row.
 * - A unit with no head of its own takes its **parent's**. That is how a
 *   council's student secretary approves for every club in the council
 *   without being entered on each one.
 *
 * Approvers are resolved when someone *looks*, never stored on the booking.
 * So when the head changes, requests already waiting move to the new head on
 * their own, and the old head's past decisions stay in the log under their
 * own name.
 */

export type UnitKind = "department" | "club" | "council" | "office";

export const UNIT_KIND_LABELS: Record<UnitKind, string> = {
  department: "Department",
  club: "Club",
  council: "Council / Board",
  office: "Office",
};

/** What the head of each kind of unit is called, for the console and mail. */
export const UNIT_HEAD_TITLES: Record<UnitKind, string> = {
  department: "HOD",
  club: "Faculty Advisor / Secretary",
  council: "Secretary",
  office: "Head",
};

/**
 * A `type`, not an `interface`, on purpose: Supabase's generated client needs
 * its row types to satisfy an index signature, and an interface does not —
 * declaring this as one turns every table in `Database` into `never`.
 */
export type Unit = {
  id: string;
  name: string;
  kind: UnitKind;
  /** The unit this one sits under — a club's council, say. */
  parent_id: string | null;
  head_id: string | null;
  /** Stands in for the head while set. Both may approve. */
  acting_head_id: string | null;
};

/** The longest chain of parents followed — a guard against a cycle someone typed in. */
const MAX_DEPTH = 8;

/**
 * Who approves for a unit: its head and acting head, or, when it has neither,
 * its parent's — and so on up. Empty when nobody anywhere up the chain is
 * set, which the booking routes around rather than getting stuck on.
 */
export function approversOf(unitId: string | null | undefined, units: Unit[]): string[] {
  const byId = new Map(units.map((u) => [u.id, u]));
  let current = unitId ? byId.get(unitId) : undefined;
  for (let depth = 0; current && depth < MAX_DEPTH; depth++) {
    const ids = [current.head_id, current.acting_head_id].filter(
      (id): id is string => Boolean(id)
    );
    if (ids.length > 0) return [...new Set(ids)];
    current = current.parent_id ? byId.get(current.parent_id) : undefined;
  }
  return [];
}

/** The unit whose head approved, for the log — the first one up the chain that has one. */
export function approvingUnit(unitId: string | null | undefined, units: Unit[]): Unit | null {
  const byId = new Map(units.map((u) => [u.id, u]));
  let current = unitId ? byId.get(unitId) : undefined;
  for (let depth = 0; current && depth < MAX_DEPTH; depth++) {
    if (current.head_id || current.acting_head_id) return current;
    current = current.parent_id ? byId.get(current.parent_id) : undefined;
  }
  return null;
}

/** Whether this person heads (or acts as head of) any unit at all. */
export function headsAnyUnit(profileId: string, units: Unit[]): boolean {
  return units.some((u) => u.head_id === profileId || u.acting_head_id === profileId);
}

/**
 * Why a unit's parent may not be this one, or null when it may. A unit
 * cannot sit under itself or under one of its own descendants — that makes a
 * loop, and the approver would never be found.
 */
export function parentError(unitId: string, parentId: string | null, units: Unit[]): string | null {
  if (!parentId) return null;
  if (parentId === unitId) return "A unit cannot sit under itself";
  const byId = new Map(units.map((u) => [u.id, u]));
  let current = byId.get(parentId);
  for (let depth = 0; current && depth < MAX_DEPTH; depth++) {
    if (current.id === unitId) return "That would put the unit under one of its own sub-units";
    current = current.parent_id ? byId.get(current.parent_id) : undefined;
  }
  return null;
}
