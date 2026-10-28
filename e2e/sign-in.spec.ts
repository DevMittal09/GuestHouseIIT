import { expect, test } from "@playwright/test";

/**
 * The sign-in door.
 *
 * **One button and no password** (27 Oct 2026): the owner withdrew LDAP from
 * the interface, and while `GOOGLE_CLIENT_ID` and friends are unset the
 * button opens the account picker at `/mock-login`. This runs against a
 * **production** build with no Google configuration and no `DEV_LOGIN`, which
 * is exactly the deployment the office is demonstrating from - the picker
 * used to 404 there, which is how the personas went missing once.
 *
 * When Google is configured the button becomes the real OAuth flow and the
 * picker stops existing; that is the point at which this test is expected to
 * be replaced rather than fixed.
 */
test("the sign-in page asks for no password, and no LDAP", async ({ page }) => {
  await page.goto("/sign-in");

  // Nothing to type: the page offers a door, not a form.
  await expect(page.locator("input")).toHaveCount(0);
  await expect(page.getByText(/LDAP/i)).toHaveCount(0);
  // It does not claim to be Google either, because it is not connected.
  await expect(page.getByRole("link", { name: /Sign in with Google/ })).toHaveCount(0);
  await expect(page.getByText(/Google sign-in is not connected yet/i)).toBeVisible();

  await page.getByRole("main").getByRole("link", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Mock Authentication", level: 1 })).toBeVisible();

  // Every seeded account is offered, split by where the persona works.
  await expect(page.getByText("guesthouse@iitpkd.ac.in")).toBeVisible();
  await expect(page.getByText("112201001@smail.iitpkd.ac.in")).toBeVisible();

  // One click lands on that role's own home.
  await page.getByRole("button", { name: /^Guest House Manager/ }).first().click();
  await page.waitForURL(/\/manager/, { timeout: 30_000 });
  await expect(page.getByRole("heading", { name: /Guest House Manager|Allocation/i }).first()).toBeVisible();
});

test("the booking doors carry the destination through the picker", async ({ page }) => {
  // `?next=` survives the round trip, so "Book a room" still lands on the form
  // rather than on the manager's console or a dashboard.
  await page.goto("/book-room");
  await page.getByRole("main").getByRole("link", { name: /^Sign in to book$/ }).click();
  await expect(page).toHaveURL(/\/mock-login\?next=%2Fbook/);
  await page.getByRole("button", { name: /^Anjali Menon/ }).click();
  await page.waitForURL(/\/book/, { timeout: 30_000 });
});
