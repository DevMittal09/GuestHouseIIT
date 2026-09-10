import {
  formatInstituteDate,
  formatInstituteDateTime,
  toInstituteDateTimeValue,
} from "./tz";

/**
 * Dates are always rendered in the institute's timezone, never the reader's or
 * the server's — see `lib/tz.ts` for why. Because these are pure functions of
 * the instant, a server-rendered date and its client hydration now agree even
 * when the two machines are in different zones.
 */
export function formatDateTime(iso: string): string {
  return formatInstituteDateTime(iso);
}

export function formatDate(iso: string): string {
  return formatInstituteDate(iso);
}

/** ISO string -> value for a date+time input pair, in institute time. */
export function toDatetimeLocal(iso: string): string {
  return toInstituteDateTimeValue(iso);
}
