import { expect, test } from "@playwright/test";

/**
 * The second door on the sign-in card.
 *
 * Google sign-in is not connected yet, so while `GOOGLE_CLIENT_ID` and friends
 * are unset the button reads **Mock Authentication** and opens the persona
 * picker at `/mock-login`. This runs against a **production** build with no
 * Google configuration and no `DEV_LOGIN`, which is exactly the deployment the
 * office is demonstrating from — the door used to 404 there, which is how the
 * personas went missing.
 *
 * When Google is configured the button becomes the real OAuth flow and this
 * page stops existing; that is the point at which this test is expected to be
 * replaced rather than fixed.
 */
test("mock authentication signs a persona in without a password", async ({ page }) => {
  await page.goto("/sign-in");

  const door = page.getByRole("link", { name: "Mock Authentication" });
  await expect(door).toBeVisible();
  // It does not claim to be Google, because it is not.
  await expect(page.getByRole("link", { name: /Sign in with Google/ })).toHaveCount(0);

  await door.click();
  await expect(page.getByRole("heading", { name: "Mock Authentication", level: 1 })).toBeVisible();

  // Every seeded account is offered, split by where the persona works.
  await expect(page.getByText("guesthouse@iitpkd.ac.in")).toBeVisible();
  await expect(page.getByText("112201001@smail.iitpkd.ac.in")).toBeVisible();

  // One click lands on that role's own home.
  await page.getByRole("button", { name: /Guest House Manager/ }).first().click();
  await page.waitForURL(/\/manager/, { timeout: 30_000 });
  await expect(page.getByRole("heading", { name: /Guest House Manager|Allocation/i }).first()).toBeVisible();
});

test("the booking doors keep the mock door, and carry the destination through it", async ({ page }) => {
  // `?next=` survives the round trip, so "Book a room" still lands on the form
  // rather than on the manager's console or a dashboard.
  await page.goto("/book-room");
  await page.getByRole("link", { name: "Mock Authentication" }).click();
  await expect(page).toHaveURL(/\/mock-login\?next=%2Fbook/);
  await page.getByRole("button", { name: /Anjali Menon/ }).click();
  await page.waitForURL(/\/book/, { timeout: 30_000 });
});
