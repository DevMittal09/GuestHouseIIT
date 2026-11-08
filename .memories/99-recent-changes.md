# Recent changes - the last round, and only the last round

This file is **replaced** every round, not appended to. The round before this
one is written up where every round is: what was asked in
[01-background.md](01-background.md), why it was done that way in
[02-decisions.md](02-decisions.md).

---

## Round of 8 November 2026 - the rates the move off Supabase left behind

The owner: *"we had switched from a hosted Supabase database to a local
postgres database. And after switching we havent populated it fully... just
get the data like prices, which we havent populated yet so that we can get
the website up and running. The data like users and all we have already
populated, only stuff like prices need to be updated"* - and, for the two
duplicate `NEXT_PUBLIC_SUPABASE_URL` lines in `.env.local`, *"just find out
which is correct and remove the other"*.

### 1. Which Supabase URL was the right one

`.env.local` carried two commented `NEXT_PUBLIC_SUPABASE_URL` lines:
`http://127.0.0.1:54321` and `https://azfdzrahtsikofzovmda.supabase.co`. The
question is answered by the keys beside them, not by preference: the `iss`
payload of both JWTs names **project ref `azfdzrahtsikofzovmda`**, so the
local URL belonged to no running instance and was removed. The hosted line
stays commented, with a note saying it is kept only to read the old data
from - the portal runs on `DATABASE_URL`.

### 2. The fault: no room rate had ever been seeded into PostgreSQL

`guesthouse_dev` held **nine meal rates and no room rate at all**. It was not
a half-finished copy; nothing in the repository had ever written one.

`scripts/init-postgres.sql` carried the office's tariff sheet, and resolved
the guest house of each room row with
`(select id from public.guest_houses where name = 'Bageshri')`. But that file
**builds the schema**, so at that point `guest_houses` is empty, all three
subselects were NULL, and the guard

```sql
where (s.item <> 'room' or s.gh is not null)
```

dropped every room row on the floor. The guest houses used to arrive
afterwards from `supabase/seed.sql` - which went with Supabase and **no
longer exists**, while init's closing comment still told the reader to run
it. Nothing errored; the room rates were simply never there.

What that cost: `resolveTariff` returns null for a room, so the booking
form's tariff panel reads **"no rates published"**, there is no category for
the requester to pick (and picking one is what writes `guest_house_id` and
`booking_type` since 17 Oct 2026), and **no invoice can be issued** -
`invoiceBlocker` refuses a charge no rate covers rather than printing a zero.

### 3. The rates, taken from the hosted project

Read over PostgREST with the service-role key in `.env.local`, **read-only**;
31 rows, three generations:

| Effective | What |
| --- | --- |
| 2024-01-01 | The sheet the portal was built with: meals per head (80 / 120 / 100), free to students and on alumni bookings, Bageshri 750, Hamsanandi 2,000, Hamsanandi 4,000 for an `official` requester |
| 2026-09-23 | Bageshri raised to 1,000 |
| **2026-11-05** | **The office's Category I / II / III sheet - what is charged today** |

The current sheet, per room per night:

| Category | Bageshri | Hamsanandi |
| --- | --- | --- |
| **I** - guests and relatives of employees, parents of students on a personal visit | ₹1,000 | ₹1,500 |
| **II** - institute guests on official duty (ministers, directors, BOG, selection committees, external examiners, official guests) | ₹1,500 | ₹2,000 |
| **III** - academic visitors (an `employee` on an official booking) | ₹2,000 | ₹2,500 |

Two details that matter and are easy to lose:

- **Category I is written twice per guest house** - once unscoped and once
  with `requester_role: official`. The second row exists only to outrank the
  ₹4,000 row of 2024-01-01, which has the same specificity (guest house +
  requester role) and would otherwise still win for that role. Delete it and
  an office's personal booking jumps to ₹4,000.
- **Eight rows dated 2026-12-01** in the hosted project are the same
  categories at the same rates - the office's first attempt, made when the
  console forced a future date, before they were re-entered from 5 Nov. They
  are harmless (equal specificity, later date, identical rate) and were
  copied into `guesthouse_dev` with everything else, but they are **not** in
  the seed file, which is why a fresh install has 14 room rates and
  `guesthouse_dev` has 22.

