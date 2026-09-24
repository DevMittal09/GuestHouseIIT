import { z } from "zod";
import { DEFAULT_DEBIT_RULES, debitRulesSchema, upgradeDebitRules, type DebitRules } from "./debit-heads";
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
  /**
   * Everybody on one room card, infants included.
   *
   * The office's rule is a combination, not two independent caps: three
   * adults and one infant fit, and so do two adults and two infants, but
   * three adults and two infants do not. Neither `max_guests_per_room` nor
   * `max_infants_per_room` can express that on its own — a room holds four
   * people however they are made up, of whom at most
   * `max_guests_per_room` may need a bed.
   */
  max_occupants_per_room: number;
};

export type BookingRules = {
  /** How many months ahead a check-in may be requested. Officials are exempt. */
  advance_booking_months: number;
  /** The longest ordinary stay, in nights; 0 means no limit. */
  max_stay_nights: number;
  /**
   * Turnaround buffer (Phase 3): the least time between one stay's check-out
   * and the next check-in on the same room, in minutes; 0 turns it off. Pads
   * the end of each hold's guard in the database (migration 17). Changing it
   * rebuilds every hold, and is refused when that would make two stays clash.
   */
  buffer_minutes: number;
  /**
   * Release an approved stay automatically when the guest has not checked in
   * this many hours after the booked check-in (Phase 7); 0 turns it off. Run
   * by the daily cron, which mails the requester.
   */
  no_show_release_hours: number;
};

export type MealWindow = { start: string; end: string };

export type MealRules = {
  /** Institute wall-clock "HH:mm", end exclusive. */
  windows: Record<MealKey, MealWindow>;
};

/**
 * How invoices are numbered, charged and printed (Phase 5). Edited from the
 * Tariffs & Invoicing console, which the Guest House Manager can use too —
 * pricing is the office's to run. The rates themselves are the `tariffs`
 * table (`lib/tariffs.ts`), because they are effective-dated rows.
 */
export type InvoiceRules = {
  /** "GH" in GH/2026-27/0001. */
  serial_prefix: string;
  /** Zero-padded width of the running number: 4 gives 0001. */
  serial_digits: number;
  /**
   * What "Day(s)" on the invoice counts. `night`: calendar nights between
   * the actual check-in and check-out dates, at least one. `24h`: blocks of
   * 24 hours from the actual check-in, a block starting only once the stay
   * runs `grace_hours` past the previous one.
   */
  day_basis: "night" | "24h";
  grace_hours: number;
  /**
   * Whether the tariff rates already include GST (the office's rates do). When
   * true the Grand Total is exactly the sum of the rates, and the taxable value
   * and GST are backed out of it; when false GST is added on top.
   */
  prices_include_gst: boolean;
  /**
   * GST on accommodation, percent — 5% (without ITC) for a room whose value is
   * at most `gst_room_threshold` a day, since 22 Sep 2025; above it,
   * `gst_room_above_percent` (18%). Applied per room line by its daily rate.
   */
  gst_room_percent: number;
  gst_room_threshold: number;
  gst_room_above_percent: number;
  /** GST on food served (restaurant service), percent: 5% without ITC. */
  gst_meal_percent: number;
  /** SAC codes printed with the tax breakdown. */
  sac_room: string;
  sac_meal: string;
  gstin: string;
  /**
   * Where an official booking's invoice is mailed when it is issued, with the
   * requester's HOD and the requester in CC. Empty: nothing is mailed.
   */
  accounts_email: string;
  bank: {
    account_holder: string;
    account_number: string;
    bank_name: string;
    ifsc: string;
    branch: string;
  };
  /** The address line at the foot of the invoice (the Hindi half is fixed artwork). */
  contact: { address: string; phone: string; email: string };
};

/**
 * How long personal data is kept (Phase 8, DPDP). The daily job clears ID
 * numbers and their documents from stays that ended more than
 * `id_retention_days` ago, and trims the security audit log — never below the
 * 180 days the log's own purge function insists on.
 */
export type PrivacyRules = {
  id_retention_days: number;
  audit_retention_days: number;
};

