# Project memories

Long-form context for the **IIT Palakkad Guest House Booking Portal**.

**Read this file first and you will not need the others unless you are changing
that area.** Everything below is the whole system in one pass; the numbered
files are the deep dives, and each row of the index says when you actually need
one.

| File | Read it when you need |
| --- | --- |
| [01-background.md](01-background.md) | Why this project exists, who uses it, what was asked for |
| [02-architecture.md](02-architecture.md) | How the system is put together and why |
| [03-implementation.md](03-implementation.md) | What is built, feature by feature, with file paths |
| [04-database.md](04-database.md) | Schema, enums, RLS, storage, migrations |
| [05-deployment.md](05-deployment.md) | Running it locally, Supabase setup, going to production |
| [06-decisions.md](06-decisions.md) | Decision log — options considered and why one won |
| [07-troubleshooting.md](07-troubleshooting.md) | Errors already hit and their fixes |
| [08-roadmap.md](08-roadmap.md) | Known gaps and what to build next |
| [09-production-plan.md](09-production-plan.md) | Demo → production, in dependency order |

**Also in the repo root:** `AGENTS.md` is the terse operational brief that agent
tools load automatically. It is the hard rules; these files are the reasoning.
Keep them in step.

---

## 1. What this is

A booking and multi-stage approval portal for IIT Palakkad's two guest houses,
**Bageshri** and **Hamsanandi**. Five kinds of requester submit bookings, each
routed through a different approval chain, all ending at a **Guest House
Manager** who assigns real rooms on a visual grid. A **developer** superadmin
can reconfigure users, guest houses, rooms and even the booking forms from the
UI.

**Status:** feature-complete for the specified workflows. **Not deployed** and
**not using real authentication** — those are the two gates before production.

## 2. Stack

Next.js 16 (App Router, Turbopack) · React 19 · TypeScript · Tailwind v4 ·
shadcn/ui (radix base, "nova" preset) · zod 4 · react-hook-form · Supabase
(optional) · date-fns · jsPDF. **No test framework is installed** — see §9.

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
  actions/                 every mutation (server actions; there are no API routes)
components/                feature components + components/ui primitives
lib/                       domain logic: types, workflow, form config, occupancy, store
supabase/                  migrations + seed SQL
```

## 3. The five ideas that explain most of the codebase

### 3.1 One data interface, two implementations

`lib/store/types.ts` declares a `DataStore` interface. Two classes implement it,
and `lib/store/index.ts` picks one **from the environment**:

| Condition | Store | Data lives in |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` + a key set | `lib/store/supabase.ts` | Supabase Postgres + Storage |
| otherwise | `lib/store/mock.ts` | `.local-db.json`, `public/uploads/` |

> **Rule:** every new data operation must be added to the interface **and both
> implementations**, or one backend silently breaks.

The mock store rewrites the whole JSON file on every mutation — single-process,
not concurrency-safe, fine for dev only. It **self-heals** on load: missing
seeded profiles, a missing `form_configs` key, missing `room_holds` and a
missing `infants` field are all added to older files, so new features never
require deleting the database.

### 3.2 Auth is mocked, with exactly one swap point

There is one exception worth knowing: `/admin` sits behind a **console
password** (`lib/admin-lock.ts`, default `0000`, changeable from Console
Access). It is enforced inside `requireDeveloper()`, so it guards the admin
*actions* rather than just hiding the UI. It is a speed bump for demos, **not**
authentication — identity is still a persona cookie, so anyone can claim to be
the developer. See §6.

`lib/auth.ts` `getCurrentUser()` reads the `gh_mock_user` cookie (a profile id).
Login is a persona picker. **No other module contains auth logic**, so replacing
that one function with institute SSO is the whole production migration.

Authorization is separate and always server-side: every server action re-checks
the caller (`requireUser`, role checks, `canReview`, `requireDeveloper`). The UI
hiding a button is never the security boundary.

### 3.3 The booking form is data, not code

`lib/form-config.ts` defines `RoleFormConfig` — which guest houses a role may
book, a `FieldMode` (`required` | `optional` | `hidden`) per guest field,
relationship input style and options, the relationship dependency (§4.2), the
alumni-card mode, a banner, and admin-defined custom fields.

**Resolution order** (`lib/form-config-server.ts`):

1. the developer-saved config from the store, **if one exists**;
2. otherwise `buildDefaultFormConfig(role, guestHouses)` — the spec defaults;
3. then `sanitizeFormConfig` drops stale guest houses and repairs the
   relationship dependency.

