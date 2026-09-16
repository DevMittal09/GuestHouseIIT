import { z } from "zod";
import { bookingTypeError, needsAlumniDetails } from "./booking-types";
import { parentDependencyError, type FieldMode, type RoleFormConfig } from "./form-config";
import { MAX_MEAL_DAYS, mealPlanError, normalizeMeals } from "./meals";
import { requestedRoomsError } from "./occupancy";
import { formatInstituteDate, formatInstituteDateTime, instituteDate } from "./tz";
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
    // Optional here; the per-guest check below applies the role's requirement,
    // so the message lands on the right row.
    id_number: optionalTrimmed,
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
  // treated as a blank box — `emptyAs` when given, otherwise the "required"
  // message, rather than zod's "expected nonoptional".
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
      // Why the stay is booked. Whether this role may pick it at all is
      // checked below, so a crafted request cannot book privately on an
      // account that only books officially.
      booking_type: z.enum(["official", "personal", "alumni"], {
        message: "Choose whether this is an official or a personal booking",
      }),
      // Only meaningful on an alumni booking; the refinement below requires
      // them there and rejects them everywhere else.
      alumni_name: optionalTrimmed,
      alumni_roll_number: optionalTrimmed,
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
      // One switch for the whole booking, however many infants are coming.
      // They share a guardian's bed, so they are neither guest rows nor counted.
      has_infant: z
        .boolean()
        .optional()
        .transform((v) => v === true),
      // Meals are optional and chosen per day of the stay; "no meals" is a
      // valid, common answer. Normalised to a clean plan (days with a meal,
      // in date order); whether each day and meal fits the stay is checked
      // below, and whether the guest house serves meals is checked in
      // `createBooking`, which knows the guest house.
      meals: z
        .array(
          z.object({
            date: z.string(),
            breakfast: z.boolean().optional(),
            lunch: z.boolean().optional(),
            dinner: z.boolean().optional(),
          })
        )
        .max(MAX_MEAL_DAYS, "Too many days of meals for one booking")
        .optional()
        .transform((v) => normalizeMeals(v ?? [])),
      custom: z.record(z.string(), z.union([z.string(), z.boolean()])).optional(),
    })
    .superRefine((v, ctx) => {
      const message = bookingTypeError(config.role, v.booking_type);
      if (message) ctx.addIssue({ code: "custom", message, path: ["booking_type"] });
    })
    .superRefine((v, ctx) => {
      // An alumnus cannot log in to speak for themselves, so the request
      // raised for them has to carry enough for the IAR Office to verify who
      // it is actually for. Everything else must *not* carry these, so a
      // stale value cannot ride along on a form that never asked.
      if (!needsAlumniDetails(v.booking_type)) {
        if (v.alumni_name || v.alumni_roll_number) {
          ctx.addIssue({
            code: "custom",
            message: "Alumni details belong only on a booking made for an alumnus",
            path: ["alumni_name"],
          });
        }
        return;
      }
      if (!v.alumni_name) {
        ctx.addIssue({ code: "custom", message: "Enter the alumnus's full name", path: ["alumni_name"] });
      }
      if (!v.alumni_roll_number) {
        ctx.addIssue({
          code: "custom",
          message: "Enter the alumnus's student / roll number",
          path: ["alumni_roll_number"],
        });
      }
    })
    .superRefine((v, ctx) => {
      // Every guest row on a new request needs a bed — infants are the
      // `has_infant` switch, not rows — so the row count is the bed count.
      // (Stored bookings can still hold legacy infant rows; count those with
      // `countBedGuests`.)
      const message = requestedRoomsError(v.guests.length, v.rooms_requested);
      if (message) {
        ctx.addIssue({ code: "custom", message, path: ["rooms_requested"] });
      }
    })
    .superRefine((v, ctx) => {
      if (config.guest_fields.id_number !== "required") return;
      v.guests.forEach((g, i) => {
        if ((g.id_number ?? "").length < 4) {
          ctx.addIssue({
            code: "custom",
            message: "Aadhaar / ID number is required",
            path: ["guests", i, "id_number"],
          });
        }
      });
    })
    // `check_in` / `check_out` are wall-clock strings, so they are resolved in
    // the institute's timezone — never the runtime's. See `lib/tz.ts`.
    .superRefine((v, ctx) => {
      const message = checkOutOrderError(v.check_in, v.check_out);
      if (message) ctx.addIssue({ code: "custom", message, path: ["check_out"] });
    })
    .superRefine((v, ctx) => {
      // Only once the dates are sound, so a mis-set AM/PM is not reported a
      // second time as meals "outside your stay".
      if (v.meals.length === 0 || checkOutOrderError(v.check_in, v.check_out)) return;
      const message = mealPlanError(
        v.meals,
        instituteDate(v.check_in),
        instituteDate(v.check_out)
      );
      if (message) ctx.addIssue({ code: "custom", message, path: ["meals"] });
    })
    .refine((v) => instituteDate(v.check_in) > new Date(), {
      message: "Check-in must be in the future",
      path: ["check_in"],
    })
    .refine(
      (v) => {
        const limit = latestCheckIn(config.role);
        return !limit || instituteDate(v.check_in) <= limit;
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

/**
 * Why check-out is not after check-in, spelled out — or null when it is fine.
 *
 * The bare "Check-out must be after check-in" was a tautology to anyone who had
 * just entered what they believed were valid times, and it hid a real trap: the
 * AM/PM dropdown keeps its previous value when only the hour is changed, and
 * the two fields default to opposite periods (check-in 12:00 is PM, check-out
 * 10:00 is AM). A user asking for 9 AM → 10 PM by touching only the hour
 * dropdowns actually submitted 9 PM → 10 AM. So the message names both times as
 * the system read them, and points at the periods when that is what went wrong.
 *
 * Shared by the schema and the booking form's live stay summary, so the two
 * cannot describe the same problem differently.
 */
export function checkOutOrderError(checkIn: string, checkOut: string): string | null {
  const inAt = instituteDate(checkIn);
  const outAt = instituteDate(checkOut);
  if (Number.isNaN(inAt.getTime()) || Number.isNaN(outAt.getTime())) return null;
  if (outAt > inAt) return null;

  const reading = `You have asked to check in on ${formatInstituteDateTime(
    inAt
  )} and check out on ${formatInstituteDateTime(outAt)}`;

  if (outAt.getTime() === inAt.getTime()) {
    return `${reading} — the same moment. A stay needs to end after it starts.`;
  }
  // Same calendar day: the periods are the usual culprit, because only the
  // times can be out of order.
  if (checkIn.slice(0, 10) === checkOut.slice(0, 10)) {
    return `${reading}, which is earlier the same day. Check the AM/PM dropdown on each time — they do not change on their own when you pick a new hour.`;
  }
  return `${reading}. Check-out has to be after check-in.`;
}

/** Wording for the advance-booking limit, with the actual last bookable date. */
export function advanceWindowMessage(role: RoleFormConfig["role"]): string {
  const limit = latestCheckIn(role);
  if (!limit) return "";
  return `Bookings open one month in advance — the latest check-in you can request is ${formatInstituteDate(
    limit
  )}`;
}

export type BookingPayload = z.infer<ReturnType<typeof bookingPayloadSchema>>;
