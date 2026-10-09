import { z } from "zod";
import {
  bookingTypeError,
  needsAlumniDetails,
  serviceTypeError,
} from "./booking-types";
import {
  asksForDebitHead,
  debitDetailsPrompt,
  debitDetailsRequired,
  debitHeadError,
  debitHeadFor,
  fundDeclarationError,
  MAX_SUBHEAD_LENGTH,
  needsProject,
  type DebitHeadsByType,
} from "./debit-heads";
import {
  isRecordedGuest,
  lockedNameError,
  NO_GUEST_NAME_RULE,
  withheldRelationshipError,
  type GuestNameRule,
} from "./academic/guest-names";
import { isOfficeRole } from "./workflow";
import { isCountryCode } from "./countries";
import {
  duplicateRelationshipError,
  duplicateRelationships,
  parentDependencyError,
  type FieldMode,
  type RoleFormConfig,
} from "./form-config";
import {
  dietCountsError,
  MAX_MEAL_DAYS,
  mealLeadTimeError,
  mealPlanError,
  normalizeDietCounts,
  normalizeMeals,
} from "./meals";
import { INFANT_AGE_LIMIT, isInfantAge, roomPartyError } from "./occupancy";
import { stayLengthError } from "./policy";
import { DEFAULT_RULES, type Rules } from "./settings";
import {
  formatInstituteDate,
  formatInstituteDateTime,
  instituteDate,
  instituteDayBounds,
  toInstituteDateValue,
} from "./tz";
import { includesMeals, needsRooms } from "./types";
import { latestCheckIn } from "./workflow";

/** The most people one booking may ask the kitchen to cook for at a sitting. */
function mealPartyLimit(rules: Rules): number {
  const limit = rules.meals.max_diners_per_meal;
  return limit > 0 ? limit : 1000;
}

/**
 * The earliest check-in a new booking may name: **midnight this morning**,
 * institute time.
 *
 * It used to be "later than now", to the second. That refused the one entry
 * the desk most often has to make - a guest who turned up late and is
 * standing at the counter, whose stay began an hour ago - and it also refused
 * a requester who picked today's 12:00 and pressed Submit at 12:01. Neither
 * is a booking for the past in any sense the rule was protecting against:
 * yesterday is still refused, and the stay-length and advance-window rules
 * are unchanged. (1 Oct 2026: "late entry check-in is not possible".)
 */
export function earliestBookableCheckIn(now: Date = new Date()): Date {
  return instituteDayBounds(toInstituteDateValue(now)).start;
}

export const LATE_CHECK_IN_ERROR =
  "Check-in cannot be before today - ask the guest house desk to record a stay that has already started";

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
 * form, because the failing paths were `alumni_name` / `alumni_roll_number` -
 * fields a student's form never shows - so the requester got an error naming
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

/**
 * A guest's age: required or optional by the role's form, never hidden
 * (`sanitizeFormConfig`) - an infant is defined by their age.
 *
 * **A blank box is null, not 0.** This was `z.coerce.number()`, which turns
 * "" into 0 - an infant - so a guest whose age nobody typed was booked as a
 * baby, and "required" never actually fired. Where the age is optional
 * (faculty, staff and official forms), a guest without one is an adult.
 * Round-trip safe: the null it produces is accepted on the server's second
 * pass, and a number passes straight through.
 */
function ageField(mode: FieldMode) {
  return z
    .union([z.string(), z.number()])
    .nullish()
    .transform((value, ctx) => {
      const raw = typeof value === "number" ? value : (value ?? "").trim();
      if (raw === "") {
        if (mode !== "required") return null;
        ctx.addIssue({ code: "custom", message: "Age is required" });
        return z.NEVER;
      }
      const n = Number(raw);
      if (!Number.isInteger(n)) {
        ctx.addIssue({ code: "custom", message: "Age must be a whole number" });
        return z.NEVER;
      }
      if (n < 0) {
        ctx.addIssue({ code: "custom", message: "Age must be 0 or more" });
        return z.NEVER;
      }
      if (n > 120) {
        ctx.addIssue({ code: "custom", message: "Enter a valid age" });
        return z.NEVER;
      }
      return n;
    });
}

/** How many extra addresses a requester may copy on one booking (migration 24). */
export const MAX_COPY_TO_EMAILS = 25;

const COPY_TO_ADDRESS = /^[^@\s]+@[^@\s.]+(\.[^@\s.]+)+$/;