export type Rules = {
  capacity: CapacityRules;
  booking: BookingRules;
  meals: MealRules;
  /** Which debitable heads each kind of requester may choose (Phase 4). */
  debit: DebitRules;
  invoice: InvoiceRules;
  privacy: PrivacyRules;
};

export type RuleGroup = keyof Rules;

export const RULE_GROUPS: RuleGroup[] = ["capacity", "booking", "meals", "debit", "invoice", "privacy"];

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
    // Three, because one adult plus three infants is a combination the office
    // allows; the combined cap below is what stops four infants.
    max_infants_per_room: 3,
    max_occupants_per_room: 4,
  },
  booking: {
    advance_booking_months: 1,
    max_stay_nights: 14,
    buffer_minutes: 240,
    no_show_release_hours: 0,
  },
  meals: {
    windows: {
      breakfast: { start: "07:30", end: "09:30" },
      lunch: { start: "12:30", end: "14:00" },
      dinner: { start: "19:30", end: "21:00" },
    },
  },
  debit: DEFAULT_DEBIT_RULES,
  // From the office's invoice template (public/GHM_Invoice.docx). GST is 0
  // until the office says otherwise, and nothing is mailed to Accounts until
  // an address is entered.
  invoice: {
    serial_prefix: "GH",
    serial_digits: 4,
    day_basis: "night",
    grace_hours: 4,
    // The office's rates include GST. Rates as in force since 22 Sep 2025 (the
    // 56th GST Council): accommodation up to ₹7,500 a day 5% without ITC, above
    // it 18%; restaurant service 5%. Intra-state (Kerala), so CGST + SGST.
    prices_include_gst: true,
    gst_room_percent: 5,
    gst_room_threshold: 7500,
    gst_room_above_percent: 18,
    gst_meal_percent: 5,
    sac_room: "996311",
    sac_meal: "996331",
    gstin: "32AAAAI9910J1ZR",
    accounts_email: "",
    bank: {
      account_holder: "Guest house IIT PKD",
      account_number: "39938270076",
      bank_name: "State Bank of India",
      ifsc: "SBIN0006640",
      branch: "KANJIKODE",
    },
    contact: {
      address: "Kanjikode West, Palakkad, Kerala",
      phone: "+91 491 209 2016",
      email: "ghm@iitpkd.ac.in",
    },
  },
  privacy: {
    // A year covers a full audit cycle and the institute's own queries about a
    // past stay; the office can shorten it.
    id_retention_days: 365,
    audit_retention_days: 180,
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
    max_infants_per_room: whole("Infants per room", 0, 6),
    max_occupants_per_room: whole("People per room", 1, 16),
  })
  .refine(
    (c) =>
      c.max_guests_per_room <=
      Math.max(c.room_types.single.withExtraBed, c.room_types.double_sharing.withExtraBed),
    {
      message:
        "Guests per room cannot exceed what the largest room type holds with an extra bed — the manager could never allocate such a request",
    }
  )
  .refine((c) => c.max_occupants_per_room >= c.max_guests_per_room, {
    message:
      "People per room cannot be fewer than guests per room — the combined limit has to leave room for the guests needing a bed",
  });

