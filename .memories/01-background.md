# Background

The problem, the people, and **every list of requirements the institute has
handed over, with what became of each** — the chronological record of what was
asked. The dated story of how it was built is
[02-timeline.md](02-timeline.md); the product as it now stands is
[10-roles-and-features.md](10-roles-and-features.md) and
[11-booking-forms.md](11-booking-forms.md).

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

**Requesters** (submit bookings) — *as first specified; the current rules per
role are in [10-roles-and-features.md](10-roles-and-features.md)*:

| Role | Notes |
| --- | --- |
| Student | Bageshri only; request routes to their own hostel warden |
| Employee (faculty/staff) | Both guest houses. Asked **official or personal** at the top of the form. Official → their **HOD** → manager (since Phase 4, 22 Sep 2026); personal → manager |
| Club / fest council | Both. Official only — not asked. **Since 24 Sep 2026 raised by its Faculty Advisor** (a professor named on the council in the console), straight to the manager |
| IAR Student Cell | Books **on behalf of an alumnus** only (its "Official" option was withdrawn); routes to the IAR Office |
| IAR Office | Approves the Student Cell's requests, and books itself — its own requests go straight to the manager, since it is the approver |
| Official / dignitary | Both; highest priority; must be on the official whitelist. Official only — not asked. Chooses **Direct** or **Requires HOD approval** per booking (Phase 4) |
| ~~Alumni~~ | **Retired 16 Sep 2026.** Alumni have no institute login, so they cannot sign in; the two IAR accounts book for them. The role survives only on bookings already in the archive |

**Reviewers and administrators:**

| Role | Sees |
| --- | --- |
| Hostel warden | Only students of *their* hostel |
| Faculty advisor | Only *their* club or council. **Since 24 Sep 2026 a professor named on the council in the console, who books for it rather than reviewing** — the council secretary reviews only club requests stored before then |
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
| 1 | Parents may stay freely; siblings and grandparents only when a father or mother is also staying | **Done** | `parent_relationships` / `dependent_relationships` on `RoleFormConfig`, enforced by `parentDependencyError()` — see [21-implementation.md](21-implementation.md). Joined 23 Sep 2026 by `unique_relationships` / `duplicateRelationshipError()`: a student has one mother, so a singular relationship may appear only once |
| 2 | Room availability grid for all users, showing room details, booking periods and vacant/occupied status | **Done** | `/availability` + `lib/availability.ts` + `app/actions/availability.ts` |
| 3 | Day-wise guest house log / occupancy report, emailed automatically to the Guest House Manager | **Done** | `queueDailyDeskReports()` in `lib/mail/digest.ts`, driven by `/api/mail/cron`. One report per guest house per day to the manager *and* the caretaker: arrivals, departures, who is in house, stays past check-out still holding rooms, and what awaits allocation. Rendered as HTML tables, not a PDF, because `lib/report-pdf.ts` is client-side (jsPDF) and there is no browser in a cron job |
| 4 | Bookings only within a one-month advance window | **Done** | `latestCheckIn()` / `isAdvanceWindowExempt()` in `lib/workflow.ts`, applied by `bookingPayloadSchema` on client and server |
| 5 | Automatic email notification to stakeholders after room allocation | **Done** | `notifyRoomsAllocated()`, called from `allocateRooms()`. The requester gets their room numbers, the check-in time and what ID to carry; the manager and caretaker get a copy for the desk register |

> **The two were one piece of work, and were built as one** on 16 Sep 2026.
> Both needed the same missing thing — a mail transport plus somewhere to run
> scheduled jobs — so `lib/mail/` provides both: a `Mailer` seam with SMTP /
> file / dry-run implementations, an `email_outbox` queue (migration 10) that
> keeps a slow or broken mail host from ever failing a booking, and two cron
> routes. See the mail section in [21-implementation.md](21-implementation.md).

## Meeting notes — 15 Sep 2026

A third round came out of a meeting with the guest house office
(`Guest House Meeting Notes.md`, kept alongside these files in `.memories/`).
Part of it was picked up the same day; everything else in the notes is not
started.

