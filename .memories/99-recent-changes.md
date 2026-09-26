# Recent changes — the last round, and only the last round

**This file is deliberately short-lived.** It holds the most recent working
session so the next person (or agent) can pick up without reading everything.
When a new round lands, **delete what is here and write the new round in its
place**. Anything permanent belongs in [03-decisions.md](03-decisions.md) (the
log that accumulates), [02-timeline.md](02-timeline.md) (one row per session)
and `AGENTS.md` (the rules).

---

## Round of 26 September 2026 — the public site redesigned

Asked by the owner: the site "looks ass", "too dull and dead"; make it clean,
professional and impressive **without looking AI-generated**, true to the
backend, keeping Mock Authentication, in **the IITPKD websites' palette**;
a map with **Hamsanandi and Bageshri** (two Google Maps links); **MRBS** and
the institute site in the footer; a **Guidelines** page with placeholder
rules; and the **New Booking / Meal Booking** buttons in the portal made to
stand out. All done. Status per item in [01-background.md](01-background.md)
("Public site redesign — 26 Sep 2026"), reasoning in
[03-decisions.md](03-decisions.md), the design itself in
[16-public-site-and-ui.md](16-public-site-and-ui.md). **Left uncommitted in the
working tree**, as usual.

| Asked for | What was built | Where |
| --- | --- | --- |
| The IITPKD palette | Read from iitpkd.ac.in's theme CSS and the logo: ink `#1A1A1A`, vermilion `#E94C26` (`vermilion-deep` `#C43C1C` behind white text), saffron `#F5A300`, band `#F3F1EB`. `--primary` ink, `Button variant="brand"` for the call to action. The portal follows through the tokens | `app/globals.css`, `components/ui/button.tsx` |
| Impressive, professional, not AI-looking | No gradients / shadows / glass / pills; hairline rules as structure, serif display type (optical sizes), asymmetric layouts, captioned photos, tables for tabular facts, copy with real numbers from the backend | every page under `app/(site)/`, `components/site/*` |
| Home | Courtyard photo with an overlapping white panel ("Guest houses on the campus", Book a room / Book meals); computed figures (rooms, advance window, stay cap, meals a day); the guest houses side by side with **Requested by** from the form configs; photo spread; ink band with the five steps and **Who approves your request**; Dining timetable; Facilities; contact band | `app/(site)/page.tsx`, `homeFacts` / `openTo` / `bookingSteps` in `lib/site-content.ts` |
| Map with two options | **Tabs per guest house** on `/contact` (WAI-ARIA, keyboard); each embeds the place by its Google Maps name + coordinates, no API key; Map / Directions for each in the footer and on the home page | `GUEST_HOUSE_LOCATIONS`, `guestHouseMapPins` in `lib/site.ts`; `components/site/guest-house-map.tsx` |
| MRBS and the institute site in the footer | Footer opens with "Booking a lecture hall or meeting room?" → **Open MRBS**; columns: address, front office, Find us (both houses, How to reach), Institute (IIT Palakkad website, MRBS, guest house page, How to reach, Telephone directory — all checked live); MRBS and iitpkd.ac.in in the portal footer too | `components/site/site-chrome.tsx`, `app/(portal)/layout.tsx` |
| Guidelines with dummy rules | A numbered document with a contents list: §1–7 the portal's own rules from `lib/` and Settings (eligibility, approval routes table, window, stay cap, occupancy, arrival, meals and notice rule, charges and GST, cancellation); **§8 During your stay and §9 Safety and help are placeholders**, chipped "To be confirmed", with a "Provisional edition" note (`GUIDELINES_PROVISIONAL`) | `app/(site)/guidelines/page.tsx`, `guidelineSections()` |
| Booking buttons stand out | My Bookings leads with large tiles: **New room booking** (vermilion) and **Meal booking** (ink), each naming its guest house; Faculty Advisors get **Book for <club>** tiles. Submit booking request and the manager's "New booking for a guest" are `brand` too | `app/(portal)/dashboard/page.tsx` (`BookingDoor`), `components/booking-form.tsx`, `app/(portal)/manager/page.tsx` |
| Mock Authentication kept | Unchanged in behaviour; the sign-in pages are restyled on a grey band | `components/site/sign-in-panel.tsx`, `components/login-form.tsx`, `app/(site)/mock-login/page.tsx` |

Also: the logo was being sent as a 1920px image for a ~90px slot; it now
declares its drawn size (256/384px copies). Gallery, Contact, Privacy and the
sign-in pages were redone on `PageMasthead` / the sign-in band.

### Verified

`npm run lint`, `npm run typecheck`, `npm test` (**307**, new
`tests/public-site.test.ts`), a production build on the mock store,
`npm run test:e2e` (**26**: the 320px check now covers every public page; new
journeys for the map tabs and footer links, and for the My Bookings tiles) —
all clean. One short pass of Playwright screenshots (home desktop and phone,
contact, guidelines, dashboard) to judge the look.

### Still open

- **The office to confirm the house rules** (Guidelines §8–9), then set
  `GUIDELINES_PROVISIONAL = false` — [04-roadmap.md](04-roadmap.md).
- Mail still has the old amber header (restyle to ink/vermilion if wanted).
- The `ui` branch's 21 Sep redesign is superseded; nothing from it needs
  merging.
- The `.next/` on this machine is a mock-store build (from the e2e run);
  rebuild before `next start` against Supabase. `npm run dev` is unaffected.
- From earlier rounds, unchanged: apply migration 26 (and 24, 25 if missing)
  to the hosted project; the office to confirm GST-inclusive tariffs; the
  alumni guest house matched by name; name each council's Faculty Advisor and
  mailbox — [04-roadmap.md](04-roadmap.md).
