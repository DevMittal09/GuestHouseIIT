# Handoff: IIT Palakkad Guest House site

## Overview
A seven-tab public website for the IIT Palakkad Guest House (Hamsanandi and Bageshri): a
marketing home page, two gated booking entry points (room, meal), text guidelines with a
PDF download, a photo gallery grouped by guest house, a contact page with a map, and an
outbound link to the institute website. Styled to sit visually alongside iitpkd.ac.in.

## About the design files
`IIT Palakkad Guest House.dc.html` is a **design reference created in HTML** — a prototype
showing the intended look and behaviour. It is not production code and should not be copied
into the codebase. The task is to recreate it in the target codebase's existing environment
(Drupal theme, React, Vue, plain templates — whatever is already there), using its
established patterns, routing, and asset pipeline. If no environment exists yet, pick the
most appropriate one and implement the design there.

`image-slot.js` is a prototyping-only helper (drag-and-drop image placeholders). Do not ship
it; replace each slot with a real image element.

## Fidelity
**High fidelity.** Colors, typography, spacing, and states below are final. Recreate the UI
pixel-for-pixel using the codebase's own libraries and conventions.

## Design tokens

Colors
| Token | Hex | Use |
|---|---|---|
| Navy | `#12284C` | Nav bar, headings, primary buttons, card top rule on forms |
| Navy dark | `#0C1D38` | Utility strip, footer, navy button hover |
| Navy hover | `#1B3765` | Nav item hover background |
| Gold | `#E8A317` | Active tab underline, accent rules, bullets, primary CTA, footer labels |
| Gold hover | `#D2910C` | Primary CTA hover |
| Gold dark | `#B8790C` | Small-caps eyebrow text, link hover |
| Gold darkest | `#8A5B08` | "Please note" label text |
| Body text | `#41506A` | Paragraphs, list items |
| Muted text | `#5A6880` / `#6B7A90` | Secondary captions |
| Border | `#E1E5EC` | Card and section borders |
| Border strong | `#C9D0DB` | Input borders, secondary button border |
| Band | `#F1F3F6` | Hero band, facilities band |
| Notice bg / border | `#FDF7E8` / `#E8D5A6` | Login notice box |
| Footer text | `#C6CFDD`, `#9DAABD` | Footer body, copyright |
| White | `#FFFFFF` | Page background, cards |

Typography
- Headings: **Source Serif 4**, weight 600. Fallback `Georgia, serif`.
- Body / UI: **Source Sans 3**, weights 400/600/700. Fallback `system-ui, sans-serif`.
- Page h1: `clamp(30px, 4vw, 42px)` / line-height 1.15. Home h1: `clamp(32px, 4.4vw, 48px)`.
- Section h2: `clamp(26px, 3.4vw, 36px)`. Card h2/h3: 21–23px. Gallery h2: 28px.
- Body: 15–17.5px, line-height 1.5–1.65. Lead paragraph 17px.
- Eyebrow / label: 11.5px, weight 700, `letter-spacing: 0.16em`, uppercase.
- Nav items: 13.5px, weight 600, `letter-spacing: 0.08em`, uppercase.

Geometry
- Content max width **1200px**, horizontal padding `clamp(14px, 4vw, 24px)`.
- Border radius: 2–3px only (institutional, near-square). Buttons 3px.
- Accent rule under headings: 56px wide, 3px tall, gold (4px under the home h1).
- Section vertical rhythm: 44–72px top padding, 72–88px bottom.
- No shadows anywhere.

## Global chrome (every page)

1. **Utility strip** — `#0C1D38`, 13.5px, `#D8DEE9` text, padding `8px clamp(14px,4vw,24px)`,
   space-between: left "Kanjikode | Palakkad | Kerala – 678623" linking to Google Maps;
   right "0491 209 2013 (Office) | info@iitpkd.ac.in" (email in gold). Wraps on narrow.
2. **Header** — white, 1px bottom border `#E1E5EC`. Institute logo
   (`https://iitpkd.ac.in/sites/default/files/IITWEBLOGO%20(3).jpg`, host it locally),
   `height: clamp(44px,11vw,62px); max-width:100%`. Then a left-bordered block: "Guest House"
   (Source Serif 4, 25px, 600) over "HAMSANANDI · BAGESHRI" (12px, 0.14em, `#6B7A90`).
   Right: outlined "IIT Palakkad Website ↗" button → https://iitpkd.ac.in, target blank.
3. **Nav bar** — full-width `#12284C`, items padded `14px clamp(9px,1.6vw,16px)`, uppercase.
   Hover `#1B3765`. Active item: 3px gold bar flush to the bottom edge of the nav.
   Items: Home, Book a Room, Book Meal, Guidelines, Gallery, Contact Us. Wraps at 320px.
4. **Footer** — `#0C1D38`, three columns `repeat(auto-fit, minmax(min(230px,100%),1fr))`,
   gap 32px: (a) "IIT Palakkad Guest House" + postal address; (b) Contact — phones, email;
   (c) Links — IIT Palakkad Website, Guest House on iitpkd.ac.in, MRBS room booking system.
   Column labels are gold eyebrows. Bottom rule + copyright line at 13.5px `#9DAABD`.

## Screens

### 1. Home
- **Hero band** (`#F1F3F6`, bordered top/bottom): two columns
  `repeat(auto-fit, minmax(min(300px,100%),1fr))`, gap 40px, padding `48px … 52px`.
  Left: 56×4 gold rule, h1 "Stay at the IIT Palakkad Guest House", lead paragraph
  (max 56ch), then two buttons — gold primary "Book a room" (navy text, 700) and white
  outlined "Book a meal". Right: 16:10 image.
