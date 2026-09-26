import { expect, test } from "@playwright/test";
import { ACCOUNTS, signIn } from "./helpers";

/**
 * My Bookings leads with two large ways in — a room, and meals without a
 * room — because the header buttons they replaced were being missed
 * (26 Sep 2026). Each has to land on the right door of the booking form.
 */

test("My Bookings leads with the room and meal booking doors", async ({ page }) => {
  // Faculty can book meals without a room at the guest house that serves them.
  await signIn(page, ACCOUNTS.faculty);
  await page.goto("/dashboard");
  const room = page.getByRole("link", { name: /New room booking/ });
  const meals = page.getByRole("link", { name: /Meal booking/ });
  await expect(room).toBeVisible();
  await expect(meals).toBeVisible();
  await expect(meals).toContainText("Hamsanandi");

  await meals.click();
  await expect(page).toHaveURL(/\/book\?service=meals_only/);

  await page.goto("/dashboard");
  await page.getByRole("link", { name: /New room booking/ }).click();
  await expect(page).toHaveURL(/\/book$/);
  await expect(page.getByRole("heading", { name: /New Booking/i })).toBeVisible();
});

test("a student is offered a room, not meals without one", async ({ page }) => {
  await signIn(page, ACCOUNTS.student);
  await page.goto("/dashboard");
  await expect(page.getByRole("link", { name: /New room booking/ })).toContainText("Bageshri");
  await expect(page.getByRole("link", { name: /Meal booking/ })).toHaveCount(0);
});
