import { expect, test, type Page } from "@playwright/test";
import {
  ACCOUNTS,
  chooseGuestHouse,
  fillGuest,
  localDate,
  REFERENCE,
  signIn,
} from "./helpers";

/**
 * The office's ninth list (8 Oct 2026): the debitable heads it gave, the funds
 * declaration beside them, and loading the accounts from a spreadsheet.
 */

/**
 * A console section, unlocking it if the lock screen is up.
 *
 * Users & Roles draws no heading of its own - the console layout's masthead is
 * the only one - so the section is recognised by something on the page itself.
 */
async function openConsole(
  page: Page,
  path: string,
  present: string | RegExp,
  as: { uid: string; password: string } = ACCOUNTS.manager
) {
  await signIn(page, as);
  await page.goto(path);
  const password = page.getByLabel("Console password");
  if (await password.isVisible()) {
    await password.fill("0000");
    await page.getByRole("button", { name: "Unlock console" }).click();
  }
  await expect(page.getByText(present).first()).toBeVisible();
}

test("a faculty booking asks for the declaration, and will not go without it", async ({ page }) => {
  await signIn(page, ACCOUNTS.faculty);
  await page.goto("/book");
  await expect(page.getByRole("heading", { name: /New Booking/i })).toBeVisible();

  // The office's heads for a faculty member: their department, a project,
  // their PDF, a special budget, or their own money - and not the Institute
  // Grant, the alumni's, the students' or the hostels'.
  await expect(page.locator('[name="debit_head"][value="department_budget"]')).toBeVisible();
  await expect(page.locator('[name="debit_head"][value="project_grant"]')).toBeVisible();
  await expect(page.locator('[name="debit_head"][value="professional_development_fund"]')).toBeVisible();
  await expect(page.locator('[name="debit_head"][value="special_budget"]')).toBeVisible();
  await expect(page.locator('[name="debit_head"][value="personal_funds"]')).toBeVisible();
  for (const head of ["institute_grant", "alumni_fund", "student_fund", "hostel_funds"]) {
    await expect(page.locator(`[name="debit_head"][value="${head}"]`)).toHaveCount(0);
  }

  // Nothing chosen yet: nothing to declare.
  await expect(page.locator('[name="fund_declaration"]')).toHaveCount(0);

  // Their own money needs no declaration - they are the competent authority
  // for it, and there is no balance for them to verify.
  await page.locator('[name="debit_head"][value="personal_funds"]').check();
  await expect(page.locator('[name="fund_declaration"]')).toHaveCount(0);

  // Somebody else's does, in the office's own words.
  await page.locator('[name="debit_head"][value="department_budget"]').check();
  const declaration = page.locator('[name="fund_declaration"]');
  await expect(declaration).toBeVisible();
  await expect(
    page.getByText(/I have the necessary approval for the usage of funds from the competent authority/)
  ).toBeVisible();

  // Fill in everything else and submit without ticking it: the server
  // refuses, and the message is attached to the declaration.
  await chooseGuestHouse(page);
  await page.locator('[name="check_in_date"]').fill(localDate(3));
  await page.locator('[name="check_out_date"]').fill(localDate(5));
  await page.locator('[name="purpose_of_visit"]').fill("A collaborator's visit");
  await fillGuest(page, 0, 0, { name: "Declaration Guest", age: "44" });
  await page.locator('[name="privacy_consent"]').check();
  await page.getByRole("button", { name: "Submit booking request" }).click();
  await expect(page.getByText(/Tick the declaration to confirm the funds are approved/)).toBeVisible();

  // Ticked, it goes through.
  await declaration.check();
  await page.getByRole("button", { name: "Submit booking request" }).click();
  await expect(page.getByText(REFERENCE).first()).toBeVisible({ timeout: 30_000 });
  await page.waitForURL("**/dashboard", { timeout: 30_000 });
});