> **Trap:** editing `buildDefaultFormConfig` only affects roles with **no**
> saved config. If a role was ever saved from the Form Builder, its stored row
> wins. "Reset to spec defaults" deletes that row.

The same config builds the zod schema (`lib/booking-schema.ts`) on **client and
server**, so field modes cannot be bypassed by a crafted request. Custom-field
answers are snapshotted onto the booking with their label, so reviewers see the
original question text after an admin later edits the form.

### 3.4 Room occupancy lives in the database, not in application code

`room_holds` is a table with a Postgres **exclusion constraint**: two holds on
the same room with overlapping periods cannot be written. This replaced a
check-then-act race in `allocateRooms()`.

```sql
constraint room_holds_no_overlap
  exclude using gist (room_id with =, during with &&)
```

`during` is a half-open `[check_in, check_out)` range, which is exactly the
app's strict-overlap rule: a checkout and a same-instant check-in do **not**
clash.

- **`Booking.assigned_room_ids` is derived from holds on read.** There is no
  such column any more. Both stores fill it in during hydration.
- **A hold row exists exactly while the booking holds the room.** So
  `ROOM_HOLDING_STATUSES` (`APPROVED`, `OCCUPIED`, `CANCELLATION_REQUESTED`)
  stopped being a filter every query had to remember;
  `updateBookingStatus` deletes the holds when a booking leaves those statuses,
  and occupancy queries just read the table.
- Losing a race raises `RoomClashError` (`lib/types.ts`), which
  `allocateRooms` turns into "those rooms were just taken — refresh the grid".
- The mock store emulates the constraint in `assertNoClash`. Node is
  single-threaded and `saveDb` is synchronous, so a check immediately before the
  write is genuinely atomic there.

### 3.5 Rules live in `lib/` as pure functions

The matching, scoping and capacity rules are deliberately not inside stores or
components, because that is where two backends drift apart and where behaviour
becomes untestable:

| Module | Owns |
| --- | --- |
| `lib/workflow.ts` | Pipelines, transitions, `canReview`, `historyScope`, `ROOM_HOLDING_STATUSES`, the advance-booking window |
| `lib/form-config.ts` | Form config, defaults, sanitization, the relationship dependency |
| `lib/booking-search.ts` | Archive search: tokenizer, matchers, facets, paging |
| `lib/occupancy.ts` | Room capacity, infants, how many rooms a party needs |
| `lib/availability.ts` | Availability grid maths (hour bucketing, day bounds) |
| `lib/booking-schema.ts` | The config-driven zod schema both sides run |

## 4. The domain rules

### 4.1 Approval pipelines — `lib/workflow.ts`

| Requester | Entry status | Path |
| --- | --- | --- |
| student | `PENDING_WARDEN` | warden → manager |
| club | `PENDING_FA` | faculty advisor → manager |
| alumni | `PENDING_IAR` | IAR cell → manager |
| employee | `PENDING_GH_MANAGER` | manager |
| official | `PENDING_GH_MANAGER` | manager (direct, highest priority) |

- Intermediate approval always forwards to `PENDING_GH_MANAGER`.
- The manager does **not** approve through the generic review action. Approval
  happens via `allocateRooms()`, which assigns rooms and sets `APPROVED`
  together — making "approved with no rooms" unrepresentable.
- Rejection requires a non-empty reason, enforced server-side at every tier.
- Reviewer scoping is `canReview()`: wardens see their `hostel_name`, faculty
  advisors their `department_or_club`.
- `official` bookings are restricted to `OFFICIAL_EMAIL_WHITELIST`
  (`lib/routes.ts`) and sort to the top of the manager queue.

**Post-approval lifecycle**, controlled by the manager:

```
APPROVED → OCCUPIED → VACATED
         ↘ CANCELLATION_REQUESTED → CANCELLATION_APPROVED
         ↘ CANCELLED (direct, pre-approval or by the manager)
```

### 4.2 Who may stay — the relationship dependency

Institute policy: a student may book for parents freely, but **siblings and
grandparents only when a parent is staying too**.

This is config, not a hardcoded role check: `parent_relationships` (Mother,
Father) and `dependent_relationships` (Grandmother, Grandfather, Siblings) on
`RoleFormConfig`, defaulted for `student` and empty for every other role.
`parentDependencyError()` is the one matcher, used by the form (which greys out
the gated options) and by the zod schema (which enforces it).

