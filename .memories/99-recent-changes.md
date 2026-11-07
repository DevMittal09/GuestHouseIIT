# Recent changes - the last round, and only the last round

This file is **replaced** every round, not appended to. The round before this
one is written up where every round is: what was asked in
[01-background.md](01-background.md), why it was done that way in
[02-decisions.md](02-decisions.md).

---

## Round of 7 November 2026 (second) - an audit of the booking path on PostgreSQL

The owner: *"the guesthouse booking logic is not working now. It shows
please fix the highlighted error etc. Can you audit the whole code and let
me know what is the issue"*.

The whole journey was reproduced rather than read: a read-only script ran
what `/book` computes for every requester account in the owner's database
and validated a correctly filled form exactly as the browser does; then the
real server actions (`createBooking`, `reviewBooking`, `allocateRooms`,
`cancelBooking`, `approveCancellation`) were driven against a **throwaway
database on the same server** (`gh_audit_scratch`, built from
`scripts/init-postgres.sql` and `npm run seed:personas`, dropped afterwards).
Three defects, all PostgreSQL-only, which is why 648 unit tests on the mock
store saw none of them.

### 1. The reported error - a stored form config with no role

All five `form_configs` rows in the owner's database (`student`,
`employee`, `official`, `faculty_advisor`, `gh_manager`, all dated
1 Nov 2026) are **not form configurations**: `{max_rooms,
allowed_guest_houses, require_relationship}`, no `role`. Nothing in the repo
writes that shape; it came from outside it. The "saved row wins" rule took
it, `sanitizeFormConfig` (which since 4 Nov spreads the row over
`buildDefaultFormConfig(config.role)`) built defaults for role `undefined`,
and `bookingTypeError(undefined)` refused every student, employee and
office booking: **"Your role cannot submit booking requests" on
`booking_type`** - a question a student is never shown, so the toast said
"Please fix the highlighted fields" with nothing highlighted. Staff also got
the student's relationship dropdown and an ID document demand, and students
both guest houses.

- **`isStoredFormConfig(value, role)`** (`lib/form-config.ts`) - a saved row
  is used only if its `role` matches and it has the fields every Form
  Builder save has carried. `getEffectiveFormConfig` ignores anything else,
  with a `console.warn` naming the role. Pinned by
  `tests/stored-form-config.test.ts`, using the owner's rows verbatim.
- **The rows themselves were not deleted.** Pressing **Reset to spec
  defaults** in the Form Builder for each of the five roles removes them;
  until then they are ignored.

### 2. Nothing could be forwarded, rejected, cancelled or allocated

`assignRoomsToCards` (`lib/store/postgres.ts`) wrote
`CASE WHEN id = $1 THEN $2 ...` into `booking_rooms.assigned_room_id`
(uuid). PostgreSQL types a bare `THEN $n` as **text** and refused it
(42804). Every transition that releases rooms calls it with `[]`, so
**forwarding at every stage, rejecting, cancelling, the missed sweep and
allocation all failed**. Fixed with `::uuid` / `::uuid[]` casts.

### 3. No mail was ever queued

`enqueueEmails` bound `attachments` and `scheduled_for` as NULL whenever a
message had none - nearly always - and both are `not null` with a default.
An explicit NULL does not fall back to a default; it is refused (23502), and
`notify*()` swallows the error by design, so bookings succeeded and nobody
was told. Fixed with `coalesce(..., '[]'::jsonb)` and `coalesce(...,
now())`.

### Verified after the fixes

On the scratch database: eight submissions (three students, faculty, staff,
two offices, IAR) stored with the right first stage - the day scholar to the
desk, Saveri to its Assistant Warden, Tilang (Warden only) to its Warden,
faculty and staff to the HOD; each forwarded by the right person, allocated,
one cancelled with its room released; mail queued and dispatched (dry run)
at every step. Against the owner's database (read-only): every requester's
correctly filled form now validates.

`npm run lint`, `npm run typecheck`, `npm test` (**653 tests, 38 files**)
clean. **`npm run build` and `npm run test:e2e` were not run** - a dev
server was up on :3000 and a build would have killed it.

### Then: the guest house is not shown to a student

