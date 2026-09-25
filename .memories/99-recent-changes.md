# Recent changes — the last round, and only the last round

**This file is deliberately short-lived.** It holds the most recent working
session so the next person (or agent) can pick up without reading everything.
When a new round lands, **delete what is here and write the new round in its
place**. Anything permanent belongs in [03-decisions.md](03-decisions.md) (the
log that accumulates), [02-timeline.md](02-timeline.md) (one row per session)
and `AGENTS.md` (the rules).

---

## Round of 24 September 2026 (evening) — the notes rebuilt, and three fixes

### 1. `.memories` audited against the code and reorganised

Every file was read and checked against the code; about twenty drifted
statements were corrected, reversed decisions gained *Superseded* notes, and
the folder was regrouped: context and history `01`–`05` (new
[02-timeline.md](02-timeline.md), rewritten [04-roadmap.md](04-roadmap.md)),
**the product as configured** `10`–`17` (new
[10-roles-and-features.md](10-roles-and-features.md),
[11-booking-forms.md](11-booking-forms.md),
[13-settings-and-defaults.md](13-settings-and-defaults.md), and mail and
billing split into [14](14-notifications.md) and [15](15-billing-and-invoices.md)),
engineering `20`–`26`, **credentials** `30`–`31` (new
[30-credentials-and-access.md](30-credentials-and-access.md): demo logins in
full, real secrets by name and location only — the folder is pushed to
GitHub), and this file. [README.md](README.md) is the entry point; `AGENTS.md`
points new sessions at it. Details and the list of corrections:
[03-decisions.md](03-decisions.md), "24 Sep 2026 (evening)".

### 2. Three defects the audit found — fixed

| Defect | Fix | Where |
| --- | --- | --- |
| The developer could open **New Booking** but never submit (no booking types, no route) | Booking on someone's behalf is **the manager's alone**; `/book` sends the developer to the console, and the public "Book a room" pages say "Go to your portal" | `canBookOnBehalf` in `lib/access.ts` |
| **Two phone numbers**: the "Facing trouble booking?" line showed a placeholder (+91 04923 226 100, guesthouse@) unlike the site and invoice | One source: `GUEST_HOUSE_CONTACT` in `lib/site.ts` (+91 491 209 2016, ghm@iitpkd.ac.in) — read by the help line and the invoice's default contact | `lib/policy.ts`, `lib/settings.ts`, `lib/site.ts` |
| **Reception had no way to the kitchen page** it may open; its back link bounced the caretaker | **Meal counts** button on Reception (guest houses that serve meals); the kitchen page's back link returns each role to its own desk ("Back to reception") | `app/(portal)/caretaker/page.tsx`, `app/(portal)/manager/meals/page.tsx` |

Tests: `tests/audit-fixes.test.ts` (5) and `e2e/desk-links.spec.ts` (3 journeys).

### Verified

`npm run lint`, `npm run typecheck`, `npm test` (263), a production build on
the mock store and `npm run test:e2e` (19) — all clean. Every relative link in
`.memories/` resolves.

### Still open

- From the audit, not fixed: the alumni guest house matched by name, the unused
  Student Cell debit category, the amber mail header —
  [04-roadmap.md](04-roadmap.md) §3.
- From the Faculty Advisor round: apply migrations 24 and 25 to the hosted
  project; name each council's Faculty Advisor and secretary's mailbox —
  [04-roadmap.md](04-roadmap.md) §2.
- The `.next/` on this machine is a mock-store build (from the e2e run);
  rebuild before `next start` against Supabase. `npm run dev` is unaffected.
