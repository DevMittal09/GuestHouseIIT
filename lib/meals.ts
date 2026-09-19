import type { MealDay, MealKey, MealPlan, MealPreferences } from "./types";
import {
  addDaysToDateValue,
  formatDateValue,
  instituteDate,
  parseDateValue,
  toInstituteDateValue,
} from "./tz";

/**
 * Meals a booking asks the guest house to lay on, day by day.
 *
 * Stored as one jsonb array on the booking (`bookings.meals`, migration 8) —
 * one entry per institute calendar day that has at least one meal, in date
 * order: `[{ date: "2026-09-15", breakfast: false, lunch: true, dinner: true }]`.
 * It is still one answer to one question, read as a whole, which is why it is
 * one column like `custom_fields`. Before migration 8 it was a single
 * `{breakfast, lunch, dinner}` answer for the whole stay; `normalizeMeals`
 * still reads that shape.
 */
export const MEAL_KEYS: MealKey[] = ["breakfast", "lunch", "dinner"];

export const MEAL_LABELS: Record<MealKey, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
};

/**
 * When each meal is served, as institute wall-clock "HH:mm" with the end
 * exclusive. A meal can be booked on a day only if the stay covers part of its
 * window, so a noon arrival is not offered that morning's breakfast and a
 * 10 AM check-out is not offered lunch. Migration 8 converted old bookings with
 * these same windows — change them together.
 */
export const MEAL_SERVING_WINDOWS: Record<MealKey, { start: string; end: string }> = {
  breakfast: { start: "07:30", end: "09:30" },
  lunch: { start: "12:30", end: "14:00" },
  dinner: { start: "19:30", end: "21:00" },
};

/** "7:30 – 9:30 AM", derived from the windows so the label cannot drift from the rule. */
export const MEAL_TIMES: Record<MealKey, string> = {
  breakfast: formatWindow(MEAL_SERVING_WINDOWS.breakfast),
  lunch: formatWindow(MEAL_SERVING_WINDOWS.lunch),
  dinner: formatWindow(MEAL_SERVING_WINDOWS.dinner),
};

export const NO_MEALS: MealPreferences = { breakfast: false, lunch: false, dinner: false };

/**
 * The most days a meal plan may cover. A guard against a runaway loop on a
 * nonsense check-out date, not a policy — no real stay comes close.
 */
export const MAX_MEAL_DAYS = 366;

/** One day of a stay in the meal grid, with the meals served while the guest is there. */
export interface StayMealDay {
  /** Institute calendar date, "yyyy-MM-dd". */
  date: string;
  available: MealPreferences;
}

/**
 * Every institute calendar day a stay touches, from the check-in date to the
 * day of check-out, with which meals' serving windows overlap the stay. Uses
 * the same half-open rule as room holds: checking out at 07:30 misses
 * breakfast, and a stay ending at midnight does not touch the next day.
 */
export function stayMealDays(checkIn: Date, checkOut: Date): StayMealDay[] {
  const from = checkIn.getTime();
  const to = checkOut.getTime();
  if (!(to > from)) return [];

  const days: StayMealDay[] = [];
  // The day of the stay's last instant, so a midnight check-out adds no row.
  const last = toInstituteDateValue(new Date(to - 1));
  for (
    let date = toInstituteDateValue(checkIn);
    date <= last && days.length < MAX_MEAL_DAYS;
    date = addDaysToDateValue(date, 1)
  ) {
    const available = { ...NO_MEALS };
    for (const meal of MEAL_KEYS) {
      const { start, end } = MEAL_SERVING_WINDOWS[meal];
      available[meal] =
        from < instituteDate(`${date}T${end}`).getTime() &&
        to > instituteDate(`${date}T${start}`).getTime();
    }
    days.push({ date, available });
  }
  return days;
}

/** Why a meal on a day of the stay cannot be booked. */
export function mealUnavailableReason(
  date: string,
  meal: MealKey,
  checkIn: Date
): "before-check-in" | "after-check-out" {
  const servedUntil = instituteDate(`${date}T${MEAL_SERVING_WINDOWS[meal].end}`).getTime();
  return servedUntil <= checkIn.getTime() ? "before-check-in" : "after-check-out";
}

