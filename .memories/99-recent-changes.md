# Recent changes — the last round, and only the last round

**This file is deliberately short-lived.** It holds the most recent working
session so the next person (or agent) can pick up without reading everything.
When a new round lands, **delete what is here and write the new round in its
place**. Anything permanent belongs in [03-decisions.md](03-decisions.md) (the
log that accumulates), [02-timeline.md](02-timeline.md) (one row per session)
and `AGENTS.md` (the rules).

---

## Round of 30 September 2026 — UI revamp (presentation layer only)

**Left uncommitted in the working tree**, as usual. The owner's brief (pasted
into the session, with `UI-REVAMP-CONTEXT.md` as the product inventory) asked
for an authoritative, institutional look: TGH (IIT Madras) for the public
site's structure, Aman / The Standard for editorial whitespace and ruled
sections, GOV.UK for the portal's tables and status tags; 4px inputs, 6px
buttons, 8px cards; no pills, shadows, gradients or frosted glass. Status in
[01-background.md](01-background.md) ("UI revamp — 30 Sep 2026"); reasoning in
[03-decisions.md](03-decisions.md); the design in
[16-public-site-and-ui.md](16-public-site-and-ui.md).

**Nothing in `lib/`, `app/actions/`, the schemas or the database changed.**
Every accessible name, form `name` and heading the e2e suite uses is intact.

| Area | Now |
| --- | --- |
| Tokens (`app/globals.css`) | Fixed corner scale — `rounded` 4px, `rounded-md` 6px, `rounded-lg` 8px, everything above capped at 8px; `--occupy` / `--vacate`; GOV.UK tag utilities `tag-{grey,green,turquoise,blue,purple,pink,red,orange,yellow}`; toasts without shadow; `font-optical-sizing: auto` on headings |
| Primitives (`components/ui/`) | Button 6px, h-9, vermilion focus outline, new `occupy` / `vacate` variants, outlined `destructive`; Badge square with a `tag` variant; Card = GOV.UK summary card (band header strip over a hairline, 8px border, no ring); Table = band header closed by a 2px ink rule, hairline rows, tabular numerals; Input / Textarea / NativeSelect 4px with ink-on-focus + vermilion outline; Dialog without blur, ink 45% overlay, 3px ink top rule, serif title; Select / Popover / Switch / Tabs without shadows or pills |
| New shared components | `section-heading.tsx` (`SectionHeading` with a count tag, `EmptyState`), `link-tabs.tsx` (guest-house tabs on `/manager`, `/caretaker`, `aria-current`), `console-nav.tsx` (the console's section list, current one filled ink), `segmented.tsx` (`segmentGroup` / `segment()` for Day/Week/Month, the outbox filter, the Form Builder role picker) |
| Portal | 3px vermilion rule over the header; `PageHeader` with a vermilion bar, larger serif `<h1>`, closing hairline; My Bookings doors now 148px tiles (vermilion room / ink meals); **Mark as Occupied** deep green with a log-in icon, **Mark as Vacated** deep indigo with a log-out icon; official and overdue rows marked by a left rule on a notice tint; notices as GOV.UK inset text (4px left rule); room grid seats pale green with a green edge (9:1), taken solid red and struck through, picked solid blue; history tiles with a coloured top rule; booking details as a ruled summary list |
| Public site | Lockup with a hairline between emblem and words; 3px vermilion rule over the header; home hero 5 + 7 columns with one 4:3 photo; **sections open on a hairline ink rule with the label in the left quarter** (`SectionHead`); guest-house cards and a ruled amenity grid offset into the content column; a four-photo mosaic (one across two rows); a closing row of Guidelines / Contact links; Guidelines steps as a ruled strip with serif numerals; sign-in photo 4:3 in seven columns |

### Verified

`npm run lint`, `npm run typecheck`, `npm test` (**305**), a production build
on the mock store, `npm run test:e2e` (**26**, including every public page at
320px) — all clean. Four Playwright screenshots (home, manager console, the
allocation grid, My Bookings) checked the look; the compiled CSS confirmed the
corner scale (`rounded` 4px, `-md` 6px, `-lg` 8px).

### Still open

- The `.next/` on this machine is a mock-store build (from the e2e run);
  rebuild before `next start` against Supabase. `npm run dev` is unaffected.
- Mail still has the old amber header (restyle to ink/vermilion if wanted).
- From earlier rounds, unchanged: the office to confirm the house rules
  (Guidelines §7–8) and amenities; apply migrations 24–26 to the hosted
  project; GST-inclusive tariffs; each council's Faculty Advisor and mailbox —
  [04-roadmap.md](04-roadmap.md).
