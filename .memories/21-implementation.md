# Implementation

What exists today, with file paths — the engineering map. What the product
does for each role is in [10-roles-and-features.md](10-roles-and-features.md)
and [11-booking-forms.md](11-booking-forms.md); this page says where the code
for it lives.

## Entry and session

| Concern | File |
| --- | --- |
| Public website (home, booking entry points, guidelines, gallery, contact) | `app/(site)/*`, `components/site/*` — see [16-public-site-and-ui.md](16-public-site-and-ui.md) |
| Sign-in (LDAP + Google button) | `app/(site)/sign-in/page.tsx`, `app/(site)/book-room`, `app/(site)/book-meal` → `components/site/sign-in-panel.tsx` → `components/login-form.tsx` |
| Google sign-in (real OpenID Connect: state, PKCE, verified id_token) | `lib/oidc.ts`, `app/api/auth/google/start`, `app/api/auth/google/callback` |
| **Mock Authentication** persona picker — open while Google is unconfigured (`mockLoginEnabled()`), 404 otherwise or with `MOCK_LOGIN=false` | `app/(site)/mock-login/page.tsx`, `loginAs` |
| Sessions (rows, opaque token, idle/absolute expiry, rotation, revoke) | `lib/sessions.ts` |
| Login / logout actions | `app/actions/auth.ts` (`signInWithLdap` — directory check, `ldap:<uid>` throttle, profile by `ldap_uid`, safe `next`; `loginAs(id, next)`; `logout` → `/sign-in`) |
| Academic records (the Requester details card) | `lib/academic/` — `index.ts` (`getAcademicSource()` from env; `academicRecordFor()`, cached and never throwing), `http-source.ts` (real; `recordFromJson` is the field mapping), `mock-source.ts` (dummy records), `fields.ts` (role → kind, display order, guardian and Copy-to rules), `details.ts` (rows + Copy to for the card). See [17-academic-records.md](17-academic-records.md) |
| LDAP directory | `lib/ldap/` — `index.ts` (`getDirectory()` from env), `ldap-directory.ts` (real), `mock-directory.ts` (dummy accounts), `link.ts` (entry → profile, opt-in link by email), `import.ts` (bulk import planner), `uid.ts` (client-safe rules). See [31-ldap-sign-in.md](31-ldap-sign-in.md) |
| Where signed-out visitors go | `SIGN_IN_PATH` in `lib/routes.ts` (`/` is the public home page) |
| Session read | `lib/auth.ts` (`getCurrentUser`, `requireUser`) |
| Post-login landing per role | `lib/routes.ts` (`homeForRole`) |
| Authenticated shell + nav | `app/(portal)/layout.tsx` (sticky navy `NavBar` from `components/site/site-nav.tsx`), page titles via `components/page-header.tsx` |

Nav links are role-aware — the exact menu per role is in
[10-roles-and-features.md](10-roles-and-features.md). **Room Availability is
shown to every role**, between the role-specific links and the log. Approver
links (HOD Queue, Club Approvals) and "My Bookings" for a Faculty Advisor come
from the units, not the role (`isHodForAny`, `approvesClubsFor`,
`clubsBookableByUser`).

## Booking submission

- **Page:** `app/(portal)/book/page.tsx` — loads the effective form config, then
  filters guest houses to those the role may book.
- **Requester details:** `components/academic-details.tsx`, above the form and
  outside it. The signed-in person's record from the academic database
  (`lib/academic/`), streamed in behind Suspense, with a Copy-to line; falls
  back to the portal profile when there is no record or the database is down.
  The same card is on `/warden`. See [17-academic-records.md](17-academic-records.md).
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

