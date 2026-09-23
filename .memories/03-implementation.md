# Implementation

What exists today, with file paths.

## Entry and session

| Concern | File |
| --- | --- |
| Public website (home, booking entry points, guidelines, gallery, contact) | `app/(site)/*`, `components/site/*` — see [10-ui-design.md](10-ui-design.md) |
| Sign-in (LDAP + Google button) | `app/(site)/sign-in/page.tsx`, `app/(site)/book-room`, `app/(site)/book-meal` → `components/site/sign-in-panel.tsx` → `components/login-form.tsx` |
| Google sign-in (real OpenID Connect: state, PKCE, verified id_token) | `lib/oidc.ts`, `app/api/auth/google/start`, `app/api/auth/google/callback` |
| Developer persona picker — **only with `DEV_LOGIN=true`, 404 in production** | `app/(site)/mock-login/page.tsx` |
| Sessions (rows, opaque token, idle/absolute expiry, rotation, revoke) | `lib/sessions.ts` |
| Login / logout actions | `app/actions/auth.ts` (`signInWithLdap` — directory check, `ldap:<uid>` throttle, profile by `ldap_uid`, safe `next`; `loginAs(id, next)`; `logout` → `/sign-in`) |
| Academic records (the Requester details card) | `lib/academic/` — `index.ts` (`getAcademicSource()` from env; `academicRecordFor()`, cached and never throwing), `http-source.ts` (real; `recordFromJson` is the field mapping), `mock-source.ts` (dummy records), `fields.ts` (role → kind, display order, guardian and Copy-to rules), `details.ts` (rows + Copy to for the card). See [12-academic-records.md](12-academic-records.md) |
| LDAP directory | `lib/ldap/` — `index.ts` (`getDirectory()` from env), `ldap-directory.ts` (real), `mock-directory.ts` (dummy accounts), `link.ts` (entry → profile, opt-in link by email), `import.ts` (bulk import planner), `uid.ts` (client-safe rules). See [11-ldap-accounts.md](11-ldap-accounts.md) |
| Where signed-out visitors go | `SIGN_IN_PATH` in `lib/routes.ts` (`/` is the public home page) |
| Session read | `lib/auth.ts` (`getCurrentUser`, `requireUser`) |
| Post-login landing per role | `lib/routes.ts` (`homeForRole`) |
| Authenticated shell + nav | `app/(portal)/layout.tsx` (sticky navy `NavBar` from `components/site/site-nav.tsx`), page titles via `components/page-header.tsx` |

Nav links are role-aware: requesters see Dashboard / New Booking / Booking History,
reviewers see their queue + Approval Log, the manager sees the console +
Approval Log, the developer sees `/admin` + Approval Log. **Room Availability is
shown to every role**, between the role-specific links and the log.

## Booking submission

- **Page:** `app/(portal)/book/page.tsx` — loads the effective form config, then
  filters guest houses to those the role may book.
- **Requester details:** `components/academic-details.tsx`, above the form and
  outside it. The signed-in person's record from the academic database
  (`lib/academic/`), streamed in behind Suspense, with a Copy-to line; falls
  back to the portal profile when there is no record or the database is down.
  The same card is on `/warden`. See [12-academic-records.md](12-academic-records.md).
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
  `getRoomAvailability` action, which strips guest identity for non-staff, so it
  answers *when* rooms are taken and never by whom. The chart itself lives in
  `components/occupancy-chart.tsx`, shared with `/availability`.
