import { expect, test } from "@playwright/test";
import {
  ACCOUNTS,
  chooseGuestHouse,
  fillGuest,
  localDate,
  REFERENCE,
  rowFor,
  selectedGuestHouseName,
  signIn,
} from "./helpers";

/**
 * A club is booked for by its faculty in-charge (24 Sep 2026):
 *
 *   the club's own account is told who books for it and gets no form → the
 *   faculty in-charge books from their own login, naming a Copy-to address →
 *   it skips the Faculty Advisor stage (that is them) and is with the Guest
 *   House Manager → it is on the faculty member's list, marked as the club's.
 */

const CLUB = { uid: "petrichor", password: "Petrichor@2026" };
const IN_CHARGE = { uid: "fa.petrichor", password: "Advisor@2026" };

test("a club's faculty in-charge books for it; the club's account cannot", async ({ page }) => {
  await signIn(page, CLUB);
  await page.goto("/book");
  await expect(page.getByText("Ask your faculty in-charge to book")).toBeVisible();
  await expect(page.getByText(/Dr\. Arun Prasad/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Submit booking request" })).toHaveCount(0);

  await signIn(page, IN_CHARGE);
  // Their home is Club Approvals, and the way to book is there.
  await page.getByRole("link", { name: /Book for Petrichor/ }).click();
  await expect(page.getByRole("heading", { name: /New Booking for Petrichor/ })).toBeVisible();

  await page.locator('[name="debit_head"][value="department_budget"]').check();
  await chooseGuestHouse(page);
  const house = await selectedGuestHouseName(page);
  await page.locator('[name="check_in_date"]').fill(localDate(4));
  await page.locator('[name="check_out_date"]').fill(localDate(5));
  await page.locator('[name="purpose_of_visit"]').fill("Pro-show artist for the fest");
  await fillGuest(page, 0, 0, { name: "Visiting Artist", age: "31", gender: "male" });
  await page.locator('[name="copy_to.0.email"]').fill("events.secretary@example.org");
  await page.locator('[name="privacy_consent"]').check();
  await page.getByRole("button", { name: "Submit booking request" }).click();

  const toast = page.getByText(REFERENCE).first();
  await expect(toast).toBeVisible({ timeout: 30_000 });
  const reference = (await toast.innerText()).match(REFERENCE)![0];
  await page.waitForURL("**/dashboard", { timeout: 30_000 });
  await expect(rowFor(page, reference)).toContainText("For Petrichor");

  // No Faculty Advisor stage — the club has no HOD, so it is the manager's.
  await signIn(page, ACCOUNTS.manager);
  await page.goto(`/manager?gh=${encodeURIComponent(house)}`);
  await expect(rowFor(page, reference)).toBeVisible();
});
