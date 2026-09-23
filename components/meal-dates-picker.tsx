"use client";

import { PlusIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  isMealBookable,
  mealDeadlineNote,
  MEAL_KEYS,
  MEAL_LABELS,
  MEAL_SERVING_WINDOWS,
  mealSlot,
  mealTimes,
  type MealWindows,
} from "@/lib/meals";
import { addDaysToDateValue, formatDateValue } from "@/lib/tz";

/**
 * The days a **meals-only** booking asks the kitchen to cook on.
 *
 * A dining booking is not a stay, so it has no check-in and no check-out: it
 * is a set of dates, each with its own breakfast / lunch / dinner. The form
 * therefore asks for the dates one at a time — it opens on the first day that
 * still has a meal to offer, and "Add another date" adds the next — rather
 * than for a range with two date boxes, which made someone booking a single
 * lunch fill in a first and a last day that were the same.
 *
 * A meal that has passed its notice period (`isMealBookable`: it has to be
 * booked before the previous meal finishes being served) is shown disabled
 * with the deadline that was missed, rather than hidden — otherwise a row can
 * appear with nothing in it and no reason given.
 */
export function MealDatesPicker({
  dates,
  slots,
  onSlotsChange,
  onDatesChange,
  now,
  windows = MEAL_SERVING_WINDOWS,
  minDate,
  maxDate,
}: {
  /** Institute calendar dates ("yyyy-MM-dd"), in order. */
  dates: string[];
  /** Ticked `mealSlot` keys, owned by the booking form. */
  slots: ReadonlySet<string>;
  onSlotsChange: (next: Set<string>) => void;
  onDatesChange: (next: string[]) => void;
  /** The clock the notice period is measured against. */
  now: Date;
  /** The kitchen's serving times (Settings). */
  windows?: MealWindows;
  /** The earliest and latest date the office allows to be booked. */
  minDate?: string;
  maxDate?: string;
}) {
  const times = mealTimes(windows);

  const setSlots = (keys: string[], on: boolean) => {
    const next = new Set(slots);
    for (const key of keys) {
      if (on) next.add(key);
      else next.delete(key);
    }
    onSlotsChange(next);
  };

  /** Dates stay sorted and unique, so two rows can never mean the same day. */
  const replaceDate = (index: number, value: string) => {
    if (!value) return;
    const next = dates.map((d, i) => (i === index ? value : d));
    onDatesChange([...new Set(next)].sort());
  };

  const removeDate = (index: number) => {
    onDatesChange(dates.filter((_, i) => i !== index));
  };

  const addDate = () => {
    // The day after the last one chosen: consecutive days are the common
    // case, and any other date is one edit away in the row's own box.
    const last = dates[dates.length - 1];
    const candidate = last ? addDaysToDateValue(last, 1) : (minDate ?? "");
    if (!candidate || dates.includes(candidate)) return;
    onDatesChange([...dates, candidate].sort());
  };

  return (
    <div className="space-y-3">
      {dates.map((date, index) => {
        const bookable = MEAL_KEYS.filter((meal) => isMealBookable(date, meal, now, windows));
        return (
          <fieldset key={date} className="rounded-lg border p-3">
            <legend className="px-1 text-sm font-semibold">{formatDateValue(date)}</legend>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="space-y-1.5">
                <label
                  htmlFor={`meal-date-${index}`}
                  className="block text-xs text-muted-foreground"
                >
                  Date
                </label>
                <Input
                  id={`meal-date-${index}`}
                  type="date"
                  className="w-44"
                  value={date}
                  min={minDate}
                  max={maxDate}
                  onChange={(e) => replaceDate(index, e.target.value)}
                />
              </div>
              {dates.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => removeDate(index)}
                  aria-label={`Remove ${formatDateValue(date)}`}
                >
                  <Trash2Icon />
                  Remove day
                </Button>
              )}
            </div>

            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              {MEAL_KEYS.map((meal) => {
                const key = mealSlot(date, meal);
                const open = bookable.includes(meal);
                return (
                  <label
                    key={meal}
                    title={open ? undefined : `${mealDeadlineNote(date, meal, windows)} — that has passed.`}
                    className={
                      open
                        ? "flex cursor-pointer items-start gap-2.5 rounded-md border p-2.5 text-sm transition-colors has-checked:border-primary has-checked:bg-primary/5"
                        : "flex items-start gap-2.5 rounded-md border border-dashed p-2.5 text-sm text-muted-foreground"
                    }
                  >
                    <input
                      type="checkbox"
                      className="mt-0.5 size-4 shrink-0 accent-primary"
                      disabled={!open}
                      checked={open && slots.has(key)}
                      aria-label={`${MEAL_LABELS[meal]} on ${formatDateValue(date, { year: true })}`}
                      onChange={(e) => setSlots([key], e.target.checked)}
                    />
                    <span className="min-w-0">
                      <span className="block font-medium">{MEAL_LABELS[meal]}</span>
                      <span className="block text-xs text-muted-foreground">
                        {open ? times[meal] : "Too late — the kitchen has already ordered for it"}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        );
      })}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="outline" size="sm" onClick={addDate}>
          <PlusIcon />
          Add another date
        </Button>
        <p className="text-xs text-muted-foreground">
          Each meal has to be booked before the previous one finishes being served — lunch before
          breakfast ends, dinner before lunch ends, and a morning&apos;s breakfast before the
          evening before it ends.
        </p>
      </div>
    </div>
  );
}
