# Implementation

What exists today, with file paths.

## Entry and session

| Concern | File |
| --- | --- |
| Login (persona picker) | `app/page.tsx` |
| Login / logout actions | `app/actions/auth.ts` (`loginAs`, `logout`) |
| Session read | `lib/auth.ts` (`getCurrentUser`, `requireUser`) |
| Post-login landing per role | `lib/routes.ts` (`homeForRole`) |
| Authenticated shell + nav | `app/(portal)/layout.tsx` |

Nav links are role-aware: requesters see Dashboard / New Booking / Booking History,
reviewers see their queue + Approval Log, the manager sees the console +
Approval Log, the developer sees `/admin` + Approval Log. **Room Availability is
shown to every role**, between the role-specific links and the log.

## Booking submission

- **Page:** `app/(portal)/book/page.tsx` — loads the effective form config, then
  filters guest houses to those the role may book.
- **Form:** `components/booking-form.tsx` — renders entirely from the config:
  fields appear, become optional, or vanish per `FieldMode`; relationship is a
  dropdown or a text input; custom fields render in an "Additional information"
  card; the alumni upload card appears only when not hidden.
- **Validation:** `lib/booking-schema.ts` builds a zod schema *from the config*,
  used on both sides. Custom-field values are validated by
  `validateCustomValue()` in `lib/form-config.ts`.
- **Action:** `createBooking` in `app/actions/bookings.ts` — re-derives the config
  server-side, re-validates, enforces the guest-house permission and the official
  email whitelist, validates each upload (5 MB; JPG/PNG/WEBP/PDF), stores
  documents, then writes the booking with its guests and initial status.

Two panels sit between the stay details and the guest list:

- **Room availability** (`components/booking-availability.tsx`) — the same
  hour-by-hour chart as `/availability`, for the guest house and check-in date
  currently chosen, so a requester is not picking dates blind. It calls the same
  `getDayAvailability` action, which strips guest identity for non-staff, so it
  answers *when* rooms are taken and never by whom. The chart itself lives in
  `components/occupancy-chart.tsx`, shared with `/availability`.
- **Meals** — breakfast / lunch / dinner checkboxes with serving times, always
  optional, summarised in a line under them. Stored as `bookings.meals`; see
  `lib/meals.ts`.

Guest count is dynamic (1–15) via `useFieldArray`. Each guest row past the first
carries a **Remove guest N** button — a real destructive-styled button with a
trash icon above the fold of the fieldset, not the ghost text it used to be,
which read as a label rather than a control. Uploaded files are held in a
`Map` keyed by field-array row id, outside react-hook-form, because `File`
objects do not belong in form state.

**Counts use `components/ui/quantity-input.tsx`**, not a raw number input —
guests, rooms and infants. It keeps the typed string so the box can be cleared
and retyped; the old `Number(value) || 1` pattern made it uneditable. The guest
count is its own `useState` string rather than being read off `fields.length`,
and the field array is resized only once a valid number is present. An empty box
blocks submit with "Number of guests is required".

Three policy rules are applied here as well as in the schema:

- **Room capacity.** A hint under the room count says what a double sleeps and
  how many beds the chosen rooms give. The guest-count input is **capped at
  what those rooms sleep plus the infants already marked**, and a live summary
  band shows beds needed vs available and how many extra beds that implies.
  `requestedRoomsError` in the schema is what actually enforces it.
- **Infants.** A checkbox on each guest row, not a separate count. Ticking it
  hides that guest's ID number and ID document fields, exempts them from the
  upload requirement on both sides, and frees a bed slot so one more guest can
  be added. Their name, age and gender stay required, and the age must be under
  `INFANT_AGE_LIMIT`.

- **Relationship dependency.** The form watches every guest's relationship with
  `useWatch` (never `watch()` — React Compiler lint). Until some guest is marked
  Mother or Father, the Grandmother / Grandfather / Siblings options render
  `disabled` and greyed, each labelled "— needs a parent on this request", with
  an amber hint above the guest list. The gating is cosmetic; the enforcement is
  `parentDependencyError()` inside the zod schema, which attaches the message to
  every offending guest row.