| Requirement | Status | Where |
| --- | --- | --- |
| Room availability per week and per month, not only per day | **Done** | Day / Week / Month switch on `/availability` — `availabilityRange` + `bucketOccupancyByDay` in `lib/availability.ts`, `RangeOccupancyChart` in `components/occupancy-chart.tsx` |
| The availability grid's red legend "Booked / occupied" should read "Booked" | **Done** | `components/availability-grid.tsx` — legend, badge and counts all say booked |
| Formal wording for "sleeps 2, 3 with an extra bed" in the manager's Review & Allocate dialog | **Done** | Kept and rewritten, not removed — the extra-bed count is operational. `describeCapacity()` in `lib/occupancy.ts`; labelled summary in `components/room-grid.tsx`. Also fixed extra beds being under-counted for single rooms (`extraBedsFor`) |
| One "infant accompanying" toggle instead of per-guest infant rows | **Done** | `bookings.has_infant` (migration 7); "Infant accompanying" switch beside "+ Add guest" in `components/booking-form.tsx`. Legacy infant guest rows are kept and still read correctly |
| Meals chosen per day in a grid, not one selection for the whole stay | **Done** | Days × meals table in `components/meal-plan-grid.tsx`; `bookings.meals` is a per-day `MealPlan` (migration 8, which also converted old answers). A day offers only meals served during the stay (`stayMealDays`). Ticked by default, with the form holding the opt-outs (`mealSlotsFromDeclined`) |
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
| Invoices with payment account details; invoice at checkout for GHM and caretaker; official invoices routed to accounts | **Done** (Phase 5, Sep 2026) | The office's template reproduced as a PDF with the bank details; issued and printed at check-out from the manager and caretaker consoles; official invoices mailed to Accounts with the PDF; tariffs by date in Tariffs & Invoicing. See [15-billing-and-invoices.md](15-billing-and-invoices.md) |
| ±4 hour buffer on bookings | **Done** (Phase 3, 21 Sep 2026) | A turnaround buffer after each stay, 4 h by default, a Setting; padded in `room_holds.guard`, not `during` (migration 17) |
| HOD approval for a faculty member's booking; debitable heads (dept / project / personal fund) | **Done** (Phase 4, 22 Sep 2026) | `routeFor`, `units` + `hodApproversFor`, `/hod`; `lib/debit-heads.ts`, the Projects list (migrations 15, 18) |
| Dining/lunch booking at the guest house with debitable heads | **Done** (Phase 6, 22 Sep 2026; reworked 23 Sep) | Service type "Meals only" for faculty, staff and offices; dining debit heads; the kitchen's day at `/manager/meals` |
| Email in a single thread rather than standalone messages | **Done** (reworked 21 and 23 Sep 2026) | `lib/mail/thread.ts`. Staff mail about a booking joins one thread **per booking** per mailbox; the digest, escalation and day-wise log keep a **daily** thread; requesters get a standalone mail for each step. See [14-notifications.md](14-notifications.md) |
| Documentation for every booking workflow | **Done** (Phase 10, 23 Sep 2026) | [12-workflows.md](12-workflows.md), with every pipeline drawn out |

## Requester details from the academic database — 21 Sep 2026

The owner: student (and staff) data is to be fetched from the **institute's
academic database** and shown at the top of New Booking, with a fixed list of
fields per kind of account — students, faculty and non-faculty, offices,
student representatives, the alumni office, and wardens — plus a **"Copy to"**
line (the approver for students and student representatives, the HOD for
offices). Dummy values for now, with the provision to plug in the real
database and written instructions for doing so.

| Requirement | Status | Where |
| --- | --- | --- |
| Show each kind of account's listed fields at the top of New Booking | **Done** (dummy data) | `lib/academic/`, `components/academic-details.tsx`; field list and role mapping in [17-academic-records.md](17-academic-records.md) §1 |
| Guardian's name only when father's and mother's are empty | **Done** | `parentRows` in `lib/academic/fields.ts` |
| Copy to: the approver (students, student reps), the HOD (offices) | **Done** — shown on the form and **CC on every staff mail** (Phase 2: To = the actioner, Copy to = CC) | `lib/academic/copy-to.ts`, `lib/mail/addressing.ts`; approvers through `canReview()`. HOD *approval* is Phase 4 |
| Wardens' fields | **Done** | Wardens never open New Booking, so the card is on `/warden`, below the queue |
| Provision for the real database, and how-to | **Done** | `ACADEMIC_DB_URL` / `ACADEMIC_DB_TOKEN` → `HttpAcademicSource`; [17-academic-records.md](17-academic-records.md) §4 |

## Design handoff — 19 Sep 2026

