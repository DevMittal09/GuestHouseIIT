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
| [10-ui-design.md](10-ui-design.md) | The public website, the design tokens, sign-in pages, photos and map — read before any visual change |
| [11-ldap-accounts.md](11-ldap-accounts.md) | **Dummy LDAP logins for every persona**, how LDAP sign-in works, and how to switch to the institute's real LDAP accounts |

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
(optional) · date-fns · jsPDF · nodemailer. **No test framework is installed**
— see §9.

```
app/
  (site)/                  PUBLIC website: / (home), book-room, book-meal,
                           guidelines, gallery, contact, sign-in, mock-login
  (portal)/
    layout.tsx             authenticated shell + role-aware nav
    dashboard/             requester's own bookings
    book/                  the booking form
    warden/  fa/  iar/     reviewer queues (one component, three scopings)
    availability/          read-only room availability grid (every role)
    history/               booking history (requesters) / approval log (all roles)
    manager/               room allocation console
    admin/                 developer superadmin console
  actions/                 every mutation (server actions)
  api/mail/                the only route handlers: the outbox worker and the daily cron
components/                feature components + components/ui primitives
lib/                       domain logic: types, workflow, form config, occupancy, store, mail
supabase/                  migrations + seed SQL
```

## 3. The six ideas that explain most of the codebase

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
Since 19 Sep 2026 the sign-in card (`/sign-in`, and the two public booking entry
points `/book-room` and `/book-meal`) has two doors onto that cookie:

- **LDAP username + password** (`signInWithLdap`). The directory
  (`lib/ldap/`) checks the password. It is the real server when `LDAP_URL` is
  set, and dummy accounts otherwise. `profiles.ldap_uid` then picks the portal
  account.
- **"Sign in with Google"**, which for now opens the persona picker at
  `/mock-login`. It is a placeholder for Google OAuth and the one-click role
  switcher for development.

The dummy logins and the path to the real LDAP accounts (migration 11, bulk
import, `LDAP_URL`) are in [11-ldap-accounts.md](11-ldap-accounts.md).

**`/` is the public website, not a sign-in page** — portal guards redirect to
`SIGN_IN_PATH` (`/sign-in`). **No other module contains auth logic.** The
cookie is still unsigned, so a signed or server-side session plus real Google
OAuth is the remaining production migration.

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

### 3.5 Every wall-clock time is institute time

`lib/tz.ts` pins the app to **Asia/Kolkata**. Instants are stored as ISO/UTC;
only two operations are zoned — parsing what a user typed, and rendering it
back. Nothing may call `new Date("2026-09-15T12:00")` (the spec resolves that in
the *process* timezone) or format an instant with date-fns / `toLocaleString()`
/ `getHours()`.

This exists because it was a real bug. `toIso()` was
`new Date(datetimeLocal).toISOString()`, which is correct on a machine set to
IST and wrong everywhere else. Once the app ran on a UTC host, a booking for
12:00 was stored as `12:00Z` and the manager's console read it back as
**5:30 PM** — and a 10:00 check-out as **3:30 PM**. Four rows written in that
window are still shifted in the database;
`supabase/repairs/2026-09-10-utc-parsed-bookings.sql` corrects them and rebuilds
their room holds. As a bonus, zoned formatting means a server-rendered date and
its client hydration agree even when the two machines are in different zones.

### 3.6 Rules live in `lib/` as pure functions

The matching, scoping and capacity rules are deliberately not inside stores or
components, because that is where two backends drift apart and where behaviour
becomes untestable:

| Module | Owns |
| --- | --- |
| `lib/workflow.ts` | Pipelines, transitions, `canReview`, `historyScope`, `ROOM_HOLDING_STATUSES`, the advance-booking window |
| `lib/form-config.ts` | Form config, defaults, sanitization, the relationship dependency |
| `lib/booking-search.ts` | Archive search: tokenizer, matchers, facets, paging |
| `lib/occupancy.ts` | Room capacity, infants, how many rooms a party needs |
| `lib/availability.ts` | Availability grid maths (day / week / month ranges, hour and day bucketing, badges) |
| `lib/tz.ts` | The institute timezone: parsing typed times, formatting instants |
| `lib/meals.ts` | Per-day meal plans: serving windows, which meals a stay can have, normalising on read |
| `lib/booking-schema.ts` | The config-driven zod schema both sides run |

## 4. The domain rules

### 4.1 Approval pipelines — `lib/workflow.ts`

