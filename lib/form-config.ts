import { STUDENT_RELATIONSHIPS, type GuestHouse, type Role } from "./types";

/** How a built-in field behaves on the booking form. */
export type FieldMode = "required" | "optional" | "hidden";

export type CustomFieldType = "text" | "textarea" | "number" | "date" | "select" | "checkbox";

/** An admin-defined extra field, rendered in the "Additional information" section. */
export interface CustomField {
  id: string;
  label: string;
  type: CustomFieldType;
  options: string[]; // for type "select"
  required: boolean;
}

/** Editable, per-role configuration of the unified booking form. */
export interface RoleFormConfig {
  role: Role;
  /** Guest houses this role may book. Empty / all-stale => every guest house. */
  allowed_guest_house_ids: string[];
  guest_fields: {
    name: FieldMode;
    age: FieldMode;
    gender: FieldMode;
    relationship: FieldMode;
    id_number: FieldMode;
    id_document: FieldMode;
  };
  relationship_style: "dropdown" | "free_text";
  relationship_options: string[];
  /**
   * Relationships that satisfy the dependency below, e.g. Mother / Father.
   * Empty disables the rule.
   */
  parent_relationships: string[];
  /**
   * Relationships that may only be booked when a `parent_relationships` guest
   * is on the same request — the institute rule that siblings and
   * grandparents are accommodated only alongside a parent.
   */
  dependent_relationships: string[];
  alumni_card: FieldMode;
  /** Informational banner under "Number of rooms" (null = no banner). */
  banner_text: string | null;
  custom_fields: CustomField[];
}

export const GUEST_FIELD_LABELS: Record<keyof RoleFormConfig["guest_fields"], string> = {
  name: "Guest name",
  age: "Age",
  gender: "Gender",
  relationship: "Relationship",
  id_number: "Aadhaar / ID number",
  id_document: "ID document upload",
};

const DOUBLE_PREFERENCE_BANNER = "Double shared rooms will get first preference";

/** Students may bring parents freely; these two satisfy the dependency below. */
const STUDENT_PARENT_RELATIONSHIPS = ["Mother", "Father"];
/** Accommodated only when a parent is staying too. */
const STUDENT_DEPENDENT_RELATIONSHIPS = ["Grandmother", "Grandfather", "Siblings"];

/** The spec's defaults, used until a developer saves a custom configuration. */
export function buildDefaultFormConfig(role: Role, guestHouses: GuestHouse[]): RoleFormConfig {
  const all = guestHouses.map((g) => g.id);
  const bageshriOnly = guestHouses.filter((g) => g.name === "Bageshri").map((g) => g.id);
  const base: RoleFormConfig = {
    role,
    allowed_guest_house_ids: all,
    guest_fields: {
      name: "required",
      age: "required",
      gender: "required",
      relationship: "required",
      id_number: "required",
      id_document: "required",
    },
    relationship_style: "dropdown",
    relationship_options: [...STUDENT_RELATIONSHIPS],
    parent_relationships: [],
    dependent_relationships: [],
    alumni_card: "hidden",
    banner_text: null,
    custom_fields: [],
  };
  switch (role) {
    case "student":
      return {
        ...base,
        allowed_guest_house_ids: bageshriOnly.length > 0 ? bageshriOnly : all,
        parent_relationships: [...STUDENT_PARENT_RELATIONSHIPS],
        dependent_relationships: [...STUDENT_DEPENDENT_RELATIONSHIPS],
        banner_text: DOUBLE_PREFERENCE_BANNER,
      };
    case "employee":
      return { ...base, relationship_style: "free_text" };
    case "club":
      return {
        ...base,
        guest_fields: {
          ...base.guest_fields,
          relationship: "hidden",
          id_number: "optional",
          id_document: "optional",
        },
      };
    case "alumni":
      return { ...base, alumni_card: "required" };
    // The two IAR accounts book for guests they are hosting, not for relatives,
    // so the relationship field means nothing here. The Alumni ID card is not
    // set on the config: it is required exactly when the *request* is on behalf
    // of an alumnus, which is a per-booking choice — see `needsAlumniDetails`.
    case "iar_cell":
    case "iar_student_cell":
      return {
        ...base,
        guest_fields: {
          ...base.guest_fields,
          relationship: "hidden",
          id_number: "optional",
          id_document: "optional",
        },
        relationship_style: "free_text",
      };
    case "official":
      return {
        ...base,
        guest_fields: {
          name: "optional",
          age: "optional",
          gender: "required",
          relationship: "hidden",
          id_number: "optional",
          id_document: "optional",
        },
        relationship_style: "free_text",
      };
    default:
      return base;
  }
}