- **Advance-booking window.** `latestCheckIn(config.role)` sets `max` on the
  check-in date input and prints the last bookable date under it. For
  `official` the helper returns null, so no `max` is emitted at all.

Both limits are computed once in a `useState` initializer rather than on every
render, so the value cannot drift mid-session.

Dates use a native date input; **times use `components/ui/time-select.tsx`** —
three dropdowns (hour / minute / AM-PM). See
[07-troubleshooting.md](07-troubleshooting.md) for why native time inputs are
banned.

## Requester dashboard

`app/(portal)/dashboard/page.tsx` + `components/my-bookings.tsx`: the user's own
bookings, current status, assigned rooms once approved, rejection reason when
rejected, and the full status history. Cancellation is allowed while a booking is
still pending (`cancelBooking`). For already-approved bookings, the requester can
submit a **cancellation request** (`requestCancellation` in
`app/actions/bookings.ts`) with a mandatory reason — this sets the status to
`CANCELLATION_REQUESTED` and the GH Manager reviews it.

## Reviewer portals

One component, three scopings — `components/review-queue.tsx`, rendered by
`app/(portal)/warden|fa|iar/page.tsx`. Each shows the pending queue for that
tier, full booking details, guest list with ID documents, and Approve / Reject
with a mandatory reason on rejection. The IAR view embeds the alumni ID card.

Scoping is applied in the store query *and* re-checked in `canReview()` inside
`reviewBooking`, so a crafted request cannot approve another hostel's student.

## Guest house manager console

`app/(portal)/manager/page.tsx` + `components/manager-queue.tsx` +
`components/room-grid.tsx`.

- Tabs per guest house, built from the database (not hardcoded); the
  zero-guest-house case is handled explicitly.
- Official bookings are highlighted and sorted to the top.
- Selecting a booking opens the allocation grid, which shows occupancy **for
  that booking's own dates only**, then **Confirm & Allocate** → `allocateRooms()`
  assigns rooms and flips the booking to `APPROVED` atomically, re-checking
  clashes. The grid used to have its own date/time pickers; shifting them turned
  rooms green that were actually taken for the stay, so the manager was being
  offered rooms already allotted to someone else. Occupied rooms are rendered
  `disabled` and cannot be picked at all.
- Rejection requires a reason.
- The allocation panel shows the party size, what the selected rooms sleep, and
  refuses to confirm while the selection is too small
  (`allocationCapacityError`). Infants are excluded from the head count.
- **Stays are grouped by phase, not status**, into three tables — **Current
  occupants** (check-in passed, check-out not reached), **Awaiting check-out**
  (past check-out, never marked Vacated, still holding rooms) and **Upcoming
  stays**. One combined "Upcoming & current stays" table used to mix them, so a
  booking for next week sat beside a guest in the building and read as occupied.
  `stayPhase()` in `lib/workflow.ts` is the rule.
- **Post-approval lifecycle controls**: the manager can mark a booking as
  `OCCUPIED` (checked in), `VACATED` (checked out), or `CANCELLED`. These
  transitions use `updateBookingLifecycle` in `app/actions/bookings.ts`, and the
  store releases the room holds automatically for any status outside
  `ROOM_HOLDING_STATUSES`.
  - **`OCCUPIED` is refused before check-in** (`occupancyNotStartedError`),
    server-side, with the button disabled from the same function and labelled
    "Available from check-in". Occupancy is a fact recorded at the desk, not
    something a date implies.
  - The two lifecycle buttons carry **distinct colours** — green for "Mark as
    Occupied", indigo for "Mark as Vacated" — because they are what the manager
    clicks all day and telling them apart at a glance matters more than matching
    the palette. Vacated was previously the neutral secondary button.
- Each stays row shows the booking's **meals** alongside its rooms.
- **Cancellation request review**: when a requester submits a cancellation
  request for an approved/occupied booking, the manager can approve or reject it
  via `approveCancellation` / `rejectCancellation` in `app/actions/bookings.ts`.

Queue pages poll every 5 s via `components/auto-refresh.tsx`, which
`components/tab-session-guard.tsx` suspends when the tab's claimed identity no
longer matches the signed-in user.

## Room availability grid (`/availability`)

