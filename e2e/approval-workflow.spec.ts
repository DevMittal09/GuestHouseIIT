import { expect, test, type Locator, type Page } from "@playwright/test";
import { ACCOUNTS, rowFor, signIn, submitRoomBooking, unlockConsole } from "./helpers";

/**
 * **The approval workflow is the office's** (12 Oct 2026, rebuilt as a flow
 * view on 12 Oct 2026).
 *
 * Console -> Approval Workflow shows one chain per kind of request, read left
 * to right and ending at the desk. This journey proves the only thing that
 * matters about it: that inserting a step there actually moves a real
 * request.
 *
 * A student's stay goes to their Assistant Warden. The manager inserts a step
 * before the desk, hands it to a named professor, calls it "Dean of
 * Students", and the next request waits for him - in a queue he never had -
 * before it reaches the desk. Then the chains are put back, because the
 * journeys share one database.
 *
 * Nothing in here types a condition, picks a waiting status, or reorders a
 * route. That is the point of the screen: the office works in kinds of
 * request and steps, and the ordered routes underneath are Advanced.
 */

/**
 * A professor who heads nothing: Dr Arun Prasad is a Faculty Advisor, which
 * is a booking right, not an approval one, and he is not the head or acting
 * head of any unit. So he has no approval queue at all until a step names
 * him - which is exactly what this journey is about.
 */
const DEAN = { uid: "arun.prasad", password: "Arun@2026", name: "Dr. Arun Prasad" };

async function openWorkflowConsole(page: Page) {
  await signIn(page, ACCOUNTS.manager);
  await page.goto("/admin/workflow");
  await unlockConsole(page);
  await expect(page.getByRole("heading", { name: "Approval workflow" })).toBeVisible();
}

/** The chains, by kind of request. Not the Advanced list of routes. */
function chains(page: Page) {
  return page.getByRole("list", { name: "Approval chains by kind of request" });
}

/**
 * One kind of request's card. Found by its heading, because "Student" is also
 * inside "IAR Student Cell".
 */
function card(page: Page, kind: string) {
  return chains(page)
    .getByRole("listitem")
    .filter({ has: page.getByRole("heading", { name: kind, exact: true }) })
    .first();
}

/**
 * A step in a chain.
 *
 * Matched on the "step N of M" caption, because the insert button beside a
 * step is labelled "Insert a step before <that step>" and a bare name would
 * match both.
 */
function step(scope: Locator, name: string) {
  return scope.getByRole("button", { name: new RegExp(`^${name} step \\d`) });
}

test("the manager inserts an approval step, and the next request waits for it", async ({
  page,
}) => {
  await openWorkflowConsole(page);

  // Before: the chain is drawn, and it is the warden's.
  const student = card(page, "Student");
  await expect(step(student, "Assistant Warden")).toBeVisible();
  await expect(student).toContainText("Guest House Manager");
  await expect(step(student, "Dean of Students")).toHaveCount(0);

  // Insert a step at the end of the chain. The editor for it opens itself,
  // so the next thing asked is who decides it.
  await student
    .getByRole("button", { name: "Insert a step before the Guest House Manager" })
    .click();
  await student
    .getByLabel("Who decides this step")
    .selectOption({ label: `${DEAN.name} - arun.prasad@iitpkd.ac.in` });
  await student.getByLabel("Call this step (optional)").fill("Dean of Students");

  // The chain redraws with the new step in it, named, after the warden.
  await expect(step(student, "Assistant Warden")).toBeVisible();
  const inserted = step(student, "Dean of Students");
  await expect(inserted).toBeVisible();
  await expect(inserted).toContainText("step 2 of 2");

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

  // The warden still has it first, and the button names the step the manager
  // inserted rather than claiming it goes to the desk.
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

  // The professor the manager named now has a queue he never had. The step
  // took the first free waiting slot, which is the one `/approvals` reads,
  // and that page keeps its own name because another route still uses the
  // slot unnamed - `configuredStageName` only renames a slot every route
  // agrees about.
  await signIn(page, DEAN);
  await expect(page.getByRole("link", { name: "Club Approvals" })).toBeVisible();
  await page.goto("/approvals");
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
  await expect(step(card(page, "Student"), "Dean of Students")).toHaveCount(0);
  await expect(step(card(page, "Student"), "Assistant Warden")).toBeVisible();
});

/**
 * The fork, which is the whole reason the screen can be arranged by kind of
 * request at all.
 *
 * Faculty and non-teaching staff share one official-stay route in the
 * defaults. Giving faculty a different chain has to leave staff alone, and
 * the card says so before anything is saved.
 */
test("giving faculty its own chain leaves non-teaching staff alone", async ({ page }) => {
  await openWorkflowConsole(page);

  const faculty = card(page, "Faculty");
  const staff = card(page, "Non-teaching staff");
  await expect(faculty).toContainText("Shares a route with Non-teaching staff.");
  await expect(faculty).toContainText("A change here applies to Faculty alone.");

  // Both are the HOD's to begin with.
  await expect(step(faculty, "HOD")).toBeVisible();
  await expect(step(staff, "HOD")).toBeVisible();

  // Take the HOD off the faculty chain only.
  await step(faculty, "HOD").click();
  await faculty.getByRole("button", { name: "Remove this step" }).click();

  // Nothing stands between faculty and the desk now.
  await expect(faculty.getByRole("button", { name: /step \d of \d/ })).toHaveCount(0);
  await expect(step(staff, "HOD")).toBeVisible();
  // Faculty now has a route of its own, so it no longer shares one.
  await expect(faculty).not.toContainText("Shares a route with");

  // Nothing was saved, so the office can walk away from it.
  await page.getByRole("button", { name: "Undo edits" }).click();
  await expect(step(card(page, "Faculty"), "HOD")).toBeVisible();
});
