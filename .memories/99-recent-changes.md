# Recent changes - the last round, and only the last round

This file is **replaced** every round, not appended to. The round before this
one is written up where every round is: what was asked in
[01-background.md](01-background.md), why it was done that way in
[02-decisions.md](02-decisions.md).

---

## Round of 11 October 2026 (second) - the owner's design pass

The owner, on the portal and the site as they stood after the eleventh list:

> The current site looks too meh, bland as well as looks too ai generated
> [give the claude generated look]. The current UI looks generic and
> recognizably AI-generated. I want a distinctive, aesthetic, professional
> interface that feels purpose-designed for an IIT campus guest house.

With the brief: the institute's own palette, distinctive typography and
spacing, **no generic AI dashboard patterns, excessive rounded cards,
gradients, decorative icons, unnecessary badges or repetitive layouts**, a
welcoming booking journey and dense, efficient approval / reception /
allocation screens, minimal text, no em dashes, and consistency without
forcing every page into one layout. Stack, backend, workflows, rules,
authorisation and responsive behaviour all unchanged.

**No migration, no Setting, no server action, no rule.** Two copy deletions
and one e2e selector; everything else is layout and type.

### What was found, before anything was changed

The palette was **not** the problem. iitpkd.ac.in's theme CSS was pulled and
counted again (`themes/iitpkd/css/*`): `#e94c26` 22 times, then `#fff`,
`#333`, `#ededed`, `#1a1a1a`, with Source Serif Pro headings. The portal
already matches it. What read as generic was **composition**, and it was
measurable:

| Screen | What it actually was |
| --- | --- |
| Manager console | Seven tiles 110px tall reading 0, then six near-identical stacked sections, four of them 90px dashed "nothing here" boxes. The one row with work in it sat 1300px down the page |
| Approval Log | Six status tiles in a five-column grid, leaving Missed alone on a second row |
| My Bookings | A 1150 x 180 slab of vermilion carrying two lines of type, with a void in the middle of it |
| Room Availability | Twenty bordered cards, nineteen of them reading "Free all week - available to book", 1100px tall |
| Home | `lg:ml-[calc(25%+10px)]` left a quarter of every section empty holding a six-word label; the hero broke its headline over three lines in a 371px panel |
| Approver queues | A **Status** column repeating the one status the queue filters on, which pushed Forward and Reject past the right edge of a 1440px page |

### 1. A named type scale, and the institute's own devices

`--text-display / title / section / card / meta` in `@theme inline`
(`app/globals.css`), five steps and nothing between them. Headings used to be
written as one-off `clamp()` values where they were used, which is how eight
sizes of heading reached one page.

Two utilities, both taken from iitpkd.ac.in rather than invented:

- **`rule-title`** - `h1.node-title { border-bottom: solid 1px #e94c26 }`, with
  a 3px vermilion stub over the start of the rule. Every portal page title
  closes on it (`PageHeader`). It replaced a 2px **ink** rule, which was the
  same mark the tables use for their header row, so a page and a table in it
  opened identically.