/**
 * Drop references to deleted guest houses (falling back to "all" if none
 * remain) and keep the relationship dependency consistent with the options
 * actually offered.
 */
export function sanitizeFormConfig(
  config: RoleFormConfig,
  guestHouses: GuestHouse[]
): RoleFormConfig {
  const existing = new Set(guestHouses.map((g) => g.id));
  const ids = config.allowed_guest_house_ids.filter((id) => existing.has(id));

  // Rows saved before the dependency rule existed have no arrays at all; fall
  // back to the role's spec defaults so the rule is not silently lost.
  const defaults = buildDefaultFormConfig(config.role, guestHouses);
  const offered = new Set(config.relationship_options);
  const parents = (config.parent_relationships ?? defaults.parent_relationships).filter((r) =>
    offered.has(r)
  );
  // A dependency nobody can satisfy would make those options unselectable, so
  // the rule lapses if every parent option has been renamed or removed.
  const dependents =
    parents.length === 0
      ? []
      : (config.dependent_relationships ?? defaults.dependent_relationships).filter(
          (r) => offered.has(r) && !parents.includes(r)
        );

  return {
    ...config,
    allowed_guest_house_ids: ids.length > 0 ? ids : guestHouses.map((g) => g.id),
    parent_relationships: dependents.length === 0 ? [] : parents,
    dependent_relationships: dependents,
  };
}

/** Join words as "a, b and c" / "a or b". */
function formatList(items: string[], conjunction: "and" | "or"): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} ${conjunction} ${items[items.length - 1]}`;
}

/**
 * The parent-dependency rule: a relationship in `dependent_relationships` may
 * only appear when some guest on the same request has one from
 * `parent_relationships`. Returns the error message, or null when the request
 * is acceptable. Shared by the booking form and the server-side schema.
 */
export function parentDependencyError(
  config: RoleFormConfig,
  relationships: (string | null | undefined)[]
): string | null {
  const { parent_relationships: parents, dependent_relationships: dependents } = config;
  if (parents.length === 0 || dependents.length === 0) return null;

  const chosen = relationships.map((r) => r?.trim()).filter((r): r is string => Boolean(r));
  if (!chosen.some((r) => dependents.includes(r))) return null;
  if (chosen.some((r) => parents.includes(r))) return null;

  return `${formatList(dependents, "and")} can only be accommodated when ${formatList(
    parents,
    "or"
  )} is also staying`;
}

/** Whether the request already carries a guest who unlocks the dependent options. */
export function hasQualifyingParent(
  config: RoleFormConfig,
  relationships: (string | null | undefined)[]
): boolean {
  return relationships.some((r) => r && config.parent_relationships.includes(r.trim()));
}

/** One-line description of the rule for form hints. Null when the rule is off. */
export function parentDependencyHint(config: RoleFormConfig): string | null {
  const { parent_relationships: parents, dependent_relationships: dependents } = config;
  if (parents.length === 0 || dependents.length === 0) return null;
  return `${formatList(dependents, "and")} become selectable once a guest on this request is marked ${formatList(
    parents,
    "or"
  )}.`;
}

/**
 * Validate one custom field's raw form value.
 * Returns [error message | null, normalized value | undefined when empty].
 */
export function validateCustomValue(
  field: CustomField,
  raw: unknown
): [string | null, string | number | boolean | undefined] {
  if (field.type === "checkbox") {
    return [null, Boolean(raw)];
  }
  const text = typeof raw === "string" ? raw.trim() : "";
  if (text === "") {
    return field.required ? [`${field.label} is required`, undefined] : [null, undefined];
  }
  if (field.type === "number") {
    const n = Number(text);
    if (!Number.isFinite(n)) return [`${field.label} must be a number`, undefined];
    return [null, n];
  }
  if (field.type === "select" && !field.options.includes(text)) {
    return [`Choose a valid option for ${field.label}`, undefined];
  }
  return [null, text];
}
