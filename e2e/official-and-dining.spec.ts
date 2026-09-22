import { expect, test } from "@playwright/test";
import {
  ACCOUNTS,
  chooseGuestHouse,
  localDate,
  REFERENCE,
  rowFor,
  selectedGuestHouseName,
  signIn,
} from "./helpers";

/**
 * The two routes that are not the student one (Phase 9):
 *
 *   * a faculty member's **official** stay, which their HOD approves before
 *     the Guest House Manager sees it (Phase 4);
 *   * a **meals-only** booking, which holds no room and goes straight to the
 *     manager, who confirms the kitchen can serve it (Phase 6).
 */

test("a faculty official stay waits for the HOD before the manager", async ({ page }) => {
  await signIn(page, ACCOUNTS.faculty);
  await page.goto("/book");

  await page.locator('[name="booking_type"][value="official"]').check();
  await page.locator('[name="debit_head"][value="department_budget"]').check();

  await chooseGuestHouse(page);
  await page.locator('[name="check_in_date"]').fill(localDate(6));
  await page.locator('[name="check_out_date"]').fill(localDate(8));
  await page.locator('[name="purpose_of_visit"]').fill("External examiner for a thesis defence");

  await page.locator('[name="rooms.0.guests.0.name"]').fill("Prof. A. Iyer");
  await page.locator('[name="rooms.0.guests.0.age"]').fill("58");
  await page.locator('[name="rooms.0.guests.0.gender"]').selectOption("male");
  const relationship = page.locator('[name="rooms.0.guests.0.relationship"]');
  if (await relationship.count()) await relationship.fill("Collaborator");
  const aadhaar = page.locator('[name="rooms.0.guests.0.id_number"]');
  if (await aadhaar.count()) await aadhaar.fill("432112345678");
  const upload = page.locator('input[type="file"]');
  if (await upload.count()) await upload.first().setInputFiles("e2e/fixtures/id-document.png");

  await page.locator('[name="privacy_consent"]').check();
  await page.getByRole("button", { name: "Submit booking request" }).click();

  const toast = page.getByText(REFERENCE).first();
  await expect(toast).toBeVisible({ timeout: 30_000 });
  const reference = (await toast.innerText()).match(REFERENCE)![0];
  await page.waitForURL("**/dashboard", { timeout: 30_000 });

  // It is with the HOD, and the manager cannot see it yet.
  await signIn(page, ACCOUNTS.manager);
  await page.goto("/manager");
  await expect(rowFor(page, reference)).toHaveCount(0);

  await signIn(page, ACCOUNTS.hod);
  await page.goto("/hod");
  await expect(page.getByRole("heading", { name: "HOD Queue" })).toBeVisible();
  const waiting = rowFor(page, reference);
  await expect(waiting).toBeVisible();
  await waiting.getByRole("button", { name: "Forward", exact: true }).click();
  await expect(rowFor(page, reference)).toHaveCount(0);

  // Now it is the manager's to allocate.
  await signIn(page, ACCOUNTS.manager);
  await page.goto("/manager");
  await expect(rowFor(page, reference)).toBeVisible();
});

test("a meals-only booking reaches the kitchen without holding a room", async ({ page }) => {
  await signIn(page, ACCOUNTS.faculty);
  await page.goto("/book?service=meals_only");
  await expect(page.getByRole("heading", { name: /Meal|Dining/i }).first()).toBeVisible();

  // No room, no guest list — a head count, the days and a preference.
  await expect(page.locator('[name="rooms.0.guests.0.name"]')).toHaveCount(0);

  const head = page.locator('[name="debit_head"]');
  if (await head.count()) {
    await page.locator(`[name="debit_head"][value="${await head.first().getAttribute("value")}"]`).check();
  }
  await chooseGuestHouse(page);
  // Only a kitchen is offered, and it is not necessarily the first guest
  // house — the manager's console opens on one tab per guest house.
  const kitchen = await selectedGuestHouseName(page);
  await page.locator('[name="check_in_date"]').fill(localDate(4));
  await page.locator('[name="check_out_date"]').fill(localDate(4));
  await page.locator('[name="purpose_of_visit"]').fill("Workshop lunch for the visiting panel");
  // The head count is a stepper, addressed by its label rather than a name.
  await page.getByLabel("Number of guests").fill("6");
  await page.locator('[name="meal_preference"][value="veg"]').check();

  // Every meal of the range is offered ticked; leave them as the kitchen sees them.
  await expect(page.getByRole("button", { name: "Select all" })).toBeVisible();
  await page.getByRole("button", { name: "Select all" }).click();

  await page.locator('[name="privacy_consent"]').check();
  await page.getByRole("button", { name: "Submit booking request" }).click();

  const toast = page.getByText(REFERENCE).first();
  await expect(toast).toBeVisible({ timeout: 30_000 });
  const reference = (await toast.innerText()).match(REFERENCE)![0];

  // Straight to the manager, who approves it without allocating anything.
  await signIn(page, ACCOUNTS.manager);
  await page.goto(`/manager?gh=${encodeURIComponent(kitchen.toLowerCase())}`);
  const row = rowFor(page, reference);
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: /Review & Approve/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: /Approve meals/ })).toBeVisible();
  await dialog.getByRole("button", { name: /Approve|Confirm/ }).last().click();
  await expect(dialog).toBeHidden({ timeout: 30_000 });

  // And the kitchen's day sheet counts it.
  await page.goto(
    `/manager/meals?gh=${encodeURIComponent(kitchen)}&date=${localDate(4)}`
  );
  await expect(page.getByText(reference)).toBeVisible();
});
