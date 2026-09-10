# Database

Schema lives in `supabase/migrations/00000000000001_init.sql`; demo data in
`supabase/seed.sql`. Generated TypeScript types are hand-maintained in
`lib/supabase/database.types.ts`.

## Tables

| Table | Purpose |
| --- | --- |
| `profiles` | One row per user. `id` references `auth.users`. Holds `email`, `full_name`, `role`, `hostel_name`, `department_or_club`, `roll_number`. |
| `guest_houses` | `name` (free-form, unique) and `total_rooms` (recounted from active rooms). |
| `rooms` | `guest_house_id`, `room_number`, `room_type`, `is_active`. Unique per (guest house, room number). |
| `bookings` | The core record — see below. |
| `booking_guests` | One row per guest: name, age, gender, relationship, id number, `id_document_url`, `is_infant`. |
| `booking_logs` | Append-only audit trail of status changes. |
| `form_configs` | One row per requester role: `role` (PK), `config` jsonb, `updated_at`. |
| `room_holds` | Which room each booking occupies, and when. See below — this is the interesting one. |
| `app_settings` | Runtime key/value. Currently one key: the developer console password hash. **Service-role only — no `authenticated` policy**, because a developer policy would expose the hash to anyone who can set their own role. |

### `bookings` columns worth knowing

- `booking_reference_id` — human-facing reference (e.g. `IITPKD-GH-2026-DM001`).
- `user_role` — the requester's role *at submission time*, snapshotted so later
  role changes do not rewrite history.
- `status` — see enum below.
- `rejection_reason`, `alumni_id_url`.
- `custom_fields jsonb` — snapshot of admin-defined field answers, each with its
  `label` preserved so reviewers see the original question text.

> **There is no `assigned_room_ids` column.** It was dropped in migration 3.
> `Booking.assigned_room_ids` still exists in the domain type but is **derived
> from `room_holds`** during hydration in both stores.

## `room_holds` — occupancy the database can enforce

```sql
create table public.room_holds (
  booking_id uuid not null references bookings (id) on delete cascade,
  room_id    uuid not null references rooms (id) on delete cascade,
  during     tstzrange not null,          -- [check_in, check_out)
  primary key (booking_id, room_id),
  constraint room_holds_no_overlap
    exclude using gist (room_id with =, during with &&)
);
```

Needs the `btree_gist` extension (the migration creates it).

**Why it exists.** `allocateRooms()` used to read occupancy, decide there was no
clash, and then write — a check-then-act race. One manager almost never loses
it; two managers, or one double-click, can write two holds on the same room. The
exclusion constraint makes that write fail instead, with SQLSTATE `23P01`, which
the store turns into `RoomClashError`.

**The invariant that makes everything else simple:** *a row exists exactly while
the booking is holding the room.* So:

- occupancy queries are a plain read of `room_holds` — no status filter, because
  a released booking has no rows;
- `updateBookingStatus` deletes the holds whenever the new status is not in
  `ROOM_HOLDING_STATUSES`, so `VACATED` / `CANCELLED` / `REJECTED` /
  `CANCELLATION_APPROVED` free their rooms in one place rather than at each call
  site;
- `deleteRoom` checks `room_holds` rather than scanning bookings.

`during` is **half-open**, which is precisely the app's strict-overlap rule: a
stay ending at 11:00 and another starting at 11:00 do not collide.

**Writes go through `set_room_holds(booking_id, room_ids, check_in, check_out)`,**
a plpgsql function added by the same migration. It deletes and re-inserts in one
transaction; doing that as two PostgREST calls would drop the existing holds
before discovering the new ones do not fit.

The mock store keeps a `room_holds` array and emulates the constraint in
`assertNoClash`. Node is single-threaded and `saveDb` writes synchronously, so a
check immediately before the write is genuinely atomic there — the race the
constraint exists to stop cannot occur in a single-process JSON store.

## Enums

```sql
user_role:      student, employee, official, club, alumni,
                warden, faculty_advisor, iar_cell, gh_manager, developer
booking_status: PENDING_WARDEN, PENDING_FA, PENDING_IAR, PENDING_GH_MANAGER,
                APPROVED, OCCUPIED, VACATED, REJECTED, CANCELLED,
                CANCELLATION_REQUESTED, CANCELLATION_APPROVED
room_type:      single, double_sharing
```

> `guest_houses.name` has **no `check` constraint**. It originally allowed only
> 'Bageshri' and 'Hamsanandi'; that was removed when admins gained the ability to
> create guest houses. Do not reintroduce it.

## Row-level security

RLS is enabled on all eight tables. The shape:

- `room_holds` are **readable by any authenticated user** — `/availability`
  shows every role which rooms are free — while writes follow
  `can_access_booking()` on the parent booking.

- `profiles` are readable by authenticated users; you may update your own.
- Booking visibility flows through `can_access_booking(b)`, a `security definer`
  helper: the owner, the IAR cell, the manager and the developer always; wardens
  only for students of their hostel; advisors only for their club.
- `booking_logs` are insertable by the acting user and readable with their
  booking.
- `form_configs` are readable by any authenticated user (the form needs them) and
  writable only by `developer`.
- A `developer` full-access policy exists on every table.

