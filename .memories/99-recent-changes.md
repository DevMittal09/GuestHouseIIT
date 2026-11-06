# Recent changes - the last round, and only the last round

This file is **replaced** every round, not appended to. The round before this
one is written up where every round is: what was asked in
[01-background.md](01-background.md), why it was done that way in
[02-decisions.md](02-decisions.md).

---

## Round of 6 November 2026 - mock authentication beside Google

> The owner: *"Can you add mock authentication along with google oauth in the
> sign in page for now. Right now its only google oauth."*

The owner had just put `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` into
`.env.local`, and the account picker disappeared - which is exactly what
`mockLoginEnabled()` was written to do on 28 Oct 2026. Sound rule, wrong
consequence on a development machine: it also took away the one-click way of
becoming each of the nineteen demo personas.

### What changed

- **`mockLoginEnabled()` (`lib/env.ts`)** - outside production the picker is
  always open, Google configured or not. **In production nothing changed**:
  Google configured closes it, Google unconfigured leaves it open because the
  button has to lead somewhere, `MOCK_LOGIN=false` closes it outright.
  `MOCK_LOGIN=true` was deliberately *not* made the switch - a flag that
  forces the picker open is the thing that gets copied into production and
  forgotten.
- **`LoginForm` (`components/login-form.tsx`)** takes
  `doors: { google, mock }` in place of the three-valued `googleSignIn`, and
  draws one button per open door: **Sign in with Google** solid with the
  Google mark, **Mock Authentication** outlined beneath it. The picker is
  solid when it is the only door. No Google mark on the mock button, as
  before. The line underneath names which door it is.
- **`SignInPanel`** passes
  `{ google: googleOauth() !== null, mock: mockLoginEnabled() }`.

### The hole this uncovered

Next loads `.env.local` for `next start` too, so the moment those credentials
went into that file the **Playwright suite was testing a Google-configured
deployment**: the picker was closed, `signIn()` could not get in, and all 55
journeys failed at the first step with no hint why.
`playwright.config.ts` now sets `GOOGLE_CLIENT_ID: ""` and
`GOOGLE_CLIENT_SECRET: ""` explicitly - the same trick
`NEXT_PUBLIC_SUPABASE_URL=""` already used for the mock store - so the suite
no longer depends on a gitignored file.

### Checks

`npm run lint`, `npm run typecheck`, `npm test` (**696 pass**, 7 new in
`tests/security.test.ts` pinning `mockLoginEnabled()` in each environment),
`npm run build` and `npm run test:e2e` (**55 pass**) all clean. The rendered
page was also read with `curl` against a dev server with Google configured:
both buttons, both hrefs, the right line underneath.

### Note

A larger piece of work is in flight on **`integration/main-into-production`** -
merging `main` into `production_migration` (the `pg` rewrite, the institute
tables, migration 37). That branch now needs this commit merged into it; it
was branched before this round.
