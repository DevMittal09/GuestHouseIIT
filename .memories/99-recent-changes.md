# Recent changes — the last round, and only the last round

**This file is deliberately short-lived.** It holds the most recent working
session so the next person (or agent) can pick up without reading everything.
When a new round lands, **delete what is here and write the new round in its
place**. Anything permanent belongs in [03-decisions.md](03-decisions.md) (the
log that accumulates), [02-timeline.md](02-timeline.md) (one row per session)
and `AGENTS.md` (the rules).

---

## Round of 26 September 2026 — the public site redesigned (three passes)

**Left uncommitted in the working tree**, as usual. Status per request in
[01-background.md](01-background.md) ("Public site redesign — 26 Sep 2026",
three lists); reasoning in [03-decisions.md](03-decisions.md) (three 26 Sep
entries, older ones marked *Superseded*); the design in
[16-public-site-and-ui.md](16-public-site-and-ui.md).

1. **Morning** — the institute's palette from iitpkd.ac.in's CSS (ink
   `#1A1A1A`, vermilion `#E94C26`, saffron `#F5A300`); **a map tab per guest
   house** from the owner's two links; **MRBS** and institute links in the
   footer; a numbered **Guidelines** page with placeholder house rules;
   **large New room booking / Meal booking tiles** on My Bookings; Mock
   Authentication kept.
2. **Afternoon** — the owner: header more aesthetic; **no figures, no map
   link, no captions** on the landing page; "How booking works" into the
   guidelines, vaguer; **no backend logic on the public site** (not who the
   users are, not who approves whom); no instructions or meal times on the
   landing page. Done — and a new **lockup** (the emblem + "Guest House" in
   the serif + tracked "IIT PALAKKAD"; the stacked logo's own text was ~8px).
3. **Evening (what the site is now)** — the owner found the full-screen photos
   "so weird": make it **clean and professional**, researched online. Modelled
   on IIT Madras's Taramani Guest House site and clean hotel/university sites:

| Page | Now |
| --- | --- |
| Header | White bar with the lockup and six links, sticky from `lg`; a sideways-scrolling link row on phones |
| Home | Split hero (label, "Guest houses of IIT Palakkad", one sentence, Book a room / Book meals, the front-office number, **one contained 4:3 photo**); a **card per guest house** (`houseSummary`, no counts); **eight amenity cards**; "A look inside" — four equal thumbnails; a boxed "Planning a visit?" |
| Guidelines | Light masthead; **How booking works** as five numbered cards; contents list; eight numbered sections (meal times and the kitchen's notice in §4; §7–8 provisional) |
| Gallery, Contact, Privacy | Light mastheads; gallery without captions; the map tabs in a rounded card |
| Sign in / Book a room / Book meals | The form beside a contained photo |
| Look | 8px corners on cards and photos, 6px on buttons; borders; no shadows; no gradients |

The public copy names no role or approval stage — `tests/public-site.test.ts`
fails if a role label reaches it. `getSitePolicies()` and the route tables
were deleted.

### Verified

`npm run lint`, `npm run typecheck`, `npm test` (**305**), a production build
on the mock store, `npm run test:e2e` (**26**, every public page at 320px,
the map tabs and footer links, the My Bookings tiles) — all clean. Short
rounds of Playwright screenshots after each pass judged the look.

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
