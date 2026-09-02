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
    history/               booking history (requesters) / approval log (all roles)
    manager/               room allocation console
    admin/                 developer superadmin console
  actions/                 all mutations (server actions)
components/                feature components + components/ui primitives
lib/                       domain logic: types, workflow, form config, store
supabase/                  migrations + seed SQL
```

Everything that writes data goes through a **server action** in `app/actions/`.
There are no API routes. Pages are server components that read through the store
and pass plain data to client components.

## The three ideas that explain most of the codebase

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

## Room allocation and clash detection

`components/room-grid.tsx` renders the cinema-style grid — green available, red
occupied, blue selected — grouped into double-sharing and single rooms, with a
date/time selector that re-queries occupancy live.

Occupancy is computed as: room ids held by bookings in **`ROOM_HOLDING_STATUSES`**
(`APPROVED`, `OCCUPIED`, `CANCELLATION_REQUESTED`) in the same guest house whose
window overlaps. Overlap is strict —
`check_in < other_check_out && check_out > other_check_in` — so a checkout and a
same-instant check-in do **not** clash. `allocateRooms()` re-checks for clashes at
confirm time, so two managers acting simultaneously cannot double-book a room.

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

### PDF report export

GH Manager and Developer roles can generate printable PDF reports from `/history`.
The server action `exportHistoryPdf` in `app/actions/history-pdf.ts` generates a
print-optimized HTML document with IIT Palakkad branding, status summary, and a
full booking table. The client opens it in a new window and triggers
`window.print()` for the browser's "Save as PDF" dialog. Date presets (Today,
Last 7 days, This month) and current-filter export are available.

## Audit trail

Every status change appends a `booking_logs` row through
`updateBookingStatus(id, update, log)`. The store fills in `previous_status`
itself, so callers pass only `new_status`. `action_by_name` is denormalized and
`action_by` is nullable (`on delete set null`) so history survives deletion of the
acting account.
