import { expect, test } from "@playwright/test";
import { ACCOUNTS, fillGuest, localDate, rowFor, signIn, submittedReference, unlockConsole } from "./helpers";

/**
 * **The owner's sixteenth list (4 November 2026)**, what only a browser can
 * show: the manager shortening a request as they approve it, a VIP room they
 * cannot give a faculty member's personal stay, and their own console page.
 * The rules themselves are `tests/sixteenth-round.test.ts`.
 */
test("the manager shortens a request while approving it, and cannot give it a VIP room", async ({
  page,
}) => {
  await signIn(page, ACCOUNTS.faculty);
  await page.goto("/book");
  await expect(page.getByRole("heading", { name: /New Booking/i })).toBeVisible();
  await page.locator('[name="booking_type"][value="personal"]').check();
  const house = page.locator('select[name="guest_house_id"]');
  const hamsanandi = await house.locator("option", { hasText: "Hamsanandi" }).getAttribute("value");
  await house.selectOption(hamsanandi!);
  await page.locator('[name="check_in_date"]').fill(localDate(4));
  await page.locator('[name="check_out_date"]').fill(localDate(14));
  await page.locator('[name="purpose_of_visit"]').fill("A ten-day family visit");
  await fillGuest(page, 0, 0, { name: "Meera Sharma", age: "60", gender: "female", relationship: "Mother" });
  await page.getByRole("button", { name: "Submit booking request" }).click();
  const reference = await submittedReference(page);

  await signIn(page, ACCOUNTS.manager);
  await page.goto("/manager?gh=hamsanandi");
  await rowFor(page, reference).getByRole("button", { name: /Review & Allocate/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Loading occupancy…")).toHaveCount(0, { timeout: 30_000 });

  // C1 and C2 are marked, and locked for a requester without VIP access.
  await expect(dialog.getByRole("button", { name: /^C1/ })).toBeDisabled();
  await expect(dialog.getByRole("button", { name: /^C2/ })).toBeDisabled();
  await expect(dialog.getByRole("button", { name: /^A1/ })).toBeEnabled();

  // Ten nights become three, and the log says so.
  await dialog.getByText("Shorten this stay").click();
  await dialog.getByLabel("New check-out date").fill(localDate(7));
  await dialog.getByLabel("Reason").fill("Only three nights can be spared");
  await dialog.getByRole("button", { name: "Shorten stay" }).click();
  await expect(dialog.getByText(/Stay shortened from 10 nights/)).toBeVisible({ timeout: 30_000 });
});

test("the manager keeps the VIP rooms and the Guidelines link, and requesters get the link", async ({
  page,
}) => {
  await signIn(page, ACCOUNTS.manager);
  await page.goto("/admin/policy");
  await unlockConsole(page);
  await page.goto("/admin/policy");
  await expect(page.getByText("VIP rooms", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "C1" })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: "A1" })).not.toBeChecked();
  await expect(page.getByLabel("Rooms shown at most")).toHaveValue("14");
  await page.getByLabel("Guidelines link").fill("https://drive.google.com/file/d/example/view");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Saved")).toBeVisible({ timeout: 30_000 });

  await page.goto("/guidelines");
  await expect(page.getByRole("heading", { name: "Dos and don'ts" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Guidelines document/ })).toHaveAttribute(
    "href",
    "https://drive.google.com/file/d/example/view"
  );
});