function hasAnyMeal(day: MealPreferences): boolean {
  return MEAL_KEYS.some((meal) => day[meal]);
}

/**
 * Read a booking's stored meals as a `MealPlan`. The only reader: both stores
 * call it while hydrating, so `Booking.meals` is always a clean plan.
 *
 * - The current shape, an array of days, is cleaned: entries without a real
 *   date are dropped, only `true` counts as asked for, repeated dates are
 *   merged, days with no meal are removed, and the rest are sorted.
 * - The pre-migration-8 shape, `{breakfast, lunch, dinner}` meaning "these
 *   meals for the whole stay", is expanded over the days of `stay`, keeping
 *   each meal only where it is served during the stay — the same conversion
 *   migration 8 applies to stored rows.
 * - Anything else (missing, or a hand-edited mock database) is "no meals".
 */
export function normalizeMeals(
  value: unknown,
  stay?: { check_in: string; check_out: string }
): MealPlan {
  if (Array.isArray(value)) {
    const byDate = new Map<string, MealDay>();
    for (const entry of value) {
      if (!entry || typeof entry !== "object") continue;
      const raw = entry as Record<string, unknown>;
      if (typeof raw.date !== "string" || !parseDateValue(raw.date)) continue;
      const day = byDate.get(raw.date) ?? { date: raw.date, ...NO_MEALS };
      for (const meal of MEAL_KEYS) {
        if (raw[meal] === true) day[meal] = true;
      }
      byDate.set(raw.date, day);
    }
    return [...byDate.values()].filter(hasAnyMeal).sort((a, b) => a.date.localeCompare(b.date));
  }

  if (value && typeof value === "object" && stay) {
    const legacy = value as Record<string, unknown>;
    return stayMealDays(new Date(stay.check_in), new Date(stay.check_out))
      .map(({ date, available }) => ({
        date,
        breakfast: legacy.breakfast === true && available.breakfast,
        lunch: legacy.lunch === true && available.lunch,
        dinner: legacy.dinner === true && available.dinner,
      }))
      .filter(hasAnyMeal);
  }

  return [];
}

/**
 * Why a meal plan does not fit a stay — a day outside it, or a meal served
 * before check-in or after check-out — or null when it fits. The booking
 * schema runs it on the client and again on the server.
 */
export function mealPlanError(plan: MealPlan, checkIn: Date, checkOut: Date): string | null {
  const days = new Map(stayMealDays(checkIn, checkOut).map((d) => [d.date, d.available]));
  for (const day of plan) {
    const label = formatDateValue(day.date, { year: true });
    const available = days.get(day.date);
    if (!available) return `Meals were chosen for ${label}, which is outside your stay`;
    for (const meal of MEAL_KEYS) {
      if (day[meal] && !available[meal]) {
        const when =
          mealUnavailableReason(day.date, meal, checkIn) === "before-check-in"
            ? "before you check in"
            : "after you check out";
        return `${MEAL_LABELS[meal]} on ${label} is served ${when}`;
      }
    }
  }
  return null;
}

/** The booking form's key for one meal on one day. */
export function mealSlot(date: string, meal: MealKey): string {
  return `${date}|${meal}`;
}

/**
 * The plan the booking form submits: the ticked slots that are still inside
 * the stay. A slot left over from dates chosen earlier is ignored rather than
 * cleared, so changing the dates back brings it back.
 */
export function mealPlanFromSlots(slots: ReadonlySet<string>, days: StayMealDay[]): MealPlan {
  return days
    .map(({ date, available }) => ({
      date,
      breakfast: available.breakfast && slots.has(mealSlot(date, "breakfast")),
      lunch: available.lunch && slots.has(mealSlot(date, "lunch")),
      dinner: available.dinner && slots.has(mealSlot(date, "dinner")),
    }))
    .filter(hasAnyMeal);
}

