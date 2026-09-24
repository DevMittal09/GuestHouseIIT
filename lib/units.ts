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

/**
 * What the head of each kind of unit is called, for the console and mail. A
 * club's or council's head is its student **secretary**, who approved club
 * requests at the old club stage; its **Faculty Advisor** is a separate
 * appointment (`faculty_advisor_id`, 24 Sep 2026), and the one who books.
 */
export const UNIT_HEAD_TITLES: Record<UnitKind, string> = {
  department: "HOD",
  club: "Secretary",
  council: "Secretary",
  office: "Head",
};

/** The kinds of unit that have a Faculty Advisor and a secretary's mailbox. */
export const STUDENT_BODY_KINDS: UnitKind[] = ["club", "council"];

export function isStudentBody(kind: UnitKind): boolean {
  return STUDENT_BODY_KINDS.includes(kind);
}

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
  /**
   * Offices only (migration 16): an **officer** office (Director, Registrar,
   * the Deans) books against the Institute Grant; a **department** office
   * (a department's own office) against its Department. Null for every other
   * kind of unit, and for an office nobody has classified yet — which is
   * treated as a department office, the narrower of the two.
   */
  office_class?: OfficeClass | null;
  /**
   * Whose HOD approves this unit's official requests (migration 18), when it is
   * not the obvious one — a club whose bookings go to the Dean of Students'
   * office, say. Null means the default: a department is its own; a
   * department office answers to the department above it; an officer office
   * to its own head; a club or council has no HOD stage.
   */
  hod_unit_id?: string | null;
  /**
   * Councils, fests and clubs only (migration 25): the faculty member who is
   * the unit's **Faculty Advisor** now. An appointment of a year or two, so it
   * is a field the console changes, never a separate account: whoever is named
   * here books for the unit from their own faculty login, and the booking goes
   * straight to the Guest House Manager. A club with none of its own takes its
   * council's (`facultyAdvisorOf`).
   */
  faculty_advisor_id?: string | null;
  /**
   * Councils, fests and clubs only (migration 25): the student secretary's
   * mailbox — `sec_arts@iitpkd.ac.in`, say — which outlives any one secretary.
   * Filled into Copy to on every booking the Faculty Advisor raises for the
   * unit or a club under it (`secretaryEmailOf`).
   */
  secretary_email?: string | null;
};

export type OfficeClass = "officer" | "department";

export const OFFICE_CLASS_LABELS: Record<OfficeClass, string> = {
  officer: "Officer office (Director, Registrar, Deans…)",
  department: "Department office",
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

/**
 * The first value of `pick` found walking up from a unit through its parents
 * — a club's own, else its council's. Null when nobody up the chain has one.
 */
function inherited(
  unitId: string | null | undefined,
  units: Unit[],
  pick: (unit: Unit) => string | null | undefined
): string | null {
  const byId = new Map(units.map((u) => [u.id, u]));
  let current = unitId ? byId.get(unitId) : undefined;
  for (let depth = 0; current && depth < MAX_DEPTH; depth++) {
    const value = pick(current)?.trim();
    if (value) return value;
    current = current.parent_id ? byId.get(current.parent_id) : undefined;
  }
  return null;
}

/**
 * The Faculty Advisor of a council, fest or club: its own, else the council
 * it sits under — "a faculty advisor for each council, and clubs under it".
 * A fest or club with an advisor of its own (Petrichor) keeps theirs.
 */
export function facultyAdvisorOf(unitId: string | null | undefined, units: Unit[]): string | null {
  return inherited(unitId, units, (u) => u.faculty_advisor_id);
}

/** The secretary's mailbox for a council, fest or club: its own, else its council's. */
export function secretaryEmailOf(unitId: string | null | undefined, units: Unit[]): string | null {
  return inherited(unitId, units, (u) => u.secretary_email);
}

/**
 * The unit whose head gives *HOD approval* for a requester in `unitId`, or
 * null when requests from there have no HOD stage. See `hod_unit_id`.
 */
export function hodUnitIdFor(unitId: string | null | undefined, units: Unit[]): string | null {
  const unit = unitId ? units.find((u) => u.id === unitId) : undefined;
  if (!unit) return null;
  if (unit.hod_unit_id) return unit.hod_unit_id;
  switch (unit.kind) {
    case "department":
      return unit.id;
    case "office":
      // A department's own office answers to that department; an officer
      // office (Director, Registrar) to its own head. An office nobody has
      // classified is treated as a department office.
      return unit.office_class === "officer" ? unit.id : (unit.parent_id ?? unit.id);
    default:
      return null;
  }
}

/**
 * Who gives HOD approval for this requester, **never the requester
 * themselves**: an HOD's own official booking is not signed off by its
 * author. When nobody else can approve, the list is empty and the booking
 * skips the stage (the submission log says so) rather than waiting forever.
 */
export function hodApproversFor(
  requester: { id: string; unit_id?: string | null },
  units: Unit[]
): string[] {
  return approversOf(hodUnitIdFor(requester.unit_id, units), units).filter((id) => id !== requester.id);
}

/**
 * Every unit whose requests this person approves — as its head (or the head
 * above it) or as its HOD. The archive scope of an approver by appointment.
 */
export function unitsGovernedBy(profileId: string, units: Unit[]): string[] {
  return units
    .filter(
      (u) =>
        approversOf(u.id, units).includes(profileId) ||
        approversOf(hodUnitIdFor(u.id, units), units).includes(profileId)
    )
    .map((u) => u.id);
}

/** Whether this person gives HOD approval for any unit — who sees `/hod`. */
export function isHodForAny(profileId: string, units: Unit[]): boolean {
  return units.some((u) => approversOf(hodUnitIdFor(u.id, units), units).includes(profileId));
}

/**
 * Whether this person approves a club or council's requests by appointment
 * (the Faculty Advisor / secretary stage) — who sees `/approvals`.
 */
export function approvesClubsFor(profileId: string, units: Unit[]): boolean {
  return units.some(
    (u) => (u.kind === "club" || u.kind === "council") && approversOf(u.id, units).includes(profileId)
  );
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