- **`figure-serif`** - the institute's `.counters` treatment. Every figure
  meant to be compared (a queue's count, the log's totals, the desk's index)
  is the serif with tabular numerals.

> **The trap this round cost an hour on.** tailwind-merge classifies an
> unknown `text-<word>` as a **colour**, so `cn("text-title", "text-ink")`
> dropped `text-title` as the losing half of a colour conflict and three home
> page headings silently rendered at 16px. `lib/utils.ts` now builds `cn` with
> `extendTailwindMerge` and the five step names registered under `font-size`.
> Add any new `--text-*` step to `TYPE_STEPS` there as well.

### 2. The primitives, which carried the change to every page

| Primitive | Before | Now |
| --- | --- | --- |
| `PageHeader` | 2px ink rule, grey caption sentence | `rule-title`, caption as a tracked vermilion label |
| `SectionHeading` | Count in a filled square tag | Count as a serif figure, vermilion when it is a list to chase, with a leader rule running to the far edge. The rule, not a box, separates one list from the next |
| `EmptyState` | A dashed box 90px tall | One quiet line on a left hairline. **22 of them replaced** across 16 files |
| `Card` | Header in its own band-tinted strip | Title over a hairline on the same white as the body |
| `DeskSummary` | Seven tiles 110px tall | A ruled index: label, leader rule, figure, on one 44px baseline. A zero is small and grey; a count that is not is the serif at display size. **Order never re-sorts on the count** - it is read all day by the same two people |

### 3. The desk, the queues and the log

- **Approver queues** (`ReviewQueue`, used by `/warden`, `/hod`, `/approvals`,
  `/iar`) lost the **Status** column - every one of those pages lists exactly
  one status - and check-in / check-out became one **Stay** cell with both
  instants, one above the other. The table now measures 1150px inside a 1150px
  container: **Review, Forward and Reject are all reachable without scrolling
  sideways.** Nothing was dropped but the repetition.
- **Approval Log** tiles are one ruled band of six. Six divides into 2, 3 and
  6, so no breakpoint orphans one, and the active tile is ink-filled.
- **Room availability**: the twenty room cards are a table. A free room says
  nothing at all - a dash - so the booked rooms are the only ink on the page.
  The page lost 600px.
- **The allocation dialog puts the grid first** and the record under it. The
  grid already carries the stay's period and "N of M requested", and the
  description names the requester, so a manager now sees the seats, the
  summary and **Confirm & Allocate** without scrolling past a meal table, a
  guest table and the approval trail.
- **Users & Roles**: name over email in one **Account** cell, role as plain
  text. The eight-column table was pushing its own actions off the page.
- **Badges**: `BookingDetails` opened on six - status, role, booking type,
  service, diet split, foreign national. Only two are states: the status keeps
  its colour, a **foreign national** keeps a mark (the guest house has to
  report one), and the rest are a line of plain text. The manager queue's
  Category column is plain text too; an official request is already marked by
  the saffron rule and the tinted row.

### 4. The requester's side

- **My Bookings**: the booking door is sized to its content - icon, title,
  one line, arrow, on one row. It is a little over half as tall. The
  `caption={user.full_name}` came off, since the masthead already names
  whoever is signed in.
- **The booking form**: the pay-at-checkout note is an inset line, not a
  numbered card. The office asked on 8 Oct for the note itself to be kept, and
  it is; but a numbered section is a thing to fill in, and a student's form
  opened on two sections before the first question. **Six sections now, not
  seven.** The Requester details panel is **sticky from `lg`**: the form runs
  to about 2800px and the record is what a field is checked against.

### 5. The public home page

Recomposed, with every standing content rule kept (no figures, no role names,
no captions, photographs contained, promise little):

- `SectionHead` puts the label and any link on one line **above** a full-width
  hairline, with the serif heading under it. The quarter-column indent is gone
  from all three sections, so content runs the full width.
- The hero is **6 + 6**, not 5 + 7, and the headline is on the display step:
  two lines, not three.
- The guest-house cards lost the "GUEST HOUSE" strip - the section above is
  headed "Our guest houses" - keeping only whether the kitchen serves.
- Amenity cells are roomier now that the grid has the whole page.

### 6. Three page leads deleted

`/manager`, `/caretaker` and the kitchen day view each opened on a sentence
restating the title under a caption that already carried the scope. The rule
from 9 Oct 2026 is that a lead carries the scope or nothing.

---

### Files changed

34 files. `app/globals.css` (the scale and the two utilities), `lib/utils.ts`
(the tailwind-merge fix), the five primitives above, `components/
{manager-queue, review-queue, checkouts-today, availability-grid,
booking-history, booking-details, booking-form, my-bookings, caretaker-console,
booking-availability}.tsx`, `components/admin/{users-manager, audit-log,
bookings-manager, guest-houses-manager, mail-outbox, projects-manager,
units-manager}.tsx`, `components/site/site-ui.tsx`, `app/(site)/page.tsx`,
`app/(portal)/{dashboard, book, manager, manager/meals, caretaker,
history}/page.tsx`, and three e2e specs.

### How it was checked

`npm run lint`, `npm run typecheck`, **`npm test` (462 checks, 27 files)**,
`npm run build`, and **`npm run test:e2e` (38 journeys, all passing)** against
a production build on the mock store.

Visually, on a dev server on the mock store: every main page screenshotted
before and after at 1440px, and **every public and portal page measured at
320px** - `scrollWidth` 320 and exactly one `<h1>` on all thirteen. Every
portal table was measured against its container at 1440px: all of them now sit
at or inside it, where three were overflowing.

Three e2e selectors moved with the markup, none of them a behaviour change:
the pay-at-checkout assertions now read the sentence rather than a card
heading it no longer has, and the user-import assertion matches the merged
Account cell by its text (matching the address alone also hit the row's tick
box, whose label names the account).

### Left open

In [03-roadmap.md](03-roadmap.md) §2d: the console's other thirteen sections
were not gone through one by one - they inherit the primitives, the scale and
the empty state, and Users & Roles was the only one whose table was measured
and fixed. The booking form's "Type of booking" card still renders for a role
with one option, which is a numbered section with nothing to answer.
