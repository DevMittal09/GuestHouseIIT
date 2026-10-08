import { expect, test, type Page } from "@playwright/test";
import { ACCOUNTS, fillGuest, localDate, REFERENCE, rowFor, setTime, signIn } from "./helpers";

/** The secret `playwright.config.ts` starts the server with. */
const CRON_SECRET = "e2e-cron-secret-0123456789";

/**
 * The office's eighth list (7 Oct 2026), phase 1: the rates on the booking
 * form, a student held to one guest house with no meals, a personal booking
 * that is never asked which budget pays, and the Change rate button in
 * Tariffs & Invoicing.
 *
 * What a requester is told about availability is checked in
 * official-and-dining.spec.ts, beside the desk's own view of it; the meal
 * split filling itself in is checked in the dining journey there.
 */

/**
 * A console section at `path`, unlocking it if the lock screen is up. The
 * manager by default; All Bookings is the developer's alone.
 * Signing in as somebody else and back drops the unlock cookie, so this is
 * called again on the way back rather than once per test.
 */
async function openConsole(
  page: Page,
  path: string,
  heading: string,
  as: { uid: string; password: string } = ACCOUNTS.manager
) {
  await signIn(page, as);
  await page.goto(path);
  const password = page.getByLabel("Console password");
  if (await password.isVisible()) {
    await password.fill("0000");
    await page.getByRole("button", { name: "Unlock console" }).click();
  }
  await expect(page.getByRole("heading", { name: heading })).toBeVisible();
}

test("a student's form states one guest house, no meals, no debitable head, and the rates", async ({
  page,
}) => {
  await signIn(page, ACCOUNTS.student);
  await page.goto("/book");

  // One guest house, stated rather than offered as a dropdown - and the note
  // says why (7 Oct 2026).
  await expect(page.locator('select[name="guest_house_id"]')).toHaveCount(0);
  await expect(page.getByText(/accommodated at Bageshri Guest House/)).toBeVisible();

  // No meals at all: not the grid, not the preferences, not a service choice.
  await expect(page.getByRole("heading", { name: /^Meals/ })).toHaveCount(0);
  await expect(page.locator('[name="meal_veg_count"]')).toHaveCount(0);

  // A student's booking is personal, so the budget is never asked.
  await expect(page.getByText("Debitable head", { exact: true })).toHaveCount(0);
  await expect(page.locator('[name="debit_head"]')).toHaveCount(0);
  await expect(page.getByText("Payment", { exact: true })).toBeVisible();
  await expect(page.getByText(/settled at the time of checkout/)).toBeVisible();

  // And the rates for that guest house, from the office's own rate sheet.
  const rates = page.getByRole("table", { name: /Rates at Bageshri, in force today/ });
  await expect(rates).toBeVisible();
  await expect(rates.getByRole("cell", { name: "Room, per day" })).toBeVisible();
  // Bageshri has no kitchen, so no meal rates are quoted.
  await expect(rates.getByRole("cell", { name: "Lunch, per head" })).toHaveCount(0);
  // A figure or an honest "Not published", never a silent zero.
  await expect(rates.getByText(/₹|Not published/).first()).toBeVisible();
});

test("a faculty member sees the meal rates at the kitchen and is still asked on an official booking", async ({
  page,
}) => {
  await signIn(page, ACCOUNTS.faculty);
  await page.goto("/book");

  // Official by default: the budget is a question, Special Funds among the
  // answers.
  await expect(page.locator('[name="debit_head"][value="special_budget"]')).toBeVisible();

  const house = page.locator('select[name="guest_house_id"]');
  const hamsanandi = await house.locator("option", { hasText: "Hamsanandi" }).getAttribute("value");
  await house.selectOption(hamsanandi!);

  const rates = page.getByRole("table", { name: /Rates at Hamsanandi, in force today/ });
  await expect(rates).toBeVisible();
  await expect(rates.getByRole("cell", { name: "Room, per day" })).toBeVisible();
  await expect(rates.getByRole("cell", { name: "Lunch, per head" })).toBeVisible();
  await expect(page.getByText(/the same ones your invoice is priced from/)).toBeVisible();

  // Switching to a personal stay takes the question away entirely.
  await page.locator('[name="booking_type"][value="personal"]').check();
  await expect(page.locator('[name="debit_head"]')).toHaveCount(0);
  await expect(page.getByText("Payment", { exact: true })).toBeVisible();
});

/**
 * A rate in force is never edited - stays have been priced with it - so
 * **Change rate** adds a new row with the same scope from today. The office
 * asked for the button because repeating four dropdowns by hand is how a new
 * rate ends up applying to something slightly different from the old one.
 */