The institute's designer supplied `design_handoff/` — an HTML prototype and
README for a seven-tab **public** guest house website (Home, Book a Room, Book
Meal, Guidelines, Gallery, Contact Us, and a link to iitpkd.ac.in), styled to
sit beside iitpkd.ac.in. The owner asked for it to be built **on what the
backend actually does**, using the design as a reference for the look, with
the guest house's **map location** included, and then supplied 14 photographs
(`Images/`) for the home page and Gallery.

Built the same day: the public site at `/`, sign-in moved to `/sign-in`, and
the portal restyled to match. What was built, what was left out and why, and
what is still waiting on the office: [16-public-site-and-ui.md](16-public-site-and-ui.md).

## Office corrections — 23 Sep 2026

Ten items from the guest house office, verbatim in substance. Most are the same
complaint in different places: **the portal asks questions whose answer is
already known.** Reasoning in
[03-decisions.md](03-decisions.md) ("23 Sep 2026").

| Asked for | Status | Where |
| --- | --- | --- |
| Mock authentication users are gone — put them back behind the "Sign in with Google" button, and call it "Mock Auth" | **Done** | `mockLoginEnabled()` in `lib/env.ts` gates the door on Google being unconfigured, not on `DEV_LOGIN`; button and page read **Mock Authentication**; `e2e/sign-in.spec.ts` |
| A meals-only booking should not ask for a guest house or a first/last day of meals — just the veg/non-veg grid, one day at a time, with "add another date" | **Done** | `components/meal-dates-picker.tsx`; dates derived into `check_in`/`check_out` |
| A meal can only be booked one meal ahead (lunch before breakfast ends); default to today, or tomorrow if it is already dinner time | **Done** | `isMealBookable` / `mealBookingDeadline` / `firstBookableMealDate` / `mealLeadTimeError` in `lib/meals.ts` |
| Remove "You will be given an invoice at checkout…" from a meal-only booking | **Done** | `PAY_AT_CHECKOUT_NOTE` suppressed for `meals_only` — nobody checks in |
| There are only double sharing rooms, so stop asking for a room type — including for the developer and the manager | **Done** | Booking form, developer console (creates doubles), allocation grid (`splitByType`), `BookingDetails`, both seeds; `supabase/repairs/2026-09-23-all-rooms-double-sharing.sql` for existing data |
| For employee, do not collect ID proof | **Done** | `buildDefaultFormConfig("employee")`: `id_document: "hidden"`, `id_number: "optional"` |
| Is a guardian handled for students with no parents, or parents abroad? | **Done** — it was *half* done | The academic card already showed `guardian_name` where both parents' are blank; the booking form did not. **Guardian** is now a relationship option and counts as a parent for the dependency rule |
| Remove "Parents visiting for convocation" from the Purpose of Visit placeholder | **Done** | A placeholder reads as a suggestion |
| Restrict infants by combination: 3+1 ok, 3+2 no, 2+2 ok, 2+3 no, 1+3 ok, 1+4 no | **Done** | Third setting `max_occupants_per_room` (4); `roomPartyError`, both Add buttons, migration 23 |
| An infant's relationship can be a text box | **Done** | The dropdown lists adults' relationships; membership is checked per guest, skipping infants |
| Father + mother + sibling under 3 in one room and 2 siblings + an infant in another shows an error | **Done, cause inferred** | The composition was always within the rules (`tests/booking-rules.test.ts`), but a *second* infant in one room was unreachable: the form's Add button stopped at one and the Supabase trigger refused it. The combination rule fixes both; `e2e/room-party.spec.ts` fills that room through the real form. The reporter could not recall the message, so this is the best-supported explanation rather than a confirmed one |
| Booking a Bageshri stay should not show "Meals Requested" at all, even as "None requested" | **Done** | `BookingDetails` and `StaysTable`, the rule the mail templates already applied |

## Office corrections — 23 Sep 2026, second list

Seven more, from working the portal after the round above. Same theme again in
places: **the portal asks questions whose answer is already known, and hides
the ones that matter.** Reasoning in [03-decisions.md](03-decisions.md)
("the office's third round"); the working summary, which is replaced each
round, is [99-recent-changes.md](99-recent-changes.md).

