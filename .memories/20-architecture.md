# Architecture and code map

**Why** the codebase is shaped the way it is, and **where** the code for each
feature lives. The reasoning for a particular choice, with what was rejected,
is in [02-decisions.md](02-decisions.md); how to run and verify any of it is
[22-running-and-testing.md](22-running-and-testing.md).

---

## Part 1 — How it is put together


### Stack

| Layer | Choice | Version |
| --- | --- | --- |
| Framework | Next.js App Router (Turbopack) | 16.3.x |
| UI runtime | React | 19.2.8 |
| Language | TypeScript | 5.x |
| Styling | Tailwind CSS | 4.x |
| Components | shadcn/ui (radix base, "nova" preset) | shadcn 4.x |
| Validation | zod | 4.x |
| Forms | react-hook-form (+ @hookform/resolvers) | 7.x |
| Backend | Supabase (Postgres + Storage), optional | @supabase/supabase-js 2.x |
| Toasts | sonner | 2.x |

Also: date-fns, jsPDF (+ autotable), nodemailer, ldapts. Tests: Vitest
(`npm test`, `tests/`) and Playwright (`npm run test:e2e`, `e2e/`). How to run
and verify: [22-running-and-testing.md](22-running-and-testing.md).

### Shape of the app

```
app/
  (site)/                  PUBLIC website (19 Sep 2026): / home, book-room, book-meal,
                           guidelines, gallery, contact, privacy, sign-in,
                           mock-login (Mock Authentication — open while Google is
                           unconfigured) — see 14-public-site-and-ui.md
  (portal)/
    layout.tsx             authenticated shell + role-aware nav
    dashboard/             requester's own bookings
    book/                  the booking form (and "Booking as" for Faculty Advisors)
    warden/ hod/ approvals/ iar/   reviewer queues (one ReviewQueue component);
                           fa/ only redirects to approvals/
    availability/          read-only room availability grid (every role)
    history/               booking history (requesters) / approval log (staff)
    manager/  manager/meals/   allocation console and the kitchen's day
    caretaker/             reception
    admin/                 the console (13 sections; manager 9, developer all)
  actions/                 all mutations (server actions)
  api/                     the only route handlers: auth/google/{start,callback},
                           documents/[...path], invoices/[id]/pdf,
                           invoices/preview/[bookingId], mail/{cron,dispatch}
components/                feature components + components/ui primitives
lib/                       domain logic: types, workflow, form config, tz, store
supabase/                  migrations + seed SQL
```

Everything that writes data goes through a **server action** in `app/actions/`.
The route handlers under `app/api/` exist only where a server action cannot
serve: the Google OAuth redirect and callback, file downloads (documents,
invoice PDFs) and the two cron endpoints. Pages are server components that read
through the store and pass plain data to client components.

### The four ideas that explain most of the codebase

#### 1. One data interface, two implementations

`lib/store/types.ts` declares a `DataStore` interface. Two classes implement
it:

- `lib/store/mock.ts` — a JSON file (`.local-db.json`) plus `.uploads/`
  (outside `public/`, served only through `/api/documents`).
  Zero setup, so the app runs immediately after `npm install`.
- `lib/store/supabase.ts` — Postgres tables plus a private Storage bucket.

`lib/store/index.ts` picks one **from the environment** at first use: Supabase if
`NEXT_PUBLIC_SUPABASE_URL` and a key are present, otherwise the mock.

> **Rule:** any new data operation must be added to the interface *and both*
> implementations, or one backend silently breaks. TypeScript catches this if you
> add to the interface first.

The mock store rewrites the entire JSON file on every mutation. It is
single-process and not concurrency-safe — fine for development, never for
production. It also self-heals on load: missing seeded profiles, units and
keys later features introduced are added to older files, so introducing a new
persona or column does not require deleting the database.

#### 2. Authentication has exactly one swap point

