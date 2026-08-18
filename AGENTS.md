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

## Two backends, one interface

`lib/store/types.ts` defines `DataStore`. Two implementations satisfy it and
`lib/store/index.ts` picks one **from the environment**:

| Condition | Store | Data lives in |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` + a key set | `lib/store/supabase.ts` | Supabase Postgres + Storage |
| otherwise | `lib/store/mock.ts` | `.local-db.json`, `public/uploads/` |

**Any new data operation must be added to the interface and to both
implementations**, or one backend silently breaks.

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

## Room allocation

`components/room-grid.tsx` — cinema-style grid, green available / red occupied /
blue selected, grouped into double-sharing and single. A date+time selector
re-queries occupancy live.

Occupancy = room ids held by **`APPROVED`** bookings in the same guest house
whose `[check_in, check_out)` overlaps the window. Overlap is strict
(`check_in < other_check_out && check_out > other_check_in`), so a checkout and a
same-instant check-in do **not** clash. `allocateRooms()` re-checks clashes at
confirm time to avoid two managers double-booking a room.

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
- **Never use `datetime-local` or `type="time"`.** Firefox makes them
  type-only, which reads as "I can't select the time". Use
  `components/ui/time-select.tsx` — hour / minute / AM-PM dropdowns, controlled
  via `value` (`"HH:mm"`, 24h) + `onChange`. Its exported `parseTime` /
  `toTimeValue` handle the 12 AM = `00:00` and 12 PM = `12:00` traps — verified
  with throwaway tests, so re-test them if you touch the conversion.
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

## Demo personas

Seeded in `lib/store/seed.ts` (mock) and `supabase/seed.sql` (Supabase auth
password `password123`): two students in different hostels (Malhar, Saveri),
an employee, a whitelisted official (`admin@iitpkd.ac.in`), the Petrichor club,
an alumnus, two wardens, a Petrichor faculty advisor, the IAR cell, a GH
manager, and `developer@iitpkd.ac.in`. Five demo bookings seed every queue with
something to look at.

## Supabase setup

`supabase/migrations/00000000000001_init.sql` (tables, enums, RLS, private
`documents` bucket) then `supabase/seed.sql`. Locally: `supabase db reset`.
Hosted: paste both into the SQL editor. Fill `.env.local` and restart the dev
server; the store switches automatically. See README.md for the full walkthrough.

## Repo state

Git history was reset from the create-next-app scaffold and restarted with a
single initial commit on `main`.
Remote is `https://github.com/DevMittal09/GuestHouseIIT.git`. The local machine's
GitHub identity is a **different account**, so `git push` fails with a
permissions error until that account is added as a collaborator or a
`DevMittal09` credential is used — this is a credential issue, not a code issue.
