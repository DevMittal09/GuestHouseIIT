import { DEFAULT_RULES, type MealWindow } from "./settings";
import {
  MEAL_PREFERENCE_LABELS,
  type MealDay,
  type MealDietCounts,
  type MealKey,
  type MealPlan,
  type MealPreference,
  type MealPreferences,
} from "./types";
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
 * Stored as one jsonb array on the booking (`bookings.meals`, migration 8) -
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
 * 10 AM check-out is not offered lunch.
 *
 * These are the **defaults**; the office's own times are Settings
 * (`rules.meals`, `lib/settings.ts`), passed as `windows` to the functions
 * below.
 */
export type MealWindows = Record<MealKey, MealWindow>;

export const MEAL_SERVING_WINDOWS: MealWindows = DEFAULT_RULES.meals.windows;

/**
 * The windows migration 8 used to convert the old whole-stay answers. Pinned,
 * not read from Settings: a legacy row has to keep reading back as the plan
 * that migration produced, whatever the kitchen's hours are now.
 */
const LEGACY_CONVERSION_WINDOWS: MealWindows = {
  breakfast: { start: "07:30", end: "09:30" },
  lunch: { start: "12:30", end: "14:00" },
  dinner: { start: "19:30", end: "21:00" },
};

/** "7:30 – 9:30 AM" per meal, derived from the windows so the label cannot drift from the rule. */
export function mealTimes(windows: MealWindows = MEAL_SERVING_WINDOWS): Record<MealKey, string> {
  return {
    breakfast: formatWindow(windows.breakfast),
    lunch: formatWindow(windows.lunch),
    dinner: formatWindow(windows.dinner),
  };
}

/** The labels under the default windows. */
export const MEAL_TIMES: Record<MealKey, string> = mealTimes();

export const NO_MEALS: MealPreferences = { breakfast: false, lunch: false, dinner: false };

/**
 * Which meals a day of a **meal booking** arrives already ticked (1 Oct 2026).
 *
 * It used to be all three: most guests eat, so the form filled the days in
 * and the requester cleared what they would miss. The office asked for
 * **lunch only** - it is the meal the guest house actually serves most of,
 * and offering breakfast and dinner by default was producing head counts for
 * meals nobody turned up to. Breakfast and dinner are one tick away.
 *
 * It is **not** applied to a room booking: meals there are an extra the
 * requester opts into, and defaulting them on would put dining charges on
 * every stay at a guest house with a kitchen without anyone asking for them.
 * A room booking passes `NO_MEALS`.
 */
export const DEFAULT_MEALS_ON: MealPreferences = {
  breakfast: false,
  lunch: true,
  dinner: false,
};

/**
 * The most days a meal plan may cover. A guard against a runaway loop on a
 * nonsense check-out date, not a policy - no real stay comes close.
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
export function stayMealDays(
  checkIn: Date,
  checkOut: Date,
  windows: MealWindows = MEAL_SERVING_WINDOWS,
  now?: Date
): StayMealDay[] {
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
      const { start, end } = windows[meal];
      available[meal] =
        from < instituteDate(`${date}T${end}`).getTime() &&
        to > instituteDate(`${date}T${start}`).getTime() &&
        // The kitchen's notice period, when the caller has a clock to give.
        // Without it this is purely "does the stay cover the meal", which is
        // what `normalizeMeals` wants when re-reading a stored plan.
        (now === undefined || isMealBookable(date, meal, now, windows));
    }
    days.push({ date, available });
  }
  return days;
}

// --------------------------------------------------------- notice period

/**
 * The meal served immediately before this one. Breakfast's predecessor is the
 * *previous day's* dinner, which is what makes the deadline for a morning meal
 * the evening before rather than the small hours.
 */
export function previousMealSlot(date: string, meal: MealKey): { date: string; meal: MealKey } {
  const index = MEAL_KEYS.indexOf(meal);
  return index > 0
    ? { date, meal: MEAL_KEYS[index - 1] }
    : { date: addDaysToDateValue(date, -1), meal: MEAL_KEYS[MEAL_KEYS.length - 1] };
}

/**
 * The instant after which a meal can no longer be booked: **the end of the
 * previous meal's service**.
 *
 * The kitchen buys and cooks one meal ahead, so a head count that arrives
 * while the previous meal is still being served is the last one it can act on.
 * Lunch closes when breakfast ends, dinner when lunch ends, and tomorrow's
 * breakfast when tonight's dinner ends.
 */
export function mealBookingDeadline(
  date: string,
  meal: MealKey,
  windows: MealWindows = MEAL_SERVING_WINDOWS
): Date {
  const previous = previousMealSlot(date, meal);
  return instituteDate(`${previous.date}T${windows[previous.meal].end}`);
}

