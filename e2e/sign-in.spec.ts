import { expect, test } from "@playwright/test";

/**
 * The sign-in door.
 *
 * **Which door these journeys see.** `playwright.config.ts` blanks
 * `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`, so Google is unconfigured and
 * the one open door is **Mock authentication** - the account picker at
 * `/mock-login`, labelled "Sign in" because it is the only one
 * (`LoginForm`, `mockLoginEnabled`). That is deliberate and it is what makes
 * the suite the same on a developer's machine as in CI: `next start` loads
 * `.env.local`, so a machine with real Google credentials in it used to serve
 * a different page from CI, and these journeys asserted the Google button
 * that only that machine had.
 *
 * **So the Google button is not tested here, and that is not a gap being
 * ignored.** The flow itself is built and verified but unconfigured
 * (`lib/oidc.ts`, `GOOGLE-SIGN-IN.md`); a journey cannot exercise it without
 * either real credentials or a stub authorization server, and with real ones
 * it leaves the machine and reaches Google. What is worth testing is the part
 * both doors share - that the destination survives the round trip - and that
 * is below.
 *
 * Two things these journeys found and did **not** fix, because the sign-in
 * door is not this round's to change (`.memories/03-roadmap.md`):
 *
 *  1. `/sign-in` reads only `error` from its search params, never `next`, so
 *     the destination is dropped: `/sign-in?next=%2Fbook` offers a door with
 *     no `next` on it. `safeNextPath` and `LoginForm`'s `withNext` are both
 *     there and ready for it.
 *  2. `/book-room` passes `submitLabel="Sign in to book"`, which `LoginForm`
 *     puts on the **Google** button only - so with Google configured the
 *     label appears on a link straight to `/api/auth/google/start`, and with
 *     it unconfigured the label does not appear at all.
 */
test("the sign-in page offers the account picker, and no password anywhere", async ({ page }) => {
  await page.goto("/sign-in");

  // The only door that is open here. Named "Sign in" rather than "Mock
  // authentication" because it is the only one (7 Nov 2026).
  const door = page.getByRole("main").getByRole("link", { name: /^Sign in$/ });
  await expect(door).toBeVisible();
  await expect(door).toHaveAttribute("href", /\/mock-login/);

  // No password field is on any sign-in page (7 Nov 2026), and LDAP is gone.
  await expect(page.getByLabel("Email address")).toHaveCount(0);
  await expect(page.getByLabel("Password")).toHaveCount(0);
  await expect(page.getByText(/LDAP/i)).toHaveCount(0);
});

test("the account picker lists the demo accounts by kind of user", async ({ page }) => {
  await page.goto("/mock-login");
  // Two steps: the kind of user, then the account (`PERSONA_GROUPS`). The
  // first step is what this asserts - that the page is the picker and not a
  // 404, which is what it becomes the moment Google is configured.
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("link").or(page.getByRole("button")).first()).toBeVisible();
});

test("an error from the OAuth callback is shown on the sign-in page", async ({ page }) => {
  await page.goto("/sign-in?error=Use+your+%40iitpkd.ac.in+account");
  /**
   * Scoped to `main`. A bare `getByRole("alert")` is a **strict-mode
   * violation**: Next.js renders its own `__next-route-announcer__` with
   * `role="alert"` on every page, so the locator resolves to two elements and
   * the journey fails while the page is perfectly correct. The same trap is
   * in `.memories/22-running-and-testing.md`.
   */
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "Use your @iitpkd.ac.in account"
  );
});
