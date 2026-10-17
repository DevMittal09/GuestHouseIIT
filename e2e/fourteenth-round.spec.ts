import { expect, test, type Page } from "@playwright/test";
import {
  ACCOUNTS,
  fillGuest,
  localDate,
  rowFor,
  settleDebitHead,
  signIn,
  submittedReference,
} from "./helpers";

/**
 * The owner's fourteenth list (17 Oct 2026), through the browser:
 *
 * 1. The tariff categories and their rates **beside** the form, selectable,
 *    and gone from the form itself.
 * 2. **Guest Details before Meal Booking.**
 * 3. Meals asked as **Yes / No**, the section shown only on Yes.
 * 4. The caretaker sentence in the meal section.
 * 5. **Room Booking** and **Meal Booking** as two nav entries.
 * 7. My Bookings in three sections.
 * 8. A student whose **hostel is NULL** goes straight to the Guest House
 *    Manager, with no warden stage to wait for.
 *
 * The rules behind each are unit-tested in `tests/fourteenth-round.test.ts`;
 * what only a page can show is the ordering, the panel driving the form's own
 * fields, and the queues a submitted request lands in.
 */

/** The tariff panel, by the heading it is labelled with. */
function tariffPanel(page: Page) {
  return page.locator('section[aria-labelledby="tariff-panel-heading"]');
}

/** One category's radio, found by the label beside it. */
function tariffCategory(page: Page, label: string) {
  return tariffPanel(page)
    .locator("label", { hasText: label })
    .locator('input[type="radio"]');
}

test("the tariff panel offers the categories and sets what the rate is read from", async ({
  page,
}) => {
  await signIn(page, ACCOUNTS.faculty);
  await page.goto("/book");
  await expect(page.getByRole("heading", { name: /New Booking/i })).toBeVisible();

  // Both guest houses and both kinds of booking, each with its own rate.
  const panel = tariffPanel(page);
  await expect(panel.getByRole("heading", { name: "Tariff" })).toBeVisible();
  const hamsanandiPersonal = tariffCategory(page, "Hamsanandi - Personal booking");
  await expect(panel.getByText("Bageshri - Official booking")).toBeVisible();
  await expect(panel.getByText("Hamsanandi - Official booking")).toBeVisible();
  await expect(panel.getByText("Hamsanandi - Personal booking")).toBeVisible();
  // A rupee figure against each, or an honest "Rate not published".
  await expect(panel.getByText(/₹|Rate not published/).first()).toBeVisible();

  // The form opens on no guest house, so the rates wait for a category.
  await expect(panel.getByText("Choose one to see every charge.")).toBeVisible();

  // Choosing a category is choosing the guest house and the kind of booking:
  // both of the form's own controls follow it.
  await hamsanandiPersonal.check();
  await expect(page.locator('[name="booking_type"][value="personal"]')).toBeChecked();
  const house = page.locator('select[name="guest_house_id"]');
  await expect(house.locator("option:checked")).toHaveText(/Hamsanandi/);
  // And the full table of charges for it - the same caption the table has
  // carried since the rates were a card in the form.
  await expect(
    panel.getByRole("table", { name: /Rates at Hamsanandi, in force today/ })
  ).toBeVisible();
  await expect(panel.getByRole("cell", { name: "Lunch, per head" })).toBeVisible();

  // The rates are **only** in the panel: the form has no numbered Rates
  // section any more.
  await expect(page.locator('[data-slot="card-title"]', { hasText: /^Rates$/ })).toHaveCount(0);
});

