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

  for (const path of ["/guidelines", "/gallery", "/contact", "/book-room", "/book-meal", "/sign-in"]) {
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
  await expect(page.getByRole("main").getByRole("link", { name: /^Sign in to book$/ })).toBeVisible();
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

  // Nothing is printed under the map (27 Oct 2026): the embed carries "View
  // larger map" and the directions itself, and the name is the tab above it.
  // The footer still links both, for a reader who never reaches this page.
  await expect(page.getByRole("link", { name: /Open in Google Maps/ })).toHaveCount(0);
  await expect(page.getByRole("contentinfo").getByRole("link", { name: /Directions/ })).toHaveCount(2);

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
 * The home page's hero (27 Oct 2026). The brief took the numbering and the
 * pause button off it and made the photograph itself the control, so what is
 * left to check is what every carousel gets wrong: that it moves on its own,
 * that it can be stopped, and that stopping it sticks. Two slides, and the
 * only way to pause is to click the photograph.
 */
test("the home page's hero advances, and a click on it stops and starts it", async ({ page }) => {
  const carousel = page.getByRole("group", { name: "Photographs of the guest houses" });
  const slide = async () =>
    (await carousel.locator('[aria-roledescription="slide"][aria-hidden="false"]').getAttribute("aria-label")) ?? "";

  await page.goto("/");
  await expect(carousel).toBeVisible();
  // The two the owner attributed, Hamsanandi first.
  await expect(carousel.locator('[aria-roledescription="slide"]')).toHaveCount(2);
  expect(await slide()).toBe("1 of 2");

  // It advances by itself - 6.5s a slide, so one tick inside 12s. The pointer
  // may rest anywhere: unlike the slideshow it replaced, hovering zooms the
  // photograph rather than holding it.
  await expect
    .poll(slide, { timeout: 12_000, message: "the hero never advanced on its own" })
    .toBe("2 of 2");

  // Clicking the photograph pauses it, and it stays paused.
  const pause = page.getByRole("button", { name: "Pause the photographs" });
  await pause.click();
  await expect(page.getByRole("button", { name: "Resume the photographs" })).toBeVisible();
  const held = await slide();
  await page.waitForTimeout(8_000);
  expect(await slide(), "a paused hero moved anyway").toBe(held);

  // And clicking again starts it.
  await page.getByRole("button", { name: "Resume the photographs" }).click();
  await expect(pause).toBeVisible();

  // The controls the brief removed are gone, and the doors over the
  // photograph still lead into the portal.
  await expect(page.getByRole("button", { name: /^Photograph \d/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^(Next|Previous) photograph$/ })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Book a Room" }).first()).toHaveAttribute("href", "/book-room");
  await expect(page.getByRole("link", { name: "Book a Meal" }).first()).toHaveAttribute("href", "/book-meal");
});

/**
 * The rest of the landing page, in the order the owner wrote it out: the
 * opening statement, the amenities, a gallery mosaic that links the Gallery,
 * a text-only cell per guest house, and the contact details with one map
 * each.
 */
test("the landing page carries the statement, the amenities, the mosaic, both guest houses and the maps", async ({ page }) => {
  await page.goto("/");

  // One `<h1>`, and it is the hero's. **"Guest House Portal"** since 28 Oct
  // 2026: the institute's name is the tracked line above it, in full, so the
  // title no longer abbreviates it.
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Guest House Portal");
  // `exact`, because the institute's full name is also the first line of the
  // address in the contact band and in the footer's copyright.
  await expect(page.getByText("Indian Institute of Technology Palakkad", { exact: true })).toBeVisible();

  // The opening statement names the guest houses the store holds, and has a
  // photograph of its own beside it.
  const welcome = page.getByRole("region", { name: "Staying on campus" });
  // Both names, in whatever order the store lists them.
  const statement = welcome.getByText(/are the institute's guest houses on the campus at Palakkad/);
  await expect(statement).toBeVisible();
  await expect(statement).toContainText("Bageshri");
  await expect(statement).toContainText("Hamsanandi");
  await expect(welcome.getByRole("img")).toHaveCount(1);

  const amenities = page.getByRole("region", { name: "Amenities" });
  await expect(amenities.getByRole("listitem")).toHaveCount(6);
  await expect(amenities.getByText("Dining")).toBeVisible();

  // The mosaic shows six photographs and sends the reader to the Gallery.
  const gallery = page.getByRole("region", { name: "A look inside" });
  await expect(gallery.getByRole("listitem")).toHaveCount(6);
  await expect(gallery.getByRole("link", { name: /See the full gallery/ })).toHaveAttribute("href", "/gallery");

  // A cell per guest house, text only, with the meal door only where there
  // is a kitchen.
  const houses = page.getByRole("region", { name: "Our guest houses" });
  await expect(houses.getByRole("heading", { level: 2, name: "Hamsanandi" })).toBeVisible();
  await expect(houses.getByRole("heading", { level: 2, name: "Bageshri" })).toBeVisible();
  await expect(houses.getByRole("img")).toHaveCount(0);
  await expect(houses.getByRole("link", { name: "Book a Room" })).toHaveCount(2);
  await expect(houses.getByRole("link", { name: "Book a Meal" })).toHaveCount(1);

  // The manager's line, and one map per guest house with nothing under it.
  const contact = page.getByRole("region", { name: "Contact us" });
  await expect(contact.getByRole("link", { name: "+91 491 209 2016" })).toBeVisible();
  await expect(contact.getByRole("link", { name: "ghm@iitpkd.ac.in" })).toBeVisible();
  await expect(contact.locator("iframe")).toHaveCount(2);
  await expect(contact.getByRole("heading", { level: 3, name: "Hamsanandi" })).toBeVisible();
  await expect(contact.getByRole("link", { name: /Google Maps|directions/i })).toHaveCount(0);
});
