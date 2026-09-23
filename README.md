# IIT Palakkad Guest House Booking Portal

Reservation and multi-stage approval portal for the **Bageshri** and **Hamsanandi** guest
houses. Built with Next.js (App Router) + TypeScript + Tailwind CSS + shadcn/ui + Supabase.

## Quick start (zero setup)

```bash
npm install
npm run dev
```

Open http://localhost:3000 and sign in with any of the dummy LDAP accounts (listed
in `.memories/11-ldap-accounts.md` — e.g. `priya` / `Priya@2026`). With no Supabase
env vars set, the app runs against a local mock data layer:

- **Database** → `.local-db.json` (auto-seeded on first run; delete it to reset demo data)
- **Auth** → a real session row with an opaque cookie, opened by the dummy LDAP
  directory. One-click persona switching is a developer door: `DEV_LOGIN=true npm run dev`
- **Uploads** → saved outside `public/`, served only through an authorised, audited route
- **Email** → written to `.local-mail/*.eml` instead of being sent (open one in any mail
  client to see exactly what a recipient would have received)

```bash
npm run lint && npm run typecheck && npm test   # unit tests
npm run test:e2e                                # the journeys, in a real browser
```

## Roles & approval pipelines

| Requester | Guest houses | Pipeline |
| --- | --- | --- |
| Student | Bageshri only | Student → Hostel Warden → GH Manager |
| Employee (Faculty & Staff) | Both | Official: Employee → **HOD** → GH Manager; personal: → GH Manager |
| Official / Dignitary (offices) | Both | **Direct** → GH Manager, or **Requires HOD approval** → HOD → GH Manager (whitelisted emails only) |
| Club / Fest Council | Both | Club → Faculty Advisor / council secretary → HOD (if configured) → GH Manager |
| IAR Student Cell | Both | IAR Student Cell → IAR Office → GH Manager |
| IAR Office | Both | Direct → GH Manager, or → its head (HOD) first |

Every official booking names a **debitable head** (Department / Institute /
PDF / Project / Personal), configurable per requester category in Settings;
Project picks from the Projects list. HODs approve from `/hod`.

Form behaviour per role (see `lib/booking-schema.ts`):

- **Student** — relationship is a strict dropdown (Mother/Father/Grandmother/Grandfather/Siblings),
  Aadhaar/ID number + document upload mandatory, "double shared rooms get first preference" banner.
- **Employee** — same as student but relationship is free text.
- **Official** — gender, rooms and purpose mandatory; guest/Aadhaar details optional and no
  relationship field; queue rows are highlighted and float to the top of the manager's list.
- **Club** — same field set as student but with no relationship field, and ID/Aadhaar upload is
  optional.
- **IAR Student Cell / IAR Office** — alumni have no institute login, so these two accounts
  raise bookings *on behalf of* an alumnus (`booking_type: "alumni"`): alumnus name, roll number
  and a mandatory Alumni ID card upload, previewed inline in the IAR portal. There is no alumni
  persona to sign in as.

Reviewer portals: `/warden` (scoped to the warden's hostel), `/fa` (scoped to the advisor's
club/council), `/iar`, and `/manager` — the GH Manager console with per-guest-house queues and a
cinema-style room grid (green = available, red = occupied, blue = selected) with a date/time
selector for clash checking. "Confirm & Allocate" re-validates clashes server-side, assigns room
ids and marks the booking `APPROVED`. Rejections everywhere require a mandatory reason. Desk
screens update themselves through Supabase realtime, falling back to a 30-second poll where
there is no Supabase (`components/live-updates.tsx`).

## The desk, and the bill

The manager and caretaker consoles share one stays table: **Mark as Occupied** when a
guest arrives (**Early check-in** if they are ahead of their booked time, which the log
says), **Mark as Vacated** when they leave — which is what releases the room. A stay that
has been checked out and not yet paid for waits under **Checked out — to bill**.

**Invoice** on a stay opens the bill in the office's own template: the rooms and their
chargeable days, extra beds, the meals actually served (correctable against the kitchen's
tally), GST split out of the tariff — **the rates are GST-inclusive, so the Grand Total is
the price the office quotes** — then *Issue & print*, which numbers it against the
financial year, freezes it, and renders the PDF. *Mark paid* records cash, UPI or a
transfer. An issued invoice cannot be edited; it is cancelled with a reason and reissued.

Rooms can also be taken out of service (maintenance blocks), stays extended, guests moved
between rooms, and a no-show released automatically after a configurable window.

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
- **Tariffs & Invoicing** (manager too) — room, extra-bed and meal rates by date, invoice
  numbering, GST, GSTIN, bank details and the Accounts email. Invoices themselves are issued
  from the manager and caretaker consoles (**Invoice** on a stay: preview, correct meal counts,
  Issue & print, Mark paid) in the office's template, with a monthly collections CSV on
  `/history`.
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
2. In the project's **SQL Editor**, paste and run **every file in
   `supabase/migrations/` in numerical order** (`00000000000001_init.sql` through
   the highest-numbered file — 22 as of September 2026), then `supabase/seed.sql`.
   An existing project does not pick up new migrations by itself — after pulling
   changes, run the ones you have not applied yet, in order. Every migration from
   6 onwards is safe to re-run.
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
`MockStore` and `SupabaseStore` — selected automatically in `lib/store/index.ts`.

