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
    alumni_card: "hidden",
    banner_text: null,
    custom_fields: [],
  };
  switch (role) {
    case "student":
      return {
        ...base,
        allowed_guest_house_ids: bageshriOnly.length > 0 ? bageshriOnly : all,
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

/** Drop references to deleted guest houses; fall back to "all" if none remain. */
export function sanitizeFormConfig(
  config: RoleFormConfig,
  guestHouses: GuestHouse[]
): RoleFormConfig {
  const existing = new Set(guestHouses.map((g) => g.id));
  const ids = config.allowed_guest_house_ids.filter((id) => existing.has(id));
  return {
    ...config,
    allowed_guest_house_ids: ids.length > 0 ? ids : guestHouses.map((g) => g.id),
  };
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