| Requester | Entry status | Path |
| --- | --- | --- |
| student | `PENDING_WARDEN` | warden → manager |
| club | `PENDING_FA` | faculty advisor → manager |
| iar_student_cell | `PENDING_IAR` | IAR Office → manager |
| iar_cell (IAR Office) | `PENDING_GH_MANAGER` | manager (direct — it *is* the approver) |
| employee | `PENDING_GH_MANAGER` | manager |
| official | `PENDING_GH_MANAGER` | manager (direct, highest priority) |
| alumni | *retired* | kept only for bookings already in the archive |

- Intermediate approval always forwards to `PENDING_GH_MANAGER`.
- The manager does **not** approve through the generic review action. Approval
  happens via `allocateRooms()`, which assigns rooms and sets `APPROVED`
  together — making "approved with no rooms" unrepresentable.
- Rejection requires a non-empty reason, enforced server-side at every tier.
- Reviewer scoping is `canReview()`: wardens see their `hostel_name`, faculty
  advisors their `department_or_club`. It also refuses
  `reviewer.id === requester.id` — the IAR Office both books and approves, so
  self-approval has to be impossible by construction, not just by routing.
- `official` bookings are restricted to `OFFICIAL_EMAIL_WHITELIST`
  (`lib/routes.ts`) and sort to the top of the manager queue.

**Post-approval lifecycle**, controlled by the manager:

```
APPROVED → OCCUPIED → VACATED
         ↘ CANCELLATION_REQUESTED → CANCELLATION_APPROVED
         ↘ CANCELLED (direct, pre-approval or by the manager)
```

`OCCUPIED` means *the guest is in the room* — a fact the manager records at the
desk, not something the dates imply. `occupancyNotStartedError()` refuses the
transition before check-in (server-side, with the console disabling the button
from the same function), and `stayPhase()` — `upcoming` / `current` / `past` —
is the read side. `/manager` groups by phase rather than status into **Current
occupants**, **Awaiting check-out** and **Upcoming stays**. Previously one
"Upcoming & current stays" table mixed them, so a booking for next week
appeared alongside a guest in the building and read as occupied.

### 4.1a Why a stay is booked — `lib/booking-types.ts`

`bookings.booking_type` is `official` | `personal` | `alumni` (migration 9). It
is a property of the **request**, not the requester: the same staff member
books officially for a collaborator one week and privately for family the next,
and the two are approved and settled differently.

`bookingTypesFor(role)` is the one policy. A role with a single option is
**never asked** — a toggle with one position is not a decision — but the value
is still recorded. Employee is the only role with a real choice (`official`
default, `personal`); club and official are official-only; student is personal.

`alumni` means *on behalf of an alumnus*, who has no institute login. It
requires `alumni_name`, `alumni_roll_number` and the Alumni ID card. The card
is demanded by `config.alumni_card === "required"` **or** by the booking being
for an alumnus, because the IAR accounts book both ways from one form — the
requirement follows the request, not the account.

> **Alumni cannot sign in.** There is no alumni persona and `alumni` is out of
> `REQUESTER_ROLES`. It stays in the `Role` union and in
> `BOOKING_CATEGORY_ROLES` (what history filters and reports read) because
> stored bookings still carry it; removing it would orphan them.

### 4.1b The caretaker — a subset, not a second console

`gh_caretaker` is the reception desk. `/caretaker` shows today's checkouts,
current occupants, awaiting check-out and upcoming stays, and can mark guests
Occupied / Vacated. No allocation, no approvals, no cancellations —
`canUpdateLifecycle()` / `LIFECYCLE_ROLES` gate the one action it shares with
the manager, server-side.

It reuses `components/stays-table.tsx` and `components/checkouts-today.tsx`
rather than owning copies, so the two consoles cannot drift apart.

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
field is called `withExtraBed` and the UI says so — the allocation dialog tells
the manager how many to arrange (`extraBedsFor()`, counted against the rooms
actually picked). Keep that copy formal: "Occupancy: 2 guests (maximum 3 with
an extra bed)", never "sleeps 2, 3 with an extra bed", which the office called
too informal.

**Infants** are children under `INFANT_AGE_LIMIT` (10) sharing a guardian's
bed. Since migration 7 a booking records them as **one switch, `has_infant`** —
whether any are coming, not how many, with no names and no ID — because the
office asked for exactly one option. Bookings made earlier can still carry
**legacy infant guest rows** (`booking_guests.is_infant`), so for a stored
booking capacity is measured with `countBedGuests()` — never `guests.length` —
and the flag is read through `hasInfant()`.

Capacity is checked twice, because different things are known at each point:
`requestedRoomsError()` at submission, when only a room *count* exists, and
`allocationCapacityError()` at allocation, when the actual room types are
known. The booking form also caps how many guests can be added to what the
chosen rooms accommodate.

