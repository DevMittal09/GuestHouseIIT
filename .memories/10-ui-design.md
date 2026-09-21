# UI design — the public website and the portal

Read this before changing anything visual, adding a public page, or touching
the sign-in pages.

**Two passes so far:**

- **19 Sep 2026** — the public website (`app/(site)/`) built from
  `design_handoff/`, a designer's seven-tab prototype: navy `#12284C` and gold,
  3px corners, no shadows. The portal was restyled through the shadcn tokens.
- **21 Sep 2026 (current)** — the owner found that look "too basic" and asked
  for a redesign that would make people say "WOW", **using the colour palette
  of iitpkd.ac.in**, informed by good hotel and guest house booking sites, and
  still compatible with the backend. Built on the `ui` branch. Everything below
  describes this pass; the navy/gold look is history (see the decision log).

## The brief, and how it was interpreted

1. **Palette: the institute's own.** iitpkd.ac.in's theme CSS (read 21 Sep
   2026, `themes/iitpkd/css/typo-colors.css`, `menu.css`) uses vermilion
   `#E94C26` for links, active menu items and buttons, and charcoal `#1A1A1A`
   for the top bar and footer; its headings are Source Serif Pro. The emblem
   and wordmark are saffron. The navy/gold of the design handoff appears
   nowhere on the institute's site — it was the designer's choice.
2. **Look: premium hospitality, not a form generator.** Patterns taken from
   strong hotel sites: a full-bleed photographic hero with the **booking
   widget inside it** (citizenM, Ace Hotel), calm pacing and large imagery
   (Aman), a bento photo grid, generous whitespace, soft elevation, rounded
   corners, serif display type with an italic accent.
3. **Content: still from the backend.** Nothing on the site states a rule the
   portal enforces unless it is rendered from `lib/` (this was the 19 Sep rule
   and it stands). The redesign added more backend-driven content, not less:
   who may request each guest house, the approval route per requester, the
   numbers row.
4. **Behaviour: unchanged,** with two deliberate exceptions noted under
   "Behaviour that changed".

## Palette and tokens — `app/globals.css`

| Token | Hex | Tailwind | Use |
| --- | --- | --- | --- |
| `--ink` | `#1A1A1A` | `bg-ink` | utility strip, footer, portal sidebar, dark bands, feature cards |
| `--ink-soft` | `#262320` | `bg-ink-soft` | hover on ink |
| `--vermilion` | `#E94C26` | `text-vermilion`, `from-vermilion` | icons, rules, gradients, focus ring, large display type |
| `--vermilion-deep` | `#C73E1D` | `bg-vermilion-deep` | **buttons with white text** (5.1:1), links |
| `--vermilion-hover` | `#A93318` | | hover on the above |
| `--vermilion-soft` | `#FDF0EB` | `bg-vermilion-soft` | icon tiles, tinted surfaces |
| `--saffron` | `#F5A300` | `text-saffron`, `to-saffron` | the emblem colour: eyebrows and highlights on ink, gradient end |
| `--saffron-soft` | `#FFF5E0` | | "meals served" chips, official rows in the manager queue |
| `--paper` | `#FAF8F5` | `bg-paper` | the portal canvas |
| `--band` | `#F4F0EA` | `bg-band` | sand bands and fills |
| `--body-text` | `#57534E` | `text-body` | paragraphs |
| `--border` / `--border-strong` | `#E8E2D9` / `#D6CEC2` | | |
| `--muted-foreground` | `#6B645E` | | small text; ≥5:1 even on the sand band |

**Contrast rules — keep them:**

- White text only on `vermilion-deep`, never on the bright `#E94C26` (3.8:1).
- Saffron carries **ink** text (8.4:1) and is a highlight on ink. **Never
  white on saffron** — the avatar initials sit on a saffron→vermilion gradient
  in ink for this reason.
- Gradient-filled accent words (`<Accent>`) are display-size only.

