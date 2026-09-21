import { z } from "zod";
import type { MealKey, RoomType } from "./types";

/**
 * The rules the office can change from the developer console (Settings).
 *
 * Every value here used to be a constant in the module that enforces it. They
 * are still enforced there — `lib/occupancy.ts`, `lib/meals.ts`,
 * `lib/policy.ts`, `lib/workflow.ts` — but the *value* now comes from the
 * store, so changing the advance window or a meal time is a console edit, not
 * a deploy.
 *
 * Three rules keep this honest:
 *
 * 1. **Defaults are today's behaviour.** A fresh install, or one where nobody
 *    has opened Settings, behaves exactly as the constants did. `DEFAULT_RULES`
 *    is the single place those values live.
 * 2. **Rule functions take the rules as a parameter** (defaulting to
 *    `DEFAULT_RULES`), so they stay pure and testable, and the booking form and
 *    the server action validate against the *same* values — the page reads the
 *    settings once and hands them to the form.
 * 3. **A change that would break data already stored is refused**, with the
 *    bookings or accounts it would break named — see `lib/settings-impact.ts`.
 *
 * Scalar groups are stored as one jsonb row each in `app_settings`
 * (`rules.<group>`); lists that grow — hostels, the official whitelist,
 * departments and clubs — have tables of their own.
 */

// ------------------------------------------------------------------ shapes

export type RoomCapacity = { standard: number; withExtraBed: number };

export type CapacityRules = {
  /** Beds per room type, and the most once an extra bed is rolled in. Checked at allocation. */
  room_types: Record<RoomType, RoomCapacity>;
  /**
   * The per-room-card rule checked at submission, before the room's type is
   * known: at most this many bed-occupying guests on one card. The database
   * trigger from migration 11 reads the same value (migration 16).
   */
  max_guests_per_room: number;
  /** Infants per room card. They share a guardian's bed. */
  max_infants_per_room: number;
};

export type BookingRules = {
  /** How many months ahead a check-in may be requested. Officials are exempt. */
  advance_booking_months: number;
  /** The longest ordinary stay, in nights; 0 means no limit. */
  max_stay_nights: number;
};

export type MealWindow = { start: string; end: string };

export type MealRules = {
  /** Institute wall-clock "HH:mm", end exclusive. */
  windows: Record<MealKey, MealWindow>;
};

export type Rules = {
  capacity: CapacityRules;
  booking: BookingRules;
  meals: MealRules;
};

export type RuleGroup = keyof Rules;

export const RULE_GROUPS: RuleGroup[] = ["capacity", "booking", "meals"];

/** The `app_settings` key a group is stored under. */
export function ruleKey(group: RuleGroup): string {
  return `rules.${group}`;
}

// ---------------------------------------------------------------- defaults

/**
 * What the portal did before any of this was configurable. Changing a value
 * here changes the default for every install that has not saved its own.
 */
export const DEFAULT_RULES: Rules = {
  capacity: {
    room_types: {
      single: { standard: 1, withExtraBed: 2 },
      double_sharing: { standard: 2, withExtraBed: 3 },
    },
    max_guests_per_room: 3,
    max_infants_per_room: 1,
  },
  booking: {
    advance_booking_months: 1,
    max_stay_nights: 14,
  },
  meals: {
    windows: {
      breakfast: { start: "07:30", end: "09:30" },
      lunch: { start: "12:30", end: "14:00" },
      dinner: { start: "19:30", end: "21:00" },
    },
  },
};

// -------------------------------------------------------------- validation

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

const whole = (label: string, min: number, max: number) =>
  z.coerce
    .number({ message: `${label} is required` })
    .int(`${label} must be a whole number`)
    .min(min, `${label} must be at least ${min}`)
    .max(max, `${label} must be at most ${max}`);

const roomCapacitySchema = (label: string) =>
  z
    .object({
      standard: whole(`${label}: beds`, 1, 10),
      withExtraBed: whole(`${label}: maximum with an extra bed`, 1, 12),
    })
    .refine((c) => c.withExtraBed >= c.standard, {
      message: `${label}: the maximum with an extra bed cannot be less than the beds in the room`,
    });

export const capacityRulesSchema = z
  .object({
    room_types: z.object({
      single: roomCapacitySchema("Single"),
      double_sharing: roomCapacitySchema("Double sharing"),
    }),
    max_guests_per_room: whole("Guests per room", 1, 12),
    max_infants_per_room: whole("Infants per room", 0, 4),
  })
  .refine(
    (c) =>
      c.max_guests_per_room <=
      Math.max(c.room_types.single.withExtraBed, c.room_types.double_sharing.withExtraBed),
    {
      message:
        "Guests per room cannot exceed what the largest room type holds with an extra bed — the manager could never allocate such a request",
    }
  );

