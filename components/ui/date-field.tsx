"use client";

import { useState } from "react";
import { CalendarDays } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { addDaysToDateValue, formatDateValue, parseDateValue } from "@/lib/tz";
import { cn } from "@/lib/utils";

/**
 * **A date is picked from a calendar and never typed** (10 Nov 2026, the
 * owner: "calender-only input for dates no typing input").
 *
 * It replaces `<input type="date">`, which this project had used everywhere a
 * stay's dates are chosen. Three things were wrong with it, and the third is
 * the one that cost real bookings:
 *
 * 1. **It can be typed into**, and a half-typed date is a valid-looking one -
 *    `0002-11-20` is what you get by typing the year before the day.
 * 2. **It renders in the browser's own locale**, which this project noted it
 *    could do nothing about (`lib/tz.ts`): the whole portal reads DD/MM/YYYY
 *    and that one control read MM/DD/YYYY for anybody whose machine is set to
 *    en-US. A requester reading 11/20 as 11 December picked 20 November.
 * 3. **`min` and `max` only constrain the picker, not the typing** - a typed
 *    date outside them submits and is refused by the schema afterwards.
 *
 * So the trigger is a **button**, not a field: there is nothing to type into,
 * it prints the date the way every other date in the portal is printed, and
 * `min` / `max` are passed to the calendar as `disabled`, which cannot be
 * worked around because there is no text path at all.
 *
 * **It is still a real form value.** `value` and `onChange` carry the same
 * `"yyyy-MM-dd"` string the native input did, so every caller's state,
 * validation and submission are unchanged - this is the control swapped, not
 * the data.
 */
export function DateField({
  id,
  value,
  onChange,
  min,
  max,
  disabled = false,
  placeholder = "Choose a date",
  className,
  ariaLabel,
}: {
  id?: string;
  /** `"yyyy-MM-dd"`, or "" for nothing chosen yet. */
  value: string;
  onChange: (value: string) => void;
  /** Earliest and latest selectable day, as `"yyyy-MM-dd"`. */
  min?: string;
  max?: string;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  /** Where there is no visible `<Label>` pointing at `id`. */
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const parts = parseDateValue(value);

  /**
   * A calendar date has no timezone, so it is turned into a `Date` at **local
   * noon** - never midnight. `react-day-picker` compares with the runtime's
   * own zone, and a date built at midnight UTC lands on the previous day for
   * anybody west of it; noon is the only point that is the same calendar day
   * in every zone on earth. The same reasoning as `lib/tz.ts`.
   */
  const toDate = (v: string | undefined): Date | undefined => {
    const p = v ? parseDateValue(v) : null;
    return p ? new Date(p.year, p.month - 1, p.day, 12) : undefined;
  };
  const fromDate = (d: Date): string =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  const selected = toDate(value);
  const before = toDate(min);
  const after = toDate(max);

  return (
    <Popover open={disabled ? false : open} onOpenChange={setOpen}>
      <PopoverTrigger
        id={id}
        type="button"
        disabled={disabled}
        aria-label={ariaLabel}
        className={cn(
          "border-input flex h-10 w-full items-center justify-between gap-2 rounded border bg-background px-3 py-1 text-left text-sm transition-colors",
          "focus-visible:border-ink focus-visible:ring-1 focus-visible:ring-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-vermilion",
          "disabled:cursor-not-allowed disabled:bg-band disabled:opacity-60",
          !disabled && "cursor-pointer hover:border-border-strong",
          className
        )}
      >
        {/* The portal's own DD/MM/YYYY, with the weekday - which is what a
            person checks a booking date against. */}
        <span className={cn("truncate", !parts && "text-muted-foreground")}>
          {parts ? formatDateValue(value, { year: true }) : placeholder}
        </span>
        <CalendarDays aria-hidden className="size-4 shrink-0 text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          autoFocus
          selected={selected}
          // Opens on the chosen month, or on the earliest month that has a
          // selectable day - not on today, which may be outside the range.
          defaultMonth={selected ?? before ?? undefined}
          onSelect={(day) => {
            if (!day) return;
            onChange(fromDate(day));
            setOpen(false);
          }}
          disabled={[
            ...(before ? [{ before }] : []),
            ...(after ? [{ after }] : []),
          ]}
          startMonth={before}
          endMonth={after ? new Date(after.getFullYear(), after.getMonth() + 1, 0, 12) : undefined}
        />
      </PopoverContent>
    </Popover>
  );
}

/**
 * The day after `value`, for a "check-out must be after check-in" minimum.
 * Here rather than at each call site so the off-by-one lives in one place.
 */
export function dayAfter(value: string): string | undefined {
  return parseDateValue(value) ? addDaysToDateValue(value, 1) : undefined;
}