**`--primary` is ink, not vermilion.** Portal tables put Approve/Forward next
to a soft-red Reject; a vermilion primary read as a second red. So shadcn's
default button is ink, and the vermilion call to action is an explicit
`<Button variant="brand">` (New booking, Submit booking request, the
manager's "New booking for a guest"). The focus ring (`--ring`) is vermilion.

Type: **Source Serif 4** (the successor of the Source Serif Pro iitpkd.ac.in
uses) for display, loaded with its optical-size axis and italics; **Plus
Jakarta Sans** for body and UI (replaced Source Sans 3). Both via `next/font`,
self-hosted.

Geometry and elevation: `--radius` **12px** (was 3px); cards `rounded-xl`/`2xl`,
marketing cards `rounded-3xl`, pill buttons on the public site. Shadows are
tokens in `@theme`: `shadow-soft` (resting cards), `shadow-lift` (hover,
dialogs, feature cards), `shadow-glow` (vermilion CTA). The "no shadows" rule
of the handoff is retired.

Motion, all CSS: `animate-rise` (hero content on load), `animate-drift` (slow
zoom on hero photographs), and `.reveal` — sections rise as they scroll into
view using **scroll-driven animations** (`animation-timeline: view()`), inside
`@supports`, so browsers without it just show the content. Everything is off
under `prefers-reduced-motion`. The keyframes are declared at top level, not in
`@theme`, because `.reveal` references `rise` from plain CSS and Tailwind only
emits `@theme` keyframes that a utility uses.

Component classes in `globals.css`: `.select-chevron` (native select arrow),
`.form-steps` (numbered section badges — see Traps), `.emblem-watermark`
(the rings as a faint watermark on dark panels), `.grain` (noise over photos).
`.dark` is kept coherent but nothing switches it on.

## Route map

```
app/
  layout.tsx            root: fonts (Plus Jakarta Sans / Source Serif 4), metadata
  (site)/               PUBLIC website — open to everyone
    layout.tsx          utility strip, sticky header (nav inside), footer
    page.tsx            /            Home
    book-room/          /book-room   gated entry → sign in → /book (carries the booking bar's stay)
    book-meal/          /book-meal   gated entry → sign in → /book?service=meals_only
    guidelines/ gallery/ contact/ sign-in/ mock-login/
  (portal)/             SIGNED-IN portal — ink sidebar shell
```

`/` is the public home page. Portal guards `redirect(SIGN_IN_PATH)`
(`/sign-in`); `logout()` lands on `/sign-in`; `/sign-in` sends a signed-in
visitor to `homeForRole()`; `/book-room` and `/book-meal` show a "You are
signed in — Continue" card instead.

## Public website

**Chrome** (`components/site/site-chrome.tsx`, `site-nav.tsx`):

- `UtilityStrip` — ink, address (map link), switchboard, email, iitpkd.ac.in ↗.
- `SiteHeader` — **sticky, frosted** (`bg-white/85 backdrop-blur`). Stacked
  logo + "Guest House" + guest-house names (from the store), the six pages
  inline from `xl` up (`NavLinks`, vermilion→saffron bar under the current
  page), Sign in / My portal, and a "Book a stay" CTA. Below `xl` the links
  move into `MobileMenu`, a slide-over built on the **Radix dialog** (focus
  trap, Escape, focus return for free).
- `SiteFooter` — ink, four columns, emblem watermark, the institute motto.

**Home** (`app/(site)/page.tsx`), top to bottom:

1. Hero: full-bleed courtyard photo in a rounded frame, drifting slowly,
   headline "A calm place to stay, *right on campus.*"
2. **The booking bar** (`components/site/stay-search.tsx`) overlapping the
   hero — see below.
3. Numbers: guest houses, rooms, meals a day, advance window — all computed.
4. Guest house cards: rooms by type, "Meals served"/"Rooms only", **"Can be
   requested by"** (from `getSitePolicies()`, i.e. the saved form configs),
   and "Request a room at X" deep-linking `/book-room?gh=<id>`.
5. Rooms and spaces: a bento of four photographs.
6. Facilities: icon cards from `facilityCards()`.
7. How booking works (ink band): four steps and **"Who approves your
   request"**, one line per requester role from `getSitePolicies().routes`.
8. Dining (only when some guest house `serves_meals`): meal times from
   `MEAL_TIMES`.
9. Link cards and a closing CTA over the gazebo photo.

**The booking bar is real, not decoration.** A plain GET form (no JS) to
`/book-room?gh=&in=&out=`. `lib/stay-query.ts` (`parseStayQuery`,
`stayQueryString`) re-checks every value: the guest house must be one the
page may offer, dates must be real `YYYY-MM-DD` dates, and a check-out not
after the check-in is dropped. `/book-room` shows a "Your stay" summary and
passes the stay on as `next=/book?…` (through LDAP sign-in and the Google
placeholder alike — `safeNextPath` accepts the query). `/book` parses it again
against **the role's** allowed guest houses (a student's Hamsanandi link keeps
its dates but loses the guest house) and hands it to `BookingForm` as
`initial`, which only seeds `defaultValues`. The booking schema still
validates everything on submit, so a hand-edited link can pre-fill nothing
typing could not.

