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

  for (const path of ["/guidelines", "/gallery", "/contact", "/book-room", "/book-meal", "/sign-in", "/mock-login"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const sideways = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(sideways, `${path} overflows at 320 px`).toBeLessThanOrEqual(0);
  }
});

/**
 * **The privacy notice is withdrawn** (14 Oct 2026, the owner). The test that
 * checked it was published and versioned is in `archive/privacy-notice/` with
 * the page itself. This is the other half of that removal: the route is gone
 * and nothing links it, so neither can come back by accident - a restored page
 * that nobody can reach, or a link to a page that 404s, would both pass every
 * other test in this file.
 */
test("the privacy notice is not published", async ({ page }) => {
  const response = await page.goto("/privacy");
  expect(response?.status()).toBe(404);

  for (const path of ["/", "/guidelines", "/contact"]) {
    await page.goto(path);
    await expect(page.getByRole("link", { name: /privacy/i })).toHaveCount(0);
  }
});

test("the booking doors ask for a sign-in rather than failing silently", async ({ page }) => {
  await page.goto("/book-room");
  await expect(page.getByLabel("LDAP username")).toBeVisible();
});

test("the contact page shows each guest house on the map, and the footer links the institute", async ({ page }) => {
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
  await expect(footer.getByRole("link", { name: /IIT Palakkad website/ })).toHaveAttribute("href", "https://iitpkd.ac.in");
  // The meeting room booking system came off the site on 7 Oct 2026.
  await expect(page.getByText(/MRBS/i)).toHaveCount(0);
  await expect(footer.getByText(/Meeting Room Booking System/i)).toHaveCount(0);
});

/**
 * The home page's slideshow (15 Oct 2026, the owner: "i need images which
 * change evry few seconds and has the option of arrows to move to next
 * image"). Three things have to hold, and each of them has been the bug in
 * somebody's carousel: it moves on its own, the arrows move it, and it can
 * be stopped - a photograph that slides away while you are looking at it is
 * what the Pause button is for.
 */
test("the home page's slideshow advances, takes the arrows, and stops", async ({ page }) => {
  await page.goto("/");
  const carousel = page.getByRole("group", { name: "Photographs of the guest houses" });
  await expect(carousel).toBeVisible();

  // `getByRole` has no `current` option, so the indicator is matched on the
  // attribute itself - which is the thing a screen reader reads anyway.
  const slideNumber = async () =>
    (await carousel.locator('button[aria-current="true"]').getAttribute("aria-label")) ?? "";

  // The guest houses lead it, in the owner's order.
  expect(await slideNumber()).toContain("Photograph 1 of 6");

  // The arrows move it, and it wraps rather than dead-ending.
  await carousel.getByRole("button", { name: "Next photograph" }).click();
  expect(await slideNumber()).toContain("Photograph 2 of 6");
  await carousel.getByRole("button", { name: "Previous photograph" }).click();
  expect(await slideNumber()).toContain("Photograph 1 of 6");
  await carousel.getByRole("button", { name: "Previous photograph" }).click();
  expect(await slideNumber()).toContain("Photograph 6 of 6");

  // A number jumps straight to its photograph.
  await carousel.getByRole("button", { name: "Photograph 3 of 6" }).click();
  expect(await slideNumber()).toContain("Photograph 3 of 6");

  // It advances by itself - 6s a slide, so one tick inside 10s. The pointer
  // has to be off it, because hovering holds it deliberately.
  await page.mouse.move(0, 0);
  await expect
    .poll(slideNumber, { timeout: 10_000, message: "the slideshow never advanced on its own" })
    .toContain("Photograph 4 of 6");

  // And it stops when asked, for as long as it is asked.
  await carousel.getByRole("button", { name: "Pause the slideshow" }).click();
  await page.mouse.move(0, 0);
  const held = await slideNumber();
  await page.waitForTimeout(7_000);
  expect(await slideNumber(), "a paused slideshow moved anyway").toBe(held);
  await expect(carousel.getByRole("button", { name: "Play the slideshow" })).toBeVisible();
});
