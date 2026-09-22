# UI design — the public website and the portal restyle

Built **19 Sep 2026** from `design_handoff/` (a seven-tab HTML prototype plus
README from the institute's designer). Read this before changing anything
visual, adding a public page, or touching the sign-in pages.

## The brief, and how it was interpreted

The owner's instruction was: **build the UI on what the backend actually does,
and use the design handoff as a reference for the look**. Three consequences:

1. **Look: faithful.** Colours, type scale, spacing, borders, the 56px gold
   rule, near-square corners and "no shadows" follow `design_handoff/README.md`.
2. **Content: from the backend, not the prototype.** Wherever the prototype's
   copy states a rule the portal enforces (who books what, approvals, advance
   window, meals, cancellation, capacity), the page renders the rule from
   `lib/` instead. Where the prototype promised something the backend does not
   have, it was left out (see "Deliberately not built").
3. **Map location included** — the Contact page embeds Google Maps, and the
   utility strip and footer link to it.

The owner then supplied 14 photographs mid-build (`Images/`), which now fill the
home page and the Gallery.

## Route map

```
app/
  layout.tsx            root: fonts (Source Sans 3 / Source Serif 4), metadata
  (site)/               PUBLIC website — open to everyone
    layout.tsx          utility strip, header, navy nav, footer
    page.tsx            /            Home
    book-room/          /book-room   gated entry → sign in → /book
    book-meal/          /book-meal   gated entry → sign in → /book (meals live in the room form)
    guidelines/         /guidelines
    gallery/            /gallery
    contact/            /contact     with the map
    sign-in/            /sign-in     general sign-in; where every portal guard redirects
    mock-login/         /mock-login  persona picker (moved here from app/mock-login, same URL)
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
> [11-ldap-accounts.md](11-ldap-accounts.md). The bullets below describe the
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

## Design tokens

In `app/globals.css`, on `:root` and exposed to Tailwind through `@theme inline`:

| Token | Hex | Tailwind | Use |
| --- | --- | --- | --- |
| `--navy` | `#12284C` | `bg-navy` / `text-navy` | nav bar, headings, primary buttons |
| `--navy-dark` | `#0C1D38` | `bg-navy-dark` | utility strip, footers, navy hover |
| `--navy-hover` | `#1B3765` | `bg-navy-hover` | nav item hover |
| `--gold` | `#E8A317` | `bg-gold` | active-nav bar, rules, bullets, primary CTA (navy text) |
| `--gold-hover` | `#D2910C` | `bg-gold-hover` | CTA hover |
| `--gold-dark` | `#B8790C` | `text-gold-dark` | eyebrows, link hover |
| `--gold-darkest` | `#8A5B08` | `text-gold-darkest` | "Please note" label |
| `--body-text` | `#41506A` | `text-body` | paragraphs |
| `--band` | `#F1F3F6` | `bg-band` | hero / facilities bands, placeholders |
| `--notice` / `--notice-border` | `#FDF7E8` / `#E8D5A6` | `bg-notice` / `border-notice-border` | notice box |
| `--border-strong` | `#C9D0DB` | `border-border-strong` | inputs, outlined buttons |

The shadcn semantic tokens were re-pointed at this palette, which is what
carries the look into every portal page without editing them:

- `--primary` **navy** with white text (was amber `#f7a600` with white text).
  That also **fixes the roadmap's WCAG failure** (white on amber ≈ 2:1; white
  on navy ≈ 13:1). **Never put white text on gold** — gold buttons use navy text.
- `--ring` gold (visible focus everywhere), `--muted-foreground` `#5A6880`
  (≈5.1:1 even on the grey band — `#6B7A90` from the design is only ≈3.9:1
  there, so it is not used for small text on grey).
- `--radius` `0.1875rem` (3px). Every shadcn radius derives from it, so cards,
  inputs and badges went near-square in one line.
- `--background` white (was warm off-white `#faf9f7`).
- `.dark` was re-pointed at a navy dark theme for coherence, but **nothing
  switches it on** — there is no theme provider.

