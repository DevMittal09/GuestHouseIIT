import { expect, test } from "@playwright/test";
import {
  ACCOUNTS,
  chooseGuestHouse,
  kitchenName,
  localDate,
  nextDay,
  REFERENCE,
  rowFor,
  settleDebitHead,
  signIn,
} from "./helpers";

/**
 * The two routes that are not the student one (Phase 9):
 *
 *   * a faculty member's **official** stay, which their HOD approves before
 *     the Guest House Manager sees it (Phase 4);
 *   * a **meals-only** booking, which holds no room and goes straight to the
 *     manager, who confirms the kitchen can serve it (Phase 6).
 */

test("a faculty official stay waits for the HOD before the manager", async ({ page }) => {
  await signIn(page, ACCOUNTS.faculty);
  await page.goto("/book");

  await page.locator('[name="booking_type"][value="official"]').check();
  await page.locator('[name="debit_head"][value="department_budget"]').check();
  await settleDebitHead(page);

  await chooseGuestHouse(page);
  await page.locator('[name="check_in_date"]').fill(localDate(6));
  await page.locator('[name="check_out_date"]').fill(localDate(8));
  await page.locator('[name="purpose_of_visit"]').fill("External examiner for a thesis defence");

  await page.locator('[name="rooms.0.guests.0.name"]').fill("Prof. A. Iyer");
  await page.locator('[name="rooms.0.guests.0.age"]').fill("58");
  await page.locator('[name="rooms.0.guests.0.gender"]').selectOption("male");
  const relationship = page.locator('[name="rooms.0.guests.0.relationship"]');
  if (await relationship.count()) await relationship.fill("Collaborator");
  const aadhaar = page.locator('[name="rooms.0.guests.0.id_number"]');
  if (await aadhaar.count()) await aadhaar.fill("432112345678");
  const upload = page.locator('input[type="file"]');
  if (await upload.count()) await upload.first().setInputFiles("e2e/fixtures/id-document.png");

  await page.locator('[name="privacy_consent"]').check();
  await page.getByRole("button", { name: "Submit booking request" }).click();

  const toast = page.getByText(REFERENCE).first();
  await expect(toast).toBeVisible({ timeout: 30_000 });
  const reference = (await toast.innerText()).match(REFERENCE)![0];
  await page.waitForURL("**/dashboard", { timeout: 30_000 });

  // It is with the HOD, and the manager cannot see it yet.
  await signIn(page, ACCOUNTS.manager);
  await page.goto("/manager");
  await expect(rowFor(page, reference)).toHaveCount(0);

  await signIn(page, ACCOUNTS.hod);
  await page.goto("/hod");
  await expect(page.getByRole("heading", { name: "HOD Queue" })).toBeVisible();
  const waiting = rowFor(page, reference);
  await expect(waiting).toBeVisible();
  await waiting.getByRole("button", { name: "Forward", exact: true }).click();
  await expect(rowFor(page, reference)).toHaveCount(0);

  // Now it is the manager's to allocate.
  await signIn(page, ACCOUNTS.manager);
  await page.goto("/manager");
  await expect(rowFor(page, reference)).toBeVisible();
});