Open to **every signed-in role**; the nav link reads "Room Availability" for
everyone. `app/(portal)/availability/page.tsx` (server, lists guest houses) +
`components/availability-grid.tsx` (client).

| Concern | File |
| --- | --- |
| Page shell + guest house list | `app/(portal)/availability/page.tsx` |
| Chart, date picker, room list | `components/availability-grid.tsx` |
| Data fetch + identity stripping | `app/actions/availability.ts` (`getDayAvailability`) |
| Hour bucketing, day bounds, labels | `lib/availability.ts` |
| Store query | `listRoomOccupancy` in `lib/store/mock.ts` + `lib/store/supabase.ts` |

The chart is a CSS grid: `4.5rem` for the hour axis then one
`minmax(2.75rem, 1fr)` column per room, wrapped in `overflow-x-auto` with the
hour column and the room-number header both sticky. Each cell is an hour × room,
red when held and blank when free, with a `title` naming the booking. When the
selected date is today the current hour is marked in the brand amber.

Underneath, a per-room list gives the room number, type, a Vacant / Partly
booked / Occupied badge, and each booking period in full. That list is also the
non-colour channel for the chart, which matters because the roadmap flags
colour-only signalling as an accessibility gap.

**What each role sees.** `getDayAvailability` fills `requester_name` and
`purpose_of_visit` only for `gh_manager` and `developer`; every other role gets
the period, the reference id and the status. Rooms deactivated after a booking
was allocated are filtered out, so no segment can point at a column that is not
drawn.

Polling is off on this route (`NO_POLL_PREFIXES`): the component fetches its own
data client-side, so a server refresh would do nothing but work. There is a
manual Refresh button instead.

## Booking history & approval log (`/history`)

Accessible to **all roles**. `app/(portal)/history/page.tsx` (server) +
`components/booking-history.tsx` (client). The nav link reads "Booking History"
for requesters and "Approval Log" for approver/admin roles.

**Role-based views:**

| Role type | View | Toggle |
| --- | --- | --- |
| Requesters (student, employee, etc.) | Own bookings only | No toggle — always shows all own bookings |
| Reviewers (warden, FA, IAR) | Own decisions (default) or full jurisdiction archive | "Handled by me" / "Everything in scope" |
| Admins (GH manager, developer) | Full archive (default) | "Handled by me" / "Everything in scope" |

**Scope is not negotiable.** `historyScope(user)` in `lib/workflow.ts` is the
archive counterpart to `canReview()`:

| Role | Sees |
| --- | --- |
| student/employee/official/club/alumni | only their own bookings (`userId` scope) |
| warden | `userRole: student` + their own `hostel_name` |
| faculty_advisor | `userRole: club` + their own `department_or_club` |
| iar_cell | `userRole: alumni` |
| gh_manager / developer | everything (every booking reaches the manager) |

`criteriaFromParams()` spreads the scope **last**, so a hand-edited query string
can only ever narrow the result set, never widen it. A warden with no
`hostel_name` gets an explanatory empty state rather than the whole archive.

**Search methods** (`lib/booking-search.ts`):

- bare keywords — matched against reference id, requester, guests, rooms,
  purpose, guest house, role label, rejection reason, custom-field answers *and*
  the audit-trail remarks;
- `field:value` prefixes — `ref:` / `id:`, `guest:`, `room:`, `by:` /
  `requester:` / `email:`, `purpose:`, `gh:` / `house:`, `status:`;
- `"quoted phrases"`, with or without a prefix;
- multiple tokens are **AND**ed, matching is case-insensitive substring;
- an unknown prefix (`http://…`) is kept as literal text rather than silently
  dropping the token.

Alongside the box: status tiles, guest house, requester category (only where the
scope does not fix it), a check-in date range, and sort. All of it lives in the
query string, so a search is bookmarkable and shareable.

**Check-in range** pairs two chip rows with the two date inputs, from
`DATE_PRESET_GROUPS` in `lib/booking-search.ts`:

| Group | Chips |
| --- | --- |
| Rolling | Today · Next 7 days · Next 30 days · Last 7 days · Last 30 days · Last 90 days |
| Calendar | This week · Last week · This month · Last month · This quarter · Last quarter · This year · Last year |

