import { expect, test } from "@playwright/test";
import {
  ACCOUNTS,
  ID_DOCUMENT,
  localDate,
  REFERENCE,
  rowFor,
  selectedGuestHouseName,
  signIn,
} from "./helpers";

/**
 * Two rules the office reported as broken on 23 Sep 2026, both of which fail
 * only when a real person fills the form in:
 *
 *   * the **IAR Student Cell** books for alumni, who are accommodated at one
 *     guest house — so the form never asks which, and was refusing the
 *     request for an answer it had not offered;
 *   * a **student** could enter "Mother" twice.
 */

test("the IAR Student Cell is never asked to choose a guest house", async ({ page }) => {
  await signIn(page, ACCOUNTS.iarStudentCell);
  await page.goto("/book");
  await expect(page.getByRole("heading", { name: /New Booking/i })).toBeVisible();

  // No dropdown: the guest house is stated, and the value is already set.
  await expect(page.locator('select[name="guest_house_id"]')).toHaveCount(0);
  expect(await selectedGuestHouseName(page)).toBe("Bageshri");
  expect(await page.locator('[name="guest_house_id"]').inputValue()).not.toBe("");

  // Two heads are offered for an alumni stay, so the question is asked.
  await page.locator('[name="debit_head"][value="institute_grant"]').check();

  await page.locator('[name="alumni_name"]').fill("R. Krishnan");
  await page.locator('[name="alumni_roll_number"]').fill("112009033");
  // The Alumni ID card is demanded by the request being for an alumnus.
  const uploads = page.locator('input[type="file"]');
  for (let i = 0; i < (await uploads.count()); i++) {
    await uploads.nth(i).setInputFiles(ID_DOCUMENT);
  }

  await page.locator('[name="check_in_date"]').fill(localDate(6));
  await page.locator('[name="check_out_date"]').fill(localDate(8));
  await page.locator('[name="purpose_of_visit"]').fill("Alumni reunion weekend");

  await page.locator('[name="rooms.0.guests.0.name"]').fill("R. Krishnan");
  await page.locator('[name="rooms.0.guests.0.age"]').fill("39");
  await page.locator('[name="rooms.0.guests.0.gender"]').selectOption("male");
  const relationship = page.locator('[name="rooms.0.guests.0.relationship"]');
  if (await relationship.count()) await relationship.fill("Alumnus");
  const aadhaar = page.locator('[name="rooms.0.guests.0.id_number"]');
  if (await aadhaar.count()) await aadhaar.fill("432112345678");

  await page.locator('[name="privacy_consent"]').check();
  await page.getByRole("button", { name: "Submit booking request" }).click();

  // It went through — no "Select a guest house" on a form that never asked.
  const toast = page.getByText(REFERENCE).first();
  await expect(toast).toBeVisible({ timeout: 30_000 });
  const reference = (await toast.innerText()).match(REFERENCE)![0];
  await page.waitForURL("**/dashboard", { timeout: 30_000 });

  // And it is waiting with the IAR Office, which is its first approver.
  await signIn(page, ACCOUNTS.iarOffice);
  await page.goto("/iar");
  await expect(rowFor(page, reference)).toHaveCount(1);
});

test("a student cannot enter two mothers", async ({ page }) => {
  await signIn(page, ACCOUNTS.student);
  await page.goto("/book");
  await expect(page.getByRole("heading", { name: /New Booking/i })).toBeVisible();

  await page.locator('[name="check_in_date"]').fill(localDate(4));
  await page.locator('[name="check_out_date"]').fill(localDate(6));
  await page.locator('[name="purpose_of_visit"]').fill("Parents visiting for convocation");

  await page.getByRole("button", { name: /Add guest/i }).first().click();

  const first = page.locator('[name="rooms.0.guests.0.relationship"]');
  const second = page.locator('[name="rooms.0.guests.1.relationship"]');
  await first.selectOption("Mother");

  // The option is gone from the second guest's dropdown — greyed, not hidden,
  // and it says why.
  await expect(second.locator('option[value="Mother"]')).toBeDisabled();
  await expect(second.locator('option[value="Mother"]')).toHaveText(/already on this request/);
  // Father is still free, and so is the first guest's own answer.
  await expect(second.locator('option[value="Father"]')).toBeEnabled();
  await expect(first.locator('option[value="Mother"]')).toBeEnabled();
});