**Inner pages** open with `PageHero` (the page's one `<h1>` over a darkened
photograph): Guidelines (walkway; numbered icon cards from `guidelineCards()`
plus a sticky "Questions before you book?" contact card), Gallery (gazebo;
`components/site/gallery-grid.tsx`), Contact (block; icon cards and the map).

**Gallery** — a dense grid (first landscape photo of each section spans 2×2,
portrait photos span two rows) and a full-screen **lightbox** (Radix dialog,
arrow keys, counter). Each tile is still a link to the full-size file, so it
works without JavaScript; modified clicks (Ctrl/⌘/Shift) keep the browser's
behaviour. `SitePhoto.portrait` in `lib/site.ts` marks the two portrait photos.

**Sign-in pages** (`components/site/sign-in-panel.tsx` +
`components/login-form.tsx`) are one split card: photograph with the `<h1>`,
lead and an optional `aside` on the left; the "Please note" box and the form
on the right. The form gained input icons and a show-password toggle; nothing
else about sign-in changed.

## Sign-in

Still mock auth with one swap point (`lib/auth.ts`). The card asks for an
**LDAP username + password** (`signInWithLdap`) and has a **"Sign in with
Google"** button that opens `/mock-login?next=…` as a placeholder. The dashed
demo note shows one dummy LDAP login only while the dummy directory is in use.
See [11-ldap-accounts.md](11-ldap-accounts.md). `next` goes through
`safeNextPath()` (same-origin paths only). `/mock-login` is the persona picker,
restyled with avatars and role chips.

## The portal shell — `app/(portal)/layout.tsx`

- **Ink sidebar** (`components/portal/portal-nav.tsx`, 272px, fixed from
  `lg`): emblem and "Guest House · IIT Palakkad · Portal", the role's
  sections with icons (active: white/10 fill, saffron icon, saffron→vermilion
  bar), a link to the website, and a user card with Switch user. Below `lg`
  the same content is a **Radix-dialog drawer** behind a menu button.
- The nav items and their role gating are still decided in the server layout;
  the client component only draws them. Icons are looked up by `href` inside
  the client component because a component cannot cross the server/client
  boundary. An item may carry `match` (a wider prefix): the manager's
  "Settings" links to `/admin/users` but lights for all of `/admin`.
- **Top bar** (sticky, frosted, on `bg-paper`): a greeting by **institute**
  hour with the user's **full name** ("Dr. Priya Sharma", "Guest House
  Manager" — a first word is unusable for either), today's date, the role, and
  "New booking" for anyone who can book.

**Building blocks** (all server-safe, used by server pages and client consoles):

| File | What |
| --- | --- |
| `components/page-header.tsx` | eyebrow, serif `<h1>`, description, `actions` |
| `components/portal/stat-tiles.tsx` | `StatGrid`, `StatTile` (icon, figure, hint, optional progress bar, `highlight` ink variant) |
| `components/portal/section-header.tsx` | a console section's title with a count pill (`tone` alert/warn) and description |
| `components/portal/guest-house-switcher.tsx` | the segmented `?gh=` control on `/manager` and `/caretaker` |
| `components/empty-state.tsx` | icon, title, text, optional action |
| `components/admin/admin-tabs.tsx` | console tabs **with an active state** (there was none) and `blurb` tooltips |
| `components/status-badge.tsx` | tint + inset ring + dot per status; hues are semantic, not brand |

Tables are framed as elevated cards (`rounded-2xl bg-card shadow-soft
ring-1 ring-border`), with a small-caps muted header row.

**Pages:**

- `/dashboard` — stat tiles (in review, confirmed, completed, all), a
  **"next stay"** ink card (the soonest current-or-upcoming approved stay),
  and `MyBookings` as **cards**: guest house, status, reference, dates with
  the number of nights, rooms (or "Meals only"), and a **progress track**.
