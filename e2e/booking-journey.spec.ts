import { expect, test } from "@playwright/test";
import { ACCOUNTS, rowFor, signIn, submitRoomBooking } from "./helpers";

/**
 * The journey the office lives on, end to end (Phase 9):
 *
 *   student books → Assistant Warden forwards → Guest House Manager allocates
 *   rooms → the desk checks the guest in → and checks them out by issuing the
 *   invoice, taking the payment and releasing the room, in one dialog
 *   (7 Oct 2026: a personal stay is settled before the guest leaves).
 *
 * One test, deliberately: each step depends on the state the one before left
 * behind, and splitting it would either re-do the whole chain or share state
 * between tests that Playwright is free to reorder.
 */

test("a student's stay goes from request to a paid invoice", async ({ page }) => {
  // ---------------------------------------------------------- the request
  await signIn(page, ACCOUNTS.student);
  const reference = await submitRoomBooking(page, {
    // Starting today, so the same run can walk the guest in and out again.
    startingToday: true,
    purpose: "Parents visiting for convocation",
    guest: { name: "Latha Menon", age: "52", gender: "female", relationship: "Mother" },
  });

  await page.goto("/dashboard");
  await expect(rowFor(page, reference)).toContainText(/Pending|Warden/i);

  // ------------------------------------------------------------ the warden
  await signIn(page, ACCOUNTS.warden);
  await page.goto("/warden");
  const waiting = rowFor(page, reference);
  await expect(waiting).toBeVisible();
  await waiting.getByRole("button", { name: "Forward", exact: true }).click();
  await expect(rowFor(page, reference)).toHaveCount(0);

  // ----------------------------------------------------------- the manager
  await signIn(page, ACCOUNTS.manager);
  await page.goto("/manager");
  await rowFor(page, reference).getByRole("button", { name: /Review & Allocate/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: /Allocate rooms/ })).toBeVisible();

  // Pick the first room the grid offers - a disabled tile is one already held.
  const free = dialog.locator("button[title]:not([disabled])").first();
  await expect(free).toBeVisible();
  await free.click();
  await dialog.getByRole("button", { name: /Confirm & Allocate/ }).click();
  await expect(dialog).toBeHidden({ timeout: 30_000 });

  // ------------------------------------------------- check-in and check-out
  /**
   * The desk marks arrival, then checks the guest out **through the invoice**
   * (7 Oct 2026, the office's eighth list): a student's stay is personal, and
   * a private guest cannot be chased for the bill once they have driven home,
   * so check-out means issue, pay, then vacate, in one dialog. Reception does
   * all of it - the same console the manager shares.
   */
  await signIn(page, ACCOUNTS.caretaker);
  await page.goto("/caretaker");
  const stay = rowFor(page, reference);
  await expect(stay).toBeVisible();
  // The button says what it is doing: an arrival before the booked time is an
  // "Early check-in", and the log records it as one.
  await stay.getByRole("button", { name: /Mark as Occupied|Early check-in/ }).click();

  // One button, not two: a personal stay has no bare "Mark as Vacated".
  const row = rowFor(page, reference);
  await expect(row.getByRole("button", { name: /Mark as Vacated|Early check-out/ })).toHaveCount(0);
  await expect(row.getByRole("button", { name: "Check out & settle" })).toBeVisible({
    timeout: 30_000,
  });
  await row.getByRole("button", { name: "Check out & settle" }).click();

  const invoice = page.getByRole("dialog");
  await expect(invoice.getByText("Not issued")).toBeVisible({ timeout: 30_000 });
  // The total is a rupee amount, and the tariff is GST-inclusive, so what is
  // shown is what the guest pays.
  await expect(invoice.getByText(/₹\s?[\d,]+\.\d{2}/).first()).toBeVisible();
  // Nothing can be vacated yet, and the dialog says why rather than offering
  // a button the server would refuse.
  await expect(invoice.getByText(/invoiced and paid for at check-out/)).toBeVisible();
  await expect(invoice.getByRole("button", { name: "Mark as Vacated" })).toHaveCount(0);
  // Reception cannot set the rule aside - that is the manager's.
  await expect(invoice.getByLabel(/Close off unpaid/)).toHaveCount(0);

  await invoice.getByRole("button", { name: /Issue & print/ }).click();
  await page.getByRole("button", { name: "Issue & print", exact: true }).last().click();
  await expect(invoice.getByText(/Issued/)).toBeVisible({ timeout: 30_000 });

  // ------------------------------------------------------------- paying
  // Cash is gone (7 Oct 2026): UPI or an account transfer, and each carries a
  // reference the accounts section can match the invoice against.
  const mode = invoice.locator("#pay-mode");
  await expect(mode.locator("option")).toHaveCount(2);
  await expect(mode.locator('option[value="cash"]')).toHaveCount(0);
  await expect(mode).toHaveValue("upi");
  await expect(invoice.getByRole("button", { name: "Mark paid" })).toBeDisabled();
  await invoice.locator("#pay-ref").fill("UPI-20261007-0001");
  await invoice.getByRole("button", { name: "Mark paid" }).click();
  await expect(invoice.getByText(/✓ Paid/)).toBeVisible({ timeout: 30_000 });

  // Settled, so now the room can be released - from the same dialog.
  await invoice.getByRole("button", { name: "Mark as Vacated" }).click();
  await expect(invoice).toBeHidden({ timeout: 30_000 });

  // It is paid, so it waits in neither of the desk's two lists.
  await expect(page.getByRole("heading", { name: /Checked out - to bill/ })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: /Awaiting payment/ })).toHaveCount(0);
  await expect(page.locator("tr", { hasText: reference })).toHaveCount(0);
});