> **Trap:** infants are not guests. Giving them guest rows again would put them
> back into the capacity count and the ID requirement; the switch exists so
> they are in neither.

### 4.4 Meals

Meals are chosen **per day of the stay** in a days × breakfast / lunch / dinner
grid, so the kitchen has head counts before guests arrive — and **only at guest
houses that serve meals** (`guest_houses.serves_meals`: Hamsanandi on by
default, toggled in the developer console, never a check on the name). Stored as
**one jsonb column** (`bookings.meals`), since migration 8 a `MealPlan`: one
`{date, breakfast, lunch, dinner}` entry per IST day that has a meal. A day
offers only the meals whose serving window overlaps the stay (`stayMealDays`),
enforced by `mealPlanError` in the schema on both sides. `normalizeMeals()` is
the only reader: it expands the old whole-stay object over the stay's days (the
same rule migration 8 applied in SQL) and turns anything missing into "none
requested", so nothing downstream needs a null check. Always optional.

### 4.5 Advance-booking window

Check-in must be within **one month** of today. `latestCheckIn(role)` is the
source of truth and `isAdvanceWindowExempt()` exempts **`official` only** —
dignitary visits are arranged on the institute's own notice. The cap applies to
check-in, not check-out. Use date-fns `addMonths`, never `setMonth` (31 Jan + 1
month must clamp to 28 Feb, not roll to 3 Mar).

### 4.6 Archive scoping — `/history`

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
| `/` | anyone | Public guest house website home (19 Sep 2026) — see [10-ui-design.md](10-ui-design.md) |
| `/book-room` `/book-meal` | anyone | Public booking entry points: sign in, then `/book` |
| `/guidelines` `/gallery` `/contact` | anyone | Rules rendered from `lib/`, the photographs, the map |
| `/sign-in` | anyone | LDAP sign-in + "Sign in with Google"; every portal guard redirects here |
| `/mock-login` | anyone | Google placeholder: persona picker (development) |
| `/dashboard` | requesters | Own bookings, status, assigned rooms, cancellation |
| `/book` | requesters | The config-driven booking form, opening with the booking type, a **browsable** availability panel (day/week/month), a per-day meal grid (where the guest house serves meals) and an "Infant accompanying" switch |
| `/warden` `/fa` `/iar` | reviewers | One `ReviewQueue` component, three scopings |
| `/availability` | **every role** | Read-only time × room occupancy chart, by day, week or month |
| `/history` | **every role** | Booking history / approval log, CSV + PDF export |
| `/manager` | gh_manager | Cinema-style allocation grid, today's checkouts, lifecycle controls |
| `/caretaker` | gh_caretaker | Reception desk: today's checkouts, occupants, upcoming, mark in/out |
| `/admin/*` | developer | Users, guest houses & rooms (including which serve meals), Form Builder, all bookings, mail outbox |
| `/api/mail/dispatch` | cron (`CRON_SECRET`) | Drains the email outbox |
| `/api/mail/cron` | cron (`CRON_SECRET`) | Daily digests, check-in reminders, the day-wise guest house log, 48-hour escalations |

Queue pages poll every 5 s (`components/auto-refresh.tsx`); `/history`,
`/availability` and `/admin/mail` are excluded via `NO_POLL_PREFIXES` — each
fetches client-side and has its own Refresh button.

**Email.** Every workflow transition sends mail, queued through `email_outbox`
and delivered by a worker so a slow or broken mail host can never fail a
booking. One thread per booking; reviewers get a daily digest rather than one
mail per request. `lib/mail/` — see
[03-implementation.md](03-implementation.md) and the decision log.

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

- `/availability` is open to every role, so `getRoomAvailability` **strips
  `requester_name` and `purpose_of_visit` unless the caller is `gh_manager` or
  `developer`**. Everyone else sees periods, reference ids and statuses. The
  grid answers "is this room free", which needs no guest identity. For the same
  reason the action refuses windows longer than `MAX_AVAILABILITY_DAYS` (62).
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
- **One cookie, every tab.** Signing in as another persona in one tab changes
  who *every* tab is, and the 5 s polling makes the others re-render as that
  persona. A cookie has no per-tab granularity, so this cannot be fixed in the
  UI; a guard that blocked the mismatched tab was built and reverted (see
  [06-decisions.md](06-decisions.md)). Real per-tab sessions come with real
  authentication (roadmap item 1); until then use a private window.
- **`bookingPayloadSchema` must accept its own output.** The form validates on
  the client and sends **`parsed.data`**, which `createBooking` re-parses with
  the same schema — so every transform's output type has to be a valid input
  type. `optionalTrimmed` was `z.string().optional()` transforming blank to
  `null`, which `.optional()` rejects, and **no role could submit a booking at
  all**. It is `.nullish()` now. Check the round trip if you add a transform.
