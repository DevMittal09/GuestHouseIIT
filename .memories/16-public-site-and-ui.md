# UI design — the public website and the portal restyle

Read this before changing anything visual, adding a public page, or touching
the sign-in pages.

**Three passes so far:**

| Date | Where | What |
| --- | --- | --- |
| 19 Sep 2026 | `main` | The public website built from `design_handoff/` (a designer's prototype): navy `#12284C`, gold `#E8A317`, 3px corners, no shadows; the portal restyled through the shadcn tokens |
| 21 Sep 2026 | `ui` branch only | A "WOW" redesign in the institute's vermilion with pills, shadows, gradients, frosted glass and a bento grid. Never merged; superseded by the next row |
| 26 Sep 2026, morning | `main` | The owner: the site "looks ass", "too dull and dead"; wanted clean and professional, impressive, **not AI-generated-looking**, in **the colour palette of the IITPKD websites**, following the backend. Plus: a map for each guest house, MRBS and the institute site in the footer, a proper Guidelines page with placeholder house rules, and more prominent booking buttons in the portal. Built as an editorial page full of computed facts |
| **26 Sep 2026, afternoon (current)** | `main` | The owner on the morning's version: header "should look more aesthetic", site "too plain", "too mehh"; **no figures** ("23 rooms… 1 month… 14 nights…"), **no "see them on the map"**, **no photo captions**, **"How booking works" moved to the guidelines and vaguer**, **"do not display the backend logic like who are the users, who approves who"**, no instruction text or meal timings on the landing page. Rebuilt photo-led and quiet — see "The afternoon brief" below |

## The afternoon brief (26 Sep), and how it was interpreted

1. **What the public may see.** No requester categories, no approval chains,
   no role names anywhere on the public site — the portal's internals stay in
   the portal. `lib/site-data.ts` lost its approval-route loader;
   `tests/public-site.test.ts` fails if any role label reaches the public
   copy. The guidelines speak of "members of the institute", "the person
   hosting them" and "the Guest House Office".
2. **The landing page is visual and light.** A full-screen photograph with
   the guest-house names as the title and two buttons; one sentence; the two
   houses beside a photograph; a four-photo mosaic; an amenities grid of
   short labels; a closing photo band. No figures, no meal times, no rules,
   no map link, no captions.
3. **Instructions go to the Guidelines** — "How booking works" as five
   general steps (Sign in, Request, Approval, Arrival, Departure), then the
   numbered rules including the meal timetable and the kitchen's notice.
4. **The header.** The stacked logo file printed "IIT PALAKKAD" about 8px
   tall under the emblem, which looked cheap. The lockup is now the
   **emblem alone** beside "Guest House" in the serif, with a tracked
   "IIT PALAKKAD" set in type (`BrandBlock`, `components/site/brand.tsx`),
   used in the site header, the footer and the portal header. On `/` the
   header lies transparent over the hero photograph; elsewhere it is white.
   The charcoal utility strip was dropped — everything in it is in the footer.
5. **Less plain.** Photographs carry every page: a full-bleed hero, a
   split ink/photo panel, the mosaic, a closing photo band, and a photo
   banner behind every inner page's title; sign-in pages are a split screen
   with a photo. Dark washes over photos keep the type legible (the only
   gradients on the site). Still no drop shadows, glass, pills or bento.

## The morning brief (26 Sep), and how it was interpreted

> **Superseded in part (26 Sep 2026, afternoon):** points 3 and the
> "specific copy with real numbers" / "tables for tabular content" of point 2
> — the owner asked for no figures, no routes and no instructions on the
> landing page. The palette (point 1) stands.

1. **Palette: the institute's own.** iitpkd.ac.in's theme CSS
   (`themes/iitpkd/css/typo-colors.css`, `menu.css`, read 26 Sep 2026) uses
   **vermilion `#E94C26`** for links, buttons and the active menu item,
   **charcoal `#1A1A1A`** for the top bar and footer menu, `#333` text, a
   `#EDEDED` band, and **Source Serif Pro** headings. The logo's emblem is
   **saffron** (≈ `#F5A300`). The navy/gold of the handoff appears nowhere on
   the institute's site.
2. **Not AI-looking.** Researched (Sep 2026): the tells are default fonts,
   purple/indigo gradients, glass cards, rounded-2xl + drop shadows
   everywhere, the "hero → three cards → four cards" stack, emoji icons, and
   vague copy ("Unlock…", "Transform…"). The fixes: a real palette, a
   characterful type pairing, **specific copy with real numbers**, asymmetric
   layouts, one radius vocabulary, borders and contrast instead of shadows.
   So the site uses: no gradients, no shadows, 2–4px corners, **hairline rules
   as structure** (a full-width rule with a label opening each section, like
   newspaper furniture), serif display type with the optical-size axis,
   asymmetric 12-column layouts, captioned photographs, tables where the
   content is tabular (approval routes, meal times), a numbered policy
   document for the guidelines, and a lucide icon set used sparingly.
3. **Content: still from the backend** (the 19 Sep rule stands, and there is
   more of it now): the home page's figures, who may request each guest house,
   the five booking steps, the approval-route table, meal times and the
   kitchen's notice rule, and every portal rule in the Guidelines.
4. **Behaviour unchanged** except: My Bookings' booking buttons became large
   tiles, the booking form's Submit and the manager's "New booking for a
   guest" are vermilion (`variant="brand"`).

## Route map

```
app/
  layout.tsx            root: fonts (Source Sans 3 / Source Serif 4), metadata
  (site)/               PUBLIC website — open to everyone
    layout.tsx          header (over the hero on /), footer (MRBS, directions)
    page.tsx            /            Home
    book-room/          /book-room   gated entry → sign in → /book
    book-meal/          /book-meal   gated entry → sign in → /book (meals live in the room form)
    guidelines/         /guidelines  How booking works, then numbered rules; §7–8 provisional
    gallery/            /gallery
    contact/            /contact     one map tab per guest house
    sign-in/            /sign-in     general sign-in; where every portal guard redirects
    mock-login/         /mock-login  Mock Authentication persona picker (open while Google is unconfigured)
    privacy/            /privacy     the versioned DPDP privacy notice
  (portal)/             SIGNED-IN portal — unchanged routes, restyled shell
```

**`/` used to be the sign-in form. It is now the public home page.** So:

- every portal guard does `redirect(SIGN_IN_PATH)` (`lib/routes.ts`,
  `"/sign-in"`) — never `redirect("/")` any more;
- `logout()` ("Switch user") lands on `/sign-in`, because switching persona is
  the usual reason to press it;
- `/sign-in` redirects an already-signed-in visitor to `homeForRole()`, exactly
  what `/` used to do. `/book-room` and `/book-meal` instead show a "You are
  signed in — Continue" card, so the public page stays readable.

The public layout is **dynamic** (it reads the session cookie to show "Sign in"
vs "My portal", and reads guest houses from the store). That is deliberate:
guest houses are admin-editable data, and a statically prerendered home page
would go stale until the next build.

## Sign-in: what changed and what did not

> **Current state (23–24 Sep 2026):** the card asks for an **LDAP username +
> password**; the second button reads **"Mock Authentication"** (no Google
> "G" mark) and opens `/mock-login?next=…` while Google is unconfigured, and
> reads **"Sign in with Google"** (real OpenID Connect) once
> `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and `APP_URL` are set. The notes
> below are the history of how it got there.

> **Superseded in part (19 Sep 2026, later the same day):** the card now asks
> for an **LDAP username + password** (`signInWithLdap`) and has a **"Sign in
> with Google"** button (Google's "G" mark, white outlined button under an "or"
> rule) that opens `/mock-login?next=…` as a placeholder. `/mock-login` is
> titled "Sign in with Google" and says Google is not connected yet. The
> domain notice now names both doors. The dashed note under the card shows one
> dummy LDAP login (`priya` / `Priya@2026`) only while the dummy directory is
> in use, and says what the Google button does. The username placeholder is
> `e.g. 142301026`, the real format the user gave for students. The email
> form, its client domain check and `DEMO_PASSWORD` are gone. See
> [31-ldap-sign-in.md](31-ldap-sign-in.md). The bullets below describe the
> email form as it was; `next` and `safeNextPath()` still work the same way,
> and `isInstituteEmail()` is kept for real Google sign-in.

Still mock auth with one swap point (`lib/auth.ts`). The credential form
(`components/login-form.tsx`) is now shared by `/sign-in`, `/book-room` and
`/book-meal` through `components/site/sign-in-panel.tsx`.

- **Institute domain is enforced server-side.** `signIn()` refuses any address
  that is not `@iitpkd.ac.in` or a subdomain (`isInstituteEmail()` in
  `lib/site.ts`). Subdomains must be accepted: students are
  `@smail.iitpkd.ac.in`. The form runs the same check first to save a round
  trip. The domain message is safe to show before the account lookup — it says
  nothing about whether an address is registered; the wrong-password / unknown
  account message stays single and generic.
- **`next`**: `signIn(email, password, next)` redirects to `next` when
  `safeNextPath()` accepts it (same-origin path only — `//host` and backslashes
  are refused, so it cannot become an open redirect), else `homeForRole()`. A
  role that cannot use the destination is bounced by that page's own guard
  (a warden signing in via "Book a room" ends on `/warden`). Verified.
