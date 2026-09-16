# Background

## The problem

IIT Palakkad runs two guest houses, **Bageshri** and **Hamsanandi**, used by very
different groups: parents visiting students, collaborators visiting faculty,
artists and speakers invited by student clubs, returning alumni, and official
dignitaries such as inspection committees.

Before this system, requests arrived through email and paper forms. That created
four recurring problems:

1. **No consistent approval trail.** A student's request needed their hostel
   warden's sign-off, a club's request needed its faculty advisor's — but there
   was no single place showing who had approved what, or when.
2. **Room clashes.** Allocation was tracked manually, so two guests could be
   promised the same room for overlapping dates.
3. **Different rules per requester, enforced by memory.** Students may only use
   Bageshri; alumni must present an alumni ID card; officials need to bypass
   intermediate review entirely. These rules lived in people's heads.
4. **No verification record.** ID documents arrived as email attachments with no
   structured link to the booking they belonged to.

## Who uses it

**Requesters** (submit bookings):

| Role | Notes |
| --- | --- |
| Student | Bageshri only; request routes to their own hostel warden |
| Employee (faculty/staff) | Both guest houses; goes straight to the manager. The one role asked **official or personal** at the top of the form |
| Club / fest council | Both; routes to the club's faculty advisor. Official only — not asked |
| IAR Student Cell | Books for its own office or **on behalf of an alumnus**; routes to the IAR Office |
| IAR Office | Approves the Student Cell's requests, and books itself — its own requests go straight to the manager, since it is the approver |
| Official / dignitary | Both; highest priority, bypasses intermediate review. Official only — not asked |
| ~~Alumni~~ | **Retired 16 Sep 2026.** Alumni have no institute login, so they cannot sign in; the two IAR accounts book for them. The role survives only on bookings already in the archive |

**Reviewers and administrators:**

| Role | Sees |
| --- | --- |
| Hostel warden | Only students of *their* hostel |
| Faculty advisor | Only *their* club or council |
| IAR Office | Requests from the IAR Student Cell, with the uploaded alumni ID card. Also books itself |
| Guest house manager | Every pre-approved request; assigns actual rooms |
| Guest house caretaker | Reception desk: today's checkouts, current occupants, upcoming stays, and marking guests in and out. **No allocation or approvals** |
| Developer (superadmin) | Everything, plus configuration of the system itself |

## Where the requirements came from

The functional spec was supplied by the Administration Section: the five
requester categories, the approval chain for each, the field lists per category,
and the "cinema-style" seat-picker metaphor for room allocation. Two details were
called out explicitly and are easy to lose in a refactor:

- students see the banner **"Double shared rooms will get first preference"**;
- official visits are **restricted to whitelisted institute email addresses** and
  should surface at the top of the manager's queue.

## Follow-up requirements from the Administration Section

A second list of five changes was handed over after the first build. Status as
of **10 Sep 2026**:

| # | Requirement | Status | Where |
| --- | --- | --- | --- |
| 1 | Parents may stay freely; siblings and grandparents only when a father or mother is also staying | **Done** | `parent_relationships` / `dependent_relationships` on `RoleFormConfig`, enforced by `parentDependencyError()` — see [03-implementation.md](03-implementation.md) |
| 2 | Room availability grid for all users, showing room details, booking periods and vacant/occupied status | **Done** | `/availability` + `lib/availability.ts` + `app/actions/availability.ts` |
| 3 | Day-wise guest house log / occupancy report, emailed automatically to the Guest House Manager | **Not built** | No mail transport exists in the project at all. The manual counterpart — `exportHistoryPdf` + `lib/report-pdf.ts` — is in place, so the report *content* is solved and only scheduling + delivery are missing. See [08-roadmap.md](08-roadmap.md) §2 |
| 4 | Bookings only within a one-month advance window | **Done** | `latestCheckIn()` / `isAdvanceWindowExempt()` in `lib/workflow.ts`, applied by `bookingPayloadSchema` on client and server |
| 5 | Automatic email notification to stakeholders after room allocation | **Not built** | Same gap as #3 — `allocateRooms()` is the hook point |

> **The two open items are one piece of work, not two.** Both need a mail
> transport (SMTP relay or a transactional provider) plus a place to run
> scheduled jobs. Nothing else in the codebase blocks them: `allocateRooms()`
> and `updateBookingStatus()` are already the single funnels every transition
> passes through.

## Meeting notes — 15 Sep 2026

A third round came out of a meeting with the guest house office
(`Guest House Meeting Notes.md` in the repo root, untracked). Part of it was
picked up the same day; everything else in the notes is not started.

| Requirement | Status | Where |
| --- | --- | --- |
| Room availability per week and per month, not only per day | **Done** | Day / Week / Month switch on `/availability` — `availabilityRange` + `bucketOccupancyByDay` in `lib/availability.ts`, `RangeOccupancyChart` in `components/occupancy-chart.tsx` |
| The availability grid's red legend "Booked / occupied" should read "Booked" | **Done** | `components/availability-grid.tsx` — legend, badge and counts all say booked |
| Formal wording for "sleeps 2, 3 with an extra bed" in the manager's Review & Allocate dialog | **Done** | Kept and rewritten, not removed — the extra-bed count is operational. `describeCapacity()` in `lib/occupancy.ts`; labelled summary in `components/room-grid.tsx`. Also fixed extra beds being under-counted for single rooms (`extraBedsFor`) |
| One "infant accompanying" toggle instead of per-guest infant rows | **Done** | `bookings.has_infant` (migration 7); "Infant accompanying" switch beside "+ Add guest" in `components/booking-form.tsx`. Legacy infant guest rows are kept and still read correctly |
| Meals chosen per day in a grid, not one selection for the whole stay | **Done** | Days × meals table in `components/meal-plan-grid.tsx`; `bookings.meals` is a per-day `MealPlan` (migration 8, which also converted old answers). A day offers only meals served during the stay (`stayMealDays`). Not ticked by default — that part of the notes was not in this round's request |
| Meals only at Hamsanandi | **Done** | `guest_houses.serves_meals` (migration 8), on for Hamsanandi, toggled in the developer console — a flag, not a name check. Enforced in `createBooking` |
| Everything else in the notes | Picked up 16 Sep or still open — see the next section | |

