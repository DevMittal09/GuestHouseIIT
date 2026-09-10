"use client";

import { NativeSelect } from "./native-select";

const HOURS_12 = Array.from({ length: 12 }, (_, i) => (i === 0 ? 12 : i)); // 12, 1..11
const MINUTE_STEPS = Array.from({ length: 12 }, (_, i) => i * 5); // 0, 5 … 55

const pad = (n: number) => String(n).padStart(2, "0");

/** Split a "HH:mm" 24-hour string into alarm-clock parts. */
export function parseTime(value: string): {
  hour12: number;
  minute: number;
  period: "AM" | "PM";
} {
  // An unusable value falls back to 00:00 (12 AM) rather than producing NaN.
  const [h, m] = value.split(":").map(Number);
  const hour24 = Number.isFinite(h) ? Math.min(Math.max(h, 0), 23) : 0;
  const minute = Number.isFinite(m) ? Math.min(Math.max(m, 0), 59) : 0;
  return {
    hour12: hour24 % 12 === 0 ? 12 : hour24 % 12,
    minute,
    period: hour24 >= 12 ? "PM" : "AM",
  };
}

export function toTimeValue(hour12: number, minute: number, period: "AM" | "PM"): string {
  const hour24 = (hour12 % 12) + (period === "PM" ? 12 : 0);
  return `${pad(hour24)}:${pad(minute)}`;
}

/** "9:00 PM" — the plain reading of a "HH:mm" value. */
export function describeTime(value: string): string {
  const { hour12, minute, period } = parseTime(value);
  return `${hour12}:${pad(minute)} ${period}`;
}

/**
 * Alarm-clock style time picker: separate hour, minute and AM/PM dropdowns.
 * `value`/`onChange` speak "HH:mm" in 24-hour form (what the form payload uses).
 * Native selects also accept type-ahead, so the time can be typed as well.
 *
 * **The AM/PM dropdown keeps whatever it already held when the hour changes**,
 * which is correct but easy to miss: a field defaulting to 12:00 reads as PM,
 * so changing the hour to 9 gives 9 PM, not the 9 AM the user meant. That
 * silently produced "Check-out must be after check-in" on a booking the user
 * had filled in correctly as far as they could see. Hence the read-back below
 * the dropdowns — the resolved time is spelled out so a wrong period is
 * visible before submitting, not after.
 */
export function TimeSelect({
  value,
  onChange,
  label = "Time",
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  /** Accessible prefix for the three dropdowns, e.g. "Check-in". */
  label?: string;
  disabled?: boolean;
}) {
  const { hour12, minute, period } = parseTime(value);
  // Keep an off-step minute (e.g. an existing 14:37 booking) selectable.
  const minutes = MINUTE_STEPS.includes(minute)
    ? MINUTE_STEPS
    : [...MINUTE_STEPS, minute].sort((a, b) => a - b);

  return (
    <div className="space-y-1">
    <div className="flex items-center gap-1">
      <NativeSelect
        aria-label={`${label} hour`}
        className="w-[4.5rem] px-2 text-center"
        disabled={disabled}
        value={hour12}
        onChange={(e) => onChange(toTimeValue(Number(e.target.value), minute, period))}
      >
        {HOURS_12.map((h) => (
          <option key={h} value={h}>
            {pad(h)}
          </option>
        ))}
      </NativeSelect>
      <span className="font-semibold text-muted-foreground">:</span>
      <NativeSelect
        aria-label={`${label} minute`}
        className="w-[4.5rem] px-2 text-center"
        disabled={disabled}
        value={minute}
        onChange={(e) => onChange(toTimeValue(hour12, Number(e.target.value), period))}
      >
        {minutes.map((m) => (
          <option key={m} value={m}>
            {pad(m)}
          </option>
        ))}
      </NativeSelect>
      <NativeSelect
        aria-label={`${label} AM or PM`}
        className="w-[4.5rem] px-2 text-center"
        disabled={disabled}
        value={period}
        onChange={(e) => onChange(toTimeValue(hour12, minute, e.target.value as "AM" | "PM"))}
      >
        <option value="AM">AM</option>
        <option value="PM">PM</option>
      </NativeSelect>
    </div>
      <p className="text-xs text-muted-foreground">
        {label}: <span className="font-medium text-foreground">{describeTime(value)}</span>
      </p>
    </div>
  );
}
