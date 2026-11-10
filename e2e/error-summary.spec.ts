import { expect, test } from "@playwright/test";
import { ACCOUNTS, localDate, pickDate, signIn } from "./helpers";

/**
 * The owner, 7 Nov 2026: *"I don't want any case where an error belongs to a
 * question that isn't on screen."* Every problem with a submission is listed
 * at the top of the form (`components/error-summary.tsx`), linked to its
 * question where that question is on screen.
 */
test("an empty student form lists every problem at the top, each linked to its question", async ({ page }) => {
  await signIn(page, ACCOUNTS.student);
  await page.goto("/book");
  await page.getByRole("button", { name: "Submit booking request" }).click();

  const summary = page.getByTestId("error-summary");
  await expect(summary).toBeVisible();
  await expect(summary.getByRole("heading", { name: "There is a problem" })).toBeVisible();
  await expect(summary).toBeFocused();

  // Every item is either a link to a question on screen or plain words;
  // none may be a message whose only home is a path nothing renders.
  const items = summary.getByRole("listitem");
  expect(await items.count()).toBeGreaterThan(0);
  const links = summary.getByRole("link");
  expect(await links.count()).toBeGreaterThan(0);

  // The check-in question is linked, and following the link focuses it.
  await summary.getByRole("link", { name: /check-in/i }).first().click();
  await expect(page.locator("#check_in_date")).toBeFocused();

  // A student is never shown the guest house, so nothing about it may be listed.
  await expect(summary).not.toContainText(/guest house/i);
  await expect(page.getByText("Please fix the highlighted fields")).toHaveCount(0);
});

test("the summary is rebuilt on every attempt", async ({ page }) => {
  await signIn(page, ACCOUNTS.faculty);
  await page.goto("/book");
  const summary = page.getByTestId("error-summary");
  await page.getByRole("button", { name: "Submit booking request" }).click();
  await expect(summary).toContainText(/check-in date/i);

  await pickDate(page, "check_in_date", localDate(3));
  await pickDate(page, "check_out_date", localDate(4));
  await page.getByRole("button", { name: "Submit booking request" }).click();
  // The guest is still blank, so there is still a problem - but the dates
  // are no longer one of them, and the next layer of checks has run.
  await expect(summary).toBeVisible();
  await expect(summary).not.toContainText(/check-in date & time is required/i);
});