test("Change rate copies an in-force rate's scope into a new rate from today", async ({ page }) => {
  await openConsole(page, "/admin/billing", "Rates");

  const rows = page.locator("tr", { hasText: "Room, per day" });
  const before = await rows.count();
  const inForce = rows.first();
  await expect(inForce).toBeVisible();
  // The scope the button has to copy - this row is the Bageshri room rate.
  await expect(inForce.locator("td").nth(1)).toContainText("Bageshri");

  await inForce.getByRole("button", { name: "Change rate" }).click();
  await expect(page.getByText("Change this rate", { exact: true })).toBeVisible();
  await expect(page.getByText(/this adds a new one with the same scope/)).toBeVisible();
  // Same scope, dated today, with the rate left blank for the new figure.
  await expect(page.locator("#t-item")).toHaveValue("room");
  await expect(page.locator("#t-gh")).not.toHaveValue("");
  await expect(page.locator("#t-from")).toHaveValue(localDate(0));
  await expect(page.locator("#t-rate")).toHaveValue("");

  // Cancel puts the form back to an ordinary, empty "Add a rate" - and
  // nothing was saved, so the table is as it was.
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByText("Change this rate", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Add a rate", { exact: true })).toBeVisible();
  await expect(page.locator("#t-gh")).toHaveValue("");
  await expect(rows).toHaveCount(before);
});

/**
 * Academic records (migration 28): the office pastes the institute's records
 * in, and from that moment the student's booking form takes their parents'
 * names from them.
 *
 * The journey is the whole point of the round, so it is one test: import a
 * student whose father is **not** the published dummy record's, then watch
 * that student's form lock the box to the imported name. Clears up after
 * itself - the journeys share one database, and a record left behind would
 * change what every later student test sees.
 */
test("a record pasted into the console locks the student's parents on the booking form", async ({
  page,
}) => {
  await openConsole(page, "/admin/academic", "Academic records");

  // Students is the kind the form reads; it opens on it.
  await expect(page.locator("#record-kind")).toHaveValue("student");

  // A paste with a line that cannot be read imports nothing, and says which.
  const paste = page.locator("#academic-paste");
  await paste.fill("not-an-email, 1, Broken");
  await page.getByRole("button", { name: "Check the paste" }).click();
  await expect(page.getByText(/Nothing was imported/)).toBeVisible();
  await expect(page.getByText(/Line 1: "not-an-email" is not an email address/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Import" })).toBeDisabled();

  // The real paste: this student's father is not the one the dummy record
  // gives, so the form has to be reading the import rather than the dummy.
  await paste.fill(
    "112201001@smail.iitpkd.ac.in, 112201001, Anjali Menon, B.Tech, Computer Science and Engineering, +91 90000 00101, Ramesh Krishnan Menon, Sreeja Menon, , Malhar"
  );
  await page.getByRole("button", { name: "Check the paste" }).click();
  await expect(page.getByText("1 added.")).toBeVisible();
  await page.getByRole("button", { name: "Import" }).click();
  await expect(page.getByRole("cell", { name: "Ramesh Krishnan Menon" })).toBeVisible();

  // Now the student's own form.
  await signIn(page, ACCOUNTS.student);
  await page.goto("/book");
  const relationship = page.locator('[name="rooms.0.guests.0.relationship"]');
  const name = page.locator('[name="rooms.0.guests.0.name"]');

  // A parent is on record, so no guardian may be booked - the option is not
  // offered at all, rather than offered and refused.
  await expect(relationship.locator('option[value="Guardian"]')).toHaveCount(0);
  await expect(relationship.locator('option[value="Siblings"]')).toHaveCount(1);

  await relationship.selectOption("Father");
  await expect(name).toHaveValue("Ramesh Krishnan Menon");
  await expect(name).toHaveAttribute("readonly", "");
  await expect(page.getByText(/From your academic record/)).toBeVisible();
  // No Aadhaar and no ID document are demanded of a guest the record named.
  await expect(page.getByText("Aadhaar number (optional)")).toBeVisible();
  await expect(page.getByText("ID document (optional)")).toBeVisible();

  // Mother is locked too, and a sibling is still typed and still asked.
  await relationship.selectOption("Mother");
  await expect(name).toHaveValue("Sreeja Menon");
  await relationship.selectOption("Siblings");
  await expect(name).not.toHaveAttribute("readonly", "");
  await expect(page.getByText("Aadhaar number *")).toBeVisible();

  // Put the database back as the other journeys expect it.
  await openConsole(page, "/admin/academic", "Academic records");
  await page.getByRole("button", { name: "Clear every record" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox").fill("CLEAR ALL");
  await dialog.getByRole("button", { name: "Clear" }).click();
  await expect(page.getByText(/Nothing imported for this kind yet/)).toBeVisible();
});

/**
 * **Missed** - a request nobody decided before its check-in (migration 29).
 *
 * The whole way through: a student books a stay beginning at midnight this
 * morning, nobody decides it, the nightly job marks it and tells them, and
 * the manager puts it back in the queue it was waiting in.
 *
 * Midnight today is the earliest check-in the form accepts
 * (`earliestBookableCheckIn`, 1 Oct 2026) and is by definition already past,
 * which is what makes a genuinely lapsed request reachable through the UI
 * rather than forced with the developer's repair tool.
 */
test("a missed request reaches the manager's console and can be reinstated", async ({ page }) => {
  await signIn(page, ACCOUNTS.student);
  await page.goto("/book");
  await expect(page.getByRole("heading", { name: /New Booking/i })).toBeVisible();
  await page.locator('[name="check_in_date"]').fill(localDate(0));
  await setTime(page, "Check-in", { hour12: "12", minute: "00", period: "AM" });
  await page.locator('[name="check_out_date"]').fill(localDate(1));
  await page.locator('[name="purpose_of_visit"]').fill("Parents visiting - nobody decides this one");
  await fillGuest(page, 0, 0, { name: "Sreeja Menon", age: "50", gender: "female", relationship: "Mother" });
  await page.locator('[name="privacy_consent"]').check();
  await page.getByRole("button", { name: "Submit booking request" }).click();
  const toast = page.getByText(REFERENCE).first();
  await expect(toast).toBeVisible({ timeout: 30_000 });
  const reference = (await toast.innerText()).match(REFERENCE)![0];
  await page.waitForURL("**/dashboard", { timeout: 30_000 });
  await expect(rowFor(page, reference)).toContainText(/Warden/i);

  // The nightly job, run as the cron runner does: POST with the secret.
  const cron = await page.request.post("/api/mail/cron", {
    headers: { Authorization: `Bearer ${CRON_SECRET}` },
  });
  expect(cron.ok()).toBe(true);
  expect((await cron.json()).missed).toBeGreaterThanOrEqual(1);

  // The requester sees it for what it is, instead of "pending" for ever.
  await page.goto("/dashboard");
  await expect(rowFor(page, reference)).toContainText("Missed");
  // And there is nothing left for them to cancel.
  await expect(rowFor(page, reference).getByRole("button", { name: /^Cancel/ })).toHaveCount(0);

  // It has left the warden's queue - there is no decision to make any more.
  await signIn(page, ACCOUNTS.warden);
  await page.goto("/warden");
  await expect(rowFor(page, reference)).toHaveCount(0);

  // The manager's console has its own section for them, out of the queues.
  await signIn(page, ACCOUNTS.manager);
  await page.goto("/manager?gh=bageshri");
  const missed = page.locator("section", {
    has: page.getByRole("heading", { name: /Missed requests/ }),
  });
  const row = missed.locator("tr", { hasText: reference });
  await expect(row).toBeVisible({ timeout: 30_000 });
  // It says where it was waiting, because that is where Reinstate sends it.
  await expect(row).toContainText("Pending Assistant Warden Review");

  /**
   * **Running it twice changes nothing** - the office's own test. A second
   * run marks nothing, because the request is no longer in an active status.
   */
  const again = await page.request.post("/api/mail/cron", {
    headers: { Authorization: `Bearer ${CRON_SECRET}` },
  });
  expect((await again.json()).missed).toBe(0);

  // Reinstating asks for a reason - it goes in the log - and puts it back.
  await row.getByRole("button", { name: "Reinstate" }).click();
  const reason = missed.getByLabel(/Why are you putting this request back/);
  await expect(reason).toBeVisible();
  await reason.fill("The guest is coming next week instead");
  await missed.getByRole("button", { name: "Reinstate", exact: true }).click();
  await expect(page.getByText(/Pending Assistant Warden Review/).first()).toBeVisible({
    timeout: 30_000,
  });

  // Back in the warden's queue, and out of the Missed list - and the next
  // run of the job leaves it alone, although its check-in is still past.
  await signIn(page, ACCOUNTS.warden);
  await page.goto("/warden");
  await expect(rowFor(page, reference)).toBeVisible({ timeout: 30_000 });
  const third = await page.request.post("/api/mail/cron", {
    headers: { Authorization: `Bearer ${CRON_SECRET}` },
  });
  expect((await third.json()).missed).toBe(0);
  await page.goto("/warden");
  await expect(rowFor(page, reference)).toBeVisible();
});
