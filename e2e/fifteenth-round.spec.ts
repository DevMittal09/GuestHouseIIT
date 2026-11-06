import { expect, test } from "@playwright/test";
import {
  ACCOUNTS,
  fillGuest,
  localDate,
  rowFor,
  setTime,
  signIn,
  soonCheckIn,
  submittedReference,
} from "./helpers";

/**
 * **The owner's fifteenth list (31 October 2026): the tariff category is the
 * Guest House Manager's.**
 *
 * The requester now only reads the rates (`e2e/fourteenth-round.spec.ts`
 * covers the panel). This is the other half, which only a browser can show:
 * the desk is asked which category applies **as it approves**, it cannot
 * approve without answering, and the invoice afterwards is priced at - and
 * prints - what it chose.
 *
 * A faculty member's **personal** stay at **Hamsanandi**, starting within the
 * hour: it goes straight to the manager (no HOD stage on a personal booking),
 * and a personal stay is settled at check-out, so one journey reaches the
 * invoice. Since 4 Nov 2026 a personal stay has one category, Category I, so
 * the desk is told rather than asked; choosing between II and III on an
 * official stay is `tests/sixteenth-round.test.ts`, and being blocked until
 * a choice is made is `tests/fifteenth-round.test.ts`.
 */
test("the manager chooses the tariff category as they approve, and the invoice prints it", async ({
  page,
}) => {
  // ------------------------------------------------------------ the request
  await signIn(page, ACCOUNTS.faculty);
  await page.goto("/book");
  await page.locator('[name="booking_type"][value="personal"]').check();
  const house = page.locator('select[name="guest_house_id"]');
  const hamsanandi = await house.locator("option", { hasText: "Hamsanandi" }).getAttribute("value");
  await house.selectOption(hamsanandi!);

  const start = soonCheckIn();
  await page.locator('[name="check_in_date"]').fill(start.date);
  await setTime(page, "Check-in", start);
  await page.locator('[name="check_out_date"]').fill(localDate(2));
  await page.locator('[name="purpose_of_visit"]').fill("A visiting dignitary of the department");
  await fillGuest(page, 0, 0, {
    name: "Air Marshal R. Iyer",
    age: "61",
    gender: "male",
    relationship: "Guest",
  });
  await page.getByRole("button", { name: "Submit booking request" }).click();
  const reference = await submittedReference(page);
  await page.waitForURL("**/dashboard", { timeout: 30_000 });

  // ----------------------------------------------------------- the approval
  await signIn(page, ACCOUNTS.manager);
  await page.goto("/manager?gh=hamsanandi");
  await rowFor(page, reference).getByRole("button", { name: /Review & Allocate/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: /Allocate rooms/ })).toBeVisible();

  /**
   * **A personal stay is Category I and nothing else** (4 Nov 2026, the
   * owner's sixteenth list): the desk "cannot directly change a booking type
   * from Official to Personal (or vice versa)", and a category scoped to an
   * official stay would be that change made through the price. So with one
   * category left there is nothing to ask - the dialog states it.
   */
  const category = dialog.locator("fieldset", { hasText: "Tariff category" });
  await expect(category.getByText(/^Category I:/)).toBeVisible();
  await expect(category).toContainText("₹1,500");
  await expect(category.locator('input[type="radio"]')).toHaveCount(0);
  await expect(category.getByText(/Category II|Category III/)).toHaveCount(0);

  // Pick a room - not a VIP one, which a faculty member's booking cannot be
  // given - and the allocation is ready: the category is already decided.
  await expect(dialog.getByText("Loading occupancy…")).toHaveCount(0, { timeout: 30_000 });
  await dialog.locator('button[title*="Occupancy:"]:not([disabled])').first().click();
  const confirm = dialog.getByRole("button", { name: /Confirm & Allocate/ });
  await expect(confirm).toBeEnabled();
  await confirm.click();
  await expect(dialog).toBeHidden({ timeout: 30_000 });

  // ------------------------------------------------------------ the invoice
  await rowFor(page, reference)
    .getByRole("button", { name: /Mark as Occupied|Early check-in/ })
    .click();
  const settle = rowFor(page, reference).getByRole("button", { name: "Check out & settle" });
  await expect(settle).toBeVisible({ timeout: 30_000 });
  await settle.click();
  const invoice = page.getByRole("dialog");
  await expect(invoice.getByText("Not issued")).toBeVisible({ timeout: 30_000 });

  // Priced at what the desk chose, and saying so among the printed facts -
  // the office's own words, snapshotted, so renaming the rate later cannot
  // rewrite an issued invoice.
  await expect(invoice.getByText(/^Category I:/).first()).toBeVisible();
  /**
   * And charged at it. The office's rates include GST, so the Tariff column
   * prints the rate before tax: **₹1,271.19 is ₹1,500 inclusive** - Category
   * I at Hamsanandi. Category II would read ₹1,694.92 (₹2,000). The figure
   * does not depend on how many nights the run happens to bill.
   */
  await expect(invoice.getByRole("cell", { name: "₹1,271.19" }).first()).toBeVisible();
  await expect(invoice.getByRole("cell", { name: "₹1,694.92" })).toHaveCount(0);
});