- **Image strip**: four images, `repeat(auto-fit, minmax(min(200px,100%),1fr))`, gap 14px,
  aspect 4:3. (Room interior, dining, lounge/reception, campus view.)
- **"Hamsanandi and Bageshri"**: h2 + gold rule + one-line intro, then two bordered cards
  (4:3 image, caption in Source Serif 4 23px).
- **"Facilities available"** band (`#F1F3F6`): h2 + gold rule, then four cards
  `repeat(auto-fit, minmax(min(240px,100%),1fr))`, gap 18px. Each card: white, 1px border,
  **3px gold top border**, gold eyebrow, serif title, bulleted list with 5px gold dot
  bullets. The four cards are Rooms/Stay, Dining/Food, Work/Meetings, Services/Support.
- **Three link cards** to Guidelines, Gallery, Contact Us — white, bordered, hover border
  turns gold.

### 2. Book a Room · 3. Book Meal
Two columns `repeat(auto-fit, minmax(min(320px,100%),1fr))`, gap 44px.
- Left: h1 + gold rule + intro, then a notice box — `#FDF7E8` background, `#E8D5A6` border,
  4px gold left border, eyebrow "PLEASE NOTE", body: *"Use your **@iitpkd.ac.in**
  credentials only. Personal email accounts cannot be used to book."*
- Right: sign-in card — white, 1px border, **3px navy top border**, padding 32/30/34.
  Fields: Institute email (placeholder `name@iitpkd.ac.in`), Password. Room page also has
  "Keep me signed in" + "Forgot password". Full-width navy submit button
  ("Sign in to book" / "Sign in to book meals"), then a 14px muted note.
- Inputs: 13px/14px padding, 1px `#C9D0DB`, radius 2px, 15.5px text. Add a visible focus
  ring (gold outline) in the implementation.

### 4. Guidelines
h1 + gold rule + intro, then six bordered cards
`repeat(auto-fit, minmax(min(300px,100%),1fr))`, gap 18px: Who can stay; Booking and
approval; Check-in and check-out; Tariff and payment; Cancellation; During your stay.
Below: navy button-link "Download the full guidelines (PDF) ↓" (arrow in gold), new tab.
Make the PDF URL one configurable value.

### 5. Gallery
h1 + gold rule, then three sections — **Hamsanandi**, **Bageshri**, **Common spaces** —
each with a serif h2, an uppercase muted qualifier, a 2px bottom rule, and a grid of 3:2
images `repeat(auto-fit, minmax(min(220px,100%),1fr))`, gap 14px (6 / 6 / 3 images).

### 6. Contact Us
Two columns `repeat(auto-fit, minmax(min(300px,100%),1fr))`, gap 36px.
- Left: four labelled blocks (gold eyebrows) — Address, Front office, Email, Bookings.
- Right: bordered map card with the institute's own Google Maps embed:
  `https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3919.052565408499!2d76.72327250857225!3d10.807286089298902!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x3ba86eb5b2e20413%3A0x6ac0bc1d9e6a7141!2sIIT%20Palakkad!5e0!3m2!1sen!2sin!4v1687273934671!5m2!1sen!2sin`
  iframe height `clamp(280px, 60vw, 420px)`, `loading="lazy"`, with a titled accessible name.
  Footer strip of the card links to https://goo.gl/maps/LXzZJEUFw5QCTrEDA.

### 7. IIT Palakkad Website
Not a page — an outbound link in the header (and footer) to https://iitpkd.ac.in.

## Interactions & behaviour
- Tab/route change scrolls to top.
- Nav hover: background `#1B3765`. Active: 3px gold underline.
- Buttons: gold → `#D2910C`; navy → `#0C1D38`; outlined → border `#12284C`; cards →
  border `#E8A317`. No transitions are specified; a 120–150ms ease is acceptable.
- Login forms are non-functional in the prototype. Wire to institute SSO if available,
  otherwise stub with a marked TODO. Domain restriction must also be enforced server-side.
- Responsive: single breakpoint-free fluid layout, must hold at **320px** with no
  horizontal scroll. Grids use `minmax(min(Npx,100%),1fr)` so they collapse.

## State
Prototype state is a single `tab` string. In a real site this becomes routing. The only
genuine runtime state is form input and auth session.

## Configurable values
- `loginDomain` — default `@iitpkd.ac.in`; drives both notice boxes and the email placeholder.
- `guidelinesPdf` — URL of the full guidelines PDF.

## Assets
- Institute logo: `https://iitpkd.ac.in/sites/default/files/IITWEBLOGO%20(3).jpg` — host locally.
- Fonts: Google Fonts, Source Serif 4 + Source Sans 3. Self-host if the site policy requires it.
- All photographs are TODO — 19 slots (5 home, 2 guest-house cards, 12 gallery).

## Content still to confirm (marked TODO in the build)
Facilities bullet lists, guideline bullet lists, front-office phone hours,
`guesthouse@iitpkd.ac.in` address, and the guidelines PDF URL.

## Files
- `IIT Palakkad Guest House.dc.html` — the design reference (open in a browser).
- `image-slot.js` — prototype-only image placeholder helper; do not ship.
- `PROMPT.md` — the prompt to paste into Claude Code.