- `lib/booking-progress.ts` builds that track **from the booking's own logs**,
  not the role: routing now depends on more than the role (an employee's
  official booking waits for their HOD, a personal one does not; meals-only
  goes straight to the manager). Both stores write the submission as a log
  with `new_status` = the entry status, so `entryStatus()` reads it there.
  Step labels come from `STATUS_LABELS` ("Pending HOD Approval" → "HOD
  Approval"). Closed bookings show their reason instead of a track.
- `/book` — the form in numbered section cards (`.form-steps`) beside a sticky
  "What happens next" panel.
- `/manager` — stat tiles (awaiting allocation, **rooms in use now / active
  rooms** with a bar, upcoming, checking out today, cancellations or overdue),
  the switcher, then the queue with section headers and empty states.
- `/caretaker` — the same, for the desk's four figures.
- Reviewer queues (`/warden`, `/approvals`, `/iar`), `/availability`,
  `/history` and the console carry the new header; their internals are
  restyled through the tokens and primitives.

## Behaviour that changed

1. **My Bookings' cancel control matches the server.** `cancelBooking` on
   `main` turns *every* pre-arrival cancellation into a request the manager
   decides, accepts `PENDING_HOD`, and refuses `OCCUPIED`. The old table still
   offered "Cancel booking", toasted "Booking cancelled" for pending requests,
   omitted `PENDING_HOD`, and offered the button on occupied stays. The card
   now always says "Request cancellation", lists exactly the statuses the
   server accepts, and tells an occupied guest to speak to the manager.
2. **`/book` accepts `gh`, `in`, `out`** as a pre-fill (above).

## Content comes from the backend

`lib/site-data.ts` (server) and `lib/site-content.ts` (pure):
`getSiteGuestHouses()` (active-room counts by type, `serves_meals`),
`getSitePolicies()` (per requester role: approvers from `initialStatusFor()` +
`REVIEWER_STAGE`, the guest houses its effective form config allows, the
advance-window exemption, the student parent rule), `facilityCards()`,
`guidelineCards()`. Both loaders **swallow store errors** so the public site
cannot 500, and sections that need data hide when it is empty.

**Rule:** if a sentence on the public site states a rule the portal enforces,
render it from `lib/`. Only facts the backend does not model (amenities, house
rules) are literal copy, marked `TODO(site)` — including the new "Rooms and
spaces" intro.

## Configurable values — `lib/site.ts`

`LOGIN_DOMAIN`, `isInstituteEmail`, `safeNextPath`, `GUIDELINES_PDF_URL`
(`null` hides the download button), `SITE_LINKS`, `INSTITUTE_CONTACT`,
`GUEST_HOUSE_CONTACT`, `GUEST_HOUSE_MAP`, the photo registry (`PHOTOS`,
`HOME_PHOTOS`, `GALLERY_SECTIONS`, `GUEST_HOUSE_PHOTOS`).
`grep -rn "TODO(site)"` lists everything awaiting the office.

## Photographs

- **Originals:** `Images/` (14 Sony A7 III JPEGs, ~180 MB), **gitignored**.
- **Served copies:** `public/site/photos/*.jpg`, 2000px long edge, quality 80,
  progressive, EXIF orientation applied, **metadata stripped**.
- **Recipe for new photos** (PIL is installed):

  ```bash
  python3 - "Images/Copy of DSC0XXXX.JPG" public/site/photos/<name>.jpg <<'EOF'
  import sys
  from PIL import Image, ImageOps
  im = Image.open(sys.argv[1]); im.draft("RGB", (2000, 2000))   # decode at reduced scale
  im = ImageOps.exif_transpose(im).convert("RGB"); im.thumbnail((2000, 2000), Image.LANCZOS)
  im.save(sys.argv[2], "JPEG", quality=80, optimize=True, progressive=True)  # no exif= → stripped
  EOF
  ```

  **One photo per process** — decoding all fourteen in one process was
  OOM-killed. Then add `photo("<name>.jpg", "<alt>", portrait?)` to `PHOTOS`.
- **Attribution is unknown** — the Gallery groups by subject and the home
  guest-house cards are typographic. Don't attribute a photo to a guest house
  until the office confirms (`GUEST_HOUSE_PHOTOS`, keyed by
  `guestHouseSlug(name)`).
- Alt text describes what is visible, not marketing.

## Logos and map

`public/IITPKD_NEW_LOGO.png` — the stacked logo (emblem over "IIT PALAKKAD"),
transparent, ~8% padding, in the site header since 21 Sep 2026.
`public/iitpkd-logo.png` — the emblem alone: portal sidebar, footer, mobile
top bar, favicon, and the `.emblem-watermark`. The map embed is the
institute's own Google Maps pin (`GUEST_HOUSE_MAP`); no guest-house pin is
published.

## Deliberately not built

| Idea | Why not |
| --- | --- |
| A public availability search on the home page | `/availability` is signed-in only and strips identities for most roles; the booking bar pre-fills a request instead of pretending to search |
| "Keep me signed in", "Forgot password" | the mock session has neither; a control that does nothing is worse than none |
| Tariffs, "GST applies" | no billing model on the public site; the Guidelines page points to the office |
| Testimonials, star ratings | no source; inventing them would be fabricating reviews |
| A dark mode toggle | no theme provider; `.dark` tokens are kept coherent for later |

## Traps

- **CSS counters inside `CardHeader` reset per card.** `CardHeader` is a
  container (`@container/card-header`), and container queries imply **style
  containment**, which scopes `counter-increment` to the container — every
  step badge read "01". `.form-steps` therefore increments on the card
  (`[data-slot=card]:has([data-slot=card-title])`) and only *reads* the
  counter in the title's `::before`. Untitled cards (the pets notice) take no
  number.
- **Full-page screenshots and `.reveal`.** Scroll-driven sections below the
  fold are at their `from` keyframe (transparent) in a `captureBeyondViewport`
  shot. Inject `.reveal{animation:none!important}` before capturing; real
  scrolling is fine.
- **Next 16 `next/image`:** `priority` is deprecated — use `preload` (hero
  images) or `loading="eager"` (the logo). `quality` must be in
  `images.qualities` (default `[75]`), so leave it unset.
- **Tailwind emits `@theme` keyframes only when a utility uses them** — keep
  keyframes referenced from plain CSS at top level.
- **Grid children need `min-w-0`** when they hold truncated text: the persona
  cards on `/mock-login` pushed the page to 497px at 320px until they had it.
- **Never white on saffron.** Avatars use ink initials on the gradient.

## How it was verified (21 Sep 2026)

- `npm run lint` clean; `npm run build` passes (33 routes, TypeScript clean).
- `tsx` tests for `lib/stay-query.ts` (valid, unknown guest house, impossible
  and malformed dates, markup in the query, check-out ≤ check-in, arrays,
  round trip), `lib/booking-progress.ts` (student, HOD-routed employee, direct
  employee, meals-only, vacated, closed, no logs), `initials()` and
  `formatInstituteTime()` — under `TZ=UTC` and `TZ=America/Los_Angeles`.
- HTTP on a production build over the mock store: all public routes 200
  signed out; portal routes 307 → `/sign-in`; 23 persona/route pairs 200
  (requester, student, club, official, warden, FA → `/approvals`, HOD, IAR,
  manager incl. `/manager/meals` and `/admin/users`, caretaker, developer);
  a student on `/manager` still bounced. The booking-bar handoff checked end to
  end: summary on `/book-room`, `next=/book?gh=…` on the Google link, and
  `/book`'s `initial` per role (employee keeps Hamsanandi; student keeps the
  dates, loses the guest house; hostile values all dropped).
