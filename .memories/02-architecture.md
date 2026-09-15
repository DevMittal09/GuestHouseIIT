# Architecture

## Stack

| Layer | Choice | Version |
| --- | --- | --- |
| Framework | Next.js App Router (Turbopack) | 16.3.1 |
| UI runtime | React | 19.2.8 |
| Language | TypeScript | 5.x |
| Styling | Tailwind CSS | 4.x |
| Components | shadcn/ui (radix base, "nova" preset) | shadcn 4.x |
| Validation | zod | 4.x |
| Forms | react-hook-form (+ @hookform/resolvers) | 7.x |
| Backend | Supabase (Postgres + Storage), optional | @supabase/supabase-js 2.x |
| Toasts | sonner | 2.x |

There is **no test framework installed**. Verification approach is described in
[05-deployment.md](05-deployment.md#verifying-changes).

## Shape of the app

```
app/
  page.tsx                 login / persona picker
  (portal)/
    layout.tsx             authenticated shell + role-aware nav
    dashboard/             requester's own bookings
    book/                  the booking form
    warden/  fa/  iar/     reviewer queues (one component, three scopings)
    availability/          read-only room availability grid (every role)
    history/               booking history (requesters) / approval log (all roles)
    manager/               room allocation console
    admin/                 developer superadmin console
  actions/                 all mutations (server actions)
components/                feature components + components/ui primitives
lib/                       domain logic: types, workflow, form config, tz, store
supabase/                  migrations + seed SQL
```

Everything that writes data goes through a **server action** in `app/actions/`.
There are no API routes. Pages are server components that read through the store
and pass plain data to client components.

## The four ideas that explain most of the codebase

### 1. One data interface, two implementations

`lib/store/types.ts` declares a `DataStore` interface (27 methods). Two classes
implement it:

- `lib/store/mock.ts` — a JSON file (`.local-db.json`) plus `public/uploads/`.
  Zero setup, so the app runs immediately after `npm install`.
- `lib/store/supabase.ts` — Postgres tables plus a private Storage bucket.

`lib/store/index.ts` picks one **from the environment** at first use: Supabase if
`NEXT_PUBLIC_SUPABASE_URL` and a key are present, otherwise the mock.

> **Rule:** any new data operation must be added to the interface *and both*
> implementations, or one backend silently breaks. TypeScript catches this if you
> add to the interface first.

The mock store rewrites the entire JSON file on every mutation. It is
single-process and not concurrency-safe — fine for development, never for
production. It also self-heals on load: missing seeded profiles and a missing
`form_configs` key are added to older files, so introducing a new persona does
not require deleting the database.

### 2. Authentication has exactly one swap point

`lib/auth.ts` exposes `getCurrentUser()` / `requireUser()`. `getCurrentUser()`
reads the `gh_mock_user` cookie (a profile id) and looks the profile up. The
login page is a persona picker.

**No other module contains auth logic.** Replacing that one function with
Supabase Auth or institute SSO is the entire production migration. Resist the
temptation to read cookies or sessions anywhere else.

Authorization is separate and always server-side: every server action re-checks
the caller (`requireUser`, explicit role checks, `canReview`, `requireDeveloper`).
The UI hiding a button is never the security boundary.

### 3. The booking form is data, not code

This is the least obvious and most important part. `lib/form-config.ts` defines
`RoleFormConfig`, which describes a requester role's form:

- which guest houses that role may book;
- a `FieldMode` (`required` | `optional` | `hidden`) for each guest field —
  name, age, gender, relationship, ID number, ID document;
- whether *relationship* is a strict dropdown (with an editable option list) or
  free text;
- whether the alumni ID card is required, optional or hidden;
- an optional info banner;
- a list of admin-defined **custom fields** (text, textarea, number, date,
  select, checkbox).

**Resolution order** (`lib/form-config-server.ts`):

1. the developer-saved config from the store, **if one exists**;
2. otherwise `buildDefaultFormConfig(role, guestHouses)` — the spec defaults;
3. then `sanitizeFormConfig` drops guest houses that no longer exist.

> **Trap:** editing `buildDefaultFormConfig` only affects roles that have *no*
> saved config. If a role was ever saved from the Form Builder UI, its stored row
> wins. "Reset to spec defaults" deletes that row. Check `form_configs` and
> `.local-db.json` before concluding a default change had no effect.

The same config object builds the zod schema in `lib/booking-schema.ts` on the
**client and the server**, so `hidden` / `optional` / `required` cannot be
bypassed by a crafted request. Custom-field answers are snapshotted onto the
booking together with their label, so a reviewer still sees the original question
text after an admin later edits the form.

#### Relationship dependencies

The config also carries a *relationship dependency*, which is how the institute
rule "siblings and grandparents only when a parent is staying" is expressed
without hardcoding a role check:

- `parent_relationships` — options that satisfy the dependency (Mother, Father);
- `dependent_relationships` — options gated behind it (Grandmother,
  Grandfather, Siblings).

Both default to the student spec and are empty for every other role. The rule is
evaluated by one function, `parentDependencyError()`, called from the booking
form (which greys out the gated `<option>`s) and from the zod schema (which
actually enforces it, per-guest, server-side).

> **Trap.** A developer can rename the relationship options from the Form
> Builder. `sanitizeFormConfig` therefore intersects both arrays with the
> options actually offered, and **drops the rule entirely if no parent option
> survives** — otherwise the gated options would be permanently unselectable
> with nothing in the UI explaining why. It also backfills both arrays from the
> spec defaults when a saved row predates the feature, so existing student
> configs pick the rule up rather than silently losing it.

### 4. Every wall-clock time is institute time

`lib/tz.ts` pins the app to **Asia/Kolkata**. Instants are stored as ISO/UTC and
only two operations are zoned:

| Direction | Function | Used by |
| --- | --- | --- |
| A time the user typed → an instant | `instituteIso()` | `toIso()` in `createBooking`, the zod schema's date comparisons |
| An instant → something a human reads | `formatInstitute*`, `instituteHour`, `instituteDayBounds` | `lib/format.ts`, the availability grid, the date presets |

Two rules follow, and they are the whole discipline: **never**
`new Date("2026-09-15T12:00")` (the spec resolves a naked datetime string in the
*process* timezone) and **never** format an instant with date-fns `format`,
`toLocaleString()` or `getHours()`.

This is a fixed bug rather than a precaution. `toIso()` was
`new Date(datetimeLocal).toISOString()`, which is right on a machine set to IST
and wrong everywhere else; on a UTC host a 12:00 booking was stored as `12:00Z`
and the manager's console read it back as 5:30 PM. The parse is the dangerous
half — it puts a wrong value in the database, and rows written that way stay
wrong after the code is fixed (`supabase/repairs/`). A fixed zone rather than the
viewer's is deliberate: the guest house is one building, so everyone must read
"12:00" as the same moment. It also removes the SSR/hydration mismatch class,
because the rendered string no longer depends on which machine rendered it.

## The approval workflow

`lib/workflow.ts` is the single source of truth.

| Requester | Entry status | Path |
| --- | --- | --- |
| student | `PENDING_WARDEN` | warden → manager |
| club | `PENDING_FA` | faculty advisor → manager |
| alumni | `PENDING_IAR` | IAR cell → manager |
| employee | `PENDING_GH_MANAGER` | manager |
| official | `PENDING_GH_MANAGER` | manager (direct, highest priority) |

Rules encoded there:

- Check-in must fall within **one month** of today (`latestCheckIn`).
  `isAdvanceWindowExempt()` exempts **`official` only** — dignitary visits are
  arranged on the institute's own notice, and the same exemption is why they
  bypass intermediate review. The cap applies to check-in, not check-out: a stay
  that starts inside the window may run past it.
- An intermediate approval always forwards to `PENDING_GH_MANAGER`.
- The manager does **not** approve through the generic review action. Approval
  happens via `allocateRooms()`, which assigns rooms and sets `APPROVED` in one
  step; `reviewBooking` explicitly refuses manager approvals. This makes
  "approved with no rooms assigned" unrepresentable.
- Rejection requires a non-empty reason, enforced server-side at every tier.
- Reviewer scoping lives in `canReview()`: wardens are limited to their
  `hostel_name`, faculty advisors to their `department_or_club`.

### Post-approval lifecycle

After `APPROVED`, the GH Manager controls the booking through further states:

```
APPROVED → OCCUPIED → VACATED
         ↘ CANCELLATION_REQUESTED → CANCELLATION_APPROVED
         ↘ CANCELLED (direct, by manager or pre-approval by requester)
```

- `OCCUPIED` — the guest has checked in.
- `VACATED` — the guest has checked out; rooms are released.
- `CANCELLATION_REQUESTED` — the requester asks to cancel an already-approved
  booking (with a mandatory reason). The manager reviews and either approves
  (`CANCELLATION_APPROVED`) or rejects the cancellation.
- Direct `CANCELLED` is only available pre-approval or by the manager.

`ROOM_HOLDING_STATUSES` (`APPROVED`, `OCCUPIED`, `CANCELLATION_REQUESTED`) in
`lib/workflow.ts` defines which statuses keep rooms reserved. Room occupancy
queries and the room grid use this instead of checking just `APPROVED`.

**Status is not the same fact as time, and the console keeps them apart.**
`OCCUPIED` records that the guest walked in, so `occupancyNotStartedError()`
refuses the transition before the booking's check-in — enforced in
`updateBookingLifecycle`, with the button disabled from the same function.
`stayPhase()` (`upcoming` | `current` | `past`) is the read side, and `/manager`
groups by it rather than by status:

| Section | Phase | Why it is separate |
| --- | --- | --- |
| Current occupants | `current` | Who is in the building right now |
| Awaiting check-out | `past`, still holding rooms | Never marked Vacated, so still consuming inventory |
| Upcoming stays | `upcoming` | Allocated, not started; cannot be marked Occupied yet |

One combined table previously mixed all three, so a booking for next week read
as though it were occupied.

## Room allocation and clash detection

`components/room-grid.tsx` renders the cinema-style grid — green available, red
occupied, blue selected — grouped into double-sharing and single rooms.

**Occupancy is read for the booking's own dates and nothing else.** The grid
used to carry its own date/time selector, but `allocateRooms()` always wrote
holds for the booking's *real* period. Shifting the displayed window past a
conflict turned an already-allotted room green; the write still failed safely on
the exclusion constraint, but the grid was offering rooms belonging to another
booking. Occupied rooms now render `disabled`, so such a room cannot be picked
at all. Browsing other dates belongs to `/availability`.

### Occupancy is a database constraint, not a code path

`room_holds` holds one row per (booking, room) with a `tstzrange` period and an
**exclusion constraint** that refuses two overlapping holds on the same room.
See [04-database.md](04-database.md#room_holds--occupancy-the-database-can-enforce)
for the DDL.

The old design read occupancy, decided there was no clash, then wrote — a
check-then-act race that a single manager almost never loses and two managers
eventually do. `allocateRooms()` now does **no pre-flight occupancy check at
all**: checking first would only reintroduce the race. It writes, and the loser
of a race gets `RoomClashError` telling them to refresh the grid.

The invariant is *a hold row exists exactly while the booking holds the room*,
which collapses a lot of incidental complexity:

- occupancy queries are a plain read of `room_holds`, with no status filter;
- `updateBookingStatus` deletes holds whenever the new status leaves
  `ROOM_HOLDING_STATUSES`, so releasing rooms is one rule in one place rather
  than something each transition has to remember;
- `Booking.assigned_room_ids` is **derived from holds on read** — the column is
  gone, so the two cannot disagree.

`during` is half-open `[check_in, check_out)`, which is exactly the strict
overlap the app always applied: a checkout and a same-instant check-in do
**not** clash.

### Capacity

`lib/occupancy.ts` owns how many people fit. A double sleeps 2 on its own beds
and 3 once an extra bed is rolled in; a single sleeps 1, or 2. The field is
named `withExtraBed` rather than `max` deliberately — the third occupant is not
a property of the room, it is a bed somebody has to arrange, and
`extraBedsNeeded()` puts that number in front of the manager at allocation time.

**Infants** — under 10, sharing a guardian's bed — are one switch on the
booking, `has_infant` (migration 7), saying whether any are coming. They have no
guest row, no count and no ID, and occupy no bed, so on a new booking every guest
row is a bed. Bookings made before migration 7 recorded infants as guest rows
carrying `is_infant`, and those rows still exist — so capacity for a *stored*
booking counts `countBedGuests(guests)` rather than `guests.length`, and
`hasInfant(booking)` reads either the switch or a legacy row.

It is checked twice because two different things are known at the two moments:
`requestedRoomsError()` at submission, when only a room *count* exists, and
`allocationCapacityError()` at allocation, when the manager has picked actual
rooms with actual types. The booking form adds a third, softer check — it will
not let you add more guests than the rooms you picked can sleep.

## Room availability (`/availability`)

The manager's grid answers "which rooms can I give *this* booking". Requesters
had no way to ask the prior question — "is anything free that week?" — so
`/availability` is a read-only view of the same occupancy data, open to **every
signed-in role**. It is the only route with no role gate.

The chart is a time × room matrix: room numbers across the X axis, time down
the Y axis, red where a room is held and blank where it is free, with a per-room
list of booking periods underneath. **Day, Week and Month views** share those
axes. The day view has a row per hour; the week and month views a row per day,
with time also running down *inside* each day's row, so a stay is drawn as one
continuous bar from check-in to check-out rather than a colour per day. Keeping
time vertical at every scale is deliberate — switching views zooms out instead
of rotating the picture (see [06-decisions.md](06-decisions.md)).

**The chart itself is `components/occupancy-chart.tsx`**, shared with
`components/booking-availability.tsx`, which embeds the same picture in the
booking form for the guest house and check-in date being chosen — requesters
were otherwise picking dates blind and discovering a clash only when the
submission bounced. One component, one action, one bucketing, so the view a
requester uses to choose and the view the manager uses to allocate cannot
drift apart.

Three things are worth knowing:

- **A third store method, not a reuse of the second.** `getOccupiedRoomIds`
  collapses to a set of ids, which loses the periods the chart needs.
  `listRoomOccupancy(guestHouseId, from, to)` returns one segment per (room,
  booking) instead, over the same statuses and the same strict overlap. The two
  must agree; they are checked against each other rather than assumed.
- **The calendar maths is pure functions in `lib/availability.ts`, not
  component code.** `bucketOccupancyByHour()` decides which of a day's 24 hours
  each booking holds; `availabilityRange()` and `shiftAnchor()` decide which
  days a week or month view covers (Monday–Sunday weeks, calendar months, a
  month step that clamps 31 January to 28 February); `bucketOccupancyByDay()`
  clips each booking to the range as a bar and counts booked minutes per day.
  Putting it in `lib/` follows the same reasoning as `lib/booking-search.ts`:
  the boundary behaviour is where the bugs are, so it has to be reachable by a
  test. A stay checking out at 11:00 releases the 11 AM hour, and a back-to-back
  booking starting at that instant picks it up — the same half-open semantics
  as allocation. Day arithmetic on `"yyyy-MM-dd"` strings runs in UTC
  (`addDaysToDateValue` in `lib/tz.ts`) because a calendar date has no zone.
- **Identity is stripped per viewer, in the action.** `getRoomAvailability`
  returns `requester_name` and `purpose_of_visit` only to `gh_manager` and
  `developer`; everyone else sees periods, reference ids and statuses. A student
  checking availability has no business seeing who is in room B-204. The store
  populates the fields and the action removes them, so the filtering happens in
  exactly one place. The action also refuses a window longer than
  `MAX_AVAILABILITY_DAYS` (62 days): a month view needs 31, and without a cap
  any signed-in user could read every hold ever written in one request.

## Archive search & history

`/history` is accessible to **all roles**. The view adapts per role:

| Role type | What they see | Nav label |
| --- | --- | --- |
| Requesters (student, employee, official, club, alumni) | Their own bookings only (`userId` scope) | "Booking History" |
| Reviewers (warden, FA, IAR) | Their jurisdiction + own approval decisions | "Approval Log" |
| Admins (GH manager, developer) | All bookings across the system | "Approval Log" |

`searchBookings(criteria)` is the one data operation behind `/history`. The
matching rules are *not* in either store — they live in `lib/booking-search.ts`
as pure functions over hydrated bookings, and both stores call the same
`runBookingSearch()`. Each store only decides how to produce candidate rows:

- **Mock** — everything is already in memory, so it hydrates the lot and filters.
- **Supabase** — pushes the cheap, indexable predicates into SQL (guest house,
  requester role, `userId`, check-in range), caps the scan at
  `SEARCH_SCAN_LIMIT` (1000) and filters the rest in JS.

Keyword matching spans joined tables (guests, rooms, audit logs) and PostgREST
cannot express that, which is why the refinement happens in JS. When a scan hits
the cap the result carries `truncated: true` and the UI tells the user to narrow
the search rather than silently showing a partial archive.

> **Trap that already bit once.** `statuses` must **not** be pushed down to SQL.
> `runBookingSearch` reports per-status facet counts computed *before* the status
> filter is applied, so the candidate set has to still contain the other
> statuses. Pushing it down made the Supabase tiles collapse to zero while the
> mock store's stayed correct — two backends, one interface, silently disagreeing.

Authorization is the caller's job, not the store's: `historyScope(user)` in
`lib/workflow.ts` returns the criteria a role is confined to, and
`criteriaFromParams()` spreads it last so the query string can only narrow.

### Exporting

Both exports read exactly what the filters currently select, and they sit
together next to the result count as an "Export as CSV / PDF" pair — once the
filters are set, the only decision left is the file format.

That was not the first design: the PDF had its own Today / Last 7 days / This
month buttons, which duplicated the check-in range filter and — worse — silently
overwrote it, so a range chosen in the filter bar and a range chosen on the
export button could disagree about what came out.

The presets themselves were worth keeping; they were just in the wrong place.
They now live in the filter bar as two chip rows (`DATE_PRESET_GROUPS` in
`lib/booking-search.ts`). Clicking the lit chip clears it, and
`matchDatePreset()` highlights whichever chip the current `from`/`to` equals, so
a hand-picked range and a preset are the same state rather than two competing
ones. Each chip's tooltip shows the dates it resolves to.

**Rolling and calendar ranges are separate groups**, because they are different
questions and the first version conflated them:

| Group | On 15 Sep 2026 | |
| --- | --- | --- |
| Rolling | Last 30 days | 16 Aug – 15 Sep |
| Calendar | Last month | 1 Aug – 31 Aug |
| Calendar | This month | 1 Sep – **30 Sep** |

Rolling windows are measured from today; calendar periods are whole named
periods and deliberately cover the **entire** period including days still to
come, so "This month" catches arrivals that have not happened yet. Weeks run
Monday to Sunday.

Two presets can legitimately resolve to the same range — on 31 January, "Last
30 days" and "This month" are both 1–31 January — so `matchDatePreset` returns
the first in display order.

> **Trap.** Build the `yyyy-MM-dd` from local date parts. The original preset
> code used `toISOString().slice(0, 10)`, which in IST (UTC+5:30) reports the
> *previous* day for any time before 05:30 — "Today" would have quietly meant
> yesterday for the first five and a half hours of every day.

- **CSV** — `exportHistoryCsv` (`app/actions/history.ts`), open to every role.
- **PDF** — `exportHistoryPdf` (`app/actions/history-pdf.ts`), GH Manager and
  Developer only. The action returns **report data, not markup**;
  `lib/report-pdf.ts` draws a real A4-landscape PDF in the browser with jsPDF
  (dynamically imported) and saves it.

Both take only a query string and re-derive the user, scope and params
server-side, so an export can never exceed what the caller may see.

## Audit trail

Every status change appends a `booking_logs` row through
`updateBookingStatus(id, update, log)`. The store fills in `previous_status`
itself, so callers pass only `new_status`. `action_by_name` is denormalized and
`action_by` is nullable (`on delete set null`) so history survives deletion of the
acting account.
