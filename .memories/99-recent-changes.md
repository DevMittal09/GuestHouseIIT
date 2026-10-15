# Recent changes - the last round, and only the last round

This file is **replaced** every round, not appended to. The round before this
one is written up where every round is: what was asked in
[01-background.md](01-background.md), why it was done that way in
[02-decisions.md](02-decisions.md).

---

## Round of 15 October 2026 - the office's photographs, and a landing page built around them

> **The round before this one** (14 Oct 2026) withdrew the privacy notice into
> `archive/privacy-notice/`. Nothing here touches it.

The owner sent eleven photographs in **`Photos/`** at the repo root and asked
for the landing page to showcase two of them - **`8.jpeg` Hamsanandi** and
**`10.jpeg` Bageshri**, "the main photos" of each house - with `4`, `6`, `7`
and `1` following them, the rest in the Gallery, and the whole thing "similar
but not exact copy" of iitpkd.ac.in, "professional, aesthetic and not look too
ai generated".

**No migration, no store operation, no schema change.** One new registry, one
page recomposed, eleven files added under `public/site/photos/`.

### 1. The two decisions that were the owner's to take

Both were put to the owner before anything was deleted or attributed:

| Question | Answer taken |
| --- | --- |
| The 14 photographs already served - replace them, or keep them? | **Keep**, in the Gallery. The new set leads; the old covers the bathroom, meeting hall, lounge and gazebo, which the new set has no equivalent of |
| May a photograph say *which* guest house it shows? | **Yes, on the two home-page cards only.** The Gallery stays grouped by subject, and nothing else is attributed |

The second reopens a standing rule - see
[02-decisions.md](02-decisions.md), "Photos: resized copies served, originals
ignored, no attribution", now carrying a *Partly superseded* note.

### 2. The photographs

All eleven converted into `public/site/photos/` by the recipe in
[14-public-site-and-ui.md](14-public-site-and-ui.md) - one process per file,
EXIF orientation applied, **metadata stripped**, progressive JPEG at quality
80. They arrived at 1600px, so nothing was upscaled; 91-331 KB each, 1.9 MB
for the set.

| Source | Served as | Where it is |
| --- | --- | --- |
| `8.jpeg` | `hamsanandi-courtyard.jpg` | **Hamsanandi's card**, Gallery |
| `10.jpeg` | `bageshri-front.jpg` | **Bageshri's card**, Gallery |
| `7.jpeg` | `hamsanandi-block.jpg` | Home mosaic (the large one), Gallery |
| `6.jpeg` | `double-bedroom.jpg` | Home mosaic, Gallery |
| `4.jpeg` | `kitchenette.jpg` | Home mosaic, Gallery |
| `1.jpeg` | `twin-room.jpg` | Home mosaic (wide), Gallery |
| `9.jpeg` | `hamsanandi-block-entrance.jpg` | Gallery |
| `2.jpeg` | `bageshri-corridor.jpg` | Gallery |
| `3.jpeg` | `sitting-room.jpg` | Gallery |
| `5.jpeg` | `living-dining.jpg` | Gallery |
| `11.jpeg` | `room-study-desks.jpg` | Gallery |

`Photos/` itself is **not gitignored** - unlike `Images/`, these are already
web-sized, so the folder is small enough to keep beside the served copies.

### 3. `GUEST_HOUSE_PHOTOS` - the first attribution on the site

```ts
export const GUEST_HOUSE_PHOTOS: Record<string, SitePhoto> = {
  hamsanandi: PHOTOS.hamsanandiCourtyard,
  bageshri: PHOTOS.bageshriFront,
};
export function guestHousePhoto(name: string): SitePhoto | null
```

Keyed by `guestHouseSlug(name)`, exactly as `GUEST_HOUSE_LOCATIONS` is, and
read **only** by the home page's house cards. A house the registry does not
name renders `SitePhotoFrame`'s placeholder rather than borrowing another
house's photograph - so renaming a guest house in the console takes its
photograph off the card until the registry learns the new name, the same way it
takes its map pin off `/contact`.