**Signing in.** The sign-in page takes an **LDAP username and password**, checked against
dummy accounts (one per demo persona — listed in `.memories/11-ldap-accounts.md`, e.g.
`priya` / `Priya@2026`) until `LDAP_URL` points it at the institute directory (see
`.env.example`). **"Sign in with Google"** is the real OpenID Connect flow when
`GOOGLE_CLIENT_ID` is set, restricted to institute domains; where it is not configured the
button is not shown at all. The `password123` above is not a portal login. Apply migration
12 so profiles can carry their LDAP username (`profiles.ldap_uid`); real usernames are
loaded from the developer console (Users & Roles → Import LDAP usernames).

The session is a **row** (`sessions`, migration 21) with an opaque token in the cookie —
30 minutes idle, 12 hours absolute, revocable, rotated when a session gains privilege.
Guests' ID numbers are encrypted at rest and shown as their last four digits. Uploaded
documents live in the private `documents` bucket and are served only through
`/api/documents/…`, which checks who is asking, writes an audit row, and signs a
five-minute link. In production the server refuses to start without `APP_URL`,
`CRON_SECRET` and `ID_ENCRYPTION_KEY`, and refuses outright if the developer sign-in doors
are switched on. See `.memories/14-security.md`.

## Email notifications

Out of the box, mail is **written to `.local-mail/*.eml`** rather than sent, so the portal
works with no credentials. To send for real, set two variables in `.env.local`:

```bash
MAIL_USER=guesthouse@iitpkd.ac.in
MAIL_APP_PASSWORD=<16-character app password>   # Gmail rejects account passwords for SMTP

# Safety valve: send EVERYTHING here instead of to real requesters and wardens.
# Set this on every deployment that is not production.
MAIL_REDIRECT_ALL_TO=you@example.com

# Absolute origin for links inside mail bodies (defaults to http://localhost:3000)
APP_BASE_URL=https://guesthouse.iitpkd.ac.in

# Required in production: guards the two cron routes below, which send mail to real people
CRON_SECRET=<a long random string>
```

`.env.example` documents the rest (host, port, from/reply-to, `MAIL_DRY_RUN`). Defaults are
Gmail on `smtp.gmail.com:465`. Against Supabase, apply
`supabase/migrations/00000000000010_email_outbox.sql` first — until then bookings still work
and only the mail is skipped, with a warning in the server log.

**Check it works:** sign in as `developer@iitpkd.ac.in`, open the developer console →
**Mail Outbox**, and press *Send a test message*. That page also shows every message the
portal has queued, what failed and why, and lets you retry one.

### What gets sent

| When | To |
| --- | --- |
| A booking is submitted | Requester (acknowledgement) and the first reviewer in its pipeline |
| A tier approves | Requester, and the Guest House Manager it moved to |
| A booking is rejected | Requester, with the reviewer's reason verbatim |
| Rooms are allocated | Requester (room numbers, check-in, what ID to carry); manager + caretaker get a copy |
| A cancellation is requested or decided | Manager, then the requester |
| The day before check-in | Requester (rooms, directions, what to bring) |
| Daily | Each reviewer with a non-empty queue — one digest, not one mail per request |
| Daily | Manager + caretaker — the day-wise guest house log, per guest house |
| A request has waited over 48 h | The reviewer, copying the manager |
| An official booking's invoice is issued | The Accounts email, copying the requester's HOD and the requester, with the invoice PDF |

Staff mail about a booking is threaded **per booking** — everything about one request arrives as
one conversation — while the daily digest and log thread per day and requesters' mail stands alone.
Nothing is
sent inside a request: messages are queued in `email_outbox` and delivered by a worker, so a slow or
broken mail host can never fail a booking or make a requester wait.

### Scheduling

Two routes do the timed work. Point any cron at them with the `CRON_SECRET` as a bearer
token:

```cron
*/5 * * * *  curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://<host>/api/mail/dispatch
30 2 * * *   curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://<host>/api/mail/cron
```

`30 2` UTC is 08:00 IST. The dispatch route is only a safety net — mail normally leaves
within a second of the action that caused it. Every daily job is idempotent per institute
calendar day, so a missed run still delivers on the next one and a double run sends nothing.

## Project map

```
lib/types.ts             domain types, enums, labels
lib/workflow.ts          pipeline rules (initial status, transitions, reviewer scoping)
lib/booking-schema.ts    zod validation + per-role form rules
lib/store/               DataStore interface, mock + Supabase implementations, seed data
lib/mail/                transport seam, templates, outbox worker, digests
lib/invoice.ts           chargeable days, GST-inclusive pricing, the invoice document
lib/settings.ts          the rules the office edits, with their defaults
lib/sessions.ts          session rows; lib/auth.ts is the only reader of the cookie
app/actions/             server actions: auth, createBooking, review, allocateRooms
app/api/mail/            the outbox worker and the daily cron
app/(site)/              the public website
app/(portal)/            dashboard, book, warden, fa, hod, iar, manager, caretaker, admin
components/              booking form, review queues, manager console, room grid
supabase/                migrations + seed SQL
tests/                   Vitest unit and store tests
e2e/                     Playwright journeys, run against a production build
.memories/               the project's documentation — start at .memories/README.md
```

## Documentation

`.memories/` is the long-form documentation: how it is built
(`02-architecture.md`, `03-implementation.md`), the database and every migration
(`04-database.md`), running and deploying with the production runbook
(`05-deployment.md`), why things are the way they are (`06-decisions.md`), what to do when
something breaks (`07-troubleshooting.md`), the workflows role by role
(`13-workflows.md`) and security (`14-security.md`).