export const bookingRulesSchema = z.object({
  advance_booking_months: whole("Advance-booking window", 1, 24),
  max_stay_nights: whole("Maximum stay", 0, 365),
  buffer_minutes: whole("Turnaround buffer", 0, 1440),
  no_show_release_hours: whole("No-show release", 0, 168),
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

const percent = (label: string) =>
  z.coerce
    .number({ message: `${label} is required` })
    .min(0, `${label} cannot be negative`)
    .max(28, `${label} cannot exceed 28%`)
    .refine((n) => Math.abs(Math.round(n * 100) - n * 100) < 1e-6, `${label} can have at most two decimals`);

const text = (label: string, max: number) =>
  z.string().trim().min(1, `${label} is required`).max(max, `${label} is too long`);

export const invoiceRulesSchema = z.object({
  serial_prefix: z
    .string()
    .trim()
    .regex(/^[A-Z0-9-]{1,10}$/, "The invoice prefix must be 1–10 capital letters, digits or hyphens"),
  serial_digits: whole("Invoice number width", 3, 6),
  day_basis: z.enum(["night", "24h"], { message: "Choose how days are counted" }),
  grace_hours: whole("Grace", 0, 12),
  prices_include_gst: z.boolean(),
  gst_room_percent: percent("GST on rooms"),
  gst_room_threshold: whole("Room value for the higher GST rate", 0, 1_000_000),
  gst_room_above_percent: percent("GST on rooms above the threshold"),
  gst_meal_percent: percent("GST on food"),
  sac_room: z.string().trim().regex(/^\d{4,8}$/, "A SAC code is 4–8 digits"),
  sac_meal: z.string().trim().regex(/^\d{4,8}$/, "A SAC code is 4–8 digits"),
  gstin: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^(\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z])?$/, "That is not a GSTIN (15 characters, e.g. 32AAAAI9910J1ZR)"),
  accounts_email: z
    .string()
    .trim()
    .toLowerCase()
    .refine((v) => v === "" || z.email().safeParse(v).success, "The Accounts email is not an address"),
  bank: z.object({
    account_holder: text("Account holder", 80),
    account_number: z.string().trim().regex(/^\d{6,20}$/, "The account number must be 6–20 digits"),
    bank_name: text("Bank name", 80),
    ifsc: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, "That is not an IFSC code (e.g. SBIN0006640)"),
    branch: text("Branch", 80),
  }),
  contact: z.object({
    address: text("Address", 120),
    phone: text("Phone", 40),
    email: z.email("The contact email is not an address"),
  }),
});

export const privacyRulesSchema = z.object({
  id_retention_days: whole("ID retention", 30, 3650),
  // The audit log's own purge refuses anything under 180 days.
  audit_retention_days: whole("Audit retention", 180, 3650),
});

export const RULE_SCHEMAS = {
  capacity: capacityRulesSchema,
  booking: bookingRulesSchema,
  meals: mealRulesSchema,
  debit: debitRulesSchema,
  invoice: invoiceRulesSchema,
  privacy: privacyRulesSchema,
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
  const merged = deepMerge(defaults, upgradeStoredGroup(group, stored as Record<string, unknown>));
  const parsed = RULE_SCHEMAS[group].safeParse(merged);
  return parsed.success ? (parsed.data as Rules[G]) : defaults;
}

/**
 * Repair a stored group saved **before a rule changed shape**, the way
 * `sanitizeFormConfig` repairs a form config saved before the relationship
 * dependency existed. Adding a field is handled by the merge above; this is for
 * the rarer case where an *existing* field's meaning changed with it.
 *
 * **Capacity, 23 Sep 2026.** The per-room rule became a combination: a room
 * holds `max_occupants_per_room` people of whom at most `max_guests_per_room`
 * need a bed. A row with no `max_occupants_per_room` was therefore saved
 * before that, and its `max_infants_per_room` is the old default of **1** — a
 * number nobody chose, and one that refuses two of the three combinations the
 * office actually allows (2 guests + 2 infants, 1 guest + 3 infants). So the
 * infant cap is dropped and taken from the defaults. `max_guests_per_room` is
 * kept, because the office may well have set that one deliberately.
 *
 * Saving capacity once from the console writes the combined cap, after which
 * this leaves the row alone for good. The `booking_guests` trigger applies the
 * same repair in SQL (migration 23), so the database and the app agree.
 *
 * **Debitable heads, 24 Sep 2026.** Special Funds joined every official
 * category's list. A row saved before that replaces the default lists
 * wholesale and would never offer it; `upgradeDebitRules` adds it once and
 * marks the row current, so a later untick in the console sticks.
 */
function upgradeStoredGroup(
  group: RuleGroup,
  stored: Record<string, unknown>
): Record<string, unknown> {
  if (group === "debit") return upgradeDebitRules(stored);
  if (group !== "capacity" || "max_occupants_per_room" in stored) return stored;
  const rest = { ...stored };
  delete rest.max_infants_per_room;
  return rest;
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
