import { expect, test } from "@playwright/test";

/**
 * The sign-in door.
 *
 * **No password, and up to two buttons** (6 Nov 2026): the owner withdrew LDAP
 * from the interface on 27 Oct 2026, and asked for mock authentication to
 * stand *beside* Google rather than be replaced by it.
 *
 * This file covers the deployment the office demonstrates from: a
 * **production** build with **no Google configuration** and no `DEV_LOGIN`, so
 * the only door is the account picker at `/mock-login`. The picker used to 404
 * there, which is how the personas went missing once.
 *
 * `playwright.config.ts` sets `GOOGLE_CLIENT_ID=""` explicitly rather than
 * relying on it being unset, because Next loads `.env.local` for `next start`
 * as well: a developer with real credentials in that file would otherwise be
 * running a different test from CI, and every journey would fail at sign-in
 * with no hint why.
 *
 * The two-door case - Google solid, "Mock Authentication" outlined beneath -
 * is covered where the decision lives: `mockLoginEnabled()` in
 * `tests/security.test.ts`.
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
