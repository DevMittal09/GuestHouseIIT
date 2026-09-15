/**
 * Every wall-clock time in this app is institute local time.
 *
 * The guest house is one physical building in Palakkad: "check in at 12:00"
 * means 12:00 there, whatever timezone the server runs in and whatever
 * timezone the browser reading it is set to. Before this module the app used
 * the *runtime's* timezone on both sides, which meant a booking made for
 * 12:00 showed up in the manager's console as 5:30 PM the moment the server
 * ran in UTC — the offset between UTC and IST, applied twice over.
 *
 * So: never call `new Date(...)` on a naked "YYYY-MM-DDTHH:mm" string, and
 * never format an instant with `toLocaleString()`/date-fns `format` without a
 * zone. Go through the helpers here instead. Instants stay ISO/UTC in storage;
 * only the presentation and the parsing of user-typed wall-clock times are
 * zoned.
 */
export const INSTITUTE_TIME_ZONE = "Asia/Kolkata";

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const pad = (n: number) => String(n).padStart(2, "0");

const PARTS_FORMAT = new Intl.DateTimeFormat("en-US", {
  timeZone: INSTITUTE_TIME_ZONE,
  hour12: false,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

export interface ZonedParts {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
  hour: number; // 0-23
  minute: number;
  second: number;
}

/** Wall-clock parts of an instant, as read in the institute's timezone. */
export function instituteParts(date: Date): ZonedParts {
  const lookup: Record<string, string> = {};
  for (const part of PARTS_FORMAT.formatToParts(date)) lookup[part.type] = part.value;
  return {
    year: Number(lookup.year),
    month: Number(lookup.month),
    day: Number(lookup.day),
    // Intl's h23 hourCycle can report midnight as "24" in some engines.
    hour: Number(lookup.hour) % 24,
    minute: Number(lookup.minute),
    second: Number(lookup.second),
  };
}

/** The institute's UTC offset in milliseconds at `date`. */
function offsetAt(date: Date): number {
  const p = instituteParts(date);
  const asIfUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  // Drop sub-second precision on both sides so the difference is the offset.
  return asIfUtc - Math.floor(date.getTime() / 1000) * 1000;
}

const LOCAL_DATETIME = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/;

/**
 * Turn a wall-clock string the user typed ("2026-09-15T12:00", or a bare
 * "2026-09-15") into the ISO instant it names in the institute's timezone.
 */
export function instituteIso(localDateTime: string): string {
  const match = LOCAL_DATETIME.exec(localDateTime.trim());
  if (!match) return new Date(localDateTime).toISOString();
  const [, y, mo, d, h, mi, s] = match;
  const guess = Date.UTC(
    Number(y),
    Number(mo) - 1,
    Number(d),
    Number(h ?? 0),
    Number(mi ?? 0),
    Number(s ?? 0)
  );
  // Resolve against the offset in force at the named instant, not at `guess`.
  // IST has no DST so one refinement is always enough; the second pass is
  // there so a future zone change would not silently shift bookings by an hour.
  const refined = guess - offsetAt(new Date(guess));
  return new Date(guess - offsetAt(new Date(refined))).toISOString();
}

/** Same as `instituteIso`, as a Date. */
export function instituteDate(localDateTime: string): Date {
  return new Date(instituteIso(localDateTime));
}

/** An instant as "YYYY-MM-DDTHH:mm" in institute time — the `<input>` shape. */
export function toInstituteDateTimeValue(iso: string | Date): string {
  const p = instituteParts(iso instanceof Date ? iso : new Date(iso));
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

/** An instant as "YYYY-MM-DD" in institute time — the `<input type="date">` shape. */
export function toInstituteDateValue(iso: string | Date): string {
  const p = instituteParts(iso instanceof Date ? iso : new Date(iso));
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** "12:00" style 24-hour wall clock of an instant, in institute time. */
export function toInstituteTimeValue(iso: string | Date): string {
  const p = instituteParts(iso instanceof Date ? iso : new Date(iso));
  return `${pad(p.hour)}:${pad(p.minute)}`;
}

/** "10 Sep 2026" in institute time. */
export function formatInstituteDate(iso: string | Date): string {
  const p = instituteParts(iso instanceof Date ? iso : new Date(iso));
  return `${p.day} ${MONTHS[p.month - 1]} ${p.year}`;
}

/** "10 Sep 2026, 12:00 PM" in institute time. */
export function formatInstituteDateTime(iso: string | Date): string {
  const p = instituteParts(iso instanceof Date ? iso : new Date(iso));
  const hour12 = p.hour % 12 === 0 ? 12 : p.hour % 12;
  return `${formatInstituteDate(iso)}, ${hour12}:${pad(p.minute)} ${p.hour < 12 ? "AM" : "PM"}`;
}

/** The hour (0-23) an instant falls in, in institute time. */
export function instituteHour(date: Date = new Date()): number {
  return instituteParts(date).hour;
}

/** Institute midnight of `day` ("YYYY-MM-DD") and of the day after. */
export function instituteDayBounds(day: string): { start: Date; end: Date } {
  const start = instituteDate(`${day}T00:00`);
  if (Number.isNaN(start.getTime())) return { start, end: start };
  // Add a calendar day in institute terms, not 24h, so a zone change could
  // never produce a 23- or 25-hour "day" here.
  const p = instituteParts(start);
  const nextDay = new Date(Date.UTC(p.year, p.month - 1, p.day + 1));
  const next = instituteParts(nextDay);
  return {
    start,
    end: instituteDate(`${next.year}-${pad(next.month)}-${pad(next.day)}T00:00`),
  };
}

// ---------------------------------------------------------------------------
// Calendar dates ("YYYY-MM-DD")
//
// A calendar date names a day, not an instant, so it has no timezone of its
// own. The arithmetic below runs in UTC only because a UTC day is always 24
// hours long; nothing here reads the runtime's zone and nothing becomes an
// instant. When you need the instants a day spans, use `instituteDayBounds`.

const DATE_VALUE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Year, month (1-12) and day of a "YYYY-MM-DD" date, or null when it is not a real date. */
export function parseDateValue(
  value: string
): { year: number; month: number; day: number } | null {
  const match = DATE_VALUE.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  // Date.UTC rolls 31 February over into March; a real date survives the trip.
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) return null;
  return { year, month, day };
}

/**
 * "YYYY-MM-DD" for a year, month (1-12) and day. Out-of-range parts roll over
 * the way `Date.UTC` does: day 0 is the last day of the previous month, and
 * month 13 is January of the following year.
 */
export function dateValueOf(year: number, month: number, day: number): string {
  const d = new Date(Date.UTC(year, month - 1, day));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** `value` moved by `days` calendar days: "2026-09-30" + 1 is "2026-10-01". */
export function addDaysToDateValue(value: string, days: number): string {
  const parts = parseDateValue(value);
  if (!parts) return value;
  return dateValueOf(parts.year, parts.month, parts.day + days);
}

/** Day of the week of a calendar date, 0 = Sunday. NaN when it is not a date. */
export function weekdayOfDateValue(value: string): number {
  const parts = parseDateValue(value);
  if (!parts) return Number.NaN;
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay();
}

/**
 * A calendar date for people: "Tue 15 Sep" by default. The options add the
 * year ("Tue 15 Sep 2026"), or drop the weekday ("15 Sep") or the month
 * ("Tue 15").
 */
export function formatDateValue(
  value: string,
  {
    weekday = true,
    month = true,
    year = false,
  }: { weekday?: boolean; month?: boolean; year?: boolean } = {}
): string {
  const parts = parseDateValue(value);
  if (!parts) return value;
  return [
    weekday ? WEEKDAYS[weekdayOfDateValue(value)] : null,
    String(parts.day),
    month ? MONTHS[parts.month - 1] : null,
    year ? String(parts.year) : null,
  ]
    .filter(Boolean)
    .join(" ");
}

/** "September 2026" for any date in that month. */
export function formatMonthOfDateValue(value: string): string {
  const parts = parseDateValue(value);
  if (!parts) return value;
  return `${MONTH_NAMES[parts.month - 1]} ${parts.year}`;
}
