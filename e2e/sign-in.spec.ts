import { expect, test } from "@playwright/test";

/**
 * The sign-in door.
 *
 * **Three doors, in a fixed order** (6 Nov 2026, the owner): email and
 * password first, Mock Authentication under it, Google under that. LDAP came
 * off the interface on 27 Oct 2026 and has not come back - the form here is
 * the portal's own password, checked against `profiles.password_hash`
 * (migration 38), not a directory bind.
 *
 * This file covers the deployment the office demonstrates from: a
 * **production** build with **no Google configuration** and no `DEV_LOGIN`, so
 * the doors drawn are the password form and the account picker at
 * `/mock-login`. The picker used to 404 there, which is how the personas went
 * missing once.
 *
 * `playwright.config.ts` sets `GOOGLE_CLIENT_ID=""` explicitly rather than
 * relying on it being unset, because Next loads `.env.local` for `next start`
 * as well: a developer with real credentials in that file would otherwise be
 * running a different test from CI, and every journey would fail at sign-in
 * with no hint why.
 *
 * The server runs on the **mock store**, whose password source is the
 * published dummy directory (`lib/ldap/mock-directory.ts`), so the personas
 * sign in here with the passwords listed in
 * `.memories/05-credentials-and-security.md`. Against PostgreSQL it is
 * `profiles.password_hash` instead; the door cannot tell the difference.
 */
test("the sign-in page leads with email and password, and still offers the picker", async ({ page }) => {
  await page.goto("/sign-in");

  // The primary door, and the only one with fields.
  await expect(page.getByLabel("Email address")).toBeVisible();
  await expect(page.getByLabel("Password")).toBeVisible();
  // It is the portal's own password. LDAP is not mentioned anywhere.
  await expect(page.getByText(/LDAP/i)).toHaveCount(0);
  // It does not claim to be Google either, because it is not connected.
  await expect(page.getByRole("link", { name: /Sign in with Google/ })).toHaveCount(0);

  // The picker is underneath, named for what it is.
  await page.getByRole("main").getByRole("link", { name: "Mock Authentication" }).click();
  await expect(page.getByRole("heading", { name: "Mock Authentication", level: 1 })).toBeVisible();

  // Every seeded account is offered, split by where the persona works.
  await expect(page.getByText("guesthouse@iitpkd.ac.in")).toBeVisible();
  await expect(page.getByText("112201001@smail.iitpkd.ac.in")).toBeVisible();

  // One click lands on that role's own home.
  await page.getByRole("button", { name: /^Guest House Manager/ }).first().click();
  await page.waitForURL(/\/manager/, { timeout: 30_000 });
  await expect(page.getByRole("heading", { name: /Guest House Manager|Allocation/i }).first()).toBeVisible();
});

test("a password signs a persona in, and a wrong one says so without naming the account", async ({ page }) => {
  /**
   * Each attempt starts from a fresh load. `useActionState` re-renders the
   * form when the server action answers, and filling the fields of a form
   * that is about to be re-rendered is a race - the values were being
   * submitted empty, which looked like a rejected password.
   */
  const attempt = async (email: string, password: string) => {
    await page.goto("/sign-in");
    await page.getByLabel("Email address").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();
  };

  await page.context().clearCookies();

  // Wrong password: one message, and still on the page.
  await attempt("priya@iitpkd.ac.in", "not-the-password");
  await expect(page.getByRole("main").getByRole("alert")).toHaveText(/Incorrect email or password/i, { timeout: 30_000 });
  await expect(page).toHaveURL(/\/sign-in/);

  // An address with no account gets the same message, so the form cannot be
  // used to find out who is registered.
  await attempt("nobody@iitpkd.ac.in", "Priya@2026");
  await expect(page.getByRole("main").getByRole("alert")).toHaveText(/Incorrect email or password/i, { timeout: 30_000 });

  // The right one lands on that role's own home.
  await attempt("priya@iitpkd.ac.in", "Priya@2026");
  await page.waitForURL(/\/dashboard/, { timeout: 30_000 });

  // The session is a cookie, so a fresh navigation to the sign-in page is
  // sent on to the role's own home rather than offered the form again.
  await page.goto("/sign-in");
  await page.waitForURL(/\/dashboard/, { timeout: 30_000 });

  // A booking door offers a way through instead of a second form, and signing
  // out there ends the session and brings the form back.
  await page.goto("/book-room");
  await expect(page.getByText(/You are signed in as/)).toBeVisible();
  await page.getByRole("button", { name: "Sign in as someone else" }).click();
  await expect(page.getByLabel("Email address")).toBeVisible({ timeout: 30_000 });
});

test("the booking doors carry the destination through the picker", async ({ page }) => {
  // `?next=` survives the round trip, so "Book a room" still lands on the form
  // rather than on the manager's console or a dashboard.
  await page.goto("/book-room");
  // The password form's button is where the page says what the sign-in is for.
  await expect(page.getByRole("button", { name: "Sign in to book" })).toBeVisible();
  await page.getByRole("main").getByRole("link", { name: "Mock Authentication" }).click();
  await expect(page).toHaveURL(/\/mock-login\?next=%2Fbook/);
  await page.getByRole("button", { name: /^Anjali Menon/ }).click();
  await page.waitForURL(/\/book/, { timeout: 30_000 });
});
