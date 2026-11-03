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
 * the kitchen's guest house is the one the office prices two ways, and a
 * personal stay is settled at check-out, so one journey reaches the invoice.
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
   * The office's sheet prices Hamsanandi's rooms two ways - ₹2,000 generally
   * and ₹4,000 "for government officers" - so both are offered, with the
   * booking's own category first and marked. Before this round the second was
   * unreachable: it was only ever what an office's own account resolved to.
   */
  const category = dialog.locator("fieldset", { hasText: "Tariff category" });
  await expect(category.getByText("Tariff sheet: Hamsanandi types 1 and 2")).toBeVisible();
  await expect(category.getByText("- as requested")).toBeVisible();
  const officer = category.locator("label", {
    hasText: "Tariff sheet: Hamsanandi type 3, government officers",
  });
  await expect(officer).toBeVisible();
  await expect(officer).toContainText("₹4,000");

  // Pick a room, and the allocation still waits for the category: the rate is
  // part of the same decision, and an invoice must not fall back to a default.
  await expect(dialog.getByText("Loading occupancy…")).toHaveCount(0, { timeout: 30_000 });
  await dialog.locator('button[title*="Occupancy:"]:not([disabled])').first().click();
  const confirm = dialog.getByRole("button", { name: /Confirm & Allocate/ });
  await expect(confirm).toBeDisabled();
  await expect(
    dialog.getByText("Choose the tariff category this booking is charged under")
  ).toBeVisible();

  await officer.locator('input[type="radio"]').check();
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
  await expect(
    invoice.getByText("Tariff sheet: Hamsanandi type 3, government officers")
  ).toBeVisible();
  /**
   * And charged at it. The office's rates include GST, so the Tariff column
   * prints the rate before tax: **₹3,389.83 is ₹4,000 inclusive** - the
   * government-officer rate. Had the desk left the booking's own category
   * the cell would read ₹1,694.92, which is ₹2,000. The figure does not
   * depend on how many nights the run happens to bill.
   */
  await expect(invoice.getByRole("cell", { name: "₹3,389.83" }).first()).toBeVisible();
  await expect(invoice.getByRole("cell", { name: "₹1,694.92" })).toHaveCount(0);
});
