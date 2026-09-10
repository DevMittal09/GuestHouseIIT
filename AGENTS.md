<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# IIT Palakkad Guest House Booking Portal — agent context

Read this before touching the code. It captures the decisions and the traps that
are not obvious from reading files, so you don't have to rediscover them.

**What it is:** a booking + multi-stage approval portal for IIT Palakkad's two
guest houses, **Bageshri** and **Hamsanandi**. Five kinds of requester submit
bookings; each goes through role-specific approvals and ends at a Guest House
Manager who assigns actual rooms on a visual grid. A **developer** superadmin
role can reconfigure almost everything from the UI.

**Stack:** Next.js 16 (App Router, Turbopack) · React 19 · TypeScript ·
Tailwind v4 · shadcn/ui · Supabase (optional) · zod · react-hook-form.

---

## Run it

```bash
npm install
npm run dev          # http://localhost:3000
npm run build        # tsc typecheck runs here — always run before finishing
npm run lint         # must stay clean
```

There is **no test framework installed**. Behaviour was verified two ways, and
you should do the same rather than assuming:

1. **Ad-hoc TypeScript tests** run with
   `npx tsx --tsconfig ./tsconfig.json <file>.ts` (write them outside the repo,
   e.g. a temp dir; `@/` path aliases resolve fine). Good for store/workflow/pure
   logic.