`resolveDatePreset` turns a chip into a `from`/`to` pair and `matchDatePreset`
lights up whichever chip the current params equal, so picking dates by hand and
picking a preset are the same piece of state. Clicking the lit chip clears the
range, and each chip's `title` shows the dates it resolves to — which is what
makes "Last 30 days" and "Last month" distinguishable at a glance.

Forward-looking ranges exist because a guest house cares about arrivals that
have not happened yet, not only the archive; calendar periods run to the end of
the period for the same reason.

**Status tiles** — Total / Approved / Rejected / In progress / Cancelled. They
are also the status filter (click to apply). Their counts are *facet counts*:
computed while ignoring the status filter but honouring every other filter, so
the tiles never collapse to zero once you click one.

**CSV export** — `exportHistoryCsv()` in `app/actions/history.ts`. The client
sends only the query string; the action re-derives the user, re-applies
`historyScope`, and re-parses the params server-side, so an export can never
exceed what the caller may see. Capped at `HISTORY_EXPORT_LIMIT` (5000) rows.
Cells that start with `= + - @` are prefixed with an apostrophe — every text
field is user-supplied and spreadsheets execute formula cells.

**PDF report export** (GH Manager and Developer only) — two halves:

- `exportHistoryPdf()` in `app/actions/history-pdf.ts` returns **data, not
  markup**: pre-formatted `ReportRow`s plus a scope subtitle, a human-readable
  filter list, status counts and totals (bookings, guests, infants,
  room-nights). It re-derives the user, scope and params from the query string,
  so the export can never exceed what the caller may see.
- `downloadHistoryPdf()` in `lib/report-pdf.ts` draws a genuine A4 landscape PDF
  with jsPDF + autotable and saves it. Branded header, a summary band, a
  12-column table with repeating headers and `rowPageBreak: "avoid"`,
  colour-coded statuses, a slim running header on pages 2+, and "Page X of Y"
  footers. jsPDF is **dynamically imported**, so it only loads for someone who
  actually clicks Export.

`pdfSafe()` maps typographic punctuation to ASCII and drops anything outside
Latin-1, because jsPDF's built-in fonts are WinAnsi.

Both exports read the **current filters** — they sit together as an "Export as
CSV / PDF" pair next to the result count, so once the filters are set the only
remaining choice is the file format. The PDF button appears for GH Manager and
Developer only; everyone else sees CSV alone.

Polling is deliberately **off** on this route (`NO_POLL_PREFIXES` in
`components/auto-refresh.tsx`): the archive is historical, and a 5-second
refresh would only re-run a full scan and churn the table under the reader.

## Developer console (`/admin`)

Layout and tabs in `app/(portal)/admin/layout.tsx`; all actions in
`app/actions/admin.ts`, each gated by `requireDeveloper()` (14 call sites).

| Tab | UI | Capabilities |
| --- | --- | --- |
| Users & Roles | `components/admin/users-manager.tsx` | Create/edit/delete profiles; assign any of the 10 roles; set hostel, department/club, roll number (these drive warden and FA scoping). Cannot delete yourself or drop your own developer role. In Supabase mode, creating a user also creates a Supabase Auth user (password `password123`) — needs the service-role key. |
| Guest Houses & Rooms | `components/admin/guest-houses-manager.tsx` | Create/rename/delete guest houses; add, enable/disable, delete rooms. `total_rooms` is recounted from active rooms automatically. Deleting is blocked when bookings reference the guest house, or when a room is assigned to a booking (disable it instead). |
| Form Builder | `components/admin/form-config-editor.tsx` | Per requester role: allowed guest houses, every guest field's mode, relationship style and options, the relationship dependency (two checkbox lists — which options unlock, which are restricted), alumni-card mode, banner text, and custom fields. Editing the option list re-filters both dependency lists so they cannot reference a deleted option; save is blocked when a restriction has nothing to unlock it. "Reset to spec defaults" deletes the saved row. |
| All Bookings | `components/admin/bookings-manager.tsx` | Every booking with status filters, an audit-logged force-status override (remark required), and hard delete. |

## Shared domain modules

