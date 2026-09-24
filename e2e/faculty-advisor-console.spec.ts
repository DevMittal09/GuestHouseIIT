import { expect, test, type Page } from "@playwright/test";
import { ACCOUNTS, signIn } from "./helpers";

/**
 * The Faculty Advisor is an appointment in the console, not an account
 * (24 Sep 2026, migration 25): contracts last a year or two, so Departments &
 * Clubs names who it is now, and the right to book for the council moves the
 * moment someone else is named. The secretary's mailbox set there is what
 * Copy to starts with.
 *
 * Restores the demo appointments at the end: the journeys share one database.
 */

const ADVISOR = { uid: "arun.prasad", password: "Arun@2026" };

async function openUnitsConsole(page: Page) {
  await signIn(page, ACCOUNTS.manager);
  await page.goto("/admin/units");
  const password = page.getByLabel("Console password");
  if (await password.isVisible()) {
    await password.fill("0000");
    await page.getByRole("button", { name: "Unlock console" }).click();
  }
  await expect(page.getByRole("heading", { name: "Faculty Advisors" })).toBeVisible();
}

async function bookingAsOptions(page: Page): Promise<string[]> {
  await page.goto("/book");
  const nav = page.getByRole("navigation", { name: "Booking as" });
  if ((await nav.count()) === 0) return [];
  return nav.getByRole("link").allInnerTexts();
}

test("changing a council's Faculty Advisor in the console moves who can book for it", async ({ page }) => {
  await openUnitsConsole(page);
  await page
    .getByLabel("Faculty Advisor of Cultural Affairs Council", { exact: true })
    .selectOption({ label: "Dr. Priya Sharma — priya@iitpkd.ac.in" });
  await expect(page.getByText("Dr. Priya Sharma is now Faculty Advisor of Cultural Affairs Council")).toBeVisible();

  // A mailbox of Petrichor's own, in place of the council's.
  await page.getByLabel("Secretary's mailbox for Petrichor", { exact: true }).fill("fest.secretary@iitpkd.ac.in");
  await page.getByRole("button", { name: "Save secretary's mailbox for Petrichor" }).click();
  await expect(page.getByText("Secretary's mailbox for Petrichor saved")).toBeVisible();

  // Priya now books as the council's advisor; Arun keeps only Petrichor,
  // which has an advisor of its own.
  await signIn(page, ACCOUNTS.faculty);
  expect(await bookingAsOptions(page)).toContain("Faculty Advisor — Cultural Affairs Council");
  await signIn(page, ADVISOR);
  const arun = await bookingAsOptions(page);
  expect(arun).toContain("Faculty Advisor — Petrichor Fest Council");
  expect(arun).not.toContain("Faculty Advisor — Cultural Affairs Council");
  await page.goto("/book?for=club-petrichor");
  await expect(page.locator('[name="copy_to.0.email"]')).toHaveValue("fest.secretary@iitpkd.ac.in");

  // Back to the demo's appointments.
  await openUnitsConsole(page);
  await page
    .getByLabel("Faculty Advisor of Cultural Affairs Council", { exact: true })
    .selectOption({ label: "Dr. Arun Prasad — arun.prasad@iitpkd.ac.in" });
  await expect(page.getByText("Dr. Arun Prasad is now Faculty Advisor of Cultural Affairs Council")).toBeVisible();
  await page.getByLabel("Secretary's mailbox for Petrichor", { exact: true }).fill("");
  await page.getByRole("button", { name: "Save secretary's mailbox for Petrichor" }).click();
  await expect(page.getByText("Secretary's mailbox for Petrichor cleared")).toBeVisible();
});