export const bookingRulesSchema = z.object({
  advance_booking_months: whole("Advance-booking window", 1, 24),
  max_stay_nights: whole("Maximum stay", 0, 365),
});

const windowSchema = (label: string) =>
  z
    .object({
      start: z.string().regex(HHMM, `${label}: start must be a time like 07:30`),
      end: z.string().regex(HHMM, `${label}: end must be a time like 09:30`),
    })
    .refine((w) => w.start < w.end, { message: `${label} must end after it starts` });

export const mealRulesSchema = z
  .object({
    windows: z.object({
      breakfast: windowSchema("Breakfast"),
      lunch: windowSchema("Lunch"),
      dinner: windowSchema("Dinner"),
    }),
  })
  .refine(
    (m) =>
      m.windows.breakfast.end <= m.windows.lunch.start &&
      m.windows.lunch.end <= m.windows.dinner.start,
    { message: "Breakfast, lunch and dinner must be served in that order without overlapping" }
  );

export const RULE_SCHEMAS = {
  capacity: capacityRulesSchema,
  booking: bookingRulesSchema,
  meals: mealRulesSchema,
} as const satisfies Record<RuleGroup, z.ZodType>;

/**
 * Read one stored group, falling back to the default for anything missing or
 * malformed. A saved row from before a field existed gains the default for
 * that field, so adding a setting never needs a data migration — the same
 * self-healing the mock store does for bookings.
 */
export function parseRuleGroup<G extends RuleGroup>(group: G, stored: unknown): Rules[G] {
  const defaults = DEFAULT_RULES[group];
  if (!stored || typeof stored !== "object") return defaults;
  const merged = deepMerge(defaults, stored as Record<string, unknown>);
  const parsed = RULE_SCHEMAS[group].safeParse(merged);
  return parsed.success ? (parsed.data as Rules[G]) : defaults;
}

/** First validation message for a proposed group, or null when it is acceptable. */
export function ruleGroupError(group: RuleGroup, proposed: unknown): string | null {
  const parsed = RULE_SCHEMAS[group].safeParse(proposed);
  return parsed.success ? null : (parsed.error.issues[0]?.message ?? "Invalid settings");
}

function deepMerge<T>(base: T, patch: Record<string, unknown>): T {
  if (!base || typeof base !== "object" || Array.isArray(base)) {
    return (patch as unknown as T) ?? base;
  }
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [key, value] of Object.entries(patch)) {
    if (!(key in out)) continue;
    const current = out[key];
    out[key] =
      current && typeof current === "object" && !Array.isArray(current) && value && typeof value === "object"
        ? deepMerge(current, value as Record<string, unknown>)
        : value;
  }
  return out as T;
}

// ---------------------------------------------------------- list settings

/** A hostel, as the warden scoping and the Users & Roles form know it. */
export const hostelNameSchema = z
  .string()
  .trim()
  .min(2, "Give the hostel a name")
  .max(60, "Keep the hostel name under 60 characters");

export const officialEmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email("Enter a valid email address");

/**
 * The accounts that may submit Official / Dignitary bookings. Moved out of
 * `lib/routes.ts` into the `official_email_whitelist` table (migration 16);
 * these are the rows it is seeded with.
 */
export const DEFAULT_OFFICIAL_EMAILS = [
  "admin@iitpkd.ac.in",
  "director.office@iitpkd.ac.in",
  "registrar@iitpkd.ac.in",
];

export function isWhitelistedOfficial(email: string, whitelist: string[]): boolean {
  const wanted = email.trim().toLowerCase();
  return whitelist.some((e) => e.toLowerCase() === wanted);
}

// ---------------------------------------------------------------- describe

/** What changed, in words, for the audit log and the confirmation dialog. */
export function describeRuleChanges(before: unknown, after: unknown, prefix = ""): string[] {
  if (before === after) return [];
  if (
    before &&
    after &&
    typeof before === "object" &&
    typeof after === "object" &&
    !Array.isArray(before) &&
    !Array.isArray(after)
  ) {
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    return [...keys].flatMap((k) =>
      describeRuleChanges(
        (before as Record<string, unknown>)[k],
        (after as Record<string, unknown>)[k],
        prefix ? `${prefix}.${k}` : k
      )
    );
  }
  if (JSON.stringify(before) === JSON.stringify(after)) return [];
  return [`${prefix}: ${JSON.stringify(before)} → ${JSON.stringify(after)}`];
}