## Meeting notes — second pass, 16 Sep 2026

The remainder of the same meeting notes. Status as of **16 Sep 2026**:

| Requirement | Status | Where |
| --- | --- | --- |
| Make the room availability view dynamic in "new booking" — see rooms booked earlier or later than the intended date | **Done** | `components/booking-availability.tsx` now has Day/Week/Month and date navigation, opening on the check-in date. Browsing is transient: `browsed` is tagged with the check-in it was chosen against, so a new check-in snaps the chart back. A banner states that browsing does not change the booking |
| In GHM login, room availability/booking is not being reflected in the grid | **Done** | `/manager` computes an `occupancyVersion` fingerprint of every room hold and passes it to `RoomGrid`, which folds it into its fetch key. The grid loaded occupancy once when its dialog opened, so it never learnt that another allocation had landed underneath it |
| In the GHM console, a card for today's upcoming checkouts | **Done** | `components/checkouts-today.tsx`, on both the manager and caretaker consoles. Sorted earliest first, overdue rows flagged, Mark as Vacated inline |
| Future bookings should not be marked as occupied | **Done** | Three defences: `occupancyNotStartedError()` already refused the write; the **developer force-status override** (the remaining way in) now runs the same check; and `displayStatus()` / `describeSegmentStatus()` refuse to *render* a not-yet-started stay as Occupied, so rows already forced early stop lying to reception |
| GH Caretaker role — a subset of the GHM console: current occupants, upcoming stays, mark occupied/vacated | **Done** | `gh_caretaker`, `/caretaker`, `components/caretaker-console.tsx`. Reuses the manager's own `stays-table.tsx` / `checkouts-today.tsx` so the two cannot drift; `canUpdateLifecycle()` gates the shared action server-side |
| Faculty and staff: official (default) or personal at the start of New Booking; clubs and offices official-only with no toggle | **Done** | `bookings.booking_type` (migration 9) + `bookingTypesFor()` in `lib/booking-types.ts`. A role with one option is never shown the question, but the value is still recorded |
| Remove alumni login; IAR cell books for them (office or on behalf of an alumnus), with alumni student ID and ID card as PDF/image | **Done** | Alumni persona and login removed; `iar_cell` (IAR Office) and a new `iar_student_cell` both book with an office/alumni choice. Alumni bookings carry `alumni_name`, `alumni_roll_number` and the ID card (JPG/PNG/WEBP/PDF, 5 MB) |
| IAR student cell's requests go to the IAR office for approval | **Done** | `initialStatusFor()`: `iar_student_cell` → `PENDING_IAR` → manager; `iar_cell` → manager directly, because routing it to its own queue would be self-approval. `canReview()` also refuses `reviewer.id === requester.id` |
| Warning messages for dangerous tasks like deleting a guest house | **Done** | `components/ui/confirm-dialog.tsx` replaced every `window.confirm`: it lists what will be lost and makes the operator type the guest house name, user email or booking reference |
| Invoices with payment account details; invoice at checkout for GHM and caretaker; official invoices routed to accounts | Not started | Needs a billing model and a PDF template; `lib/report-pdf.ts` is the nearest existing machinery |
| ±4 hour buffer on bookings | Not started | Would change the overlap rule, so it touches `room_holds.during` and every occupancy query at once |
| HOD approval for a faculty member's booking; debitable heads (dept / project / personal fund) | Not started | The routing hook is `initialStatusFor()`, which takes only the role today — its doc comment marks where the booking type becomes an argument |
| Dining/lunch booking at the guest house with debitable heads | Not started | Distinct from the per-day meal plan, which is about head counts, not billing |
| Email in a single thread rather than standalone messages | Not started | Still blocked on there being no mail transport at all — see [08-roadmap.md](08-roadmap.md) §2 |
| Documentation for every booking workflow | Not started | |

## Scope decisions made during the build

- **The developer console was added beyond the original spec.** The spec fixed
  the forms and the two guest houses in code. In practice the Administration
  Section will need to add a guest house, change who is a warden, or make a field
  optional without a developer. That drove the configurable form system and the
  admin console, which are now the most distinctive parts of the project.
- **Authentication was deliberately deferred.** See
  [06-decisions.md](06-decisions.md) — the app uses a mock persona picker with a
  single, well-marked swap point so institute SSO can be dropped in later.
- **Notifications are not built.** Email/SMS on status change is the most
  obvious next feature; see [08-roadmap.md](08-roadmap.md).

## Status

Feature-complete for the specified workflows and running against a hosted
Supabase project. **Not yet deployed** and **not yet using real authentication** —
those are the two gates before production use.
