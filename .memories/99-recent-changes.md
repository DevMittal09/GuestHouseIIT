# Recent changes - the last round, and only the last round

This file is **replaced** every round, not appended to. The round before this
one is written up where every round is: what was asked in
[01-background.md](01-background.md), why it was done that way in
[02-decisions.md](02-decisions.md).

---

## Round of 9 November 2026 (third) - the consolidated meeting decisions

The owner sent the two sets of notes from the Guest House Portal meeting as
one consolidated list - user classifications, room inventory and VIP rooms,
booking and cancellation rules, who decides the tariff, the booking page's
sidebar, and availability - with the instruction to verify the current
implementation rather than assume, and to **report conflicts rather than
silently resolve them**.

> **This round ran across two sessions and shares its working tree with the
> mail round** of the same day ([01-background.md](01-background.md),
> *9 November 2026 (second)*): `MAIL_ALLOWED_RECIPIENTS`, and three demo
> accounts repointed at real inboxes. That arrangement is **temporary and
> nothing here reverts it** - how to, and why it must be reverted in three
> places together, is [05-credentials-and-security.md](05-credentials-and-security.md)
> Part 1 and [03-roadmap.md](03-roadmap.md) §2s. The two rounds overlap in
> `lib/store/{mock,postgres,seed}.ts`, `scripts/seed-personas.mjs`,
> `app/actions/admin.ts`, `lib/mail/types.ts`, `tests-pg/harness.ts` and
> `e2e/helpers.ts`.

### What the meeting changed, and what it only confirmed

**Already true, verified and left alone.** A student whose `hostel_name` is
NULL already went straight to the desk (17 Oct 2026, `approverNotApplicable`);
the fourteen-night cap, the desk's authority over dates and rooms, the
cancellation request/decision flow, and date-specific availability from
`room_holds` were all already as the meeting described. These were checked,
not rewritten.

**Three decisions reverse an earlier one**, and each is recorded as a
*Superseded* note in [02-decisions.md](02-decisions.md):

| Now | Was | Why the reversal is taken |
| --- | --- | --- |
| The **manager** picks the tariff category, and must, before rooms are allotted | The **requester** picked it on the form (17 Oct 2026) | A category is a kind of *guest*, not a kind of account. Only the desk knows whether the arrival is an external examiner or somebody's parent, and a requester choosing their category is a requester choosing their rate |
| **One month** of advance booking | **Six months** (14 Oct 2026, the office) | The meeting asked for the railway window outright. The cases six months was granted for are still met: official and dignitary bookings, the manager and the developer are exempt from the window entirely |
| The desk's queue is **first come, first served** | Official requests floated to the top | A queue that reorders itself by who is asking is not a queue. Officials keep their saffron edge, so nothing became harder to find |

**A fourth reverses a deliberate non-decision.** A named category stored on a
booking was considered and refused in [03-roadmap.md](03-roadmap.md) §2j,
because it would be a second source of truth for money. It is not one now:
`tariffs` carries the same column, and `resolveTariff` ranks a named category
above every other qualifier, so the name on the booking and the rate sheet
meet in one function.

### The four room classes, which are three different restrictions

`rooms.room_class` (migration 36), the rule in `lib/rooms-access.ts`:

| Class | Who may be put in it |
| --- | --- |
| `general` | anybody - the ordinary inventory |
| `vip` | the addresses and roles the manager authorises in Portal Settings |
| `director_only` | **nobody through the portal**: only a booking the desk raises itself |
| `reserved` | nobody at all; the desk still sees the room |

**`vip` and `director_only` are deliberately not one class.** The meeting's own
warning was that the Director's rooms "should not accidentally become
available for ordinary online VIP bookings" - which they would have, if adding
an address to the authorised list had reached them. C1 and C2 are
`director_only`; an office that later wants a named guest in one moves that
room, which is a deliberate act on one room rather than a side effect.