| Asked for | Status | Where |
| --- | --- | --- |
| The alumni Student Cell login has no guest house selected, then errors saying none was chosen — keep Bageshri autofilled, no dropdown | **Done** | One guest house is a statement plus a hidden field, not a disabled `<select>`, and it is resolved before `useForm` so it is in the server-rendered HTML; `components/booking-form.tsx`, `e2e/alumni-and-relationships.spec.ts` |
| A student can choose Mother twice; there is only one mother | **Done** | `unique_relationships` on `RoleFormConfig` + `duplicateRelationshipError()`, both sides, whole request; greyed on other guests, flagged on the repeat |
| There is no option to remove a room while filling guest details | **Already built** | Each room card above the first carries **Remove room** on its border, with a confirm dialog naming what goes with it |
| Overlapping bookings show as plain red in room availability; the overlapping part should differ | **Done** | `overlaps` from `bucketOccupancyByHour` / `bucketOccupancyByDay`, drawn `bg-overlap` (solid violet filling the overlapping stretch), legend on `/availability` and in the form's panel |
| The GHM should not be able to book for personal reasons — they have a personal account for that | **Done** | `bookingTypesFor("gh_manager")` is `["official", "alumni"]` |
| Mail for one booking id should thread together, not all of a day's mail in one thread | **Done** | `bookingThreadRoot(referenceId, address)`; scheduled mail (digest, escalation, desk log) keeps a daily thread because it has no booking; requester mail still standalone |
| Remove Institute Grant for faculty as a debitable head | **Done** | `FORBIDDEN_DEBIT_HEADS` — a floor under Settings, not a default: stripped on read, refused on save, greyed in the console |

## Office corrections — 24 Sep 2026, fourth list

Nine items, sent by the owner. Built on `main` (the `ui` branch holding the
vermilion redesign was left for a separate merge). Reasoning in
[03-decisions.md](03-decisions.md) ("24 Sep 2026"); the working summary is
[99-recent-changes.md](99-recent-changes.md).

| Asked for | Status | Where |
| --- | --- | --- |
| Generate the invoice after checking out too | **Done** | "Checked out — to bill" on the **caretaker's** console as well as the manager's (`awaitingSettlement`); an Invoice button beside Mark as Vacated in "Checking out today"; and on every checked-out stay in the Approval Log for the desk (`invoiceableFromArchive`) |
| A meal booking's invoice should not carry room-booking details | **Done** | `InvoiceDocument.kind` / `meal_dates`; `invoiceFacts()` for the PDF and the preview: meal dates and head count instead of check-in/out, rooms, infants, primary guest; no room table, no A/B |
| Remove the project details when the project fund is not the head | **Done** | Project rows only with `project_grant` (`invoiceFacts`, accounts mail) |
| With Project as the debitable head, a text box for the sub-head on New Booking | **Done** | `bookings.debit_subhead` (migration 24), optional, only with Project; printed as "Project Sub-head" |
| Faculty/staff: only name and gender mandatory | **Done** | `buildDefaultFormConfig("employee")`; age may now be optional anywhere (`ageField`, blank = adult) |
| Official bookings: only gender | **Done** | `buildDefaultFormConfig("official")` |
| Clubs/fests cannot book for themselves; only their faculty in-charge books for them | **Done** | `lib/club-booking.ts`; `/book?for=<club>`; the booking stays the club's, `created_by` the faculty member, Faculty Advisor stage skipped |
| "Copy to" on New Booking: any number of addresses that get every further mail | **Done** | `bookings.copy_to_emails` (up to 25), CC on every mail to the requester (`requesterCopyTo`) |
| Special Funds as a debitable head for everyone but students, official bookings only | **Done** | `special_budget` relabelled, default for every official category, forbidden for students and personal bookings, saved Settings upgraded once |

## Faculty Advisors — 24 Sep 2026, afternoon

The owner's follow-up to the club rule above. Reasoning in
[03-decisions.md](03-decisions.md) ("24 Sep 2026 (afternoon)"); the working
summary is [99-recent-changes.md](99-recent-changes.md).

| Asked for | Status | Where |
| --- | --- | --- |
| The hierarchy Faculty Advisor → student secretary (Tech Affairs, Cult Affairs) → clubs; the advisor books for each secretary and club | **Done** | Councils and clubs in Departments & Clubs; a council's account is its secretary's mailbox; `clubsBookableBy` |
| Copy to defaults to the secretary (`sec_arts@`, `sec_acad@`), with more addresses allowed | **Done** | `units.secretary_email` (migration 25), inherited from the council; `defaultCopyToFor` pre-fills it; "Add another email" as before |
| Petrichor's advisor is a faculty (employee) account | **Done** | Dr. Arun Prasad, `arun.prasad@`; `fa.petrichor` retired |
| Every professor can book as a Faculty Advisor; each council mapped to its advisor in the backend; the developer can change it | **Done** | `units.faculty_advisor_id`, Departments & Clubs → Faculty Advisors (developer and manager, audited); "Booking as" on `/book` for whoever is named |
| An advisor's booking needs no forwarding — straight to the GH Manager | **Done** | `routeFor` returns `[]` for it, HOD stage included |
| Copy to on every new booking | **Already built** (morning) | Every role, room and meals-only |

