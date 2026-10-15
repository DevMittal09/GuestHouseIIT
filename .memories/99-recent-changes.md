# Recent changes - the last round, and only the last round

This file is **replaced** every round, not appended to. The round before this
one is written up where every round is: what was asked in
[01-background.md](01-background.md), why it was done that way in
[02-decisions.md](02-decisions.md).

---

## Round of 15 October 2026 (second) - the slideshow, and the page stripped back

> **The round immediately before this one, the same day**, brought the
> office's eleven photographs onto the site, named two of them
> (`GUEST_HOUSE_PHOTOS`) and rebuilt the home page around them. This round
> changes how the top of that page presents them. The photographs, the
> conversion, the attribution and the Gallery are **unchanged**.

The owner:

> See basically i want to change the landing page UI to the iitpkd.ac.in
> website style. Basically in the landing page. i need images which change
> evry few seconds and has the option of arrows to move to next image. Then
> we should be able to go down and see the details and other stuff in the
> landing page. Just go to iitpkd.ac.in website and see what i mean.

**A carousel was argued against in the previous round and asked for anyway**,
which settles it. [02-decisions.md](02-decisions.md) carries a *Superseded*
note on that paragraph and records which of its objections the build
*answers* rather than ignores.

### 1. `components/site/hero-carousel.tsx` - the one client component on the public site

Everything else on the public site is a server component. This one needs a
timer, so it is marked `"use client"` and kept deliberately ignorant: it takes
`SitePhoto[]` and renders them, and knows nothing about guest houses, the
store or any booking rule.

Modelled on iitpkd.ac.in's own hero - **Previous / Pause / Next and numbered
indicators**, not dots (a row of dots would be the pills this codebase's
design rules ban, and a number says how far through you are without a
legend). Six slides where theirs has five. Drawn in the site's own vocabulary:
square bordered buttons at 6px, a vermilion hairline under the active number,
**no wash over the photograph** and no caption - theirs wrap each slide in a
link, and these do not.

- **6 seconds a slide**, one translating track, 700ms ease-out.
- **It stops**: a Pause button, *and* it holds while a pointer is over it or
  the keyboard focus is inside it.
- **`prefers-reduced-motion` stops the rotation itself**, not merely the
  transition.
- **`aria-live`** is `off` while it advances by itself and `polite` once
  paused; slides are `role="group" aria-roledescription="slide"` and the
  inactive ones `aria-hidden`.
- **Non-active slides load `eager`** on purpose: translated off inside
  `overflow-hidden`, lazy loading cannot be relied on to have fetched them
  before the timer arrives. Only the first carries `priority`.

### 2. The page order

**Slideshow -> ink masthead -> Our guest houses -> amenities -> mosaic ->
closing links.**

The masthead (`<h1>`, the lead, *Book a room* / *Book meals*, the Guest House
Manager's number) now sits **under** the photographs, which is the order the
owner described and the order iitpkd.ac.in uses. It is still the page's only
`<h1>` and still the first heading in the document.

This **reverses the previous round's merge**: the masthead and the guest
houses were one block with a house photograph under each half. The slideshow
holds the top of the page now, so the guest houses are a section of their own
again with ordinary bordered cards - which is why `HousePanel` lost its
`md:odd:border-l-0` arithmetic and its `priority` flag. `GUEST_HOUSE_PHOTOS`
is untouched, and those two cards are still the only place on the site that
says which guest house a photograph shows.

### 3. Which photographs go where

| Slot | Photographs |
| --- | --- |
| **Slideshow** (`HOME_PHOTOS.slides`) | `hamsanandi-courtyard`, `bageshri-front`, `hamsanandi-block`, `double-bedroom`, `kitchenette`, `twin-room` - the owner's six, in the owner's order |
| **Guest house cards** | `hamsanandi-courtyard`, `bageshri-front` - the one deliberate repeat: the slideshow is a reel, the cards are where they are named |
| **"A look inside"** (`HOME_PHOTOS.preview`) | `hamsanandi-block-entrance`, `bageshri-corridor`, `sitting-room`, `living-dining` - **four the slideshow does not show**, so scrolling past the hero finds something new. All four were Gallery-only before |
| **Gallery** | All 25, unchanged |

A unit test fails if the slideshow and the mosaic ever overlap.

### 4. Then the ink panel came off (the same conversation, minutes later)

> Remove the black box of guest house of IIT Palakkad as it looks
> unnecessary.

> If you are keeping the content, remove the guest hpuse manager number and
> all and also center align everything. Left aligned looks kinda off.

The masthead is now **centred plain type** on the page's own ground - label,
`<h1>`, the vermilion stub, the lead and the two doors in a 780px column - and
the **Guest House Manager's number is off the home page**.

- **The box went, the content stayed.** It holds the page's only `<h1>` (an
  e2e test keeps one visible on every public page) and both booking doors,
  which the owner asked to make *more* prominent on 26 Sep 2026. With the
  slideshow holding the top of the page, a second full-width ink slab sat
  directly under a photograph carrying nothing the type could not.
- **The number is off the page, not out of the product.** The **site footer
  carries it on this page as on every other**, and `/contact`, the Guidelines
  and the portal footer each read the same `GUEST_HOUSE_CONTACT`, which now
  has four readers instead of five. This tightens an existing rule rather than
  bending one: `AGENTS.md` already put the office's number in the footer "not
  in a notice on a page", and the home page's hero line was its exception.
  **`AGENTS.md` was corrected**, because it named the home page as a reader.
