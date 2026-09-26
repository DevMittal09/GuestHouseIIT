# Recent changes — the last round, and only the last round

**This file is deliberately short-lived.** It holds the most recent working
session so the next person (or agent) can pick up without reading everything.
When a new round lands, **delete what is here and write the new round in its
place**. Anything permanent belongs in [03-decisions.md](03-decisions.md) (the
log that accumulates), [02-timeline.md](02-timeline.md) (one row per session)
and `AGENTS.md` (the rules).

---

## Round of 26 September 2026 — the public site redesigned, twice

**Left uncommitted in the working tree**, as usual. Status per item in
[01-background.md](01-background.md) ("Public site redesign — 26 Sep 2026",
both lists); reasoning in [03-decisions.md](03-decisions.md) (both 26 Sep
entries); the design in [16-public-site-and-ui.md](16-public-site-and-ui.md).

**Morning.** The owner found the navy/gold site "dull and dead" and asked for
a clean, professional, impressive site that does not look AI-generated, in
the IITPKD websites' palette; a map for Hamsanandi and Bageshri; MRBS and the
institute site in the footer; a Guidelines page with placeholder rules; the
New Booking / Meal Booking buttons made prominent; Mock Authentication kept.
Built: iitpkd.ac.in's own palette (ink `#1A1A1A`, vermilion `#E94C26`,
saffron `#F5A300`), the map tabs, the MRBS footer line, numbered guidelines,
the My Bookings tiles.

**Afternoon — what the site is now.** The owner: header should look more
aesthetic; site too plain; no figures, no map link, no photo captions on the
home page; "How booking works" into the guidelines and vaguer; **no backend
logic on the public site** — not who the users are, not who approves whom; no
instructions or meal times on the landing page.

| Asked for | What was built | Where |
| --- | --- | --- |
| A more aesthetic header | Lockup = the **emblem alone** + "Guest House" in the serif + tracked "IIT PALAKKAD" (the stacked logo's own text was ~8px); **transparent over the hero** on `/`, white elsewhere; utility strip dropped; the same lockup in the footer and the portal header | `components/site/brand.tsx`, `site-header.tsx`, `app/(portal)/layout.tsx` |
| Less plain, aesthetic, not AI-looking | Photo-led: full-screen hero with the house names as the title; a photo/ink split listing the houses; a caption-free mosaic; amenity icons; a closing photo band; **photo banners on every inner page**; split-screen sign-in pages. Dark washes over photos are the only gradients | `app/(site)/page.tsx`, `PageMasthead`, `sign-in-panel.tsx`, `HOME_PHOTOS` / `PAGE_PHOTOS` |
| No figures, no map link, no captions on the landing page | Removed; gallery captions removed too (alt text kept) | home, `app/(site)/gallery/page.tsx` |
| How booking works in the guidelines, vaguer | Five general steps at the top of `/guidelines` | `BOOKING_STEPS` |
| No users / approvers on the public site | No categories, routes or role names anywhere public; `getSitePolicies()` / `homeFacts` / `openTo` deleted; a **unit test fails if a role label reaches the public copy** | `lib/site-data.ts`, `lib/site-content.ts`, `tests/public-site.test.ts` |
| No instructions or meal times on the landing page | Meal timetable and the kitchen's notice now in Guidelines §4; Book meals points there | `guidelineSections()`, `app/(site)/book-meal/page.tsx` |

### Verified

`npm run lint`, `npm run typecheck`, `npm test` (**304**), a production build
on the mock store, `npm run test:e2e` (**26**, including every public page at
320px, the map tabs and footer links, the My Bookings tiles) — all clean.
Two short rounds of Playwright screenshots judged the look; the second
caught faint text over the hero and closing photos (fixed with stronger
washes).

### Still open

- **The office to confirm the house rules** (Guidelines §7–8) and the
  **amenities** list, then set `GUIDELINES_PROVISIONAL = false` —
  [04-roadmap.md](04-roadmap.md).
- Mail still has the old amber header (restyle to ink/vermilion if wanted).
- The `.next/` on this machine is a mock-store build (from the e2e run);
  rebuild before `next start` against Supabase. `npm run dev` is unaffected.
- From earlier rounds, unchanged: apply migration 26 (and 24, 25 if missing)
  to the hosted project; the office to confirm GST-inclusive tariffs; the
  alumni guest house matched by name; name each council's Faculty Advisor and
  mailbox — [04-roadmap.md](04-roadmap.md).
