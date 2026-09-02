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
| `booking_guests` | One row per guest: name, age, gender, relationship, id number, `id_document_url`. |
| `booking_logs` | Append-only audit trail of status changes. |
| `form_configs` | One row per requester role: `role` (PK), `config` jsonb, `updated_at`. |

### `bookings` columns worth knowing

- `booking_reference_id` — human-facing reference (e.g. `IITPKD-GH-2026-DM001`).
- `user_role` — the requester's role *at submission time*, snapshotted so later
  role changes do not rewrite history.
- `status` — see enum below.
- `assigned_room_ids uuid[]` — filled by `allocateRooms()`.
- `rejection_reason`, `alumni_id_url`.
- `custom_fields jsonb` — snapshot of admin-defined field answers, each with its
  `label` preserved so reviewers see the original question text.

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

RLS is enabled on all seven tables, with 19 policies. The shape:

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

When you change the schema you must update, in the same commit:

1. `supabase/migrations/00000000000001_init.sql` (or a new migration file),
2. `lib/supabase/database.types.ts`,
3. `lib/types.ts` domain shapes,
4. `lib/store/mock.ts` **and** `lib/store/supabase.ts`,
5. `supabase/seed.sql` and `lib/store/seed.ts` if demo data is affected.

## Resetting data

- Mock: delete `.local-db.json`. It is regenerated from `lib/store/seed.ts`.
- Supabase local: `supabase db reset`.
- Supabase hosted: re-run the migration and seed by hand (destructive — check
  first).
