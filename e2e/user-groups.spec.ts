import { expect, test } from "@playwright/test";
import { ACCOUNTS, signIn, unlockConsole } from "./helpers";

/**
 * **Console -> User Groups** (5 Nov 2026): what only a browser can show. A batch
 * is created and loaded from a real CSV file, its Copy to list reaches the form
 * of someone in it, and blocking takes them off the sign-in page until restored.
 * A new account throughout, so no other journey's persona is touched.
 */
test("a batch is loaded from a CSV, copies who the manager says, and can be blocked and restored", async ({
  page,
}) => {
  const batch = 2000 + Math.floor(Math.random() * 90);
  const roll = `11${String(batch).slice(2)}01${String(Date.now()).slice(-3)}`;
  const email = `${roll}@smail.iitpkd.ac.in`;
  const name = `Batch Student ${roll}`;

  await signIn(page, ACCOUNTS.manager);
  await page.goto("/admin/groups");
  await unlockConsole(page);
  await page.goto("/admin/groups");

  // ---------------------------------------------------------------- the group
  await page.getByRole("button", { name: "New group" }).click();
  await page.getByLabel("Batch (year joined)").fill(String(batch));
  await expect(page.getByText(`B.Tech ${batch} batch`)).toBeVisible();
  await page.getByRole("button", { name: "Create group" }).click();
  await expect(page.getByRole("link", { name: new RegExp(`B\\.Tech ${batch} batch`) })).toHaveAttribute(
    "aria-current",
    "page",
    { timeout: 30_000 }
  );

  // ------------------------------------------------------------------ the CSV
  await page.getByLabel("CSV file").setInputFiles({
    name: "batch.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(`email,full_name,roll_number\n${email},${name},${roll}\n`),
  });
  const importButton = page.getByRole("button", { name: `Import into B.Tech ${batch} batch` });
  await expect(page.getByText("1 new, 0 updated, 0 unchanged.")).toBeVisible({ timeout: 30_000 });
  await importButton.click();
  await expect(page.getByRole("cell", { name: new RegExp(name) })).toBeVisible({ timeout: 30_000 });

  // ---------------------------------------------------------------- the copies
  await page.getByLabel("Filled in for them").fill("assoc.dean@iitpkd.ac.in");
  await page.getByLabel("Filled in for them").press("Enter");
  // Off the domain is refused on the spot.
  await page.getByLabel("What else they may type").fill("someone@gmail.com");
  await page.getByLabel("What else they may type").press("Enter");
  await expect(page.getByText("Use an IIT Palakkad address")).toBeVisible();
  await page.getByLabel("What else they may type").fill("");
  await page.getByRole("button", { name: "Save copy lists" }).click();
  await expect(page.getByText("Copy lists saved")).toBeVisible({ timeout: 30_000 });

  // The route the group takes today, in words.
  await expect(page.getByText(/Assistant Warden|Guest House Manager/).first()).toBeVisible();

  // ------------------------------------------------------ the requester's form
  const student = { uid: roll, name };
  await signIn(page, student);
  await page.goto("/book");
  await expect(page.getByRole("heading", { name: /New Booking/i })).toBeVisible();
  await expect(page.locator('[name="copy_to.0.email"]')).toHaveValue("assoc.dean@iitpkd.ac.in");

  // ----------------------------------------------------------------- the block
  await signIn(page, ACCOUNTS.manager);
  await page.goto("/admin/groups");
  await unlockConsole(page);
  await page.goto("/admin/groups");
  await page.getByLabel("Roll numbers or email addresses").fill(`Roll No,Name\n${roll},${name}\n000000000,Nobody`);
  await page.getByRole("button", { name: "Check the list" }).click();
  await expect(page.getByText("1 account will be blocked.")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("No account found, so nothing happens for these:")).toBeVisible();
  await page.getByRole("button", { name: "Block 1 account" }).click();
  await expect(page.getByText("1 account blocked")).toBeVisible({ timeout: 30_000 });

  // Gone from the sign-in page, and their old session has ended.
  await page.context().clearCookies();
  await page.goto("/mock-login");
  await expect(page.getByRole("button", { name: new RegExp(`^${name}`) })).toHaveCount(0);

  // ---------------------------------------------------------------- the restore
  await signIn(page, ACCOUNTS.manager);
  await page.goto("/admin/groups");
  await unlockConsole(page);
  await page.goto("/admin/groups");
  await page.getByLabel("What to do").selectOption("restore");
  await page.getByLabel("Roll numbers or email addresses").fill(roll);
  await page.getByRole("button", { name: "Check the list" }).click();
  await page.getByRole("button", { name: "Restore 1 account" }).click();
  await expect(page.getByText("1 account restored")).toBeVisible({ timeout: 30_000 });

  await page.context().clearCookies();
  await page.goto("/mock-login");
  await expect(page.getByRole("button", { name: new RegExp(`^${name}`) })).toHaveCount(1);
});

test("an MS or PhD batch says which intake it joined, and nobody else is asked", async ({ page }) => {
  await signIn(page, ACCOUNTS.manager);
  await page.goto("/admin/groups");
  await unlockConsole(page);
  await page.goto("/admin/groups");
  await page.getByRole("button", { name: "New group" }).click();
  await expect(page.getByLabel("Joined in")).toHaveCount(0);
  await page.getByLabel("Programme").selectOption("PhD");
  await page.getByLabel("Joined in").selectOption("jan");
  await page.getByLabel("Batch (year joined)").fill("2024");
  await expect(page.getByText("PhD Jan 2024 batch")).toBeVisible();
  await page.getByLabel("Joined in").selectOption("aug");
  await expect(page.getByText("PhD Aug 2024 batch")).toBeVisible();
});