`lib/auth.ts` exposes `getCurrentUser()` / `requireUser()`. Since Phase 8 a
session is a **row** in `sessions` and the cookie holds an opaque token
(`lib/sessions.ts`); `lib/auth.ts` is the only module that reads it. The
sign-in card (`/sign-in`, also embedded in the public `/book-room` and
`/book-meal`) opens a session through two doors: **LDAP** username + password,
and a second button that is **"Sign in with Google"** (the real OpenID
Connect flow) when `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and `APP_URL`
are set, and **"Mock Authentication"** — the persona picker at `/mock-login` —
otherwise (`mockLoginEnabled()`; `MOCK_LOGIN=false` closes it). The
pre-Phase-8 `gh_mock_user` cookie is honoured only with `DEV_LOGIN=true`
outside production. `/` is the public website, so signed-out guards redirect to
`SIGN_IN_PATH`, not `/`.

LDAP is the third environment-selected seam, alongside the store and the
mailer:

| Condition | Directory | Accounts come from |
| --- | --- | --- |
| `LDAP_URL` set | `lib/ldap/ldap-directory.ts` (`ldapts`, search-then-bind) | the institute LDAP server |
| otherwise | `lib/ldap/mock-directory.ts` | dummy accounts ([05-credentials-and-security.md](05-credentials-and-security.md)) |

The directory only answers "is this the password for this username". Identity
inside the portal (role, hostel, club) stays in `profiles`, joined by
`profiles.ldap_uid` (migration 12). So the directory never needs to know about
the portal's roles, and a directory login with no profile gets in nowhere.

**No other module contains auth logic.** The session is a server-side row
keyed by the SHA-256 of an opaque cookie token (Phase 8), so a forged cookie
gets nothing. What remains for production is connecting the real directory
(`LDAP_URL`) and configuring Google (or closing Mock Authentication). Resist the
temptation to read cookies or sessions anywhere else.

Authorization is separate and always server-side: every server action re-checks
the caller (`requireUser`, explicit role checks, `canReview` / `canReviewBooking`, `requireConsole(section)`).
The UI hiding a button is never the security boundary.

#### 3. The booking form is data, not code

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

##### Relationship dependencies

The config also carries a *relationship dependency*, which is how the institute
rule "siblings and grandparents only when a parent is staying" is expressed
without hardcoding a role check:

- `parent_relationships` — options that satisfy the dependency (Mother, Father,
  Guardian);
- `dependent_relationships` — options gated behind it (Grandmother,
  Grandfather, Siblings).

Both default to the student spec and are empty for every other role. The rule is
evaluated by one function, `parentDependencyError()`, called from the booking
form (which greys out the gated `<option>`s) and from the zod schema (which
actually enforces it, per-guest, server-side).

A third list works the same way (23 Sep 2026):

- `unique_relationships` — options a requester has only **one** of (Mother,
  Father, Guardian, Grandmother, Grandfather for a student; **not** Siblings),
  so they may appear once per request, across every room.

`duplicateRelationshipError()` is its matcher, again called from both sides; the
form greys the option out on every *other* guest (`usedUniqueRelationships`) and
the schema attaches the error to the **repeat**, not the first one.
`sanitizeFormConfig` empties it for a free-text role, where there is no option
list to be unique within.

> **Trap.** A developer can rename the relationship options from the Form
> Builder. `sanitizeFormConfig` therefore intersects both arrays with the
> options actually offered, and **drops the rule entirely if no parent option
> survives** — otherwise the gated options would be permanently unselectable
> with nothing in the UI explaining why. It also backfills both arrays from the
> spec defaults when a saved row predates the feature, so existing student
> configs pick the rule up rather than silently losing it.

#### 4. Every wall-clock time is institute time

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

### The approval workflow

`lib/workflow.ts` is the single source of truth.

| Requester | Booking type | Route (`routeFor`) | Debitable heads (default, Settings) |
| --- | --- | --- | --- |
| student | personal | Assistant Warden → GH Manager | Personal |
| club — raised by its **Faculty Advisor** | official | **Direct → GH Manager** (a club request stored before 24 Sep 2026: council secretary → HOD if any → GH Manager) | Student Fund / Special Budget |
| employee — faculty | official | **HOD** → GH Manager | PDF / Project / Department / Special Budget / Personal |
| employee — staff | official | **HOD** → GH Manager | Personal |
| employee | personal | GH Manager | Personal |
| official — officer office (Director, Registrar) | official | **Direct** → GH Manager, or **Requires HOD approval** → its own head → GH Manager | Institute / Department / Special Budget / Student Fund / Hostel Funds / Alumni Fund |
| official — department office | official | Direct, or → its department's **HOD** → GH Manager | the same six - one list for both classes of office |
| iar_cell (IAR Office) | official / alumni | Direct, or → its head (HOD) → GH Manager (never `PENDING_IAR`: it *is* that approver) | the offices' six (alumni: Alumni Fund / Special Budget) |
| iar_student_cell | alumni | IAR Office → GH Manager | Alumni Fund / Special Budget |
| any | meals only | GH Manager | dining heads (Phase 6) |
| alumni | *retired* | kept only for stored bookings | — |

Rules encoded there:

- Check-in must fall within **one month** of today (`latestCheckIn`, a
  Setting). `isAdvanceWindowExempt()` exempts **`official`, `gh_manager` and
  `developer`** — dignitary visits are arranged on the institute's own notice,
  and the desk books whatever the institute has already committed to. The cap
  applies to check-in, not check-out.
- An intermediate approval forwards to the **next stage of the booking's own
  route** (`nextStatusAfter` over `approvalStagesFor`), else the GH Manager.
- The manager does **not** approve through the generic review action. Approval
  happens via `allocateRooms()`, which assigns rooms and sets `APPROVED` in one
  step; `reviewBooking` explicitly refuses manager approvals. This makes
  "approved with no rooms assigned" unrepresentable.
- Rejection requires a non-empty reason, enforced server-side at every tier.
- Reviewer scoping lives in `canReview()`: wardens are limited to their
  `hostel_name`; HODs and council secretaries are found **by appointment**
  through `units` (`hodApproversFor`, `approversOf`); a legacy
  `faculty_advisor` account falls back to its `department_or_club`. Where a
  booking exists, `canReviewBooking` also refuses whoever raised it.

#### Post-approval lifecycle

After `APPROVED`, the GH Manager controls the booking through further states:

```
APPROVED → OCCUPIED → VACATED
         ↘ CANCELLATION_REQUESTED → CANCELLATION_APPROVED
         ↘ CANCELLED (direct, by manager or pre-approval by requester)
