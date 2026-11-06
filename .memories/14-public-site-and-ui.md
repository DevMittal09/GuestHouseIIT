# UI design — the public website and the portal restyle

Read this before changing anything visual, adding a public page, or touching
the sign-in pages.

**Ten passes so far:**

| Date | Where | What |
| --- | --- | --- |
| 19 Sep 2026 | `main` | The public website built from `design_handoff/` (a designer's prototype): navy `#12284C`, gold `#E8A317`, 3px corners, no shadows; the portal restyled through the shadcn tokens |
| 21 Sep 2026 | `ui` branch only | A "WOW" redesign in the institute's vermilion with pills, shadows, gradients, frosted glass and a bento grid. Never merged; superseded by the next row |
| 26 Sep 2026, morning | `main` | The owner: the site "looks ass", "too dull and dead"; wanted clean and professional, impressive, **not AI-generated-looking**, in **the colour palette of the IITPKD websites**, following the backend. Plus: a map for each guest house, MRBS and the institute site in the footer, a proper Guidelines page with placeholder house rules, and more prominent booking buttons in the portal. Built as an editorial page full of computed facts |
| 26 Sep 2026, afternoon | `main` | The owner on the morning's version: header "should look more aesthetic", site "too plain", "too mehh"; **no figures** ("23 rooms… 1 month… 14 nights…"), **no "see them on the map"**, **no photo captions**, **"How booking works" moved to the guidelines and vaguer**, **"do not display the backend logic like who are the users, who approves who"**, no instruction text or meal timings on the landing page. Rebuilt photo-led and quiet — full-screen hero, photo banners |
| 26 Sep 2026, evening | `main` | The owner: "it looks so weird… the image filling the page this much looks so weird"; make it **clean and professional**, researched online. Rebuilt **institutional**: photos contained in the layout — see "The evening brief" below |
| 30 Sep 2026 | `main` | A written revamp brief: TGH structure, Aman / Standard editorial rules, **GOV.UK** tables and tags; 4px inputs, 6px buttons, 8px cards, never a pill, shadow, gradient or glass. Primitives rebuilt (see "The 30 Sep revamp" below); the evening's content rules all kept. **Afternoon:** the supervisor's review — see "Promise less" below |
| 11 Oct 2026 | `main` | The owner: the interface "looks too ai generated"; wanted it distinctive, professional and purpose-designed, with no generic dashboard patterns, excessive cards, decorative icons, unnecessary badges or repetitive layouts. **The palette was checked against iitpkd.ac.in again and kept** - what changed was composition, type and density. See "The 11 Oct design pass" below |
| 15 Oct 2026, morning | `main` | The office's eleven new photographs, and **the first two the site is allowed to name**: the owner said which guest house each of two shows and asked for a landing page that showcases them, "similar but not exact copy" of iitpkd.ac.in. The home page's hero and its "Our guest houses" section became **one block** - the ink masthead across the top, a guest house under each half of it, photograph first and the name under it. **No colour, token or primitive changed.** See "The guest houses become the hero" below |
| 15 Oct 2026, later | `main` | The owner: "i need images which change evry few seconds and has the option of arrows to move to next image... just go to iitpkd.ac.in website and see what i mean". A **hero slideshow** - the one client component on the public site - with iitpkd.ac.in's own Previous / Pause / Next and numbered indicators. The masthead moved **under** it, then lost its ink panel and its phone line and was **centred** ("the black box... looks unnecessary"); the guest houses went back to a section of their own. **No colour, token or primitive changed.** See "The hero becomes a slideshow" below |
| 27 Oct 2026 | `main` | A written brief: make the landing page "modern, cinematic, elegant and aesthetically pleasing, while maintaining a professional institutional identity", in six sections. The hero becomes **a full viewport photograph with the navigation laid over it** and the page's title set in the middle of it; two slides, no visible controls, a slow zoom that follows the pointer. Below it the amenities become one ruled strip, the mosaic a **six-thumbnail** preview, the guest houses **text-only cards**, and **Contact us** arrives on the page with a map each. **The first pass to add a type step (`--text-hero`) and a keyframe; no colour changed.** See "The landing page becomes cinematic" below |
| 28 Oct 2026 | `main` | The owner names a reference site for the first time - the **Taramani Guest House, IIT Madras** - and asks for the application to be brought up to it, plus a functional brief. The header becomes **one opaque charcoal bar on every page** with the links centred; the hero gains a saffron kicker, a deeper wash and a **solid saffron** second door; Amenities, Our guest houses and Contact us are **centred**; the gallery is recomposed. Application-wide: **no rule under any heading** (`rule-title` deleted) and **everything selected is filled, never underlined**. The sign-in page loses its form, its photograph and every mention of LDAP. See "The Taramani pass" below |
| **28 Oct 2026, later (current)** | `main` | The same day, after that pass shipped: the hero type "is blending with the background too much" and the page "overall looks very basic... make it look creative and aesthetic", Taramani named again. The wash goes **66% -> 78%**, the `<h1>` becomes **Guest House Portal** in **bold**, and the page gains **an opening statement**, an **ink amenities band**, a **twelve-column gallery mosaic** and **one ruled plate** for the two guest houses. **One keyframe added (`hero-cue`); no colour, token or primitive changed.** See "The page stops being basic" below |

## The page stops being basic (28 Oct 2026, later)

The same brief as the morning, given again because the morning's answer was
correct and still read as a template. Four items; the first three are the
hero, the fourth is everything under it.

### The hero

| | |
| --- | --- |
| Wash | **`bg-ink/78`**, from 66% that morning and 60% the day before. White display type clears **6:1** against the brightest tenth of the middle band of either photograph, near 12:1 against its average. The ceiling is about 85%, past which the photograph is decoration behind a charcoal panel |
| Kicker | **Kept verbatim** - "Indian Institute of Technology Palakkad", tracked saffron capitals - and now set **between two 40px saffron hairlines**, dropped below `sm` where the line itself wraps |
| `<h1>` | **"Guest House Portal"**, `font-bold` - the one bold heading on the site. It was "IIT Palakkad - Guest House": the institute's name twice over, and a separator that had to be hidden on a phone because "IIT Palakkad -" over "Guest House" reads as a hyphenated word |
| Lead | Loses `font-light`. The owner's own sentence of 27 Oct is otherwise untouched |
| Scroll cue | A saffron-free white chevron at the foot of the hero, `aria-hidden` and `pointer-events-none` so it cannot take the click that pauses the photographs. `hero-cue`, the site's second keyframe, through `motion-safe:` |

### The four blocks below it

| Block | Change |
| --- | --- |
| **Staying on campus** | **New.** `homeIntro(houses)` in `lib/site-content.ts` - two sentences computed from the store, naming the guest houses it holds and saying meals only where one has a kitchen - in five columns, with `HOME_PHOTOS.intro` in seven beside it and a **saffron corner mark** offset from its bottom left. The page had nothing to read between a photograph and six icons |
| Amenities | **On ink, icons in saffron**, hairlines in `white/15`. The page's one dark band between the hero and the footer; the ink is the header's and the footer's, so no token was added |
| A look inside | A **twelve-column mosaic**: 5x2 beside 7, then 3 and 4, then 7 and 5. The spans tile the grid exactly **in that order**, so auto-placement leaves no hole - a seventh photograph needs the pattern rethought, not appended to. Two columns below `lg`, first and last spanning both. On the warm band now, so the photographs sit on a ground |
| Our guest houses | **One ruled plate of two cells** - the same device as the amenities above and the contact band below - with the name at **`text-display`** over a **saffron** stub. Still **text only** |

**Nothing decorative was borrowed.** No shadow, no gradient, no pill, no
radius above 8px. Everything above is composition, ground, type and one
accent colour - which is the answer to "it looks basic" this project is
allowed to give, and [02-decisions.md](02-decisions.md) under this date says
what the next answer would have to be instead.

## The Taramani pass (28 Oct 2026)

The first round with a **named reference**: the owner asked for the
application to be brought up to the [Taramani Guest House, IIT
Madras](https://tgh.iitm.ac.in/) site, "used as inspiration without copying
it directly".

**Its stylesheet was read, not its screenshots guessed at.** IIT Madras
maroon `#800000`-`#8B0000`, gold `#C9973A`-`#E2B95C`, cream `#F1E9DC`,
**Fraunces** display over **Manrope** text, small capitals tracked `0.06em`
to `0.18em` - and `box-shadow: 0 28px 60px`, `border-radius: 1rem`,
`rounded-full`, five gradient pairs. What was taken and what was refused is
in [02-decisions.md](02-decisions.md) under this date; the short version is
**the typography and the composition, not the decoration**.

### What changed on the home page

| Block | Change |
| --- | --- |
| Hero | **Indian Institute of Technology Palakkad** in tracked **saffron** capitals above the `<h1>`; a 56px vermilion stub under it; the lead at `clamp(17.5px,…,21px)` in `font-light`; the wash **`bg-ink/60` -> `bg-ink/66`**; *Book a Meal* becomes **`siteButton.saffron`** - solid, ink on the emblem's gold - beside the vermilion *Book a Room* |
| Amenities | **Centred**, label and all; the ruled strip is `max-w-[1040px]` |
| A look inside | Six photographs in **two bands of unequal widths** (wide, narrow, narrow / narrow, narrow, wide) on one `auto-rows-[clamp(170px,15.5vw,215px)]`. **The only section still left-aligned**, because its heading carries *See the full gallery* |
| Our guest houses | **Centred**, `max-w-[920px]` |
| Contact us | **Centred**: the manager's line, the email and the address as **one ruled band of three** (`sm:grid-cols-3`, each cell centred), then one map per guest house |

### The header: one opaque bar

**`bg-ink`, on every public page, closed by a vermilion rule** - the
translucent band of the day before "looks too juvenile and translucent". It
is the institute's own top-bar colour and the portal's masthead, so both
halves of the application now open the same way.

| | |
| --- | --- |
| Layout | Three columns from `lg` (`1fr auto 1fr`), so the six links sit in the **middle of the bar** whatever the lockup and the button measure. Below `lg`, a second scrolling row |
| Current page | A **vermilion-deep chip** (5.2:1 with white on it), which is the colour iitpkd.ac.in marks its own current menu item with |
| On `/` | Still laid **over** the hero (`absolute`, `lg:fixed`), so the photograph fills the first viewport |
| Client code | `usePathname` only. The scroll listener is gone with the colour change it drove |

### Two rules that now hold everywhere

- **No rule runs under a heading.** `rule-title` is **deleted** (it had one
  reader, `PageHeader`); `SectionHead`'s full-width hairline is gone, replaced
  by a **40px vermilion stub**; `SectionHeading`'s leader rule is gone, and
  the manager's console drew eight of them down one screen. What ranks a
  heading now is a label, the serif and the space under it.
- **Whatever is selected is filled, never underlined.** The service had four
  ways of saying "this one"; it has one. Ink on white (`NavBar tone="service"`,
  `LinkTabs`, `segment()`, the Approval Log's tiles), vermilion-deep on ink
  (`NavBar tone="ink"`). `tone="dark"` is gone - nothing used it.

### And the sign-in page

The second brief of the same day. **One centred panel, one button, no
photograph and no mention of LDAP** - the fields, the "institute LDAP account
or your @iitpkd.ac.in account" sentence and the split-screen shape are all
gone. See "Sign-in: what changed and what did not" below, which this round
rewrites.

## The landing page becomes cinematic (27 Oct 2026)

A written brief, six numbered sections, and the owner's own copy for the
hero. The page is now **five blocks**:

**Hero (full viewport) -> Amenities -> A look inside -> Our guest houses ->
Contact us.** The *Planning a visit?* row of two links is gone - its Contact
link became the section above it, its Guidelines link moved inside that
section.

### The hero

| | |
| --- | --- |
| Shape | `min-h-svh` - the first viewport, whatever the browser chrome does |
| Photographs | **2** (`HOME_PHOTOS.slides`), which **are** `GUEST_HOUSE_PHOTOS` - the only two the site attributes. 6.5s each, a 1.4s cross-fade |
| Wash | **`bg-ink/60`**, one translucent solid colour, no gradient. Measured against both photographs: white display type clears 3:1 against the brightest tenth of the middle band and sits near 7:1 against its average |
| Over it | The page's only `<h1>` (`text-hero`, the vermilion separator `hidden sm:inline`), one sentence, *Book a Room* (brand) and *Book a Meal* (outline-light), centred |
| Motion | `hero-drift` 30s `alternate` on an inner layer; the pointer moves `transform-origin` and lifts the scale to 1.06 on an outer one, both over 1.4s |
| Controls | **None.** Clicking the photograph pauses and resumes it; a quiet **Paused** marker says so |
| The header | Laid over it as a translucent **ink band** (`bg-ink/65`), white type, turning into the ordinary white bar at `scrollY > 24` |

**Why two layers of motion.** A CSS animation owns `transform`, so a hover
transition on the same property would fight it: the drift is on an inner
layer, the pointer zoom on an outer one. The zoom is written **through a ref
in the event handler** - one style on one element - rather than by
re-rendering the layers at the pointer's frame rate.

**Why the click target is a `<button>`.** "It stops" is one of the four rules
of 15 Oct 2026 and the brief removed the visible control, so the control moved
into the photograph: a real `<button>` covering it, under the title block,
with an `aria-label` that says which way it will go. The title block is
therefore **`pointer-events-none`**, with `pointer-events-auto` on its two
links alone, so a click anywhere a reader would call "the hero image" reaches
the button and the doors still work. **Holding on hover was dropped** - on a
hero this size the pointer rests over it most of the time, which would cancel
the auto-transitions the brief asks for, and hovering now means the zoom.
Focus inside the hero still holds it, and `prefers-reduced-motion` stops the
rotation, the drift and the pointer zoom.

### The four sections under it

- **Amenities** - the same six from `amenities()`, in one ruled strip
  (`gap-px` over a border-coloured ground) of **2 / 3 / 6** columns, the icon
  over its label, centred. Six divides into all three, so no cell is ever
  empty. **The headings stay left**: the gallery section has to carry a link
  at its top right, and one centred heading among four left-ruled ones is the
  inconsistency the brief warns about.
- **A look inside** - **six** thumbnails in one row (2 / 3 / 6), where it was
  a 540px mosaic of four. `HOME_PHOTOS.preview` was repointed and varied so no
  two frames beside each other look alike, and a unit test keeps it disjoint
  from the hero.
- **Our guest houses** - **text only**: the name as an `<h2>`, a vermilion
  stub, *Book a Room*, and *Book a Meal* where `serves_meals`. No photograph
  (both are in the hero now), no "Rooms & dining" label, no summary line -
  **`houseSummary` is deleted**, with its test.
- **Contact us** - the manager's line, email and address in four columns,
  beside **one map per guest house** in eight. The map grows to whatever the
  details column needs (`flex-1`), so the two end on one line.

### The map loses the row under it

`GuestHouseMap`'s footer - the guest house's name, *Open in Google Maps* and
*Get directions* - is **deleted**, on `/contact` as well as here: the embed
carries its own "View larger map" and directions control, and the name was
printed directly under the tab that had just been clicked. `MapEmbed`
(`site-ui.tsx`) is the shared iframe, so the two pages cannot drift. **The
footer still links each guest house's map and directions** - that is the one
place the pair is not redundant.

### What this reversed

Both were argued against in September and asked for anyway;
[02-decisions.md](02-decisions.md) carries the *Superseded* notes.

- **Photographs are contained in the layout** (26 Sep 2026) - still true of
  every photograph but this one, which carries the page's `<h1>` rather than
  standing in front of it.
- **The header is a plain white bar** (26 Sep 2026, after an afternoon of
  lying transparent over a photograph) - it is a **translucent band** over the
  hero now, not nothing, which is what makes white links readable (2.4:1 over
  bare sky; above 5:1 on the band).

### Two things the tests could not have caught

Found by reading screenshots back at 1440px and 390px: the two map cards were
**half empty** (a grid row stretches to the taller details column, so the
iframe is `flex-1` now), and the title wrapped to **"IIT Palakkad -"** over
"Guest House" on a phone, which reads as a hyphenated word (the separator is
`hidden sm:inline`).

## The hero becomes a slideshow (15 Oct 2026, later)

> **Superseded 27 Oct 2026** - see the section above. The slideshow is now a
> full-screen hero of **two** photographs with **no visible controls**. What
> survives of this section: the four rules a rotating carousel has to keep,
> and the rule that the mosaic may not repeat what the hero showed. The rest
> is a record of what the page looked like between 15 and 27 October.

The owner asked for iitpkd.ac.in's hero outright - photographs that change by
themselves, arrows to move between them, the details below. **A carousel had
been argued against that morning and was asked for anyway**, which settles it
([02-decisions.md](02-decisions.md) has the *Superseded* note).

### The page order now

**Slideshow -> ink masthead -> Our guest houses -> amenities -> "A look
inside" mosaic -> closing links.**

The masthead - the `<h1>`, the lead and *Book a room* / *Book meals* - sits
**under** the photographs. That is the order the owner described and the
order iitpkd.ac.in uses; the `<h1>` is still the page's only one and still
the first heading in the document.

This reversed that morning's merge. The guest houses are **a section of their
own** again with ordinary bordered cards, so `HousePanel` no longer needs the
`md:odd:border-l-0` arithmetic or a `priority` flag.

### Then the ink panel came off it, and it was centred

Minutes later the owner: *"Remove the black box of guest house of IIT
Palakkad as it looks unnecessary"*, then *"remove the guest hpuse manager
number and all and also center align everything. Left aligned looks kinda
off."*

- **No ink panel.** The headline, lead and buttons are plain type on the
  page's own ground. The panel earned its weight while it *was* the hero; the
  moment the photographs took that job, a second full-width ink slab sat
  directly beneath a photograph carrying nothing the type could not.
- **What it held stayed.** The block is still the page's **only `<h1>`** -
  an e2e test keeps one visible on every public page - and still carries both
  doors into the portal, which the owner asked to make *more* prominent on
  26 Sep 2026. "Remove the black box" names the container, and the second
  message confirms it ("If you are keeping the content...").
- **Centred, and the only centred block on the site.** `text-center` on a
  `max-w-[780px]` column. Said of this block and taken that way: centring the
  sections below would mean rebuilding `SectionHead`, whose construction *is*
  a left-hand label over a full-width hairline, plus the guest-house cards
  and the amenity grid. Read down the page it works as a **title page** under
  the slideshow; read as a site-wide rule it would be wrong. **Don't "make it
  consistent".**
- **The office's number is off the home page.** See "Configurable values"
  below - `GUEST_HOUSE_CONTACT` now has four readers, and the site footer is
  on this page as on every other.
- **The vermilion stub survived** (`h-1 w-12 bg-vermilion`, now `mx-auto`).
  It is the one mark left from the ink panel, and it is the site's own.

### `components/site/hero-carousel.tsx`

**The only `"use client"` file on the public site.** It takes `SitePhoto[]`
and renders them; it knows nothing about guest houses, the store or any
booking rule, so the rest of the site stays server-rendered. All six slides
are in the **server-rendered HTML**, so the hero works before hydration.

| | |
| --- | --- |
| Slides | 6 (`HOME_PHOTOS.slides`), where iitpkd.ac.in's hero has 5 |
| Timing | 6s a slide, one translating track, 700ms ease-out |
| Controls | **Previous / Pause / Next and numbered indicators** - theirs. Square bordered buttons at 6px, 44px targets; the active number carries a 3px vermilion hairline |
| Shape | `aspect-[4/3]` on a phone (more of a building), `sm:aspect-[16/9]` - the banner shape |
| Contained | Inside the 1240px `Container`, like every photograph here. A full-bleed one read as "so weird" to the owner |

**Numbers, not dots.** A row of round dots would be the pills the design
rules ban, and a number says how far through you are without a legend. It is
also what iitpkd.ac.in does.

**No caption, no wash, no link.** Their slides wrap each image in a link to
another page; these do not. The site's rule that no photograph carries a
visible caption holds inside the slideshow too - the guest houses are named
in the cards below it, and nowhere else.

### The four rules a rotating carousel has to keep

Written down because this is the control most often shipped broken:

- **It stops.** A visible Pause button, **and** it holds while a pointer is
  over it or the keyboard focus is inside it - otherwise a reader loses the
  photograph they were looking at, or the arrow they were tabbing towards
  moves out from under them.
- **`prefers-reduced-motion` stops the rotation itself**, not just the
  transition. Swapping the image every six seconds without animating it would
  miss the point of the setting.
- **`aria-live` follows the rotation**: `off` while it advances by itself (a
  screen reader must not narrate a timer), `polite` once paused and the
  reader is driving.
- **Every slide stays mounted**, inactive ones `aria-hidden`, so one track can
  translate and nothing off-screen is announced. Nothing inside a slide is
  focusable, so no `inert` is needed.

**Non-active slides load `eager` on purpose.** They sit inside
`overflow-hidden` translated off to the side, where lazy loading cannot be
relied on to have fetched them before the timer brings them round; a blank
frame mid-rotation is worse than the bytes. Only the first carries `priority`.

### What the mosaic shows now

`HOME_PHOTOS.preview` was repointed at **four photographs the slideshow does
not carry** - `hamsanandi-block-entrance`, `bageshri-corridor`,
`sitting-room`, `living-dining`, all Gallery-only until now. Scrolling past a
hero to meet the same six photographs again is what makes a long page feel
padded. **A unit test fails if the two sets overlap.** The two guest-house
photographs are the one deliberate repeat: the slideshow is a reel, the cards
are where they are named.

## The guest houses become the hero (15 Oct 2026)

The fifth rework of the home page, and the first driven by photographs rather
than by a brief about the look. The office sent eleven; the owner named two of
them as **the main photograph of Hamsanandi and of Bageshri** and asked for a
layout that showcases them.

### What changed

**One block instead of two sections.** The hero used to be a 5 + 7 split - an
ink panel beside one contained 4:3 photograph - and the guest houses were
text-only cards in a section headed *Our guest houses* further down. They are
now a single bordered block:

- the **ink masthead** across the top: the `<h1>` and its vermilion stub in
  seven columns, the lead and the two doors in five, the Guest House Manager's
  number on a hairline under them;
- beneath it, **one panel per guest house**: its own photograph at 3:2 across
  half the page, then `Rooms & dining` / `Rooms`, the name as an `<h2>`,
  `houseSummary(house)`, and *Book a room* on a ruled foot.

**Gone:** `HOME_PHOTOS.hero` - the page has no decorative hero photograph any
more - and the heading *Our guest houses*, which repeated an `<h1>` reading
"Guest houses of IIT Palakkad". The rest of the page is unchanged: amenities,
the four-photograph mosaic under *A look inside*, the closing ruled links.

**Nothing in `app/globals.css`, `site-ui.tsx` or the type scale was touched.**

### What was taken from iitpkd.ac.in, and what was not

| Theirs | Taken? |
| --- | --- |
| The **card idiom**: the image above, its title printed **underneath**, never laid over it (their facilities, gallery and three-up rows all do this) | **Yes** - it is the house panels. It needs no dark wash over the architecture to stay legible, and it keeps the ban on photo captions intact: the name is a **heading**, and the thing it heads is the guest house, not the picture |
| The **rhythm**: a banner, then cards, then a row of thumbnails | **Yes** - masthead, house panels, mosaic |
| The **five-slide hero slider** | **No.** It needs a client component, hides half of what it was asked to showcase behind a control, and reads as a template - the owner has twice asked for the site not to look generated |
| The **counters strip** (years, students, faculty) | **No.** Figures are banned on the home page (26 Sep 2026). `figure-serif` exists for the portal's own figures |
| **Titles under the mosaic photographs** | **No.** The owner's ban on photo captions wins over copying the pattern |

### Two rules this pass added

- **A photograph may name a guest house - on the two house panels and nowhere
  else.** `GUEST_HOUSE_PHOTOS` / `guestHousePhoto(name)` in `lib/site.ts`, keyed
  by `guestHouseSlug(name)` exactly as `GUEST_HOUSE_LOCATIONS` is. A house the
  registry does not name draws `SitePhotoFrame`'s placeholder rather than
  borrowing another house's photograph, so **renaming a guest house in the
  console takes its photograph off the card** until the registry learns the new
  name - the same way it takes its map pin off `/contact`. See "Photographs"
  below for what stays unattributed.
- **Hairlines between repeated panels are each panel's own borders when the
  count is not fixed.** The amenities grid may use `gap-px` over a
  border-coloured ground because `amenities()` always returns six; the guest
  houses come from the store, and with an odd number that ground shows through
  the empty cell. The house panels carry `border-t ... md:border-l
  md:odd:border-l-0` instead, which rules correctly for any count.

## The 11 Oct design pass

The fourth rework of the look, and the first that changed no colour. Why it
was done this way is in [02-decisions.md](02-decisions.md) ("11 Oct 2026, the
design pass"); this is what the code now holds.

**The palette was re-derived, not re-chosen.** iitpkd.ac.in's theme CSS was
pulled again and counted: `#e94c26` 22 times, then `#fff`, `#333`, `#ededed`,
`#1a1a1a`, `font-family: 'Source Serif Pro'` on headings. That is already what
`:root` holds. Nothing in the token table further down this file changed.

### The type scale - five named steps, six since 27 Oct 2026

In `@theme inline` (`app/globals.css`), used through Tailwind as
`text-hero`, `text-display`, `text-title`, `text-section`, `text-card`,
`text-meta`:

| Step | Size | For |
| --- | --- | --- |
| `hero` | `clamp(2.5rem, 1.5rem + 3.6vw, 4.25rem)` | **The home page's title over its photograph, and nothing else** (27 Oct 2026). `display` tops out at 48px, which is right for a page title and small in the middle of a 900px photograph |
| `display` | `clamp(2rem, 1.35rem + 2.1vw, 3rem)` | A page's one `<h1>` (`PageHeader`) |
| `title` | `clamp(1.75rem, 1.35rem + 1.5vw, 2.5rem)` | A public section's `<h2>` (`SectionHead`), the guest-house names |
| `section` | `1.3125rem` | A console list's `<h2>` (`SectionHeading`) |
| `card` | `1.0625rem` | `CardTitle` |
| `meta` | `0.8125rem` | Small print |

Body text is `text-base` / `text-sm`. Headings used to be one-off `clamp()`
values written where they were used, which is how eight sizes of heading
reached one page. **Add a step only by adding it here and to `TYPE_STEPS` in
`lib/utils.ts`** - see the trap below.

> **`cn()` will silently eat a new `text-*` size.** tailwind-merge classifies
> an unknown `text-<word>` as a **colour**, so `cn("text-title", "text-ink")`
> dropped the size as the losing half of a colour conflict and three home page
> headings rendered at 16px with no error. `lib/utils.ts` builds `cn` with
> `extendTailwindMerge` and registers the five names under `font-size`.

### Two devices, both the institute's own

| Utility | From iitpkd.ac.in | Used by |
| --- | --- | --- |
| `rule-title` | `h1.node-title { border-bottom: solid 1px #e94c26 }`, plus a 3px vermilion stub over the start of the rule | `PageHeader`, so every portal page title closes on it. It replaced a 2px **ink** rule - the same mark `Table` uses for its header row, so a page and a table in it opened identically |
| `figure-serif` | `.counters span { font-family: 'Source Serif Pro' }` | Every figure meant to be compared: `SectionHeading`'s count, `DeskSummary`, the Approval Log's tiles |

A third was written from its `.subtitle:after` (a short vermilion hairline
under a label) and **deleted unused** - everywhere it would have gone already
had a rule. Don't reintroduce it without a place for it.

### What the primitives do now

| Primitive | Change |
| --- | --- |
| `PageHeader` | `rule-title`; the caption is a tracked vermilion label, not a grey sentence |
| `SectionHeading` | The count is a **serif figure**, vermilion on a `tone="alert"` list and quiet at zero, not a filled square tag; a hairline runs from the title to the far edge. **The rule, not a box, is what separates one list from the next** |
| `EmptyState` | One quiet line on a left hairline (`py-2.5`), not a dashed box 90px tall. **22 of them were replaced across 16 files** - the manager's console alone stacked four between the top of the page and its first real row |
| `Card` | No band-tinted header strip: the title sits over a hairline on the same white as the body. A long form had a grey bar every couple of hundred pixels |
| `DeskSummary` | A ruled index, not seven tiles: label, leader rule, figure, on a 44px baseline. A zero is 13.5px grey, a live count the serif at 1.5rem. **The order is the caller's and never re-sorts on the count** - the desk reads it all day and a figure that moves is a figure to find again |

### Density: a column that repeats itself is not a column

- **`ReviewQueue`** (`/warden`, `/hod`, `/approvals`, `/iar`) has **no Status
  column** - each of those pages lists exactly one status - and check-in and
  check-out share one **Stay** cell with both instants. The table measures
  1150px inside a 1150px container, so **Review, Forward and Reject all fit a
  1440px page**; the Status column was what pushed them off it.
- **`BookingDetails`** opens on one badge, not six. The status keeps its
  colour and a **foreign national** keeps a mark (the guest house has to
  report one); role, booking type, service type and the diet split are a line
  of plain text. Same for the manager queue's Category cell and Users & Roles'
  Role cell.
- **The Approval Log's tiles** are one ruled band of six. Six divides into 2,
  3 and 6, so no breakpoint orphans one; the active tile is ink-filled.
- **`/availability`'s room list is a table.** A free room reads as a dash, not
  "Free all week - available to book" twenty times.
- **The allocation dialog renders `RoomGrid` first**, then `BookingDetails`.
  The grid's own header carries the stay's period and "N of M requested" and
  the description names the requester, so nothing has to be read before it.
- **Users & Roles** puts name over email in one **Account** cell.

### Before adding a wide table to the portal

Measure it against its container, which is a two-line script in
[22-running-and-testing.md](22-running-and-testing.md). Three tables were
overflowing and hiding their own last column, which is where the actions are.

### What this pass did not touch

Every content rule from 26-30 Sep and 8-11 Oct: no figures, requester
categories, approval chains, role names or photo captions on the public site;
photographs contained in the layout; promise little; a rule the form enforces
is not stated on the form; a house rule is not either; a form that stars a
field says what the star means. Three page leads that restated their own
titles were deleted (`/manager`, `/caretaker`, the kitchen day view), and the
pay-at-checkout note became an inset line rather than a numbered card - the
sentence is unchanged and still rendered.

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
> **One of them has since gone, 14 Oct 2026.** The **privacy consent** -
> paragraph, tick and stored record - came off the request at the office's
> request, and later the same day the owner withdrew the **whole notice**: the
> page, its version and its three links (the footer's bottom line, the
> Guidelines' closing sentence, the first item of the My Bookings row). It is
> all in `archive/privacy-notice/`, with the restore. `/privacy` is a 404 and
> an e2e test keeps it one.

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

### And a house rule is not stated on the form either (11 Oct 2026)

> "'Pets are not allowed in the guest house premises.' is only required in the
> guidelines no need to show it here."

The rule above is about what the form **enforces**. The pets notice enforces
nothing - it is a conduct rule for the stay - and it was the one notice left
with a card of its own, in amber, on every room booking. It has the same three
homes as any other rule, two of which it keeps:

- the **Guidelines page**, "During your stay" ("Pets are not allowed");
- the **"Pets" line in every booking mail** (`PETS_POLICY_NOTICE`, still the
  one place the sentence is written) - repeated on every message rather than
  the confirmation alone, because it is the rule a guest can breach before
  anyone at the desk can stop them.

The constant stays; only the card is gone. A guest who arrives with an animal
is still turned away at the desk, and the person who booked has been told
twice.

### The stars on a form explain themselves (11 Oct 2026)

> 'Mention "These field are mandatory for those shown with *" Whenever we are
> using it [*].'

Mandatory fields have been marked with a star since the first form, and
nothing said so. `components/required-fields-note.tsx` is the one wording -
**"Fields marked with * are mandatory."** (`MANDATORY_FIELDS_NOTE`) - drawn by
`RequiredFieldsNote` **above** the first starred label, so it is read before
the fields it describes:

| Form | Where it sits |
| --- | --- |
| The booking form (`/book`) | Under the "Booking as" line, above the first card |
| Users & Roles → Add / Edit user | Under the dialog's description |
| Reject a request (`ReviewQueue`) | Under the dialog's description; "A reason is mandatory." came off the description, which said it twice |

It is **not** repeated per field: a star and a "(mandatory)" beside it is the
commentary the 8 Oct rule took out. Any new form that stars a field renders
this component rather than wording it again.

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

**Then two changes on 14 Oct 2026, both about what a figure is saying:**

- **The count of free rooms is green** - `--occupy` / #00703c, the deep green
  of the desk's *Mark as Occupied* button, reused rather than a second green
  added. It is the figure in each day column, the headline figure, the hour
  chips, the 3px meter, and the "N free" in the desk chart's date column. The
  vermilion **Full** state is unchanged, so the panel's two ends now both
  carry a colour. Green text on white is 5.3:1.
- **A day that has gone carries no figure at all**: greyed (`opacity-55`), a
  plain border, the word **Past**, no meter, and an `aria-label` reading "a
  past date, not available to book". A one-day window on a past date says
  **Past date** and drops the hour strip. `isPastDay(day, today)`
  (`lib/availability.ts`) is the one rule, shared with the desk's week and
  month chart, where a past row is shaded `bg-band/60`, its label dimmed and
  its figure replaced by "past" - the bars stay, because they are the record.
  Why: a week runs Monday to Sunday and a month is whole, so the range
  containing today contains days the schema has always refused, and the panel
  was printing "10 free" against them.
- **The sentence above the booking form's panel is gone** with them - "10 of
  10 rooms at Bageshri free all month", the `freeThroughout` figure. The line
  keeps the period shown and the "your booking is unchanged" note that has to
  stay while the chart is browsable. The equivalent figures in
  `/availability`'s own header line were **not** touched: the office asked
  about the form.

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
  the Requester details card and, since 17 Oct 2026, the **tariff panel**,
  which has been a **read-only price list since 31 Oct 2026** - the category
  is the Guest House Manager's to choose. The grid itself moved into
  `BookingForm` when choosing a category wrote two of the form's fields and
  stays there; the `<form>` element is the left column, and the panels are its
  grid siblings, holding no registered field); the booking form's cards numbered by
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
    layout.tsx          header (white, sticky from lg; over the hero on /), footer
    page.tsx            /            Home
    book-room/          /book-room   gated entry → sign in → /book
    book-meal/          /book-meal   gated entry → sign in → /book/meals
    guidelines/         /guidelines  How booking works, then numbered rules; §7–8 provisional
    gallery/            /gallery
    contact/            /contact     one map tab per guest house
    sign-in/            /sign-in     general sign-in; where every portal guard redirects
    mock-login/         /mock-login  Mock Authentication persona picker (open while Google is unconfigured)
                                     (privacy/ withdrawn 14 Oct 2026 - archive/privacy-notice/)
  (portal)/             SIGNED-IN portal — unchanged routes, restyled shell
    layout.tsx          ink masthead + service nav + ink footer: copyright, the
                        guest house office's phone and email (9 Oct 2026), links
    book/page.tsx       /book        Room Booking (and ?service=meals_only)
    book/meals/page.tsx /book/meals  Meal Booking - the same page, dining flow
```

**Two booking doors in the service nav** (17 Oct 2026): **Room Booking**
(`/book`) and **Meal Booking** (`/book/meals`) in place of one New Booking.
One page behind both (`components/booking-request-page.tsx`); the meal door is
a **route** rather than `?service=meals_only` because `usePathname()` cannot
see a query string, so two items on one path would both light up. `/book` is
therefore matched **exactly** in the nav (`exact={[ROOM_BOOKING_PATH]}`), since
the meal door is nested under it. Meal Booking is offered only where the
account could submit one - the same `serviceTypesFor` question the My Bookings
tile asks. The paths are `ROOM_BOOKING_PATH` / `MEAL_BOOKING_PATH` in
`lib/routes.ts`, read by the nav, the tiles and `/book-meal`.

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

> **Current state (28 Oct 2026): one button, and no password.** The owner
> withdrew LDAP from the interface - "we will not be using LDAP. The intended
> authentication method is Google authentication, but for now, clicking the
> sign-in button should initiate a mock authentication flow" - so all three
> doors (`/sign-in`, `/book-room`, `/book-meal`) are the **same centred
> panel**: the kicker, the title, one line of lead, one button, one line
> under it.
>
> | Configured | The button |
> | --- | --- |
> | Google (`GOOGLE_CLIENT_ID` and friends) | **Sign in with Google**, with the Google mark, to `/api/auth/google/start` - the real OpenID Connect flow of Phase 8, unchanged and still unbuilt-upon |
> | Nothing | **Sign in**, to `/mock-login?next=…`, with "Google sign-in is not connected yet - you will be asked to choose an account" under it. **No Google mark**: a "G" on a button that does not talk to Google claims something untrue, and that rule predates this round |
>
> **What went:** the LDAP username and password fields, the domain sentence
> ("Use your institute LDAP account or your @iitpkd.ac.in account. Personal
> email accounts cannot be used."), the photograph beside `/sign-in`, the
> split-screen shape, and the picker's "← Back to LDAP sign in".
>
> **What did not:** `signInWithLdap`, the per-uid throttle, the single message
> for an unknown user and a wrong password, the empty-password refusal,
> `lib/ldap/` and *Import LDAP usernames*. The door is a form away.
>
> **The e2e suite signs in through the picker now** (`signIn()` in
> `e2e/helpers.ts`), matching a persona by **name, anchored** - the button
> reads "name, email, role", so an unanchored match would one day find a role
> badge.
>
> **The dashed "Demo build" box is still deleted** (15 Oct 2026): it printed a
> working dummy login on three public pages. The accounts are in
> [05-credentials-and-security.md](05-credentials-and-security.md) and
> `lib/ldap/mock-directory.ts`; **don't put them back on a page.**

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
> [05-credentials-and-security.md](05-credentials-and-security.md). The bullets below describe the
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
| `--ink` | `#1A1A1A` | `bg-ink` / `text-ink` | **both mastheads** (the public site's since 28 Oct 2026, the portal's since 30 Sep), both footers, headings, and the home hero's wash at **`bg-ink/78`** (measured: white display type 6:1 against the brightest tenth of the middle of either photograph, near 12:1 against its average), **plus the amenities band under it** (28 Oct 2026) |
| `--ink-soft` | `#2B2926` | `bg-ink-soft` | hover on ink |
| `--vermilion` | `#E94C26` | `text-vermilion` / `bg-vermilion` | rules, icons, active-nav bar, display-size numbers — **never behind white text** |
| `--vermilion-deep` | `#C43C1C` | `bg-vermilion-deep` / `text-vermilion-deep` | **buttons with white text** (5.2:1), small labels and link hover (5.8:1 on white) |
| `--vermilion-hover` | `#A8331A` | `bg-vermilion-hover` | hover on the above |
| `--vermilion-soft` | `#FDF0EB` | `bg-vermilion-soft` | spare tint |
| `--saffron` | `#F5A300` | `text-saffron` / `bg-saffron` | the emblem colour: labels on ink (8.4:1), the hero's kicker and its **solid *Book a Meal* button** (28 Oct 2026), notice-box edge; carries **ink** text, never white |
| `--saffron-deep` | `#D98F00` | `bg-saffron-deep` | hover on the saffron button (ink on it is 7.1:1) |
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

**One keyframe, `hero-drift`** (27 Oct 2026, `app/globals.css`): the hero's
slow `scale(1.02)` -> `scale(1.12)`, 30s, `alternate`, applied through
`motion-safe:` and used in one place. It is the site's only animation; add a
second only with a reason, and never one that moves something a reader is
trying to read.

Mail templates (`lib/mail/render.ts`) still carry the old amber header.

## Components

| File | What |
| --- | --- |
| `components/site/brand.tsx` | **`BrandBlock`** — the lockup: `iitpkd-logo.png` (emblem only) + "Guest House" (serif) + a tracked tagline (`tagline`, default "IIT Palakkad"); `tone="light"` over photos and on ink; `compact` for the portal. Used by the site header, the footer and the portal header |
| `components/site/site-header.tsx` | **`SiteHeader`** and `SITE_NAV`: **one opaque `bg-ink` bar on every page** (28 Oct 2026), vermilion rules top and bottom, the lockup left, the six links **centred** in a `1fr auto 1fr` grid from `lg`, Sign in / My portal right, a scrolling link row below `lg`. On `/` it is `absolute` (`lg:fixed`) **over** the hero; elsewhere sticky from `lg`. Client for `usePathname` alone. `SITE_NAV`'s second meal item reads **Book a Meal** |
| `components/site/site-chrome.tsx` | **`SiteFooter({ pins })`** — the lockup and address, the number under `GUEST_HOUSE_CONTACT.phoneLabel` (**Guest House Manager** since 14 Oct 2026), **Find us** (each guest house's Map and Directions, How to reach the campus), **Institute** (`SITE_LINKS`), and a bottom line (Guidelines, Contact - the **Privacy notice** link went with the notice on 14 Oct 2026). The **MRBS line** that opened it ("Booking a lecture hall or meeting room?") was removed on **7 Oct 2026** at the office's request, with every other mention of the Meeting Room Booking System |
| `components/site/site-nav.tsx` | `NavBar` — **the current item is filled, never underlined** (28 Oct 2026). `tone="ink"` (the public masthead: white links, the current one a **vermilion-deep** chip), `"service"` (the portal's white bar: the current one **ink**), `"light"` (a white bar, the current one a vermilion-soft chip). `tone="dark"` and `"overlay"` are **gone** - nothing used them after this. `scroll` for the phone row |
| `components/site/site-ui.tsx` | `Container` (1240px), `Label` (tracked capitals), `PageTitle` (the sign-in pages' `<h1>`, optional `kicker`, optional `center`), **`PageMasthead`** (a light band: breadcrumb, `<h1>`, lead, `note`, `aside`), `SectionHead` (label + `<h2>` + a **40px vermilion stub**, `align="center"` for the three centred sections; **no full-width rule** since 28 Oct 2026), `ArrowLink`, `BulletList`, `siteButton.{brand,ink,outline,light,outlineLight}`, `SitePhotoFrame` (8px corners; `zoom` eases on hover), **`MapEmbed({ pin })`** (27 Oct 2026: the iframe and **nothing under it**, shared by the home page and `/contact`) |
| `components/site/hero-carousel.tsx` | **`HeroCarousel({ photos, children })`** (client; rewritten 27 Oct 2026) — the home page's **full-viewport** hero: two photographs cross-fading every 6.5s under a `bg-ink/60` wash, the `children` (title, lead, two doors) centred over them, a 30s `hero-drift` zoom and a pointer-following one. **No visible controls**: the photograph is a labelled `<button>` that pauses and resumes. Holds on focus-within, not on hover; `prefers-reduced-motion` stops the **rotation** and both zooms; `aria-live` is `off` while rotating and `polite` once paused. Takes `SitePhoto[]` and markup — it knows no domain at all |
| `components/site/guest-house-map.tsx` | **`GuestHouseMap`** (client): WAI-ARIA tabs, one per pin, and the chosen embed. **Nothing under it** since 27 Oct 2026 - the name repeated the tab above it, and the embed carries its own "View larger map" and directions |
| `components/site/sign-in-panel.tsx` | `PageTitle` + the door (or "You are signed in"). **One shape since 28 Oct 2026**: a narrow `max-w-[560px]` panel **centred**, for all three doors. `photo` is accepted and deliberately unused - the split-screen shape is three lines away |
| `components/login-form.tsx` | **One button and no fields** (28 Oct 2026): *Sign in* into `/mock-login?next=`, or *Sign in with Google* with the mark once configured, plus one line of explanation and the optional `footnote`. It is a server component now - there is no state left to hold. `signInWithLdap` is untouched and simply has no caller |
| `components/page-header.tsx` | Portal page title: a tracked vermilion caption, serif `h1`, description, optional `actions`. **No rule under it** since 28 Oct 2026 - `rule-title` is deleted |
| `components/section-heading.tsx` | `SectionHeading` (serif `<h2>`, the count as a **serif figure after a colon** - "Current bookings: 3", 28 Oct 2026 - vermilion with `tone="alert"`, description, action) and `EmptyState`. **No leader rule** since 28 Oct 2026 |
| `components/link-tabs.tsx` | `LinkTabs` — page-level tabs that are links, the current one **filled ink** (28 Oct 2026; it was a 3px vermilion bar over a hairline), `aria-current` (the desk's guest-house switcher) |
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
<club>** per club a Faculty Advisor books for. Both tiles read the same paths
the nav does (`ROOM_BOOKING_PATH` / `MEAL_BOOKING_PATH`).

**Then three sections, not one table** (17 Oct 2026, the owner): **Current
bookings**, **Upcoming bookings** and **Previous bookings**, each a
`SectionHeading` with its own count and a one-line `EmptyState` when empty.
Which section a booking falls in is `lib/my-bookings.ts` - status first, dates
second. Previous draws **five** rows, compact (one **Stay** column, no Rooms),
with **Show all N** under it and **All booking history** as the heading's
`action`; its count is the whole section, not the slice. The single "Your
requests" heading that used to stand over the one table is gone with it.

## The pages

- **Home** — see "The Taramani pass" (28 Oct 2026) and "The landing page
  becomes cinematic" (27 Oct 2026) above:
  a **full-viewport hero** (two photographs, a 66% ink wash, the saffron
  kicker, the `<h1>`, one sentence and two solid doors centred over it, the
  opaque charcoal masthead laid over the top of it), then **Amenities** as
  one centred ruled strip of six, **A look inside** as six photographs in two
  unequal bands linking the Gallery, **Our guest houses** as two centred
  **text-only** cards, and **Contact us** - the manager's line, email and
  address as one ruled band of three, then a map each. No figures, meal
  times, rules or captions.
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
- **Contact** — light masthead; the number labelled **Guest House Manager**
  (14 Oct 2026, the office; it read "Front office", and
  `GUEST_HOUSE_CONTACT.phoneLabel` is now the one wording, shared with the
  home page's **Contact us** section and the footer), email, address and a
  Bookings note (online only — the lecture-hall sentence came off on
  7 Oct 2026); **Finding the guest houses** with the map tabs in a rounded
  card, and **nothing printed under the map** since 27 Oct 2026.
- **Sign in / Book a room / Book meals** — **the same centred panel** since
  28 Oct 2026: kicker, title, one line of lead, **one button** into the
  account picker (or Google, once configured), one line under it, and each
  page's own footnote. No photograph, no fields, no mention of LDAP.
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
   **One named exception, 14 Oct 2026:** the phone number on the contact page,
   the home page and the footer is labelled **Guest House Manager**, because
   the office asked for it - a post a guest telephones, not a stage in a
   pipeline, and the address beside it was already `ghm@`. Assistant Warden,
   HOD, IAR and Faculty Advisor stay off every public page, and the test still
   fails if one reaches `BOOKING_STEPS` or `guidelineSections`.
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
**`GUEST_HOUSE_CONTACT`** - read by `/contact`, the Guidelines, the site
footer, the portal footer and, since 27 Oct 2026, **the home page's Contact
us section** (its masthead carried the number until 15 Oct 2026, which is a
different thing: this is a contact section, not a line under a headline). **`INSTITUTE_MAP`**,
`guestHouseMapPins()`, the photo registry (`PHOTOS`;
`HOME_PHOTOS` — now only the four-photo `preview`, `hero` having gone with the
15 Oct hero; **`SIGN_IN_PHOTOS`** — the photo beside each sign-in page's form;
`GALLERY_SECTIONS`; and **`GUEST_HOUSE_PHOTOS` / `guestHousePhoto(name)`** —
the photograph that stands for one guest house, slug-keyed like the map pins,
read only by the home page's house panels). `GUEST_HOUSE_PHOTOS` existed
before, was **removed** when the home page's guest-house cards lost their
photographs, and came **back** on 15 Oct 2026 when the owner attributed two
photographs — this time with the attribution, not just the slot. `grep -rn "TODO(site)"` lists everything awaiting the
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

**Two sets, 25 photographs.**

- **19 Sep 2026 originals:** `Images/` in the repo root — 14 Sony A7 III
  JPEGs, 6000×4000, 10–18 MB each (~180 MB). **Gitignored** (`/Images/`);
  never serve them.
- **15 Oct 2026 originals:** `Photos/` in the repo root — 11 JPEGs, already
  1600px and 180–570 KB (3.4 MB in all), so **not gitignored**: the folder is
  small enough to keep beside the served copies, unlike `Images/`.
- **Served copies:** `public/site/photos/*.jpg` — **at most** 2000px long edge
  (the 15 Oct set came in at 1600 and `thumbnail()` never upscales), quality
  80, progressive, EXIF orientation applied and **metadata stripped**. 3.5 MB
  for the 19 Sep fourteen, 1.9 MB for the 15 Oct eleven. `next/image` then
  serves per-width variants (a 168 KB file goes out at ~18 KB for a 640px
  slot).
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
- **Two photographs are attributed; twenty-three are not** (15 Oct 2026). The
  owner named `hamsanandi-courtyard.jpg` and `bageshri-front.jpg` as the main
  photograph of each guest house, and **those two only** are tied to a name,
  in `GUEST_HOUSE_PHOTOS`, read by the home page's two house panels. The
  mosaic, the Gallery, the sign-in photographs and every alt text stay
  unattributed; `GALLERY_SECTIONS` is still grouped by **subject** (Exterior
  and grounds, Rooms and suites, Common spaces).
  **The rule was never "photographs may not be named"** — it was *do not
  publish a guess*. The 19 Sep set arrived with nothing saying which building
  it showed; the 15 Oct set came with the owner saying so for two of them. So
  the rule moved for those two and stands for the rest: **do not attribute a
  photograph without the office confirming it**. When they confirm the whole
  set, the Gallery can be grouped by guest house (`GALLERY_SECTIONS` carries
  the `TODO(site)`).
  **Noted, not acted on:** the 19 Sep exteriors are plainly the same ochre
  blocks and paved courtyard as `hamsanandi-courtyard.jpg`, and the set matches
  the iitpkd.ac.in description of Hamsanandi (blocks A–D, units with hall and
  kitchen, a 50-seat meeting room). That is still an inference, so it lives in
  this paragraph and not in the code.
- Gallery grids use `auto-fill`, not the design's `auto-fit`: with only two
  Common-spaces photos, `auto-fit` stretched each to half the page width.
- Alt text describes what is visible, not marketing ("Bedroom with double bed,
  bedside table and work desk"). Gallery tiles link to the full-size file.

## Deliberately not built

| From the prototype | Why not |
| --- | --- |
| "Keep me signed in", "Forgot password" | The mock session has neither; a control that does nothing is worse than none. Real auth brings both |
| The prototype's meal-only flow ("Meal requests close the previous evening", "attach to your room booking automatically") | Built differently since: **Meals only** is a service type inside `/book` (Phase 6, reworked 23 Sep 2026 as a set of dates with the kitchen's notice period — a meal must be booked before the previous one finishes being served). `/book-meal` explains it and signs in to `/book/meals` (17 Oct 2026; `?service=meals_only` still works). Nothing is "attached" to a room booking automatically |
| A rate card on the public site | Rates live in Tariffs & Invoicing and change by date. The Guidelines page has a **"Charges and settlement"** card (Phase 10) built from the invoice Settings: the day basis, the grace hours, and that **the tariff includes GST** |
| "Requests at least seven days in advance", "Check-in from 12:00 noon / check-out by 11:00" | Contradict the backend: the window is a *maximum* (six months since 14 Oct 2026, one before), not a minimum, and times are chosen per booking |
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
  [22-running-and-testing.md](22-running-and-testing.md#verifying-changes)): a gmail address is
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

**Moved to [03-roadmap.md](03-roadmap.md) §8**, which is the one list of what
is open - the `TODO(site)` items, the mail templates' pre-26-Sep amber header,
SSO on the booking pages, and the superseded `ui` branch. They were listed
here and there, and the two drifted.

What this file still owns is **[Deliberately not built](#deliberately-not-built)**
- which of the prototype's features were left out, and why. That is a design
record, not an open item.

## The sixteenth list on screen (4 Nov 2026)

- **Guidelines page:** a **Dos and don'ts** section (`DOS_AND_DONTS`, fixed copy),
  and the masthead button is **Guidelines document**, to `rules.policy.guidelines_url`,
  falling back to `GUIDELINES_PDF_URL`. The cancellation line states the notice.
- **Booking page's right column** (`components/booking-sidebar.tsx`): Room tariff,
  Catering timings, Guidelines. The meal door keeps `TariffPanel` for its meal rates.
- **Availability** shows a bare figure and "rooms available": no `/total`, no meter,
  no "of N". The console header says only how many are available.
