import { z } from "zod";
import {
  bookingTypeError,
  needsAlumniDetails,
  serviceTypeError,
} from "./booking-types";
import { isCountryCode } from "./countries";
import { parentDependencyError, type FieldMode, type RoleFormConfig } from "./form-config";
import { MAX_MEAL_DAYS, mealPlanError, normalizeMeals } from "./meals";
import {
  INFANT_AGE_LIMIT,
  isInfantAge,
  MAX_GUESTS_PER_ROOM,
  roomPartyError,
} from "./occupancy";
import { PETS_POLICY_ACKNOWLEDGEMENT, stayLengthError } from "./policy";
import { formatInstituteDate, formatInstituteDateTime, instituteDate } from "./tz";
import { includesMeals, needsRooms } from "./types";
import { latestCheckIn } from "./workflow";

/**
 * An optional free-text field: trimmed, with blank becoming null.
 *
 * **`.nullish()`, not `.optional()`, because this schema has to accept its own
 * output.** The booking form validates on the client and then sends
 * `parsed.data` over the wire (`components/booking-form.tsx`), and
 * `createBooking` re-parses that with the same schema. So the `null` this
 * transform produces arrives back as *input* on the second pass.
 *
 * With `.optional()` it did not, and **no booking could be submitted by any
 * role**: the server rejected every one with zod's default
 * "Invalid input: expected string, received null". It was invisible from the
 * form, because the failing paths were `alumni_name` / `alumni_roll_number` —
 * fields a student's form never shows — so the requester got an error naming
 * nothing they could see or change.
 *
 * Accepting null does not weaken anything: the refinements below test these
 * with `!v.alumni_name` and `(g.id_number ?? "").length`, both of which treat
 * null as absent. `countField` is round-trip safe for the same reason; keep any
 * new transform that way too.
 */
const optionalTrimmed = z
  .string()
  .nullish()
  .transform((v) => (v && v.trim() ? v.trim() : null));

function textField(mode: FieldMode, requiredMessage: string, min = 2) {
  return mode === "required" ? z.string().trim().min(min, requiredMessage) : optionalTrimmed;
}

/**
 * A passport number: trimmed, upper-cased and checked for shape rather than
 * for any one country's format. Passport numbering differs by issuer, so a
 * strict pattern would reject real documents; this only rules out the entries
 * that are obviously not a passport number at all.
 */
const passportField = z
  .string()
  .nullish()
  .transform((v) => (v ? v.trim().toUpperCase() : null));

function guestSchema(config: RoleFormConfig) {
  const f = config.guest_fields;
  return z.object({
    name: textField(f.name, "Guest name is required"),
    // Always required, whatever the role's form configuration says: an infant
    // is defined by their age, and the per-room occupancy rule counts guests
    // and infants separately. Without an age neither can be decided.
    // `sanitizeFormConfig` pins the field to "required" for the same reason.
    age: z.coerce
      .number({ message: "Age is required" })
      .int("Age must be a whole number")
      .min(0, "Age must be 0 or more")
      .max(120, "Enter a valid age"),
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
    // Asked per guest rather than once per booking: a room can hold an Indian
    // host and a foreign collaborator, and the guest house's register needs
    // the passport of whichever of them is a foreign national.
    citizenship: z.enum(["indian", "other"], { message: "Select the guest's citizenship" }),
    nationality: optionalTrimmed,
    passport_number: passportField,
  });
}