/** Every meal slot the stay actually covers — the default when a preference is picked. */
export function allAvailableSlots(days: StayMealDay[]): Set<string> {
  const slots = new Set<string>();
  for (const { date, available } of days) {
    for (const meal of MEAL_KEYS) {
      if (available[meal]) slots.add(mealSlot(date, meal));
    }
  }
  return slots;
}

/**
 * Tick every meal on days the requester has not seen yet.
 *
 * Picking Veg or Non-Veg means "we are eating here", so the whole stay is
 * ticked and the requester unticks the meals they will miss. That has to
 * survive two things:
 *
 * - **Unticking a meal.** The slot is simply absent from `slots`; days already
 *   in `covered` are left exactly as they are, so nothing is re-ticked behind
 *   the requester.
 * - **Changing the dates.** New days are ticked (they are part of "the whole
 *   stay" too), while the unticks on days that survive the change are kept.
 *   A day that drops out of the stay is not forgotten either — its slots stay
 *   in `slots` but `mealPlanFromSlots` ignores them, so moving the dates back
 *   restores what was there.
 *
 * `covered` is the set of dates that have been offered so far; pass back the
 * one this returns.
 */
export function applyMealPreferenceDefaults(
  slots: ReadonlySet<string>,
  days: StayMealDay[],
  covered: ReadonlySet<string>
): { slots: Set<string>; covered: Set<string> } {
  const next = new Set(slots);
  const nextCovered = new Set(covered);
  for (const { date, available } of days) {
    if (!covered.has(date)) {
      for (const meal of MEAL_KEYS) {
        if (available[meal]) next.add(mealSlot(date, meal));
      }
    }
    nextCovered.add(date);
  }
  return { slots: next, covered: nextCovered };
}

/** On how many days each meal was asked for. */
export function mealDayCounts(plan: MealPlan): Record<MealKey, number> {
  const counts: Record<MealKey, number> = { breakfast: 0, lunch: 0, dinner: 0 };
  for (const day of plan) {
    for (const meal of MEAL_KEYS) {
      if (day[meal]) counts[meal]++;
    }
  }
  return counts;
}

/** "Breakfast (2 days), Dinner (1 day)", or "None requested". */
export function describeMeals(plan: MealPlan): string {
  const counts = mealDayCounts(plan);
  const parts = MEAL_KEYS.filter((meal) => counts[meal] > 0).map(
    (meal) => `${MEAL_LABELS[meal]} (${counts[meal]} day${counts[meal] === 1 ? "" : "s"})`
  );
  return parts.length === 0 ? "None requested" : parts.join(", ");
}

/** How many individual meals the plan covers, across every day and type. */
export function totalMeals(plan: MealPlan): number {
  const counts = mealDayCounts(plan);
  return MEAL_KEYS.reduce((n, meal) => n + counts[meal], 0);
}

/** The meals asked for on one institute calendar date. */
export function mealsOn(plan: MealPlan, date: string): MealKey[] {
  const day = plan.find((d) => d.date === date);
  return day ? MEAL_KEYS.filter((meal) => day[meal]) : [];
}

/** One line per day, e.g. "Tue 15 Sep: Lunch, Dinner". */
export function describeMealDays(plan: MealPlan): string[] {
  return plan.map(
    (day) =>
      `${formatDateValue(day.date)}: ${MEAL_KEYS.filter((meal) => day[meal])
        .map((meal) => MEAL_LABELS[meal])
        .join(", ")}`
  );
}

/** "7:30 – 9:30 AM" or "11:30 AM – 1:00 PM" for a serving window. */
function formatWindow({ start, end }: { start: string; end: string }): string {
  const [from, fromPeriod] = twelveHour(start);
  const [to, toPeriod] = twelveHour(end);
  return fromPeriod === toPeriod
    ? `${from} – ${to} ${toPeriod}`
    : `${from} ${fromPeriod} – ${to} ${toPeriod}`;
}

function twelveHour(time: string): [string, "AM" | "PM"] {
  const [hour, minute] = time.split(":").map(Number);
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return [`${hour12}:${String(minute).padStart(2, "0")}`, hour < 12 ? "AM" : "PM"];
}
