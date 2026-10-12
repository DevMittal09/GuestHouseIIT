import { expect, test, type Page } from "@playwright/test";
import { ACCOUNTS, rowFor, signIn, submitRoomBooking, unlockConsole } from "./helpers";

/**
 * **The approval workflow is the office's** (12 Oct 2026).
 *
 * Console -> Approval Workflow is an ordered list of routes; a request takes
 * the first one that matches it. This journey proves the only thing that
 * matters about it: that an edit there actually moves a real request.
 *
 * A student's stay goes to their Assistant Warden. The manager inserts a
 * stage after the warden, decided by a named professor, and the next request
 * waits for that professor - who has a queue they never had before - before
 * it reaches the desk. Then the route is put back, because the journeys share
 * one database.
 */

/**
 * A professor who heads nothing: Dr Arun Prasad is a Faculty Advisor, which
 * is a booking right, not an approval one, and he is not the head or acting
 * head of any unit. So he has no approval queue at all until a route names
 * him - which is exactly what this journey is about.
 */
const DEAN = { uid: "arun.prasad", password: "Arun@2026", name: "Dr. Arun Prasad" };

async function openWorkflowConsole(page: Page) {
  await signIn(page, ACCOUNTS.manager);
  await page.goto("/admin/workflow");
  await unlockConsole(page);
  await expect(page.getByRole("heading", { name: "Approval workflow" })).toBeVisible();
}

/** The student route's row, found by the name the office gave it. */
function studentRoute(page: Page) {
  return page.getByRole("listitem").filter({ hasText: "Student - Assistant Warden" }).first();
}

test("the manager inserts an approval stage, and the next request waits for it", async ({ page }) => {
  await openWorkflowConsole(page);

  // Before: one stage, and the chain reads back in words.
  const route = studentRoute(page);
  await expect(route).toContainText("Assistant Warden - Guest House Manager");

  // Insert a second stage, decided by one named person.
  await route.getByRole("button", { name: "Edit" }).click();
  await route.getByRole("button", { name: "Add a stage" }).click();
  const added = route.getByRole("listitem").last();
  await added.getByLabel("Waits in").selectOption("PENDING_HOD");
  await added.getByLabel("Decided by").selectOption("profile");
  await added.getByLabel("Who").selectOption({ label: `${DEAN.name} - arun.prasad@iitpkd.ac.in` });
  await added.getByLabel("Call this stage (optional)").fill("Dean of Students");
  await expect(route).toContainText("Assistant Warden - Dean of Students - Guest House Manager");

  // Try it names the people, not the rules.
  await page.getByLabel("Requester").selectOption({ label: "Anjali Menon (Student)" });
  await page.getByRole("button", { name: "Work out the route" }).click();
  await expect(page.getByText(/Dean of Students/).first()).toBeVisible();

  await page.getByRole("button", { name: "Save the workflow" }).click();
  const confirm = page.getByRole("dialog");
  await expect(confirm.getByRole("heading", { name: "Change the approval workflow?" })).toBeVisible();
  await confirm.getByRole("button", { name: "Save the workflow" }).click();
  await expect(page.getByText("Approval workflow saved")).toBeVisible();

  // ------------------------------------------------------------- a request
  await signIn(page, ACCOUNTS.student);
  const reference = await submitRoomBooking(page, {
    purpose: "Parents visiting",
    guest: { name: "Latha Menon", age: "52", gender: "female", relationship: "Mother" },
  });

  // The warden still has it first, and the button now names the stage the
  // manager inserted rather than claiming it goes to the desk.
  await signIn(page, ACCOUNTS.warden);
  await page.goto("/warden");
  const waiting = rowFor(page, reference);
  await expect(waiting).toBeVisible();
  await waiting.getByRole("button", { name: "Review" }).click();
  const review = page.getByRole("dialog");
  await review.getByRole("button", { name: "Forward to Dean of Students" }).click();
  await expect(rowFor(page, reference)).toHaveCount(0);

  // It is not at the desk yet.
  await signIn(page, ACCOUNTS.manager);
  await page.goto("/manager");
  await expect(rowFor(page, reference)).toHaveCount(0);

  // The professor the manager named now has a queue they never had - the
  // nav offers it, and the request is in it. The page keeps the slot's own
  // name, because two other routes still use that slot as the HOD's.
  await signIn(page, DEAN);
  await expect(page.getByRole("link", { name: "HOD Queue" })).toBeVisible();
  await page.goto("/hod");
  const atDean = rowFor(page, reference);
  await expect(atDean).toBeVisible();
  await atDean.getByRole("button", { name: "Forward", exact: true }).click();

  // Now it is the desk's.
  await signIn(page, ACCOUNTS.manager);
  await page.goto("/manager");
  await expect(rowFor(page, reference)).toBeVisible();

  // -------------------------------------------------------- put it back
  await openWorkflowConsole(page);
  await page.getByRole("button", { name: "Restore the institute's routes" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Restore them" }).click();
  await expect(page.getByText("Restored the institute's routes")).toBeVisible();
  await expect(studentRoute(page)).toContainText("Assistant Warden - Guest House Manager");
});
