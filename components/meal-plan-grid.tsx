"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  MEAL_KEYS,
  MEAL_LABELS,
  MEAL_SERVING_WINDOWS,
  mealSlot,
  mealTimes,
  mealUnavailableReason,
  type MealWindows,
  type StayMealDay,
} from "@/lib/meals";
import { formatDateValue } from "@/lib/tz";

/**
 * Meals for each day of a stay: days down the side, breakfast / lunch / dinner
 * across. A meal served before check-in or after check-out shows a dash and
 * cannot be ticked. Each column's "Every day" box ticks or clears that meal on
 * every day it is served.
 *
 * Controlled: the booking form owns the ticked slots (`mealSlot` keys) and
 * turns them into the submitted plan with `mealPlanFromSlots`.
 */
export function MealPlanGrid({
  days,
  checkIn,
  slots,
  onChange,
  windows = MEAL_SERVING_WINDOWS,
}: {
  days: StayMealDay[];
  checkIn: Date;
  slots: ReadonlySet<string>;
  onChange: (next: Set<string>) => void;
  /** The kitchen's serving times (Settings), for the column labels and the dashes. */
  windows?: MealWindows;
}) {
  const times = mealTimes(windows);
  const update = (keys: string[], on: boolean) => {
    const next = new Set(slots);
    for (const key of keys) {
      if (on) next.add(key);
      else next.delete(key);
    }
    onChange(next);
  };

  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="align-bottom">Day</TableHead>
            {MEAL_KEYS.map((meal) => {
              const served = days
                .filter((day) => day.available[meal])
                .map((day) => mealSlot(day.date, meal));
              const ticked = served.filter((key) => slots.has(key)).length;
              const everyDay = served.length > 0 && ticked === served.length;
              return (
                <TableHead key={meal} className="h-auto py-2 text-center align-bottom">
                  <span className="block text-foreground">{MEAL_LABELS[meal]}</span>
                  <span className="block text-xs font-normal text-muted-foreground">
                    {times[meal]}
                  </span>
                  <label className="mt-1 inline-flex cursor-pointer items-center gap-1.5 text-xs font-normal text-muted-foreground">
                    <input
                      type="checkbox"
                      className="size-3.5 accent-primary"
                      checked={everyDay}
                      disabled={served.length === 0}
                      ref={(el) => {
                        if (el) el.indeterminate = ticked > 0 && !everyDay;
                      }}
                      onChange={(e) => update(served, e.target.checked)}
                    />
                    Every day
                  </label>
                </TableHead>
              );
            })}
          </TableRow>
        </TableHeader>
        <TableBody>
          {days.map((day) => (
            <TableRow key={day.date}>
              <TableCell className="font-medium whitespace-nowrap">
                {formatDateValue(day.date)}
              </TableCell>
              {MEAL_KEYS.map((meal) => {
                if (!day.available[meal]) {
                  const reason =
                    mealUnavailableReason(day.date, meal, checkIn, windows) === "before-check-in"
                      ? "Served before check-in"
                      : "Served after check-out";
                  return (
                    <TableCell
                      key={meal}
                      className="text-center text-muted-foreground"
                      title={reason}
                    >
                      <span aria-hidden>—</span>
                      <span className="sr-only">{reason}</span>
                    </TableCell>
                  );
                }
                const key = mealSlot(day.date, meal);
                return (
                  <TableCell key={meal} className="p-0 text-center">
                    <label className="flex cursor-pointer justify-center p-2.5">
                      <input
                        type="checkbox"
                        className="size-4 accent-primary"
                        aria-label={`${MEAL_LABELS[meal]} on ${formatDateValue(day.date, {
                          year: true,
                        })}`}
                        checked={slots.has(key)}
                        onChange={(e) => update([key], e.target.checked)}
                      />
                    </label>
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
