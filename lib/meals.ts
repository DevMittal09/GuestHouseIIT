import type { MealKey, MealPreferences } from "./types";

/**
 * Meals a booking has asked the guest house to lay on.
 *
 * Kept as one object on the booking rather than three columns because it is
 * one answer to one question, and because the kitchen reads it as a set:
 * "table for 4, breakfast and dinner". Stored as jsonb the same way
 * `custom_fields` is.
 */
export const MEAL_KEYS: MealKey[] = ["breakfast", "lunch", "dinner"];

export const MEAL_LABELS: Record<MealKey, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
};

/** Rough serving times, shown next to the checkboxes so guests can plan around them. */
export const MEAL_TIMES: Record<MealKey, string> = {
  breakfast: "7:30 – 9:30 AM",
  lunch: "12:30 – 2:00 PM",
  dinner: "7:30 – 9:00 PM",
};

export const NO_MEALS: MealPreferences = { breakfast: false, lunch: false, dinner: false };

/**
 * Coerce whatever came back from storage into a complete `MealPreferences`.
 * Bookings created before meals existed have no value at all, and the mock
 * store's JSON file is edited by hand often enough that a missing or partial
 * object has to mean "no meals", not a crash.
 */
export function normalizeMeals(value: unknown): MealPreferences {
  if (!value || typeof value !== "object") return { ...NO_MEALS };
  const raw = value as Record<string, unknown>;
  return {
    breakfast: raw.breakfast === true,
    lunch: raw.lunch === true,
    dinner: raw.dinner === true,
  };
}

export function selectedMeals(meals: MealPreferences): MealKey[] {
  return MEAL_KEYS.filter((key) => meals[key]);
}

/** "Breakfast, Dinner", or "None requested". */
export function describeMeals(meals: MealPreferences): string {
  const chosen = selectedMeals(meals);
  if (chosen.length === 0) return "None requested";
  return chosen.map((key) => MEAL_LABELS[key]).join(", ");
}

/** Meals × nights, for the kitchen's head count. Bed guests only — infants share a plate. */
export function mealCount(meals: MealPreferences, guests: number, nights: number): number {
  return selectedMeals(meals).length * guests * Math.max(nights, 1);
}