```

- `OCCUPIED` — the guest has checked in.
- `VACATED` — the guest has checked out; rooms are released.
- `CANCELLATION_REQUESTED` — the requester asks to cancel (with a mandatory
  reason) — **from any open status, pending or approved**; a stay already
  Occupied is ended at the desk instead. The manager approves
  (`CANCELLATION_APPROVED`) or declines, which restores the status the booking
  had.
- Direct `CANCELLED` is the manager's (`managerCancelBooking`, a no-show
  release) or the developer's force-status override.

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

### Room allocation and clash detection

`components/room-grid.tsx` renders the cinema-style grid — green available, red
occupied (disabled), blue selected, hatched turnaround, amber soft overlap — and
splits into double-sharing and single sections only when both kinds exist
(both guest houses are all double sharing today).

**Occupancy is read for the booking's own dates and nothing else.** The grid
used to carry its own date/time selector, but `allocateRooms()` always wrote
holds for the booking's *real* period. Shifting the displayed window past a
conflict turned an already-allotted room green; the write still failed safely on
the exclusion constraint, but the grid was offering rooms belonging to another
booking. Occupied rooms now render `disabled`, so such a room cannot be picked
at all. Browsing other dates belongs to `/availability`.

#### Occupancy is a database constraint, not a code path

`room_holds` holds one row per (booking, room) with a `tstzrange` period and an
**exclusion constraint** that refuses two overlapping holds on the same room.
See [21-database.md](21-database.md#room_holds--occupancy-the-database-can-enforce)
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

`during` is half-open `[check_in, check_out)`. Since migrations 14 and 17 the
constraint compares a derived `guard` column instead, which adds the
**turnaround buffer** (Phase 3, migration 17; a Setting,
`rules.booking.buffer_minutes`, 4 hours by default, 0 = off): the constraint
compares each hold's `guard`, which is `[check_in, check_out + buffer)` — only
the end padded, so the real gap is the buffer, not twice it — and, for a
turnover the manager accepted, `[check_in + 2 h + buffer, check_out − 2 h)`, so
an accepted overlap is still at most two hours. `during` stays the truthful
stay. With the buffer at 0, a checkout and a same-instant check-in do not
clash, as before.

#### Capacity

`lib/occupancy.ts` owns how many people fit. A double sleeps 2 on its own beds
and 3 once an extra bed is rolled in; a single sleeps 1, or 2. The field is
named `withExtraBed` rather than `max` deliberately — the third occupant is not
a property of the room, it is a bed somebody has to arrange, and
`extraBedsFor(guests, rooms)` puts that number in front of the manager at
allocation time, counted against the rooms actually picked.

**Infants** — under 5 years, sharing a guardian's bed — are entered as guest rows within a room card (migration 11), with their `is_infant` flag computed automatically based on age. They occupy no bed, but they count towards the room's **combined** limit: a room card holds `max_occupants_per_room` people (4) of whom at most `max_guests_per_room` (3) may need a bed and at most `max_infants_per_room` (3) may be infants. That combination — 3 + 1, 2 + 2 or 1 + 3, never 3 + 2 — is the office's own rule (23 Sep 2026) and is why there are three settings rather than two. Prior to migration 11, infants were just a boolean switch on the booking, so legacy bookings were migrated into synthetic room cards while retaining their original infant flags. `describeParty(booking)` supports both shapes.
It is checked twice because two different things are known at the two moments:
`roomPartyError()` per room card at submission (the combination above), and
`allocationCapacityError()` at allocation, when the manager has picked actual
rooms with actual types. The booking form adds a third, softer check — it will
not let you add more guests than the rooms you picked can sleep.

### Room availability (`/availability`)

The manager's grid answers "which rooms can I give *this* booking". Requesters
had no way to ask the prior question — "is anything free that week?" — so
`/availability` is a read-only view of the same occupancy data, open to **every
signed-in role**. It is the only route with no role gate.

> **Two different answers since 7 Oct 2026.** The chart below is the **desk's**
> — manager, caretaker, developer (`SEES_ROOMS`). Everyone else is sent **how
> many rooms are free and nothing else**: `getRoomAvailability` returns
> `AvailabilityCounts` with `rooms` and `segments` **empty**, and
> `components/availability-counts.tsx` draws "N rooms available" per day, with
> the hours underneath when a single day is shown. Which room is free is of no
> use to a requester — they cannot choose one, the manager allocates — and
> publishing the grid told anyone with a login which rooms a named stay
> occupied. A component that has no room numbers cannot leak one. The
> simplified chart requesters had from 30 Sep, and the `simple` / `detailed`
> flags behind it, are retired.

The chart is a time × room matrix: room numbers across the X axis, time down
the Y axis, red where a room is held and blank where it is free, with a per-room
list of booking periods underneath. **Day, Week and Month views** share those
axes. The day view has a row per hour; the week and month views a row per day,
with time also running down *inside* each day's row, so a stay is drawn as one
continuous bar from check-in to check-out rather than a colour per day. Keeping
time vertical at every scale is deliberate — switching views zooms out instead
of rotating the picture (see [02-decisions.md](02-decisions.md)).

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
  test. A stay checking out at 11:00 releases the 11 AM hour — the same
  half-open semantics as allocation — and the turnaround buffer after it is
  bucketed separately (`turnaround`) and drawn hatched, never as booked. Day arithmetic on `"yyyy-MM-dd"` strings runs in UTC
  (`addDaysToDateValue` in `lib/tz.ts`) because a calendar date has no zone.
- **Identity is stripped per viewer, in the action** — and since 7 Oct 2026 so
  are the rooms. `getRoomAvailability` returns `requester_name` and
  `purpose_of_visit` only to `gh_manager` and `developer`
  (`CAN_SEE_OCCUPANT`), the rooms and segments only to the desk
  (`SEES_ROOMS`), and counts to everybody. A student checking availability has
  no business seeing who is in room 204, or which room it is. The store
  populates the fields and the action removes them, so the filtering happens in
  exactly one place. The action also refuses a window longer than
  `MAX_AVAILABILITY_DAYS` (62 days): a month view needs 31, and without a cap
  any signed-in user could read every hold ever written in one request.

### Archive search & history

`/history` is accessible to **all roles**. The view adapts per role:

| Role type | What they see | Nav label |
| --- | --- | --- |
| Requesters (student, employee, official, club, IAR Student Cell) | Their own bookings only (`userId` scope); approvers by appointment also get their units' requests | "Booking History" |
| Reviewers (warden, legacy FA account, IAR Office) | Their jurisdiction | "Approval Log" |
| Desk and developer (GH manager, caretaker, developer) | All bookings | "Approval Log" |

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

#### Exporting

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

### Email notifications

`lib/mail/` (16 Sep 2026). Two seams, deliberately separate, and the split is
the whole design:

- **`Mailer` is the transport** — one `send()` method, chosen from the
  environment by `getMailer()` exactly the way `lib/store/index.ts` chooses a
  backend. `SmtpMailer` (nodemailer) when `MAIL_USER` + `MAIL_APP_PASSWORD` are
  set, `FileMailer` writing `.local-mail/*.eml` otherwise, `DryRunMailer` when
  `MAIL_DRY_RUN=true`. The file mailer preserves the zero-setup first run for
  the same reason `MockStore` does. Moving to the institute's own SMTP relay
  should be an `.env.local` change and nothing else.
- **`email_outbox` is the queue** (migration 10). **Nothing sends inside a
  server action.** The action writes rows and schedules `dispatchOutbox()` with
  `after()` from `next/server`; `lib/mail/dispatch.ts` claims, sends and
  settles them. Three reasons, the third of which fails silently: a slow SMTP
  host must not make the requester wait, a failed send must not fail a stored
  booking, and on a serverless host un-awaited work is frozen the moment the
  response is returned.

Everything else follows from those two:

- **The notification hooks live in the server actions, not
  `updateBookingStatus()`.** The store method sees only a status pair; the
  action knows *why* — the reason typed, the rooms picked, whether a
  cancellation was approved or declined. Hooking the store would also have
  mailed on the developer console's force-status override, which is a repair
  tool.
- **Recipients come from `canReview()`** (`lib/mail/recipients.ts`) — the same
  predicate that decides whether a reviewer's button works, so mail cannot
  drift from authority.
- **Correctness rests on a unique `idempotency_key`** plus
  `on conflict do nothing`, keyed on the booking's `updated_at` for a
  transition and the institute calendar date for a digest. Retries queue
  nothing, and the cron schedule becomes advisory rather than exact.
  `claim_queued_emails()` claims rows `for update skip locked`, so two
  dispatchers get disjoint batches.
- **HTML and plain text render from one block list** (`lib/mail/render.ts`), so
  the two cannot diverge.
- **Scheduled work is two ordinary route handlers** — `/api/mail/dispatch`
  drains the queue, `/api/mail/cron` runs the daily digests, reminders,
  per-guest-house day-wise log and 48-hour escalations. They are the only route
  handlers in the app; everything else is a server action. Both are guarded by
  `CRON_SECRET`.

Who gets which mail: [10-roles-and-workflows.md](10-roles-and-workflows.md); the reasoning
and the rejected alternatives in [02-decisions.md](02-decisions.md).

### Audit trail

Every status change appends a `booking_logs` row through
`updateBookingStatus(id, update, log)`. The store fills in `previous_status`
itself, so callers pass only `new_status`. `action_by_name` is denormalized and
`action_by` is nullable (`on delete set null`) so history survives deletion of the
acting account.

---

## Part 2 — Feature to file map


### Entry and session

| Concern | File |
| --- | --- |
| Public website (home, booking entry points, guidelines, gallery, contact) | `app/(site)/*`, `components/site/*` — see [14-public-site-and-ui.md](14-public-site-and-ui.md) |
| Sign-in (LDAP + Google button) | `app/(site)/sign-in/page.tsx`, `app/(site)/book-room`, `app/(site)/book-meal` → `components/site/sign-in-panel.tsx` → `components/login-form.tsx` |
| Google sign-in (real OpenID Connect: state, PKCE, verified id_token) | `lib/oidc.ts`, `app/api/auth/google/start`, `app/api/auth/google/callback` |
| **Mock Authentication** persona picker — open while Google is unconfigured (`mockLoginEnabled()`), 404 otherwise or with `MOCK_LOGIN=false` | `app/(site)/mock-login/page.tsx`, `loginAs` |
| Sessions (rows, opaque token, idle/absolute expiry, rotation, revoke) | `lib/sessions.ts` |
| Login / logout actions | `app/actions/auth.ts` (`signInWithLdap` — directory check, `ldap:<uid>` throttle, profile by `ldap_uid`, safe `next`; `loginAs(id, next)`; `logout` → `/sign-in`) |
| Academic records (the Requester details card, the warden's check, the **locked parent names**) | `lib/academic/` — `index.ts` (`getAcademicSource()` from env; `academicRecordFor()`, cached and never throwing; `forgetAcademicRecords()`), `store-source.ts` (**the office's own imported records**, migration 28, with the dummies behind them), `http-source.ts` (the institute's database; `recordFromJson` is the field mapping), `mock-source.ts` (dummy records), `stored.ts` (the CSV import), `guest-names.ts` (what the record fixes on the booking form), `fields.ts` (role → kind, display order, guardian and Copy-to rules), `details.ts` (rows + Copy to for the card), `family.ts` / `family-server.ts` (the warden's check). Console: `/admin/academic`. See [11-booking-forms.md](11-booking-forms.md) |
| LDAP directory | `lib/ldap/` — `index.ts` (`getDirectory()` from env), `ldap-directory.ts` (real), `mock-directory.ts` (dummy accounts), `link.ts` (entry → profile, opt-in link by email), `import.ts` (bulk import planner), `uid.ts` (client-safe rules). See [05-credentials-and-security.md](05-credentials-and-security.md) |
| Where signed-out visitors go | `SIGN_IN_PATH` in `lib/routes.ts` (`/` is the public home page) |
| Session read | `lib/auth.ts` (`getCurrentUser`, `requireUser`) |
| Post-login landing per role | `lib/routes.ts` (`homeForRole`) |
| Authenticated shell + nav | `app/(portal)/layout.tsx` (sticky charcoal `NavBar tone="dark"` from `components/site/site-nav.tsx`), page titles via `components/page-header.tsx` |

Nav links are role-aware — the exact menu per role is in
[10-roles-and-workflows.md](10-roles-and-workflows.md). **Room Availability is
shown to every role**, between the role-specific links and the log. Approver
links (HOD Queue, Club Approvals) and "My Bookings" for a Faculty Advisor come
from the units, not the role (`isHodForAny`, `approvesClubsFor`,
`clubsBookableByUser`).

### Booking submission

- **Page:** `app/(portal)/book/page.tsx` — loads the effective form config, then
  filters guest houses to those the role may book.
- **Requester details:** `components/academic-details.tsx`, above the form and
  outside it. The signed-in person's record from the academic database
  (`lib/academic/`), streamed in behind Suspense, with a Copy-to line; falls
  back to the portal profile when there is no record or the database is down.
  The same card is on `/warden`. See [11-booking-forms.md](11-booking-forms.md).
- **Form:** `components/booking-form.tsx` — renders entirely from the config:
  fields appear, become optional, or vanish per `FieldMode`; relationship is a
  dropdown or a text input; custom fields render in an "Additional information"
  card; the alumni upload card appears only when not hidden. Each guest row
  has a `kind`: "Add infant" appends an **infant card** (age list 0–4, no ID;
  the payload's `infant: true` makes the schema require the age). `GuestRow`
  takes a student's **parents from the academic record and locks them**
  (7 Oct 2026): `guestNames` from `/book` — `guestNameRule()` in
  `lib/academic/guest-names.ts` — puts the record's name in the box read-only
  when its relationship is chosen, hides a relationship the record rules out,
  and waives the Aadhaar and the ID upload for that guest. (`lib/known-guests.ts`
  and "Fill in from saved details" were **withdrawn for every role** on
  7 Oct 2026, "Yourself" with them.)
- **Validation:** `lib/booking-schema.ts` builds a zod schema *from the config*,
  used on both sides. Custom-field values are validated by
  `validateCustomValue()` in `lib/form-config.ts`.
- **Action:** `createBooking` in `app/actions/bookings.ts` — re-derives the config
  server-side, re-validates, enforces the guest-house permission and the official
  email whitelist, validates each upload (5 MB; JPG/PNG/WEBP/PDF), stores
  documents, then writes the booking with its guests and initial status.

Two panels sit between the stay details and the guest list:

- **Room availability** (`components/booking-availability.tsx`) — the same
  answer as `/availability`, for the guest house and check-in date currently
  chosen, so a requester is not picking dates blind. Since 7 Oct 2026 that
  answer is **a count** for everyone but the desk: `getRoomAvailability` sends
  a requester `AvailabilityCounts` with no rooms and no segments at all, drawn
  by `components/availability-counts.tsx`. The desk gets the chart
  (`components/occupancy-chart.tsx`, shared with `/availability`).
- **Rates** (`components/tariff-table.tsx`, 7 Oct 2026) — what this guest
  house charges, resolved on the server by `tariffPreviews()`
  (`lib/tariffs.ts`) through the **same `resolveTariff` the invoice prices
  from**, so the figure quoted and the figure charged cannot drift.
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
- **Special Budget** — the fund's name is **mandatory** since 8 Oct 2026
  ("Special Budget (Please specify the details)"); the approval letter is
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
[22-running-and-testing.md](22-running-and-testing.md) for why native time inputs are
banned.

### Requester dashboard

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

### Reviewer portals

One component, four scopings — `components/review-queue.tsx`, rendered by
`app/(portal)/warden|hod|approvals|iar/page.tsx` (`/fa` only redirects to
`/approvals`). Each shows the pending queue for that tier, full booking
details, guest list with ID documents, and Forward / Reject with a mandatory
reason on rejection. The IAR view embeds the alumni ID card.

Scoping is applied in the store query *and* re-checked in `canReview()` inside
`reviewBooking`, so a crafted request cannot approve another hostel's student.

**The warden's family check** (25 Sep 2026): `/warden` builds
`studentRecordPanels(bookings)` (`lib/academic/family-server.ts`) and passes
them to `ReviewQueue` as `studentRecords`; `components/student-record-check.tsx`
draws the record and the Father / Mother / Guardian table in the Review
dialog (`StudentRecordCheck`) and the badge in the Guests cell
(`FamilyBadge`). The comparison is `checkFamily` / `compareNames` in
`lib/academic/family.ts`. The other queues pass nothing.

`components/booking-details.tsx`, shared by every reviewer dialog, the manager
and the requester, shows the party ("3 guests, with infant(s)") and, when meals
were requested, a **Meals by day** table with the head count each ticked meal is
for.

### Guest house manager console

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

### Room availability grid (`/availability`)

Open to **every signed-in role**; the nav link reads "Room Availability" for
everyone. `app/(portal)/availability/page.tsx` (server, lists guest houses) +
`components/availability-grid.tsx` (client).

| Concern | File |
| --- | --- |
| Page shell + guest house list | `app/(portal)/availability/page.tsx` |
| View switch, date navigation, summary, room list | `components/availability-grid.tsx` |
| The charts — `OccupancyChart` (day), `RangeOccupancyChart` (week / month), each with a `simple` mode, and the shared `AvailabilityLegend` | `components/occupancy-chart.tsx` |
| Data fetch, window cap, identity stripping, and **who gets rooms at all** (`SEES_ROOMS`, 7 Oct 2026) | `app/actions/availability.ts` (`getRoomAvailability`) |
| "N rooms available" for everyone else | `availabilityCounts` / `rangeBetween` (`lib/availability.ts`), `components/availability-counts.tsx` |
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
selected date is today the current hour is marked in the primary colour (ink
since the 26 Sep 2026 redesign; navy from 19 Sep, amber before).

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
day; today's row is tinted and a primary-colour (ink) line marks the current time. Each bar's
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

### Booking history & approval log (`/history`)

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

### The console (`/admin`)

Layout and tabs in `app/(portal)/admin/layout.tsx`, sections and who may open
each in `CONSOLE_SECTIONS` (`lib/access.ts`) — the manager nine, the developer
all thirteen (table in [10-roles-and-workflows.md](10-roles-and-workflows.md#who-can-open-which-console-section)).
Every action re-checks with `requireConsole(section)` (or its sibling in
`app/actions/{units,settings,invoices,projects,operations,mail-templates}.ts`):
the role, the console unlock, and for a developer's dangerous actions the
second factor.

The first four sections, which predate the split:

| Tab | UI | Capabilities |
| --- | --- | --- |
| Users & Roles | `components/admin/users-manager.tsx` | Create/edit/delete profiles; assign any of the 12 roles (a manager cannot create or edit a developer); set hostel, department/club, roll number (these drive warden and FA scoping) and **LDAP username**. **Import from spreadsheet** (8 Oct 2026) pastes the office's own columns - a header line names them in any order - shows the plan ("412 added, 3 updated"), then imports all or nothing (`previewUserImport` / `importUsersAction`, `lib/users-import.ts`); **Import LDAP usernames** bulk-loads `email, ldap username` pairs onto existing accounts. Rows can be **ticked and deleted together** (`deleteUsersAction`, typed confirmation; anyone with bookings is refused and named back). Cannot delete yourself or drop your own developer role. In Supabase mode, creating a user also creates a Supabase Auth user (password `password123`) — needs the service-role key, and is not a portal login. |
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

### Shared domain modules

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
| `lib/debit-heads.ts` | Categories, `DEFAULT_DEBIT_RULES` (the office's nine heads and their mapping, revision 6, 8 Oct 2026), `FORBIDDEN_DEBIT_HEADS`, `debitCategoryFor`, `debitHeadsByType`, `upgradeDebitRules`, `describeDebit`, `asksForDebitHead`, and the funds declaration - `FUND_DECLARATION`, `requiresFundDeclaration`, `fundDeclarationError`. |
| `lib/office-debit-heads.ts` | **The offices' own spreadsheet** (9 Oct 2026): `OFFICE_DEBIT_HEADS`, one row per office mailbox with the heads it marked "Y", plus `officeDebitRowFor` / `officeDebitHeads` / `narrowToOffice`. `debitHeadsByType` intersects it with the Settings list, so an office is offered only its own heads. Keyed by the mailbox before the `@`, with aliases for the demo personas. Source kept as `.memories/04-production.md`. |
| `lib/users-import.ts` | Loading the accounts from a spreadsheet paste (8 Oct 2026): `KNOWN_COLUMNS` and `columnFor` / `headerColumns` (the header may name the columns in any order), `planUserImport` (all or nothing, updates whoever is already on the list, leaves out what the paste does not carry), `describeUserImport`, `changedFields`. Pure - the console previews the plan with it before applying it. |
| `lib/policy.ts` | Stay cap and its exemptions (`stayLengthError`), the alumni guest house, the pets notice, the manager contact line. |
| `lib/settings.ts` (+ `-server.ts`, `-impact.ts`) | `DEFAULT_RULES`, the Settings schemas, `getRules` / `getOfficialEmails` / `getHostels`, and what a change would break. |
| `lib/occupancy.ts` | Capacity per room type, `INFANT_AGE_LIMIT`, `roomPartyError` and the Add-button reasons, `extraBedsFor`, `allocationCapacityError`, `describeCapacity`. |
| `lib/turnover.ts` | The turnaround buffer and accepted-overlap guard (`holdGuard`), conflict kinds, `TURNOVER_GRACE_HOURS`. |
| `lib/availability.ts` | Availability grid maths: `bucketOccupancyByHour`, `bucketOccupancyByDay`, `overlapSpans`, `availabilityRange`, `shiftAnchor`, `roomRangeStatus`, `freeRoomsByDay`; `MAX_AVAILABILITY_DAYS`; and `availabilityCounts` / `rangeBetween` — the counts a requester is sent instead of the rooms (7 Oct 2026). |
| `lib/academic/guest-names.ts` | What a student's academic record **fixes** about their guests: the locked parent names, the relationships it rules out, and the Aadhaar / ID waiver (7 Oct 2026). |
| `lib/academic/stored.ts` | The CSV import: columns per kind, spreadsheet-quoting-aware splitting, `planAcademicImport` (all or nothing), `describeImport`. |
| `lib/academic/store-source.ts` | `StoreAcademicSource` — the office's own imported records, with the published dummies behind them. |
| `lib/missed-server.ts` | `runMissedSweep` — the nightly job that marks a request nobody decided in time as MISSED, logs it and mails the requester (migration 29). |
| `lib/meals.ts` | Meal keys and windows, `stayMealDays`, the notice period (`isMealBookable`, `mealLeadTimeError`, `firstBookableMealDate`), `normalizeMeals` (the only reader), the form's slot helpers, `kitchenHeadCount`. |
| `lib/invoice.ts`, `lib/tariffs.ts`, `lib/invoice-pdf.ts` | Invoices (see [13-billing-and-dining.md](13-billing-and-dining.md)). |
| `lib/operations.ts` | Extensions, no-shows, room ranges ("B-101 to B-120"), maintenance blocks. |
| `lib/booking-search.ts` | Archive search: criteria, tokenizer, pure matchers, faceting, sorting, paging, date presets. Shared by both stores. |
| `lib/sessions.ts`, `lib/auth.ts`, `lib/oidc.ts`, `lib/totp.ts`, `lib/security.ts`, `lib/admin-lock.ts`, `lib/crypto.ts`, `lib/uploads.ts`, `lib/env.ts` | Security (see [05-credentials-and-security.md](05-credentials-and-security.md)). |
| `lib/routes.ts` | `SIGN_IN_PATH` and `homeForRole`. (The official whitelist moved to Settings in migration 16.) |
| `lib/format.ts`, `lib/tz.ts` | Formatting, all delegating to `lib/tz.ts` — the institute timezone (`Asia/Kolkata`): `instituteIso` to parse, `formatInstitute*` / `instituteHour` / `instituteDayBounds` to read back, and UTC-safe helpers for `"yyyy-MM-dd"` calendar dates. |
| `lib/report-pdf.ts` | Client-side PDF rendering for the history report (dynamically imported). |
| `lib/revalidate.ts` | The three cache sets actions invalidate. |
| `lib/site.ts`, `lib/site-data.ts`, `lib/site-content.ts` | The public website's editable values and its content rendered from `lib/`. |

### UI primitives

`components/ui/` holds the shadcn components in use plus these local additions:

- **`native-select.tsx`** — a styled native `<select>`. This registry ships no
  `form` component and Radix's Select does not work with `register()`, so this is
  the workhorse input for every dropdown.
- **`switch.tsx`** — a native checkbox (`role="switch"`) styled as an on/off
  switch, native for the same reason: it takes `register()` directly. Used for
  "Infant accompanying" in the booking form.
- **`time-select.tsx`** — the hour/minute/AM-PM picker. Exports `parseTime` and
  `toTimeValue`, which handle the 12 AM = `00:00` and 12 PM = `12:00` traps.

### Booking type and the IAR pipeline

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

### Reception (caretaker) console

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

### Destructive actions in the developer console

**`components/ui/confirm-dialog.tsx`** replaced every `window.confirm`. It lists
the consequences and, for guest houses, users and bookings, requires the
operator to type the name, email or reference id. A stray Enter must not delete
a guest house and all its rooms.

### Email notifications — `lib/mail/`

Moved to [10-roles-and-workflows.md](10-roles-and-workflows.md): the transport seam, the
outbox, who gets which mail (To / CC), threads, digests, the cron and the
Mail Outbox console.

### Invoices, tariffs and dining

Moved to [13-billing-and-dining.md](13-billing-and-dining.md): tariffs,
building and issuing an invoice, the PDF, payments, Accounts mail, dining
bookings and the kitchen's day. Since 25 Sep 2026: `invoiceTable()` (the
table the PDF and the preview both draw, versions 1, 2 and 3 — the labels in
`totalLabels`), `parseExtraCharges`
and `extra_lines` (additional charges), `priceInvoiceDraft` /
`saveInvoiceDraftAction` in `app/actions/invoices.ts` (live repricing and the
draft), the `ExtraChargesEditor` in `components/invoice-dialog.tsx`.

### Operational states (Phase 7)

`components/manage-stay-dialog.tsx` on every approved / current stay in the
reception tables: extend — a later check-out (`extendStayAction`) or an
earlier check-in (`advanceCheckInAction`, 25 Sep 2026), manager and caretaker,
each a date box plus `TimeSelect` — approve / decline a requester's
extension, move rooms (`reassignRooms`, audited), release a no-show, cancel.
Requesters ask for an extension from their booking view. Actions are in
`app/actions/operations.ts`; pure rules in `lib/operations.ts`
(`extensionError`, `earlierCheckInError`, `noShowReleasable`, `planRoomRange`, `roomBlockError`,
`blockSegment`); the automatic no-show release in `lib/no-show-server.ts`, run by
`/api/mail/cron` before the daily mail. Maintenance blocks (`room_blocks`) are
managed in Guest Houses & Rooms, merged into availability as segments with
`kind: "maintenance"`, and refused against stays in both stores.

### Security (Phase 8)

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

### Performance and tests (Phase 9)

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

### Branding

**Since 26 Sep 2026 the palette is iitpkd.ac.in's own**: ink `#1A1A1A`
(primary, white text), vermilion `#E94C26` (rules, icons, focus ring;
`vermilion-deep` `#C43C1C` behind white text — the `brand` button), the
emblem's saffron `#F5A300` (labels on ink), body text `#4A4541`, band
`#F3F1EB`, 4px corners, no shadows, no gradients; Source Serif 4 (optical
sizes) headings and Source Sans 3 body via `next/font`. Tokens and the brand
utilities (`bg-ink`, `text-vermilion-deep`, `bg-band`, `text-on-ink`, …) live
in `app/globals.css`. Full table, contrast rules and the history (the 19 Sep
navy/gold from the design handoff) in [14-public-site-and-ui.md](14-public-site-and-ui.md).

Public-site modules (26 Sep): `components/site/brand.tsx` (`BrandBlock`, the
lockup, also in the portal header), `site-header.tsx` (the white header,
sticky from `lg`), `site-chrome.tsx` (`SiteFooter`), `guest-house-map.tsx`
(map tabs), `PageMasthead` / `SectionHead` / `ArrowLink` in
`site-ui.tsx`; `amenities` / `houseSummary` / `BOOKING_STEPS` / `guidelineSections` /
`mealTimetable` in `lib/site-content.ts`; `GUEST_HOUSE_LOCATIONS` /
`guestHouseMapPins` / `HOME_PHOTOS` / `SIGN_IN_PHOTOS` in
`lib/site.ts`. The My Bookings tiles are `BookingDoor` in
`app/(portal)/dashboard/page.tsx`.

Logos: `public/IITPKD_NEW_LOGO.png` (the stacked institute logo on a
transparent background, in both headers since 21 Sep 2026; it replaced the
wide `iitpkd-web-logo.jpg`) and `public/iitpkd-logo.png` (the emblem; `app/icon.png` is the same
file serving as the favicon).

The earlier amber-on-off-white palette copied from dashboard.iitpkd.ac.in, and
its white-on-amber WCAG failure, are gone. Mail
templates (`lib/mail/render.ts`) still carry their own inline amber header.

### Demo data

Seeded in `lib/store/seed.ts` (mock) and `supabase/seed.sql` (Supabase, auth
password `password123` — not a portal login; each persona signs in with its
dummy LDAP account from [05-credentials-and-security.md](05-credentials-and-security.md)):
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
