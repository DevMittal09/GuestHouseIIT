import { z } from "zod";
import type { FieldMode, RoleFormConfig } from "./form-config";

const optionalTrimmed = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() ? v.trim() : null));

function textField(mode: FieldMode, requiredMessage: string, min = 2) {
  return mode === "required" ? z.string().trim().min(min, requiredMessage) : optionalTrimmed;
}

function guestSchema(config: RoleFormConfig) {
  const f = config.guest_fields;
  return z.object({
    name: textField(f.name, "Guest name is required"),
    age:
      f.age === "required"
        ? z.coerce
            .number({ message: "Age is required" })
            .int("Age must be a whole number")
            .min(1, "Age must be at least 1")
            .max(120, "Enter a valid age")
        : z.coerce.number().int().min(1).max(120).optional().nullable(),
    gender:
      f.gender === "required"
        ? z.enum(["male", "female", "other"], { message: "Gender is required" })
        : z.enum(["male", "female", "other"]).optional(),
    relationship:
      f.relationship === "required" && config.relationship_style === "dropdown"
        ? z
            .string({ message: "Select a relationship" })
            .refine((v) => config.relationship_options.includes(v), "Select a relationship")
        : textField(f.relationship, "Relationship is required"),
    id_number: textField(f.id_number, "Aadhaar / ID number is required", 4),
  });
}

const DATETIME_LOCAL = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

export function bookingPayloadSchema(config: RoleFormConfig) {
  return z
    .object({
      guest_house_id: z.string().min(1, "Select a guest house"),
      purpose_of_visit: z.string().trim().min(5, "Describe the purpose of the visit"),
      check_in: z.string().regex(DATETIME_LOCAL, "Check-in date & time is required"),
      check_out: z.string().regex(DATETIME_LOCAL, "Check-out date & time is required"),
      rooms_requested: z.coerce
        .number({ message: "Number of rooms is required" })
        .int()
        .min(1, "At least 1 room")
        .max(10, "Maximum 10 rooms per request"),
      guests: z.array(guestSchema(config)).min(1, "Add at least one guest"),
      custom: z.record(z.string(), z.union([z.string(), z.boolean()])).optional(),
    })
    .refine((v) => new Date(v.check_out) > new Date(v.check_in), {
      message: "Check-out must be after check-in",
      path: ["check_out"],
    })
    .refine((v) => new Date(v.check_in) > new Date(), {
      message: "Check-in must be in the future",
      path: ["check_in"],
    });
}

export type BookingPayload = z.infer<ReturnType<typeof bookingPayloadSchema>>;
