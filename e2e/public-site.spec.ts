import { expect, test } from "@playwright/test";

/**
 * The public site, at the width it is actually read on (Phase 9). Nothing here
 * needs an account: it is what a visitor sees before they sign in.
 */

test("the public site reads on a 320 px phone", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  // Nothing may push the page sideways at the narrowest width we support.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);

  for (const path of ["/guidelines", "/contact", "/privacy", "/book-room", "/sign-in"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const sideways = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(sideways, `${path} overflows at 320 px`).toBeLessThanOrEqual(0);
  }
});

test("the privacy notice is published and versioned", async ({ page }) => {
  await page.goto("/privacy");
  await expect(page.getByText(/Version \d{4}-\d{2}-\d{2}/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Your rights" })).toBeVisible();
});

test("the booking doors ask for a sign-in rather than failing silently", async ({ page }) => {
  await page.goto("/book-room");
  await expect(page.getByLabel("LDAP username")).toBeVisible();
});
