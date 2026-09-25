import { expect, test } from "@playwright/test";
import { ACCOUNTS, signIn } from "./helpers";

/**
 * Three fixes from the 24 Sep 2026 audit, walked through the real pages:
 * reception reaches the kitchen's page and comes back to reception; the
 * developer is not offered a New Booking form it could never submit; and the
 * portal's help line shows the guest house's own number, the one on the
 * website and the invoice.
 */

test("reception opens the kitchen's page and returns to reception", async ({ page }) => {
  await signIn(page, ACCOUNTS.caretaker);

  // Bageshri serves no meals, so there is nothing to link to.
  await page.goto("/caretaker?gh=Bageshri");
  await expect(page.getByRole("heading", { name: "Guest House Reception" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Meal counts" })).toHaveCount(0);

  await page.goto("/caretaker?gh=Hamsanandi");
  await page.getByRole("link", { name: "Meal counts" }).click();
  await expect(page.getByRole("heading", { name: /^Meals for / })).toBeVisible();
  await expect(page).toHaveURL(/\/manager\/meals\?gh=Hamsanandi/);

  await page.getByRole("link", { name: "Back to reception" }).click();
  await expect(page).toHaveURL(/\/caretaker\?gh=Hamsanandi/);
  await expect(page.getByRole("heading", { name: "Guest House Reception" })).toBeVisible();
});

test("the developer is sent to the console, not to a booking form it cannot submit", async ({ page }) => {
  await signIn(page, ACCOUNTS.developer);
  await page.goto("/book");
  await expect(page).toHaveURL(/\/admin/);
  await expect(page.getByRole("button", { name: "Submit booking request" })).toHaveCount(0);
});

test("the help line gives the guest house's own number", async ({ page }) => {
  await signIn(page, ACCOUNTS.student);
  await page.goto("/dashboard");
  const help = page.getByText(/Facing trouble booking\?/);
  await expect(help).toContainText("+91 491 209 2016");
  await expect(help).toContainText("ghm@iitpkd.ac.in");
});
