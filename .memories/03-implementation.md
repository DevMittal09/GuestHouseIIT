# Implementation

What exists today, with file paths.

## Entry and session

| Concern | File |
| --- | --- |
| Login (persona picker) | `app/page.tsx` |
| Login / logout actions | `app/actions/auth.ts` (`loginAs`, `logout`) |
| Session read | `lib/auth.ts` (`getCurrentUser`, `requireUser`) |
| Post-login landing per role | `lib/routes.ts` (`homeForRole`) |
| Authenticated shell + nav | `app/(portal)/layout.tsx` |

Nav links are role-aware: requesters see Dashboard / New Booking / Booking History,
reviewers see their queue + Approval Log, the manager sees the console +
Approval Log, the developer sees `/admin` + Approval Log.

## Booking submission

- **Page:** `app/(portal)/book/page.tsx` — loads the effective form config, then
  filters guest houses to those the role may book.
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

Guest count is dynamic (1–15) via `useFieldArray`. Uploaded files are held in a
`Map` keyed by field-array row id, outside react-hook-form, because `File`
objects do not belong in form state.

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

## Guest house manager console

`app/(portal)/manager/page.tsx` + `components/manager-queue.tsx` +
`components/room-grid.tsx`.

- Tabs per guest house, built from the database (not hardcoded); the
  zero-guest-house case is handled explicitly.
- Official bookings are highlighted and sorted to the top.
- Selecting a booking opens the allocation grid: pick a window, see live
  occupancy, click rooms, then **Confirm & Allocate** → `allocateRooms()` assigns
  rooms and flips the booking to `APPROVED` atomically, re-checking clashes.
- Rejection requires a reason.
- **Post-approval lifecycle controls**: the manager can mark a booking as
  `OCCUPIED` (checked in), `VACATED` (checked out), or `CANCELLED`. These
  transitions use `updateLifecycleStatus` in `app/actions/bookings.ts`.
- **Cancellation request review**: when a requester submits a cancellation
  request for an approved/occupied booking, the manager can approve or reject it
  via `approveCancellation` / `rejectCancellation` in `app/actions/bookings.ts`.

Queue pages poll every 5 s via `components/auto-refresh.tsx`.

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

**PDF report export** (GH Manager and Developer only) — `exportHistoryPdf()` in
`app/actions/history-pdf.ts`. Generates a print-optimized HTML document with IIT
Palakkad amber branding, a status summary bar, and a 12-column booking table.
The client opens it in a new window and triggers `window.print()` for the
browser’s "Save as PDF" dialog. Quick date presets: Today, Last 7 days, This
month, or the current filter state.

Polling is deliberately **off** on this route (`NO_POLL_PREFIXES` in
`components/auto-refresh.tsx`): the archive is historical, and a 5-second
refresh would only re-run a full scan and churn the table under the reader.

## Developer console (`/admin`)

Layout and tabs in `app/(portal)/admin/layout.tsx`; all actions in
`app/actions/admin.ts`, each gated by `requireDeveloper()` (14 call sites).

| Tab | UI | Capabilities |
| --- | --- | --- |
| Users & Roles | `components/admin/users-manager.tsx` | Create/edit/delete profiles; assign any of the 10 roles; set hostel, department/club, roll number (these drive warden and FA scoping). Cannot delete yourself or drop your own developer role. In Supabase mode, creating a user also creates a Supabase Auth user (password `password123`) — needs the service-role key. |
| Guest Houses & Rooms | `components/admin/guest-houses-manager.tsx` | Create/rename/delete guest houses; add, enable/disable, delete rooms. `total_rooms` is recounted from active rooms automatically. Deleting is blocked when bookings reference the guest house, or when a room is assigned to a booking (disable it instead). |
| Form Builder | `components/admin/form-config-editor.tsx` | Per requester role: allowed guest houses, every guest field's mode, relationship style and options, alumni-card mode, banner text, and custom fields. "Reset to spec defaults" deletes the saved row. |
| All Bookings | `components/admin/bookings-manager.tsx` | Every booking with status filters, an audit-logged force-status override (remark required), and hard delete. |

## Shared domain modules

| File | Contents |
| --- | --- |
| `lib/types.ts` | Domain shapes and label maps. Declared as `type` aliases, not interfaces, so Supabase's generated `Insert`/`Update` helpers accept them. |
| `lib/workflow.ts` | Pipelines, status transitions, `canReview` scoping,
`ROOM_HOLDING_STATUSES`, lifecycle transitions, `historyScope` / `canViewHistory`
/ `canExportPdf` / `isRequesterHistory`. |
| `lib/form-config.ts` | `RoleFormConfig`, defaults per role, sanitization, custom-field validation. |
| `lib/form-config-server.ts` | `getEffectiveFormConfig` — saved config or defaults. |
| `lib/booking-schema.ts` | Config-driven zod schema. |
| `lib/booking-search.ts` | Archive search: criteria, query tokenizer, pure matchers,
faceting, sorting, paging, query-string parsing. Shared by both stores. |
| `lib/routes.ts` | Role landing pages, official email whitelist. |
| `lib/format.ts` | Date/time formatting helpers. |

## UI primitives

`components/ui/` holds the shadcn components in use plus two local additions:

- **`native-select.tsx`** — a styled native `<select>`. This registry ships no
  `form` component and Radix's Select does not work with `register()`, so this is
  the workhorse input for every dropdown.
- **`time-select.tsx`** — the hour/minute/AM-PM picker. Exports `parseTime` and
  `toTimeValue`, which handle the 12 AM = `00:00` and 12 PM = `12:00` traps.

## Branding

Palette and logo are taken from https://dashboard.iitpkd.ac.in/ — primary amber
`#f7a600`, warm off-white `#faf9f7`, text `#2b2b2b`, borders `#e3e1dc`. Tokens
live in `app/globals.css` for both light and a warm dark variant. The logo is
`public/iitpkd-logo.png`; `app/icon.png` is the same file serving as the favicon.

Known accessibility caveat: white-on-amber is low contrast by WCAG. It matches
the official site deliberately. To fix, set `--primary-foreground` to a dark
brown (the dark theme already uses `#251a00`).

## Demo data

Seeded in `lib/store/seed.ts` (mock) and `supabase/seed.sql` (Supabase, auth
password `password123`): 12 personas and 5 bookings positioned so every queue has
something in it. Rooms: Bageshri 10 double + 10 single, Hamsanandi 8 + 8.

| Persona | Email |
| --- | --- |
| Student (Malhar) | `112201001@smail.iitpkd.ac.in` |
| Student (Saveri) | `142202014@smail.iitpkd.ac.in` |
| Employee | `priya@iitpkd.ac.in` |
| Official (whitelisted) | `admin@iitpkd.ac.in` |
| Club (Petrichor) | `petrichor@iitpkd.ac.in` |
| Alumnus | `vikram.iyer@alumni.iitpkd.ac.in` |
| Wardens | `warden.malhar@`, `warden.saveri@iitpkd.ac.in` |
| Faculty advisor | `fa.petrichor@iitpkd.ac.in` |
| IAR cell | `iar@iitpkd.ac.in` |
| GH manager | `guesthouse@iitpkd.ac.in` |
| Developer | `developer@iitpkd.ac.in` |

Whitelisted official addresses (`lib/routes.ts`): `admin@`, `director.office@`,
`registrar@iitpkd.ac.in`.
