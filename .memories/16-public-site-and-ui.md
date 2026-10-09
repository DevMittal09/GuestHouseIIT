# UI design — the public website and the portal restyle

Read this before changing anything visual, adding a public page, or touching
the sign-in pages.

**Five passes so far:**

| Date | Where | What |
| --- | --- | --- |
| 19 Sep 2026 | `main` | The public website built from `design_handoff/` (a designer's prototype): navy `#12284C`, gold `#E8A317`, 3px corners, no shadows; the portal restyled through the shadcn tokens |
| 21 Sep 2026 | `ui` branch only | A "WOW" redesign in the institute's vermilion with pills, shadows, gradients, frosted glass and a bento grid. Never merged; superseded by the next row |
| 26 Sep 2026, morning | `main` | The owner: the site "looks ass", "too dull and dead"; wanted clean and professional, impressive, **not AI-generated-looking**, in **the colour palette of the IITPKD websites**, following the backend. Plus: a map for each guest house, MRBS and the institute site in the footer, a proper Guidelines page with placeholder house rules, and more prominent booking buttons in the portal. Built as an editorial page full of computed facts |
| 26 Sep 2026, afternoon | `main` | The owner on the morning's version: header "should look more aesthetic", site "too plain", "too mehh"; **no figures** ("23 rooms… 1 month… 14 nights…"), **no "see them on the map"**, **no photo captions**, **"How booking works" moved to the guidelines and vaguer**, **"do not display the backend logic like who are the users, who approves who"**, no instruction text or meal timings on the landing page. Rebuilt photo-led and quiet — full-screen hero, photo banners |
| 26 Sep 2026, evening | `main` | The owner: "it looks so weird… the image filling the page this much looks so weird"; make it **clean and professional**, researched online. Rebuilt **institutional**: photos contained in the layout — see "The evening brief" below |
| **30 Sep 2026 (current)** | `main` | A written revamp brief: TGH structure, Aman / Standard editorial rules, **GOV.UK** tables and tags; 4px inputs, 6px buttons, 8px cards, never a pill, shadow, gradient or glass. Primitives rebuilt (see "The 30 Sep revamp" below); the evening's content rules all kept. **Afternoon:** the supervisor's review — see "Promise less" below |

## Promise less (30 Sep 2026, afternoon)

The supervisor questioned the hero's first sentence and the "meeting room and
exercise room (common)" tiles; asked, the owner said: **"Don't keep too many
promises — make the messages vague and less promising."** So:

- The hero line is "{names} provide accommodation on campus for guests of the
  institute." (`lead` in `app/(site)/page.tsx`, names from the store; "Accommodation
  on campus for guests of the institute." when there are none). It used to
  list who stays — visiting faculty, collaborators, examiners, families — and
  was a fragment.
- The meeting room and exercise room are **off** the amenities (shared
  facilities, not each guest house's): **six** tiles, 1 / 2 / **3** columns.
- **For future copy:** state what exists, plainly — no adjectives about the
  rooms, no lists of who may stay, no service the office has not confirmed.

## One fact per line (8 Oct 2026)

The supervisor again, on the portal this time: it should look simple, that is
the content — **no explanations, no instructions, no mansplaining**. So the
prose was cut back wherever it explained itself:

- **The booking form** had reached twenty-eight card descriptions and
  twenty-nine help paragraphs. Nine descriptions went or were cut to a
  clause - **Type of booking** and **Approval** now carry none at all, their
  headings being the question - and eight help paragraphs with them. The worst
  of it was a rule stated twice: `INFANT_HELP_TEXT` said what an infant is
  **and** what a room holds, and the notice on the room card a few lines below
  says what a room holds. It is the infant fact alone now, and a constant
  rather than a function of Settings.
- **`/book`**: the lead under the page title is one short line, or none. What
  happens after Submit is the **What happens next** panel beside the form,
  which is where it belonged.
- **The desk and the approvers**: Checking out today, the availability chart
  descriptions, the Review dialog, "Your requests" on My Bookings.
- **The Guidelines page**: every item is one statement. The second clause -
  "; the Guest House Office confirms", "which is what reception checks",
  "for a longer stay, contact…" - is gone, and so is the explanatory tail of
  each `BOOKING_STEPS` entry, which the booking page shows too.

**What was kept:** every rule and every figure. The kitchen's limit per
sitting, the room capacity, the Aadhaar length, the pay-at-checkout note, the
privacy consent, "nothing is held until the Guest House Manager allocates a
room", and anything the office asked for by name.

## A rule has three homes, and the form is one of them (9 Oct 2026)

The owner's own pass, a round later and a step further: **"the text which are
supposed to be in the guidelines or should pop up when we make the error is
unnecessarily shown in the main page. This is the case for all pages."**

8 Oct cut the clause that explains the clause. This round cuts **the sentence
that states a rule the form already enforces**, on the reasoning that a rule
can live in three places and only one of them is the form:

| Home | For whom |
| --- | --- |
| **The Guidelines page** (`guidelineSections`, rendered from `lib/` + Settings) | Someone reading before they book |
| **The error, when it fires** | Someone who has just broken it, with their own numbers in it |
| **The control itself** | A greyed-out option that says why it is greyed out, a disabled Add button |

What came off, with where the rule still is:

- the infant note (`INFANT_HELP_TEXT`), "one of each"
  (`uniqueRelationshipHint`) and the parent-dependency hint
  (`parentDependencyHint`) - **all three constants deleted**. The options read
  "Mother - already on this request" and "Siblings - needs a parent on this
  request";
- the per-room capacity notice (`roomOccupancyNotice`), which appeared under
  *Number of rooms* **and** in every room card - the Add buttons disable with
  a reason;
- the student banner **"Double shared rooms will get first preference"**, which
  the office withdrew. Also stripped from a **saved** Form Builder row
  (`RETIRED_BANNERS` in `sanitizeFormConfig`), because a default change alone
  would have left it on screen;
- the tariff table's paragraph about rates in force, GST and night-by-night
  pricing; "At most 30 at a sitting"; "The two must add up to N"; the pets
  notice's second paragraph; six more card descriptions;
- **"What happens next"** off `/book` - the panel added on 30 Sep. The
  requester hears by email at each step and the steps are on the Guidelines
  page; the side column is the Requester details card alone;
- the **"Copy to: Nobody - this request goes straight to the Guest House
  Manager…"** row, which appeared on exactly the roles that never need it;
- **eight page leads** across the portal. A lead that restates the title says
  nothing; what one can carry is the **scope** ("Malhar hostel", "HOD for
  CSE"), so that is all that is left;
- the **desk's section descriptions**: gone where the heading says it (Current
  occupants, Upcoming stays), one short fact where it does not ("Past
  check-out, never marked Vacated - still holding their rooms").

### The availability panel, redrawn

> "its showing the 10 of 10 rooms available for each day of the week… I want
> it to look minimal and simple but not too juvenile… this is too kiddish."

`components/availability-counts.tsx` was seven cards each repeating "10 of 10
rooms available", with a **24-row table** of the same sentence under a single
day. The figure is the answer, so the figure is what is drawn: a strip of ruled
columns under one label (**Rooms free each day**) with the date in micro-type,
the count at display size, `/23` beside it and a 3px meter; a vermilion rule
and the word **Full** on a day with nothing free; a **headline figure** instead
of a one-cell grid for a one-day window; the hours as a wrapped grid of chips
with the current hour outlined. **Every cell keeps the full sentence as its
`aria-label`** - the repetition was visual, and a screen reader lost nothing.
The panel's toolbar is one row (view, date, back to check-in, Refresh) with the
field labels `sr-only`.

### Two more things moved rather than cut

- **The privacy line** at the foot of My Bookings was a tinted band with a left
  rule - a standing legal right drawn like news. It is a hairline-ruled row of
  three quiet links: Privacy notice · Download my data · Ask for erasure. An
  open erasure request still states itself.
- **The office's phone and email** were a "Facing trouble booking?" notice on
  My Bookings *and* at the foot of every booking form. They are in the
  **portal footer** now, beside the copyright, on every signed-in page - which
  is where a reader looks for a number. `MANAGER_HELP_LINE` and
  `GUEST_HOUSE_MANAGER_CONTACT` are deleted; `GUEST_HOUSE_CONTACT`
  (`lib/site.ts`) stays the one place either is written down.

### The log's filter bar

Thirteen stage tick boxes, three meal tick boxes, fourteen date chips, two date
boxes, three selects, a toggle and a paragraph of search prefixes, all open at
once. Rearranged by how often each is used, losing no capability: one row of
ordinary selects (Show, Guest house, Requester category, **Check-in** - the
presets as a single `<select>` with `<optgroup>` Rolling / Calendar, each option
carrying its dates - From, Until, Sort by), and a **"Stages and meals"**
`<details>` holding the two tick-box lists and the prefix help. Closed, it
names what it is holding ("4 of 13 stages"), so a filter can never be in force
invisibly. The six tiles above remain the everyday status filter.

> **Guidelines is where things are explained.** The owner put the instructions
> there on 26 Sep, in general terms, and that has not changed - this round
> stopped the *portal* explaining them a second time.

## The 30 Sep revamp

- **Corner scale** fixed in `@theme inline`: `rounded` 4px (inputs),
  `rounded-md` 6px (buttons), `rounded-lg` 8px (cards, dialogs, photos),
  `xl`–`4xl` capped at 8px. Use `rounded-xs` (2px) for tags.
- **Public site:** `SectionHead` opens every section on a hairline ink rule,
  label in the left 3 of 12 columns and the serif `<h2>` in the other 9; the
  section's content is offset to the same column with
  `lg:ml-[calc(25%+10px)]` (the 12-column grid's fourth column with
  `gap-x-10`). Hero 5 + 7 with one 4:3 photo; guest-house cards; amenities
  as one ruled grid (1px gap over `bg-border-strong`, 1 / 2 / 3 columns for
  its **six** items since 30 Sep afternoon — change those if the list length
  changes); a four-photo
  mosaic (one photo over two rows at `lg`); a closing band with ruled
  Guidelines / Contact links. Header and portal header carry a 3px vermilion
  top rule; the lockup has a hairline between emblem and words.
- **Portal:** `Card` is a GOV.UK summary card (band header strip over a
  hairline); `Table` has a band header closed by a 2px ink rule and hairline
  rows; `StatusBadge` uses the `tag-*` utilities; `SectionHeading` (+
  `EmptyState`) heads every desk list; `LinkTabs` switches guest house;
  `ConsoleNav` lists the console's sections; `segment()` / `segmentGroup`
  style every in-page toggle. Notices are GOV.UK inset text: a 4px left rule
  (saffron on `bg-notice` for warnings, `border-strong` on the band for
  information).
- **Second pass (same day):** portal chrome as a GOV.UK service — ink
  masthead closed by a 5px vermilion rule, a white service nav
  (`NavBar tone="service"`), a `--canvas` page background; `PageHeader`
  takes a `caption` and closes on a 2px ink rule; controls 40px tall with a
  `--input` edge of `#8C857D` (3:1+); `/book` in two columns with the
  Requester details (a summary list, container-query rows) and a sticky
  "What happens next" (**the panel was removed on 9 Oct 2026**; the column is
  the Requester details card alone); the booking form's cards numbered by
  `.numbered-sections` (the counter increments on the **card**, since values
  pass between siblings); `DeskSummary` strip on `/manager` and
  `/caretaker`; the home hero an ink panel joined to the 4:3 photo; inner
  mastheads asymmetric (title 7 / lead 5 under a vermilion rule); sign-in a
  split-screen panel. (The footer's MRBS callout was removed on 7 Oct 2026.)
- **Desk lifecycle buttons:** `Button variant="occupy"` (deep green,
  log-in icon) and `variant="vacate"` (deep indigo, log-out icon).
- **Room grid seats:** free = pale green with a green edge, taken = solid red
  struck through (disabled), picked = solid blue, changeover = amber,
  turnaround = hatched (`SEAT` in `room-grid.tsx`, shared with the legend).

## The evening brief (26 Sep), and how it was interpreted

Researched: IIT Madras's **Taramani Guest House** site (tgh.iitm.ac.in — the
closest peer: a contained hero carousel, feature cards, quick-access cards, a
three-column footer) and roundups of clean hotel and university sites. The
common thread of the clean, professional ones: **photographs contained in
the layout**, white space, bordered cards, restrained colour; full-screen
photo heroes belong to luxury-resort sites and read as odd for an institute.

1. **Home:** a split hero — label, `<h1>` "Guest houses of IIT Palakkad", one
   sentence naming the houses (from the store), Book a room / Book meals, the
   front-office number; **one 4:3 photograph beside it**. Then a card per
   guest house (`houseSummary`: "Double-sharing rooms, with meals served on
   site." — no counts), eight amenity cards (two full rows of four), "A look
   inside" as four equal thumbnails with View all photographs, and a boxed
   ink "Planning a visit?" with Guidelines / Contact us.
2. **Header:** the lockup stays; the header is a plain white bar again,
   sticky from `lg` (no overlay).
3. **Inner pages:** plain light-band mastheads (no photo banners); the
   guidelines' five steps are small numbered cards; sign-in pages put the
   form beside a contained 4:5 photo.
4. **Geometry:** cards and photos 8px corners, buttons and inputs 6px, a
   12px closing box; borders, no shadows, **no gradients at all** (the photo
   washes went with the full-screen photos).

Everything from the afternoon about **content** stands: no figures, no
routes or role names, no captions, instructions only on the Guidelines.

## The afternoon brief (26 Sep), and how it was interpreted

> **Superseded in part (26 Sep 2026, evening):** points 4 (the header over
> the hero) and 5 (full-screen and banner photographs, photo washes) — the
> owner found the full-screen photos weird. Points 1–3 (what the public may
> see, a light landing page, instructions on the Guidelines) stand.

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
    layout.tsx          white header (sticky from lg), footer (address, directions)
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
    layout.tsx          ink masthead + service nav + ink footer: copyright, the
                        guest house office's phone and email (9 Oct 2026), links
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
| `--border-strong` | `#CEC8BF` | `border-border-strong` | inputs, card and table edges |
| `--occupy` / `--vacate` | `#00703C` / `#3730A3` | `bg-occupy` / `bg-vacate` | the desk's Mark as Occupied / Mark as Vacated buttons (white text, >6:1) |
| `tag-*` utilities | GOV.UK tag pairs | `tag-green`, `tag-yellow`, … | status tags and other coloured labels (pale fill, same-hue dark text) |
| `--on-ink` / `--on-ink-muted` | `#D6D1CA` / `#A39D95` | `text-on-ink` / `text-on-ink-muted` | text on the ink footer (≥6.4:1) |

shadcn tokens: `--primary` **ink** with white text; `--ring` vermilion;
`--muted-foreground` `#6B655F` (5.1:1 even on the band); `--secondary` /
`--muted` / `--accent` the band; `--border` `#E5E1DA`; corners from the fixed
scale above (4 / 6 / 8px).
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
| `components/site/site-header.tsx` | **`SiteHeader`** and `SITE_NAV`: a white bar, sticky from `lg`; links inside the header, a sideways-scrolling row below `lg`; Sign in / My portal |
| `components/site/site-chrome.tsx` | **`SiteFooter({ pins })`** — the lockup and address, front office, **Find us** (each guest house's Map and Directions, How to reach the campus), **Institute** (`SITE_LINKS`), and a bottom line (Guidelines, Contact, Privacy notice). The **MRBS line** that opened it ("Booking a lecture hall or meeting room?") was removed on **7 Oct 2026** at the office's request, with every other mention of the Meeting Room Booking System |
| `components/site/site-nav.tsx` | `NavBar` — `tone="dark"` (portal: charcoal bar, uppercase, vermilion bar under the current page) or `"light"` (the white site header, a short vermilion underline); `scroll` for the phone row |
| `components/site/site-ui.tsx` | `Container` (1240px), `Label` (tracked capitals), `PageTitle` (the sign-in pages' `<h1>`, optional `kicker`), **`PageMasthead`** (a light band: breadcrumb, `<h1>`, lead, `note`, `aside`), `SectionHead` (label + `<h2>` + optional link), `ArrowLink`, `BulletList`, `siteButton.{brand,ink,outline,light,outlineLight}`, `SitePhotoFrame` (8px corners; `zoom` eases on hover) |
| `components/site/guest-house-map.tsx` | **`GuestHouseMap`** (client): WAI-ARIA tabs, one per pin, the chosen embed, "Open in Google Maps" / "Get directions" |
| `components/site/sign-in-panel.tsx` | `PageTitle` + the form (or "You are signed in") in five columns on the left, a contained 4:3 photograph in seven on the right from `lg` |
| `components/login-form.tsx` | The form — no card, no second heading; submit is vermilion-deep; `domainNote` under it; the second door is **Mock Authentication** (→ `/mock-login?next=`) or **Sign in with Google** once configured. Labels "LDAP username" / "LDAP password" and the button name "Sign in" are what the e2e helpers use — keep them |
| `components/page-header.tsx` | Portal page title: a short vermilion rule, serif `h1`, description, optional `actions`, a closing hairline |
| `components/section-heading.tsx` | `SectionHeading` (serif `<h2>`, a count tag — red with `tone="alert"` — description, action) and `EmptyState` |
| `components/link-tabs.tsx` | `LinkTabs` — page-level tabs that are links, vermilion bar under the current one, `aria-current` (the desk's guest-house switcher) |
| `components/console-nav.tsx` | `ConsoleNav` (client) — the console's sections as a segmented list, current one ink |
| `components/segmented.tsx` | `segmentGroup` / `segment(active, size)` — every in-page toggle (Day/Week/Month, outbox filter, Form Builder roles) |

**The portal shell** (`app/(portal)/layout.tsx`): white header with the
compact lockup ("IIT Palakkad · Booking portal"), the user and role, Switch
user; the charcoal `NavBar`, sticky; a slim ink footer linking the website,
Guidelines, Contact and iitpkd.ac.in (**MRBS removed 7 Oct 2026**).

**My Bookings** (`app/(portal)/dashboard/page.tsx`): under the title, large
`BookingDoor` tiles — **New room booking** (vermilion, names the guest houses
the role's form allows), **Meal booking** (ink, names the kitchen; only for
`MEALS_ONLY_ROLES` where a guest house serves meals), and one **Book for
<club>** per club a Faculty Advisor books for.

## The pages

- **Home** — see "The 30 Sep revamp" above: a 5 + 7 split hero with one
  contained 4:3 photo, guest-house cards, a ruled amenity grid, a four-photo
  mosaic, a closing row of ruled links. No figures, meal times, rules or
  captions.
- **Guidelines** — light masthead with a **Provisional edition** note while
  `GUIDELINES_PROVISIONAL` is true; **How booking works** as five small
  numbered cards (`BOOKING_STEPS`); a sticky **Contents** list; eight numbered
  sections from `guidelineSections(houses, rules)`: Booking a stay, Rooms and
  occupancy, Check-in and check-out, Meals (with the **timetable** and the
  kitchen's notice), Charges and payment, Cancellation — from `lib/` and
  Settings, with no role names — and **During your stay** and **Safety and
  help**, placeholder house rules marked "To be confirmed".
- **Gallery** — light masthead; sections by subject; a section of four or
  more leads with one photo at double size; **no visible captions** (alt text
  kept); each opens full size.
- **Contact** — light masthead; front office, email, address and a Bookings
  note (online only — the lecture-hall sentence came off on 7 Oct 2026);
  **Finding the guest houses**
  with the map tabs in a rounded card.
- **Book a room / Book meals / Sign in** — the form beside a contained
  photo, one line of lead each. Book meals points to the guidelines for meal
  times.
- **Privacy, Mock Authentication** — content unchanged.

## Content comes from the backend — and what stays off the site

`lib/site-data.ts` (server, cached under the `site` tag) loads the guest
houses: `getSiteGuestHouses()` — every guest house with active-room counts by
type and `serves_meals`. **No guest house name is hardcoded** in a component.
It swallows store errors and returns empty data.

`lib/site-content.ts` (pure): `amenities` (always six), `houseSummary`, `BOOKING_STEPS`,
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
`INSTITUTE_WEBSITE`, **`HOW_TO_REACH_URL`**, `SITE_LINKS` (IIT Palakkad
website, the guest
house page on iitpkd.ac.in, How to reach, Telephone directory — all checked to
resolve on 26 Sep 2026; there is no Bageshri page on iitpkd.ac.in),
`GUEST_HOUSE_CONTACT`, **`GUEST_HOUSE_LOCATIONS`**,
**`INSTITUTE_MAP`**, `guestHouseMapPins()`, the photo registry (`PHOTOS`,
`HOME_PHOTOS` — `hero` and a four-photo `preview`; **`SIGN_IN_PHOTOS`** —
the photo beside each sign-in page's form;
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
  it would read as one particular guest house (the guest-house cards carry
  no photos).
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

- `npm run lint`, `npm run typecheck` clean; `npm test` **305**
  (`tests/public-site.test.ts`: the pins, footer links, `houseSummary`,
  amenities always eight, **no role name in the public copy**, the guideline
  sections against Settings, the meal timetable, the meal notice rule against
  `mealBookingDeadline`).
- A production build on the mock store; `npm run test:e2e` **26**: the 320px
  check covers every public page; the map tabs (click and keyboard) with the
  footer's institute links; the My Bookings tiles. (MRBS removed 7 Oct 2026.)
- **Short rounds of Playwright screenshots** after each of the day's passes
  (home desktop and phone, guidelines, sign-in, and others) to judge the
  look; the last found the amenities grid leaving one card alone on a row,
  fixed by always listing eight. Lessons: scroll the page and wait ~1.5 s
  first, or `next/image` photos are still blank; never `pkill -f
  next-server` from a shell whose own command line contains it (use
  `"[n]ext-server"`).
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
