import { z } from "zod";
import { format } from "date-fns";
import { parentDependencyError, type FieldMode, type RoleFormConfig } from "./form-config";
import { countBedGuests, INFANT_AGE_LIMIT, requestedRoomsError } from "./occupancy";
import { latestCheckIn } from "./workflow";

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
    // An infant's ID is waived here rather than in the form config, because it
    // is a fact about the guest, not about the role's form. The per-guest
    // checks below re-apply the config's requirement to everyone else.
    id_number: optionalTrimmed,
    is_infant: z.boolean().optional().transform((v) => v ?? false),
  });
}

const DATETIME_LOCAL = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

/**
 * A whole-number count that the requester types.
 *
 * Accepts a string (from the form) or a number (the server re-parses the
 * schema's own output, which is already numeric). An empty box reports
 * `requiredMessage` rather than silently coercing to 0 — `z.coerce.number()`
 * turns "" into 0, which surfaced as "At least 1 room" when the real problem
 * was that the field was blank.
 */
function countField(opts: {
  required: string;
  min: number;
  max: number;
  whole: string;
  tooFew: string;
  tooMany: string;
  emptyAs?: number;
}) {
  // `.optional()` so an absent key reaches the transform as `undefined` and is
  // treated as a blank box — for infants that means 0, for rooms it means the
  // "required" message, rather than zod's "expected nonoptional".
  return z
    .union([z.string(), z.number()])
    .optional()
    .transform((value, ctx) => {
      const raw = typeof value === "number" ? value : (value ?? "").trim();
      if (raw === "") {
        if (opts.emptyAs !== undefined) return opts.emptyAs;
        ctx.addIssue({ code: "custom", message: opts.required });
        return z.NEVER;
      }
      const n = Number(raw);
      if (!Number.isInteger(n)) {
        ctx.addIssue({ code: "custom", message: opts.whole });
        return z.NEVER;
      }
      if (n < opts.min) {
        ctx.addIssue({ code: "custom", message: opts.tooFew });
        return z.NEVER;
      }
      if (n > opts.max) {
        ctx.addIssue({ code: "custom", message: opts.tooMany });
        return z.NEVER;
      }
      return n;
    });
}

export function bookingPayloadSchema(config: RoleFormConfig) {
  return z
    .object({
      guest_house_id: z.string().min(1, "Select a guest house"),
      purpose_of_visit: z.string().trim().min(5, "Describe the purpose of the visit"),
      check_in: z.string().regex(DATETIME_LOCAL, "Check-in date & time is required"),
      check_out: z.string().regex(DATETIME_LOCAL, "Check-out date & time is required"),
      rooms_requested: countField({
        required: "Number of rooms is required",
        min: 1,
        max: 10,
        whole: "Enter a whole number of rooms",
        tooFew: "At least 1 room",
        tooMany: "Maximum 10 rooms per request",
      }),
      guests: z.array(guestSchema(config)).min(1, "Add at least one guest"),
      custom: z.record(z.string(), z.union([z.string(), z.boolean()])).optional(),
    })
    .superRefine((v, ctx) => {
      // Only guests who need a bed count against the rooms.
      const message = requestedRoomsError(countBedGuests(v.guests), v.rooms_requested);
      if (message) {
        ctx.addIssue({ code: "custom", message, path: ["rooms_requested"] });
      }
    })
    .superRefine((v, ctx) => {
      const idRequired = config.guest_fields.id_number === "required";
      v.guests.forEach((g, i) => {
        if (g.is_infant) {
          // An infant is still a person on the register: name and age stay
          // required, and the age has to actually be an infant's.
          if (g.age == null) {
            ctx.addIssue({
              code: "custom",
              message: `Enter the infant's age (under ${INFANT_AGE_LIMIT})`,
              path: ["guests", i, "age"],
            });
          } else if (g.age >= INFANT_AGE_LIMIT) {
            ctx.addIssue({
              code: "custom",
              message: `An infant must be under ${INFANT_AGE_LIMIT} — untick the box for an older guest`,
              path: ["guests", i, "age"],
            });
          }
          return; // ID is waived.
        }
        if (idRequired && (g.id_number ?? "").length < 4) {
          ctx.addIssue({
            code: "custom",
            message: "Aadhaar / ID number is required",
            path: ["guests", i, "id_number"],
          });
        }
      });
    })
    .superRefine((v, ctx) => {
      if (countBedGuests(v.guests) === 0) {
        ctx.addIssue({
          code: "custom",
          message: "An infant cannot stay alone — add the adult they are travelling with",
          path: ["guests"],
        });
      }
    })
    .refine((v) => new Date(v.check_out) > new Date(v.check_in), {
      message: "Check-out must be after check-in",
      path: ["check_out"],
    })
    .refine((v) => new Date(v.check_in) > new Date(), {
      message: "Check-in must be in the future",
      path: ["check_in"],
    })
    .refine(
      (v) => {
        const limit = latestCheckIn(config.role);
        return !limit || new Date(v.check_in) <= limit;
      },
      {
        message: advanceWindowMessage(config.role),
        path: ["check_in"],
      }
    )
    .superRefine((v, ctx) => {
      const message = parentDependencyError(
        config,
        v.guests.map((g) => g.relationship)
      );
      if (!message) return;
      // Attach the error to every guest that triggered it, so the form
      // highlights the rows the requester has to change.
      v.guests.forEach((g, i) => {
        if (g.relationship && config.dependent_relationships.includes(g.relationship)) {
          ctx.addIssue({ code: "custom", message, path: ["guests", i, "relationship"] });
        }
      });
    });
}

/** Wording for the advance-booking limit, with the actual last bookable date. */
export function advanceWindowMessage(role: RoleFormConfig["role"]): string {
  const limit = latestCheckIn(role);
  if (!limit) return "";
  return `Bookings open one month in advance — the latest check-in you can request is ${format(
    limit,
    "d MMM yyyy"
  )}`;
}

export type BookingPayload = z.infer<ReturnType<typeof bookingPayloadSchema>>;