**Important honesty note:** the server currently connects with the
**service-role key** when it is present (`lib/supabase/client.ts`), which
*bypasses RLS entirely*. Today the real enforcement is the app-level check in
each server action. RLS is defense-in-depth for when the app moves to real
per-user Supabase Auth sessions — at which point the anon key plus RLS becomes
the primary boundary. Do not treat the policies as currently load-bearing, and do
not remove them either.

## What the archive search reads

`/history` adds no tables and no columns. It reads what is already there:

- `bookings` + `booking_guests` + `rooms` for the searchable text;
- **`booking_logs.action_by`** to answer "which requests did *I* decide?" — the
  submission entry (`previous_status is null`) is excluded, because submitting a
  booking is not reviewing it;
- `booking_logs.action_by_name` and `remarks` are searchable too, so a keyword
  finds a booking by what the approver wrote at the time.

Because `action_by` is `on delete set null`, a departed reviewer's rows drop out
of *their* personal log but stay in the archive with `action_by_name` intact.
That is the intended trade-off from the denormalisation decision.

**If this ever needs to run under real per-user sessions and RLS:** archive
search is a plain read of `bookings` and would flow through the existing
`can_access_booking(b)` helper, which already encodes the same warden/advisor
scoping that `historyScope()` applies in the app. No new policy is needed, but
verify the two agree before switching off the service-role key.

## What the availability grid reads

`listRoomOccupancy` selects from **`room_holds`**, inner-joined to `rooms` (to
filter by guest house) and to `bookings` (for the reference, status and
requester name), with a `during && [from,to)` overlap. No status filter is
needed — a hold only exists while the room is actually held. It is fully
expressible in PostgREST, so unlike archive search nothing is refined in JS.

The requester's name is fetched and then **discarded in the server action** for
roles that may not see it. That is deliberate: the alternative is two queries
that can drift. If this ever moves to per-user sessions and RLS, note that the
grid is read by every role, so the existing `can_access_booking(b)` helper is
*too narrow* for it — availability needs a policy exposing occupancy without
booking detail, or it stays a service-role read behind the action's own check.

## `form_configs` shape changes

`form_configs.config` is jsonb, so new keys need no migration. Two were added
for the relationship dependency: `parent_relationships` and
`dependent_relationships`, both `string[]`. Rows saved before that are missing
the keys entirely; `sanitizeFormConfig` backfills them from the spec defaults on
read, so no data fix-up is required. See
[02-architecture.md](02-architecture.md) for the degradation rules.

## Storage

A **private** bucket named `documents` holds Aadhaar/ID scans and alumni cards.
Files are written under `guest-ids/` and `alumni-cards/`. The Supabase store
returns a long-lived signed URL after upload; the bucket is never public.

In mock mode the same files land in `public/uploads/` — convenient locally,
obviously not a production posture.

## Migrations

Migrations are stored in `supabase/migrations/` and should be applied sequentially.

Current migrations:
1. `00000000000001_init.sql` (baseline schema)
2. `00000000000002_booking_lifecycle.sql` (added `OCCUPIED`, `VACATED`, `CANCELLATION_REQUESTED`, `CANCELLATION_APPROVED`)
3. `00000000000003_room_holds_and_infants.sql` (`room_holds` + its exclusion
   constraint and `set_room_holds()`, backfill from `assigned_room_ids`, drops
   that column, adds `bookings.infants`)
4. `00000000000004_infant_guests.sql` (adds `booking_guests.is_infant`, drops
   `bookings.infants` — infants became guest rows so their name and age reach
   the register; only their ID is waived)
5. `00000000000005_app_settings.sql` (`app_settings` key/value table holding the
   developer console password hash)
6. `00000000000006_booking_meals.sql` (`bookings.meals` jsonb + a check that all
   three keys are present and boolean). Additive with a default, so existing
   bookings read as "no meals requested".

> **Migration 6 must be applied before a booking can be created against
> Supabase.** The insert names the column, so without it every submission
> fails. The mock store self-heals instead (`loadDb()` backfills `meals`).

> Migration 3 is **destructive**: it drops `bookings.assigned_room_ids` after
> backfilling. Its `on conflict do nothing` also swallows any pre-existing
> double-booking the old race had written, so run the orphan query in the file's
> comment afterwards to see whether anything was dropped.

When you change the schema you must update, in the same commit:

1. `supabase/migrations/00000000000001_init.sql` (or a new migration file),
2. `lib/supabase/database.types.ts`,
3. `lib/types.ts` domain shapes,
4. `lib/store/mock.ts` **and** `lib/store/supabase.ts`,
5. `supabase/seed.sql` and `lib/store/seed.ts` if demo data is affected.

## One-off repairs — `supabase/repairs/`

Not migrations, never applied automatically, each with a header explaining what
it is for and how to check it applies to your data.

- `2026-09-10-utc-parsed-bookings.sql` — shifts the bookings that were stored
  5h30m late by the pre-`lib/tz.ts` `toIso()` running on a UTC host, and
  rebuilds their `room_holds` through `set_room_holds()` (the dates and the
  holds must move together or the availability grid disagrees with the
  booking). Runs in one transaction, so a shift that would collide with another
  booking aborts the whole thing rather than half-applying.

## Resetting data

- Mock: delete `.local-db.json`. It is regenerated from `lib/store/seed.ts`.
- Supabase local: `supabase db reset`.
- Supabase hosted: re-run the migration and seed by hand (destructive — check
  first).