**Added 24 Sep 2026** (the office's fourth list — [99-recent-changes.md](99-recent-changes.md)):

- **Copy to (optional)** — a card of email rows (`copy_to`, its own
  `useFieldArray` of `{ email }`), "Add another email", at most
  `MAX_COPY_TO_EMAILS` (25). The form sends every row; the schema's
  `copyToField` drops blanks and repeats and puts an error on the bad row
  (`copy_to_emails.<i>` → `copy_to.<i>.email`). Stored as
  `bookings.copy_to_emails`; every mail **to the requester** is CC'd to it.
- **Project sub-head** — an optional text box under the project list when the
  head is Project (`debit_subhead`, 120 chars). Sent only with Project.
- **Special Funds** — the head's name box and sanction letter are both
  optional now (`debitDetailsRequired` is false, `acceptsDebitDocument`
  replaced `needsDebitDocument`).
- **Age** — labelled per the form config; where optional it says "Needed only
  for a child below 5", and a blank age is an adult (`ageField` in the schema).
- **Booking for a club** — `forClub` prop. `/book?for=<club profile id>`
  renders the club's own form (`user` and `config` are the club's) under a
  banner; the submission carries `for_club`, which `createBooking` re-checks
  against `clubsBookableByUser`. A professor named Faculty Advisor in
  Departments & Clubs (migration 25) gets a **Booking as** card on `/book` —
  Yourself / Faculty Advisor — each council or club — and `defaultCopyTo`
  pre-fills the council secretary's mailbox. The form is **keyed by the
  requester** so switching remounts it. A club's own account sees an
  explanation naming its Faculty Advisor instead of the form; a legacy
  `faculty_advisor` account with one club is redirected straight to it, with
  several gets a chooser.

**Counts use `components/ui/quantity-input.tsx`**, not a raw number input. It keeps the typed string so the box can be cleared and retyped.

Several policy rules are applied here as well as in the schema:

- **Service Type & Meals Preference.** The form asks what is being booked: "Room booking", "Room + Meals", or "Meals only" (by role, and only where a guest house serves meals). "Meals only" replaces the stay with a list of dates and a guest count. A meal preference (Vegetarian / Non-Vegetarian) is required whenever meals are booked.
- **Pets Policy.** A notice only ("Pets are not allowed in the guest house premises"); the tick box was removed at the office's request. `pets_policy_acknowledged` is still parsed for old payloads.
- **Room capacity.** A room card holds at most 4 people, of whom at most 3 need a bed and at most 3 are infants (all Settings). Both "Add" buttons stop at the limit (`addGuestBlockedReason` / `addInfantBlockedReason`); `roomPartyError` in the schema enforces it server-side, and the `booking_guests` trigger in the database.
- **Infants.** Infants are added as regular guest rows, and are classified as infants based on the age typed in (under 5 years).
- **Citizenship.** Asked per guest: Indian or Other. If "Other" is selected, Nationality and Passport Number become mandatory fields.

- **Relationship dependency.** The form watches every guest's relationship with
  `useWatch` (never `watch()` — React Compiler lint). Until some guest is marked
  Mother, Father or Guardian, the Grandmother / Grandfather / Siblings options render
  `disabled` and greyed, each labelled "— needs a parent on this request", with
  an amber hint above the guest list. The gating is cosmetic; the enforcement is
  `parentDependencyError()` inside the zod schema, which attaches the message to
  every offending guest row.
- **Advance-booking window.** `latestCheckIn(config.role)` sets `max` on the
  check-in date input and prints the last bookable date under it. For
  `official`, `gh_manager` and `developer` the helper returns null, so no `max`
  is emitted at all.
- **Max Stay Duration.** `stayLengthError` (`lib/policy.ts`) limits bookings to 14 nights (a Setting), exempting `official`, `gh_manager`, `developer` and `director.office@`.

Both limits are computed once in a `useState` initializer rather than on every
render, so the value cannot drift mid-session.

Dates use a native date input; **times use `components/ui/time-select.tsx`** —
three dropdowns (hour / minute / AM-PM). See
[25-troubleshooting.md](25-troubleshooting.md) for why native time inputs are
banned.

## Requester dashboard

