import { expect, test } from "@playwright/test";
import { ACCOUNTS, signIn } from "./helpers";

/**
 * The office's eleventh list (11 Oct 2026):
 *
 *   * an office with **no HOD** is not offered "Requires HOD approval" - the
 *     card is withheld rather than carrying a hint saying the option would do
 *     nothing;
 *   * the **pets notice** is the Guidelines' and the booking mail's, not the
 *     form's;
 *   * every form that **stars** a field says what the star means.
 */

test("the Director's Office is not asked how its booking is approved", async ({ page }) => {
  await signIn(page, ACCOUNTS.directorOffice);
  await page.goto("/book");
  await expect(page.getByRole("heading", { name: /New Booking/i })).toBeVisible();

  // Nobody heads the Director's Office, so both answers would enter the
  // pipeline at the manager. The question is not put at all.
  await expect(page.locator('[name="office_approval"]')).toHaveCount(0);
  await expect(page.getByText(/Requires HOD approval/i)).toHaveCount(0);
  await expect(page.getByText(/Nobody is set as HOD/i)).toHaveCount(0);

  // The pets notice is off the form; the stars are explained on it.
  await expect(page.getByText(/pets are not/i)).toHaveCount(0);
  await expect(page.getByText(/Fields marked with \* are mandatory/i)).toBeVisible();

  // It can still book: the route it was not asked about is Direct.
  await expect(page.getByRole("button", { name: "Submit booking request" })).toBeVisible();
});

test("a department office, which has an HOD, still chooses its route", async ({ page }) => {
  await signIn(page, ACCOUNTS.departmentOffice);
  await page.goto("/book");
  await expect(page.getByRole("heading", { name: /New Booking/i })).toBeVisible();

  await expect(page.locator('[name="office_approval"][value="direct"]')).toBeVisible();
  await expect(page.locator('[name="office_approval"][value="hod"]')).toBeVisible();
  // And the option names whoever would approve it, rather than explaining
  // that nobody would. Matched with the hint's own words: the CSE HOD is also
  // on the Requester details card's Copy-to line.
  await expect(page.getByText(/Prof\. R\. Venkatesh.*approves it first/)).toBeVisible();
  await expect(page.getByText(/Nobody is set as HOD/i)).toHaveCount(0);
});
