# Database

Schema lives in `supabase/migrations/00000000000001_init.sql`; demo data in
`supabase/seed.sql`. Generated TypeScript types are hand-maintained in
`lib/supabase/database.types.ts`.

## Tables

| Table | Purpose |
| --- | --- |
| `profiles` | One row per user. `id` references `auth.users`. Holds `email`, `full_name`, `role`, `hostel_name`, `department_or_club`, `roll_number`, and `ldap_uid` (migration 12: the LDAP username sign-in matches, unique on `lower(ldap_uid)`, null = no LDAP sign-in). |
| `guest_houses` | `name` (free-form, unique), `total_rooms` (recounted from active rooms) and `serves_meals` (migration 8 — whether the booking form offers meals there; Hamsanandi on by default). |
| `rooms` | `guest_house_id`, `room_number`, `room_type`, `is_active`. Unique per (guest house, room number). |
| `bookings` | The core record — see below. |
| `booking_rooms` | (Migration 11) One row per room card on the form. Guests are entered inside a card because the occupancy limit is per room. |
| `booking_guests` | One row per guest: name, age, gender, relationship, id number, `id_document_url`, `booking_room_id`, `citizenship`, `nationality`, `passport_number`, `is_infant`. |
| `booking_logs` | Append-only audit trail of status changes. |
| `form_configs` | One row per requester role: `role` (PK), `config` jsonb, `updated_at`. |
| `room_holds` | Which room each booking occupies, and when. See below — this is the interesting one. |
| `app_settings` | Runtime key/value. Currently one key: the developer console password hash. **Service-role only — no `authenticated` policy**, because a developer policy would expose the hash to anyone who can set their own role. |
| `email_outbox` | The notification queue (migration 10). One row per message: recipients, rendered HTML and text, status, attempts, backoff. **Service-role only, like `app_settings`** — the rendered bodies quote guest names, purposes of visit and rejection reasons, which makes this table more sensitive than the bookings it describes. |

### `bookings` columns worth knowing

- `booking_reference_id` — human-facing reference (e.g. `IITPKD-GH-2026-DM001`).
- `user_role` — the requester's role *at submission time*, snapshotted so later
  role changes do not rewrite history.
- `status` — see enum below.
- `service_type` (migration 11) — `room`, `room_meals`, or `meals_only`. Determines if rooms are requested.
- `meal_preference` (migration 11) — `veg` or `non_veg`, or null if no meals requested.
- `meal_guest_count` (migration 11) — number of guests for `meals_only` bookings.
- `pets_policy_acknowledged` (migration 11) — true if the requester acknowledged the no pets policy.
- `has_foreign_national` (migration 11) — derived from guests' citizenship, used for quick filtering.
- `created_by`, `on_behalf_of_name`, `on_behalf_of_email`, `on_behalf_of_phone` (migration 11) — for bookings created by a manager on behalf of someone else.
- `rejection_reason`, `alumni_id_url`.
- `custom_fields jsonb` — snapshot of admin-defined field answers, each with its
  `label` preserved so reviewers see the original question text.
- `meals jsonb` — the per-day meal plan since migration 8:
  `[{"date":"YYYY-MM-DD","breakfast":bool,"lunch":bool,"dinner":bool}]`, only
  days with a meal, in date order, default `[]`. A `check` constraint built on
  `jsonb_path_exists` refuses anything else (an object, a missing key, a
  non-boolean, a date not shaped `yyyy-mm-dd`). Migration 6 created it as one
  `{breakfast, lunch, dinner}` object for the whole stay; migration 8 converted
  those rows day by day with the serving windows from `lib/meals.ts`.
- `has_infant boolean` (migration 7) — whether any infants accompany the party.
  One flag however many. From migration 11, infants also have `booking_guests` rows with `is_infant` set (derived from age < 5).

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
                warden, faculty_advisor, iar_cell, gh_manager, developer,
                iar_student_cell, gh_caretaker
booking_status: PENDING_WARDEN, PENDING_FA, PENDING_IAR, PENDING_GH_MANAGER,
                APPROVED, OCCUPIED, VACATED, REJECTED, CANCELLED,
                CANCELLATION_REQUESTED, CANCELLATION_APPROVED
room_type:      single, double_sharing
booking_type:   official, personal, alumni
citizenship:    indian, other
service_type:   room, room_meals, meals_only
meal_preference: veg, non_veg
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

## `booking_meals` view (Migration 11)

Part of the same request as `bookings.meals`: the kitchen wants "what is being served on the 18th", which the per-booking jsonb cannot answer efficiently.
It is deliberately a **view, not a table**. `bookings.meals` is the single source of truth; a copy would risk drift. The view gives the relational shape — one row per (booking, date, meal). It is created with `security_invoker = true` so the view obeys the caller's row-level security on `bookings`.

## `email_outbox` — the notification queue

Added by migration 10 (16 Sep 2026). Additive and defaulted; nothing existing
reads it, so it is safe to apply at any time and safe to re-run.

**Why a table rather than sending in the action.** Sending inline would make
the requester wait for SMTP, would raise the question of whether a failed send
fails a booking, and on a serverless host would silently lose any un-awaited
send. It also gives you the thing you want at 11pm during a pilot: a table you
can query to answer *"did the warden actually get told?"*.

Two pieces do the real work:

- **`idempotency_key text not null unique`.** `enqueueEmails` inserts with
  `on conflict do nothing`, so a retried server action — or two dispatchers
  racing — cannot mail the same parent twice. The key carries the booking's
  `updated_at` for a transition and the institute calendar date for a digest,
  which is also what makes the cron schedule advisory rather than exact.
