import { expect, type Cookie, type Page } from "@playwright/test";
import path from "node:path";

/**
 * Shared steps for the end-to-end journeys (Phase 9).
 *
 * Everything goes through the interface a person uses: sign in on the form,
 * fill the booking in, approve from the queue. Nothing reaches into the store,
 * so a test failing means a person would have been stuck too.
 *
 * Form fields are addressed by their `name` attribute, which react-hook-form
 * puts on every registered input (`rooms.0.guests.0.age`). That survives
 * re-wording a label, and it is the same key the payload is built from.
 */

/** The dummy directory's accounts (`lib/ldap/mock-directory.ts`). */
export const ACCOUNTS = {
  student: { uid: "112201001", password: "Anjali@2026", name: "Anjali Menon" },
  faculty: { uid: "priya", password: "Priya@2026", name: "Dr. Priya Sharma" },
  hod: { uid: "hod.cse", password: "HodCse@2026", name: "Prof. R. Venkatesh" },
  warden: { uid: "warden.malhar", password: "Malhar@2026", name: "Dr. Suresh Kumar" },
  manager: { uid: "guesthouse", password: "Manager@2026", name: "Guest House Manager" },
  caretaker: { uid: "gh.reception", password: "Reception@2026", name: "Guest House Caretaker" },
  developer: { uid: "developer", password: "Developer@2026", name: "Portal Developer" },
  iarStudentCell: { uid: "alumnicell", password: "AlumniCell@2026", name: "IAR Student Cell" },
  iarOffice: { uid: "iar", password: "IarOffice@2026", name: "IAR Office" },
} as const;

/** A 1×1 PNG that passes the upload sniffer, for guest ID documents. */
export const ID_DOCUMENT = path.join(process.cwd(), "e2e", "fixtures", "id-document.png");

/**
 * Each account's session cookies, kept for the rest of the run.
 *
 * The sign-in throttle counts every attempt — 8 per username per 15 minutes
 * (`RATE_LIMITS.signIn`) — and by 25 Sep 2026 the suite needed the manager
 * more often than that, so the journeys that came last were locked out with
 * "Too many attempts". A person at the desk stays signed in, and so does the
 * suite now: the **first** sign-in of each account goes through the form, and
 * later ones reuse its session. If the server no longer knows the session,
 * `/sign-in` shows the form again and the form is used.
 */
const sessions = new Map<string, Cookie[]>();

export async function signIn(page: Page, account: { uid: string; password: string }): Promise<void> {
  await page.context().clearCookies();
  const saved = sessions.get(account.uid);
  if (saved) {
    await page.context().addCookies(saved);
    // A live session is sent on from /sign-in to its home.
    await page.goto("/sign-in");
    if (!new URL(page.url()).pathname.startsWith("/sign-in")) return;
    await page.context().clearCookies();
  }
  await page.goto("/sign-in");
  await page.getByLabel("LDAP username").fill(account.uid);
  await page.getByLabel("LDAP password").fill(account.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/sign-in"), { timeout: 30_000 });
  sessions.set(account.uid, await page.context().cookies());
}

/** The institute's own clock — the one every date on the form is read in. */
const INSTITUTE_TIME_ZONE = "Asia/Kolkata";

function institutePartsAt(at: Date): { date: string; hour: number; minute: number } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: INSTITUTE_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
      .formatToParts(at)
      .map((p) => [p.type, p.value])
  ) as Record<string, string>;
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    // Midnight comes back as "24" in some ICU builds.
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
  };
}

/** `2026-09-25`, `days` from today, in the institute's own day. */
export function localDate(days: number): string {
  return institutePartsAt(new Date(Date.now() + days * 86_400_000)).date;
}

/**
 * A check-in the desk can actually act on today: far enough ahead that the
 * schema accepts it ("check-in must be in the future"), and inside the
 * two-hour grace `occupancyNotStartedError` allows, so the same run can mark
 * the guest Occupied. The minute is floored to the form's five-minute step.
 */
export function soonCheckIn(minutesAhead = 30): {
  date: string;
  hour12: string;
  minute: string;
  period: "AM" | "PM";
} {
  const { date, hour, minute } = institutePartsAt(new Date(Date.now() + minutesAhead * 60_000));
  return {
    date,
    hour12: String(hour % 12 === 0 ? 12 : hour % 12),
    minute: String(Math.floor(minute / 5) * 5),
    period: hour < 12 ? "AM" : "PM",
  };
}

/** Set one of the form's three-dropdown times ("Check-in", "Check-out"). */
export async function setTime(
  page: Page,
  label: string,
  time: { hour12: string; minute: string; period: "AM" | "PM" }
): Promise<void> {
  await page.getByLabel(`${label} hour`).selectOption(time.hour12);
  await page.getByLabel(`${label} minute`).selectOption(time.minute);
  await page.getByLabel(`${label} AM or PM`).selectOption(time.period);
}

/**
 * Pick a guest house, unless the form already settled on the only one offered.
 *
 * A role with one guest house is not shown a dropdown at all — the name is
 * stated and the id travels in a hidden field — so a filled value is the
 * answer, whatever element is holding it.
 */
export async function chooseGuestHouse(page: Page): Promise<void> {
  const house = page.locator('[name="guest_house_id"]');
  if (await house.inputValue()) return;
  const values = await house.locator("option").evaluateAll((options) =>
    options.map((o) => (o as HTMLOptionElement).value).filter(Boolean)
  );
  await house.selectOption(values[0]);
}

/**
 * The kitchen a dining booking is going to.
 *
 * A meals-only booking has no guest house question — only a kitchen can take
 * one and there is one — so the name is read from the card that states it. The
 * manager's console opens on a tab per guest house, so the journey still needs
 * to know which.
 */