- **Centred is contained to that one block**, deliberately. Centring the
  sections below would mean rebuilding `SectionHead`, whose construction *is*
  a left-hand label over a full-width hairline, and the guest-house cards and
  amenity grid with it. Read down the page it works as a title page under the
  slideshow; read as a site-wide rule it would be wrong, which is why
  [02-decisions.md](02-decisions.md) says so.

### 5. The booking doors, and the credentials box

> For room and meal booking remove the image and center align the login page.
> Remove the "Demo build - LDAP accounts* "

- **`SignInPanel`'s `photo` is optional now.** With one it is the
  split-screen panel of 30 Sep 2026 (form in five columns, photograph in
  seven); without one it is a narrow `max-w-[560px]` panel centred in the
  page. `/book-room` and `/book-meal` pass none. **`/sign-in` keeps its
  photograph** - the owner named the two booking doors and only those. One
  component with two shapes rather than a second component, because the three
  pages share the signed-in branch, the domain note, the second door, the
  error notice and the `next` plumbing.
- **The form's labels stay left-aligned.** What centres is the panel and the
  prose around it - kicker, title, lead, domain note, footnote. A centred
  label over a full-width input separates the two and reads as a rendering
  mistake. Written down because this is exactly what a later pass would
  "finish".
- **The "Demo build" box is deleted**, with the `sampleAccount` prop that fed
  it. **More than cosmetic:** it printed *a working login* -
  `uid` / `password` in two `<code>` tags - on three public,
  unauthenticated pages. Nothing was exposed that
  [05-credentials-and-security.md](05-credentials-and-security.md) does not
  also hold, but it is not a habit to carry into the institute's real LDAP.
  The sentence it also carried, that "Mock Authentication" stands in for
  Google, is in `AGENTS.md`; the button has said so itself since
  23 Sep 2026.
- `SIGN_IN_PHOTOS.bookRoom` and `.bookMeal` are **kept but unplaced** - both
  are still in the Gallery, and putting either back is one prop.

### Files

**New:** `components/site/hero-carousel.tsx`.

**Changed:** `app/(site)/page.tsx` (slideshow section; the masthead stripped
of its ink panel, centred and shorn of the phone line; the guest houses back
to their own section; `HousePanel` simplified), `components/login-form.tsx`
(the demo-credentials box and its prop deleted; an optional `center`),
`components/site/sign-in-panel.tsx` (`photo` optional, two shapes),
`components/site/site-ui.tsx` (`PageTitle` takes `center`),
`app/(site)/book-room/page.tsx` and `app/(site)/book-meal/page.tsx` (no
photo), `AGENTS.md` (the home page is no longer a reader of
`GUEST_HOUSE_CONTACT`; the two `SignInPanel` shapes; no credentials on a
page),
`lib/site.ts` (`HOME_PHOTOS.slides` added, `preview` repointed),
`tests/public-site.test.ts` (two tests replace one),
`e2e/public-site.spec.ts` (+1 journey).

**Unchanged:** `GUEST_HOUSE_CONTACT` itself and its four other readers,
every photograph file, `GUEST_HOUSE_PHOTOS`,
`GALLERY_SECTIONS`, `SIGN_IN_PHOTOS`, `lib/site-content.ts`,
`components/site/site-ui.tsx`, `app/globals.css`, every store, the portal.

### How it was checked

- `npm run lint`, `npm run typecheck` - clean.
- **`npm test` - 562 passing, 33 files.**
- `NEXT_PUBLIC_SUPABASE_URL= npm run build` - clean; rebuilt normally after.
- **`npm run test:e2e` - 43 passing** (the whole suite, since the sign-in
  card is what every journey signs in through), including a new journey that drives the
  slideshow on desktop *and* the 320px phone: it starts on photograph 1 of 6,
  the arrows move it and **wrap** past either end, a number jumps straight to
  its photograph, it **advances on its own** inside ten seconds with the
  pointer off it, and once paused it has not moved seven seconds later.
- **`curl` against a mock-store dev server:** all six slides are in the
  **server-rendered** HTML, so the hero works before hydration and for a
  crawler; one `<h1>`; the ten photographs appear in the intended order; and
  **every occurrence of the phone number falls after `<footer>`**, which is
  the check that the masthead really stopped printing it rather than merely
  looking as though it had. Then `/book-room`, `/book-meal` and `/sign-in`:
  the first two serve **no photograph** and the centred panel, the third
  still serves its photograph, and **none of the three contains the string
  "Demo build"**.
- `npm run check:memories`.

### Left open

- **Nothing drives the slideshow with a keyboard in the suite.** The buttons
  are real `<button>`s with labels and visible focus rings, and the e2e
  journey clicks them, but no test tabs to them or checks that focus holds
  the rotation. [03-roadmap.md](03-roadmap.md) §2h.
- **The e2e journey spends ~14s a run** waiting for real timers, on each of
  two projects. That is most of a minute of the suite. It is the only honest
  way to test "it moves by itself"; if the suite gets slow, this is where to
  look first.
- **The slideshow has no swipe.** A phone reader uses the arrows, which are
  44px targets at the photograph's edges. Touch-dragging is the obvious next
  ask and is not built.
- The two items the previous round left open stand: **the guest houses are
  listed in the store's order** (Bageshri first, while `/contact` lists
  Hamsanandi first), and **`GUEST_HOUSE_PHOTOS` is not editable from the
  console**.
