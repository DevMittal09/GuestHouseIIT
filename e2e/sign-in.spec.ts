import { expect, test } from "@playwright/test";

/**
 * The sign-in door.
 *
 * Google-only since 30 Oct 2026: the page shows one button that links to the
 * Google OAuth start endpoint. Wrong credentials or a missing account are
 * reported back on the sign-in page via the `error` query parameter.
 */
test("the sign-in page shows the Google sign-in button", async ({ page }) => {
  await page.goto("/sign-in");

  await expect(page.getByRole("link", { name: /Sign in with Google/i })).toBeVisible();
  await expect(page.getByLabel("Email address")).toHaveCount(0);
  await expect(page.getByLabel("Password")).toHaveCount(0);
  await expect(page.getByText(/LDAP/i)).toHaveCount(0);
});

test("the Google button carries the next parameter", async ({ page }) => {
  await page.goto("/sign-in?next=%2Fbook");
  const link = page.getByRole("link", { name: /Sign in with Google/i });
  await expect(link).toHaveAttribute("href", /next=%2Fbook/);
});

test("the booking doors carry the destination through sign-in", async ({ page }) => {
  await page.goto("/book-room");
  await page.getByRole("main").getByRole("link", { name: /^Sign in to book$/ }).click();
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fbook/);
  const link = page.getByRole("link", { name: /Sign in to book$/i });
  await expect(link).toHaveAttribute("href", /next=%2Fbook/);
});

test("an error from the OAuth callback is shown on the sign-in page", async ({ page }) => {
  await page.goto("/sign-in?error=Use+your+%40iitpkd.ac.in+account");
  await expect(page.getByRole("alert")).toContainText("Use your @iitpkd.ac.in account");
});