**Applied to `guesthouse_dev`:** 22 rows inserted, the 9 meal rows already
there skipped on their unique scope. Verified with the real
`resolveTariff` over every (guest house x booking type x requester role)
combination: every one now resolves, and the figures are the table above.

### 4. The repository, so it cannot happen again

- **`scripts/seed-reference-data.sql`** - new, and the **one home** for the
  office's guest houses, their rooms and the whole rate sheet. It creates the
  guest houses **before** the rates that point at them. Idempotent and
  additive: guest houses by their fixed ids, rooms only into a guest house
  that has none at all (so an inventory the office edited by hand is never
  touched), a rate only where none with the same scope and `effective_from`
  exists. `tariffs_guard` refuses an UPDATE or DELETE of a rate in force, so
  the file only ever inserts.
- **`scripts/seed-reference.mjs`** / **`npm run seed:reference`** - loads
  `.env.local` the way `seed-personas.mjs` does, prints a census before and
  after, and names the missing `extra_bed` rate.
- **The tariff block is gone from `scripts/init-postgres.sql`**, replaced by
  a comment explaining the trap, and its closing note now gives the real run
  order: `init-postgres.sql` -> `npm run seed:reference` ->
  `npm run seed:personas`.

Tested on a throwaway `gh_seed_scratch`: schema from nothing, then
`seed:reference` -> **2 guest houses, 23 rooms, 23 rates (14 room, 9 meal)**;
run again, nothing added. Then the seeded database and `guesthouse_dev` were
compared through `resolveTariff` over **630 combinations across three dates**
(10 Nov, 5 Dec, 1 Mar) - **0 differences**, which is what proves the seed
file reproduces the hosted project's pricing and that the eight duplicate
rows change nothing.

### 5. Then: the room inventory was not the office's

Found while checking what else the move had left behind, and fixed with the
owner's agreement. Neither database had the rooms of 23 Sep 2026:

| | Was in `guesthouse_dev` | Now |
| --- | --- | --- |
| Bageshri | `B1`-`B10`, the old dummy block | **201, 202, 203, 204, 206, 302, 303, 305, 306, 307** |
| Hamsanandi | `A1`, `A2`, `A3`, `A4`, `C1`, `C2`, `D1`-`D4` - **ten** | **A4, B1-B4, C1-C4, D1-D4** - **thirteen** |

Three real Hamsanandi rooms could not be booked at all. Bageshri's ten were
**renamed, not replaced** - `room_holds` and `booking_rooms` point at the row
id, so the three demo bookings kept their rooms and now show the real
numbers (B1 -> 201, B2 -> 202, B10 -> 307); 0 orphan holds afterwards.
`A1`-`A3` were held by nothing and were deleted. `rooms_recount_total`
(migration 33) moved `total_rooms` to 10 and 13 by itself.

### 6. What is deliberately still missing

**There is no `extra_bed` rate** - not here and not in the hosted project the
rates came from. The office has never sent the figure. A stay with an extra
bed therefore **cannot be invoiced**: `resolveTariff` returns null and
`invoiceBlocker` reports it rather than charging ₹0 by omission. It is an
office question, not a code one - [04-production.md](04-production.md) §3,
and `seed:reference` says so on every run.

### Verified

`npm run lint`, `npm run typecheck`, `npm test` (**661 tests, 39 files**) and
`npm run test:pg` (**39 checks**) all clean - the PostgreSQL suite matters
here because it loads `scripts/init-postgres.sql`, which this round edited.
`npm run build` and `npm run test:e2e` **were not run**: a build kills a
running `next dev`, and nothing in this round touches a component.

### What is left open

[03-roadmap.md](03-roadmap.md) §2q: the extra-bed rate, the eight duplicate
tariff rows, and the fact that the guest houses and rooms of a database are
still not checked by anything the way `npm run check:migrations` checks the
schema.