- Headless Chrome (kept minimal — the owner is cost-conscious): 18 pages at
  320px — `scrollWidth` 320, one `<h1>`, no broken images, no client errors;
  a handful of half-scale screenshots of home, sign-in, dashboard, manager and
  the booking form, which caught the facilities eyebrow, the dark sign-in
  photo, "Good afternoon, Dr." and the counter bug above.
- `.local-db.json` restored byte-identical afterwards (main's mock store
  self-heals older files on load, which the test server had triggered).

## Open items

- **"Who approves your request" understates the employee route.** It comes
  from `getSitePolicies()` → `approversFor(role)` → `initialStatusFor(role)`
  with no routing context, so employees read "→ Guest House Manager", while a
  faculty member's *official* booking goes to their HOD first when one is set
  (`needsHodApproval`). Pre-existing on the Guidelines page; the home page now
  shows it prominently. Fix in `lib/site-data.ts` (e.g. a conditional HOD step
  for employees) — a copy decision for the owner.
- Everything tagged `TODO(site)`: contact details, map pin, guidelines PDF URL,
  amenity lines, house rules, photo attribution.
- Mail templates (`lib/mail/render.ts`) still use the old amber `#F7A600`
  inline header — close to the emblem's saffron, but not the site's
  vermilion/ink. Align them if the office wants matching email.
- Real Google OAuth replaces only the button's target, `/mock-login` and
  `loginAs` — roadmap item 1.
