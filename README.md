# IIT Palakkad Guest House Booking Portal

Reservation and multi-stage approval portal for the **Bageshri** and **Hamsanandi** guest
houses. Built with Next.js (App Router) + TypeScript + Tailwind CSS + shadcn/ui + Supabase.

## Quick start (zero setup)

```bash
npm install
npm run dev
```

Open http://localhost:3000 and sign in as any persona. With no Supabase env vars set, the
app runs against a local mock data layer:

- **Database** → `.local-db.json` (auto-seeded on first run; delete it to reset demo data)
- **Auth** → mock cookie session with one-click role switching from the login page
- **Uploads** → saved under `public/uploads/`

## Roles & approval pipelines

| Requester | Guest houses | Pipeline |
| --- | --- | --- |
| Student | Bageshri only | Student → Hostel Warden → GH Manager |
| Employee (Faculty & Staff) | Both | Employee → GH Manager |
| Official / Dignitary | Both | Direct → GH Manager (whitelisted emails only) |
| Club / Fest Council | Both | Club → Faculty Advisor → GH Manager |
| Alumni | Both | Alumni → IAR Cell → GH Manager |

Form behaviour per role (see `lib/booking-schema.ts`):

- **Student** — relationship is a strict dropdown (Mother/Father/Grandmother/Grandfather/Siblings),
  Aadhaar/ID number + document upload mandatory, "double shared rooms get first preference" banner.
- **Employee** — same as student but relationship is free text.
- **Official** — gender, rooms and purpose mandatory; guest/Aadhaar details optional and no
  relationship field; queue rows are highlighted and float to the top of the manager's list.
- **Club** — same field set as student but with no relationship field, and ID/Aadhaar upload is
  optional.
- **Alumni** — same as student plus a mandatory Alumni ID card upload, previewed inline in the
  IAR Cell portal.

Reviewer portals: `/warden` (scoped to the warden's hostel), `/fa` (scoped to the advisor's
club/council), `/iar`, and `/manager` — the GH Manager console with per-guest-house queues and a
cinema-style room grid (green = available, red = occupied, blue = selected) with a date/time
selector for clash checking. "Confirm & Allocate" re-validates clashes server-side, assigns room
ids and marks the booking `APPROVED`. Rejections everywhere require a mandatory reason. Queue
pages poll for changes every 5 s (`components/auto-refresh.tsx`).

## Developer console (superadmin)

Sign in as **Portal Developer** (`developer@iitpkd.ac.in`) to open `/admin`:

- **Users & Roles** — add/edit/delete accounts, assign any role to any email, set the hostel
  (warden/student scoping), department/club (FA/club scoping) and roll number.
- **Guest Houses & Rooms** — create/rename/delete guest houses; add, deactivate or delete rooms
  per guest house. New guest houses appear in the manager console and form permissions instantly.
- **Form Builder** — per requester role: choose allowed guest houses, set every guest field
  (name/age/gender/relationship/ID number/ID document) to required/optional/hidden, switch the
  relationship input between a strict dropdown (with editable options) and free text, control the
  alumni-card upload, edit the info banner, and add custom fields (text, long text, number, date,
  dropdown, checkbox) that are stored with each booking and shown to reviewers. "Reset to spec
  defaults" restores the original behaviour.
- **All Bookings** — every booking across statuses, with an audit-logged force-status override
  and permanent delete.

Form configs are stored per role (`form_configs` table / mock JSON) and validated on both client
and server, so form rules can't be bypassed by crafted requests.

## Switching to Supabase

### Option A — local Supabase (needs Docker)

```bash
npm install -g supabase        # or: brew install supabase/tap/supabase
supabase start                 # boots local Postgres/Auth/Storage in Docker
supabase db reset              # applies supabase/migrations + supabase/seed.sql
supabase status                # prints API URL, anon key and service_role key
```

### Option B — hosted Supabase (supabase.com)

1. Create a project at https://supabase.com/dashboard (free tier is fine).
2. In the project's **SQL Editor**, paste and run
   `supabase/migrations/00000000000001_init.sql`, then `supabase/seed.sql`.
   (Or link the CLI: `supabase link --project-ref <ref>` then `supabase db push`.)
3. Copy the keys from **Project Settings → API**.

### Then fill `.env.local` and restart `npm run dev`

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...   # required for the developer console's user management
```

The migration creates all tables, enums, RLS policies and the private `documents` storage
bucket; the seed creates the demo personas (password `password123`), guest houses and rooms.
Users created from the developer console get Supabase Auth accounts (password `password123`)
via the admin API, which needs the service-role key.

The data layer is a single interface (`lib/store/types.ts`) with two implementations —
`MockStore` and `SupabaseStore` — selected automatically in `lib/store/index.ts`. Mock auth
lives in `lib/auth.ts`; swap `getCurrentUser()` for Supabase Auth / institute SSO to go to
production. Uploaded documents go to the private `documents` bucket via signed URLs.

## Project map

```
lib/types.ts             domain types, enums, labels
lib/workflow.ts          pipeline rules (initial status, transitions, reviewer scoping)
lib/booking-schema.ts    zod validation + per-role form rules
lib/store/               DataStore interface, mock + Supabase implementations, seed data
app/actions/             server actions: auth, createBooking, review, allocateRooms
app/(portal)/            dashboard, book, warden, fa, iar, manager
components/              booking form, review queues, manager console, room grid
supabase/                migrations + seed SQL
```
