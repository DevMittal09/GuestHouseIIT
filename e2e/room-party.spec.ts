import { expect, test } from "@playwright/test";
import { ACCOUNTS, fillGuest, localDate, REFERENCE, signIn } from "./helpers";

/**
 * What one room may hold, driven through the real form.
 *
 * The office stated the rule as combinations (Sep 2026): a room takes four
 * people however they are made up, of whom at most three may need a bed. So
 * 3 + 1, 2 + 2 and 1 + 3 all fit, and 3 + 2 does not. `tests/booking-rules.
 * test.ts` holds the schema to that; this holds the *form* to it, because the
 * form has its own copy of the rule in the two Add buttons — and a room with a
 * second infant used to be unreachable there even though nothing was wrong
 * with it.
 */
test("a student can book two guests and two infants in one room", async ({ page }) => {
  await signIn(page, ACCOUNTS.student);
  await page.goto("/book");
  await expect(page.getByRole("heading", { name: /New Booking/i })).toBeVisible();

  // No room-type question any more: every room is double sharing.
  await expect(page.locator('[name="rooms.0.room_type"]')).toHaveCount(0);

  await page.locator('[name="check_in_date"]').fill(localDate(3));
  await page.locator('[name="check_out_date"]').fill(localDate(5));
  await page.locator('[name="purpose_of_visit"]').fill("Parents and the youngest two visiting");

  const room = page.locator("fieldset", { has: page.getByText("Room 1", { exact: true }) });
  const addGuest = room.getByRole("button", { name: "Add guest" });
  const addInfant = room.getByRole("button", { name: /Add infant/ });

  // Mother, Father, and two under-fives.
  await fillGuest(page, 0, 0, { name: "Asha Menon", age: "49", relationship: "Mother" });
  await addGuest.click();
  await fillGuest(page, 0, 1, { name: "Ravi Menon", age: "53", relationship: "Father" });
  await addInfant.click();
  await fillGuest(page, 0, 2, { name: "Kavya Menon", age: "3", relationship: "Daughter" });

  // The second infant is the one the old one-per-room cap made unreachable.
  await expect(addInfant).toBeEnabled();
  await addInfant.click();
  await fillGuest(page, 0, 3, { name: "Arjun Menon", age: "1", relationship: "Son" });

  // Four people is a full room: neither button offers a fifth.
  await expect(addGuest).toBeDisabled();
  await expect(addInfant).toBeDisabled();

  await page.locator('[name="privacy_consent"]').check();
  await page.getByRole("button", { name: "Submit booking request" }).click();

  const toast = page.getByText(REFERENCE).first();
  await expect(toast).toBeVisible({ timeout: 30_000 });
  const reference = (await toast.innerText()).match(REFERENCE)![0];
  await page.waitForURL("**/dashboard", { timeout: 30_000 });

  // The warden sees the party as two guests and two infants.
  await signIn(page, ACCOUNTS.warden);
  await page.goto("/warden");
  const request = page.locator("tr", { hasText: reference });
  await expect(request).toBeVisible();
  await request.getByRole("button", { name: /Review/ }).first().click();
  const review = page.getByRole("dialog");
  await expect(review.getByText("2 guests + 2 infants").first()).toBeVisible();
  // Students book Bageshri, which serves no meals, so the review says nothing
  // about them. "Meals requested — None requested" read to the warden as a
  // request that had been refused rather than a question never asked.
  await expect(review.getByText("Meals requested")).toHaveCount(0);
});