export async function kitchenName(page: Page): Promise<string> {
  const text = await page.getByText(/Meals from the .* kitchen/).first().innerText();
  return text.match(/Meals from the (.+?) kitchen/)![1];
}

/** The institute calendar date after `date` ("yyyy-MM-dd"), as the form shows it. */
export function nextDay(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  return next.toISOString().slice(0, 10);
}

/**
 * The name of the guest house the form is currently set to — from the
 * dropdown's selected option, or from the statement that replaces it when the
 * role has only one.
 */
export async function selectedGuestHouseName(page: Page): Promise<string> {
  const field = page.locator('[name="guest_house_id"]');
  const isSelect = await field.evaluate((el) => el.tagName === "SELECT");
  if (isSelect) {
    return field.evaluate((el) => (el as HTMLSelectElement).selectedOptions[0]?.text.trim() ?? "");
  }
  return (await page.locator("#guest_house_id").innerText()).trim();
}

/** Fill one guest row in a room, with whichever fields that role's form asks for. */
export async function fillGuest(
  page: Page,
  room: number,
  guest: number,
  person: { name: string; age: string; gender?: string; relationship?: string; aadhaar?: string }
): Promise<void> {
  const base = `rooms.${room}.guests.${guest}`;
  const field = (leaf: string) => page.locator(`[name="${base}.${leaf}"]`);

  await field("name").fill(person.name);
  // An infant card ("Add infant") offers its ages as a list; a guest card is a number box.
  const age = field("age");
  if (await age.evaluate((el) => el.tagName === "SELECT")) await age.selectOption(person.age);
  else await age.fill(person.age);
  if (await field("gender").count()) await field("gender").selectOption(person.gender ?? "female");
  const relationship = field("relationship");
  if (await relationship.count()) {
    // The dropdown form takes an option; the free-text form takes a word.
    const isSelect = await relationship.evaluate((el) => el.tagName === "SELECT");
    if (isSelect) await relationship.selectOption(person.relationship ?? "Mother");
    else await relationship.fill(person.relationship ?? "Colleague");
  }
  const aadhaar = field("id_number");
  if (await aadhaar.count()) await aadhaar.fill(person.aadhaar ?? "432112345678");

  // The ID document has no `name` — it is held outside the form, by guest key.
  const upload = page.locator('input[type="file"]');
  const index = await upload.count();
  if (index > 0) {
    await upload.nth(Math.min(room + guest, index - 1)).setInputFiles(ID_DOCUMENT);
  }
}

/** Fill and submit a one-room stay; returns the reference the portal gave it. */
export async function submitRoomBooking(
  page: Page,
  options: {
    from?: number;
    to?: number;
    purpose?: string;
    guest?: { name: string; age: string; gender?: string; relationship?: string };
    /** An office's route: "direct" to the manager, or "hod" first. */
    officeApproval?: "direct" | "hod";
    bookingType?: string;
    debitHead?: string;
    /** Start the stay within the check-in grace, so the desk can admit it today. */
    startingToday?: boolean;
  } = {}
): Promise<string> {
  await page.goto("/book");
  await expect(page.getByRole("heading", { name: /New Booking/i })).toBeVisible();

  const bookingType = page.locator('[name="booking_type"]');
  if (options.bookingType && (await bookingType.count())) {
    await page.locator(`[name="booking_type"][value="${options.bookingType}"]`).check();
  }
  const route = page.locator(`[name="office_approval"][value="${options.officeApproval ?? ""}"]`);
  if (options.officeApproval && (await route.count())) await route.check();

  const head = page.locator('[name="debit_head"]');
  if (await head.count()) {
    const value = options.debitHead ?? (await head.first().getAttribute("value")) ?? "";
    await page.locator(`[name="debit_head"][value="${value}"]`).check();
  }

  await chooseGuestHouse(page);

  if (options.startingToday) {
    const start = soonCheckIn();
    await page.locator('[name="check_in_date"]').fill(start.date);
    await setTime(page, "Check-in", start);
    await page.locator('[name="check_out_date"]').fill(localDate(options.to ?? 2));
  } else {
    await page.locator('[name="check_in_date"]').fill(localDate(options.from ?? 3));
    await page.locator('[name="check_out_date"]').fill(localDate(options.to ?? 5));
  }
  await page.locator('[name="purpose_of_visit"]').fill(options.purpose ?? "End-to-end test stay");

  await fillGuest(page, 0, 0, options.guest ?? { name: "Test Guest", age: "44" });

  await page.locator('[name="privacy_consent"]').check();
  await page.getByRole("button", { name: "Submit booking request" }).click();

  // The confirmation carries the reference; the form then lands on the
  // dashboard, where it is the newest row either way.
  const toast = page.getByText(REFERENCE).first();
  await expect(toast).toBeVisible({ timeout: 30_000 });
  const reference = (await toast.innerText()).match(REFERENCE)![0];
  await page.waitForURL("**/dashboard", { timeout: 30_000 });
  return reference;
}

/** `IITPKD-GH-2026-K7P2M`, as `makeReference()` builds it. */
export const REFERENCE = /IITPKD-GH-\d{4}-[A-Z0-9]{5}/;

/** The reference of the newest booking on the requester's dashboard. */
export async function latestReference(page: Page): Promise<string> {
  const cell = page.getByText(REFERENCE).first();
  await expect(cell).toBeVisible({ timeout: 15_000 });
  return (await cell.innerText()).match(REFERENCE)![0];
}

/** The row of a queue table holding this reference. */
export function rowFor(page: Page, reference: string) {
  return page.locator("tr", { hasText: reference }).first();
}