Fonts: `next/font/google` self-hosts **Source Sans 3** (`--font-source-sans`,
body/UI) and **Source Serif 4** (`--font-source-serif`, headings). Geist Sans
was dropped; Geist Mono stays for `font-mono`. `h1`–`h4` get `font-heading` in
the base layer, and shadcn's `CardTitle` / `DialogTitle` already use
`font-heading`, so portal titles are serif without per-page edits.

> **Side effect worth knowing:** anything that used `bg-primary` /
> `text-primary` changed from amber to navy — notably the availability chart's
> "now" line and today's-row highlight (`components/occupancy-chart.tsx`) and
> the legend swatch. It still reads clearly against red "Booked" bars. Status
> badges and warnings use explicit `amber-*` classes and are unchanged.

## Components

| File | What |
| --- | --- |
| `components/site/site-ui.tsx` | `Container` (1200px, fluid gutter), `GoldRule`, `Eyebrow`, `PageTitle` (the one `<h1>`), `SectionTitle`, `BulletList`, `NoticeBox`, `siteButton.{gold,outline,navy}` link classes, `SitePhotoFrame` (a `next/image` at a fixed aspect, or a labelled placeholder when `src` is null) |
| `components/site/site-chrome.tsx` | `UtilityStrip`, `BrandBlock` (logo + "Guest House" + subtitle; `compact` for the portal), `SiteHeader`, `SiteNav`, `SiteFooter`, `ExternalSiteLink`, `SITE_NAV` |
| `components/site/site-nav.tsx` | `NavBar` — the navy bar with the gold active underline, **shared by the site and the portal**. Client component (`usePathname`). `exact` paths only light on themselves (`/`); others also cover sub-paths (`/admin/users` lights Developer Console) |
| `components/site/sign-in-panel.tsx` | Two-column title + domain notice + sign-in card, or the signed-in "Continue" card |
| `components/page-header.tsx` | Portal page title block: serif `h1`, gold rule, description, optional `actions`. Used by every portal page |
| `components/login-form.tsx` | The sign-in card: LDAP username + password, "or", "Sign in with Google" (→ `/mock-login?next=`), `next`, `submitLabel`, `footnote`, dummy-login note (`sampleAccount`) |

`components/auth-masthead.tsx` was deleted (only the old `/` and `/mock-login`
used it).

**The portal shell** (`app/(portal)/layout.tsx`): white header with the compact
brand block ("Booking portal"), the user and role, Switch user; then the navy
`NavBar`, **sticky** so console tabs stay reachable on long queues; content in
the same 1200px column as the site; a slim navy footer linking back to the
public site, Guidelines and Contact. Nav items and role gating are exactly as
before — only the rendering changed.

## Content comes from the backend

`lib/site-data.ts` (server) and `lib/site-content.ts` (pure):

- `getSiteGuestHouses()` — every guest house with active-room counts by type
  and `serves_meals`. Drives the header subtitle ("BAGESHRI · HAMSANANDI"), the
  home guest-house cards, the Food facility card and the Book Meal page. **No
  guest house name is hardcoded** — add one in the developer console and the
  site shows it.
- `getSitePolicies()` — per requester role: approver chain (derived from
  `initialStatusFor()` + `REVIEWER_STAGE`), the guest houses its effective form
  config allows (so "Student — Bageshri only" comes from the Form Builder, not
  from copy), the advance-window exemption, and the student parent rule if the
  saved student config still carries it.
- `facilityCards()` / `guidelineCards()` — capacity from `ROOM_CAPACITY`,
  `INFANT_AGE_LIMIT`, meal windows from `MEAL_TIMES`,
  `ADVANCE_BOOKING_WINDOW_MONTHS`, and the cancellation rules as
  `cancelBooking()` implements them.
- Both loaders **catch store errors and return empty data**: the public site is
  the front door and carries the office's phone number, so a broken backend
  must not 500 it. Sections that need data hide themselves when it is empty.

**Rule for future edits:** if a sentence on the public site states a rule the
portal enforces, render it from `lib/`. Only facts the backend does not model
(amenities, house rules) are literal copy, marked `TODO(site)`.

## Configurable values — `lib/site.ts`