test("a meals-only booking reaches the kitchen without holding a room", async ({ page }) => {
  await signIn(page, ACCOUNTS.faculty);
  await page.goto("/book?service=meals_only");
  await expect(page.getByRole("heading", { name: /Meal|Dining/i }).first()).toBeVisible();

  // No room, no guest list - a head count, the days and each person's own
  // preference. No pets notice either (1 Oct 2026): nobody stays.
  await expect(page.locator('[name="rooms.0.guests.0.name"]')).toHaveCount(0);
  await expect(page.getByText(/pets are not/i)).toHaveCount(0);

  const head = page.locator('[name="debit_head"]');
  if (await head.count()) {
    await page.locator(`[name="debit_head"][value="${await head.first().getAttribute("value")}"]`).check();
  }
  await settleDebitHead(page);
  // A dining booking has no guest house question: only a kitchen can take one
  // and there is one, so the form states it rather than asking. The manager's
  // console opens on a tab per guest house, so the name is still needed here.
  await expect(page.locator('[name="guest_house_id"]')).toHaveCount(0);
  const kitchen = await kitchenName(page);
  // Remarks, and optional, since 1 Oct 2026 - filled in anyway, because the
  // kitchen reads it.
  await expect(page.getByLabel(/Remarks/)).toBeVisible();
  await page.locator('[name="purpose_of_visit"]').fill("Workshop lunch for the visiting panel");
  // The head count is a dropdown of people (1 Oct 2026), not a stepper.
  await page.locator('[name="meal_guest_count"]').selectOption("6");

  // It opens on the first day the kitchen can still cook for, with **lunch**
  // ticked (1 Oct 2026: it used to be every meal of the day). A second day is
  // one click away, and that is all the notice period leaves room to assert -
  // which meals of today are open depends on the hour the suite happens to
  // run.
  const day = page.locator("#meal-date-0");
  await expect(day).toBeVisible();
  const firstDay = await day.inputValue();
  await page.getByRole("button", { name: "Add another date" }).click();
  await expect(page.locator("#meal-date-1")).toHaveValue(nextDay(firstDay));
  // Tomorrow's lunch and dinner are open whatever time it is now, so there is
  // always at least one meal on the booking.
  const lunch = page.getByRole("checkbox", { name: /^Lunch on/ }).last();
  await expect(lunch).toBeEnabled();
  await lunch.check();

  /**
   * Each person's own preference (1 Oct 2026): the split has to add up to the
   * head count. Answering one box now fills the other with the rest (7 Oct
   * 2026), so 4 vegetarians settles 2 non-vegetarians without being asked -
   * and a split that does not add up is no longer reachable from the form at
   * all. `dietCountsError` still enforces it on both sides for a crafted
   * payload; that is checked in tests/seventh-round.test.ts.
   */
  await page.locator('[name="meal_veg_count"]').selectOption("4");
  await expect(page.locator('[name="meal_non_veg_count"]')).toHaveValue("2");
  // Either box fills the other, so a correction works the same way.
  await page.locator('[name="meal_non_veg_count"]').selectOption("6");
  await expect(page.locator('[name="meal_veg_count"]')).toHaveValue("0");
  await page.locator('[name="meal_veg_count"]').selectOption("4");
  await expect(page.locator('[name="meal_non_veg_count"]')).toHaveValue("2");
  await expect(page.getByText(/counts add up to \d+, but the booking is for/)).toHaveCount(0);

  // The summary at the end reads back what is about to be ordered.
  const summary = page.getByText(/4 vegetarian, 2 non-vegetarian/).first();
  await expect(summary).toBeVisible();

  await page.locator('[name="privacy_consent"]').check();
  await page.getByRole("button", { name: "Submit booking request" }).click();

  const toast = page.getByText(REFERENCE).first();
  await expect(toast).toBeVisible({ timeout: 30_000 });
  const reference = (await toast.innerText()).match(REFERENCE)![0];

  // Straight to the manager, who approves it without allocating anything.
  await signIn(page, ACCOUNTS.manager);
  await page.goto(`/manager?gh=${encodeURIComponent(kitchen.toLowerCase())}`);
  // Its own section, apart from the room requests (1 Oct 2026).
  await expect(
    page.getByRole("heading", { name: /Incoming meal bookings/ })
  ).toBeVisible();
  const row = rowFor(page, reference);
  await expect(row).toBeVisible();
  await expect(row.getByText("4 vegetarian, 2 non-vegetarian")).toBeVisible();
  await row.getByRole("button", { name: /Review & Approve/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: /Approve meals/ })).toBeVisible();
  await dialog.getByRole("button", { name: /Approve|Confirm/ }).last().click();
  await expect(dialog).toBeHidden({ timeout: 30_000 });

  // And the kitchen's day sheet counts it, on the day the meal was booked for.
  await page.goto(
    `/manager/meals?gh=${encodeURIComponent(kitchen)}&date=${nextDay(firstDay)}`
  );
  // The reference appears twice on the day sheet - once in the table of
  // bookings and once in the per-meal list - so either will do.
  await expect(page.getByText(reference).first()).toBeVisible();
});