/** Whether `meal` on `date` can still be asked for at `now`. */
export function isMealBookable(
  date: string,
  meal: MealKey,
  now: Date,
  windows: MealWindows = MEAL_SERVING_WINDOWS
): boolean {
  return now.getTime() < mealBookingDeadline(date, meal, windows).getTime();
}

/** "Lunch on Tue 15 Sep had to be booked by 9:30 AM on Tue 15 Sep". */
export function mealDeadlineNote(
  date: string,
  meal: MealKey,
  windows: MealWindows = MEAL_SERVING_WINDOWS
): string {
  const previous = previousMealSlot(date, meal);
  const [time, period] = twelveHour(windows[previous.meal].end);
  return `${MEAL_LABELS[meal]} on ${formatDateValue(date)} has to be booked before ${MEAL_LABELS[
    previous.meal
  ].toLowerCase()} ends, at ${time} ${period} on ${formatDateValue(previous.date)}`;
}

/** Which meals on a date can still be booked at `now`. */
export function bookableMealsOn(
  date: string,
  now: Date,
  windows: MealWindows = MEAL_SERVING_WINDOWS
): MealPreferences {
  const available = { ...NO_MEALS };
  for (const meal of MEAL_KEYS) available[meal] = isMealBookable(date, meal, now, windows);
  return available;
}

/**
 * The first institute date that still has a meal to offer - today while any
 * of today's meals is open, otherwise tomorrow. So a dining form opened in the
 * afternoon starts on tomorrow rather than on a day of greyed-out boxes.
 *
 * It never needs to look further than the next day: tomorrow's lunch and
 * dinner cannot both be closed while today is over, because their deadlines
 * are tomorrow morning and tomorrow midday.
 */
export function firstBookableMealDate(
  now: Date,
  windows: MealWindows = MEAL_SERVING_WINDOWS
): string {
  const today = toInstituteDateValue(now);
  const open = (date: string) => MEAL_KEYS.some((meal) => isMealBookable(date, meal, now, windows));
  return open(today) ? today : addDaysToDateValue(today, 1);
}

/** Why a chosen meal is now too late to book, or null when every one is in time. */
export function mealLeadTimeError(
  plan: MealPlan,
  now: Date,
  windows: MealWindows = MEAL_SERVING_WINDOWS
): string | null {
  for (const day of plan) {
    for (const meal of MEAL_KEYS) {
      if (day[meal] && !isMealBookable(day.date, meal, now, windows)) {
        return `${mealDeadlineNote(day.date, meal, windows)} - that has passed, so the kitchen can no longer take it.`;
      }
    }
  }
  return null;
}

