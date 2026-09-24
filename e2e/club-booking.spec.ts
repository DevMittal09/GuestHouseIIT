import fs from "fs";
import { expect, test } from "@playwright/test";
import {
  ACCOUNTS,
  chooseGuestHouse,
  fillGuest,
  localDate,
  REFERENCE,
  rowFor,
  selectedGuestHouseName,
  signIn,
} from "./helpers";

/**
 * A club is booked for by its Faculty Advisor (24 Sep 2026):
 *
 *   the club's own account is told who books for it and gets no form → a
 *   professor named Faculty Advisor in the console books from their own
 *   faculty login, choosing "Faculty Advisor — Petrichor" under Booking as →
 *   Copy to starts with the council secretary's mailbox, and they add another
 *   → it needs no forwarding and is with the Guest House Manager → it is on
 *   the professor's list, marked as the club's.
 */

const CLUB = { uid: "petrichor", password: "Petrichor@2026" };
const ADVISOR = { uid: "arun.prasad", password: "Arun@2026" };

test("a club's Faculty Advisor books for it from their faculty login; the club's account cannot", async ({ page }) => {
  await signIn(page, CLUB);
  await page.goto("/book");
  await expect(page.getByText("Ask your Faculty Advisor to book")).toBeVisible();
  await expect(page.getByText(/Dr\. Arun Prasad/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Submit booking request" })).toHaveCount(0);

  // An ordinary faculty account: New Booking offers themselves or the
  // councils and clubs the console names them Faculty Advisor of.
  await signIn(page, ADVISOR);
  await page.goto("/book");
  const bookingAs = page.getByRole("navigation", { name: "Booking as" });
  await expect(bookingAs.getByRole("link", { name: /Yourself/ })).toHaveAttribute("aria-current", "page");
  await expect(bookingAs.getByRole("link", { name: "Faculty Advisor — Cultural Affairs Council" })).toBeVisible();
  await bookingAs.getByRole("link", { name: "Faculty Advisor — Petrichor Fest Council" }).click();
  await expect(page.getByRole("heading", { name: /New Booking for Petrichor/ })).toBeVisible();

  // The council secretary is copied by default; more can be added.
  await expect(page.locator('[name="copy_to.0.email"]')).toHaveValue("sec_arts@iitpkd.ac.in");
  await page.getByRole("button", { name: "Add another email" }).click();
  await page.locator('[name="copy_to.1.email"]').fill("events.coordinator@example.org");

  await page.locator('[name="debit_head"][value="department_budget"]').check();
  await chooseGuestHouse(page);
  const house = await selectedGuestHouseName(page);
  await page.locator('[name="check_in_date"]').fill(localDate(4));
  await page.locator('[name="check_out_date"]').fill(localDate(5));
  await page.locator('[name="purpose_of_visit"]').fill("Pro-show artist for the fest");
  await fillGuest(page, 0, 0, { name: "Visiting Artist", age: "31", gender: "male" });
  await page.locator('[name="privacy_consent"]').check();
  await page.getByRole("button", { name: "Submit booking request" }).click();

  const toast = page.getByText(REFERENCE).first();
  await expect(toast).toBeVisible({ timeout: 30_000 });
  const reference = (await toast.innerText()).match(REFERENCE)![0];
  await page.waitForURL("**/dashboard", { timeout: 30_000 });
  await expect(rowFor(page, reference)).toContainText("For Petrichor");

  // Stored as the club's, raised by the professor, with both addresses copied.
  const db = JSON.parse(fs.readFileSync(process.env.E2E_DB ?? "./.e2e-db.json", "utf8"));
  const stored = db.bookings.find((b: { booking_reference_id: string }) => b.booking_reference_id === reference);
  expect(stored).toMatchObject({
    user_id: "club-petrichor",
    created_by: "faculty-arun",
    status: "PENDING_GH_MANAGER",
    copy_to_emails: ["sec_arts@iitpkd.ac.in", "events.coordinator@example.org"],
  });

  // Nobody forwards it: it is already the manager's.
  await signIn(page, ACCOUNTS.manager);
  await page.goto(`/manager?gh=${encodeURIComponent(house)}`);
  await expect(rowFor(page, reference)).toBeVisible();
});
