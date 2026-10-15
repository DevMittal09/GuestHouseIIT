# Recent changes - the last round, and only the last round

This file is **replaced** every round, not appended to. The round before this
one is written up where every round is: what was asked in
[01-background.md](01-background.md), why it was done that way in
[02-decisions.md](02-decisions.md).

---

## Round of 14 October 2026 (later still) - the privacy notice withdrawn and archived

> **The round immediately before this one, the same day**, was the office's
> twelfth list: the contact number labelled Guest House Manager, free rooms
> counted in green, past dates greyed out of the week and month views, the
> privacy consent tick removed, and the booking window opened to six months.
> It is written up in [01-background.md](01-background.md) and
> [02-decisions.md](02-decisions.md). **This round continues its fourth item.**

The owner, hours later:

> Remove privacy policy feature completely, but keep it saved in the repo as a
> archive or something, basically i should be able to revert it back later on
> if i need it. So keep it saved here somewhere in the project root but do not
> deploy it.

**No migration, no column dropped, no store operation changed.** One new
folder, four files edited, one route deleted, one e2e test replaced by its
opposite.

### 1. "Completely" needed a boundary first

The privacy code is three layers, and the wrong guess deletes a working
feature, so the owner was asked and chose the narrowest:

| Layer | Taken? |
| --- | --- |
| The **notice**: the `/privacy` page and route, `PRIVACY_NOTICE_VERSION`, its three links, the dead `privacy_consent` payload field, its tests | **removed and archived** |
| The **data rights**: Download my data, Ask for erasure, the office's answers in Console -> Security | kept live |
| **Retention**: `rules.privacy` and `lib/retention-server.ts`, which erase Aadhaar numbers and ID scans after a stay | kept live - advised against removing, and the advice was taken |

### 2. What was removed

- `app/(site)/privacy/page.tsx` and its route. **`/privacy` is a 404.**
- `PRIVACY_NOTICE_VERSION` from `lib/security.ts`.
- All three links: the site footer's bottom line, the Guidelines' closing
  sentence (and the `Link` import that went with it), the first item of the
  My Bookings row (likewise).
- `privacy_consent` from `bookingPayloadSchema`. A payload that still names it
  is **stripped, not refused** - the object is not `.strict()`, and refusing
  would turn a withdrawn field into a submission nobody can make. The 15
  `privacy_consent: true` lines left in unit fixtures went too.

### 3. The archive, and the one rule that makes "do not deploy it" true

`archive/privacy-notice/` holds the page verbatim under its original path and a
`README.md` that **is** the restore: four numbered steps with the exact
snippets, which commit holds the complete before-state (**`8a6ebe5`**, the last
one with both halves of the feature), and why the consent half must not be
restored alone - a tick pointing at a page that 404s is worse than no tick.
`archive/README.md` is the folder's contract.

Nothing imports it, so it is never compiled or routed. Three config facts hold
that, and the first was not theoretical - the archived page imports a constant
this round deleted:

- **`tsconfig.json` excludes `archive`** (`include` is `**/*.ts` / `**/*.tsx`,
  so `tsc --noEmit` and `next build` would otherwise compile it and fail).
- **`eslint.config.mjs` ignores `archive/**`**, as it already does
  `design_handoff/**`.
- **Neither test runner collects it** (`tests/**/*.test.ts`, `e2e/`).

Why a folder rather than git history, and why not a patch file:
[02-decisions.md](02-decisions.md), "Why an archive folder rather than git
history".

### 4. Kept, deliberately

`bookings.privacy_notice_version` and `privacy_consent_at` are **not dropped**:
bookings made before today carry real values and the data export prints them.
Nothing writes either column. That is why the restore needs no database work.

### Files

**New:** `archive/README.md`, `archive/privacy-notice/README.md`,
`archive/privacy-notice/files/app/(site)/privacy/page.tsx`.

**Deleted:** `app/(site)/privacy/page.tsx`.

**Changed:** `lib/security.ts`, `components/site/site-chrome.tsx`,
`app/(site)/guidelines/page.tsx`, `components/my-data.tsx`,
`lib/booking-schema.ts`, `app/actions/bookings.ts` and
`components/booking-form.tsx` (comments that described the notice as live),
`e2e/public-site.spec.ts`, eleven test files, `tsconfig.json`,
`eslint.config.mjs`.

**Unchanged:** `app/actions/privacy.ts`, `lib/retention-server.ts`,
`rules.privacy`, the `privacy_requests` table, Console -> Security, every
store.

### How it was checked

- `npm run lint`, `npm run typecheck` - clean. **`rm -rf .next/dev/types`
  first**: deleting a route leaves it stale and the typecheck fails naming the
  route you deleted ([22-running-and-testing.md](22-running-and-testing.md)).
- **`npm test` - 555 passing, 33 files.**
- `NEXT_PUBLIC_SUPABASE_URL= npm run build` - clean, **no `/privacy` in the
  route list**, and no build output contains the notice's text.
- **`npm run test:e2e` - 41 passing**, with the old "the privacy notice is
  published and versioned" test replaced by **"the privacy notice is not
  published"**: `/privacy` returns **404** and no public page links the word.
  Both halves matter - a restored page nobody can reach, and a link to a page
  that 404s, would each pass every other test in the suite.
- **The restore was run.** Steps 1-3 of `archive/privacy-notice/README.md`
  applied to the working tree: lint, typecheck and build clean with `/privacy`
  back as a route. The tree was then put back from a backup and every check
  re-run. An archive whose restore has never been run is a folder of hope.
- `npm run check:memories`.

### Left open

[03-roadmap.md](03-roadmap.md) §2g, rewritten: **the portal now publishes no
privacy notice and records no consent while holding ID scans, parents' names
and phone numbers.** That is the institute's decision to take before go-live -
[04-production.md](04-production.md) "DPDP Act, 2023" states it as a question,
and if the institute has a notice of its own that covers the portal then
linking to it is a line in the footer. Also there: the archive is now a thing
to maintain - a restored feature is **deleted** from it in the same change, or
the live and archived copies drift.