The owner: *"For students only the booking is allowed in Bageshri guest
house only. So in UI there is no need to select any guest house. This
entire thing should not be visible for students."* The Stay details card no
longer shows a student the Guest house field or the "Student bookings are
accommodated at Bageshri" note; `guestHouseHidden` in
`components/booking-form.tsx` leaves only the hidden input carrying the id,
and `createBooking` still enforces Bageshri. Other one-guest-house roles
(the IAR Student Cell, an alumni booking) still see the name stated.
**Not seen in a browser** - the dev server has no `DEV_LOGIN`, and signing
in would have written a session to the owner's database.

### Then: a test suite on PostgreSQL, and the fault it found

The owner: *"Do the testing on real postgress db"* - and chose a **fresh
test database** on their own server over their `guesthousedb`.

- **`npm run test:pg`** - `vitest.pg.config.ts`, `tests-pg/` (3 files, **39
  checks**). Every run drops and rebuilds `gh_test` from
  `scripts/init-postgres.sql`, adds two guest houses with rooms and rates,
  and seeds the personas with `scripts/seed-personas.mjs`. It refuses a
  database whose name lacks "test". Only the request is mocked
  (`tests-pg/setup.ts`); the schema, rules, store and SQL are real. A CI
  job runs it against a `postgres:16-alpine` service.
- **It caught a fourth fault: a stay booked for earlier today could never be
  allocated.** `earliestBookableCheckIn` accepts a check-in from midnight
  this morning, but `lapseDeadline` was the check-in instant, so such a
  booking was "never decided and its check-in has passed" the moment it was
  made - and a 12:00 request the manager reached at 12:30 was refused the
  same way. The dining version was fixed on 1 Oct; stays were not. A stay
  now lapses at **the end of its check-in day, institute time, or its
  check-out if sooner** (`lib/workflow.ts`), with two unit tests in
  `tests/missed-requests.test.ts`.
- **Each fix was undone in turn and the suite failed every time**: the uuid
  cast (19 failures), the outbox coalesce (2), the form-config guard (1),
  the lapse rule (5).
- `guesthousedb` was checked afterwards: 0 bookings, 0 mails, 29 accounts.

### Then: no error without a place on screen

The owner: *"I don't want any case where an error belongs to a question that
isn't on screen."* Besides the hidden `booking_type` already found, two more
such cases were live: the meal error's only slot is inside the Meals card
**after "Yes"**, so a meal refusal for anyone else (a student, a house with
no kitchen) had nowhere to appear; and a server refusal was only a toast,
gone after a few seconds.

- **An error summary at the top of the booking form**, GOV.UK fashion
  (`components/error-summary.tsx`). Every problem found on submit - each
  zod issue, the room count, meals, every missing ID upload by guest, the
  alumni card, custom fields, **and the server's refusal** - is listed. Each
  links to its question if that question is **on screen when the form is
  checked** (`problemSelectors` in `lib/form-problems.ts`; a hidden input or
  an element with no box does not count); one that is not is still listed
  in words. It takes focus and scrolls into view. Inline messages are
  unchanged.
- The toast is the message itself, or "N things need fixing"; **"Please fix
  the highlighted fields" is gone**.
- A plain `div`, so `.numbered-sections` does not count it as a step. The
  form element comes from the submit event, not a ref - the React Compiler
  lint refuses a ref read in a callback built during render.
- `tests/form-problems.test.ts` (6 checks) and `e2e/error-summary.spec.ts`
  (2 journeys, **not yet run**: they need a build, and the dev server was
  up).

### Then: the database still had the old status names

The owner's log: `invalid input value for enum booking_status:
"PENDING_WARDEN"`. `guesthousedb` was built from `init-postgres.sql` before
its labels were fixed and still had `PENDING_WARDEN_REVIEW`,
`PENDING_FA_REVIEW` and `PENDING_IAR_REVIEW`, so every warden- or
IAR-routed request was refused at insert. The owner: *"update init.sql
too"*. The enum is now a guarded `do` block in `scripts/init-postgres.sql`
(create if missing, rename the old labels in place, add later values `if
not exists`), tested on an old-shaped and a fresh database, **and applied
to `guesthousedb`** (its one booking kept). `npm run test:pg` 39/39.

### What is left open

[03-roadmap.md](03-roadmap.md) §2p: the five foreign `form_configs` rows and
five `app_settings` rows on the owner's database, what `test:pg` does not
cover yet, and running `e2e/error-summary.spec.ts`. `npm run build` **clean** (run at the owner's request, 7 Nov 2026). `npm run test:e2e`
(including `e2e/error-summary.spec.ts`) not yet run.