2. **HTTP smoke tests** against a running dev server. Auth is a cookie holding a
   profile id, so you can impersonate anyone:
   ```bash
   curl -s -b "gh_mock_user=<profile-id>" http://localhost:3000/book
   ```
   Use this to check a page renders (200) and that scoping works (e.g. the Malhar
   warden sees only Malhar students' requests).

`next dev` refuses to start if another dev server is already running — check
port 3000 before launching your own.

> **`npm run build` kills a running `next dev`.** Both write to `.next/`, so
> building while a dev server is up pulls the directory out from under it and
> the dev process exits 1 — taking the app down for whoever is using it in a
> browser. If someone is on `localhost:3000`, either build first and start the
> server after, or expect to restart it. This is easy to miss because the build
> itself succeeds and says nothing.

## Two backends, one interface

`lib/store/types.ts` defines `DataStore`. Two implementations satisfy it and
`lib/store/index.ts` picks one **from the environment**:

| Condition | Store | Data lives in |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` + a key set | `lib/store/supabase.ts` | Supabase Postgres + Storage |
| otherwise | `lib/store/mock.ts` | `.local-db.json`, `public/uploads/` |

**Any new data operation must be added to the interface and to both
implementations**, or one backend silently breaks. `searchBookings` is the
trap-laden one — see the approval-log section below. `listRoomOccupancy`
(availability grid) is the newest.

- The mock store rewrites the whole JSON file on every mutation. It is
  single-process and not concurrency-safe — fine for dev, never for production.
- Delete `.local-db.json` to reset demo data. `loadDb()` also **self-heals**:
  it adds missing seeded profiles and a missing `form_configs` key to old files,
  so adding a new seed persona does not require a wipe.
- Mock room ids are deterministic strings (`gh-bageshri-B-101`); Supabase ids are
  uuids. Never hardcode ids outside `lib/store/seed.ts`.
- `.env.local` (gitignored) currently holds real hosted-Supabase keys including a
  **service-role key**. Never commit it, never log it, never send it anywhere.
  `.env.example` documents the variables.

## Auth is mocked — one swap point

`lib/auth.ts` `getCurrentUser()` reads the `gh_mock_user` cookie and looks up a
profile. Login is a persona picker on `/`. **Everything else in the app only
calls `getCurrentUser()`/`requireUser()`**, so replacing that function with
Supabase Auth or institute SSO is the whole production migration. Do not scatter
auth logic elsewhere.

Every server action re-checks authorization server-side (`requireUser`, role
checks, `canReview`). Keep it that way: the UI hiding a button is never the
security boundary.

## Roles, pipelines, and where they are encoded

`lib/workflow.ts` is the single source of truth for the pipeline.

| Requester | Pipeline | Entry status |
| --- | --- | --- |
| student | → Hostel Warden → GH Manager | `PENDING_WARDEN` |
| club | → Faculty Advisor → GH Manager | `PENDING_FA` |
| alumni | → IAR Cell → GH Manager | `PENDING_IAR` |
| employee | → GH Manager | `PENDING_GH_MANAGER` |
| official | → GH Manager (direct, highest priority) | `PENDING_GH_MANAGER` |

Reviewer roles: `warden` (scoped to `profile.hostel_name`), `faculty_advisor`
(scoped to `profile.department_or_club`), `iar_cell`, `gh_manager`, plus
`developer` (superadmin). Scoping lives in `canReview()`.

- Intermediate approval always forwards to `PENDING_GH_MANAGER`.
- The GH Manager does **not** approve via the generic review action —
  approval happens through `allocateRooms()`, which assigns rooms and sets
  `APPROVED` in one step. `reviewBooking` explicitly rejects manager approvals.
- Rejection requires a non-empty reason everywhere (enforced server-side).
- `official` bookings are restricted to `OFFICIAL_EMAIL_WHITELIST` in
  `lib/routes.ts`, and are highlighted + sorted to the top of the manager queue.

### Time is institute time — `lib/tz.ts`

Every wall-clock time in this app is **Asia/Kolkata**, regardless of where the
server or the browser runs. Instants are stored as ISO/UTC; only parsing what a
user typed and rendering it back are zoned.

- **Never** `new Date("2026-09-15T12:00")` on a naked datetime string — the spec
  resolves that in the *process* timezone. Use `instituteIso()`.
- **Never** format an instant with date-fns `format`, `toLocaleString()` or
  `getHours()`. Use `lib/format.ts` (`formatDateTime`, `formatDate`) or the
  `formatInstitute*` / `instituteHour` helpers.
- This is also what makes server-rendered dates and their client hydration
  agree when the two machines are in different zones.

> **This is a fixed bug, not a preference.** `toIso()` used to be
> `new Date(datetimeLocal).toISOString()`. On a UTC host a booking for 12:00
> was stored as `12:00Z` and read back in the manager's console as **5:30 PM**
> — and a 10:00 check-out as **3:30 PM**. Rows written during that period are
> still 5h30m late in the database; `supabase/repairs/2026-09-10-utc-parsed-bookings.sql`
> shifts them (and rebuilds their holds) and explains how to tell them apart.

### Advance-booking window

Check-in must be within **one month** of today. `latestCheckIn(role)` in
`lib/workflow.ts` is the single source of truth; `isAdvanceWindowExempt()`
exempts **`official` only**, because dignitary visits are arranged on the
institute's own notice. The limit applies to `check_in` only — a stay that
starts inside the window may run past it.

`bookingPayloadSchema` applies it on client *and* server, so the `max` on the
date input is convenience, not enforcement. Use `addMonths` (date-fns), never
`setMonth`, or 31 Jan + 1 month lands on 3 March.

### Post-approval lifecycle

After approval, the GH Manager controls the booking through:

```
APPROVED → OCCUPIED → VACATED
         ↘ CANCELLATION_REQUESTED → CANCELLATION_APPROVED
         ↘ CANCELLED (direct, by manager)
```

`ROOM_HOLDING_STATUSES` = `APPROVED`, `OCCUPIED`, `CANCELLATION_REQUESTED` —
only these keep rooms reserved. Occupancy queries and the room grid use this
const, not a hardcoded `APPROVED` check.

**`OCCUPIED` is a fact recorded at the desk, not something a date implies.**
`occupancyNotStartedError()` refuses `APPROVED → OCCUPIED` before the booking's
check-in, enforced in `updateBookingLifecycle` and used by the console to
disable the button. `stayPhase()` (`upcoming` | `current` | `past`) is the
matching read side: `/manager` groups stays by phase, not by status, into
**Current occupants**, **Awaiting check-out** (past check-out, never marked
Vacated, still holding rooms) and **Upcoming stays**. Before that split a
booking for next week sat under the same heading as a guest in the building and
read as though it were occupied.

Cancellation flow: a requester can request cancellation of an approved/occupied
booking (`requestCancellation` action, requires reason). The manager reviews via
`approveCancellation` / `rejectCancellation`. Direct cancellation pre-approval
uses the existing `cancelBooking` action.

## The form-config system (most important non-obvious part)

Booking forms are **data-driven, not hardcoded**. `lib/form-config.ts` defines
`RoleFormConfig`: allowed guest houses, a `FieldMode`
(`required` | `optional` | `hidden`) per guest field, relationship input style
(strict dropdown with editable options, or free text), alumni-card mode, an
info banner, and admin-defined **custom fields** (text/textarea/number/date/
select/checkbox).

Resolution order — get this right or changes appear to do nothing:

1. `getEffectiveFormConfig(role)` (`lib/form-config-server.ts`) returns the
   developer-saved config from the store **if one exists**,
2. otherwise `buildDefaultFormConfig(role, guestHouses)` — the spec defaults,
3. then `sanitizeFormConfig` drops guest houses that no longer exist.

**Editing `buildDefaultFormConfig` only affects roles with no saved config.** If
a role was saved from the Form Builder UI, its stored row wins; "Reset to spec
defaults" (which deletes the row) is how you get back to defaults. Check both
the `form_configs` table and `.local-db.json` before concluding a default change
had no effect.

The same config object builds the zod schema (`lib/booking-schema.ts`) on the
**client and the server**, so hidden/optional/required cannot be bypassed by a
crafted request. Custom-field answers are snapshotted onto the booking
(`custom_fields`) with their label, so reviewers still see the question text
after an admin edits the form.

Current defaults worth knowing: students are Bageshri-only and see the "double
shared rooms will get first preference" banner; employee and official use
free-text relationship; **club and official hide the relationship field**;
club ID uploads are optional; alumni ID card is mandatory.

### The parent-dependency rule (students)

Institute policy: a student may book for parents freely, but **siblings and
grandparents only when a parent is staying too**. This is config, not a
hardcoded role check — `parent_relationships` (Mother, Father) and
`dependent_relationships` (Grandmother, Grandfather, Siblings) on
`RoleFormConfig`, defaulted for `student` and empty for everyone else.

- `parentDependencyError(config, relationships)` in `lib/form-config.ts` is the
  one matcher, called by the booking form *and* `bookingPayloadSchema`. The
  form greys out the restricted `<option>`s until a parent is chosen; the zod
  `superRefine` is what actually enforces it.
- `sanitizeFormConfig` backfills both arrays from the spec defaults when a
  saved row predates the rule, drops entries no longer in
  `relationship_options`, and **lapses the rule entirely if no parent option
  survives a rename** — otherwise those options would be permanently
  unselectable. Keep that guard if you touch it.

## Booking history & archive search (`/history`)

Accessible to **all roles**. Requesters see their own booking history (nav:
"Booking History"); approvers see an approval log + searchable archive (nav:
"Approval Log"). `historyScope(user)` controls what each role sees:
- Requesters are scoped to `userId` (own bookings only).
- Reviewers are scoped to their jurisdiction (hostel/club/alumni).
- GH Manager and Developer see everything.

`isOwnBookings` flag on the scope controls whether the "Handled by me /
Everything" toggle and the "My decision" column are shown.

- **Matching rules live in `lib/booking-search.ts`, not in the stores.** Both
  stores fetch candidates and call the same `runBookingSearch()`. Add search
  behaviour there, not twice.
- **Scoping is `historyScope(user)`** — the archive counterpart to `canReview()`.
  `criteriaFromParams()` spreads it **last**, so a hand-edited query string can
  only narrow, never widen. Do not reorder that spread.
- **Never push `criteria.statuses` down to SQL.** Facet counts are computed
  before the status filter, so the candidate set must still contain the other
  statuses. Doing this broke the Supabase tiles once while the mock store stayed
  correct.
- Supabase caps a scan at `SEARCH_SCAN_LIMIT` (1000) and returns `truncated`;
  the UI surfaces it. Keyword matching spans joined tables, so it cannot be
  expressed in PostgREST.
- `exportHistoryCsv` (`app/actions/history.ts`) takes only a query string and
  re-derives user + scope + params server-side. Keep it that way.
- `exportHistoryPdf` (`app/actions/history-pdf.ts`) — GH Manager and Developer
  only. Returns **report data, not markup**; `lib/report-pdf.ts` draws a real
  A4-landscape PDF client-side with jsPDF (dynamically imported) and saves it.
  Keep the scope re-derivation server-side. Both exports take the **current
  filters** and nothing else — CSV and PDF sit side by side as an "Export as"
  choice, so format is the only decision at that point.
- **Date presets are a filter, not an export option.** `DATE_PRESET_GROUPS` /
  `resolveDatePreset()` / `matchDatePreset()` in `lib/booking-search.ts` back
  the chip rows in the filter bar; clicking the lit chip clears it. They belong
  there because a second date control on the export button let the two disagree
  about what was exported.

  Two groups, because they answer different questions and merging them loses
  one: **Rolling** windows measured from today (Today, Next 7/30 days, Last
  7/30/90 days) and whole **Calendar** periods (This/Last week, month, quarter,
  year). On 15 Sep, "Last 30 days" is 16 Aug–15 Sep but "Last month" is all of
  August. Calendar periods cover the *whole* period including days still to
  come, so "This month" catches upcoming arrivals.

  Never `toISOString().slice(0,10)` — that is UTC, and in IST it reports the
  previous day until 05:30. `resolveDatePreset` converts "now" to an institute
  civil date once (`instituteToday`) and the calendar arithmetic then reads
  plain local year/month/day off it, so "This month" is August on 1 September
  IST even when the server is in UTC. Two presets can resolve to the same range
  (31 Jan: "Last 30 days" and "This month"), so `matchDatePreset` returns the
  first in display order.
- `/history` is excluded from the 5 s polling (`NO_POLL_PREFIXES` in
  `components/auto-refresh.tsx`).

## Room allocation — occupancy is a DB constraint

`room_holds` (migration 3) holds one row per (booking, room) with a `tstzrange`
`during` and an **exclusion constraint** that refuses two overlapping holds on
the same room. This replaced a check-then-act race in `allocateRooms()`.

**The invariant: a hold row exists exactly while the booking holds the room.**

- `Booking.assigned_room_ids` is **derived from holds on read** — there is no
  such column. Both stores fill it in during hydration.
- `updateBookingStatus` deletes holds when the new status is outside
  `ROOM_HOLDING_STATUSES`, so releasing rooms is one rule, not a per-transition
  chore. Occupancy queries need **no** status filter.
- `allocateRooms()` deliberately does **no pre-flight clash check** — that would
  reintroduce the race. It writes; the loser gets `RoomClashError` (`23P01`).
- Supabase writes go through the `set_room_holds()` plpgsql function so
  delete+insert is one transaction. The mock store emulates the constraint in
  `assertNoClash` (safe there: single process, synchronous write).
- `during` is half-open `[check_in, check_out)`, so a checkout and a
  same-instant check-in do **not** clash.

`components/room-grid.tsx` — cinema-style grid, green available / red occupied /
blue selected, grouped into double-sharing and single.

> **The grid reads occupancy for the booking's own dates and nothing else.** It
> used to carry its own date+time pickers. A manager who shifted that window saw
> rooms turn green that were in fact taken for the actual stay; the write was
> still safe (the exclusion constraint refused it) but the grid was offering
> rooms it should never have shown. Occupied rooms render `disabled`, so a room
> allotted to someone else for any part of this stay cannot be picked at all.
> Do not reintroduce a date selector here — `/availability` is where you browse
> other dates.

### Capacity and infants — `lib/occupancy.ts`

| Room type | Own beds | With one extra bed |
| --- | --- | --- |
| `double_sharing` | 2 | 3 |
| `single` | 1 | 2 |

The third occupant of a double is on a **rolled-in extra bed** — hence the field
name `withExtraBed` (not `max`) and `extraBedsNeeded()`, which tells the manager
how many to arrange. Say so in UI copy; it is a thing someone has to physically do.

**Infants** (under `INFANT_AGE_LIMIT` = 10) are **guest rows carrying
`is_infant`**, not a count. Their name, age and gender still go on the register;
only the **ID number and ID document are waived**, and they occupy no bed.

> **Always measure capacity with `countBedGuests(guests)`, never
> `guests.length`.** Getting that wrong over-books every room by the number of
> infants. A booking of infants only is refused — someone must be on a bed.

Checked twice, because different things are known: `requestedRoomsError()` at
submission (only a room count exists) and `allocationCapacityError()` at
allocation (actual room types known). The booking form additionally caps how
many guests can be added to what the chosen rooms sleep, plus infants — so
picking rooms first, then guests, is the intended order.

## Meals — `lib/meals.ts`

The requester ticks breakfast / lunch / dinner when booking, so the kitchen has
head counts before guests arrive. One jsonb column (`bookings.meals`, migration
6), not three booleans, because it is one answer to one question and is always
read as a set — the same shape as `custom_fields`.

- `normalizeMeals()` is the only way to read it. Bookings predating migration 6
  have no value, and the mock store's JSON gets hand-edited, so a missing or
  partial object must mean "none requested", never a crash. Both stores call it
  during hydration, so `Booking.meals` is always a complete object downstream.
- Meals are always optional — "no meals" is the common answer, so there is no
  required-field mode for them.
- Shown on `BookingDetails` (so every reviewer sees them) and as a column in the
  manager's stays tables.

## Room availability grid (`/availability`)

Open to **every signed-in role** — the one route with no role gate. Pick a
guest house and a date; the chart puts the 24 hours of that day down the Y axis
and room numbers across the X axis, red where a room is held and blank where it
is free, with a room-by-room list of booking periods underneath.

- `listRoomOccupancy(guestHouseId, from, to)` (both stores) returns one segment
  per **(room, booking)** using the same `ROOM_HOLDING_STATUSES` + strict
  overlap as `getOccupiedRoomIds`. The two must agree — a throwaway parity
  check caught nothing, but that is exactly where the backends drift.
- **Hour bucketing lives in `lib/availability.ts`, not the component**
  (`bucketOccupancyByHour`), so the boundary behaviour is testable: a stay
  checking out at 11:00 releases the 11 AM hour, and a same-instant
  back-to-back booking picks it up.
- `getDayAvailability` (`app/actions/availability.ts`) **strips
  `requester_name` and `purpose_of_visit` unless the caller is `gh_manager` or
  `developer`**. Everyone else gets periods and reference ids only. Do not
  widen this without a reason — the grid answers "is this room free", which
  needs no guest identity.
- Excluded from the 5 s polling: the component fetches client-side and has its
  own Refresh button.
- **The chart itself is `components/occupancy-chart.tsx`**, shared with the
  panel inside the booking form (`components/booking-availability.tsx`), which
  shows the same hour-by-hour picture for the guest house and check-in date
  being chosen. Requesters were otherwise picking dates blind. One chart, one
  action, one bucketing — so what the requester sees and what the manager sees
  cannot drift.

## Developer console lock

`/admin` sits behind a console password (`lib/admin-lock.ts`). Default **`0000`**
until a developer sets one from **Console Access**.

- **Enforced in `requireDeveloper()`**, not just the layout — a crafted request
  with a developer persona cookie but no unlock gets nothing. Keep it that way.
- Stored as a scrypt hash in `app_settings` (migration 5), never plaintext, and
  never sent to the client: read it inside a server action and return a verdict.
- The unlock is an HMAC-signed, httpOnly cookie (`gh_admin_unlock`, 8 h) whose
  **signing key is the stored hash**, so changing the password invalidates every
  outstanding unlock for free.
- A missing `app_settings` table degrades to the default password rather than
  throwing — otherwise the only page that could fix it would 500.
- Attempts are throttled per user, in-process (10 per 5 min). It resets on
  restart and does not span instances; real rate limiting belongs at the edge.

> **This is a speed bump, not authentication.** Identity is still a persona
> cookie, so anyone can claim to be the developer — the password only stops
> casual poking during a demo. Do not describe it as securing the console.

## Developer console (`/admin`, role `developer`)

`app/(portal)/admin/*` + `components/admin/*`, actions in `app/actions/admin.ts`
(every one gated by `requireDeveloper()`):

- **Users & Roles** — CRUD profiles, assign any role, set hostel / dept-club /
  roll number (these drive warden and FA scoping). Cannot delete yourself or
  drop your own developer role. In Supabase mode, creating a user also creates a
  Supabase Auth user (password `password123`) — needs the service-role key.
- **Guest Houses & Rooms** — CRUD guest houses and rooms; `total_rooms` is
  recounted automatically from active rooms. Deleting is blocked when bookings
  reference the guest house, or when a room is assigned to a booking (deactivate
  instead).
- **Form Builder** — edits `RoleFormConfig` per requester role.
- **All Bookings** — filter by status, audit-logged force-status override,
  hard delete.

Guest house names are free-form (no DB `check` constraint) because admins create
them; don't reintroduce a hardcoded name check. Anything that assumed exactly two
guest houses is a bug — `/manager` already guards the zero-guest-house case.

## Audit trail

Every status change appends a `booking_logs` row via
`updateBookingStatus(id, update, log)`; the store fills in `previous_status`
itself, so callers pass only `new_status`. `action_by_name` is denormalized so
history survives account deletion (`action_by` is nullable / `on delete set
null`).

## Branding

Palette and logo come from **https://dashboard.iitpkd.ac.in/** — primary amber
`#f7a600`, warm off-white `#faf9f7`, text `#2b2b2b`, borders `#e3e1dc`. Tokens
live in `app/globals.css` (light + a warm dark variant). The official logo is
`public/iitpkd-logo.png`, and `app/icon.png` is the same file acting as the
favicon. Note: white-on-amber is low contrast (WCAG); it matches the official
site deliberately. Fix by setting `--primary-foreground` to a dark brown.

## Traps that already cost time

- **Server action body limit.** File uploads exceed the 1 MB default and fail in
  the browser as an opaque `NetworkError`. `next.config.ts` raises
  `experimental.serverActions.bodySizeLimit` to `25mb`. Per-file validation
  (5 MB, JPG/PNG/WEBP/PDF) lives in `app/actions/bookings.ts`.
- **One cookie, every tab.** The mock session is a cookie, so signing in as a
  different persona in one tab changes who *every* open tab is, and the 5 s
  polling makes the others re-render as that persona. This is inherent to cookie
  auth, not a bug to patch in the UI — a blocking "this browser switched user"
  guard was built and **reverted** (see [.memories/06-decisions.md](.memories/06-decisions.md));
  don't rebuild it. Two identities at once need two browser profiles or a
  private window, and genuine per-tab sessions arrive with real auth.
- **Never use `datetime-local` or `type="time"`.** Firefox makes them
  type-only, which reads as "I can't select the time". Use
  `components/ui/time-select.tsx` — hour / minute / AM-PM dropdowns, controlled
  via `value` (`"HH:mm"`, 24h) + `onChange`. Its exported `parseTime` /
  `toTimeValue` handle the 12 AM = `00:00` and 12 PM = `12:00` traps — verified
  with throwaway tests, so re-test them if you touch the conversion.
- **Never bind a number input to a coerced value.**
  `value={n} onChange={e => setN(Number(e.target.value) || 1)}` makes the box
  impossible to clear: `Number("")` is 0, `|| 1` snaps it back, and only the
  spinner arrows work. Use `components/ui/quantity-input.tsx`, which keeps the
  raw string (empty included) and leaves validation to the caller. In the schema
  that is `countField`, which reports "…is required" for a blank box instead of
  `z.coerce.number()`'s misleading "At least 1 room".
- **shadcn/ui registry changed.** `init` needs `-b radix -p nova --no-monorepo`;
  `-b neutral` is rejected. There is **no `form` component** in this registry —
  hence `components/ui/native-select.tsx` (a styled native `<select>` that works
  with `register()`) and manual `FieldError` rendering instead of shadcn `Form`.
- **React Compiler lint is strict.** No reading refs or calling `setState`
  during render; don't call react-hook-form's `watch()` in render (use
  `useWatch`); don't call `setState` synchronously in an effect body. `npm run
  lint` fails the build-adjacent checks on these.
- **`create-next-app` rejects capitalized directory names** — this project was
  scaffolded in a lowercase temp dir and moved in. Don't re-scaffold in place.
- **`.gitignore` has `.env*`**, which also hides `.env.example`; the
  `!.env.example` exception must stay.
- Domain shapes in `lib/types.ts` are `type` aliases, not `interface`, so
  Supabase's generated `Insert`/`Update` helpers accept them.
- **Node version.** The system default is Node v18, but Next.js 16 requires
  `>= 20.9.0`. Load nvm first:
  `export NVM_DIR="$HOME/.nvm" && . "$NVM_DIR/nvm.sh" && nvm use 20`
  before running `npm run dev` / `npm run build`.

## Demo personas

Seeded in `lib/store/seed.ts` (mock) and `supabase/seed.sql` (Supabase auth
password `password123`): two students in different hostels (Malhar, Saveri),
an employee, a whitelisted official (`admin@iitpkd.ac.in`), the Petrichor club,
an alumnus, two wardens, a Petrichor faculty advisor, the IAR cell, a GH
manager, and `developer@iitpkd.ac.in`. Five demo bookings seed every queue with
something to look at.

## Supabase setup

Three migration files applied sequentially:
1. `supabase/migrations/00000000000001_init.sql` (tables, enums, RLS, private `documents` bucket)
2. `supabase/migrations/00000000000002_booking_lifecycle.sql` (adds `OCCUPIED`, `VACATED`, `CANCELLATION_REQUESTED`, `CANCELLATION_APPROVED` to `booking_status`)
3. `supabase/migrations/00000000000003_room_holds_and_infants.sql` (`room_holds` + exclusion constraint + `set_room_holds()`, backfills and **drops** `bookings.assigned_room_ids`, adds `bookings.infants`). Destructive — read its header comment before running it against real data.
4. `supabase/migrations/00000000000004_infant_guests.sql` (adds `booking_guests.is_infant`, **drops** `bookings.infants`)
5. `supabase/migrations/00000000000005_app_settings.sql` (`app_settings` key/value table for the developer console password hash; service-role only, no `authenticated` policy)
6. `supabase/migrations/00000000000006_booking_meals.sql` (`bookings.meals` jsonb + a shape check). Additive and defaulted, so existing bookings read as "no meals requested". **Until this is applied, creating a booking against Supabase fails** — the mock store self-heals instead.

`supabase/repairs/` holds one-off data fixes that are **not** migrations and are
not applied automatically. Read the header of each before running it.

Then `supabase/seed.sql`. Locally: `supabase db reset`.
Hosted: paste both migrations + seed into the SQL editor. Fill `.env.local` and
restart the dev server; the store switches automatically. See README.md for the
full walkthrough.

## Repo state

Git history was reset from the create-next-app scaffold and restarted with a
single initial commit on `main`.
Remote is `https://github.com/DevMittal09/GuestHouseIIT.git`. The local machine's
GitHub identity is a **different account**, so `git push` fails with a
permissions error until that account is added as a collaborator or a
`DevMittal09` credential is used — this is a credential issue, not a code issue.
