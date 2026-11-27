"use client";

import { useState } from "react";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DateField } from "@/components/ui/date-field";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  chainMealDates,
  exclusiveMealOf,
  isMealBookable,
  mealDeadlineNote,
  DEFAULT_MEALS_ON,
  MEAL_KEYS,
  MEAL_LABELS,
  MEAL_SERVING_WINDOWS,
  mealSlot,
  mealTimes,
  type MealWindows,
} from "@/lib/meals";
import type { MealKey } from "@/lib/types";
import { addDaysToDateValue, formatDateValue } from "@/lib/tz";

/**
 * The days a **meals-only** booking asks the kitchen to cook on.
 *
 * Two modes: individual dates (one at a time, with "Add another date") and
 * chain booking (a date range that generates a table of days x meals, updated
 * live as the range or weekend toggles change).
 */
export function MealDatesPicker({
  dates,
  slots,
  onSlotsChange,
  onDatesChange,
  onBatchChange,
  now,
  windows = MEAL_SERVING_WINDOWS,
  minDate,
  maxDate,
}: {
  dates: string[];
  slots: ReadonlySet<string>;
  onSlotsChange: (next: Set<string>) => void;
  onDatesChange: (next: string[]) => void;
  onBatchChange?: (dates: string[], slots: Set<string>) => void;
  now: Date;
  windows?: MealWindows;
  minDate?: string;
  maxDate?: string;
}) {
  const times = mealTimes(windows);

  const setSlots = (keys: string[], on: boolean) => {
    const next = new Set(slots);
    for (const key of keys) {
      if (on) {
        next.add(key);
        const [date, meal] = key.split("|") as [string, MealKey];
        const excl = exclusiveMealOf(meal);
        if (excl) next.delete(mealSlot(date, excl));
      } else {
        next.delete(key);
      }
    }
    onSlotsChange(next);
  };

  const replaceDate = (index: number, value: string) => {
    if (!value) return;
    const next = dates.map((d, i) => (i === index ? value : d));
    onDatesChange([...new Set(next)].sort());
  };

  const removeDate = (index: number) => {
    onDatesChange(dates.filter((_, i) => i !== index));
  };

  const [chainMode, setChainMode] = useState(false);
  const [chainFrom, setChainFrom] = useState(minDate ?? "");
  const [chainTo, setChainTo] = useState("");
  const [includeSaturdays, setIncludeSaturdays] = useState(false);
  const [includeSundays, setIncludeSundays] = useState(false);

  const syncChain = (from: string, to: string, sat: boolean, sun: boolean) => {
    if (!from || !to || from > to) return;
    const generated = chainMealDates(from, to, sat, sun);
    const prevSet = new Set(dates);
    const next = new Set<string>();

    for (const s of slots) {
      const [d] = s.split("|");
      if (generated.includes(d)) next.add(s);
    }

    for (const date of generated) {
      if (!prevSet.has(date)) {
        for (const meal of MEAL_KEYS) {
          if (DEFAULT_MEALS_ON[meal] && isMealBookable(date, meal, now, windows)) {
            next.add(mealSlot(date, meal));
          }
        }
      }
    }

    if (onBatchChange) {
      onBatchChange(generated, next);
    } else {
      onDatesChange(generated);
      onSlotsChange(next);
    }
  };

  const addDate = () => {
    const last = dates[dates.length - 1];
    const candidate = last ? addDaysToDateValue(last, 1) : (minDate ?? "");
    if (!candidate || dates.includes(candidate)) return;
    onDatesChange([...dates, candidate].sort());
  };

  // --- Non-chain: per-day fieldsets ---
  const dateRows = dates.map((date, index) => {
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
            <DateField
              id={`meal-date-${index}`}
              className="w-56"
              value={date}
              min={minDate}
              max={maxDate}
              onChange={(v) => replaceDate(index, v)}
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

        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {MEAL_KEYS.map((meal) => {
            const key = mealSlot(date, meal);
            const open = bookable.includes(meal);
            const excl = exclusiveMealOf(meal);
            const blocked = open && excl ? slots.has(mealSlot(date, excl)) : false;
            const disabled = !open || blocked;
            const hint = !open
              ? "Too late - the kitchen has already ordered for it"
              : blocked
                ? `${MEAL_LABELS[excl!]} is already selected`
                : times[meal];
            return (
              <label
                key={meal}
                title={!open ? `${mealDeadlineNote(date, meal, windows)} - that has passed.` : blocked ? hint : undefined}
                className={
                  disabled
                    ? "flex items-start gap-2.5 rounded-md border border-dashed p-2.5 text-sm text-muted-foreground"
                    : "flex cursor-pointer items-start gap-2.5 rounded-md border p-2.5 text-sm transition-colors has-checked:border-primary has-checked:bg-primary/5"
                }
              >
                <input
                  type="checkbox"
                  className="mt-0.5 size-4 shrink-0 accent-primary"
                  disabled={disabled}
                  checked={open && !blocked && slots.has(key)}
                  aria-label={`${MEAL_LABELS[meal]} on ${formatDateValue(date, { year: true })}`}
                  onChange={(e) => setSlots([key], e.target.checked)}
                />
                <span className="min-w-0">
                  <span className="block font-medium">{MEAL_LABELS[meal]}</span>
                  <span className="block text-xs text-muted-foreground">{hint}</span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>
    );
  });

  return (
    <div className="space-y-3">
      {/* Mode toggle */}
      <div className="flex items-center gap-4">
        <span className="text-sm font-medium">Chain booking?</span>
        <label className="flex items-center gap-1.5 text-sm">
          <input
            type="radio"
            name="meal-date-mode"
            className="size-4 accent-primary"
            checked={!chainMode}
            onChange={() => setChainMode(false)}
          />
          No
        </label>
        <label className="flex items-center gap-1.5 text-sm">
          <input
            type="radio"
            name="meal-date-mode"
            className="size-4 accent-primary"
            checked={chainMode}
            onChange={() => setChainMode(true)}
          />
          Yes
        </label>
      </div>

      {chainMode ? (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Pick a date range. Saturdays and Sundays are excluded by default.
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <label htmlFor="chain-from" className="block text-xs text-muted-foreground">
                From
              </label>
              <DateField
                id="chain-from"
                className="w-48"
                value={chainFrom}
                min={minDate}
                max={maxDate}
                onChange={(v) => {
                  setChainFrom(v);
                  syncChain(v, chainTo, includeSaturdays, includeSundays);
                }}
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="chain-to" className="block text-xs text-muted-foreground">
                To
              </label>
              <DateField
                id="chain-to"
                className="w-48"
                value={chainTo}
                min={chainFrom || minDate}
                max={maxDate}
                onChange={(v) => {
                  setChainTo(v);
                  syncChain(chainFrom, v, includeSaturdays, includeSundays);
                }}
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4 accent-primary"
                checked={includeSaturdays}
                onChange={(e) => {
                  setIncludeSaturdays(e.target.checked);
                  syncChain(chainFrom, chainTo, e.target.checked, includeSundays);
                }}
              />
              Include Saturdays
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4 accent-primary"
                checked={includeSundays}
                onChange={(e) => {
                  setIncludeSundays(e.target.checked);
                  syncChain(chainFrom, chainTo, includeSaturdays, e.target.checked);
                }}
              />
              Include Sundays
            </label>
          </div>

          {/* Live table of generated dates */}
          {dates.length > 0 && (
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="align-bottom">Day</TableHead>
                    {MEAL_KEYS.map((meal) => {
                      const served = dates
                        .filter((d) => isMealBookable(d, meal, now, windows))
                        .map((d) => mealSlot(d, meal));
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
                              onChange={(e) => setSlots(served, e.target.checked)}
                            />
                          </label>
                        </TableHead>
                      );
                    })}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dates.map((date) => (
                    <TableRow key={date}>
                      <TableCell className="font-medium whitespace-nowrap">
                        {formatDateValue(date)}
                      </TableCell>
                      {MEAL_KEYS.map((meal) => {
                        const bookable = isMealBookable(date, meal, now, windows);
                        if (!bookable) {
                          const reason = `Too late - ${mealDeadlineNote(date, meal, windows)}`;
                          return (
                            <TableCell
                              key={meal}
                              className="p-0 text-center text-muted-foreground"
                              title={reason}
                            >
                              <div className="flex items-center justify-center p-2.5">
                                <span aria-hidden>-</span>
                                <span className="sr-only">{reason}</span>
                              </div>
                            </TableCell>
                          );
                        }
                        const key = mealSlot(date, meal);
                        const excl = exclusiveMealOf(meal);
                        const blocked = excl ? slots.has(mealSlot(date, excl)) : false;
                        return (
                          <TableCell key={meal} className="p-0 text-center">
                            <label
                              className={blocked ? "flex justify-center p-2.5 text-muted-foreground" : "flex cursor-pointer justify-center p-2.5"}
                              title={blocked ? `${MEAL_LABELS[excl!]} is already selected for this day` : undefined}
                            >
                              <input
                                type="checkbox"
                                className="size-4 accent-primary"
                                aria-label={`${MEAL_LABELS[meal]} on ${formatDateValue(date, { year: true })}`}
                                checked={slots.has(key)}
                                disabled={blocked}
                                onChange={(e) => setSlots([key], e.target.checked)}
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
          )}
        </div>
      ) : (
        <>
          {dateRows}
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" variant="outline" size="sm" onClick={addDate}>
              <PlusIcon />
              Add another date
            </Button>
            <p className="text-xs text-muted-foreground">
              Each meal has to be booked before the previous one finishes being served - lunch before
              breakfast ends, dinner before lunch ends, and a morning&apos;s breakfast before the
              evening before it ends.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
