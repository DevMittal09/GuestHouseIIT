import { format } from "date-fns";

export function formatDateTime(iso: string): string {
  return format(new Date(iso), "d MMM yyyy, h:mm a");
}

export function formatDate(iso: string): string {
  return format(new Date(iso), "d MMM yyyy");
}

/** ISO string -> value for <input type="datetime-local"> in local time. */
export function toDatetimeLocal(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
