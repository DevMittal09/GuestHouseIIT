# Recent changes - the last round, and only the last round

This file is **replaced** every round, not appended to. The round before this
one is written up where every round is: what was asked in
[01-background.md](01-background.md), why it was done that way in
[02-decisions.md](02-decisions.md).

---

## Round of 27-28 October 2026 - the Taramani pass, then the sign-in and the desk

**Two briefs in one sitting.** The first was a visual one, naming the
[Taramani Guest House, IIT Madras](https://tgh.iitm.ac.in/) as the standard
("modern, cinematic, elegant... premium, elegant, professional, and visually
distinctive"); the second was functional - sign-in, two notices, a heading
format and the manager's console. They are one round because they land in one
working tree.

### Brief one: the look

| § | Asked | Done |
| --- | --- | --- |
| 1 | A stronger hero: new lead, more prominent type, a **solid** *Book a Meal* button, an **opaque** refined header with **centred** links | The institute's name in tracked **saffron** capitals above the `<h1>`, a vermilion stub, the lead at 21px in `font-light`, the wash **60% -> 66%**, and `siteButton.saffron` beside the vermilion one. The header is **one opaque charcoal bar on every page** |
| 2 | Centre Amenities, Our Guest Houses and Contact Us; the gallery may stay left | Done. The gallery stays left because its heading carries the link to `/gallery` |
| 3 | A curated gallery, not a row of images | Six photographs in **two bands of unequal widths** (wide, narrow, narrow / narrow, narrow, wide) on one fixed row height |
| 4 | A polished, centred Contact Us | The phone, email and address as **one ruled band of three**, then a map each |
| 5 | **Application-wide**: no rules under headings, no underlined tabs, review secondary text, a distinctive identity, a clean manager console | `rule-title` **deleted**; `SectionHead` and `SectionHeading` lost their rules; everything selected is now **filled** (`NavBar`, `LinkTabs`, `segment()`); the console is in brief two |

**What was taken from Taramani and what was not.** Taken: the serif display
over tracked small capitals, the warm ground, photographs composed rather than
listed, a deep institutional colour answered by a gold. Not taken: their drop
shadows, gradients, pill corners and 16px radii - banned here since 30 Sep
2026, and the reason a page reads as assembled rather than designed.

### Brief two: the service

| § | Asked | Done |
| --- | --- | --- |
| 1 | **No LDAP.** Google is the intent; the button opens a **mock** flow. No photograph, centred, no domain sentence | `/sign-in`, `/book-room` and `/book-meal` are one centred panel with **one button** -> `/mock-login`. `LoginForm` holds no fields. **`signInWithLdap`, the throttle and `lib/ldap/` are untouched** |
| 2 | Remove the advance-window and stay-cap sentences from New Booking | Both `<p>`s gone; `stayLengthHint` **deleted**. **No rule, validation or date limit changed** |
| 3 | "Current bookings: 1", not "Current bookings 1" | `SectionHeading` - one component, so every console list reads the same way |
| 4 | Simplify the Guest House Manager console | **A list with nothing in it is not drawn.** The ruled index at the top still names every list and is now where a zero is reported; its zero rows are not links. One line when the whole desk is clear. Reception got the same, so the two cannot drift |

### Files

| File | Change |
| --- | --- |
| `components/site/site-header.tsx` | One opaque ink bar, centred links, no scroll listener |
| `components/site/site-nav.tsx` | `tone="ink"`; the current item is **filled**, never underlined |
| `components/site/site-ui.tsx` | `SectionHead` gains `align` and loses its rule; `siteButton.saffron` |
| `components/site/hero-carousel.tsx` | The wash to `bg-ink/66`, with the measurement |
| `app/(site)/page.tsx` | The hero's kicker, rule, lead and two solid doors; three sections centred; the gallery recomposed; the contact band |
| `components/page-header.tsx`, `section-heading.tsx`, `link-tabs.tsx`, `desk-summary.tsx` | No heading rules; filled tabs; `: count`; zero rows unlinked |
| `app/globals.css`, `lib/utils.ts` | `--saffron-deep`; `rule-title` deleted |
| `components/login-form.tsx`, `site/sign-in-panel.tsx`, `app/(site)/sign-in/page.tsx`, `mock-login/page.tsx` | One door, centred, no photograph, no LDAP wording |
| `components/booking-form.tsx`, `lib/policy.ts` | The two notices off the form; `stayLengthHint` deleted |
| `components/manager-queue.tsx`, `caretaker-console.tsx` | Empty lists not drawn; one line when the desk is clear |
| `e2e/helpers.ts` + 6 specs | The suite signs in **through the account picker**, by name |
| `AGENTS.md` | The sign-in door, the opaque header, "filled, never underlined", no heading rules, the heading format, the quiet console |

### Verified

`npm run lint`, `npx tsc --noEmit`, `npm test` (**603**), a production build,
and the Playwright suite - **49 of 50 on the first pass**, the one failure a
**midnight-rollover flake** in `fifth-round.spec.ts` (the database is seeded
with a stay six days out, the test moves a check-in five days out; the run
crossed IST midnight, so the two dates met and the button was correctly
disabled with "That is the check-in the stay already has"). Re-run on one side
of midnight: **3/3 pass**. It is a fixture built from "now" twice, not a
regression, and it is now in [03-roadmap.md](03-roadmap.md).

Screenshots were read back at 1440px and 390px for the home page, `/sign-in`,
`/guidelines`, the manager console, My Bookings and `/book`. They caught what
the tests could not: the count read **"Current bookings : 0"** with a space
before the colon (the colon was a flex child with a gap), and the three
contact cells were top-aligned in a stretched row.

### Left open

- **`SIGN_IN_PHOTOS` is now entirely unplaced.** Kept, with a note: putting a
  photograph back is one prop, and all three are in the Gallery.
- **The LDAP door is reachable only by a crafted request.** The action, the
  throttle and the directory are all still there and still correct; nothing in
  the interface points at them. If the institute's directory is ever wanted
  back, it is a form, not a rebuild.
- **Nothing tests the opaque header** - that it is readable over the hero, or
  that the centred row does not collide with the lockup at an awkward width.
- **The manager console's quiet state is untested**, and so is the rule that a
  zero row is not a link.