## Office corrections — 25 Sep 2026, fifth list

Relayed by the owner. Reasoning in [03-decisions.md](03-decisions.md)
("25 Sep 2026"); the working summary is
[99-recent-changes.md](99-recent-changes.md).

| Asked for | Status | Where |
| --- | --- | --- |
| The Assistant Warden (whoever forwards for students) sees the student's parents' / guardian's names while approving, to check the request | **Done** | `/warden`: the student's academic record in the Review dialog, each Father / Mother / Guardian on the request checked against it, and a "✓ Matches record" / "⚠ Check names" badge on the queue row — `lib/academic/family.ts`, `components/student-record-check.tsx` |
| A student choosing Father / Mother on a guest gets the name filled in from the database, not typed | **Done** | Choosing a one-of-each relationship fills the name (and the gender it implies) from the academic record — `lib/known-guests.ts`, `GuestRow` |
| The same for every user, wherever New Booking asks for something the database already holds | **Done** | "Fill in from saved details" on every guest card: the record's family, then the people on the requester's own earlier bookings (name, gender, relationship, citizenship — never an ID number or an age). The other record kinds describe the requester only, so for them it is the earlier bookings |
| Additional charges with comments at invoicing, for the caretaker and manager (extra beds, a broken vase…) | **Done** | Invoice dialog → Additional charges; each charged under rooms (18%), dining (5%) or other (no GST), with a comment printed under it; migration 26 keeps them on the draft |
| Meals the caretaker adds while invoicing are not reflected in the final price | **Fixed** | The figures only repriced after "Save counts", so the preview and the Issue dialog's grand total stayed old. They now reprice as the desk types (`priceInvoiceDraft`) |
| GST is 18% on rooms and 5% on food; the invoice template was edited, the generator not | **Done** | Settings defaults 18 / 5, the ₹7,500 slab removed (a saved row is upgraded once); the PDF and preview follow the revised template — Rate column, GST @ 18% on Subtotal (A), GST @ 5% on Subtotal (B), Grand Total (Including GST) |
| Special Funds as a debitable head for everyone except students | **Done** | Every category's default but students' (personal, alumni and the Student Cell added); a student's booking now reads the Students row (it used to fall under "personal") |
| "Add infant" should open an infant card, not a guest card | **Done** | "Infant N" card: age chosen below 5, no Aadhaar or ID upload; the schema requires the age on it |
| The manager (and caretaker, if they extend) can extend a stay to an **earlier check-in**, not only a later check-out | **Done** | Manage → Extend the stay → Earlier check-in, manager and caretaker (the same people who extend) |

## Scope decisions made during the build

- **The developer console was added beyond the original spec.** The spec fixed
  the forms and the two guest houses in code. In practice the Administration
  Section will need to add a guest house, change who is a warden, or make a field
  optional without a developer. That drove the configurable form system and the
  admin console, which are now the most distinctive parts of the project.
- **Authentication was deliberately deferred, then built.** See
  [03-decisions.md](03-decisions.md) — the app used a mock persona picker with a
  single, well-marked swap point. Since 19 Sep 2026 sign-in is **LDAP**, against
  dummy accounts until the institute directory is connected (`LDAP_URL`), and
  since Phase 8 (22 Sep 2026) the session is a row with an opaque cookie and
  "Sign in with Google" is the real OpenID Connect flow. See
  [31-ldap-sign-in.md](31-ldap-sign-in.md) and
  [26-security.md](26-security.md).
- **Email notifications are built; SMS is not.** `lib/mail/` covers every
  workflow transition plus daily digests, reminders and escalations. SMS would
  be a second `Mailer`-shaped seam and has not been asked for.

## Status

Feature-complete for the specified workflows, taken through a ten-phase
production-readiness programme in September 2026 (Settings, mail addressing,
the turnaround buffer, HOD approval and debitable heads, invoices, dining,
operational states, security, performance and tests, documentation), and
running against a hosted Supabase project. **Not yet deployed.** Two gates
remain: pointing sign-in at the institute's real LDAP directory, and moving
request-scoped database reads off the service-role key
([04-roadmap.md](04-roadmap.md) §1).