/** One room card: a room's worth of guests, with the party rule applied to it. */
function roomSchema(config: RoleFormConfig) {
  return z.object({
    room_type: z.enum(["single", "double_sharing"]).nullish().default(null),
    guests: z.array(guestSchema(config)).min(1, "Add at least one guest to this room"),
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
      // The schema has to accept its own output — the form parses, sends
      // `parsed.data`, and the server parses that again. A blank box becomes
      // `emptyAs`, which comes back as a *number* on the second pass and would
      // otherwise fail the range check below. That is not hypothetical: it
      // made every room booking fail server-side with "At least 1 guest" on a
      // field the requester was never shown.
      if (opts.emptyAs !== undefined && n === opts.emptyAs) return n;
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

/** Context the rules need that is not part of the submission itself. */
export interface BookingSchemaContext {
  /** Whether any guest house this role may book serves meals at all. */
  mealsAvailable: boolean;
  /** The requester's address, for the duration exemptions in `lib/policy.ts`. */
  requesterEmail?: string | null;
}

export function bookingPayloadSchema(
  config: RoleFormConfig,
  context: BookingSchemaContext = { mealsAvailable: true }
) {
  return z
    .object({
      guest_house_id: z.string().min(1, "Select a guest house"),
      // What is being booked. Checked against the role below, so a crafted
      // request cannot book meals without a room on an account barred from it.
      service_type: z.enum(["room", "room_meals", "meals_only"], {
        message: "Choose what you would like to book",
      }),
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
      /**
       * The room cards, each holding its own guests. There is no separate
       * "number of guests" any more: the rooms *are* the answer, and a count
       * kept beside them could disagree with them.
       */
      rooms: z.array(roomSchema(config)).max(10, "Maximum 10 rooms per request"),
      /** Head count for a meals-only booking, which has no guest rows. */
      meal_guest_count: countField({
        required: "Number of guests is required",
        min: 1,
        max: 100,
        whole: "Enter a whole number of guests",
        tooFew: "At least 1 guest",
        tooMany: "Maximum 100 guests for a meals booking",
        emptyAs: 0,
      }),
      meal_preference: z.enum(["veg", "non_veg"]).nullish().default(null),
      // Meals are chosen per day of the stay. Normalised to a clean plan (days
      // with a meal, in date order); whether each day and meal fits the stay is
      // checked below, and whether the guest house serves meals is checked in
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
      // Not a formality: the guest house has no kennels and no way to isolate
      // an animal, so a guest arriving with one has to be turned away at the
      // desk. Asking here is the only chance to prevent that.
      pets_policy_acknowledged: z
        .boolean()
        .optional()
        .transform((v) => v === true),
      custom: z.record(z.string(), z.union([z.string(), z.boolean()])).optional(),
    })
    .superRefine((v, ctx) => {
      const message = serviceTypeError(config.role, v.service_type, context.mealsAvailable);
      if (message) ctx.addIssue({ code: "custom", message, path: ["service_type"] });
    })
    .superRefine((v, ctx) => {
      const message = bookingTypeError(config.role, v.booking_type);
      if (message) ctx.addIssue({ code: "custom", message, path: ["booking_type"] });
    })
    .superRefine((v, ctx) => {
      if (v.pets_policy_acknowledged) return;
      ctx.addIssue({
        code: "custom",
        message: `Please confirm: “${PETS_POLICY_ACKNOWLEDGEMENT}”`,
        path: ["pets_policy_acknowledged"],
      });
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
    // ------------------------------------------------------------- rooms
    .superRefine((v, ctx) => {
      if (!needsRooms(v.service_type)) {
        // A meals-only booking has no rooms and no guest rows — the kitchen
        // needs a head count, not a register.
        if (v.rooms.length > 0) {
          ctx.addIssue({
            code: "custom",
            message: "A meals-only booking does not include a room",
            path: ["rooms"],
          });
        }
        if (v.meal_guest_count < 1) {
          ctx.addIssue({
            code: "custom",
            message: "Number of guests is required",
            path: ["meal_guest_count"],
          });
        }
        return;
      }
      if (v.meal_guest_count > 0) {
        ctx.addIssue({
          code: "custom",
          message: "A room booking counts its guests from the room cards",
          path: ["meal_guest_count"],
        });
      }
      if (v.rooms.length === 0) {
        ctx.addIssue({ code: "custom", message: "Add at least one room", path: ["rooms"] });
      }
    })
    .superRefine((v, ctx) => {
      // The per-room occupancy rule, applied card by card so the message lands
      // on the room that broke it. Infants are classified from the age typed
      // into the row, never asked for as a category.
      v.rooms.forEach((room, i) => {
        const infants = room.guests.filter((g) => isInfantAge(g.age)).length;
        const guests = room.guests.length - infants;
        const message = roomPartyError(guests, infants);
        if (message) {
          ctx.addIssue({ code: "custom", message, path: ["rooms", i, "guests"] });
        }
      });
    })
    .superRefine((v, ctx) => {
      // Per-guest citizenship. "Other" makes both fields mandatory; "Indian"
      // must carry neither, so a value typed before switching back cannot be
      // submitted against a guest the form no longer shows them for.
      v.rooms.forEach((room, i) => {
        room.guests.forEach((g, j) => {
          const at = (field: string) => ["rooms", i, "guests", j, field];
          if (g.citizenship === "other") {
            if (!g.nationality) {
              ctx.addIssue({
                code: "custom",
                message: "Select the guest's country of nationality",
                path: at("nationality"),
              });
            } else if (!isCountryCode(g.nationality)) {
              ctx.addIssue({
                code: "custom",
                message: "Select a country from the list",
                path: at("nationality"),
              });
            }
            if (!g.passport_number) {
              ctx.addIssue({
                code: "custom",
                message: "Passport number is required for a foreign national",
                path: at("passport_number"),
              });
            } else if (!/^[A-Z0-9]{5,20}$/.test(g.passport_number)) {
              ctx.addIssue({
                code: "custom",
                message: "Enter a valid passport number (5–20 letters and digits)",
                path: at("passport_number"),
              });
            }
            return;
          }
          if (g.nationality || g.passport_number) {
            ctx.addIssue({
              code: "custom",
              message:
                "Nationality and passport number apply only to a guest who is not an Indian citizen",
              path: at("nationality"),
            });
          }
        });
      });
    })
    .superRefine((v, ctx) => {
      if (config.guest_fields.id_number !== "required") return;
      v.rooms.forEach((room, i) => {
        room.guests.forEach((g, j) => {
          // An infant shares a guardian's bed and is not asked for an ID.
          if (isInfantAge(g.age)) return;
          // A foreign national has no Aadhaar. Their passport is the identity
          // document, and it is already mandatory above — demanding an Indian
          // ID number as well would make them impossible to book at all for
          // every role whose form requires one, which is most of them.
          if (g.citizenship === "other") return;
          if ((g.id_number ?? "").length < 4) {
            ctx.addIssue({
              code: "custom",
              message: "Aadhaar / ID number is required",
              path: ["rooms", i, "guests", j, "id_number"],
            });
          }
        });
      });
    })
    // ------------------------------------------------------------- meals
    .superRefine((v, ctx) => {
      if (!includesMeals(v.service_type)) {
        if (v.meals.length > 0 || v.meal_preference) {
          ctx.addIssue({
            code: "custom",
            message: "Choose “Room + Meals” to book meals with this stay",
            path: ["meals"],
          });
        }
        return;
      }
      if (!v.meal_preference) {
        ctx.addIssue({
          code: "custom",
          message: "Choose a vegetarian or non-vegetarian meal preference",
          path: ["meal_preference"],
        });
      }
      if (v.meals.length === 0) {
        ctx.addIssue({
          code: "custom",
          message:
            v.service_type === "meals_only"
              ? "Pick at least one meal — a meals-only booking has nothing else in it"
              : "Pick at least one meal, or change this to a room-only booking",
          path: ["meals"],
        });
      }
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
    .superRefine((v, ctx) => {
      if (checkOutOrderError(v.check_in, v.check_out)) return;
      const message = stayLengthError(
        instituteDate(v.check_in),
        instituteDate(v.check_out),
        config.role,
        context.requesterEmail
      );
      if (message) ctx.addIssue({ code: "custom", message, path: ["check_out"] });
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
      // The parent dependency applies across the whole request, not per room:
      // a sibling in Room 2 is accompanied if a parent is in Room 1.
      const all = v.rooms.flatMap((r) => r.guests);
      const message = parentDependencyError(
        config,
        all.map((g) => g.relationship)
      );
      if (!message) return;
      // Attach the error to every guest that triggered it, so the form
      // highlights the rows the requester has to change.
      v.rooms.forEach((room, i) => {
        room.guests.forEach((g, j) => {
          if (g.relationship && config.dependent_relationships.includes(g.relationship)) {
            ctx.addIssue({
              code: "custom",
              message,
              path: ["rooms", i, "guests", j, "relationship"],
            });
          }
        });
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

/** The fine print next to the infant counter, kept with the rule it explains. */
export const INFANT_HELP_TEXT = `A guest below ${INFANT_AGE_LIMIT} years is an infant: they share a guardian's bed, need no bed of their own and are not asked for an ID. A room takes up to ${MAX_GUESTS_PER_ROOM} guests plus one infant.`;

export type BookingPayload = z.infer<ReturnType<typeof bookingPayloadSchema>>;