| File | Contents |
| --- | --- |
| `lib/types.ts` | Domain shapes and label maps. Declared as `type` aliases, not interfaces, so Supabase's generated `Insert`/`Update` helpers accept them. |
| `lib/workflow.ts` | Pipelines, status transitions, `canReview` scoping,
`ROOM_HOLDING_STATUSES`, lifecycle transitions, `historyScope` / `canViewHistory`
/ `canExportPdf` / `isRequesterHistory`, advance-booking window
(`latestCheckIn` / `isAdvanceWindowExempt`). |
| `lib/form-config.ts` | `RoleFormConfig`, defaults per role, sanitization, custom-field validation, the relationship dependency (`parentDependencyError` / `hasQualifyingParent` / `parentDependencyHint`). |
| `lib/availability.ts` | Availability grid maths: `bucketOccupancyByHour`, `dayBounds`, `hourLabel`, `toDateInputValue`. |
| `lib/occupancy.ts` | Room capacity per type, `INFANT_AGE_LIMIT`, `roomsNeededFor`, `requestedRoomsError`, `allocationCapacityError`. |
| `lib/report-pdf.ts` | Client-side PDF rendering for the history report (dynamically imported). |
| `lib/form-config-server.ts` | `getEffectiveFormConfig` — saved config or defaults. |
| `lib/booking-schema.ts` | Config-driven zod schema. |
| `lib/booking-search.ts` | Archive search: criteria, query tokenizer, pure matchers,
faceting, sorting, paging, query-string parsing. Shared by both stores. |
| `lib/routes.ts` | Role landing pages, official email whitelist. |
| `lib/format.ts` | Date/time formatting helpers, all delegating to `lib/tz.ts`. |
| `lib/tz.ts` | The institute timezone (`Asia/Kolkata`): `instituteIso` to parse a typed wall-clock time, `formatInstitute*` / `instituteHour` / `instituteDayBounds` to read instants back. Nothing else may parse a naked datetime string or format without a zone. |
| `lib/meals.ts` | Meal keys, labels, serving times, `normalizeMeals` (the only reader), `describeMeals`. |

## UI primitives

`components/ui/` holds the shadcn components in use plus two local additions:

- **`native-select.tsx`** — a styled native `<select>`. This registry ships no
  `form` component and Radix's Select does not work with `register()`, so this is
  the workhorse input for every dropdown.
- **`time-select.tsx`** — the hour/minute/AM-PM picker. Exports `parseTime` and
  `toTimeValue`, which handle the 12 AM = `00:00` and 12 PM = `12:00` traps.

## Branding

Palette and logo are taken from https://dashboard.iitpkd.ac.in/ — primary amber
`#f7a600`, warm off-white `#faf9f7`, text `#2b2b2b`, borders `#e3e1dc`. Tokens
live in `app/globals.css` for both light and a warm dark variant. The logo is
`public/iitpkd-logo.png`; `app/icon.png` is the same file serving as the favicon.

Known accessibility caveat: white-on-amber is low contrast by WCAG. It matches
the official site deliberately. To fix, set `--primary-foreground` to a dark
brown (the dark theme already uses `#251a00`).

## Demo data

Seeded in `lib/store/seed.ts` (mock) and `supabase/seed.sql` (Supabase, auth
password `password123`): 12 personas and 5 bookings positioned so every queue has
something in it. Rooms: Bageshri 10 double + 10 single, Hamsanandi 8 + 8.

| Persona | Email |
| --- | --- |
| Student (Malhar) | `112201001@smail.iitpkd.ac.in` |
| Student (Saveri) | `142202014@smail.iitpkd.ac.in` |
| Employee | `priya@iitpkd.ac.in` |
| Official (whitelisted) | `admin@iitpkd.ac.in` |
| Club (Petrichor) | `petrichor@iitpkd.ac.in` |
| Alumnus | `vikram.iyer@alumni.iitpkd.ac.in` |
| Wardens | `warden.malhar@`, `warden.saveri@iitpkd.ac.in` |
| Faculty advisor | `fa.petrichor@iitpkd.ac.in` |
| IAR cell | `iar@iitpkd.ac.in` |
| GH manager | `guesthouse@iitpkd.ac.in` |
| Developer | `developer@iitpkd.ac.in` |

Whitelisted official addresses (`lib/routes.ts`): `admin@`, `director.office@`,
`registrar@iitpkd.ac.in`.