`app/(portal)/dashboard/page.tsx` + `components/my-bookings.tsx`: the user's own
bookings (and, for a Faculty Advisor, the club bookings they raised), current
status, assigned rooms once approved, rejection reason when rejected, the full
status history, and the invoice once issued. **Cancel** (`cancelBooking` in
`app/actions/bookings.ts`, reason required) always files a
**cancellation request** — pending or approved alike — which sets
`CANCELLATION_REQUESTED`; the GH Manager approves or declines it. An Occupied
stay cannot be cancelled by the requester. "Request extension" asks the
manager for a later check-out. The DPDP panel ("Download my data", "Ask for
erasure") sits below.

## Reviewer portals

One component, four scopings — `components/review-queue.tsx`, rendered by
`app/(portal)/warden|hod|approvals|iar/page.tsx` (`/fa` only redirects to
`/approvals`). Each shows the pending queue for that tier, full booking
details, guest list with ID documents, and Forward / Reject with a mandatory
reason on rejection. The IAR view embeds the alumni ID card.

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
- Rooms are split into **Double sharing rooms** and **Single rooms** only when
  both exist (`splitByType`; today every room is double sharing), each with its
  formal occupancy line from `describeCapacity()` ("Occupancy: 2
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
`overlaps` spans from `overlapSpans()`; both draw `bg-overlap`. It was violet
with a vertical stripe and a `◆` on range bars until later the same day, when
the office asked for **a plain colour filling the overlapping area** instead:
a pattern drawn over two red bars read as a rendering artefact. The turnaround
and maintenance keep their hatching. Stays that merely **touch** at check-out
are not an overlap — the same half-open rule as `room_holds.during`.

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

Refreshing is off on this route (`NO_REFRESH_PREFIXES` in `components/live-updates.tsx`): the component fetches its own
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
| student/employee/official/club/iar_student_cell/alumni | only their own bookings (`userId` scope) — plus, for anyone who approves by appointment (an HOD, a council secretary), the requests of the units they govern (`approverScope`) |
| warden | `userRole: student` + their own `hostel_name` |
| faculty_advisor (legacy account) | `userRole: club` + their own `department_or_club` |
| iar_cell | `userRoles: alumni, iar_student_cell, iar_cell` |
| gh_manager / gh_caretaker / developer | everything |

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

## The console (`/admin`)

Layout and tabs in `app/(portal)/admin/layout.tsx`, sections and who may open
each in `CONSOLE_SECTIONS` (`lib/access.ts`) — the manager nine, the developer
all thirteen (table in [10-roles-and-features.md](10-roles-and-features.md#who-can-open-which-console-section)).
Every action re-checks with `requireConsole(section)` (or its sibling in
`app/actions/{units,settings,invoices,projects,operations,mail-templates}.ts`):
the role, the console unlock, and for a developer's dangerous actions the
second factor.

The first four sections, which predate the split:

| Tab | UI | Capabilities |
| --- | --- | --- |
| Users & Roles | `components/admin/users-manager.tsx` | Create/edit/delete profiles; assign any of the 12 roles (a manager cannot create or edit a developer); set hostel, department/club, roll number (these drive warden and FA scoping) and **LDAP username**. **Import LDAP usernames** bulk-loads `email, ldap username` pairs, all or nothing. Cannot delete yourself or drop your own developer role. In Supabase mode, creating a user also creates a Supabase Auth user (password `password123`) — needs the service-role key. |
| Guest Houses & Rooms | `components/admin/guest-houses-manager.tsx` | Create/rename/delete guest houses; add, enable/disable, delete rooms. `total_rooms` is recounted from active rooms automatically. Deleting is blocked when bookings reference the guest house, or when a room is assigned to a booking (disable it instead). A **Serves meals** switch per guest house (`setGuestHouseMealsAction` → `updateGuestHouse`) decides whether the booking form offers meals there; new guest houses start with it off. |
| Form Builder | `components/admin/form-config-editor.tsx` | Per requester role: allowed guest houses, every guest field's mode, relationship style and options, the relationship dependency (two checkbox lists — which options unlock, which are restricted), alumni-card mode, banner text, and custom fields. Editing the option list re-filters both dependency lists so they cannot reference a deleted option; save is blocked when a restriction has nothing to unlock it. "Reset to spec defaults" deletes the saved row. |
| All Bookings | `components/admin/bookings-manager.tsx` | Developer only. Every booking with status filters, an audit-logged force-status override (remark required; refuses Occupied before check-in), and hard delete. |

The later sections: **Departments & Clubs** (`units-manager.tsx` — heads, acting
heads, office class, whose HOD approves, and the **Faculty Advisors** table
with each council's advisor and secretary's mailbox), **Projects**
(`projects-manager.tsx`, paste import), **Tariffs & Invoicing**
(`billing-manager.tsx`), **Email Templates** (`mail-template-editor.tsx`),
**Mail Outbox** (`mail-outbox.tsx`), **Settings** (`settings-manager.tsx`,
developer), **Security** (`security-manager.tsx` — second factor, sessions,
data requests), **Audit Log** (`audit-log.tsx`, developer), **Console Access**
(`console-access.tsx`, developer). Maintenance blocks and bulk rooms live in
Guest Houses & Rooms.

## Shared domain modules

| File | Contents |
| --- | --- |
| `lib/types.ts` | Domain shapes and label maps (`ROLE_LABELS`, `STATUS_LABELS`, `REQUESTER_ROLES`, `DEBIT_HEAD_LABELS`…). Declared as `type` aliases, not interfaces, so Supabase's generated `Insert`/`Update` helpers accept them. |
| `lib/workflow.ts` | `routeFor` (the pipeline), `initialStatusFor`, `approvalStagesFor`, `nextStatusAfter`, `canReview` / `canReviewBooking`, `actsAsRequester`, `ROOM_HOLDING_STATUSES`, `stayPhase`, `occupancyNotStartedError`, `hasLapsed`, `displayStatus`, `LIFECYCLE_ROLES`, `historyScope`, `canExportPdf`, the advance window (`latestCheckIn` / `isAdvanceWindowExempt`). |
| `lib/units.ts` | Units and appointments: `approversOf`, `hodUnitIdFor`, `hodApproversFor`, `unitsGovernedBy`, `isHodForAny`, `approvesClubsFor`, `facultyAdvisorOf`, `secretaryEmailOf`, `parentError`. |
| `lib/club-booking.ts` (+ `-server.ts`) | Clubs booked by their Faculty Advisor: `canBeFacultyAdvisor`, `facultyInChargeOf`, `clubsBookableBy`, `defaultCopyToFor`, `raisedByFacultyInCharge`, `clubBookingNotice`; `clubsBookableByUser` (cached per request). |
| `lib/access.ts` | Desk powers (`canBookOnBehalf`, `canOverrideGuestHousePolicy`, `canManageAnyBooking`…), `CONSOLE_SECTIONS`, `canUseConsoleSection`, `assignableRoles`, invoice powers. |
| `lib/booking-types.ts` | `bookingTypesFor`, `offersBookingTypeChoice`, `needsAlumniDetails`, `MEALS_ONLY_ROLES`, `serviceTypesFor`. |
| `lib/form-config.ts` | `RoleFormConfig`, `buildDefaultFormConfig`, `sanitizeFormConfig`, custom-field validation, the relationship dependency (`parentDependencyError`…) and one-of-each (`duplicateRelationshipError`…). |
| `lib/form-config-server.ts` | `getEffectiveFormConfig` — saved config or defaults. |
| `lib/booking-schema.ts` | `bookingPayloadSchema` — the config-driven zod schema both sides run; `checkOutOrderError`, `MAX_COPY_TO_EMAILS`, Aadhaar format. |
| `lib/booking-context-server.ts` | `bookingContextFor` — the Settings, debitable heads, projects and HOD names the form and `createBooking` both use. |
| `lib/debit-heads.ts` | Categories, `DEFAULT_DEBIT_RULES`, `FORBIDDEN_DEBIT_HEADS`, `debitCategoryFor`, `debitHeadsByType`, `upgradeDebitRules`, `describeDebit`. |
| `lib/policy.ts` | Stay cap and its exemptions (`stayLengthError`), the alumni guest house, the pets notice, the manager contact line. |
| `lib/settings.ts` (+ `-server.ts`, `-impact.ts`) | `DEFAULT_RULES`, the Settings schemas, `getRules` / `getOfficialEmails` / `getHostels`, and what a change would break. |
| `lib/occupancy.ts` | Capacity per room type, `INFANT_AGE_LIMIT`, `roomPartyError` and the Add-button reasons, `extraBedsFor`, `allocationCapacityError`, `describeCapacity`. |
| `lib/turnover.ts` | The turnaround buffer and accepted-overlap guard (`holdGuard`), conflict kinds, `TURNOVER_GRACE_HOURS`. |
| `lib/availability.ts` | Availability grid maths: `bucketOccupancyByHour`, `bucketOccupancyByDay`, `overlapSpans`, `availabilityRange`, `shiftAnchor`, `roomRangeStatus`, `freeRoomsByDay`; `MAX_AVAILABILITY_DAYS`. |
| `lib/meals.ts` | Meal keys and windows, `stayMealDays`, the notice period (`isMealBookable`, `mealLeadTimeError`, `firstBookableMealDate`), `normalizeMeals` (the only reader), the form's slot helpers, `kitchenHeadCount`. |
| `lib/invoice.ts`, `lib/tariffs.ts`, `lib/invoice-pdf.ts` | Invoices (see [15-billing-and-invoices.md](15-billing-and-invoices.md)). |
| `lib/operations.ts` | Extensions, no-shows, room ranges ("B-101 to B-120"), maintenance blocks. |
| `lib/booking-search.ts` | Archive search: criteria, tokenizer, pure matchers, faceting, sorting, paging, date presets. Shared by both stores. |
| `lib/sessions.ts`, `lib/auth.ts`, `lib/oidc.ts`, `lib/totp.ts`, `lib/security.ts`, `lib/admin-lock.ts`, `lib/crypto.ts`, `lib/uploads.ts`, `lib/env.ts` | Security (see [26-security.md](26-security.md)). |
| `lib/routes.ts` | `SIGN_IN_PATH` and `homeForRole`. (The official whitelist moved to Settings in migration 16.) |
| `lib/format.ts`, `lib/tz.ts` | Formatting, all delegating to `lib/tz.ts` — the institute timezone (`Asia/Kolkata`): `instituteIso` to parse, `formatInstitute*` / `instituteHour` / `instituteDayBounds` to read back, and UTC-safe helpers for `"yyyy-MM-dd"` calendar dates. |
| `lib/report-pdf.ts` | Client-side PDF rendering for the history report (dynamically imported). |
| `lib/revalidate.ts` | The three cache sets actions invalidate. |
| `lib/site.ts`, `lib/site-data.ts`, `lib/site-content.ts` | The public website's editable values and its content rendered from `lib/`. |

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

**The IAR split.** Alumni have no institute login. `iar_student_cell` books
**only for an alumnus** (its "Official" option was withdrawn) and routes to
`PENDING_IAR`; `iar_cell` (the
IAR Office) approves those *and* books itself, going straight to
`PENDING_GH_MANAGER` — routing it to its own queue would be self-approval.
`canReview()` additionally refuses `reviewer.id === requester.id`.
`historyScope` for the IAR Office spans three categories via `userRoles`
(Student Cell, its own, legacy alumni), which a single `userRole` cannot say.

## Reception (caretaker) console

`gh_caretaker` + `/caretaker` + `components/caretaker-console.tsx`. A deliberate
**subset** of the manager's console: today's checkouts, current occupants,
awaiting check-out, **checked out — to bill** (since 24 Sep 2026: reception
issues the invoice, and a vacated stay used to vanish from this console with
its bill open), upcoming stays, and marking guests Occupied / Vacated.
No allocation, no approvals, no cancellations — it never even loads the pending
queue.

Shared rather than copied, so the two consoles cannot drift:

- **`components/stays-table.tsx`** — the allocated-stays table and its lifecycle
  buttons, used by both consoles. Renders through `displayStatus()`.
- **`components/checkouts-today.tsx`** — rooms due back today, earliest first,
  overdue flagged, Mark as Vacated and **Invoice** inline. Only an `OCCUPIED`
  stay can be vacated; an approved guest who never arrived is closed off by the
  manager.

`canUpdateLifecycle()` / `LIFECYCLE_ROLES` (`lib/workflow.ts`) gate the one
action the two roles share, server-side in `updateBookingLifecycle`.

## Destructive actions in the developer console

**`components/ui/confirm-dialog.tsx`** replaced every `window.confirm`. It lists
the consequences and, for guest houses, users and bookings, requires the
operator to type the name, email or reference id. A stray Enter must not delete
a guest house and all its rooms.

## Email notifications — `lib/mail/`

Moved to [14-notifications.md](14-notifications.md): the transport seam, the
outbox, who gets which mail (To / CC), threads, digests, the cron and the
Mail Outbox console.

## Invoices, tariffs and dining

Moved to [15-billing-and-invoices.md](15-billing-and-invoices.md): tariffs,
building and issuing an invoice, the PDF, payments, Accounts mail, dining
bookings and the kitchen's day.

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
`app/globals.css`. Full table and rules in [16-public-site-and-ui.md](16-public-site-and-ui.md).

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
dummy LDAP account from [30-credentials-and-access.md](30-credentials-and-access.md)):
**18 personas**, 6 units and — mock only — **6 demo bookings** positioned so
every queue has something in it (DM001 student at the warden, DM002 Petrichor
at the legacy club stage, DM003 Student Cell alumni at the IAR Office, DM004
faculty at the manager, DM005 Director's Office approved, DM006 a meals-only
booking at the manager). Rooms are the office's real list: Bageshri 201, 202,
203, 204, 206, 302, 303, 305, 306, 307 (10) and Hamsanandi A4, B1–B4, C1–C4,
D1–D4 (13), all double sharing. Hamsanandi serves meals and Bageshri does not.

| Persona | Email |
| --- | --- |
| Student (Malhar) | `112201001@smail.iitpkd.ac.in` |
| Student (Saveri) | `142202014@smail.iitpkd.ac.in` |
| Employee | `priya@iitpkd.ac.in` |
| Official (whitelisted) | `admin@iitpkd.ac.in` |
| Club (Petrichor) | `petrichor@iitpkd.ac.in` |
| Council (Cultural Affairs, its secretary's mailbox) | `sec_arts@iitpkd.ac.in` |
| Faculty, **Faculty Advisor** of the council and Petrichor | `arun.prasad@iitpkd.ac.in` |
| IAR Student Cell | `alumnicell@iitpkd.ac.in` |
| Wardens | `warden.malhar@`, `warden.saveri@iitpkd.ac.in` |
| IAR Office | `iar@iitpkd.ac.in` |
| GH manager | `guesthouse@iitpkd.ac.in` |
| GH caretaker | `gh.reception@iitpkd.ac.in` |
| Developer | `developer@iitpkd.ac.in` |

**There is no alumnus persona** — alumni cannot sign in. Demo booking 3 is the
IAR Student Cell booking on behalf of Vikram Iyer (`101601023`), sitting in the
IAR Office's queue, so the new pipeline has something in it on first run.

Whitelisted official addresses are a Setting (`official_email_whitelist`):
`admin@`, `director.office@`, `registrar@iitpkd.ac.in`, plus `cse.office@` in
both seeds.