test("the guests come before the meals, and the meals are a Yes or No", async ({ page }) => {
  await signIn(page, ACCOUNTS.faculty);
  await page.goto("/book");

  // Hamsanandi, which has the kitchen - picked from the tariff panel.
  await tariffCategory(page, "Hamsanandi - Official booking").check();

  const guests = page.getByText("Guests, room by room");
  const meals = page.locator('[data-slot="card-title"]', { hasText: /^Meals$/ });
  await expect(guests).toBeVisible();
  await expect(meals).toBeVisible();
  // Guest Details above Meal Booking (17 Oct 2026): the kitchen's head count
  // is the guests entered above, and the diet split has to add up to it.
  const order = await page.evaluate(() => {
    const titles = [...document.querySelectorAll('[data-slot="card-title"]')].map((n) =>
      (n.textContent ?? "").trim()
    );
    return { guests: titles.indexOf("Guests, room by room"), meals: titles.indexOf("Meals") };
  });
  expect(order.guests).toBeGreaterThan(-1);
  expect(order.meals).toBeGreaterThan(order.guests);

  // No by default - a meal on a stay is an extra, not something the form
  // orders on the requester's behalf.
  const no = page.locator('input[name="wants_meals"][value="No"]');
  const yes = page.locator('input[name="wants_meals"][value="Yes"]');
  await expect(no).toBeChecked();
  await expect(page.locator("#meal_veg_count")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Select all" })).toHaveCount(0);
  await expect(page.getByText(/talk with caretaker/)).toHaveCount(0);

  // Yes opens the section - the preferences, the grid and the caretaker line.
  await page.locator('[name="check_in_date"]').fill(localDate(4));
  await page.locator('[name="check_out_date"]').fill(localDate(6));
  await yes.check();
  await expect(page.getByRole("button", { name: "Select all" })).toBeVisible();
  await expect(
    page.getByText("In any case talk with caretaker for any change in meal booking")
  ).toBeVisible();
  // The diet split is asked once there is something to cook - nothing is
  // ticked by default on a stay (`NO_MEALS`), so the grid comes first.
  await expect(page.locator("#meal_veg_count")).toHaveCount(0);
  await page.getByRole("button", { name: "Select all" }).click();
  await expect(page.locator("#meal_veg_count")).toBeVisible();

  // And No closes it again, with nothing left behind to fail validation.
  await no.check();
  await expect(page.locator("#meal_veg_count")).toHaveCount(0);
  await expect(page.getByText(/talk with caretaker/)).toHaveCount(0);

  // A stay with the answer "no" submits as a room booking.
  const head = page.locator('[name="debit_head"]');
  if (await head.count()) {
    await page.locator(`[name="debit_head"][value="${await head.first().getAttribute("value")}"]`).check();
  }
  await settleDebitHead(page);
  await page.locator('[name="purpose_of_visit"]').fill("A visiting examiner, meals declined");
  await fillGuest(page, 0, 0, { name: "Dr. Meera Raman", age: "48", relationship: "Colleague" });
  await page.getByRole("button", { name: "Submit booking request" }).click();
  const reference = await submittedReference(page);
  await page.waitForURL("**/dashboard", { timeout: 30_000 });

  // It is upcoming, and the row says Meals only where there are meals.
  const upcoming = page.locator("section", {
    has: page.getByRole("heading", { name: /Upcoming bookings/ }),
  });
  await expect(upcoming.locator("tr", { hasText: reference })).toBeVisible();
  await page.goto("/history");
  await expect(page.locator("tr", { hasText: reference }).first()).not.toContainText("Meals");
});

test("the nav has a door each for rooms and meals", async ({ page }) => {
  await signIn(page, ACCOUNTS.faculty);
  await page.goto("/dashboard");

  const nav = page.getByRole("navigation", { name: "Portal" });
  await expect(nav.getByRole("link", { name: "New Booking" })).toHaveCount(0);
  await expect(nav.getByRole("link", { name: "Room Booking" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Meal Booking" })).toBeVisible();

  // The meal door opens the dining form, with no room to ask about.
  await nav.getByRole("link", { name: "Meal Booking" }).click();
  await expect(page).toHaveURL(/\/book\/meals$/);
  await expect(page.getByRole("heading", { name: "Meals only" })).toBeVisible();
  await expect(page.locator("#meal_guest_count")).toBeVisible();
  await expect(page.locator('[name="check_in_date"]')).toHaveCount(0);
  await expect(tariffPanel(page).getByRole("heading", { name: "Meal rates" })).toBeVisible();
  // Exactly one door is current - the room door is `/book`, matched exactly.
  await expect(nav.getByRole("link", { name: "Meal Booking" })).toHaveAttribute(
    "aria-current",
    "page"
  );
  await expect(nav.getByRole("link", { name: "Room Booking" })).not.toHaveAttribute(
    "aria-current",
    "page"
  );

  await nav.getByRole("link", { name: "Room Booking" }).click();
  await expect(page).toHaveURL(/\/book$/);
  await expect(page.locator('[name="check_in_date"]')).toBeVisible();

  // A student cannot book meals without a room, so there is no second door.
  await signIn(page, ACCOUNTS.student);
  await page.goto("/dashboard");
  const studentNav = page.getByRole("navigation", { name: "Portal" });
  await expect(studentNav.getByRole("link", { name: "Room Booking" })).toBeVisible();
  await expect(studentNav.getByRole("link", { name: "Meal Booking" })).toHaveCount(0);
});

test("My Bookings is upcoming, current and previous", async ({ page }) => {
  await signIn(page, ACCOUNTS.student);
  await page.goto("/dashboard");

  for (const heading of ["Current bookings", "Upcoming bookings", "Previous bookings"]) {
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
  }
  // The whole archive is one link away from the section that is trimmed.
  await expect(page.getByRole("link", { name: "All booking history" })).toBeVisible();
  await page.getByRole("link", { name: "All booking history" }).click();
  await expect(page).toHaveURL(/\/history$/);
});

/**
 * A day scholar's request has nobody to forward it: there is no Assistant
 * Warden for a student who lives at home. It enters at the Guest House
 * Manager, the log says why, and no warden sees it.
 */
test("a student with no hostel goes straight to the Guest House Manager", async ({ page }) => {
  await signIn(page, ACCOUNTS.dayScholar);
  await page.goto("/book");
  await expect(page.getByRole("heading", { name: /New Booking/i })).toBeVisible();

  // A student's form is unchanged otherwise: one guest house, no meals, no
  // debitable head.
  await expect(page.getByText(/accommodated at Bageshri Guest House/)).toBeVisible();
  await expect(page.locator('[name="debit_head"]')).toHaveCount(0);

  await page.locator('[name="check_in_date"]').fill(localDate(3));
  await page.locator('[name="check_out_date"]').fill(localDate(5));
  await page.locator('[name="purpose_of_visit"]').fill("Parents visiting - no hostel, no warden");
  // No academic record behind this account, so nothing is locked: the name is
  // typed, as it was for every student before 7 Oct 2026.
  await fillGuest(page, 0, 0, { name: "Shanti Iyer", age: "51", relationship: "Mother" });
  await page.getByRole("button", { name: "Submit booking request" }).click();
  const reference = await submittedReference(page);
  await page.waitForURL("**/dashboard", { timeout: 30_000 });

  // The requester is told where it is: the desk, not a warden.
  const row = rowFor(page, reference);
  await expect(row).toContainText("Pending GH Manager");
  await expect(row).not.toContainText(/Warden/i);

  // And the log says why the stage is missing, rather than leaving it to look
  // like an approval somebody skipped.
  await row.getByRole("button", { name: "View" }).click();
  const details = page.getByRole("dialog");
  await expect(
    details.getByText(/Assistant Warden.*does not apply.*no hostel is recorded/i)
  ).toBeVisible();
  await page.keyboard.press("Escape");

  // Nobody is waiting for it in a warden's queue.
  await signIn(page, ACCOUNTS.warden);
  await page.goto("/warden");
  await expect(rowFor(page, reference)).toHaveCount(0);

  // It is in the desk's own queue, ready to allocate.
  await signIn(page, ACCOUNTS.manager);
  await page.goto("/manager?gh=bageshri");
  await expect(
    rowFor(page, reference).getByRole("button", { name: /Review & Allocate/ })
  ).toBeVisible({ timeout: 30_000 });

  // A student who *does* have a hostel still goes to their warden.
  await signIn(page, ACCOUNTS.student);
  await page.goto("/book");
  await page.locator('[name="check_in_date"]').fill(localDate(3));
  await page.locator('[name="check_out_date"]').fill(localDate(5));
  await page.locator('[name="purpose_of_visit"]').fill("Parents visiting - Malhar, so the warden");
  await fillGuest(page, 0, 0, { name: "Latha Menon", age: "52", relationship: "Mother" });
  await page.getByRole("button", { name: "Submit booking request" }).click();
  const hostelledRef = await submittedReference(page);
  await page.waitForURL("**/dashboard", { timeout: 30_000 });
  await expect(rowFor(page, hostelledRef)).toContainText(/Warden/i);

  await signIn(page, ACCOUNTS.warden);
  await page.goto("/warden");
  await expect(rowFor(page, hostelledRef)).toBeVisible();
});