/**
 * The kitchen's limit per sitting (1 Oct 2026): 30 people at any one meal,
 * **counting everyone already booked for it**. The limit is about the other
 * bookings, which the browser cannot see, so it is enforced in `createBooking`
 * - this is the only place that proves the wiring.
 *
 * A date nothing else in the suite books, so the two halves depend on each
 * other and on nothing else.
 */
test("the kitchen refuses a sitting that is already full", async ({ page }) => {
  const day = localDate(20);
  await signIn(page, ACCOUNTS.faculty);

  const bookLunch = async (people: string) => {
    await page.goto("/book?service=meals_only");
    const head = page.locator('[name="debit_head"]');
    if (await head.count()) {
      await page.locator(`[name="debit_head"][value="${await head.first().getAttribute("value")}"]`).check();
    }
    await settleDebitHead(page);
    // One sitting, far enough out that every meal is open: lunch on `day`,
    // which is ticked by default and the only meal that is.
    await page.locator("#meal-date-0").fill(day);
    await page.locator('[name="meal_guest_count"]').selectOption(people);
    await page.locator('[name="meal_veg_count"]').selectOption(people);
    await page.locator('[name="meal_non_veg_count"]').selectOption("0");
    await page.locator('[name="privacy_consent"]').check();
    await page.getByRole("button", { name: "Submit booking request" }).click();
  };

  // Exactly the limit goes through.
  await bookLunch("30");
  await expect(page.getByText(REFERENCE).first()).toBeVisible({ timeout: 30_000 });
  await page.waitForURL("**/dashboard", { timeout: 30_000 });

  // One more person does not, and the message says how many places are left.
  await bookLunch("1");
  await expect(page.getByText(/no places left/)).toBeVisible({ timeout: 30_000 });
});

/**
 * The availability console: **a count for a requester, the grid for the desk**
 * (7 Oct 2026). The office asked for everyone but the manager, the caretaker
 * and the developer to be told only how many rooms are free, and for the
 * server to send them the number and nothing else - so the check is not only
 * that the chart is absent but that no room number reaches the page at all.
 * Both views are drawn client-side after the occupancy fetch, so this is the
 * only place the split can be checked.
 */
test("the availability console counts rooms for a requester and charts them for the desk", async ({ page }) => {
  await signIn(page, ACCOUNTS.student);
  await page.goto("/availability");
  // The panel arrives once the fetch lands; the card title carries the range,
  // so this is also a check that dates read DD/MM (1 Oct 2026).
  await expect(page.getByText(/^Room availability - \d{2}\/\d{2}/)).toBeVisible();
  await expect(page.getByText(/rooms available|No rooms free all day/).first()).toBeVisible();
  /**
   * Not one room number. Every room number on the page sits in a cell whose
   * `title` names the room and its type ("201 - Double sharing"), on the
   * chart's header and on each bar, and the room-by-room list spells the type
   * out - so the absence of both is the absence of the rooms. The room
   * numbers themselves are the office's own (201, 302…), which is why this
   * cannot be a pattern match on the text.
   */
  await expect(page.locator('[title*="Double sharing"]')).toHaveCount(0);
  await expect(page.getByText("Double sharing")).toHaveCount(0);
  // None of the desk's states, and no room-by-room list.
  await expect(page.getByText("Vacant", { exact: true })).toHaveCount(0);
  await expect(page.getByText(/Turnaround \(housekeeping/)).toHaveCount(0);
  await expect(page.getByText("Room details", { exact: true })).toHaveCount(0);

  await signIn(page, ACCOUNTS.manager);
  await page.goto("/availability");
  await expect(page.getByText("Room details", { exact: true })).toBeVisible();
  await expect(page.getByText("Vacant", { exact: true }).first()).toBeVisible();
  // The desk does get the rooms, one chart column each.
  await expect(page.locator('[title*="Double sharing"]').first()).toBeVisible();
});
