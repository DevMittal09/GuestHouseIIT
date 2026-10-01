import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  ACCOUNTS,
  fillGuest,
  ID_DOCUMENT,
  localDate,
  REFERENCE,
  rowFor,
  setTime,
  signIn,
  soonCheckIn,
} from "./helpers";

/**
 * The office's fifth list of corrections (25 Sep 2026), through the real
 * forms: a student's father filled in from the academic record and checked by
 * the Assistant Warden, the infant card, an earlier check-in at reception,
 * and an invoice that bills the meals and the additional charge the desk adds.
 */

/** ₹1,23,456.00 → 123456 */
function rupees(text: string): number {
  return Number(text.replace(/[^\d.]/g, ""));
}

async function grandTotal(invoice: Locator): Promise<number> {
  return rupees(await invoice.locator("tr", { hasText: "Grand Total" }).locator("td").last().innerText());
}

/**
 * A faculty member's personal stay at Bageshri, starting within the hour so
 * reception can check the guest in — straight to the manager, who allocates.
 */
async function facultyStayStartingNow(page: Page): Promise<string> {
  await signIn(page, ACCOUNTS.faculty);
  await page.goto("/book");
  await page.locator('[name="booking_type"][value="personal"]').check();
  // Personal Funds or Special Funds since 25 Sep 2026.
  await expect(page.locator('[name="debit_head"][value="special_budget"]')).toBeVisible();
  await page.locator('[name="debit_head"][value="personal_funds"]').check();
  const house = page.locator('select[name="guest_house_id"]');
  const bageshri = await house.locator("option", { hasText: "Bageshri" }).getAttribute("value");
  await house.selectOption(bageshri!);
  const start = soonCheckIn();
  await page.locator('[name="check_in_date"]').fill(start.date);
  await setTime(page, "Check-in", start);
  await page.locator('[name="check_out_date"]').fill(localDate(2));
  await page.locator('[name="purpose_of_visit"]').fill("Family visit");
  await fillGuest(page, 0, 0, { name: "Meera Sharma", age: "60", gender: "female", relationship: "Mother" });
  await page.locator('[name="privacy_consent"]').check();
  await page.getByRole("button", { name: "Submit booking request" }).click();
  const toast = page.getByText(REFERENCE).first();
  await expect(toast).toBeVisible({ timeout: 30_000 });
  const reference = (await toast.innerText()).match(REFERENCE)![0];
  await page.waitForURL("**/dashboard", { timeout: 30_000 });

  // The manager allocates the first room that is simply free — not one inside
  // another stay's turnaround, which would ask for an override.
  await signIn(page, ACCOUNTS.manager);
  await page.goto("/manager?gh=bageshri");
  await rowFor(page, reference).getByRole("button", { name: /Review & Allocate/ }).click();
  const dialog = page.getByRole("dialog");
  // Tiles render before the room's occupancy arrives; pick once it has.
  await expect(dialog.getByRole("button", { name: "Refresh availability" })).toBeVisible();
  await expect(dialog.getByText("Loading occupancy…")).toHaveCount(0, { timeout: 30_000 });
  await dialog.locator('button[title*="Occupancy:"]:not([disabled])').first().click();
  await dialog.getByRole("button", { name: /Confirm & Allocate/ }).click();
  await expect(dialog).toBeHidden({ timeout: 30_000 });
  return reference;
}

test("a student's father is filled in on request, an infant gets an infant card, and the warden sees both checked", async ({ page }) => {
  await signIn(page, ACCOUNTS.student);
  await page.goto("/book");
  await page.locator('[name="check_in_date"]').fill(localDate(3));
  await page.locator('[name="check_out_date"]').fill(localDate(5));
  await page.locator('[name="purpose_of_visit"]').fill("Father and my niece visiting");

  /**
   * **Choosing a relationship fills in nothing** (1 Oct 2026, the office:
   * "remove auto-fill even for parents"). A box that writes itself is a box
   * nobody checks. What the portal knows is one click away instead — the
   * compact "Fill in…" list on the guest's own card, which sets the name, the
   * gender, the relationship and the citizenship together.
   */
  await page.locator('[name="rooms.0.guests.0.relationship"]').selectOption("Father");
  await expect(page.locator('[name="rooms.0.guests.0.name"]')).toHaveValue("");
  await expect(page.locator('[name="rooms.0.guests.0.gender"]')).toHaveValue("");

  await page
    .getByLabel("Fill in guest 1 from saved details")
    .selectOption({ label: "Ramesh Menon — Father (academic record)" });
  await expect(page.locator('[name="rooms.0.guests.0.name"]')).toHaveValue("Ramesh Menon");
  await expect(page.locator('[name="rooms.0.guests.0.gender"]')).toHaveValue("male");
  await expect(page.locator('[name="rooms.0.guests.0.relationship"]')).toHaveValue("Father");
  await expect(page.getByText("As on your academic record (Father).")).toBeVisible();
  await page.locator('[name="rooms.0.guests.0.age"]').fill("55");
  await page.locator('[name="rooms.0.guests.0.id_number"]').fill("432112345678");
  await page.locator('input[type="file"]').first().setInputFiles(ID_DOCUMENT);

  // "Add infant" makes an infant card: its age is a list below 5, no ID asked.
  const room = page.locator("fieldset", { has: page.getByText("Room 1", { exact: true }) });
  await room.getByRole("button", { name: /Add infant/ }).click();
  await expect(room.getByText(/^Infant 1/)).toBeVisible();
  const infantAge = page.locator('[name="rooms.0.guests.1.age"]');
  expect(await infantAge.evaluate((el) => el.tagName)).toBe("SELECT");
  await expect(page.locator('[name="rooms.0.guests.1.id_number"]')).toHaveCount(0);
  await fillGuest(page, 0, 1, { name: "Diya Menon", age: "2", gender: "female", relationship: "Niece" });

  await page.locator('[name="privacy_consent"]').check();
  await page.getByRole("button", { name: "Submit booking request" }).click();
  const toast = page.getByText(REFERENCE).first();
  await expect(toast).toBeVisible({ timeout: 30_000 });
  const reference = (await toast.innerText()).match(REFERENCE)![0];
  await page.waitForURL("**/dashboard", { timeout: 30_000 });

  // The Assistant Warden sees the father checked against the record.
  await signIn(page, ACCOUNTS.warden);
  await page.goto("/warden");
  const request = rowFor(page, reference);
  await expect(request.getByText("✓ Matches record")).toBeVisible();
  await request.getByRole("button", { name: /Review/ }).first().click();
  const review = page.getByRole("dialog");
  await expect(review.getByText("Student's record — academic database")).toBeVisible();
  await expect(review.getByText("Matches the record")).toBeVisible();
  await expect(review.getByText("1 guest + 1 infant").first()).toBeVisible();
});