> **Trap:** a developer can rename the relationship options. `sanitizeFormConfig`
> intersects both arrays with the options actually offered and **drops the rule
> entirely if no parent option survives**, so the gated options can never become
> permanently unselectable.

### 4.3 Room capacity and infants — `lib/occupancy.ts`

| Room type | Own beds | With one extra bed |
| --- | --- | --- |
| `double_sharing` | 2 | 3 |
| `single` | 1 | 2 |

The third occupant of a double is on a rolled-in extra bed, which is why the
field is called `withExtraBed` and the UI says so — `extraBedsNeeded()` tells
the manager how many to arrange.

**Infants** are children under `INFANT_AGE_LIMIT` (10) sharing a guardian's
bed. They are **guest rows with `is_infant`**, not a count: the office still
wants their name, age and gender on the register, and only the **ID is
waived**. They occupy no bed, so `countBedGuests()` — never `guests.length` —
is what capacity is measured against.

Capacity is checked twice, because different things are known at each point:
`requestedRoomsError()` at submission, when only a room *count* exists, and
`allocationCapacityError()` at allocation, when the actual room types are
known. The booking form also caps how many guests can be added to what the
chosen rooms sleep, plus infants.

> **Trap:** a booking of infants only is refused — someone has to be on a bed.

### 4.4 Advance-booking window

Check-in must be within **one month** of today. `latestCheckIn(role)` is the
source of truth and `isAdvanceWindowExempt()` exempts **`official` only** —
dignitary visits are arranged on the institute's own notice. The cap applies to
check-in, not check-out. Use date-fns `addMonths`, never `setMonth` (31 Jan + 1
month must clamp to 28 Feb, not roll to 3 Mar).

### 4.5 Archive scoping — `/history`

Open to **all roles**; `historyScope(user)` decides the slice. Requesters see
their own bookings ("Booking History"); reviewers see their jurisdiction and the
manager/developer see everything ("Approval Log").

> **Trap that already bit:** `criteria.statuses` must **not** be pushed down to
> SQL. Facet counts are computed *before* the status filter, so the candidate
> set must still contain the other statuses. Doing this collapsed the Supabase
> tiles to zero while the mock store stayed correct.

`criteriaFromParams()` spreads the scope **last**, so a hand-edited query string
can only narrow, never widen. Do not reorder that spread.

## 5. Feature map

| Route | Who | What |
| --- | --- | --- |
| `/` | anyone | Persona picker (stands in for SSO) |
| `/dashboard` | requesters | Own bookings, status, assigned rooms, cancellation |
| `/book` | requesters | The config-driven booking form |
| `/warden` `/fa` `/iar` | reviewers | One `ReviewQueue` component, three scopings |
| `/availability` | **every role** | Read-only time × room occupancy grid |
| `/history` | **every role** | Booking history / approval log, CSV + PDF export |
| `/manager` | gh_manager | Cinema-style allocation grid, lifecycle controls |
| `/admin/*` | developer | Users, guest houses & rooms, Form Builder, all bookings |

Queue pages poll every 5 s (`components/auto-refresh.tsx`); `/history` and
`/availability` are excluded via `NO_POLL_PREFIXES`.

## 6. Privacy and access posture

**The developer console password** (`lib/admin-lock.ts`) guards `/admin`:

- default `0000`, changed from the **Console Access** tab;
- stored as a scrypt hash in `app_settings` (migration 5) — never plaintext,
  never sent to the client;
- the unlock is an httpOnly HMAC cookie signed **with the stored hash**, so a
  password change invalidates every outstanding unlock;
- checked inside `requireDeveloper()`, so it covers the actions, not just the
  page;
- attempts throttled per user in-process (10 per 5 min);
- a missing `app_settings` table falls back to the default rather than throwing.

> It stops casual poking, nothing more. Identity is still a persona cookie, so
> anyone can become the developer — the password is a demo guard, and the real
> fix is item 1 of [08-roadmap.md](08-roadmap.md).

- `/availability` is open to every role, so `getDayAvailability` **strips
  `requester_name` and `purpose_of_visit` unless the caller is `gh_manager` or
  `developer`**. Everyone else sees periods, reference ids and statuses. The
  grid answers "is this room free", which needs no guest identity.
- `exportHistoryCsv` / `exportHistoryPdf` take only a query string and re-derive
  the user, scope and params server-side, so an export can never exceed what the
  caller may see. Keep it that way.
