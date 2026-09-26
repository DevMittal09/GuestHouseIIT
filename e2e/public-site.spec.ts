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

  for (const path of ["/guidelines", "/gallery", "/contact", "/privacy", "/book-room", "/book-meal", "/sign-in", "/mock-login"]) {
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

test("the contact page shows each guest house on the map, and the footer links MRBS", async ({ page }) => {
  await page.goto("/contact");
  const tabs = page.getByRole("tablist", { name: "Guest house" });
  await expect(tabs.getByRole("tab")).toHaveCount(2);

  // Hamsanandi first, as the office listed them.
  const map = page.locator("iframe");
  await expect(tabs.getByRole("tab", { name: "Hamsanandi" })).toHaveAttribute("aria-selected", "true");
  await expect(map).toHaveAttribute("title", "Hamsanandi on the map");
  await expect(map).toHaveAttribute("src", /ll=10\.7984359,76\.7299972/);

  await tabs.getByRole("tab", { name: "Bageshri" }).click();
  await expect(map).toHaveAttribute("title", "Bageshri on the map");
  await expect(map).toHaveAttribute("src", /ll=10\.8063107,76\.726681/);
  await expect(page.getByRole("link", { name: /Open in Google Maps/ })).toHaveAttribute(
    "href",
    "https://maps.app.goo.gl/AspNpPu7sTDLXxL2A"
  );

  // The keyboard moves between guest houses too.
  await page.keyboard.press("ArrowLeft");
  await expect(tabs.getByRole("tab", { name: "Hamsanandi" })).toHaveAttribute("aria-selected", "true");

  const footer = page.getByRole("contentinfo");
  await expect(footer.getByRole("link", { name: /Open MRBS/ })).toHaveAttribute("href", "https://mrbs.iitpkd.ac.in");
  await expect(footer.getByRole("link", { name: /IIT Palakkad website/ })).toHaveAttribute("href", "https://iitpkd.ac.in");
});