/**
 * The "Copy to" list on New Booking: extra addresses copied on every mail
 * sent to the requester about the booking. Blank rows are dropped (the form
 * sends every row, so a message lands on the row that is wrong), repeats are
 * dropped ignoring case, and each address has to look like one. Round-trip
 * safe: the cleaned list re-parses to itself.
 */
const copyToField = z
  .array(z.string())
  .max(MAX_COPY_TO_EMAILS * 2, `At most ${MAX_COPY_TO_EMAILS} addresses can be copied`)
  .nullish()
  .transform((list, ctx) => {
    const out: string[] = [];
    const seen = new Set<string>();
    (list ?? []).forEach((raw, i) => {
      const address = raw.trim();
      if (!address) return;
      if (!COPY_TO_ADDRESS.test(address) || address.length > 254) {
        ctx.addIssue({ code: "custom", message: "Enter a valid email address", path: [i] });
        return;
      }
      const key = address.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      out.push(address);
    });
    if (out.length > MAX_COPY_TO_EMAILS) {
      ctx.addIssue({ code: "custom", message: `At most ${MAX_COPY_TO_EMAILS} addresses can be copied` });
    }
    return out;
  });

function guestSchema(config: RoleFormConfig) {
  const f = config.guest_fields;
  return z.object({
    name: textField(f.name, "Guest name is required"),
    age: ageField(f.age),
    gender:
      f.gender === "required"
        ? z.enum(["male", "female", "other"], { message: "Gender is required" })
        : z.enum(["male", "female", "other"]).optional(),
    // Whether it has to be one of the dropdown's options is checked per guest
    // below, not here: an **infant's** relationship is free text whatever the
    // role's style is, and a field-level refinement cannot see the age that
    // decides which this guest is.
    relationship: textField(
      f.relationship,
      config.relationship_style === "dropdown" ? "Select a relationship" : "Relationship is required"
    ),
    // Optional here; the per-guest check below applies the role's requirement,
    // so the message lands on the right row.
    id_number: optionalTrimmed,
    // Asked per guest rather than once per booking: a room can hold an Indian
    // host and a foreign collaborator, and the guest house's register needs
    // the passport of whichever of them is a foreign national.
    citizenship: z.enum(["indian", "other"], { message: "Select the guest's citizenship" }),
    nationality: optionalTrimmed,
    passport_number: passportField,
    // Entered on an infant card ("Add infant", 25 Sep 2026). The age still
    // decides who is an infant; this only makes the card's age mandatory and
    // below the limit, so an infant card cannot arrive as an adult.
    infant: z.boolean().nullish(),
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
 * `requiredMessage` rather than silently coercing to 0 - `z.coerce.number()`
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
  // treated as a blank box - `emptyAs` when given, otherwise the "required"
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
      // The schema has to accept its own output - the form parses, sends
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
  /**
   * The office's Settings (`lib/settings.ts`). The booking page reads them
   * once and hands the same object to the form, so the client and the server
   * validate against identical values. Defaults to today's rules.
   */
  rules?: Rules;
  /**
   * The debitable heads this requester may choose, per booking type, for a
   * room booking and for dining (`debitHeadsByType`, from Settings and the
   * requester's category). Computed on the server and handed to the form, so
   * both sides check against one list. Without it only "a head is chosen" is
   * checked - never the case for a real submission.
   */
  debitHeads?: { room: DebitHeadsByType; dining: DebitHeadsByType };
  /** Ids of the projects that may be picked (active ones). */
  projectIds?: string[];
  /**
   * What the requester's academic record fixes about their guests (7 Oct
   * 2026): a student's father's and mother's names, locked, and the
   * relationships the record rules out. Built on the server by
   * `guestNameRule` and handed to the form, so the two check the same thing -
   * and so a crafted payload cannot name somebody else's parent as its own.
   * Absent means no record, which locks and withholds nothing.
   */
  guestNames?: GuestNameRule;
}

export function bookingPayloadSchema(
  config: RoleFormConfig,
  context: BookingSchemaContext = { mealsAvailable: true }
) {
  const rules = context.rules ?? DEFAULT_RULES;
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
      // Who pays. Checked against the role and the kind of booking below: a
      // student's booking is always personal funds.
      debit_head: z
        .enum([
          "institute_grant",
          "professional_development_fund",
          "project_grant",
          "department_budget",
          "special_budget",
          "personal_funds",
          "alumni_fund",
          "student_fund",
          "hostel_funds",
        ])
        .nullish()
        .default(null),
      debit_details: optionalTrimmed,
      /**
       * The requester's declaration that the funds are approved and
       * available (8 Oct 2026). Required by every head but Personal Funds,
       * which is why it is a plain boolean here and checked in the debit
       * refinement below, beside the head it belongs to.
       *
       * Round-trip safe: the output is a boolean, which is a valid input.
       */
      fund_declaration: z
        .boolean()
        .optional()
        .default(false)
        .transform((v) => v === true),
      // The project for a Project head, picked from the console's list.
      project_id: z.string().nullish().default(null),
      // The project's sub-head, typed - only with a Project head.
      debit_subhead: optionalTrimmed,
      // Extra addresses copied on every mail the requester gets about this
      // booking. Checked here on both sides; stored on the booking.
      copy_to_emails: copyToField,
      // An office's choice: straight to the manager, or through its HOD.
      office_approval: z.enum(["direct", "hod"]).nullish().default(null),
      // Only meaningful on an alumni booking; the refinement below requires
      // them there and rejects them everywhere else.
      alumni_name: optionalTrimmed,
      alumni_roll_number: optionalTrimmed,
      /**
       * Why the stay is booked - **Remarks**, and optional, on a dining
       * booking (1 Oct 2026). A meal order needs no justification: the office
       * asked for the box to be there for anything the kitchen should know
       * ("one guest is coeliac") and not to stand between somebody and lunch.
       * A stay still has to say what it is for.
       */
      purpose_of_visit: z
        .string()
        .trim()
        .max(2000, "Keep the remarks under 2000 characters")
        .optional()
        .default(""),
      check_in: z.string().regex(DATETIME_LOCAL, "Check-in date & time is required"),
      check_out: z.string().regex(DATETIME_LOCAL, "Check-out date & time is required"),
      /**
       * The room cards, each holding its own guests. There is no separate
       * "number of guests" any more: the rooms *are* the answer, and a count
       * kept beside them could disagree with them.
       */
      rooms: z.array(roomSchema(config)).max(10, "Maximum 10 rooms per request"),
      /**
       * Head count for a meals-only booking, which has no guest rows. Capped
       * at the kitchen's own limit per sitting (Settings,
       * `max_diners_per_meal`), since one booking cannot be larger than the
       * most the kitchen will serve at once. How much of that sitting is
       * already taken is checked in `createBooking`, which can read the other
       * bookings.
       */
      meal_guest_count: countField({
        required: "Number of guests is required",
        min: 1,
        max: mealPartyLimit(rules),
        whole: "Enter a whole number of guests",
        tooFew: "At least 1 guest",
        tooMany: `The kitchen serves at most ${mealPartyLimit(rules)} people at a sitting`,
        emptyAs: 0,
      }),
      /** Legacy: one preference for the whole party. Still accepted, never sent by the form. */
      meal_preference: z.enum(["veg", "non_veg"]).nullish().default(null),
      /**
       * Each person's own preference, as counts (1 Oct 2026). Round-trip
       * safe: the cleaned object re-parses to itself, which the form relies
       * on - it validates and then sends `parsed.data` over the wire.
       */
      meal_diet_counts: z
        .object({
          veg: z.number().int().min(0).max(1000).optional(),
          non_veg: z.number().int().min(0).max(1000).optional(),
        })
        .nullish()
        .transform((v) => (v ? normalizeDietCounts(v) : null)),
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
      /**
        * Kept so a stored payload still parses, but nothing is required of it.
        * The no-pets rule is *told* to the requester - a prominent notice on
        * the form and a line in every booking mail - rather than signed for.
        * The office asked for the tick box to go: it was one more thing to
        * click on a form that already refuses submission for eight other
        * reasons, and a tick proves nothing a notice does not.
        */
       pets_policy_acknowledged: z
         .boolean()
         .optional()
         .transform((v) => v === true),
      /**
       * DPDP (Phase 8): the requester agrees to how the details on this form
       * are handled, and the booking records which version of the notice they
       * were shown. Unlike the pets notice this is a tick, because consent has
       * to be given, not merely displayed.
       */
      privacy_consent: z.boolean().refine((v) => v === true, {
        message: "Tick the box to confirm you have read how these details are used",
      }),
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
      /**
       * Which heads this requester may use, for this kind of booking - the
       * Settings, resolved on the server for their category.
       *
       * **A personal booking is not asked** (7 Oct 2026): nothing is
       * required of `debit_head`, and the transform at the end of this chain
       * writes Personal Funds whatever arrived. So a crafted payload naming a
       * department on a private stay is neither believed nor rejected with a
       * message about a field the requester never saw - it is overwritten.
       */
      if (!asksForDebitHead(v.booking_type)) {
        if (v.debit_details) {
          ctx.addIssue({
            code: "custom",
            message: "A personal booking is settled from personal funds and takes no details",
            path: ["debit_details"],
          });
        }
        if (v.debit_subhead || v.project_id) {
          ctx.addIssue({
            code: "custom",
            message: "A project applies only when the head is Project",
            path: v.project_id ? ["project_id"] : ["debit_subhead"],
          });
        }
        return;
      }
      const lists = context.debitHeads;
      const allowed = lists
        ? (v.service_type === "meals_only" ? lists.dining : lists.room)[v.booking_type]
        : undefined;
      const message = lists
        ? debitHeadError(allowed, v.debit_head)
        : v.debit_head
          ? null
          : "Choose the debitable head this stay is charged to";
      if (message) {
        ctx.addIssue({ code: "custom", message, path: ["debit_head"] });
        return;
      }
      /**
       * Project: **typed, not picked** (1 Oct 2026). What the booking records
       * is the number and title in `debit_details`, required just below by
       * `debitDetailsRequired`. `project_id` is no longer asked for - the
       * form does not send one - but a payload that still carries one is
       * checked against the console's list rather than silently kept, so the
       * Projects console keeps working for anything that uses it.
       */
      if (needsProject(v.debit_head)) {
        if (v.project_id && context.projectIds && !context.projectIds.includes(v.project_id)) {
          ctx.addIssue({
            code: "custom",
            message: "That project is not on the list of active projects",
            path: ["project_id"],
          });
        }
      } else if (v.project_id) {
        ctx.addIssue({
          code: "custom",
          message: "A project applies only when the head is Project",
          path: ["project_id"],
        });
      }
      // The sub-head is the project's, so it travels only with one - a value
      // typed before switching to another head must not ride along.
      if (v.debit_subhead) {
        if (!needsProject(v.debit_head)) {
          ctx.addIssue({
            code: "custom",
            message: "A sub-head applies only when the head is Project",
            path: ["debit_subhead"],
          });
        } else if (v.debit_subhead.length > MAX_SUBHEAD_LENGTH) {
          ctx.addIssue({
            code: "custom",
            message: `Keep the sub-head under ${MAX_SUBHEAD_LENGTH} characters`,
            path: ["debit_subhead"],
          });
        }
      }
      // What goes beside the head: which special fund (optional, 24 Sep
      // 2026), or the project itself (mandatory, 1 Oct 2026 - it replaced the
      // dropdown of the console's projects). A Special Funds sanction letter,
      // if any, is checked in `createBooking`, which has the upload.
      const prompt = debitDetailsPrompt(v.debit_head);
      if (prompt && debitDetailsRequired(v.debit_head) && (v.debit_details ?? "").length < 3) {
        ctx.addIssue({ code: "custom", message: `${prompt} is required`, path: ["debit_details"] });
      }
      if (prompt && (v.debit_details ?? "").length > 300) {
        ctx.addIssue({ code: "custom", message: "Keep this under 300 characters", path: ["debit_details"] });
      }
      if (!prompt && v.debit_details) {
        ctx.addIssue({
          code: "custom",
          message: "Details apply only to Special Budget and Project bookings",
          path: ["debit_details"],
        });
      }
      /**
       * Somebody else's money: the requester declares they have the approval
       * for it and that the head has the balance (8 Oct 2026). Checked here
       * rather than on the field so it reads the head that was actually
       * chosen - and so a payload that ticks it on a Personal Funds booking
       * is not refused for having been honest.
       */
      const declaration = fundDeclarationError(v.debit_head, v.fund_declaration);
      if (declaration) {
        ctx.addIssue({ code: "custom", message: declaration, path: ["fund_declaration"] });
      }
    })
    .superRefine((v, ctx) => {
      // Offices choose how their booking is approved; nobody else does.
      if (isOfficeRole(config.role) && v.service_type !== "meals_only") {
        if (!v.office_approval) {
          ctx.addIssue({
            code: "custom",
            message: "Choose Direct or Requires HOD approval",
            path: ["office_approval"],
          });
        }
      } else if (v.office_approval) {
        ctx.addIssue({
          code: "custom",
          message: "Only an office chooses how its booking is approved",
          path: ["office_approval"],
        });
      }
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
        // A meals-only booking has no rooms and no guest rows - the kitchen
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
      // An infant card's age is its whole point: required whatever the role's
      // form says about ages, and below the limit.
      v.rooms.forEach((room, i) => {
        room.guests.forEach((g, j) => {
          if (!g.infant || isInfantAge(g.age)) return;
          ctx.addIssue({
            code: "custom",
            message:
              g.age === null
                ? "Choose the infant's age"
                : `An infant is below ${INFANT_AGE_LIMIT} - add a guest instead`,
            path: ["rooms", i, "guests", j, "age"],
          });
        });
      });
    })
    .superRefine((v, ctx) => {
      // The per-room occupancy rule, applied card by card so the message lands
      // on the room that broke it. Infants are classified from the age typed
      // into the row, never asked for as a category.
      v.rooms.forEach((room, i) => {
        const infants = room.guests.filter((g) => isInfantAge(g.age)).length;
        const guests = room.guests.length - infants;
        const message = roomPartyError(guests, infants, rules.capacity);
        if (message) {
          ctx.addIssue({ code: "custom", message, path: ["rooms", i, "guests"] });
        }
      });
    })
    .superRefine((v, ctx) => {
      // The dropdown's options describe the adults a requester may bring. An
      // **infant** is typed in free text instead: the list has no "Nephew" or
      // "Cousin's daughter" on it, and a small child recorded as "Siblings"
      // just to get past the form tells the desk something untrue.
      if (config.relationship_style !== "dropdown") return;
      if (config.guest_fields.relationship === "hidden") return;
      v.rooms.forEach((room, i) => {
        room.guests.forEach((g, j) => {
          if (isInfantAge(g.age) || !g.relationship) return;
          if (!config.relationship_options.includes(g.relationship)) {
            ctx.addIssue({
              code: "custom",
              message: "Select a relationship",
              path: ["rooms", i, "guests", j, "relationship"],
            });
          }
        });
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
      /**
       * The names the academic record fixes (7 Oct 2026): a student's father
       * and mother, locked to what the institute has on file, and the
       * relationships the record rules out. The form fills the boxes in and
       * makes them read-only, so for a person these never fire; they are what
       * a crafted payload meets.
       */
      const rule = context.guestNames ?? NO_GUEST_NAME_RULE;
      if (!rule.fromRecord) return;
      v.rooms.forEach((room, i) => {
        room.guests.forEach((g, j) => {
          if (isInfantAge(g.age) || g.infant) return;
          const withheld = withheldRelationshipError(rule, g);
          if (withheld) {
            ctx.addIssue({
              code: "custom",
              message: withheld,
              path: ["rooms", i, "guests", j, "relationship"],
            });
            return;
          }
          const wrongName = lockedNameError(rule, g);
          if (wrongName) {
            ctx.addIssue({
              code: "custom",
              message: wrongName,
              path: ["rooms", i, "guests", j, "name"],
            });
          }
        });
      });
    })
    .superRefine((v, ctx) => {
      // Runs whatever the role's configuration says, because the two questions
      // are different: whether an Aadhaar number is *demanded* is per role,
      // but a number that has been typed must be a real one either way.
      const required = config.guest_fields.id_number === "required";
      const rule = context.guestNames ?? NO_GUEST_NAME_RULE;
      v.rooms.forEach((room, i) => {
        room.guests.forEach((g, j) => {
          const path = ["rooms", i, "guests", j, "id_number"];
          // An infant shares a guardian's bed and is not asked for an ID.
          if (isInfantAge(g.age)) return;
          /**
           * Nor is a guest the academic record named (7 Oct 2026). The
           * institute has already identified this person; asking the student
           * for a document as well is asking them to prove what the record
           * says. A sibling or a grandparent, typed by hand, is still asked -
           * which is why this is keyed on the relationship being locked
           * rather than on the role.
           */
          if (isRecordedGuest(rule, g)) return;
          // A foreign national has no Aadhaar. Their passport is the identity
          // document, and it is already mandatory above - demanding an Indian
          // ID number as well would make them impossible to book at all for
          // every role whose form requires one, which is most of them.
          if (g.citizenship === "other") return;
          const typed = g.id_number ?? "";
          if (!typed) {
            if (required) {
              ctx.addIssue({ code: "custom", message: "Aadhaar number is required", path });
            }
            return;
          }
          if (!isAadhaarNumber(typed)) {
            ctx.addIssue({ code: "custom", message: AADHAAR_FORMAT_ERROR, path });
          }
        });
      });
    })
    // ------------------------------------------------------------- meals
    .superRefine((v, ctx) => {
      if (!includesMeals(v.service_type)) {
        if (v.meals.length > 0 || v.meal_preference || v.meal_diet_counts) {
          ctx.addIssue({
            code: "custom",
            message: "Choose “Room + Meals” to book meals with this stay",
            path: ["meals"],
          });
        }
        return;
      }
      // Each person's own preference (1 Oct 2026). The head count is the
      // dining booking's own figure, or the guests needing a bed on a stay -
      // infants eat off a guardian's plate and are not counted by the kitchen.
      const headCount = needsRooms(v.service_type)
        ? v.rooms.flatMap((r) => r.guests).filter((g) => !g.infant && !isInfantAge(g.age)).length
        : v.meal_guest_count;
      const split = v.meal_diet_counts;
      if (!split) {
        // A payload from before the split existed is still accepted when it
        // carries the old whole-party answer; anything else has to say.
        if (!v.meal_preference) {
          ctx.addIssue({
            code: "custom",
            message: "Say how many of the party are vegetarian and how many are not",
            path: ["meal_diet_counts"],
          });
        }
      } else if (headCount > 0) {
        const message = dietCountsError(split, headCount);
        if (message) {
          ctx.addIssue({ code: "custom", message, path: ["meal_diet_counts"] });
        }
      }
      if (v.meals.length === 0) {
        ctx.addIssue({
          code: "custom",
          message:
            v.service_type === "meals_only"
              ? "Pick at least one meal - a meals-only booking has nothing else in it"
              : "Pick at least one meal, or change this to a room-only booking",
          path: ["meals"],
        });
      }
    })
    // `check_in` / `check_out` are wall-clock strings, so they are resolved in
    // the institute's timezone - never the runtime's. See `lib/tz.ts`.
    .superRefine((v, ctx) => {
      // A **stay** still has to say what it is for: the desk and the
      // approvers read it, and "Visit" is the one thing a reviewer cannot
      // get from anywhere else. A **dining** booking does not - the box is
      // Remarks there, for anything the kitchen should know (1 Oct 2026).
      if (v.service_type === "meals_only") return;
      if (v.purpose_of_visit.trim().length < 5) {
        ctx.addIssue({
          code: "custom",
          message: "Describe the purpose of the visit",
          path: ["purpose_of_visit"],
        });
      }
    })
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
        instituteDate(v.check_out),
        rules.meals.windows
      );
      if (message) ctx.addIssue({ code: "custom", message, path: ["meals"] });
    })
    .superRefine((v, ctx) => {
      // The kitchen's notice period: a meal has to be asked for before the
      // previous one finishes being served. Checked separately from the stay
      // so a meal that is inside the stay but closed is not described as
      // outside it - and checked on the server too, because a form left open
      // past a deadline would otherwise submit an order nobody can cook.
      if (v.meals.length === 0) return;
      const message = mealLeadTimeError(v.meals, new Date(), rules.meals.windows);
      if (message) ctx.addIssue({ code: "custom", message, path: ["meals"] });
    })
    .superRefine((v, ctx) => {
      if (checkOutOrderError(v.check_in, v.check_out)) return;
      const message = stayLengthError(
        instituteDate(v.check_in),
        instituteDate(v.check_out),
        config.role,
        context.requesterEmail,
        rules.booking.max_stay_nights
      );
      if (message) ctx.addIssue({ code: "custom", message, path: ["check_out"] });
    })
    .refine(
      (v) =>
        // A meals-only booking has no check-in: `check_in` is midnight on the
        // first day the kitchen cooks, which is today whenever today still has
        // a meal open. What stops it being booked too late is the notice
        // period above, not a rule about arriving in the future.
        v.service_type === "meals_only" || instituteDate(v.check_in) >= earliestBookableCheckIn(),
      {
        message: LATE_CHECK_IN_ERROR,
        path: ["check_in"],
      }
    )
    .refine(
      (v) => {
        const limit = latestCheckIn(config.role, new Date(), rules.booking.advance_booking_months);
        return !limit || instituteDate(v.check_in) <= limit;
      },
      {
        message: advanceWindowMessage(config.role, rules.booking.advance_booking_months),
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
    })
    .superRefine((v, ctx) => {
      // One of each, across the whole request: two guests cannot both be the
      // requester's mother. Like the dependency above, this is config
      // (`unique_relationships`), not a hardcoded list of words.
      const all = v.rooms.flatMap((r) => r.guests);
      const message = duplicateRelationshipError(
        config,
        all.map((g) => g.relationship)
      );
      if (!message) return;
      const repeated = duplicateRelationships(
        config,
        all.map((g) => g.relationship)
      );
      // Marked on every copy but the first: the first one is almost always
      // the one the requester meant, and flagging it too reads as though both
      // were wrong.
      const seen = new Set<string>();
      v.rooms.forEach((room, i) => {
        room.guests.forEach((g, j) => {
          const value = g.relationship?.trim();
          if (!value || !repeated.includes(value)) return;
          if (!seen.has(value)) {
            seen.add(value);
            return;
          }
          ctx.addIssue({
            code: "custom",
            message,
            path: ["rooms", i, "guests", j, "relationship"],
          });
        });
      });
    })
    /**
     * Last of all, the head a personal booking is charged to.
     *
     * The form does not ask (7 Oct 2026), so the value has to be filled in
     * somewhere, and it is filled in **here** rather than in `createBooking`
     * for the usual reason: the form validates with this schema and sends
     * `parsed.data`, which the server re-parses with it. Doing it here means
     * the browser's copy of the payload and the stored booking name the same
     * budget, and the invoice and the reports have one answer to read.
     *
     * Round-trip safe: `"personal_funds"` is a valid input for `debit_head`,
     * so the output of one pass parses as the input of the next.
     */
    .transform((v) => ({ ...v, debit_head: debitHeadFor(v.booking_type, v.debit_head) }));
}