**Hamsanandi is sixteen rooms again.** A1-A3 were simply *absent* from the
inventory (the office's list of 23 Sep 2026 gave it thirteen, "only A4 exists
in A"), which recorded the eleven-bookable arithmetic by leaving the reserved
rooms out - and so showed the manager thirteen rooms in a sixteen-room guest
house. They are created `reserved`. 16 - 3 reserved - 2 director-only = the
**eleven** the meeting named. **The live database was read first**: it holds
the old thirteen Hamsanandi labels and ten Bageshri labels, so this is purely
additive and **no room was renamed**.

### What a requester is now told about availability

Three rules, kept separate on purpose - the meeting asked for exactly that
("implemented as distinct rules rather than conflated into one hardcoded room
count"):

1. **which rooms count** - the room's class (`generalInventory`);
2. **how high the figure may read** - the cap, `rules.portal.general_visible_rooms`, default 14 (`visibleFreeRooms`);
3. **what is published at all** - a count, never a denominator.

So `AvailabilityCountsPanel` lost its `/total` and its proportional meter (a
bar a tenth full publishes the inventory as plainly as "1 of 10"), and
`/availability`'s header figures became the desk's. The word **Full** stays,
because it is the one thing the fraction was doing that a bare figure cannot.

### Changed

| Area | Files |
| --- | --- |
| **New rules** | `lib/rooms-access.ts` (room classes, VIP access, the cap), `lib/student-programme.ts` (the roll-number convention, the spouse rule), `lib/tariff-category.ts` (Category I/II/III and the sheet) |
| Shared names | `lib/types.ts` - `ROOM_CLASSES`, `TARIFF_CATEGORIES`, `Spouse` on the student relationship list, `Room.room_class`, `Booking.tariff_category` / `original_check_*` |
| Settings | `lib/settings.ts` - the new **`rules.portal`** group, `cancellation_notice_hours`, `advance_booking_months` back to 1 behind a **revision upgrade** (a saved row beats a changed default, which is why the group now has one) |
| Rules applied | `lib/policy.ts` (the 24-hour notice; official bookings exempt from the stay cap **by booking type**), `lib/operations.ts` (`shortenStayError`, `originalDatesPatch`), `lib/workflow.ts` (`inArrivalOrder`), `lib/access.ts` (the `portal` console section, `invoiceAuthorityError`), `lib/tariffs.ts` + `lib/invoice.ts` (the category outranks every qualifier, and is printed), `lib/academic/guest-names.ts` (the spouse rule rides the existing `withheld` seam), `lib/booking-schema.ts`, `lib/form-config.ts`, `lib/form-config-server.ts`, `lib/availability.ts` |
| Actions | `bookings.ts` (room access at allocation, the category required there, the cancellation notice), `manager.ts` (the category and the original dates, and the requester told), `operations.ts` (`shortenStayAction`), `invoices.ts` (the caretaker cannot draw up or issue an official bill), `availability.ts`, `settings.ts`, `admin.ts` (`setRoomClassAction`) |
| Mail | `lib/mail/{types,template-config,templates,notify}.ts` - **`booking.stay_shortened.requester`**, which names both periods because the whole point is that they differ |
| Console | **`/admin/portal`** + `components/admin/portal-settings-manager.tsx` (new), `admin/guest-houses-manager.tsx` (the class per room), `admin/settings-manager.tsx`, `admin/billing-manager.tsx` (a rate scoped to a category) |
| Booking page | `tariff-panel.tsx` **rewritten** - the office's table and the catering timings, and it asks nothing; `booking-form.tsx`, `booking-request-page.tsx`, `room-grid.tsx` (the category, and restricted rooms shown but unpickable), `manage-stay-dialog.tsx` (approve a shorter stay; correct the category), `manager-queue.tsx`, `review-queue.tsx`, `my-bookings.tsx`, `booking-details.tsx`, `availability-{counts,grid}.tsx`, `booking-availability.tsx` |
| Public site | `lib/site-content.ts` (**Dos and Don'ts**, and the notice period), `lib/site.ts` (`GUIDELINES_PDF_URL` retired), `app/(site)/guidelines/page.tsx` |
| Database | `scripts/migrations/00000000000036_room_classes_and_tariff_categories.sql` (**new**, and so is `scripts/migrations/`), `scripts/init-postgres.sql`, `scripts/seed-reference-data.sql`, `scripts/check-migrations.mjs`, `lib/store/{types,mock,postgres,seed}.ts` |
| Tests | `tests/meeting-decisions.test.ts` and `tests-pg/meeting-decisions.pg.test.ts` (**new**); `tests/{settings,public-site,twelfth-round,fourteenth-round}.test.ts` updated where this round superseded them; `tests-pg/*` |
| e2e harness | `playwright.config.ts` (the secret reaches the runner; `DATABASE_URL` **and** Google blanked), `lib/env.ts` (`ALLOW_MOCK_STORE` exempts Google), `e2e/{booking-journey,fifth-round,fourteenth-round,eighth-round}.spec.ts` (the category radio, the rates table), `e2e/sign-in.spec.ts` **rewritten** for the door the harness actually serves |
| Checks | `scripts/check-migrations.mjs` - the remediation line named `init-postgres.sql`, which builds a database from nothing; it now names `scripts/migrations/` for an existing one |
| Rules file | `AGENTS.md` |

### Checks

`npm run lint`, `npm run typecheck`, **689 tests in 41 files**,
`npm run test:pg` (**51 tests**, against a local throwaway `gh_test` - never
the shared host) and `npm run build` all clean. Migration 36 was applied to a
throwaway `postgres:16-alpine` from the previous schema, re-run to prove it
idempotent, and checked not to overwrite a room class edited afterwards.
`npm run check:migrations` confirms the shared database still holds **1-35**,
and names all eight of migration 36's elements as missing - which is the
state this round intends.

**The Playwright suite is not clean, and the reasons are all older than this
round.** It turned out to be **un-runnable** - the production server refused
to start without Google, and `signIn()` threw because `E2E_TEST_SECRET` was
in the server's environment and not the runner's - so nobody had run it for
several rounds and the specs had drifted. The harness is fixed (and now
blanks `DATABASE_URL` **and** Google, so it cannot reach the shared database
or the owner's real Google client). Of the 20 journeys that then failed:

- **one was this round's** - the room row moving out of the per-guest-house
  rates table, which `e2e/eighth-round.spec.ts` still asserted. Fixed, and
  verified passing. The specs that allocate rooms also gained the new
  category radio;
- **three were pre-existing and are fixed anyway**, because fixing the
  harness is what exposed them: `e2e/sign-in.spec.ts` asserted a Google
  button that only a machine with real credentials in `.env.local` ever had.
  Rewritten for the door the harness serves, and one was only a strict-mode
  locator matching Next's route announcer;
- **16 remain, none of them on this round's code**, each asserting something
  decided away on 7 Oct, 28 Oct or 7 Nov 2026.

Attributed by checking out `HEAD`, applying **only** the harness fixes, and
running the same specs: they fail there identically. The list, and the two
sign-in defects they uncovered, are [03-roadmap.md](03-roadmap.md) §2t.

**The build and the journeys were run in a copy of the tree**, not at the
repo root: a dev server was serving the owner on port 3000, and
`npm run build` pulls `.next/` out from under it. `node_modules` was
hard-linked (`cp -al`) rather than symlinked, because **Turbopack cannot
resolve `next` through a symlinked `node_modules`** and fails with "Could not
find the Next.js package".

**Migration 36 is written and tested but deliberately not applied to the
shared database** - that is a production change, and the order is
[04-production.md](04-production.md) §1a. Nothing was written to the shared
database this round.

### What this opens

[03-roadmap.md](03-roadmap.md), *Meeting follow-ups*: six things only the
office can settle, and none of them guessed at -

1. the **authoritative catering PDF**, which was never attached; the meeting's
   own timings are in force provisionally;
2. the **dates** of the A1-A3 faculty reservation - reserved indefinitely
   until released, because no three-year start was invented;
3. the **Google Drive guidelines URL**; the field is ready and the button
   stays hidden while it is empty;
4. whether the **14-room cap** is per guest house (as built) or across both;
5. the alternative labels "Hamsanandi A1-A4/D1-D4, Bageshri B1-B10", which
   have **no verified mapping** to the live inventory;
6. whether the **alumni** booking type is retired, the meeting having named
   Personal and Official only. The IAR workflow is preserved until somebody
   says otherwise.

There is also **no waiting-list automation**: a cancellation releases the
rooms for the desk to allot, which is what the 24-hour notice period exists to
make possible.
