import { expect, test } from "@playwright/test";
import { ACCOUNTS, rowFor, signIn, submitRoomBooking } from "./helpers";

/**
 * The journey the office lives on, end to end (Phase 9):
 *
 *   student books → Assistant Warden forwards → Guest House Manager allocates
 *   rooms → the desk checks the guest in and out → the manager issues the
 *   invoice → the payment is recorded.
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

  // Pick the first room the grid offers — a disabled tile is one already held.
  const free = dialog.locator("button[title]:not([disabled])").first();
  await expect(free).toBeVisible();
  await free.click();
  await dialog.getByRole("button", { name: /Confirm & Allocate/ }).click();
  await expect(dialog).toBeHidden({ timeout: 30_000 });

  // ------------------------------------------------- check-in and check-out
  // The desk marks arrival, then departure. Both run from the stays table,
  // which the manager and the caretaker share.
  await signIn(page, ACCOUNTS.caretaker);
  await page.goto("/caretaker");
  const stay = rowFor(page, reference);
  await expect(stay).toBeVisible();
  // The button says what it is doing: an arrival before the booked time is an
  // "Early check-in", and the log records it as one.
  await stay.getByRole("button", { name: /Mark as Occupied|Early check-in/ }).click();
  // The guest is in the building, so the bill becomes reachable. The status
  // badge still reads Approved until the booked time comes round — a stay
  // cannot be shown as occupied before it has started (`displayStatus`).
  await expect(
    rowFor(page, reference).getByRole("button", { name: "Invoice", exact: true })
  ).toBeVisible({ timeout: 30_000 });

  await rowFor(page, reference)
    .getByRole("button", { name: /Mark as Vacated|Early check-out/ })
    .click();
  // It leaves the stays in the building and waits under "Checked out — to
  // bill" — on reception's console too, since reception hands the invoice
  // over (24 Sep 2026); it used to vanish from here with the bill still open.
  const toBill = page.locator("section", {
    has: page.getByRole("heading", { name: /Checked out — to bill/ }),
  });
  await expect(toBill.locator("tr", { hasText: reference })).toBeVisible({ timeout: 30_000 });
  await expect(
    toBill.locator("tr", { hasText: reference }).getByRole("button", { name: "Invoice", exact: true })
  ).toBeVisible();
  await expect(page.locator("tr", { hasText: reference })).toHaveCount(1);

  // ------------------------------------------------- the invoice, and paying
  // A checked-out stay waits under "Checked out — to bill" until it is paid.
  await signIn(page, ACCOUNTS.manager);
  await page.goto("/manager");
  await expect(page.getByRole("heading", { name: /Checked out — to bill/ })).toBeVisible();
  await rowFor(page, reference).getByRole("button", { name: "Invoice", exact: true }).click();
  const invoice = page.getByRole("dialog");
  await expect(invoice.getByText("Not issued")).toBeVisible({ timeout: 30_000 });
  // The total is a rupee amount, and the tariff is GST-inclusive, so what is
  // shown is what the guest pays.
  await expect(invoice.getByText(/₹\s?[\d,]+\.\d{2}/).first()).toBeVisible();

  await invoice.getByRole("button", { name: /Issue & print/ }).click();
  await page.getByRole("button", { name: "Issue & print", exact: true }).last().click();
  await expect(invoice.getByText(/Issued/)).toBeVisible({ timeout: 30_000 });

  await invoice.getByRole("button", { name: "Mark paid" }).click();
  await expect(invoice.getByText(/Paid/)).toBeVisible({ timeout: 30_000 });
});