- **Meals** — shown only when a guest house the role may book serves meals
  (`serves_meals`). A days × breakfast / lunch / dinner table
  (`components/meal-plan-grid.tsx`) for the stay being entered: one row per IST
  date from check-in to check-out, a checkbox wherever that meal is served
  during the stay, a dash (tooltip "Served before check-in" / "after
  check-out") where it is not, and an "Every day" box heading each column.
  Until a guest house and valid dates are chosen — or when the chosen guest
  house serves no meals — the card says so instead of showing the table. A line
  under it summarises the plan ("Breakfast (2 days), Dinner (1 day), for 3
  guests"). Every meal the stay covers starts ticked, so the form state is the
  set of meals turned *off*: `mealSlotsFromDeclined` derives the ticks from the
  days, `declinedFromMealSlots` folds the grid's change back, and a day that
  comes into range arrives ticked. Ticks live as `"date|meal"` slots outside
  react-hook-form and become the submitted `MealPlan` through
  `mealPlanFromSlots`; a meals error from the schema appears under the card.
  Still optional — clearing the table submits no plan. See `lib/meals.ts`.

Rooms are added as individual cards via `useFieldArray`. Each room card holds its own guests via a nested `useFieldArray`. The **Remove room** button deletes the room and its guests. Uploaded files are held in a `Map` keyed by field-array row id, outside react-hook-form, because `File` objects do not belong in form state.

**Counts use `components/ui/quantity-input.tsx`**, not a raw number input. It keeps the typed string so the box can be cleared and retyped.

Several policy rules are applied here as well as in the schema:

- **Service Type & Meals Preference.** The form first asks what is being booked: "Room", "Room & Meals", or "Meals Only" (depending on role). "Meals Only" hides the room cards entirely and asks for a guest count instead. A "Meal preference" (Veg/Non-Veg) is asked if meals are requested.
- **Pets Policy.** A mandatory "I have read and understood that pets are not allowed" checkbox must be ticked before submission.
- **Room capacity.** A room can hold up to 3 guests + 1 infant. The "+ Add guest" button inside a room card disables itself when this cap is reached. `roomOccupancyError` in the schema enforces this server-side.
- **Infants.** Infants are added as regular guest rows, and are classified as infants based on the age typed in (under 5 years).
- **Citizenship.** Asked per guest: Indian or Other. If "Other" is selected, Nationality and Passport Number become mandatory fields.

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
- **Max Stay Duration.** `stayLengthError` limits bookings to a maximum of 14 nights, with exemptions for official bookings and managers.

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

`components/booking-details.tsx`, shared by every reviewer dialog, the manager
and the requester, shows the party ("3 guests, with infant(s)") and, when meals
were requested, a **Meals by day** table with the head count each ticked meal is
for.

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
- **Book on behalf**: The manager can submit bookings on behalf of other guests, optionally capturing the name/email/phone of a guest without a portal account.
- **Overrides**: The manager can override normal approval flows (approve instantly), override guest house policies (e.g. book alumni at Hamsanandi), and view occupancy across all guest houses.
- **Meal Editing**: The manager can edit the meal preference of a booking after it has been approved.
- Rooms are grouped under **Double sharing rooms** and **Single rooms**, each
  with its formal occupancy line from `describeCapacity()` ("Occupancy: 2
  guests (maximum 3 with an extra bed)"). The allocation summary is four
  labelled figures — **Rooms selected** (with the room numbers), **Guests**,
  **Capacity of selection** (standard, with the maximum including extra beds)
  and **Extra beds required** (amber when non-zero, counted against the rooms
  actually picked with `extraBedsFor`). Confirm is refused while the selection
  is too small (`allocationCapacityError`). Infants are excluded from the head
  count. The wording used to be "selection sleeps 2, 3 with 1 extra bed", which
  the office found too informal.
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
- Each stays row shows the booking's **meals** alongside its rooms, as
  "Breakfast (3 days), Dinner (1 day)", with the per-day list in the cell's
  tooltip (`describeMealDays`).
- **Cancellation request review**: when a requester submits a cancellation
  request for an approved/occupied booking, the manager can approve or reject it
  via `approveCancellation` / `rejectCancellation` in `app/actions/bookings.ts`.

Queue pages keep themselves current through `components/live-updates.tsx`:
Supabase realtime on bookings, room holds, blocks and invoices where Supabase
is configured, and a 30-second poll where it is not (Phase 9).

## Room availability grid (`/availability`)

Open to **every signed-in role**; the nav link reads "Room Availability" for
everyone. `app/(portal)/availability/page.tsx` (server, lists guest houses) +
`components/availability-grid.tsx` (client).

| Concern | File |
| --- | --- |
| Page shell + guest house list | `app/(portal)/availability/page.tsx` |
| View switch, date navigation, summary, room list | `components/availability-grid.tsx` |
| The charts — `OccupancyChart` (day), `RangeOccupancyChart` (week / month) | `components/occupancy-chart.tsx` |
| Data fetch, window cap, identity stripping | `app/actions/availability.ts` (`getRoomAvailability`) |
| Ranges, bucketing, badges, labels | `lib/availability.ts` |
| Calendar-date arithmetic and labels | `lib/tz.ts` (`parseDateValue`, `addDaysToDateValue`, `formatDateValue`) |
| Store query | `listRoomOccupancy` in `lib/store/mock.ts` + `lib/store/supabase.ts` |

**Controls.** Guest house tabs, a **Day / Week / Month** switch, and a date
input between previous / next buttons that step one day, week or month, plus
**Today** and **Refresh**. In the week and month views the date picks the
period containing it — weeks run Monday to Sunday, months are calendar months.
`availabilityRange(view, date)` resolves the period and `shiftAnchor` steps it,
clamping 31 January to 28 February on a month step.

**Day view.** A CSS grid: `4.5rem` for the hour axis then one
`minmax(2.75rem, 1fr)` column per room, wrapped in `overflow-x-auto` with the
hour column and the room-number header both sticky. Each cell is an hour × room,
red when held and blank when free, with a `title` naming the booking. When the
selected date is today the current hour is marked in the primary colour (navy
since the 19 Sep 2026 restyle; it was amber before).

**An hour held by two bookings is violet, not red** (23 Sep 2026). An accepted
changeover puts two stays in one room for up to two hours, and in red that was
indistinguishable from one ordinary stay — the office reported overlaps as
invisible. `bucketOccupancyByHour` returns `overlaps` (the segments holding
each hour, when there is more than one) and the range chart gets clipped
`overlaps` spans from `overlapSpans()`; both draw `bg-overlap`, a vertical
stripe so it differs from the turnaround's diagonal and maintenance's
cross-hatch by pattern too. Stays that merely **touch** at check-out are not an
overlap — the same half-open rule as `room_holds.during`.

**Week and month views.** One row per day (3rem tall in a week, 1.75rem in a
month), one column per room. Each room column is a single grid item spanning
every day row, and each booking is an absolutely positioned red bar whose top and
height are fractions of the whole range (`bucketOccupancyByDay`). A three-night
stay is therefore one bar that starts partway down its check-in day and ends
partway down its check-out day. Beside each date is the number of rooms free all
day; today's row is tinted and a primary-colour (navy) line marks the current time. Each bar's
`title` names the booking and its period.

**Legend, badges and counts.** Red is labelled **Booked** (it used to say
"Booked / occupied"). Underneath, a per-room list gives the room number, type, a
**Vacant / Partly booked / Booked** badge for the whole period shown, and each
booking period in full, in check-in order. The badge comes from booked minutes
(`roomRangeStatus`), so it means the same thing in every view — the old day-view
badge said "Occupied" whenever all 24 hour *cells* were touched. That list is also
the non-colour channel for the chart, which matters because the roadmap flags
colour-only signalling as an accessibility gap. The summary line gives rooms
booked on the date (or during the week / month), rooms free for the whole period,
and — when today is in view — rooms booked right now.

**What each role sees.** `getRoomAvailability` fills `requester_name` and
`purpose_of_visit` only for `gh_manager` and `developer`; every other role gets
the period, the reference id and the status. It refuses a window longer than
`MAX_AVAILABILITY_DAYS` (62 days). Rooms deactivated after a booking was
allocated are filtered out, so no segment can point at a column that is not
drawn.

**Loading.** Like the booking form's panel, the grid derives "loading" by
comparing the key of the request its data answers with the current one, rather
than keeping a flag — no `setState` in the effect body. While a new period loads,
the previous chart stays on screen, dimmed.

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

Refreshing is deliberately **off** on this route (`NO_REFRESH_PREFIXES` in
`components/live-updates.tsx`): the archive is historical, and re-fetching
would only re-run a full scan and churn the table under the reader.

## Developer console (`/admin`)

Layout and tabs in `app/(portal)/admin/layout.tsx`; all actions in
`app/actions/admin.ts`, each gated by `requireDeveloper()` (14 call sites).

| Tab | UI | Capabilities |
| --- | --- | --- |
| Users & Roles | `components/admin/users-manager.tsx` | Create/edit/delete profiles; assign any of the 10 roles; set hostel, department/club, roll number (these drive warden and FA scoping) and **LDAP username**. **Import LDAP usernames** bulk-loads `email, ldap username` pairs, all or nothing. Cannot delete yourself or drop your own developer role. In Supabase mode, creating a user also creates a Supabase Auth user (password `password123`) — needs the service-role key. |
| Guest Houses & Rooms | `components/admin/guest-houses-manager.tsx` | Create/rename/delete guest houses; add, enable/disable, delete rooms. `total_rooms` is recounted from active rooms automatically. Deleting is blocked when bookings reference the guest house, or when a room is assigned to a booking (disable it instead). A **Serves meals** switch per guest house (`setGuestHouseMealsAction` → `updateGuestHouse`) decides whether the booking form offers meals there; new guest houses start with it off. |
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
| `lib/form-config.ts` | `RoleFormConfig`, defaults per role, sanitization, custom-field validation, the relationship dependency (`parentDependencyError` / `hasQualifyingParent` / `parentDependencyHint`) and the one-of-each rule (`duplicateRelationshipError` / `usedUniqueRelationships` / `uniqueRelationshipHint`). |
| `lib/availability.ts` | Availability grid maths: `bucketOccupancyByHour`, `dayBounds`, `hourLabel`, `toDateInputValue`, `overlapSpans`; the week/month views' `availabilityRange`, `shiftAnchor`, `describeRange`, `bucketOccupancyByDay`, `freeRoomsByDay`, `roomRangeStatus`, `rangeProgress`, `roomsBookedAt`; `MAX_AVAILABILITY_DAYS`. |
| `lib/occupancy.ts` | Room capacity per type, `INFANT_AGE_LIMIT`, `roomsNeededFor`, `requestedRoomsError`, `allocationCapacityError`. |
| `lib/report-pdf.ts` | Client-side PDF rendering for the history report (dynamically imported). |
| `lib/form-config-server.ts` | `getEffectiveFormConfig` — saved config or defaults. |
| `lib/booking-schema.ts` | Config-driven zod schema. |
| `lib/booking-search.ts` | Archive search: criteria, query tokenizer, pure matchers,
faceting, sorting, paging, query-string parsing. Shared by both stores. |
| `lib/routes.ts` | Role landing pages, official email whitelist. |
| `lib/format.ts` | Date/time formatting helpers, all delegating to `lib/tz.ts`. |
| `lib/tz.ts` | The institute timezone (`Asia/Kolkata`): `instituteIso` to parse a typed wall-clock time, `formatInstitute*` / `instituteHour` / `instituteDayBounds` to read instants back. Nothing else may parse a naked datetime string or format without a zone. Also calendar-date helpers for `"yyyy-MM-dd"` strings — `parseDateValue`, `dateValueOf`, `addDaysToDateValue`, `weekdayOfDateValue`, `formatDateValue` ("Tue 15 Sep"), `formatMonthOfDateValue` — which do day arithmetic in UTC because a calendar date has no zone. |
| `lib/meals.ts` | Meal keys and labels; `MEAL_SERVING_WINDOWS` and the `MEAL_TIMES` labels derived from them; `stayMealDays` / `mealUnavailableReason` (which meals a stay can have); `normalizeMeals` (the only reader — cleans arrays, expands the legacy whole-stay object); `mealPlanError` (the schema's rule); `mealSlot` / `mealPlanFromSlots` / `mealSlotsFromDeclined` / `declinedFromMealSlots` (the form's selection, which defaults to every meal); `describeMeals` / `describeMealDays` / `mealDayCounts`. |

## UI primitives

`components/ui/` holds the shadcn components in use plus these local additions:

- **`native-select.tsx`** — a styled native `<select>`. This registry ships no
  `form` component and Radix's Select does not work with `register()`, so this is
  the workhorse input for every dropdown.
- **`switch.tsx`** — a native checkbox (`role="switch"`) styled as an on/off
  switch, native for the same reason: it takes `register()` directly. Used for
  "Infant accompanying" in the booking form.
- **`time-select.tsx`** — the hour/minute/AM-PM picker. Exports `parseTime` and
  `toTimeValue`, which handle the 12 AM = `00:00` and 12 PM = `12:00` traps.

## Booking type and the IAR pipeline

`bookings.booking_type` — `official` | `personal` | `alumni` (migration 9) — is
a property of the **request**, not the requester, so the same account can book
both ways. `lib/booking-types.ts` is the one policy:

- `bookingTypesFor(role)` — what a role may pick. Employee is the only role with
  a real choice (`official` default, `personal`); student is personal-only; club
  and official are official-only; the IAR Office gets `official` | `alumni` and
  the Student Cell `alumni` only. The **GH Manager** gets `official` | `alumni`
  — booking at the desk for someone else, never a private stay of their own
  (23 Sep 2026).
- `offersBookingTypeChoice(role)` — a role with one option is **never asked**,
  but the value is still recorded on the booking.
- `bookingTypeError()` — the server-side counterpart, run inside
  `bookingPayloadSchema`, so a crafted request cannot book privately on an
  account that only books officially.
- `needsAlumniDetails()` — `alumni` requires `alumni_name`,
  `alumni_roll_number` and the Alumni ID card. The card is required by the
  role's form config **or** by the booking being for an alumnus, because the
  IAR accounts book both ways from one form.

The form asks it first, in a card above "Requester details"
(`components/booking-form.tsx`), because it decides the approval route.

**The IAR split.** Alumni have no institute login. `iar_student_cell` books for
its own office or for an alumnus and routes to `PENDING_IAR`; `iar_cell` (the
IAR Office) approves those *and* books itself, going straight to
`PENDING_GH_MANAGER` — routing it to its own queue would be self-approval.
`canReview()` additionally refuses `reviewer.id === requester.id`.
`historyScope` for the IAR Office spans three categories via `userRoles`
(Student Cell, its own, legacy alumni), which a single `userRole` cannot say.

## Reception (caretaker) console

`gh_caretaker` + `/caretaker` + `components/caretaker-console.tsx`. A deliberate
**subset** of the manager's console: today's checkouts, current occupants,
awaiting check-out, upcoming stays, and marking guests Occupied / Vacated.
No allocation, no approvals, no cancellations — it never even loads the pending
queue.

Shared rather than copied, so the two consoles cannot drift:

- **`components/stays-table.tsx`** — the allocated-stays table and its lifecycle
  buttons, used by both consoles. Renders through `displayStatus()`.
- **`components/checkouts-today.tsx`** — rooms due back today, earliest first,
  overdue flagged, Mark as Vacated inline. Only an `OCCUPIED` stay can be
  vacated; an approved guest who never arrived is closed off by the manager.

`canUpdateLifecycle()` / `LIFECYCLE_ROLES` (`lib/workflow.ts`) gate the one
action the two roles share, server-side in `updateBookingLifecycle`.

## Destructive actions in the developer console

**`components/ui/confirm-dialog.tsx`** replaced every `window.confirm`. It lists
the consequences and, for guest houses, users and bookings, requires the
operator to type the name, email or reference id. A stray Enter must not delete
a guest house and all its rooms.

## Email notifications — `lib/mail/`

Built 16 Sep 2026. Two Administration Section requirements (allocation mail,
the day-wise log) plus the meeting note about single-threaded email, all of
which needed the same missing piece.

### The shape

| File | What it is |
| --- | --- |
| `types.ts` | `Mailer`, `OutboundMessage`, the `MailEventKey` union, the outbox row |
| `config.ts` | Env reading, `portalUrl()`, `cronAuthorized()` |
| `index.ts` | `getMailer()` — picks the transport from the environment |
| `smtp.ts` | `SmtpMailer` (nodemailer, pooled) |
| `file.ts` | `FileMailer` → `.local-mail/*.eml`, and `DryRunMailer` |
| `redirect.ts` | `MAIL_REDIRECT_ALL_TO`, applied at **send** time |
| `render.ts` | Blocks → HTML **and** plain text, from one description |
| `templates.ts` | What each mail says. Pure functions, no store access |
| `thread.ts` | Daily per-person thread roots and subjects; the `[reference]` subject for standalone mail |
| `recipients.ts` | Who gets told — via `canReview()`, never a re-derived rule; `copyToAddresses()` for CC |
| `addressing.ts` | `addressStaffMail(to, copyTo)`: CC minus anyone in To, de-duplicated ignoring case |
| `notify.ts` | `notify*()` per workflow event: queue, then `after()` a dispatch |
| `dispatch.ts` | The worker: claim → send → settle, with backoff |
| `digest.ts` | The scheduled jobs (digests, reminders, desk report, escalations) |

Transport is chosen the way `lib/store/index.ts` chooses a backend:

| Condition | Transport | Mail goes to |
| --- | --- | --- |
| `MAIL_DRY_RUN=true` | `DryRunMailer` | nowhere (one log line) |
| `MAIL_USER` + `MAIL_APP_PASSWORD` | `SmtpMailer` | the SMTP host |
| otherwise | `FileMailer` | `.local-mail/*.eml` |

The file mailer exists for the same reason `MockStore` does: a first run needs
no credentials and no network. Open an `.eml` in any mail client to see exactly
what a recipient would have got.

### Nothing sends inside a server action

Actions **queue**; `lib/mail/dispatch.ts` sends. Three reasons, and the third
is the one that bites silently:

1. A slow SMTP host would add its latency to every booking submission.
2. A failed send must not fail a booking that is already stored.
3. On a serverless host, un-awaited work is frozen the moment the function
   responds — mail started and not awaited simply vanishes.

So `notify.ts` writes to `email_outbox` (migration 10) and schedules a dispatch
with `after()` from `next/server`, which runs once the response is out. The
cron route is the safety net for anything queued while SMTP was down.

**Every `notify*()` swallows its own errors.** If migration 10 is not applied,
or a profile has no address, the booking still succeeds and the failure is a
log line. A notification is worth less than the request it describes.

### The hooks are in the actions, not in `updateBookingStatus()`

Tempting, and wrong. The store method sees a status pair; only the action knows
*why* — which reason the reviewer typed, which rooms the manager picked,
whether a cancellation was approved or declined. Hooking the store would mean
reconstructing intent from a status transition, and would also mail on the
developer console's **force-status override**, which is a repair tool: a
developer fixing a bad row should not send a parent a confirmation.

### What is sent — To is the actioner, "Copy to" is CC

The owner's rule (Phase 2, 21 Sep 2026): on every **staff** mail about a
booking, **To is the one person who must act next** — found through
`canReview()` for the booking's current status (`reviewersForStatus`), or the
desk for a desk record — and **CC is the booking's Copy-to list**
(`lib/academic/copy-to.ts`): everyone who approves any stage of its chain
(`approvalStagesFor`) and, for an office, its head (Departments & Clubs
console first, else the academic record). `addressStaffMail` removes anyone
already in To from CC and de-duplicates both ignoring case. When the booking
moves on, the next mail's To moves with it and the approver who forwarded it
stays in CC. Requester mail has no CC.

| Event | To | CC | Carries |
| --- | --- | --- | --- |
| Submitted | Requester | — | Reference, summary, "nothing needed yet" |
| Submitted | First actioner (warden / advisor or council secretary / HOD / IAR Office / manager) | Copy to | Who asked, a link to their queue |
| Tier approved | Requester | — | Progress, what happens next |
| Tier approved | Next actioner | Copy to (incl. who forwarded it) | Who forwarded it |
| Rejected | Requester | — | **The reason, verbatim** |
| Rooms allocated | Requester | — | Room numbers, check-in, what ID to carry |
| Rooms allocated | Manager + caretaker | Copy to | Copy for the desk register |
| Cancellation requested | Manager (decides) | Copy to (whoever reviewed it) | Reason; rooms stay held until they decide |
| Cancellation decided | Requester | — | Outcome, and that the booking stands if declined |
| Cancelled | Requester (unless they did it); desk if rooms were held | Copy to, on the desk mail | Reason |
| Day before check-in | Requester | — | Rooms, directions, what to bring |
| Daily | Each reviewer with a non-empty queue | — | One digest, not one mail per request |
| Daily | Manager + caretaker | — | Per guest house: the day-wise log |
| Pending > 48 h | Reviewer | Manager | Escalation nudge |

The separate "Cancellation requested — for your information" mail to
reviewers (`booking.cancellation_requested.reviewer`) was retired: they are CC
on the manager's mail instead. The key stays in the union for old outbox rows
and is hidden from the template editor (`RETIRED_MAIL_EVENTS`).

`email_outbox.cc_emails` has existed since migration 10, and every transport
already sent CC (`SmtpMailer`, `FileMailer` writes a `Cc:` header,
`DryRunMailer` logs it), so Phase 2 needed **no migration** — the change is who
goes in it. Addresses the office adds to a template's CC in Email Templates are
merged into the same CC line.

**Digests matter more than they look.** Per-request mail to a warden during
fest week trains them to filter the portal into spam, and then the portal stops
working. The manager is deliberately *not* digested — their pending
allocations are a section of the daily desk report, and two mails listing the
same queue is how a report stops being read.

### Recipients come from `canReview()`

`reviewersFor()` filters profiles through the very predicate that decides
whether their button works. Re-deriving "wardens of this hostel" in the mail
layer would be a second copy of the scoping rule, and the two would drift — the
Malhar warden would start getting mail about Saveri students while still,
correctly, being unable to act on them. `canReview` also refuses
`reviewer.id === requester.id`, so the IAR Office is never asked to approve its
own booking.

### Threads: per booking for staff, standalone for requesters

From the meeting notes: *"Email — try to send in a single thread instead of a
standalone email."* Staff mail about a booking joins that recipient's thread
**for that booking**; the scheduled mail that has no booking (digest,
escalation, desk report) joins a **daily log** thread; requester mail stands
alone with a `[reference]`-led subject. Two things must line up for mail
clients to group messages:

1. `bookingThreadRoot(referenceId, address)` — or `dailyThreadRoot("daily_log",
   day, address)` for the scheduled mail — is a deterministic root
   `Message-ID`; the first message actually **sent** claims it (decided in
   `dispatch.ts`), and every later one sets `In-Reply-To` / `References` to it.
2. Every message in a thread shares the thread's subject
   (`[IITPKD-GH-2026-AB12C] Guest house booking`, or `Guest house daily log —
   Mon 21 Sep 2026`); what the message is about moves to its heading and inbox
   preview.

Threaded mail is queued **one message per To address** (a message carries one
`References`). **CC rides on the first To's message only**, so a copied
warden or HOD receives it once and it joins that recipient's thread — every
later message about the same booking to the same To carries the same root.

> **Was per person per *day* until 23 Sep 2026.** Threading on the day grouped
> by when a message happened to be queued, so unrelated requests shared a
> conversation and one booking's messages were split across days. See
> [06-decisions.md](06-decisions.md), "Mail threads on the booking, not on the
> day".

### HTML and text from one description

`render.ts` takes a list of blocks (`paragraph`, `facts`, `callout`, `table`,
`list`, `button`, `note`) and renders both bodies. A template that wrote the
two separately would drift until the text part was wrong — and the text part is
what every HTML-refusing client and every screen reader reads.

Email constraints baked into the markup: tables for layout, inline styles only
(Gmail strips `<style>`), no external images (blocked by default, and the
portal may be on localhost). The header uses dark brown on amber rather than
the site's white-on-amber, which fails WCAG AA — the fix `AGENTS.md`
recommends, applied here from the start.

**Never put an ID document link in a mail body.** Reviewer mail says the
documents are in the portal and links to the page.

### `MAIL_REDIRECT_ALL_TO` is applied at send time

The outbox always records who the message was genuinely for; the redirect
rewrites the envelope in `dispatch.ts`. So flipping the variable changes where
mail goes without rewriting history, and the console's outbox still answers
"was the warden *supposed* to get this?". The redirected copy carries an
`X-Original-To` header and a banner in the body, because the header is exactly
what nobody looks at when wondering why a test mailbox is full of other
people's bookings. **CC is swallowed too**: the redirected message has an empty
CC, `X-Original-To` holds the original To and `X-Original-Cc` the original CC,
and the banner names both.

Set it on every non-production deployment. Without it, one person pointing a
staging server at real data mails a real parent.

### Idempotency is the whole safety story

`email_outbox.idempotency_key` is unique, and `enqueueEmails` inserts with
`on conflict do nothing`. The key is
`event:booking:stamp:recipients` — the stamp being the booking's `updated_at`
for a transition, or the institute calendar date for a digest. That gives:

- a retried server action queues nothing new;
- a digest is once per reviewer per day, so **the cron schedule is advisory** —
  a missed 8am run still delivers at 9am and a second run at 9:05 does nothing;
- two dispatchers never send the same message, because claiming is a single
  `for update skip locked` statement (`claim_queued_emails`, migration 10).

### Scheduling

`/api/mail/dispatch` drains the outbox; `/api/mail/cron` runs the daily jobs
and then drains. Both accept GET and POST (cron runners disagree), and both are
guarded by `CRON_SECRET` — **required in production**, optional outside it so
`npm run dev` stays usable. 8am IST is `30 2 * * *` in UTC.

### The Mail Outbox console

`/admin/mail` (developer only, behind the console lock) lists the queue, what
failed and why, and offers Retry, "Send queued now" and "Send a test message".
The test goes through the queue rather than calling the transport directly, so
a pass proves the whole path and not merely that a password was accepted.
Bodies are deliberately not returned to the client: the question there is
delivery, and the content is the booking, one click away in All Bookings.

## Invoices and tariffs (Phase 5)

The office's invoice template is `public/GHM_Invoice.docx`; its header images
are in `public/invoice/`. The flow, in the manager's and caretaker's consoles
(the **Invoice** button on an occupied or vacated stay, `components/invoice-dialog.tsx`):
**preview → correct the meal counts → Issue & print → Mark paid**.

- **Pure rules — `lib/invoice.ts`, `lib/tariffs.ts`.** Money is integer paise.
  `chargeableDays()` (calendar nights by default, or 24-hour blocks with a
  grace — Setting `day_basis` / `grace_hours`), `splitByRate()` (a mid-stay
  rate change prints two rows), `extraBedsByRoom()` (guests in a room card
  beyond the room type's beds), `mealCovers()` (meals ticked × bed-occupying
  guests, or a dining booking's head count), `gstPaise()` (basis points,
  half-up to the rupee), `formatINR()` (₹1,23,456.00, written out, not `Intl`),
  `financialYear()` (1 April rollover, institute time) and
  `splitGst()` / `roomGstPercent()` (the rates are **GST-inclusive** by default:
  the grand total is the rates, taxable value and CGST/SGST are backed out),
  `buildInvoiceDocument()`, which assembles every printed field into an
  `InvoiceDocument`. `actualStayTimes()` reads the desk's OCCUPIED / VACATED
  log entries; an occupied stay is billed to its booked check-out.
- **Tariffs** are effective-dated rows (`tariffs`, migration 19), each
  optionally narrowed by guest house, room type, booking type and requester
  role. `resolveTariff()` takes the most specific row in force (guest house >
  requester > booking type > room type), then the latest. A rate in force is
  never edited or deleted (trigger `tariffs_guard`, `tariffLockedError`); a new
  price is a new row. A charge no rate covers is a *problem* on the document
  and blocks issuing (`invoiceBlocker`) — nothing is ever priced at ₹0 by
  omission.
- **Issuing** (`app/actions/invoices.ts` → `store.issueInvoice` →
  `issue_invoice()`) takes the financial year's next serial
  (`GH/2026-27/0001`, prefix and width are Settings) and stores the whole
  document as the snapshot in one transaction. Issued invoices are immutable
  (trigger `invoices_guard`): only the payment can be recorded (cash, UPI with
  its id, account transfer with its UTR) and the invoice cancelled with a
  reason. A correction is a cancellation plus a new invoice that records
  `replaces_invoice_id`. A draft row only carries the desk's meal-count
  correction; it has no number and is priced afresh when shown.
- **The PDF** (`lib/invoice-pdf.ts`, server only) is drawn with jsPDF to the
  template's measurements, from the snapshot, never recomputed. Fonts and
  artwork are embedded from `lib/invoice-assets.generated.ts` (regenerate with
  `node scripts/build-invoice-assets.mjs`): Arimo (Arial-metric, has ₹) and
  the **Hindi half of the footer address as an image** rendered from the
  template's Palanquin Dark — jsPDF cannot shape Devanagari. Routes:
  `/api/invoices/[id]/pdf` (desk: any; requester: their own issued invoices;
  others 404) and `/api/invoices/preview/[bookingId]` (desk only, DRAFT
  watermark). The requester's issued invoices show as **Invoice** on
  `/dashboard`.
- **Official invoices go to Accounts.** On issue, `notifyInvoiceIssued()`
  queues `invoice.issued.accounts` To the Setting `accounts_email`, CC the
  requester's HOD (`hodApproversFor`) and the requester, with an attachment
  *reference* on the outbox row (`email_outbox.attachments`); the dispatcher
  renders the PDF at send time. Personal bookings are not mailed. Nothing is
  mailed until the office sets the address.
- **Tariffs & Invoicing console** (`/admin/billing`, manager and developer):
  the rates table with an add form (future rates removable), and the invoice
  Settings group `rules.invoice` — numbering, day basis, GST %, GSTIN, Accounts
  email, bank details and the footer contact line.
- **Collections** (`lib/collections.ts`): the monthly CSV on `/history` for the
  desk — every invoice issued or paid in the month, then totals by payment
  mode and by debitable head.
- **Who:** manager, caretaker and developer preview, issue and mark paid
  (`canIssueInvoices`); only the manager and developer cancel
  (`canCancelInvoices`). Each action re-checks and writes `invoice.issued`,
  `invoice.paid` or `invoice.cancelled` to the security audit log.

## Dining (Phase 6)

Meals without a room (`service_type: "meals_only"`) for faculty, staff and
offices (`MEALS_ONLY_ROLES`) at guest houses that serve meals; `/book-meal`
opens `/book?service=meals_only`. `/manager/meals` is the kitchen's day
(manager and caretaker): plates per meal from `kitchenHeadCount`, confirmed and
pending bookings, and **Dining to invoice** — approved dining bookings whose
meals have begun and have no invoice. The daily desk report carries the same
plates and the day's dining bookings.

## Operational states (Phase 7)

`components/manage-stay-dialog.tsx` on every approved / current stay in the
reception tables: extend (manager, caretaker), approve / decline a requester's
extension, move rooms (`reassignRooms`, audited), release a no-show, cancel.
Requesters ask for an extension from their booking view. Actions are in
`app/actions/operations.ts`; pure rules in `lib/operations.ts`
(`extensionError`, `noShowReleasable`, `planRoomRange`, `roomBlockError`,
`blockSegment`); the automatic no-show release in `lib/no-show-server.ts`, run by
`/api/mail/cron` before the daily mail. Maintenance blocks (`room_blocks`) are
managed in Guest Houses & Rooms, merged into availability as segments with
`kind: "maintenance"`, and refused against stays in both stores.

## Security (Phase 8)

`lib/sessions.ts` (rows in `sessions`, opaque token cookie, idle/absolute
expiry, rotation, revoke-all), `lib/auth.ts` (the only reader; `mfaState`,
`stepUpProblem`), `lib/oidc.ts` (Google, state + PKCE, verified id_token),
`lib/totp.ts` + `app/actions/security.ts` (developer second factor, recovery
codes), `lib/env.ts` + `instrumentation.ts` (refuses to boot an unfit
production), `lib/crypto.ts` (AES-256-GCM for ID numbers and TOTP secrets),
`lib/uploads.ts` (magic bytes, EXIF stripping, random names, optional ClamAV),
`/api/documents/[...path]` (authorised, audited, five-minute links),
`lib/retention-server.ts` (daily erasure), `app/actions/privacy.ts` (DPDP
download and erasure requests), `lib/log.ts` (redacted JSON logs, optional
Sentry), `proxy.ts` (CSP nonces and the other headers). Console: **Security**
(second factor, sessions, data requests) and **Audit Log** (developer).

## Performance and tests (Phase 9)

`lib/revalidate.ts` (three named sets in place of 25 whole-application cache
drops), `components/live-updates.tsx` (Supabase realtime on bookings, holds,
blocks and invoices; a 30-second poll where there is no Supabase),
`lib/site-data.ts` (the public site's data held under the `site` cache tag for
half an hour, expired by `revalidateEverything()`), migration 22
(`bookings.search_text` + GIN, and the indexes every desk read uses) with
`SupabaseStore.searchBookings` pushing the keyword down, `vercel.json`
(`regions: ["bom1"]`, the two crons).

Tests: `npm test` (Vitest, unit and store), `npm run typecheck`, and
`npm run test:e2e` — Playwright against a **production build on the mock
store**, on a throwaway database file:

| Spec | What it walks |
| --- | --- |
| `e2e/booking-journey.spec.ts` | student books → warden forwards → manager allocates → desk checks in and out → invoice issued → payment recorded |
| `e2e/official-and-dining.spec.ts` | a faculty official stay through the HOD; a meals-only booking approved by the manager and counted on the kitchen's day sheet |
| `e2e/public-site.spec.ts` | the public pages at 320 px, with no sideways scroll |
| `e2e/sign-in.spec.ts` | **Mock Authentication** signs a persona in on a *production* build with no Google configuration — the deployment where the door had 404'd — and carries `?next=` through |
| `e2e/room-party.spec.ts` | 2 guests + 2 infants in one room, through the real form: the second infant reachable, a fifth person refused, no room-type question, and Bageshri's review showing no meals row |
| `e2e/alumni-and-relationships.spec.ts` | the IAR Student Cell's alumni booking, which is never asked which guest house (no `<select>` at all) and reaches the IAR Office's queue; and a student being refused a second Mother in the dropdown itself |

`e2e/helpers.ts` holds the accounts, sign-in, and the form-filling steps.
`e2e/global-setup.ts` deletes the throwaway database before each run, so the
sign-in throttle (a row in it) cannot carry over and lock the dummy accounts
out on a second run inside 15 minutes.
`.github/workflows/ci.yml` runs all of it with Supabase switched off.

## Branding

**Since 19 Sep 2026 the palette comes from the guest house design handoff**
(`design_handoff/README.md`): navy `#12284C` (primary, white text), gold
`#E8A317` (accents, focus ring, the public CTA with navy text), body text
`#41506A`, borders `#E1E5EC`, white background, 3px corners, no shadows;
Source Serif 4 headings and Source Sans 3 body via `next/font`. Tokens and the
brand utilities (`bg-navy`, `text-gold-dark`, `bg-band`, …) live in
`app/globals.css`. Full table and rules in [10-ui-design.md](10-ui-design.md).

Logos: `public/IITPKD_NEW_LOGO.png` (the stacked institute logo on a
transparent background, in both headers since 21 Sep 2026; it replaced the
wide `iitpkd-web-logo.jpg`) and `public/iitpkd-logo.png` (the emblem; `app/icon.png` is the same
file serving as the favicon).

The earlier amber-on-off-white palette copied from dashboard.iitpkd.ac.in, and
its white-on-amber WCAG failure, are gone — white on navy is ≈13:1. Mail
templates (`lib/mail/render.ts`) still carry their own inline amber header.

## Demo data

Seeded in `lib/store/seed.ts` (mock) and `supabase/seed.sql` (Supabase, auth
password `password123` — not a portal login; each persona signs in with its
dummy LDAP account from [11-ldap-accounts.md](11-ldap-accounts.md)): 13 personas and 5 bookings positioned so every queue has
something in it. Rooms: Bageshri 10 double + 10 single, Hamsanandi 8 + 8.
Hamsanandi serves meals and Bageshri does not; the two Hamsanandi demo bookings
carry per-day meal plans built from their dates (`demoMeals` in
`lib/store/seed.ts`), and bk-demo-4 has the infant switch on.

| Persona | Email |
| --- | --- |
| Student (Malhar) | `112201001@smail.iitpkd.ac.in` |
| Student (Saveri) | `142202014@smail.iitpkd.ac.in` |
| Employee | `priya@iitpkd.ac.in` |
| Official (whitelisted) | `admin@iitpkd.ac.in` |
| Club (Petrichor) | `petrichor@iitpkd.ac.in` |
| IAR Student Cell | `alumnicell@iitpkd.ac.in` |
| Wardens | `warden.malhar@`, `warden.saveri@iitpkd.ac.in` |
| Faculty advisor | `fa.petrichor@iitpkd.ac.in` |
| IAR Office | `iar@iitpkd.ac.in` |
| GH manager | `guesthouse@iitpkd.ac.in` |
| GH caretaker | `gh.reception@iitpkd.ac.in` |
| Developer | `developer@iitpkd.ac.in` |

**There is no alumnus persona** — alumni cannot sign in. Demo booking 3 is the
IAR Student Cell booking on behalf of Vikram Iyer (`101601023`), sitting in the
IAR Office's queue, so the new pipeline has something in it on first run.

Whitelisted official addresses (`lib/routes.ts`): `admin@`, `director.office@`,
`registrar@iitpkd.ac.in`.
