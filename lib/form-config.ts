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
  /**
   * Relationships a requester has exactly one of, so they may appear **once**
   * on a request — Mother, Father, Guardian, Grandmother, Grandfather. Empty
   * disables the rule. "Siblings" is deliberately not one of them: a student
   * can have several.
   */
  unique_relationships: string[];
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

/**
 * Students may bring parents freely; these satisfy the dependency below.
 *
 * **Guardian is one of them.** The institute's own record carries a guardian
 * where both parents' names are missing (`lib/academic/fields.ts`), and a
 * student in that position — or one whose parents live abroad — could
 * otherwise never bring a sibling or a grandparent at all, because the rule
 * would be waiting for a parent who cannot come.
 */
const STUDENT_PARENT_RELATIONSHIPS = ["Mother", "Father", "Guardian"];
/** Accommodated only when a parent is staying too. */
const STUDENT_DEPENDENT_RELATIONSHIPS = ["Grandmother", "Grandfather", "Siblings"];
/**
 * Relationships nobody has two of (23 Sep 2026).
 *
 * A student was able to add "Mother" twice — two different people, both
 * described as the requester's mother — and the desk had no way to tell which
 * of the two names was right. Everything on the list below is singular by
 * definition; **Siblings is not**, because a student may well bring two.
 */
const STUDENT_UNIQUE_RELATIONSHIPS = [
  "Mother",
  "Father",
  "Guardian",
  "Grandmother",
  "Grandfather",
];

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
    unique_relationships: [],
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
        unique_relationships: [...STUDENT_UNIQUE_RELATIONSHIPS],
        banner_text: DOUBLE_PREFERENCE_BANNER,
      };
    // Faculty and staff (24 Sep 2026): **name and gender are the only
    // mandatory guest details**; everything else is optional. The requester
    // is a member of the institute, identifiable from their own account.
    // There is still no ID upload for their guests — the office asked for it
    // to go (23 Sep) — and an Aadhaar number typed is still validated.
    case "employee":
      return {
        ...base,
        relationship_style: "free_text",
        guest_fields: {
          name: "required",
          age: "optional",
          gender: "required",
          relationship: "optional",
          id_number: "optional",
          id_document: "hidden",
        },
      };
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
    // An official booking needs only the guest's gender (24 Sep 2026) — the
    // desk allocates rooms by it. A dignitary's name, age and ID are asked
    // for but never demanded.
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

  // Same treatment for the "one of each" list: backfilled from the spec
  // defaults for a row saved before the rule, and narrowed to the options the
  // form actually offers, so a renamed option cannot make the rule fire on a
  // value nobody can pick. A free-text relationship field is exempt — there is
  // no option list to be unique within, and "Mother " and "mother" would be
  // two different answers.
  const unique =
    config.relationship_style === "dropdown"
      ? (config.unique_relationships ?? defaults.unique_relationships).filter((r) =>
          offered.has(r)
        )
      : [];

  return {
    ...config,
    unique_relationships: unique,
    allowed_guest_house_ids: ids.length > 0 ? ids : guestHouses.map((g) => g.id),
    guest_fields: {
      ...config.guest_fields,
      // Age may be required or optional, never hidden. A guest below
      // `INFANT_AGE_LIMIT` is an infant, and the per-room limit counts guests
      // and infants separately, so the box must always be there for an
      // infant's age. Where it is optional (faculty, staff and official
      // forms since 24 Sep 2026) a guest left without one is an adult. A
      // stored "hidden" — from before this rule — reads as required, as it
      // always has.
      age: config.guest_fields.age === "optional" ? "optional" : "required",
    },
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

/**
 * The one-of-each rule: a relationship in `unique_relationships` may appear at
 * most once on a request. Returns the error message, or null when the request
 * is acceptable. Shared by the booking form and the server-side schema, the
 * same way `parentDependencyError` is.
 *
 * The rule spans the whole booking, not a room card: a mother in Room 1 and a
 * second mother in Room 2 is still two mothers.
 */
export function duplicateRelationshipError(
  config: RoleFormConfig,
  relationships: (string | null | undefined)[]
): string | null {
  const repeated = duplicateRelationships(config, relationships);
  if (repeated.length === 0) return null;
  return `${formatList(repeated, "and")} can only be entered once on a request${
    repeated.length === 1 ? "" : " each"
  } — change the extra ${repeated.length === 1 ? "one" : "ones"} to the guest's actual relationship.`;
}

/** Which unique relationships appear more than once, in the order they are configured. */
export function duplicateRelationships(
  config: RoleFormConfig,
  relationships: (string | null | undefined)[]
): string[] {
  const unique = config.unique_relationships;
  if (unique.length === 0) return [];
  const counts = new Map<string, number>();
  for (const raw of relationships) {
    const value = raw?.trim();
    if (!value || !unique.includes(value)) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return unique.filter((r) => (counts.get(r) ?? 0) > 1);
}

/**
 * The unique relationships already spoken for somewhere on the request.
 *
 * The form greys these out on every *other* guest — a guest never has its own
 * answer taken away from it — so the second Mother cannot be picked at all,
 * rather than being rejected after the whole form is filled in.
 */
export function usedUniqueRelationships(
  config: RoleFormConfig,
  relationships: (string | null | undefined)[]
): string[] {
  if (config.unique_relationships.length === 0) return [];
  return config.unique_relationships.filter((option) =>
    relationships.some((r) => r?.trim() === option)
  );
}

/** One-line description of the rule for form hints. Null when the rule is off. */
export function uniqueRelationshipHint(config: RoleFormConfig): string | null {
  if (config.unique_relationships.length === 0) return null;
  return `${formatList(config.unique_relationships, "and")} can each be entered only once — there is only one of each.`;
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