test("Special Budget asks which fund, and the approval can be attached", async ({ page }) => {
  await signIn(page, ACCOUNTS.faculty);
  await page.goto("/book");
  await page.locator('[name="debit_head"][value="special_budget"]').check();

  // "Special Budget (Please specify the details)" - mandatory since 8 Oct
  // 2026, with the approval upload beside it and still optional.
  const details = page.locator('[name="debit_details"]');
  await expect(details).toBeVisible();
  await expect(page.getByText(/Which special fund/)).toBeVisible();
  await expect(page.getByLabel(/Upload approval/)).toBeVisible();

  await chooseGuestHouse(page);
  await page.locator('[name="check_in_date"]').fill(localDate(3));
  await page.locator('[name="check_out_date"]').fill(localDate(5));
  await page.locator('[name="purpose_of_visit"]').fill("A fund-backed visit");
  await fillGuest(page, 0, 0, { name: "Special Guest", age: "40" });
  await page.locator('[name="fund_declaration"]').check();
  await page.locator('[name="privacy_consent"]').check();
  await page.getByRole("button", { name: "Submit booking request" }).click();
  await expect(page.getByText(/Which special fund.*is required/i)).toBeVisible();

  await details.fill("Director's discretionary fund - DO/2026/114");
  await page.getByRole("button", { name: "Submit booking request" }).click();
  await expect(page.getByText(REFERENCE).first()).toBeVisible({ timeout: 30_000 });
});

test("the manager loads accounts from a spreadsheet paste and removes them again", async ({
  page,
}) => {
  await openConsole(page, "/admin/users", /\d+ accounts/);

  // Paste → check the plan → import. The header line says what the columns
  // are, in the office's own order.
  await page.getByRole("button", { name: "Import from spreadsheet" }).click();
  const paste = page.getByLabel("People", { exact: true });
  await paste.fill(
    [
      "Name, Email, Roll No.",
      "Imported One, imported.one@iitpkd.ac.in, EMP9001",
    ].join("\n")
  );
  await page.getByRole("button", { name: "Check the paste" }).click();
  // A header has to lead with the email column, so this one is read as data.
  await expect(page.getByText(/not an email address/).first()).toBeVisible();

  await paste.fill(
    [
      "email, name, roll_number, role",
      "imported.one@iitpkd.ac.in, Imported One, EMP9001, student",
      "imported.two@iitpkd.ac.in, Imported Two, EMP9002, employee",
    ].join("\n")
  );
  await page.getByRole("button", { name: "Check the paste" }).click();
  await expect(page.getByText("2 added, 0 updated, 0 unchanged")).toBeVisible();
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await expect(page.getByText(/Users imported - 2 added/)).toBeVisible({ timeout: 30_000 });
  const row = (email: string) => page.getByRole("cell", { name: email, exact: true });
  await expect(row("imported.one@iitpkd.ac.in")).toBeVisible({ timeout: 30_000 });
  await expect(row("imported.two@iitpkd.ac.in")).toBeVisible();

  // Running the same paste again changes nothing - it is how the office
  // refreshes a list that has grown.
  await page.getByRole("button", { name: "Import from spreadsheet" }).click();
  await page.getByLabel("People", { exact: true }).fill(
    [
      "email, name, roll_number, role",
      "imported.one@iitpkd.ac.in, Imported One, EMP9001, student",
      "imported.two@iitpkd.ac.in, Imported Two, EMP9002, employee",
    ].join("\n")
  );
  await page.getByRole("button", { name: "Check the paste" }).click();
  await expect(page.getByText("0 added, 0 updated, 2 unchanged")).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();

  // And the rows can be ticked and deleted together.
  await page.getByLabel("Select imported.one@iitpkd.ac.in").check();
  await page.getByLabel("Select imported.two@iitpkd.ac.in").check();
  await page.getByRole("button", { name: "Delete 2 selected" }).click();
  await page.locator("#confirm-phrase").fill("delete 2");
  await page.getByRole("button", { name: "Delete accounts" }).click();
  await expect(page.getByText(/2 accounts deleted/)).toBeVisible({ timeout: 30_000 });
  await expect(row("imported.one@iitpkd.ac.in")).toHaveCount(0);
  await expect(row("imported.two@iitpkd.ac.in")).toHaveCount(0);
});