`LOGIN_DOMAIN`, `isInstituteEmail`, `safeNextPath`, `GUIDELINES_PDF_URL`
(`null` hides the download button), `SITE_LINKS`, `INSTITUTE_CONTACT` (utility
strip), `GUEST_HOUSE_CONTACT`, `GUEST_HOUSE_MAP`, the photo registry
(`PHOTOS`, `HOME_PHOTOS`, `GALLERY_SECTIONS`, `GUEST_HOUSE_PHOTOS`).
`grep -rn "TODO(site)"` lists everything awaiting the office.

Contact details are the ones on the foot of the office's own invoice template
(Phase 5): `ghm@iitpkd.ac.in`, `+91 491 209 2016`, Kanjikode West — the
office's own choice, so they replaced the iitpkd.ac.in guest house page's
`+91 88483 94440`. Front-office hours are still TODO.

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
  suites, Common spaces) and the home guest-house cards render as text cards.
  They match the iitpkd.ac.in description of Hamsanandi (blocks A–D, suites
  with hall and kitchen, a 50-seat meeting room) but that is an inference, not
  a fact — **do not attribute them without the office confirming**. When they
  do, set `GUEST_HOUSE_PHOTOS["hamsanandi"] = PHOTOS.block` (keyed by
  `guestHouseSlug(name)`) and the card gains its cover.
- Gallery grids use `auto-fill`, not the design's `auto-fit`: with only two
  Common-spaces photos, `auto-fit` stretched each to half the page width.
- Alt text describes what is visible, not marketing ("Bedroom with double bed,
  bedside table and work desk"). Gallery tiles link to the full-size file.

## Map

`GUEST_HOUSE_MAP` in `lib/site.ts`. The embed is the institute's own Google
Maps pin from the design handoff; **no guest-house-specific pin is published**
(searched iitpkd.ac.in, Sep 2026). The Contact page embeds it
(`loading="lazy"`, titled for screen readers, height `clamp(280px,60vw,420px)`)
with "Open in Google Maps" and "Get directions" links; the utility strip
address and the footer link to it too. To pin the guest house itself, replace
`embedUrl` with `https://maps.google.com/maps?q=<lat>,<lng>&z=17&output=embed`
(no API key needed).

## Deliberately not built

| From the prototype | Why not |
| --- | --- |
| "Keep me signed in", "Forgot password" | The mock session has neither; a control that does nothing is worse than none. Real auth brings both |
| A meal-only booking flow ("Meal requests close the previous evening", "attach to your room booking automatically") | The backend has no such flow. Meals are chosen per day **inside the room request**, only where `serves_meals`. `/book-meal` says exactly that and sends the visitor to `/book`. A separate dining booking is in the meeting notes as *not started* |
| "Tariff and payment" guideline card, "GST applies" | Not on the public site. Rates live in Tariffs & Invoicing and change by date; GST is a Setting that is 0 until the office sets it. The Guidelines intro points to the office |
| "Requests at least seven days in advance", "Check-in from 12:00 noon / check-out by 11:00" | Contradict the backend: the window is one month *maximum*, and times are chosen per booking |
| "24-hour front office", "Doctor on call", front-office hours | Unconfirmed; the facilities cards use the iitpkd.ac.in amenity list (TODO-marked) and backend-true service lines |
| `image-slot.js` | Prototype-only, per the handoff. `design_handoff/**` is excluded from ESLint |

## How it was verified (19 Sep 2026)

- `npm run lint` clean; `npm run build` passes (28 routes).
- HTTP matrix on a production build: all 8 public routes 200 signed out; 6 portal
  routes 307 → `/sign-in` signed out; 11 portal routes 200 for their personas;
  `/sign-in` signed in → 307 to the role home.
- Headless Chrome (DevTools protocol, recipe in
  [05-deployment.md](05-deployment.md#verifying-changes)): a gmail address is
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

- Everything tagged `TODO(site)`: contact details, map pin, guidelines PDF URL,
  amenity lines, house rules, photo attribution.
- The design asks for SSO on the booking pages. LDAP is in (dummy accounts
  until `LDAP_URL`); real Google OAuth replaces only the button's target,
  `/mock-login` and `loginAs` — roadmap item 1.
- Mail templates (`lib/mail/render.ts`) still use the old amber header styling;
  they are inline-styled HTML and were out of scope. Align them if the office
  wants the emails to match.