- **`claim_queued_emails(p_limit int, p_stale_after interval)`.** Selects due
  rows `for update skip locked` and flips them to `SENDING` in one statement.
  Doing this as select-then-update over PostgREST would be exactly the
  check-then-act race that `room_holds` exists to avoid. Rows stuck in
  `SENDING` longer than `p_stale_after` are reclaimed, so a worker that dies
  mid-send does not strand them.

`booking_id` is `on delete set null`, not `cascade`: the mail really was sent,
so the record of it must outlive a booking a developer later hard-deletes. The
mock store emulates this in `deleteBooking`.

Statuses are `QUEUED | SENDING | SENT | FAILED` (`email_status` enum). A retry
is **`QUEUED` with `scheduled_for` pushed forward**, not `FAILED`; only giving
up after five attempts is `FAILED`. `event_key` is plain `text`, not an enum,
so adding a notification kind needs no migration — the union in
`lib/mail/types.ts` is where it is constrained.

Verified in a throwaway `postgres:16-alpine` alongside migrations 1–9: the
unique key, the claim's exclusivity, stale reclaim, the `scheduled_for` gate,
the row limit, the `updated_at` trigger, the `set null` FK, and that re-running
the migration keeps existing rows.

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
7. `00000000000007_booking_infant_flag.sql` (`bookings.has_infant`, set wherever
   a legacy infant guest row exists; keeps `booking_guests.is_infant` for those
   rows and comments it as legacy). Additive.
8. `00000000000008_meal_plans.sql` (`guest_houses.serves_meals`, set for
   Hamsanandi; converts every `bookings.meals` object into the per-day array —
   each old meal kept only on days its serving window falls inside the stay —
   changes the column default to `[]` and replaces migration 6's shape check).
   Converts data, but nothing is lost: an old answer becomes the plan it
   implied. Safe to re-run.
10. `00000000000010_email_outbox.sql` (`email_outbox` + `email_status` enum +
   `claim_queued_emails()`). Additive, defaulted and safe to re-run. **Until it
   is applied, queueing throws** — every `notify*()` in `lib/mail/notify.ts`
   catches it and logs, so bookings and approvals still work and only the mail
   is missing. `/api/mail/dispatch` and `/api/mail/cron` return a 500 naming
   this file.
11. `00000000000011_rooms_guests_and_services.sql` (Sep 2026). Room-scoped guests (`booking_rooms`), citizenship, meals-only service types, and `booking_meals` view. Existing bookings are migrated into a single synthetic legacy room. Safe to re-run.
12. `00000000000012_profile_ldap_uid.sql` (`profiles.ldap_uid` + unique index
   on `lower(ldap_uid)`). Additive, nullable, safe to re-run. **Not backfilled
   from email on purpose** — a guessed identity mapping signs one person in as
   another; the office loads real usernames by console import or SQL
   ([11-ldap-accounts.md](11-ldap-accounts.md) §3). **Until it is applied, LDAP
   sign-in finds nobody on Supabase and saving a user in the console fails**
   (the update names the column). `supabase/seed.sql` sets the demo personas'
   usernames with an idempotent `update`, so re-run it afterwards. Verified in a
   throwaway `postgres:16-alpine`: re-runnable, `PRIYA` refused beside `priya`.
   The mock store self-heals the same way (seeded personas get theirs back by
   email; everyone else `null`).

> **Migrations 6, 7 and 8 must be applied before bookings can be created against
> Supabase.** The insert names `meals` and `has_infant`, and until migration 8
> runs, migration 6's constraint refuses a per-day plan. The mock store
> self-heals instead (`loadDb()` expands `meals`, derives `has_infant` from
> infant guest rows, and sets `serves_meals` for Hamsanandi).

> **Migrations 7 and 8 were tested before being committed**, in a throwaway
> `postgres:16-alpine` container: migrations 1–6 on stand-ins for Supabase's
> `auth` / `storage` schemas and roles, old-shape bookings inserted, 7 and 8
> applied twice with the session zone set to New York, and every converted row
> compared with what `normalizeMeals` produces for the same stay. The recipe is
> in [05-deployment.md](05-deployment.md#verifying-changes).

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


## Migration 9 — booking types and two new roles (16 Sep 2026)

`supabase/migrations/00000000000009_booking_types_and_roles.sql`.

Adds two `user_role` enum values (`iar_student_cell`, `gh_caretaker`), a new
`booking_type` enum (`official` | `personal` | `alumni`), and three columns on
`bookings`: `booking_type` (not null, default `official`), `alumni_name`,
`alumni_roll_number`.

Why columns and not a new role: *why* a stay is booked is a property of the
request, not the person. The same staff member books officially for a visiting
collaborator one week and privately for family the next, and the two are
approved and settled differently.

- **Backfill** derives `booking_type` from `user_role` — student → `personal`,
  alumni → `alumni`, everything else → `official`. Guarded with
  `where booking_type = 'official' and user_role in ('student','alumni')`, so
  re-running cannot overwrite a real answer.
- **`bookings_alumni_details`** check: the two alumni columns may only be
  non-null when `booking_type = 'alumni'`, so a stale value cannot sit on a
  booking whose form never collected it.
- `alter type ... add value` is transactional since PG12 but the new value
  cannot be *used* in the same transaction. Nothing in this migration writes
  the new role values, so it is safe as one file; a later migration that
  inserts rows with them needs its own.
- **The `alumni` role is kept.** Alumni have no institute login any more, but
  bookings made before this still carry the role. It is out of
  `REQUESTER_ROLES` and into `ARCHIVED_REQUESTER_ROLES`; `BOOKING_CATEGORY_ROLES`
  is the union the history filter and reports read, so old rows stay findable.
- Both stores degrade gracefully before the migration is applied:
  `SupabaseStore.hydrate` derives `booking_type` the same way the SQL does, and
  the mock store's `loadDb` self-heals old `.local-db.json` files identically.