- The persona picker and the demo-password note survive, below the card, marked
  as development-only. Both still go when real auth lands (roadmap item 1).
- A developer-created account with a non-institute address can no longer use
  the credential form (it can still use `/mock-login`). That is the policy the
  design states; say so if someone reports it.

## Design tokens — `app/globals.css`

On `:root`, exposed to Tailwind through `@theme inline`:

| Token | Hex | Tailwind | Use |
| --- | --- | --- | --- |
| `--ink` | `#1A1A1A` | `bg-ink` / `text-ink` | footers, the portal nav bar, headings, the ink panels, the wash over photographs |
| `--ink-soft` | `#2B2926` | `bg-ink-soft` | hover on ink |
| `--vermilion` | `#E94C26` | `text-vermilion` / `bg-vermilion` | rules, icons, active-nav bar, display-size numbers — **never behind white text** |
| `--vermilion-deep` | `#C43C1C` | `bg-vermilion-deep` / `text-vermilion-deep` | **buttons with white text** (5.2:1), small labels and link hover (5.8:1 on white) |
| `--vermilion-hover` | `#A8331A` | `bg-vermilion-hover` | hover on the above |
| `--vermilion-soft` | `#FDF0EB` | `bg-vermilion-soft` | spare tint |
| `--saffron` | `#F5A300` | `text-saffron` / `border-saffron` | the emblem colour: labels on ink (8.4:1), notice-box edge; carries **ink** text, never white |
| `--body-text` | `#4A4541` | `text-body` | paragraphs (9.5:1) |
| `--band` | `#F3F1EB` | `bg-band` | mastheads, the sign-in band, fills (close to the institute's `#EDEDED` / `#F0EFE7`) |
| `--notice` / `--notice-border` | `#FFF7E6` / `#EFD7A3` | `bg-notice` / `border-notice-border` | notice box, "To be confirmed" chips |
| `--border-strong` | `#CEC8BF` | `border-border-strong` | inputs |
| `--on-ink` / `--on-ink-muted` | `#D6D1CA` / `#A39D95` | `text-on-ink` / `text-on-ink-muted` | text on the ink footer (≥6.4:1) |

shadcn tokens: `--primary` **ink** with white text; `--ring` vermilion;
`--muted-foreground` `#6B655F` (5.1:1 even on the band); `--secondary` /
`--muted` / `--accent` the band; `--border` `#E5E1DA`; `--radius` **4px**.
`Button` has a **`brand`** variant (`bg-vermilion-deep text-white`) for the one
call to action on a page. `.dark` is kept coherent; nothing switches it on.

**Why `--primary` is ink, not vermilion:** portal tables put Approve beside a
soft-red Reject, and a vermilion primary read as a second red (the reasoning
of the 21 Sep `ui` attempt, kept).

Fonts: `next/font/google` self-hosts **Source Sans 3** (body/UI) and **Source
Serif 4** (headings — the successor of the Source Serif Pro iitpkd.ac.in
uses), the serif loaded with `axes: ["opsz"]` so display sizes get the
display cut. `h1`–`h4` get `font-heading` in the base layer.

Mail templates (`lib/mail/render.ts`) still carry the old amber header.

## Components

| File | What |
| --- | --- |
| `components/site/brand.tsx` | **`BrandBlock`** — the lockup: `iitpkd-logo.png` (emblem only) + "Guest House" (serif) + a tracked tagline (`tagline`, default "IIT Palakkad"); `tone="light"` over photos and on ink; `compact` for the portal. Used by the site header, the footer and the portal header |
| `components/site/site-header.tsx` | **`SiteHeader`** (client, reads the path) and `SITE_NAV`: transparent and white over the hero on `/`, a white bar elsewhere; links inside the header, a sideways-scrolling row below `lg`; Sign in / My portal |
| `components/site/site-chrome.tsx` | **`SiteFooter({ pins })`** — an **MRBS line** at the top ("Booking a lecture hall or meeting room?" → Open MRBS), then the lockup and address, front office, **Find us** (each guest house's Map and Directions, How to reach the campus), **Institute** (`SITE_LINKS`), and a bottom line (Guidelines, Contact, Privacy notice) |
| `components/site/site-nav.tsx` | `NavBar` — `tone="dark"` (portal: charcoal bar, uppercase, vermilion bar under the current page), `"light"` (white header) or `"overlay"` (white text over the hero, saffron underline); `scroll` for the phone row |
| `components/site/site-ui.tsx` | `Container` (1240px), `Label` (tracked capitals), `PageTitle` (the sign-in pages' `<h1>`, optional `kicker`), **`PageMasthead`** (breadcrumb, `<h1>`, lead, `note`, `aside`; with `photo` a banner under a dark wash), `SectionHead` (label + `<h2>` + optional link), `ArrowLink`, `BulletList`, `siteButton.{brand,ink,outline,light,outlineLight}`, `SitePhotoFrame` (`zoom` eases on hover) |
| `components/site/guest-house-map.tsx` | **`GuestHouseMap`** (client): WAI-ARIA tabs, one per pin, the chosen embed, "Open in Google Maps" / "Get directions" |
| `components/site/sign-in-panel.tsx` | A split screen: `PageTitle` + the form (or "You are signed in") on the left, a photograph filling the right from `lg` |
| `components/login-form.tsx` | The form — no card, no second heading; submit is vermilion-deep; `domainNote` under it; the second door is **Mock Authentication** (→ `/mock-login?next=`) or **Sign in with Google** once configured. Labels "LDAP username" / "LDAP password" and the button name "Sign in" are what the e2e helpers use — keep them |
| `components/page-header.tsx` | Portal page title: serif `h1`, a short vermilion rule, description, optional `actions` |

**The portal shell** (`app/(portal)/layout.tsx`): white header with the
compact lockup ("IIT Palakkad · Booking portal"), the user and role, Switch
user; the charcoal `NavBar`, sticky; a slim ink footer linking the website,
Guidelines, Contact, **MRBS** and iitpkd.ac.in.

**My Bookings** (`app/(portal)/dashboard/page.tsx`): under the title, large
`BookingDoor` tiles — **New room booking** (vermilion, names the guest houses
the role's form allows), **Meal booking** (ink, names the kitchen; only for
`MEALS_ONLY_ROLES` where a guest house serves meals), and one **Book for
<club>** per club a Faculty Advisor books for.

## The pages

- **Home** — a full-screen courtyard photograph under the transparent
  header; kicker "The guest houses of IIT Palakkad", the `<h1>` is the
  guest-house names from the store ("Bageshri & Hamsanandi"), **Book a room**
  and **Book meals**, "Kanjikode · Palakkad · Kerala". Then: the emblem and
  one sentence ("The institute's guest houses welcome visiting faculty,
  collaborators and examiners, and the families of our students and staff")
  with a link to the guidelines; a split section — a photograph beside an ink
  panel listing the guest houses with "Rooms" / "Rooms · Dining" and Book a
  room; "Inside the guest houses", a four-photo mosaic with no captions and
  View the gallery; **Amenities** (`amenities()`, icon + short label, Dining
  only where a guest house serves meals); "Planning a visit?" over a
  photograph with Guidelines / Contact us.
- **Guidelines** — photo banner with a **Provisional edition** note while
  `GUIDELINES_PROVISIONAL` is true; **How booking works** in five general
  steps (`BOOKING_STEPS`); a sticky **Contents** list; eight numbered
  sections from `guidelineSections(houses, rules)`: Booking a stay, Rooms and
  occupancy, Check-in and check-out, Meals (with the **timetable** and the
  kitchen's notice), Charges and payment, Cancellation — from `lib/` and
  Settings, with no role names — and **During your stay** and **Safety and
  help**, placeholder house rules marked "To be confirmed".
- **Gallery** — photo banner; sections by subject; a section of four or more
  leads with one photo at double size; **no visible captions** (alt text
  kept); each opens full size.
- **Contact** — photo banner; front office, email, address and a Bookings
  note (online only; lecture halls on MRBS); **Finding the guest houses**
  with the map tabs.
- **Book a room / Book meals / Sign in** — the split screen, one line of
  lead each. Book meals points to the guidelines for meal times.
- **Privacy, Mock Authentication** — content unchanged.

## Content comes from the backend — and what stays off the site

`lib/site-data.ts` (server, cached under the `site` tag) loads the guest
houses: `getSiteGuestHouses()` — every guest house with active-room counts by
type and `serves_meals`. **No guest house name is hardcoded** in a component.
It swallows store errors and returns empty data.

`lib/site-content.ts` (pure): `amenities`, `BOOKING_STEPS`,
`guidelineSections(houses, rules)`, `mealTimetable`, `MEAL_NOTICE_RULE` (the
wording of `isMealBookable`), `servingHouses`, `joinNames`.

**Two rules for future edits:**

1. **Keep the portal's internals off the public site** (the owner, 26 Sep
   2026): no requester categories, approval chains or role names. The
   `getSitePolicies()` loader that computed them for the site (and
   `homeFacts`, `openTo`, the route tables) was deleted for this reason; don't
   bring it back. A unit test checks the copy for role labels.
2. **If a sentence states a rule the portal enforces, render it from `lib/`**
   — the advance window, stay cap, capacity, meals, charges. Only facts the
   backend does not model (amenities, house rules) are literal copy, marked
   `TODO(site)`.

## Configurable values — `lib/site.ts`

`LOGIN_DOMAIN`, `isInstituteEmail`, `safeNextPath`, `GUIDELINES_PDF_URL`
(`null` hides the download button), **`GUIDELINES_PROVISIONAL`**,
`INSTITUTE_WEBSITE`, **`MRBS_URL`** (`https://mrbs.iitpkd.ac.in`),
**`HOW_TO_REACH_URL`**, `SITE_LINKS` (IIT Palakkad website, MRBS, the guest
house page on iitpkd.ac.in, How to reach, Telephone directory — all checked to
resolve on 26 Sep 2026; there is no Bageshri page on iitpkd.ac.in),
`GUEST_HOUSE_CONTACT`, **`GUEST_HOUSE_LOCATIONS`**,
**`INSTITUTE_MAP`**, `guestHouseMapPins()`, the photo registry (`PHOTOS`,
`HOME_PHOTOS` — `hero`, `houses`, a four-photo `mosaic`, `closing`;
**`PAGE_PHOTOS`** — the banner or side photo of each inner page;
`GALLERY_SECTIONS`). `GUEST_HOUSE_PHOTOS` (a per-house cover) was removed: the home page no longer shows per-house photos. `grep -rn "TODO(site)"` lists everything awaiting the
office.

Contact details are the ones on the foot of the office's own invoice template:
`ghm@iitpkd.ac.in`, `+91 491 209 2016`, Kanjikode West.

## Map — one pin per guest house

`GUEST_HOUSE_LOCATIONS` in `lib/site.ts`, from the links the owner sent on
26 Sep 2026 (resolved with `curl`):

| Guest house | Coordinates | Google Maps name (`query`) | Link |
| --- | --- | --- | --- |
| Hamsanandi | 10.7984359, 76.7299972 | "Hamsanandi Guest house IIT pkd" | https://maps.app.goo.gl/GbKrfiao8TuKxgNA6 |
| Bageshri | 10.8063107, 76.726681 | "Bageshri guest house" | https://maps.app.goo.gl/AspNpPu7sTDLXxL2A |

- The embed is `https://maps.google.com/maps?q=<query>&ll=<lat,lng>&z=17&output=embed`
  — **no API key**. Searching the place's own name with its coordinates
  resolves to the place itself (checked: the response names "Hamsanandi Guest
  house IIT pkd, IIT Palakkad Rd" and "Bageshri guest house, IIT Palakkad Rd,
  Kanjikode"), so the embed shows the guest house's name card, not a bare pin.
  It redirects to `www.google.com/maps/embed`; the CSP's `frame-src` in
  `proxy.ts` allows both hosts.
- Keyed by `guestHouseSlug(name)` like the photo registry. A guest house with
  no entry is left off the map; if the store names none of them (it could
  not be read) every registered pin is shown under its fallback name.
- Order is the registry's (Hamsanandi first, as the owner listed them).
- `INSTITUTE_MAP` (the institute's own pin from the handoff) is the last
  resort when no guest house has a pin.
- To add a pin: resolve the share link (`curl -sS -o /dev/null -w
  '%{redirect_url}' <maps.app.goo.gl link>`), take `!3d<lat>!4d<lng>` and the
  place name from the redirect, add a line.

## Photographs

- **Originals:** `Images/` in the repo root — 14 Sony A7 III JPEGs, 6000×4000,
  10–18 MB each (~180 MB). **Gitignored** (`/Images/`); never serve them.
- **Served copies:** `public/site/photos/*.jpg`, 2000px long edge, quality 80,
  progressive, EXIF orientation applied and **metadata stripped** — 3.5 MB for
  all 14. `next/image` then serves per-width variants (a 168 KB file goes out
  at ~18 KB for a 640px slot).
- **Recipe for new photos** (PIL is installed; ImageMagick too):

  ```bash
  python3 - "Images/Copy of DSC0XXXX.JPG" public/site/photos/<name>.jpg <<'EOF'
  import sys
  from PIL import Image, ImageOps
  im = Image.open(sys.argv[1]); im.draft("RGB", (2000, 2000))   # decode at reduced scale
  im = ImageOps.exif_transpose(im).convert("RGB"); im.thumbnail((2000, 2000), Image.LANCZOS)
  im.save(sys.argv[2], "JPEG", quality=80, optimize=True, progressive=True)  # no exif= → stripped
  EOF
  ```

  **One photo per process.** Decoding all fourteen 24-megapixel files in one
  Python process was OOM-killed (exit 137); `draft()` plus a process per file
  keeps memory small. Then add a `photo("<name>.jpg", "<alt>")` entry to
  `PHOTOS` and place it.
- **Attribution is unknown.** Nothing in the files says which guest house each
  shows, so the Gallery is grouped by subject (Exterior and grounds, Rooms and
  suites, Common spaces), and the home page never places a photograph where
  it would read as one particular guest house (the houses are listed beside a
  photo of the grounds).
  They match the iitpkd.ac.in description of Hamsanandi (blocks A–D, suites
  with hall and kitchen, a 50-seat meeting room) but that is an inference, not
  a fact — **do not attribute them without the office confirming**. When they
  do, the Gallery can be grouped by guest house (`GALLERY_SECTIONS`).
- Gallery grids use `auto-fill`, not the design's `auto-fit`: with only two
  Common-spaces photos, `auto-fit` stretched each to half the page width.
- Alt text describes what is visible, not marketing ("Bedroom with double bed,
  bedside table and work desk"). Gallery tiles link to the full-size file.

## Deliberately not built

| From the prototype | Why not |
| --- | --- |
| "Keep me signed in", "Forgot password" | The mock session has neither; a control that does nothing is worse than none. Real auth brings both |
| The prototype's meal-only flow ("Meal requests close the previous evening", "attach to your room booking automatically") | Built differently since: **Meals only** is a service type inside `/book` (Phase 6, reworked 23 Sep 2026 as a set of dates with the kitchen's notice period — a meal must be booked before the previous one finishes being served). `/book-meal` explains it and signs in to `/book?service=meals_only`. Nothing is "attached" to a room booking automatically |
| A rate card on the public site | Rates live in Tariffs & Invoicing and change by date. The Guidelines page has a **"Charges and settlement"** card (Phase 10) built from the invoice Settings: the day basis, the grace hours, and that **the tariff includes GST** |
| "Requests at least seven days in advance", "Check-in from 12:00 noon / check-out by 11:00" | Contradict the backend: the window is one month *maximum*, and times are chosen per booking |
| "24-hour front office", "Doctor on call", front-office hours | Unconfirmed; the facilities cards use the iitpkd.ac.in amenity list (TODO-marked) and backend-true service lines |
| `image-slot.js` | Prototype-only, per the handoff. `design_handoff/**` is excluded from ESLint |

## How it was verified (26 Sep 2026)

- `npm run lint`, `npm run typecheck` clean; `npm test` **304**
  (`tests/public-site.test.ts`: the pins, footer links, amenities, **no role
  name in the public copy**, the guideline sections against Settings, the
  meal timetable, the meal notice rule against `mealBookingDeadline`).
- A production build on the mock store; `npm run test:e2e` **26**: the 320px
  check covers every public page; the map tabs (click and keyboard) with the
  footer's MRBS and institute links; the My Bookings tiles.
- **Two short rounds of Playwright screenshots** (home desktop and phone,
  guidelines, gallery, sign-in, contact, the portal header) to judge the look
  — the second found the hero kicker and the closing sentence too faint over
  the photographs, fixed with stronger washes. Lesson: scroll the page and
  wait ~1.5 s first, or the `next/image` photos are still blank; and never
  `pkill -f next-server` from a shell whose own command line contains it.
- Contrast of every token pair computed (see the table above).


## How the first pass was verified (19 Sep 2026)

- `npm run lint` clean; `npm run build` passes (28 routes).
- HTTP matrix on a production build: all 8 public routes 200 signed out; 6 portal
  routes 307 → `/sign-in` signed out; 11 portal routes 200 for their personas;
  `/sign-in` signed in → 307 to the role home.
- Headless Chrome (DevTools protocol, recipe in
  [23-running-and-testing.md](23-running-and-testing.md#verifying-changes)): a gmail address is
  refused on the client with the domain message; `priya@` via Book a room lands
  on `/book`; wrong password gives the generic message; a student's `@smail`
  address signs in; a warden via Book a room ends on `/warden`; Switch user
  lands on `/sign-in`; the active nav item carries `aria-current="page"`; no
  broken images; no client errors.
- **320px:** every public and main portal page has `scrollWidth` 320 (no page
  scroll) and exactly one `<h1>`. The only elements wider than the viewport are
  portal tables and charts inside their own `overflow-x-auto` boxes, as before.
- The mock database was byte-identical before and after the run.

## Open items

- Everything tagged `TODO(site)`: the **placeholder house rules** (Guidelines
  §7 During your stay, §8 Safety and help — set `GUIDELINES_PROVISIONAL` to
  false once confirmed), the **amenities** list, the guidelines PDF URL,
  photo attribution, front-office hours.
- The design asks for SSO on the booking pages. LDAP is in (dummy accounts
  until `LDAP_URL`); real Google sign-in switches on with its three environment
  variables, which also closes Mock Authentication —
  [04-roadmap.md](04-roadmap.md) item 1.
- Mail templates (`lib/mail/render.ts`) still use the old amber header; align
  them with ink / vermilion if the office wants the emails to match.
- The `ui` branch's 21 Sep redesign is superseded; nothing from it needs
  merging.
