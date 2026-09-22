import { revalidatePath, revalidateTag } from "next/cache";
import { SITE_CACHE_TAG } from "./site-data";

/**
 * What to re-render after a change (Phase 9).
 *
 * Every action used to call `revalidatePath("/", "layout")`, which throws away
 * the cache for **the whole application** — the public site, the guidelines,
 * the gallery, every console page — because one booking moved. That made the
 * public site uncacheable in practice and re-rendered a dozen pages nobody was
 * looking at.
 *
 * These are the sets that actually change together. They stay lists rather
 * than one clever helper so it is obvious, at the call site, what a change is
 * claimed to affect.
 */

/** Queues, desks and the requester's own list: anything that shows a booking. */
const BOOKING_VIEWS = [
  "/dashboard",
  "/manager",
  "/manager/meals",
  "/caretaker",
  "/warden",
  "/fa",
  "/hod",
  "/iar",
  "/approvals",
  "/history",
  "/availability",
];

/** The console sections that read accounts, units, rooms or settings. */
const CONSOLE_VIEWS = [
  "/admin",
  "/admin/users",
  "/admin/units",
  "/admin/projects",
  "/admin/guest-houses",
  "/admin/billing",
  "/admin/settings",
  "/admin/forms",
  "/admin/bookings",
  "/admin/security",
  "/admin/audit",
];

/** The public site, which only changes when guest houses, rooms or rules do. */
const PUBLIC_PAGES = ["/", "/guidelines", "/book-room", "/book-meal", "/contact"];

function revalidate(paths: string[]): void {
  for (const path of paths) revalidatePath(path);
}

/** A booking changed: status, dates, rooms, meals, an invoice. */
export function revalidateBookings(): void {
  revalidate(BOOKING_VIEWS);
}

/** Accounts, units, rooms, projects, mail templates: the console's own data. */
export function revalidateConsole(): void {
  revalidate(CONSOLE_VIEWS);
}

/**
 * Settings, guest houses or rooms: the rules the public site quotes and every
 * booking view reads. The one change that genuinely touches everything.
 */
export function revalidateEverything(): void {
  // The public pages read their data through the `site` tag, so expiring it is
  // what actually changes what the brochure says; the paths re-render it.
  // "max" is Next 16's "however long it was going to live, it is stale now".
  revalidateTag(SITE_CACHE_TAG, "max");
  revalidate([...PUBLIC_PAGES, ...BOOKING_VIEWS, ...CONSOLE_VIEWS]);
}