### 4. The landing page is now built around the two houses

The hero and the old **"Our guest houses"** section are **one bordered block**:

- the ink panel across the top - headline in seven columns, the lead and *Book
  a room* / *Book meals* in five, the Guest House Manager's number on a rule
  under them;
- beneath it, **one panel per guest house**: its photograph at 3:2 across half
  the page, then `Rooms & dining` / `Rooms`, the house name as an `<h2>`, what
  it offers, and *Book a room*.

Gone with the merge: `HOME_PHOTOS.hero` (the page no longer has a decorative
hero photograph) and the heading **"Our guest houses"**, which repeated the
`<h1>`. The rest of the page is unchanged in structure - amenities, the
four-photo mosaic under *A look inside*, the closing ruled links - and
unchanged in rule: no figures, no meal times, no role names, no captions.

**What was taken from iitpkd.ac.in** is its card idiom - the image above, its
title printed underneath, never laid over it - and its rhythm of a banner, then
cards, then a thumbnail row. **What was not** is the five-slide hero slider: it
would hide half of what it was asked to showcase behind a control, needs a
client component, and reads as a template.

Hairlines between the house panels are each panel's **own borders**
(`md:odd:border-l-0`), not the `gap-px` over a coloured ground the amenities
grid uses - with an odd number of guest houses that ground shows through the
empty cell.

### 5. The Gallery holds everything

`GALLERY_SECTIONS` still groups by **subject**, with the 15 Oct set first
inside each group and the 19 Sep set after it: 9 exterior, 14 rooms and
suites, 2 common spaces - **25 photographs**, up from 14.

### Files

**New:** eleven files in `public/site/photos/`; `Photos/` (the owner's).

**Changed:** `lib/site.ts` (eleven `PHOTOS` entries, `GUEST_HOUSE_PHOTOS`,
`guestHousePhoto`, `HOME_PHOTOS.preview`, `HOME_PHOTOS.hero` removed,
`GALLERY_SECTIONS`), `app/(site)/page.tsx` (the hero block and the new
`HousePanel`), `tests/public-site.test.ts` (+6 tests).

**Unchanged:** `SIGN_IN_PHOTOS` and every sign-in page, `/gallery`'s own
component, `lib/site-content.ts`, every store, the portal.

### How it was checked

- `npm run lint`, `npm run typecheck` - clean.
- **`npm test` - 561 passing, 33 files** (555 before; six new in
  `tests/public-site.test.ts`), including one that fails if any photograph in
  `PHOTOS` is served but reachable from nowhere, and one that fails if a
  home-page alt text names a guest house.
- `NEXT_PUBLIC_SUPABASE_URL= npm run build` - clean.
- **`curl` against a mock-store dev server**: `/` is 200 with exactly one
  `<h1>`, both houses named as `<h2>`, and the six expected photograph files;
  `/gallery` is 200 and references 25.
- **`npx playwright test e2e/public-site.spec.ts` - 8 passing**, desktop and
  the 320px phone project, so the new hero does not push the page sideways at
  the narrowest width supported.

### Left open

- **The home page lists the houses in the store's order**, which seeds
  Bageshri first, while `/contact`'s map tabs list Hamsanandi first (the
  registry's order, "as the owner listed them"). Now that the houses are the
  hero this reads as an inconsistency. Fixing it means either reordering the
  seed or sorting the cards by the photo/pin registry - the owner's call.
  [03-roadmap.md](03-roadmap.md) §2h.
- **The 19 Sep photographs are still unattributed**, although their exteriors
  are plainly the same blocks as `hamsanandi-courtyard.jpg`. When the office
  attributes the whole set, `GALLERY_SECTIONS` can be grouped by guest house -
  the `TODO(site)` on it says so.
- `GUEST_HOUSE_PHOTOS` is **not editable from the console**, like
  `GUEST_HOUSE_LOCATIONS` beside it. A guest house created in the console gets
  no photograph until someone adds a line.