/** Why a meal on a day of the stay cannot be booked. */
export function mealUnavailableReason(
  date: string,
  meal: MealKey,
  checkIn: Date,
  windows: MealWindows = MEAL_SERVING_WINDOWS,
  now?: Date
): "too-late" | "before-check-in" | "after-check-out" {
  // Checked first: a meal inside the stay that has simply closed is the
  // common case, and "served after you check out" would be a lie about it.
  if (now && !isMealBookable(date, meal, now, windows)) return "too-late";
  const servedUntil = instituteDate(`${date}T${windows[meal].end}`).getTime();
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
 *   each meal only where it is served during the stay - the same conversion
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
    return stayMealDays(new Date(stay.check_in), new Date(stay.check_out), LEGACY_CONVERSION_WINDOWS)
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
 * Why a meal plan does not fit a stay - a day outside it, or a meal served
 * before check-in or after check-out - or null when it fits. The booking
 * schema runs it on the client and again on the server.
 */
export function mealPlanError(
  plan: MealPlan,
  checkIn: Date,
  checkOut: Date,
  windows: MealWindows = MEAL_SERVING_WINDOWS,
  now?: Date
): string | null {
  // Without `now` this answers only "does the stay cover it". The notice
  // period is `mealLeadTimeError`, reported separately so a meal that is
  // inside the stay but past its deadline is not described as outside it.
  const days = new Map(stayMealDays(checkIn, checkOut, windows).map((d) => [d.date, d.available]));
  for (const day of plan) {
    const label = formatDateValue(day.date, { year: true });
    const available = days.get(day.date);
    if (!available) return `Meals were chosen for ${label}, which is outside your stay`;
    for (const meal of MEAL_KEYS) {
      if (day[meal] && !available[meal]) {
        const when =
          mealUnavailableReason(day.date, meal, checkIn, windows) === "before-check-in"
            ? "before you check in"
            : "after you check out";
        return `${MEAL_LABELS[meal]} on ${label} is served ${when}`;
      }
    }
  }
  return now ? mealLeadTimeError(plan, now, windows) : null;
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

/**
 * What the form holds for the meal grid: the slots the requester has decided
 * about, each mapped to their answer. A slot that is not in here has not been
 * touched, so it takes the default for its meal (`DEFAULT_MEALS_ON`).
 *
 * Holding the *decisions* rather than the ticks is what makes the default
 * survive a change of dates: a day that comes into range is not in the map, so
 * it arrives with lunch ticked and the rest clear. Holding ticks instead could
 * not tell a meal the requester unticked from one that was never offered, and
 * holding only the opt-outs (which is what this was until 1 Oct 2026) cannot
 * express "breakfast on", now that breakfast is off by default.
 */
export type MealChoices = ReadonlyMap<string, boolean>;

/**
 * The slots the grid shows as ticked: each slot's own answer, else its meal's
 * default - `DEFAULT_MEALS_ON` on a meal booking, `NO_MEALS` on a stay.
 */
export function mealSlotsFromChoices(
  days: StayMealDay[],
  choices: MealChoices,
  defaults: MealPreferences = DEFAULT_MEALS_ON
): Set<string> {
  const ticked = new Set<string>();
  for (const { date, available } of days) {
    for (const meal of MEAL_KEYS) {
      if (!available[meal]) continue;
      const slot = mealSlot(date, meal);
      if (choices.get(slot) ?? defaults[meal]) ticked.add(slot);
    }
  }
  return ticked;
}

/**
 * The decisions after the grid hands back a new set of ticks. Only the slots
 * currently on screen are reconsidered, so a meal turned off for dates the stay
 * no longer covers stays off if those dates come back - the mirror of the rule
 * `mealPlanFromSlots` applies to ticks.
 */
export function choicesFromMealSlots(
  days: StayMealDay[],
  ticked: ReadonlySet<string>,
  previous: MealChoices,
): Map<string, boolean> {
  const choices = new Map(previous);
  for (const { date, available } of days) {
    for (const meal of MEAL_KEYS) {
      if (!available[meal]) continue;
      choices.set(mealSlot(date, meal), ticked.has(mealSlot(date, meal)));
    }
  }
  return choices;
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

// ------------------------------------------------- each person's preference

/** No meals asked for, so nobody to count. */
export const NO_DIET_COUNTS: MealDietCounts = { veg: 0, non_veg: 0 };

/** Everyone on the booking, however their preferences are split. */
export function dietTotal(counts: MealDietCounts): number {
  return counts.veg + counts.non_veg;
}

/**
 * A stored or submitted split, cleaned: whole numbers, never negative, never
 * anything else. Anything unreadable is "nobody", which `dietCountsError`
 * then reports against the head count rather than silently accepting.
 */
export function normalizeDietCounts(value: unknown): MealDietCounts {
  if (!value || typeof value !== "object") return { ...NO_DIET_COUNTS };
  const raw = value as Record<string, unknown>;
  const whole = (n: unknown) =>
    typeof n === "number" && Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
  return { veg: whole(raw.veg), non_veg: whole(raw.non_veg) };
}

/**
 * The split to act on for a booking: its own counts, or - for a booking made
 * before each person had their own preference - the whole head count under
 * the one preference it carries. A booking with meals and neither is
 * "unknown", which `kitchenHeadCount` reports as such rather than guessing.
 */
export function mealDietCounts(booking: {
  meal_diet_counts?: MealDietCounts | null;
  meal_preference?: MealPreference | null;
}, headCount: number): MealDietCounts | null {
  if (booking.meal_diet_counts) {
    const counts = normalizeDietCounts(booking.meal_diet_counts);
    if (dietTotal(counts) > 0) return counts;
  }
  if (booking.meal_preference) {
    return booking.meal_preference === "veg"
      ? { veg: headCount, non_veg: 0 }
      : { veg: 0, non_veg: headCount };
  }
  return null;
}

/** Why this split does not describe the party, or null when it adds up. */
export function dietCountsError(counts: MealDietCounts, headCount: number): string | null {
  const total = dietTotal(counts);
  if (total === 0) return "Say how many of the party are vegetarian and how many are not";
  if (total !== headCount) {
    return `The vegetarian and non-vegetarian counts add up to ${total}, but the booking is for ${headCount} ${
      headCount === 1 ? "person" : "people"
    } - they have to match`;
  }
  return null;
}

/** "18 vegetarian, 12 non-vegetarian", or just the one kind when the other is nobody. */
export function describeDietCounts(counts: MealDietCounts): string {
  const parts = (["veg", "non_veg"] as const)
    .filter((kind) => counts[kind] > 0)
    .map((kind) => `${counts[kind]} ${MEAL_PREFERENCE_LABELS[kind].toLowerCase()}`);
  return parts.length === 0 ? "No preference recorded" : parts.join(", ");
}

// ---------------------------------------------------------------- kitchen

/**
 * Bookings the kitchen cooks for: approved or already in the building. A
 * request still in the approval chain may never happen.
 */
export const KITCHEN_CONFIRMED_STATUSES = ["APPROVED", "OCCUPIED", "CANCELLATION_REQUESTED"] as const;

export function isKitchenConfirmed(status: string): boolean {
  return (KITCHEN_CONFIRMED_STATUSES as readonly string[]).includes(status);
}

type KitchenBooking = {
  meals: MealPlan;
  service_type: string;
  meal_guest_count: number | null;
  meal_preference: MealPreference | null;
  meal_diet_counts?: MealDietCounts | null;
  guests: { is_infant?: boolean }[];
};

/** People eating at one sitting of a booking: a dining booking's head count, else the bed guests. */
export function dinersFor(booking: KitchenBooking): number {
  return booking.service_type === "meals_only"
    ? (booking.meal_guest_count ?? 0)
    : booking.guests.filter((g) => !g.is_infant).length;
}

/**
 * Plates for one meal on one day, split by preference. Each booking's own
 * split is used (`mealDietCounts`, which spreads a legacy whole-party
 * preference over the head count); a booking with meals and no preference at
 * all is "unknown" - the kitchen would rather see that than have it guessed.
 */
export function kitchenHeadCount(
  bookings: KitchenBooking[],
  day: string,
  meal: MealKey
): { veg: number; non_veg: number; unknown: number; total: number } {
  const counts = { veg: 0, non_veg: 0, unknown: 0 };
  for (const b of bookings) {
    if (!mealsOn(b.meals, day).includes(meal)) continue;
    const diners = dinersFor(b);
    const split = mealDietCounts(b, diners);
    if (!split) {
      counts.unknown += diners;
      continue;
    }
    counts.veg += split.veg;
    counts.non_veg += split.non_veg;
    // A split that no longer adds up (the head count was changed at the desk
    // afterwards) must not lose plates: the remainder is still people to feed.
    const missing = diners - dietTotal(split);
    if (missing > 0) counts.unknown += missing;
  }
  return { ...counts, total: counts.veg + counts.non_veg + counts.unknown };
}

// ------------------------------------------------- how many the kitchen takes

/**
 * Bookings that count against a sitting's capacity: everything still alive,
 * whether or not it has been approved yet.
 *
 * A request waiting for the manager is a request the manager is about to say
 * yes to, so it has to hold its places - otherwise the limit could be
 * oversubscribed by submissions that all pass the check and are then all
 * approved. Rejected, cancelled and missed requests release theirs.
 */
export function countsAgainstMealCapacity(status: string): boolean {
  // MISSED joins the list (migration 29): nobody decided it before its last
  // day of meals, so the kitchen is not cooking it and its places are free.
  return !["REJECTED", "CANCELLED", "CANCELLATION_APPROVED", "VACATED", "MISSED"].includes(status);
}

/** Plates already booked for one meal on one day, across the bookings given. */
export function mealPlatesBooked(
  bookings: (KitchenBooking & { status: string; id?: string })[],
  day: string,
  meal: MealKey,
  exceptBookingId?: string
): number {
  let plates = 0;
  for (const b of bookings) {
    if (exceptBookingId && b.id === exceptBookingId) continue;
    if (!countsAgainstMealCapacity(b.status)) continue;
    if (!mealsOn(b.meals, day).includes(meal)) continue;
    plates += dinersFor(b);
  }
  return plates;
}

/**
 * Why the kitchen cannot take this many more people for the meals chosen, or
 * null when it can (1 Oct 2026).
 *
 * The office's limit is **30 people at a sitting**, counting everyone already
 * booked for it - one kitchen cooking for a guest house, not a canteen. It is
 * a Setting (`rules.meals.max_diners_per_meal`, 0 = no limit) and it is
 * checked per day **and** per meal, because that is what the kitchen actually
 * has to serve at once.
 */
export function mealCapacityError(
  plan: MealPlan,
  headCount: number,
  booked: (day: string, meal: MealKey) => number,
  limit: number = DEFAULT_RULES.meals.max_diners_per_meal
): string | null {
  if (limit <= 0 || headCount <= 0) return null;
  for (const day of plan) {
    for (const meal of MEAL_KEYS) {
      if (!day[meal]) continue;
      const already = booked(day.date, meal);
      if (already + headCount <= limit) continue;
      const left = Math.max(0, limit - already);
      return `${MEAL_LABELS[meal]} on ${formatDateValue(day.date, { year: true })} is full: the kitchen serves at most ${limit} people at a sitting, ${already} are already booked, so ${
        left === 0 ? "there are no places left" : `only ${left} ${left === 1 ? "place is" : "places are"} left`
      }.`;
    }
  }
  return null;
}
