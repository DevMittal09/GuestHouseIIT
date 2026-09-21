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
npm test             # Vitest (tests/), must stay clean
```

**`npm test`** runs the Vitest suite in `tests/`. Store tests use the mock
store on a throwaway file (`MOCK_DB_PATH`, see `tests/helpers.ts`) with
`TZ=UTC`; they never touch `.local-db.json`. Add a test for any rule you change.
Beyond the suite, behaviour is verified these ways:

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

   `.env.local` currently points at the **hosted** Supabase project, so a plain
   dev server writes there. For anything that creates or changes data, start it
   with `NEXT_PUBLIC_SUPABASE_URL= npm run dev` — an empty value in the process
   environment beats `.env.local` and selects the mock store — and delete the
   `.local-db.json` it creates if there was none before.
3. **Headless Chrome** for client-rendered UI (dialogs, the meal grid, the
   week/month charts), driven over the DevTools protocol with Node 20's
   `--experimental-websocket` — no packages needed. Recipe and gotchas in
   `.memories/05-deployment.md`. Migrations are checked in a throwaway
   `postgres:16-alpine` container the same way — never against the hosted
   project.

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
trap-laden one — see the approval-log section below. The email outbox
(`enqueueEmails` / `claimQueuedEmails` / `settleEmail` / `listEmails` /
`countEmailsByStatus` / `requeueEmail`) is the newest, and the one where the
two implementations differ most: Supabase claims rows through a
`for update skip locked` function, while the mock store can select-then-mark
because it is single-process and `saveDb` is synchronous — the same reasoning
as `assertNoClash`.

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

## Sign-in: LDAP + a mocked Google door — one session swap point

`lib/auth.ts` `getCurrentUser()` reads the `gh_mock_user` cookie and looks up a
profile. Two doors set it (`app/actions/auth.ts`), and both are on the card at
`/sign-in`, which is also embedded in the public `/book-room` and `/book-meal`:

- **LDAP username + password** → `signInWithLdap()`. The *directory* checks the
  password (`lib/ldap/`: `getDirectory()` returns the real `LdapDirectory`
  when `LDAP_URL` is set, otherwise the dummy `MockDirectory`). Then
  **`profiles.ldap_uid`** (migration 12) says which portal account that is.
  A valid LDAP login with no profile gets in nowhere. The dummy logins, and
  how to switch to the real accounts, are in
  **`.memories/11-ldap-accounts.md`**. Keep that file and
  `lib/ldap/mock-directory.ts` in step.
- **"Sign in with Google"** → `/mock-login` (the persona picker) → `loginAs()`.
  This is a **placeholder** for Google OAuth, and it is also the one-click role
  switcher for development. Real Google replaces the page and `loginAs`, and
  must enforce `isInstituteEmail()` on the verified address.

Rules for the LDAP door:

- **Refuse empty passwords before binding.** An empty password is an
  unauthenticated bind, and many servers report that as success.
- **Unknown user and wrong password get one message** ("Incorrect username or
  password"), so the page cannot be used to find out which usernames exist.
- **Attempts are throttled** per `ldap:<uid>`.
- **`LDAP_URL` without `LDAP_BASE_DN` fails sign-in** rather than falling back
  to the published dummy passwords.
- **`LDAP_LINK_BY_EMAIL=true` is opt-in.** It links a first sign-in by the
  directory's `mail` and never overwrites an existing `ldap_uid`.
- **Bulk-loading the real usernames** is Users & Roles → Import LDAP usernames
  (`lib/ldap/import.ts`, all or nothing).

**`/` is the public website, not a sign-in page:** signed-out guards
`redirect(SIGN_IN_PATH)` (`lib/routes.ts`), never `redirect("/")`. Redirects go
to a `next` path only via `safeNextPath()`.

**Everything else in the app only calls
`getCurrentUser()`/`requireUser()`.** The cookie is still unsigned, so anyone
can claim any profile id. LDAP proves who typed a password, not who holds the
cookie. A signed or server-side session plus real Google OAuth is the
remaining production migration. Do not scatter auth logic elsewhere.

Every server action re-checks authorization server-side (`requireUser`, role
checks, `canReview`). Keep it that way: the UI hiding a button is never the
security boundary.

## Requester details come from the academic database — `lib/academic/`

The card at the top of `/book` (and on `/warden`) shows the person's record
from the **institute's academic database**, with a per-kind field list and a
**Copy to** line. The fields, dummy data and how to connect the real database
are in **`.memories/12-academic-records.md`**. Keep that file and
`lib/academic/mock-source.ts` in step.

- **Same seam as the store / mailer / directory:** `getAcademicSource()` is the
  real `HttpAcademicSource` when `ACADEMIC_DB_URL` is set, and dummy records
  otherwise. Field names meet ours only in `recordFromJson`.
- **Role → kind is `KIND_FOR_ROLE`** in `lib/academic/fields.ts`: `official`
  and `iar_cell` are Offices, `club` is Student Representative, and
  `iar_student_cell` is the Alumni Office.
- **`academicRecordFor()` never throws** and caches answers (10 min) because
  `/book` polls. On no record or an outage the card falls back to the profile.
  A down database must never stop a booking.
- **Copy-to approvers come from `canReview()`** (`reviewersOfRequester`), never
  from the record. The offices' HOD comes from the record. Copy to is **shown,
  not mailed**.
- **The record is never stored, logged or mailed.** It holds parents' names
  and phone numbers.

## Roles, pipelines, and where they are encoded

`lib/workflow.ts` is the single source of truth for the pipeline.

| Requester | Pipeline | Entry status |
| --- | --- | --- |
| student | → Hostel Warden → GH Manager | `PENDING_WARDEN` |
| club | → Faculty Advisor → GH Manager | `PENDING_FA` |
| iar_student_cell | → IAR Office → GH Manager | `PENDING_IAR` |
| iar_cell (IAR Office) | → GH Manager (direct — it *is* the approver) | `PENDING_GH_MANAGER` |
| employee | → GH Manager | `PENDING_GH_MANAGER` |
| official | → GH Manager (direct, highest priority) | `PENDING_GH_MANAGER` |
| alumni | *retired* — kept only for stored bookings | `PENDING_IAR` |

Reviewer roles: `warden` (scoped to `profile.hostel_name`), `faculty_advisor`
(scoped to `profile.department_or_club`), `iar_cell`, `gh_manager`,
`gh_caretaker`, plus `developer` (superadmin). Scoping lives in `canReview()`,
which also refuses `reviewer.id === requester.id` — the IAR Office both books
and approves, so self-approval has to be impossible by construction.

### Booking type — `lib/booking-types.ts`

`bookings.booking_type` is `official` | `personal` | `alumni`: a property of the
**request**, not the requester. `bookingTypesFor(role)` is the single source of
truth for which a role may pick, and a role with one option is **never asked** —
the form records the value silently. Employee is the only role with a real
choice (`official` default, `personal`); club and official are official-only.

`alumni` means *on behalf of an alumnus*, who has no login: it requires
`alumni_name`, `alumni_roll_number` and the Alumni ID card upload. The card is
demanded by `config.alumni_card === "required"` **or** by the booking being for
an alumnus — the IAR accounts book both ways from one form, so the requirement
follows the request, not the account.

**Alumni have no login.** There is no alumni persona and `alumni` is not in
`REQUESTER_ROLES`. It stays in the `Role` union and in `BOOKING_CATEGORY_ROLES`
(used by history filters and reports) because stored bookings still carry it —
dropping it would orphan them.

### Guest House Caretaker — `gh_caretaker`

Reception desk; a deliberate **subset** of `/manager` at `/caretaker`: today's
checkouts, current occupants, awaiting check-out, upcoming stays, and marking
guests Occupied / Vacated. No allocation, no approvals, no cancellations.
`canUpdateLifecycle()` / `LIFECYCLE_ROLES` gate the one action it shares with
the manager, server-side. It reuses `components/stays-table.tsx` and
`components/checkouts-today.tsx` rather than owning copies, so the two consoles
cannot drift.

- Intermediate approval always forwards to `PENDING_GH_MANAGER`.
- The GH Manager does **not** approve via the generic review action —
  approval happens through `allocateRooms()`, which assigns rooms and sets
  `APPROVED` in one step. `reviewBooking` explicitly rejects manager approvals.
- Rejection requires a non-empty reason everywhere (enforced server-side).
- `official` bookings are restricted to the **official whitelist**, a Setting
  (`official_email_whitelist` table, migration 16; read with
  `getOfficialEmails()`, matched with `isWhitelistedOfficial`). It used to be a
  constant in `lib/routes.ts`. They are highlighted + sorted to the top of the
  manager queue.
- **Manager Overrides**: `lib/access.ts` grants `gh_manager` powers to book on behalf of others, override approvals, edit meals post-approval, and bypass guest house restrictions (like the alumni/Bageshri rule).

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

Check-in must be within **one month** of today by default — a Setting
(`rules.booking.advance_booking_months`), passed as `latestCheckIn(role, from,
months)`; the 14-night maximum stay is `rules.booking.max_stay_nights` (0 = no
limit). `latestCheckIn` in `lib/workflow.ts` is the single source of truth; `isAdvanceWindowExempt()`
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

### The booking form's availability panel is browsable

`components/booking-availability.tsx` opens on the check-in date but the
requester can move a day either side, or switch to Week / Month — someone whose
date is full needs to see what *is* free without losing a half-filled form. The
browsing is transient: `browsed` is tagged with the check-in date it was chosen
against, so picking a new check-in makes it stale and the chart snaps back with
no effect and no setState-during-render. Moving the chart never moves the
booking; a banner says so. Same action, chart and bucketing as `/availability`.

> **The allocation grid refetches when holds change.** `/manager` builds an
> `occupancyVersion` fingerprint of every booking's room holds and passes it to
> `RoomGrid`, which folds it into its fetch key. The grid loads occupancy once
> when its dialog opens, so without this it never learnt that another
> allocation had landed underneath it — the write was still refused by the
> exclusion constraint, but the grid went on offering rooms that were gone.
> This is the "room availability/booking is not being reflected in the GHM
> grid" report. An unchanged fingerprint costs nothing.

> **The grid reads occupancy for the booking's own dates and nothing else.** It
> used to carry its own date+time pickers. A manager who shifted that window saw
> rooms turn green that were in fact taken for the actual stay; the write was
> still safe (the exclusion constraint refused it) but the grid was offering
> rooms it should never have shown. Occupied rooms render `disabled`, so a room
> allotted to someone else for any part of this stay cannot be picked at all.
> Do not reintroduce a date selector here — `/availability` is where you browse
> other dates.

### Capacity and infants — `lib/occupancy.ts`

**Two rules, both applied, at different moments** (confirmed 21 Sep 2026):
the **per room type** table below is checked at **allocation**; the flat
**3 guests + 1 infant per room card** is checked at **submission** (schema and
the `booking_guests` trigger). Every number is a Setting (`rules.capacity`);
rule functions take a `CapacityRules` parameter defaulting to these values, and
the trigger reads the same row through `rule_int()` (migration 16).

| Room type | Own beds | With one extra bed |
| --- | --- | --- |
| `double_sharing` | 2 | 3 |
| `single` | 1 | 2 |

The third occupant of a double is on a **rolled-in extra bed** — hence the field
name `withExtraBed` (not `max`). Say so in UI copy; it is a thing someone has to
physically do.

- **Keep the copy formal.** The office found "sleeps 2, 3 with an extra bed" too
  informal for the Review & Allocate dialog, so `describeCapacity()` reads
  "Occupancy: 2 guests (maximum 3 with an extra bed)" and the allocation summary
  is labelled figures (rooms selected, guests, capacity of selection, extra beds
  required), not a sentence. The capacity error messages use the same register.
- **Extra beds at allocation are counted against the rooms actually picked**
  (`extraBedsFor(guests, rooms)`). `extraBedsNeeded(guests, roomCount)` assumes
  double rooms and is only for the booking form, before rooms exist — using it
  in the dialog under-counted a single room holding two guests.

**Infants** (under `INFANT_AGE_LIMIT` = 5) are entered as normal guests in a room card. They are classified as infants based on the age typed in. They share a guardian's bed and take no bed capacity, but they count towards a maximum of 1 infant per room.

> **Stored bookings can still hold legacy synthetic rooms** — migration 11 migrated older bookings into single synthetic rooms and left their infant flags unchanged.

Checked server-side via triggers on `booking_guests` (the per-card limits from Settings, 3 guests + 1 infant by default). The booking form additionally caps how many guests can be added to a room card.

## Meals — `lib/meals.ts`

The requester chooses meals **per day of the stay** in a days × breakfast /
lunch / dinner grid (`components/meal-plan-grid.tsx`), so the kitchen has head
counts before guests arrive. Still one jsonb column, `bookings.meals`, but since
migration 8 it is a **`MealPlan`**: one `{date, breakfast, lunch, dinner}` entry
per institute calendar day that has a meal, in date order. (Migration 6 created
it as one `{breakfast, lunch, dinner}` answer for the whole stay.)

- **Only where the guest house serves meals.** `guest_houses.serves_meals`
  (migration 8) — Hamsanandi on, Bageshri off — toggled in the developer
  console (Guest Houses & Rooms → "Serves meals"). **Never check the guest
  house name in code.** The form hides the grid where it does not apply, and
  `createBooking` refuses meals for a guest house that does not serve them.
- **A day offers only the meals served during the stay.** `stayMealDays()`
  lists every IST date from check-in to the day of check-out; a meal is
  available when its `MEAL_SERVING_WINDOWS` window overlaps the stay, half-open
  like room holds (a noon arrival gets no breakfast that day, leaving at 07:30
  misses breakfast, a midnight check-out adds no day). Unavailable cells show a
  dash. `mealPlanError()` enforces the same rule in the zod schema on client
  and server, and `MEAL_TIMES` labels are derived from the windows.
- **Migration 8 converted old rows with the same rule, in SQL.** The windows are
  written into the migration, so keep any future conversion in step with
  `MEAL_SERVING_WINDOWS`. The SQL and `normalizeMeals` were run on the same
  fixtures in a throwaway Postgres and agree.
- `normalizeMeals(value, stay)` is the only way to read it: it cleans arrays,
  expands the legacy whole-stay object over the stay's days, and turns anything
  else into "none requested". Both stores call it while hydrating (passing the
  booking as the stay), so `Booking.meals` is always a clean plan downstream.
- The form keeps ticks as `"date|meal"` slots outside react-hook-form
  (`mealSlot` / `mealPlanFromSlots`), because the rows follow the dates. Slots
  the stay no longer covers are ignored rather than deleted, so changing the
  dates back restores them. **Every meal the stay covers is ticked by
  default** — the meeting asked for it, and most guests eat. So what the form
  holds is the meals turned *off*: `mealSlotsFromDeclined(days, declined)`
  derives the ticks, `declinedFromMealSlots` folds a change from the grid back
  into the opt-outs, and only the slots on screen are reconsidered. Storing the
  ticks instead would need back-filling whenever the stay grew, and could not
  tell a meal the requester unticked from one that was never offered. Each
  column's "Every day" box still ticks or clears that meal for the whole stay,
  and meals remain optional — clearing the table submits no plan.
- Shown on `BookingDetails` as a per-day table with the head count (so every
  reviewer sees them) and as "Breakfast (2 days), Dinner (1 day)" in the
  manager's stays tables, with the per-day list in the cell's tooltip.

## Email notifications — `lib/mail/`

Booking mail is **queued, not sent inline**. Actions call `notify*()` from
`lib/mail/notify.ts`, which writes to `email_outbox` (migration 10) and
schedules `dispatchOutbox()` with `after()`; `lib/mail/dispatch.ts` does the
sending. Reasons, the last of which fails silently: a slow SMTP host must not
make the requester wait, a failed send must not fail a stored booking, and on a
serverless host un-awaited work is frozen the moment the function responds.

`getMailer()` picks the transport from the environment, the way
`lib/store/index.ts` picks a backend:

| Condition | Transport | Mail goes to |
| --- | --- | --- |
| `MAIL_DRY_RUN=true` | `DryRunMailer` | nowhere (one log line) |
| `MAIL_USER` + `MAIL_APP_PASSWORD` | `SmtpMailer` (nodemailer) | the SMTP host |
| otherwise | `FileMailer` | `.local-mail/*.eml` |

The file mailer keeps the zero-setup first run working, like `MockStore`.
`.env.example` documents every variable.

- **The hooks live in the server actions, not `updateBookingStatus()`.** The
  store sees a status pair; only the action knows *why* — the reason typed, the
  rooms picked, whether a cancellation was approved or declined. It would also
  mail on the developer console's force-status override, which is a repair
  tool.
- **Every `notify*()` swallows its own errors.** Missing migration, bad
  credentials, a profile with no address — the booking still succeeds and the
  failure is a log line.
- **Recipients come from `canReview()`** (`lib/mail/recipients.ts`), never a
  re-derived hostel/club match. A second copy of the scoping rule would drift
  and start mailing wardens about other hostels' students.
- **`MAIL_REDIRECT_ALL_TO` is applied at send time**, so the outbox keeps an
  honest record of the real recipients. Set it on every non-production
  deployment: without it, one person pointing staging at real data mails a real
  parent.
- **Idempotency does the heavy lifting.** `idempotency_key` is unique and
  inserts are `on conflict do nothing`, keyed on the booking's `updated_at` for
  a transition and the institute date for a digest. So retries queue nothing,
  and **the cron schedule is advisory** — a missed 8am run delivers at 9am, a
  second run at 9:05 sends nothing.
- **Reviewers get one daily digest, not one mail per request** — per-item mail
  during fest week is how a portal gets filtered into spam. The manager is not
  digested; their queue is a section of the daily desk report instead.
- **HTML and plain text are rendered from one block list** (`lib/mail/render.ts`).
  Do not hand-write either body. Tables and inline styles only, no external
  images, and **never a link to an ID document** — mail points at the portal.
- **Staff mail is threaded per person per day; requester mail stands alone**
  (`lib/mail/thread.ts`, `MAIL_THREAD_OF` in `types.ts`). Reviewer and desk
  mail about bookings joins that recipient's daily **approvals** thread; the
  digest, escalation and day-wise log join a separate **daily log** thread. A
  new institute day starts new threads. Threaded mail is queued **one message
  per address** (a message carries one `References`), shares a fixed subject
  (`Guest house approvals — Mon 21 Sep 2026`; the per-item subject moves to
  the preview line), and the **first one actually sent** claims the root
  `Message-ID` — decided in `dispatch.ts` by looking for a SENT sibling, not
  at queue time, so a failed opener hands the role on. Requester mail has no
  threading headers and a `[reference]`-led subject.
- `nodemailer` is in `serverExternalPackages` (dynamic requires + Node
  built-ins). Gmail app passwords are shown in four groups of four and people
  paste the spaces, so `mailConfig()` strips whitespace from
  `MAIL_APP_PASSWORD`.

Scheduling: `/api/mail/dispatch` drains the queue, `/api/mail/cron` runs the
daily jobs (digests, check-in reminders, the per-guest-house day-wise log,
48-hour escalations) then drains. Both take GET or POST and are guarded by
`CRON_SECRET` — **required in production**, optional elsewhere. 8am IST is
`30 2 * * *` UTC. `/admin/mail` in the developer console shows the outbox, what
failed and why, and sends a test message through the real queue.

## Room availability grid (`/availability`)

Open to **every signed-in role** — the one route with no role gate. Pick a
guest house, a **Day / Week / Month** view and a date (with previous / next and
Today buttons). Time always runs **down** the chart and room numbers
**across** it: the day view has a row per hour, the week and month views a row
per day. Red is labelled **Booked** — not "Booked / occupied": a hold is a
reservation, and `OCCUPIED` is a separate fact recorded at the desk. A
room-by-room list underneath gives each booking period and a Vacant / Partly
booked / Booked badge for the whole period shown.

- `listRoomOccupancy(guestHouseId, from, to)` (both stores) returns one segment
  per **(room, booking)** using the same `ROOM_HOLDING_STATUSES` + strict
  overlap as `getOccupiedRoomIds`. The two must agree — a throwaway parity
  check caught nothing, but that is exactly where the backends drift.
- **All the calendar maths lives in `lib/availability.ts`, not the
  components**, so the boundary behaviour is testable: `bucketOccupancyByHour`
  (a stay checking out at 11:00 releases the 11 AM hour, and a same-instant
  back-to-back booking picks it up), `availabilityRange` / `shiftAnchor` (weeks
  run Monday–Sunday; a month step clamps 31 Jan → 28 Feb), and
  `bucketOccupancyByDay` (bars as fractions of the range, plus booked minutes
  per day, which drive the badges and the "N free" figure beside each date).
- Calendar dates (`"yyyy-MM-dd"`) go through `parseDateValue` /
  `addDaysToDateValue` / `formatDateValue` in `lib/tz.ts`. They do the
  arithmetic in UTC because a calendar date has no zone; turning a date into
  instants is still `instituteDayBounds`.
- **In the week and month views time also runs down inside each day's row**
  (midnight at its top edge), so a stay is one continuous bar from check-in to
  check-out (`RangeOccupancyChart`). Keep those axes: switching views should
  zoom out, not rotate the picture.
- `getRoomAvailability(guestHouseId, fromIso, toIso)`
  (`app/actions/availability.ts`, formerly `getDayAvailability`) **strips
  `requester_name` and `purpose_of_visit` unless the caller is `gh_manager` or
  `developer`**, and **refuses windows longer than `MAX_AVAILABILITY_DAYS`
  (62)** because every role can call it. Everyone else gets periods and
  reference ids only. Do not widen this without a reason — the grid answers "is
  this room free", which needs no guest identity.
- Excluded from the 5 s polling: the component fetches client-side and has its
  own Refresh button.
- **The charts live in `components/occupancy-chart.tsx`** — `OccupancyChart`
  (a day) and `RangeOccupancyChart` (a week or month). The day chart is shared
  with the panel inside the booking form (`components/booking-availability.tsx`),
  which shows the same hour-by-hour picture for the guest house and check-in
  date being chosen. Requesters were otherwise picking dates blind. One chart,
  one action, one bucketing — so what the requester sees and what the manager
  sees cannot drift.

## Settings — the rules the console can change (`lib/settings.ts`)

Developer console → **Settings** (developer only; Departments & Clubs stays
manager + developer). Every value defaults to what the code did before.

- **Scalar groups** are jsonb rows in `app_settings` — `rules.capacity`,
  `rules.booking`, `rules.meals` — merged over `DEFAULT_RULES` by
  `parseRuleGroup`, so a row saved before a field existed still reads. **Lists**
  are tables: `hostels` (with `profiles_hostel_fk`, on update cascade / on
  delete restrict) and `official_email_whitelist`. Departments, clubs and
  offices are `units`, now with `office_class` (officer / department).
- **Read them with `getRules()` / `getOfficialEmails()` / `getHostels()`**
  (`lib/settings-server.ts`, React `cache()`, fall back to defaults on any
  error). **Rule functions take the rules as a parameter** — never import a
  "current settings" singleton. A page reads the rules once and hands the same
  object to its client component, which builds `bookingPayloadSchema` with
  `{ rules }` exactly as `createBooking` does.
- **Refuse, don't adjust.** `lib/settings-impact.ts` names the live bookings or
  accounts a change would break; the action returns that list and saves
  nothing.
- **Every change is audited** (`recordAudit` in `lib/audit-server.ts`, table
  `security_audit`, append-only by trigger) *after* it succeeds. Unit and HOD
  changes too.
- Legacy whole-stay meals keep migration 8's windows (`normalizeMeals`), not
  the Settings.

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

- **Destructive actions ask properly.** `components/ui/confirm-dialog.tsx`
  replaced every `window.confirm`: it lists what will be lost and, for guest
  houses / users / bookings, makes the operator type the name, email or
  reference id. A stray Enter must not delete a guest house and its rooms.
- **Users & Roles** — CRUD profiles, assign any role, set hostel / dept-club /
  roll number (these drive warden and FA scoping). Cannot delete yourself or
  drop your own developer role. In Supabase mode, creating a user also creates a
  Supabase Auth user (password `password123`) — needs the service-role key.
  The **LDAP username** field and **Import LDAP usernames** (paste
  `email, ldap username` lines) are how real LDAP logins get onto profiles.
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

## Public website and branding — read `.memories/10-ui-design.md` first

Since 19 Sep 2026, built from `design_handoff/` (a reference, not code to copy).

- **`app/(site)/`** is the public site: `/` home, `/book-room`, `/book-meal`,
  `/guidelines`, `/gallery`, `/contact` (Google Maps embed), `/sign-in`,
  `/mock-login`. Chrome in `components/site/`; the navy `NavBar`
  (`components/site/site-nav.tsx`) is shared with the portal shell, and every
  portal page title is `components/page-header.tsx`.
- **Facts come from the backend.** Guest houses, room counts, who may book
  where, approval chains, meal times, the advance window and cancellation rules
  are rendered from `lib/` by `lib/site-data.ts` / `lib/site-content.ts`. Never
  hardcode on the site a rule the portal enforces, and never a guest house
  name. Those loaders swallow store errors so the public site cannot 500.
- **Editable values** (contact, map, PDF URL, photos) live in `lib/site.ts`;
  `grep -rn "TODO(site)"` lists what the office still has to confirm.
- **Book Meal has no page of its own** — meals are chosen per day inside the
  booking request (`/book`), only where `serves_meals`; `MEALS_ONLY_ROLES`
  can pick service type `meals_only` there to book meals without a room.
  `/book-meal` only explains this and signs in to `/book`.
- **Palette:** navy `#12284C` primary (white text), gold `#E8A317` accents and
  focus ring (gold buttons take **navy** text — never white), body `#41506A`,
  borders `#E1E5EC`, white background, 3px radius, no shadows; Source Serif 4
  headings / Source Sans 3 body via `next/font`. Tokens and brand utilities
  (`bg-navy`, `text-gold-dark`, `bg-band`, `text-body`, …) in
  `app/globals.css`. The portal is restyled **through the shadcn tokens** —
  change a token, not forty components. This retired the old amber palette and
  its white-on-amber contrast failure.
- **Photos:** originals in `Images/` (gitignored, ~180 MB); the site serves
  2000px, metadata-stripped copies from `public/site/photos/`. Resize one photo
  per process with PIL `draft()` or it gets OOM-killed. Their guest house is
  unconfirmed, so the Gallery groups by subject — don't attribute them.
- Logos: `public/IITPKD_NEW_LOGO.png` (stacked, transparent, in both headers;
  replaced the wide `iitpkd-web-logo.jpg` on 21 Sep 2026) and
  `public/iitpkd-logo.png` (emblem; `app/icon.png` is the favicon).
- Verified at **320 px**: no page-level horizontal scroll, one `<h1>` per page.
  Keep grids as `repeat(auto-fit|auto-fill, minmax(min(Npx,100%),1fr))`.

## Traps that already cost time

- **`NEXT_PUBLIC_*` is inlined at build time.** To serve a production build on
  the mock store, `NEXT_PUBLIC_SUPABASE_URL=` must be empty for `npm run build`
  *and* `next start`; otherwise the build still talks to hosted Supabase and
  every mock persona is bounced to `/sign-in`. Rebuild normally afterwards.
- **Moving a route leaves `.next/dev/types` stale** and `next build` fails with
  "Cannot find module '…/app/page.js'". `rm -rf .next/dev/types`.

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
- **A three-dropdown time picker silently keeps its AM/PM.** Changing only the
  hour reuses the period already selected, and the booking form's two fields
  default to *opposite* periods — check-in `12:00` reads PM, check-out `10:00`
  reads AM. A requester asking for 9 AM → 10 PM by touching only the hour
  dropdowns submitted **9 PM → 10 AM** and got "Check-out must be after
  check-in" on a form that looked right to them. Two defences, keep both:
  `TimeSelect` prints a read-back of the resolved time (`describeTime`) under
  the dropdowns, and the booking form shows a live **Your stay** summary with
  both resolved instants. `checkOutOrderError()` in `lib/booking-schema.ts` is
  the shared message — it names both times as the system read them and points
  at the AM/PM dropdowns when the two are on the same day. Don't replace it with
  a bare "check-out must be after check-in"; that was a tautology to the person
  who had just entered the times.
- **Never bind a number input to a coerced value.**
  `value={n} onChange={e => setN(Number(e.target.value) || 1)}` makes the box
  impossible to clear: `Number("")` is 0, `|| 1` snaps it back, and only the
  spinner arrows work. Use `components/ui/quantity-input.tsx`, which keeps the
  raw string (empty included) and leaves validation to the caller. In the schema
  that is `countField`, which reports "…is required" for a blank box instead of
  `z.coerce.number()`'s misleading "At least 1 room".
- **`bookingPayloadSchema` must accept its own output.** The booking form
  validates on the client and sends **`parsed.data`** over the wire
  (`components/booking-form.tsx`), and `createBooking` re-parses that with the
  same schema. So every transform's *output* type has to be a valid *input*
  type. `optionalTrimmed` was `z.string().optional()` transforming blank to
  `null` — `.optional()` accepts `undefined` but **not** `null`, so the second
  pass rejected the first pass's own result and **no role could submit a
  booking at all**, with zod's default "Invalid input: expected string,
  received null". It was invisible from the form because the failing paths were
  `alumni_name` / `alumni_roll_number`, fields a student's form never renders.
  It is `.nullish()` now; `countField` and `age` are round-trip safe the same
  way. If you add a transform here, check the round trip.
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
password `password123`, which is *not* a portal login — each persona signs in
with its dummy LDAP account, listed in `.memories/11-ldap-accounts.md`): two students in different hostels (Malhar, Saveri),
an employee, a whitelisted official (`admin@iitpkd.ac.in`), the Petrichor club,
the IAR Student Cell, two wardens, a Petrichor faculty advisor, the IAR Office,
a GH manager, a GH caretaker (`gh.reception@iitpkd.ac.in`), and
`developer@iitpkd.ac.in`. **There is no alumnus persona** — demo booking 3 is
now the Student Cell booking for one. Five demo bookings seed every queue with
something to look at.

## Supabase setup

Migration files, applied sequentially:
1. `supabase/migrations/00000000000001_init.sql` (tables, enums, RLS, private `documents` bucket)
2. `supabase/migrations/00000000000002_booking_lifecycle.sql` (adds `OCCUPIED`, `VACATED`, `CANCELLATION_REQUESTED`, `CANCELLATION_APPROVED` to `booking_status`)
3. `supabase/migrations/00000000000003_room_holds_and_infants.sql` (`room_holds` + exclusion constraint + `set_room_holds()`, backfills and **drops** `bookings.assigned_room_ids`, adds `bookings.infants`). Destructive — read its header comment before running it against real data.
4. `supabase/migrations/00000000000004_infant_guests.sql` (adds `booking_guests.is_infant`, **drops** `bookings.infants`)
5. `supabase/migrations/00000000000005_app_settings.sql` (`app_settings` key/value table for the developer console password hash; service-role only, no `authenticated` policy)
6. `supabase/migrations/00000000000006_booking_meals.sql` (`bookings.meals` jsonb + a shape check). Additive and defaulted, so existing bookings read as "no meals requested". **Until this is applied, creating a booking against Supabase fails** — the mock store self-heals instead.
7. `supabase/migrations/00000000000007_booking_infant_flag.sql` (`bookings.has_infant`, backfilled wherever a legacy infant guest row exists; `booking_guests.is_infant` is kept for those rows). **Until this is applied, creating a booking against Supabase fails** — the insert names the column. Reads degrade: a missing flag is derived from infant guest rows.
9. `supabase/migrations/00000000000009_booking_types_and_roles.sql`
   (`bookings.booking_type` + `alumni_name` + `alumni_roll_number`, and the
   `iar_student_cell` / `gh_caretaker` enum values). Backfills `booking_type`
   from `user_role`. Additive and defaulted; safe to re-run. **Until it is
   applied, creating a booking against Supabase fails** — the insert names the
   columns — and reads degrade via a fallback in `SupabaseStore.hydrate`.
8. `supabase/migrations/00000000000008_meal_plans.sql` (`guest_houses.serves_meals`, set for Hamsanandi; converts `bookings.meals` to the per-day array with the serving windows from `lib/meals.ts`, and replaces migration 6's shape check). **Until this is applied, a booking with meals cannot be created against Supabase**, and every guest house reads as serving no meals. Safe to re-run.
10. `supabase/migrations/00000000000010_email_outbox.sql` (`email_outbox` +
   `email_status` enum + `claim_queued_emails()`, which claims due rows
   `for update skip locked` so two dispatchers cannot double-send). Additive,
   defaulted and safe to re-run. **Until it is applied, queueing throws** —
   `notify*()` catches and logs it, so bookings still work and only the mail is
   missing.
11. `supabase/migrations/00000000000011_rooms_guests_and_services.sql` (Sep 2026). Room-scoped guests (`booking_rooms`), citizenship, meals-only service types, and `booking_meals` view. Existing bookings are migrated into a single synthetic legacy room. Safe to re-run.
12. `supabase/migrations/00000000000012_profile_ldap_uid.sql` (`profiles.ldap_uid`
   + a unique index on `lower(ldap_uid)`). Additive, nullable, safe to re-run,
   and deliberately **not** backfilled from email. **Until it is applied, LDAP
   sign-in finds nobody on Supabase and saving a user in the console fails.**
   Re-run `supabase/seed.sql` afterwards to give the demo personas their
   usernames.
13. `00000000000013_mail_templates.sql` — editable mail wording (`mail_templates`).
14. `00000000000014_turnover_override.sql` — `room_holds.guard` / `override_by`;
   the exclusion constraint compares `guard`, not `during`.
15. `00000000000015_units_and_debit_heads.sql` — `units`, `PENDING_HOD`,
   `profiles.unit_id` / `staff_category`, `bookings.debit_head`.
16. `00000000000016_settings_and_audit.sql` — `hostels`,
   `official_email_whitelist`, `units.office_class`, the occupancy trigger
   reading Settings, `security_audit`.

Full notes per migration in `.memories/04-database.md`. Migrations are tested
in a throwaway Postgres 16 — Docker, or `embedded-postgres` on a machine
without it (`.memories/05-deployment.md`) — never the hosted project.

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
GitHub identity is a different account (`Rizzwan285`), which used to make
`git push` fail with a permissions error. **That is resolved** — pushes to
`main` succeed as of 10 Sep 2026. If it returns it is a credential problem, not
a code one: add the account as a collaborator or use a `DevMittal09` token.