/**
 * Why check-out is not after check-in, spelled out - or null when it is fine.
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
    return `${reading} - the same moment. A stay needs to end after it starts.`;
  }
  // Same calendar day: the periods are the usual culprit, because only the
  // times can be out of order.
  if (checkIn.slice(0, 10) === checkOut.slice(0, 10)) {
    return `${reading}, which is earlier the same day. Check the AM/PM dropdown on each time - they do not change on their own when you pick a new hour.`;
  }
  return `${reading}. Check-out has to be after check-in.`;
}

/** Wording for the advance-booking limit, with the actual last bookable date. */
export function advanceWindowMessage(
  role: RoleFormConfig["role"],
  months: number = DEFAULT_RULES.booking.advance_booking_months
): string {
  const limit = latestCheckIn(role, new Date(), months);
  if (!limit) return "";
  const window = months === 1 ? "one month" : `${months} months`;
  return `Bookings open ${window} in advance - the latest check-in you can request is ${formatInstituteDate(
    limit
  )}`;
}

/**
 * An Aadhaar number is exactly twelve digits. People type them in groups of
 * four, so the separators are ignored rather than rejected.
 */
export const AADHAAR_DIGITS = 12;

export const AADHAAR_FORMAT_ERROR = `Aadhaar number must be ${AADHAAR_DIGITS} digits`;

/** Just the digits of what was typed - "1234 5678 9012" is twelve. */
export function aadhaarDigits(value: string): string {
  return value.replace(/\D/g, "");
}

export function isAadhaarNumber(value: string): boolean {
  return aadhaarDigits(value).length === AADHAAR_DIGITS;
}

/*
 * **`INFANT_HELP_TEXT` is deleted** (9 Oct 2026). "A guest below 5 shares a
 * guardian's bed, needs no bed of their own and is not asked for an ID" sat
 * under the infant counter on every room booking. 8 Oct had already cut it to
 * the infant fact alone; this round took the sentence itself, because the
 * infant card asks for an age of 0-4 and no ID - the rule performed rather
 * than described - and the Guidelines page states it in words for anyone
 * reading before they book. Don't reintroduce it.
 */

export type BookingPayload = z.infer<ReturnType<typeof bookingPayloadSchema>>;