test("reception moves a stay's check-in, earlier and later", async ({ page }) => {
  // The seeded official stay (DM005): approved, Bageshri, six days out. The
  // caretaker may do it — whoever may extend a stay may move its start. Both
  // directions since 1 Oct 2026: a guest who arrives late could not be
  // checked in at all before that.
  const reference = "IITPKD-GH-2026-DM005";
  await signIn(page, ACCOUNTS.caretaker);
  await page.goto("/caretaker?gh=bageshri");
  await rowFor(page, reference).getByRole("button", { name: /Manage/ }).click();
  const manage = page.getByRole("dialog");
  const before = await manage.getByText(/^Now /).first().innerText();

  await manage.getByLabel("Reason", { exact: true }).fill("The committee arrives a day early");
  await manage.getByLabel("Move check-in").fill(localDate(5));
  await manage.getByRole("button", { name: "Move check-in" }).click();
  await expect(page.getByText("Check-in moved")).toBeVisible({ timeout: 30_000 });
  await expect(manage).toBeHidden();

  await rowFor(page, reference).getByRole("button", { name: /Manage/ }).click();
  const again = page.getByRole("dialog");
  await expect(again.getByText(/^Now /).first()).not.toHaveText(before);

  // And back the other way: the guest's flight slips, so the stay starts a
  // day later than it was booked for.
  const moved = await again.getByText(/^Now /).first().innerText();
  await again.getByLabel("Reason", { exact: true }).fill("Their flight was delayed by a day");
  await again.getByLabel("Move check-in").fill(localDate(7));
  await again.getByRole("button", { name: "Move check-in" }).click();
  await expect(page.getByText("Check-in moved")).toBeVisible({ timeout: 30_000 });
  await rowFor(page, reference).getByRole("button", { name: /Manage/ }).click();
  await expect(page.getByRole("dialog").getByText(/^Now /).first()).not.toHaveText(moved);
});

test("the invoice bills the meals and the charge the desk adds, as they are typed", async ({ page }) => {
  const reference = await facultyStayStartingNow(page);

  await signIn(page, ACCOUNTS.caretaker);
  await page.goto("/caretaker?gh=bageshri");
  await rowFor(page, reference).getByRole("button", { name: /Mark as Occupied|Early check-in/ }).click();
  const button = rowFor(page, reference).getByRole("button", { name: "Invoice", exact: true });
  await expect(button).toBeVisible({ timeout: 30_000 });
  await button.click();
  const invoice = page.getByRole("dialog");
  await expect(invoice.getByText("Not issued")).toBeVisible({ timeout: 30_000 });
  // The revised template (30 Sep 2026): every figure lettered.
  await expect(invoice.getByText("GST @ 18% on A (B)")).toBeVisible();
  const start = await grandTotal(invoice);

  // Two breakfasts the kitchen served: ₹80 each, GST included — the total
  // follows without saving anything.
  await invoice.getByLabel("Breakfast served").fill("2");
  await expect.poll(() => grandTotal(invoice), { timeout: 15_000 }).toBe(start + 160);

  // A broken vase: no GST, printed under Other Charges with its comment.
  await invoice.getByRole("button", { name: "Add a charge" }).click();
  await invoice.getByLabel("Charge 1", { exact: true }).fill("Broken vase");
  await invoice.getByLabel("Charged under").selectOption("other");
  await invoice.getByLabel("₹ each").fill("1500");
  await invoice.getByLabel("Comment (printed under the charge)").fill("Vase in the room broken on departure");
  await expect.poll(() => grandTotal(invoice), { timeout: 15_000 }).toBe(start + 160 + 1500);
  await expect(invoice.getByText("Other Charges (no GST)")).toBeVisible();

  await invoice.getByRole("button", { name: /Issue & print/ }).click();
  await page.getByRole("button", { name: "Issue & print", exact: true }).last().click();
  await expect(invoice.getByText(/Issued/)).toBeVisible({ timeout: 30_000 });
  // The issued snapshot holds both.
  expect(await grandTotal(invoice)).toBe(start + 160 + 1500);
  await expect(invoice.getByText("Vase in the room broken on departure")).toBeVisible();
});