- CSV cells starting with `= + - @` are apostrophe-prefixed; every text field is
  user-supplied and spreadsheets execute formula cells.
- The app stores Aadhaar scans with no retention policy. That is the item with
  real legal exposure — see [09-production-plan.md](09-production-plan.md) §5.

## 7. Traps that already cost time

- **Server action body limit.** Uploads exceed the 1 MB default and fail as an
  opaque `NetworkError`. `next.config.ts` raises it to `25mb`.
- **Never use `datetime-local` or `type="time"`.** Firefox renders them
  type-only, which reads as "I can't select the time". Use
  `components/ui/time-select.tsx`.
- **Never bind a number input to a coerced value.**
  `value={n} onChange={e => setN(Number(e.target.value) || 1)}` makes the box
  impossible to clear. Use `components/ui/quantity-input.tsx`, which keeps the
  raw string.
- **React Compiler lint is strict.** No `setState` in an effect body (raise
  loading flags in the event handlers instead), no `watch()` in render (use
  `useWatch`), no reading refs during render.
- **shadcn registry.** `init` needs `-b radix -p nova --no-monorepo`. There is
  **no `form` component** — hence `components/ui/native-select.tsx` and manual
  `FieldError` rendering.
- **`.gitignore` has `.env*`**, which also hides `.env.example`; the
  `!.env.example` exception must stay.
- **Node version.** Next.js 16 needs `>= 20.9.0`.
- Domain shapes in `lib/types.ts` are `type` aliases, not `interface`, so
  Supabase's generated `Insert`/`Update` helpers accept them.

## 8. Demo personas

Seeded in `lib/store/seed.ts` (mock). Supabase `seed.sql` seeds **profiles,
guest houses and rooms only** — the five demo bookings are mock-store only.

| Persona | Email | Mock profile id |
| --- | --- | --- |
| Student (Malhar) | `112201001@smail.iitpkd.ac.in` | `student-anjali` |
| Student (Saveri) | `142202014@smail.iitpkd.ac.in` | `student-rahul` |
| Employee | `priya@iitpkd.ac.in` | `employee-priya` |
| Official (whitelisted) | `admin@iitpkd.ac.in` | `official-admin` |
| Club (Petrichor) | `petrichor@iitpkd.ac.in` | `club-petrichor` |
| Alumnus | `vikram.iyer@alumni.iitpkd.ac.in` | `alumni-vikram` |
| Wardens | `warden.malhar@`, `warden.saveri@iitpkd.ac.in` | `warden-malhar`, `warden-saveri` |
| Faculty advisor | `fa.petrichor@iitpkd.ac.in` | `fa-petrichor` |
| IAR cell | `iar@iitpkd.ac.in` | `iar-cell` |
| GH manager | `guesthouse@iitpkd.ac.in` | `gh-manager` |
| Developer | `developer@iitpkd.ac.in` | `developer` |

Rooms: Bageshri 10 double + 10 single, Hamsanandi 8 + 8.

## 9. How to verify a change

There is **no test framework**. Both of these are proven to work:

1. **Ad-hoc TypeScript tests** — `npx tsx --tsconfig ./tsconfig.json <file>.ts`.
   Note that `@/` aliases resolve but **bare package imports only resolve from
   inside the repo**, so put the file in the repo root and delete it after.
   Top-level `await` is not supported (CJS output) — wrap in `async function
   main()`.
2. **HTTP smoke tests** against a running dev server. Auth is a cookie holding a
   profile id, so you can impersonate anyone:
   `curl -s -b "gh_mock_user=gh-manager" http://localhost:3000/manager`

Always finish with `npm run build` (runs the typecheck) and `npm run lint`.
`next dev` refuses to start if port 3000 is already in use.

> **Do not build while a dev server is running.** `next build` and `next dev`
> share `.next/`, so the build yanks the directory out from under the running
> server and it exits 1 — the app goes down for anyone using it in a browser,
> while the build reports success. Build before starting the server, or restart
> the server afterwards.

If a test touches the mock store, back up and restore `.local-db.json` — it is
the developer's working data.

---

Migrations are numbered and applied forward only; there are four. Migration 4
moved infants from `bookings.infants` to `booking_guests.is_infant` — see
[06-decisions.md](06-decisions.md) for why the first model was wrong.

Last substantive update: 2026-09-03 — room holds moved into the database with an
exclusion constraint, extra-bed room capacity, infants as guest rows, guest
count capped by rooms, clearable number inputs, real PDF export.