- **Never judge performance in `next dev`** — it is ~7× slower than a
  production build on identical data, and a route's first hit is slower again.
  Develop against the mock store too: one query to hosted Supabase costs
  270–580 ms of pure latency, so every click pays it several times over. Both
  measured in [07-troubleshooting.md](07-troubleshooting.md).
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
| IAR Student Cell | `alumnicell@iitpkd.ac.in` | `iar-student-cell` |
| Wardens | `warden.malhar@`, `warden.saveri@iitpkd.ac.in` | `warden-malhar`, `warden-saveri` |
| Faculty advisor | `fa.petrichor@iitpkd.ac.in` | `fa-petrichor` |
| IAR Office | `iar@iitpkd.ac.in` | `iar-cell` |
| GH manager | `guesthouse@iitpkd.ac.in` | `gh-manager` |
| GH caretaker | `gh.reception@iitpkd.ac.in` | `gh-caretaker` |
| Developer | `developer@iitpkd.ac.in` | `developer` |

Rooms: Bageshri 10 double + 10 single, Hamsanandi 8 + 8.

**There is no alumnus persona** — demo booking 3 is now the IAR Student Cell
booking on behalf of Vikram Iyer, sitting in the IAR Office's queue.

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
3. **Client-rendered UI** — headless Chrome driven over the DevTools protocol,
   no packages needed; **migrations** — a throwaway `postgres:16-alpine`
   container with Supabase stand-ins. Both recipes are in
   [05-deployment.md](05-deployment.md#verifying-changes).

> `.env.local` points at the **hosted** Supabase project. For any test that
> writes, start the dev server with `NEXT_PUBLIC_SUPABASE_URL=` (empty) so it
> uses the mock store, and remove the `.local-db.json` it creates afterwards.

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

Migrations are numbered and applied forward only; there are nine. Migration 4
moved infants from `bookings.infants` to `booking_guests.is_infant`, and
migration 7 moved them again, to one `bookings.has_infant` switch — see
[06-decisions.md](06-decisions.md) for why each model changed. Migration 6 adds
`bookings.meals`, migration 7 `bookings.has_infant`, and migration 8
`guest_houses.serves_meals` plus the per-day shape of `bookings.meals`; **all
three must be applied before bookings (with meals) can be created against
Supabase** (the mock store self-heals instead). Migrations 7 and 8 were checked
against a throwaway Postgres before being written down — see
[05-deployment.md](05-deployment.md#verifying-changes).

`supabase/repairs/` holds one-off data fixes that are not migrations and are
never applied automatically. Read each file's header before running it.

Last substantive update: 2026-09-19 — the UI redesign from `design_handoff/`
([10-ui-design.md](10-ui-design.md)): a public guest house website at `/`
(home, Book a Room, Book Meal, Guidelines, Gallery, Contact with the Google
Maps location) in a new `app/(site)/` route group; sign-in moved to `/sign-in`
with the institute domain enforced server-side; the portal restyled in the same
navy/gold, Source Serif/Sans, near-square look through the shadcn tokens (which
also fixed the white-on-amber contrast failure); the office's 14 photographs
served as 2000px web copies. Public-site facts are rendered from `lib/`, not
hardcoded.

Previous update: 2026-09-16 — the second pass over the meeting notes:
booking type (`official` / `personal` / on behalf of an alumnus) as a column
rather than a role; alumni logins removed with the IAR Office and a new IAR
Student Cell booking for them; a Guest House Caretaker role for reception; the
booking form's availability panel made browsable by day/week/month; today's
checkouts on the manager and caretaker consoles; future bookings no longer able
to read as Occupied (the developer override was the remaining way in); the
allocation grid refetching when holds change underneath it; and typed
confirmations on destructive developer actions. Migration 9 covers the schema.

Previous update: 2026-09-15 — from the guest house meeting notes: room
availability by day, week or month (time runs down in every view; a stay is one
bar) with the red legend reading "Booked"; formal capacity wording in the
allocation dialog, which also fixed extra beds being under-counted for single
rooms; one "Infant accompanying" switch per booking (migration 7); and meals
chosen per day, only at guest houses that serve them (migration 8). See the
meeting-notes table in [01-background.md](01-background.md) for what is done and
what is not.

Previous update: 2026-09-10 — all times pinned to institute time
(`lib/tz.ts`, fixing bookings that read back 5h30m late), meal preferences per
booking, hour-by-hour availability inside the booking form, the manager console
split into current / awaiting check-out / upcoming, `OCCUPIED` refused before
check-in, and the allocation grid locked to the booking's own dates.
