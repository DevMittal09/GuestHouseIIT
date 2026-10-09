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
| A student choosing Father / Mother on a guest gets the name filled in from the database, not typed | **Done, then superseded 7 Oct 2026** | Then: choosing a one-of-each relationship filled the name from the academic record (`lib/known-guests.ts`, since deleted). Now: the record's name is **locked** into the box and the server writes it — `lib/academic/guest-names.ts` |
| The same for every user, wherever New Booking asks for something the database already holds | **Done** | "Fill in from saved details" on every guest card: the record's family, then the people on the requester's own earlier bookings (name, gender, relationship, citizenship — never an ID number or an age). The other record kinds describe the requester only, so for them it is the earlier bookings |
| Additional charges with comments at invoicing, for the caretaker and manager (extra beds, a broken vase…) | **Done** | Invoice dialog → Additional charges; each charged under rooms (18%), dining (5%) or other (no GST), with a comment printed under it; migration 26 keeps them on the draft |
| Meals the caretaker adds while invoicing are not reflected in the final price | **Fixed** | The figures only repriced after "Save counts", so the preview and the Issue dialog's grand total stayed old. They now reprice as the desk types (`priceInvoiceDraft`) |
| GST is 18% on rooms and 5% on food; the invoice template was edited, the generator not | **Done** | Settings defaults 18 / 5, the ₹7,500 slab removed (a saved row is upgraded once); the PDF and preview follow the revised template — Rate column, GST @ 18% on Subtotal (A), GST @ 5% on Subtotal (B), Grand Total (Including GST) |
| Special Funds as a debitable head for everyone except students | **Done** | Every category's default but students' (personal, alumni and the Student Cell added); a student's booking now reads the Students row (it used to fall under "personal") |
| "Add infant" should open an infant card, not a guest card | **Done** | "Infant N" card: age chosen below 5, no Aadhaar or ID upload; the schema requires the age on it |
| The manager (and caretaker, if they extend) can extend a stay to an **earlier check-in**, not only a later check-out | **Done** | Manage → Extend the stay → Earlier check-in, manager and caretaker (the same people who extend) |

## Public site redesign — 26 Sep 2026

Asked by the owner. Reasoning in [03-decisions.md](03-decisions.md)
("26 Sep 2026 — the public site redesigned"); the working summary is
[99-recent-changes.md](99-recent-changes.md).

| Asked for | Status | Where |
| --- | --- | --- |
| A clean, professional site that impresses, not AI-generated-looking, following the backend; the UI "too dull and dead" | **Done** | Every public page redesigned — [16-public-site-and-ui.md](16-public-site-and-ui.md) |
| Keep the mock authentication | **Kept** | "Mock Authentication" on the sign-in card and `/mock-login`, unchanged in behaviour |
| Follow the colour palette of the IITPKD websites | **Done** | Ink `#1A1A1A`, vermilion `#E94C26`, saffron `#F5A300`, from iitpkd.ac.in's CSS and the logo; the portal follows through the tokens |
| Map with two options, Hamsanandi and Bageshri (two Google Maps links) | **Done** | `/contact` map tabs; `GUEST_HOUSE_LOCATIONS` in `lib/site.ts`; each house's Map and Directions in the footer and on the home page |
| The MRBS booking portal in the footer with the contact details; the iitpkd website "and everything" | **Done** | Footer: an MRBS line and button, front office, Find us, Institute links (IIT Palakkad website, MRBS, guest house page, How to reach, Telephone directory); MRBS and iitpkd.ac.in in the portal footer too |
| A Guidelines page with dummy guidelines from what was discussed and what guest houses usually have | **Done** | `/guidelines`: nine numbered sections; 1–7 the portal's rules, 8–9 placeholder house rules marked "To be confirmed" |
| Look online for how to make it look less AI-generated | **Done** | Findings and how they were applied in [16-public-site-and-ui.md](16-public-site-and-ui.md) |
| The New Booking and Meal Booking buttons should stand out after login | **Done** | Large vermilion / ink tiles at the top of My Bookings |

### The same day, afternoon — second list

| Asked for | Status | Where |
| --- | --- | --- |
| The header with the logo and "Guest House" should look more aesthetic | **Done** | New lockup (emblem + "Guest House" + "IIT PALAKKAD" in type), transparent over the hero on the home page — `components/site/brand.tsx`, `site-header.tsx` |
| The site looks too plain, "mehh"; make it clean and aesthetic, not AI-generated | **Done** | Photo-led home page and photo banners on every inner page; split-screen sign-in |
| No figures like "23 rooms / 1 month / 14 nights / 3 meals a day" | **Done** | Removed |
| No "see them on the map" link on the landing page | **Done** | Removed (the map is on Contact) |
| No captions on photographs | **Done** | Home mosaic and Gallery, alt text kept |
| "How booking works" in the guidelines, and vaguer | **Done** | Five general steps at the top of `/guidelines` |
| Do not show the backend logic — who the users are, who approves whom | **Done** | No categories, routes or role names on any public page; a unit test guards it |
| No instruction text or meal timings on the landing page | **Done** | Meals, times and the notice rule are in Guidelines §4 |

### The same day, evening — third request

| Asked for | Status | Where |
| --- | --- | --- |
| "It looks so weird" — make it clean and professional; the image filling the page is too much; look online for ideas | **Done** | Researched peer (IIT Madras Taramani Guest House) and clean hotel/university sites; photos now contained — a split hero with one photo, guest-house cards, amenity cards, a thumbnail row, a boxed call to action; plain mastheads; the header a white bar |

## UI revamp — 30 Sep 2026

Asked by the owner as a written brief (presentation layer only). Reasoning in
[03-decisions.md](03-decisions.md) ("30 Sep 2026 — UI revamp").

| Asked for | Status | Where |
| --- | --- | --- |
| Tokens: the IITPKD palette, the serif's optical sizes, radius rules | **Done** | `app/globals.css` — fixed corner scale, `occupy` / `vacate`, `tag-*` utilities |
| Buttons and inputs 4–6px, cards and photos 8px; no pills, shadows, gradients, glass | **Done** | `components/ui/*`; no `rounded-full` / `shadow-*` / `backdrop-blur` left in the app |
| Public home: asymmetric split hero with one contained 4:3 photo; guest-house and amenity cards; MRBS prominent in the footer | **Done** | `app/(site)/page.tsx` (5 + 7 columns), `SectionHead`; the footer's MRBS strip kept |
| Lockup: emblem + "Guest House" in Source Serif 4 + tracked "IIT PALAKKAD"; white header sticky from `lg` | **Done** | `components/site/brand.tsx`, `site-header.tsx` |
| Photos in 4:3 / 16:9 frames on the hero, sign-in panel and gallery; no captions | **Done** | Hero 4:3, sign-in 4:3 (was 4:5), home mosaic |
| Contact map tabs with Google Maps embeds on each pin's coordinates | **Already so** | `components/site/guest-house-map.tsx`; unchanged |
| Portal: large tiles for New room booking (vermilion) and Meal booking (ink) | **Done** | `app/(portal)/dashboard/page.tsx` |
| GOV.UK-style tables, sharp borders, high-contrast status tags; Occupied / Vacated unmistakable | **Done** | `Table`, `StatusBadge`, `stays-table.tsx`, `checkouts-today.tsx`, `room-grid.tsx` |
| Don't break the backend, the IST rules, the e2e selectors or the public-copy test | **Held** | No `lib/` / `app/actions/` change; lint, types, 305 unit tests, 26 journeys clean |

## The supervisor's review — 30 Sep 2026

Notes from the owner's supervisor on the live site
(https://guest-house-iit.vercel.app/), relayed by the owner, who also said
what three of them meant. Reasoning in [03-decisions.md](03-decisions.md)
("30 Sep 2026 (afternoon)"); the working summary is
[99-recent-changes.md](99-recent-changes.md).

| Asked for | Status | Where |
| --- | --- | --- |
| Landing page: "First sentence ?" (the owner: promise less, keep it vague) | **Done** | "Bageshri and Hamsanandi provide accommodation on campus for guests of the institute." — no list of who stays — `app/(site)/page.tsx` |
| "Meeting room and exercise room (common) ?" (the owner: remove both) | **Done** | Six amenities, a three-column grid — `lib/site-content.ts` |
| "Take couple of photos — AM" | **Open — not code** | AM to photograph the guest houses; [04-roadmap.md](04-roadmap.md) |
| Booking page: remove "From the institute's academic database (Student)." | **Done** | No caption when the record is found; the fallbacks keep theirs — `components/academic-details.tsx` |
| Personal Funds note: "Invoice will be generated and can be settled at the time of checkout. Multiple payment options are available at the guest house." | **Done** | `PAY_AT_CHECKOUT_NOTE` (`lib/debit-heads.ts`) |
| Availability: don't show requesters the whole legend; overlap need not be shown | **Done** | Requesters see Booked / Free / Today; the desk keeps turnaround, overlap and maintenance — `getRoomAvailability().detailed`, `simple` charts, `AvailabilityLegend` |
| "Times are institute local time…" → "Times are IST…" | **Done** | Booking form's panel and `/availability` |
| "Fill in from saved details — let the student write their name as well" (the owner: a student can book for themselves and fill in their own details) | **Done, then withdrawn 7 Oct 2026** | Then: "Yourself — <name>" first in the list (`lib/known-guests.ts`, since deleted). Now: the whole Fill-in list is gone for every role; **Self** remains on the student relationship list, one per request, with the name typed |
| Invoice: Room Charges Subtotal (A), GST @ 18% on A (B), Dining Charges Subtotal (C), GST @ 5% on C (D), Grand total (A+B+C+D); the .docx already updated | **Done** | Invoice `version: 3` (`invoiceTable`, `lib/invoice.ts`), drawn by `lib/invoice-pdf.ts` and the preview; earlier invoices reprint as issued. The .docx's "on B (D)" is a typo for "on C (D)" |

## The office's seventh list — 1 October 2026

Relayed by the owner as one list, mostly about the **meal booking** and the
desk. Reasoning in [03-decisions.md](03-decisions.md) ("1 Oct 2026"); what
changed in [99-recent-changes.md](99-recent-changes.md).

| Asked for | Status | Where |
| --- | --- | --- |
| Meal booking: **personal preferences for meal order**, not one for the whole group | **Done** | `bookings.meal_diet_counts` (migration 27) holds `{veg, non_veg}` adding up to the head count; the form asks for both, the kitchen console, mail and exports read them through `mealDietCounts()`, which spreads a pre-1-Oct booking's single `meal_preference` over its head count |
| GHM / GHC console: keep a meal booking in its own card while it awaits approval | **Done** | `/manager` has **Incoming room requests** and **Incoming meal bookings**, the second with days, sittings, head count and the split instead of check-in / check-out / rooms. The caretaker has no approval queue at all |
| Room availability console: keep only the grid — no details at the bottom. "This is just for users not for GHM and GHC" | **Done** | The room-by-room list is drawn only when `detailed` (manager, caretaker, developer) — the same flag that decides the chart's legend |
| **Copy to mail is not working** — the mail is not copied to the addresses given | **Diagnosed and made visible; one env change is the owner's** | The addressing is correct and now tested on every requester mail (`tests/seventh-round.test.ts`). The cause is **`MAIL_REDIRECT_ALL_TO`**, set in the deployment: the redirect replaces To and **drops CC**, so nothing reaches a Copy-to address. `/admin/mail` now says so in red, and `.env.example` warns. **Unset it on Vercel** |
| Remove "choose the project" from the Project head — make them type it | **Done** | The dropdown is gone; the project number and title are typed into the details box beside the head, required there (`debitDetailsPrompt` / `debitDetailsRequired`), and still split into number and title for the invoice |
| Move "Fill in from saved details" somewhere less prominent — it is too big | **Done** | A compact "Fill in…" select on the guest card's own header line, label hidden |
| Remove auto-fill **even for parents** | **Done** | Choosing a relationship fills in nothing; `onRelationshipChosen` / `autoFillFor` are gone. The explicit list still fills a whole card |
| Date format **DD/MM/YYYY** everywhere | **Done** | `formatInstituteDate`, `formatInstituteDateTime`, `formatDateValue` (`lib/tz.ts`) — every rendered date goes through them |
| Late entry check-in is not possible — a guest who comes late cannot check in | **Done** | The desk can move a check-in **later** as well as earlier (`moveCheckInError`, `moveCheckInAction`, "Move check-in"), and a new booking's check-in may be **any time today** rather than strictly in the future, so the desk can enter a stay that has already begun |
| Special Funds: remove from a **personal** meal booking | **Done** | `DEFAULT_DEBIT_RULES.dining.personal` is Personal Funds alone; `FORBIDDEN_DINING_HEADS` is a floor under Settings; revision 4 withdraws it from a stored row once |
| A limit for meal booking — **30**, counting the people already booked | **Done** | `rules.meals.max_diners_per_meal` (Settings, 30, 0 = off); checked per day **and per meal** in `createBooking` against every live booking for that sitting |
| By default keep **lunch** checked instead of all | **Done** | `DEFAULT_MEALS_ON` — on a **meal booking**. A stay still starts with nothing ticked: defaulting meals on there would put dining charges on every stay at a kitchen guest house |
| Remove the pet disclaimer from the meal booking | **Done** | The notice card is rendered only for a stay |
| A confirmation message at the end of the meal booking — what was booked | **Done** | A live "Confirm your meal booking" card: kitchen, people, preferences, each day and sitting, who pays, remarks |
| A scroll option for the number of people instead of + / − | **Done** | A `1…30` dropdown (`meal_guest_count`) |
| Rename Purpose to **Remarks** on the meal booking, and make it optional | **Done** | Optional for `meals_only` only; a stay still has to say what it is for |

## The office's eighth list — 7 October 2026

Relayed by the owner as a **four-phase plan**, each phase gated on lint,
typecheck, the unit suite, a production build on the mock store and the
Playwright journeys before the next began. Reasoning in
[03-decisions.md](03-decisions.md) ("7 Oct 2026"); what changed in
[99-recent-changes.md](99-recent-changes.md). Two migrations, **28** and
**29**, both still to be applied to the hosted project.

### Phase 1 — text, the booking form, availability

| Asked for | Status | Where |
| --- | --- | --- |
| Replace **every em dash** with a hyphen | **Done** | 1,559 of them across 214 source files (`app/ components/ lib/ tests/ e2e/ scripts/`). Markdown and SQL comments left as prose |
| The project reader must take both separators | **Done** | `projectFromDetails` tries `" — "` then `" - "`, so a project stored before today still prints its title on the invoice. The em dash goes first: a hyphen also occurs inside project numbers |
| **Kerala → Keralam**, in the code and **once** in the saved invoice Setting | **Done** | `lib/site.ts`, the privacy page, the default invoice address, the console's GST note. `INVOICE_RULES_REVISION` 3 + `renameState()` rewrites a stored row's address once, whole word. Already-issued invoices and the Hindi artwork untouched, as asked |
| Remove **MRBS** from the footer, the Contact page and the portal footer | **Done** | `MRBS_URL` deleted with every use; both suites assert its absence |
| **Personal bookings ask no debitable head**; the server saves Personal Funds | **Done** | `asksForDebitHead(bookingType)` - the card is not rendered, and the schema's closing transform writes `personal_funds` whatever arrived. A **Payment** card keeps the pay-at-checkout note |
| Special Funds off personal **room** bookings | **Done** | `FORBIDDEN_DEBIT_HEADS.personal` (a floor under Settings, not just a default); `DEBIT_RULES_REVISION` 5 withdraws it from a stored row once |
| **Students and alumni: Bageshri only and no meals**, checked on the server | **Done** | `restrictedToOneGuestHouse` / `mealsAllowedFor` / `mealsPolicyError` (`lib/policy.ts`), applied by the form and by `createBooking`. It used to fall out of Bageshri having no kitchen, which a tick in the developer console could have undone |
| The GH Manager can still override | **Done** | `canOverrideGuestHousePolicy`, and the exception goes into the booking's first log entry |
| Typing the **veg** count fills non-veg with the rest, and the other way round | **Done** | `fillOtherDietCount`; a split that does not add up is no longer reachable from the form, and `dietCountsError` still enforces it for a crafted payload |
| Show the **rates** for the chosen guest house, from the same rates the invoice uses | **Done** | `tariffPreviews` resolves through `resolveTariff`, on the server, one set per guest house and booking type. An unpriced charge reads "Not published", never a zero |
| A **Change rate** button for the GHM, creating a new rate from today | **Done** | Tariffs & Invoicing: a rate in force cannot be edited, so the button copies its scope into the Add-a-rate form dated today |
| Everyone but the manager, caretaker and developer sees only "**N rooms available**", on the availability page and in the form | **Done** | `SEES_ROOMS` in `app/actions/availability.ts`; everyone else is sent `rooms: []`, `segments: []` and counts. The charts' simplified mode is retired - there is nothing left to simplify |
| The server sends those users **the number only**, never room numbers | **Done** | The counts are the whole answer; `tests/eighth-round.test.ts` asserts no room number appears in them, and the journey asserts none reaches the page |

### Phase 2 — the institute's records, in the portal (migration 28)

| Asked for | Status | Where |
| --- | --- | --- |
| A **table for the records** you import | **Done** | **Migration 28** `academic_records` - one flat table for all six kinds, unique on `(kind, lower(email))`, service-role only (it holds parents' names and phone numbers) |
| A console section, **Academic records**, for the manager and developer, pasting CSV | **Done** | `/admin/academic`: paste → **Check the paste** (a plan, "412 added, 3 updated, 9 unchanged") → Import. All or nothing; a kind or everything can be cleared; audited |
| The details card, the warden's check and the guest form all read from this table | **Done** | `StoreAcademicSource` is what `getAcademicSource()` returns with no `ACADEMIC_DB_URL`: imported rows first, the published dummies behind them. `AcademicSource.find` now says where a record came from, so the "sample" caption is per record rather than per deployment |
| Remove the **"Fill in…"** option and **"Yourself"** for every role | **Done** | `lib/known-guests.ts` and its server half deleted. `Self` stays on the student relationship list - it is a relationship, typed by hand |
| **Father and Mother** offered when the record has them, name filled in and **locked** | **Done** | `lib/academic/guest-names.ts`. A parent the record does not name is **not offered at all** - there would be no name to lock it to |
| **Guardian** offered only when the record has neither parent | **Done** | Same rule; and where the record names neither parent *and* no guardian, Guardian is left open, because the record has nothing to say |
| Siblings and grandparents typed by hand; **no record → names stay editable** | **Done** | `guestNameRule(null, …)` locks and withholds nothing |
| **The server takes parent names from the record**, not from the form | **Done** | `createBooking` rebuilds the rule from the record and writes the record's name whatever arrived |
| Aadhaar and the ID upload optional **only** for guests whose name came from the record | **Done** | In the schema, in the form's own file check, and in the labels. A sibling is still asked |

### Phase 3 — invoices and payments (no migration)

| Asked for | Status | Where |
| --- | --- | --- |
| **No empty rows**, including in room charges | **Done** | `minRows` is 0 from version 4 |
| **Lines under the GSTIN removed** | **Done** | `printsTaxLines(doc)` is false from version 4, in the PDF and the preview. The breakdown is still in every snapshot, so it is one line to restore |
| The **CGST/SGST split** moves into the GST row's label | **Done** | "GST @ 18% on A (B) - CGST 9% + SGST 9%" |
| New invoices are **version 4**; old ones reprint as they were | **Done** | Labels are computed at print time, so a `version: 3` snapshot is unchanged |
| **Cash removed** - UPI and account transfer only; old cash invoices still display | **Done** | `PAYMENT_MODES` is the two; `cash` stays in the union and labels; `paymentModeError` refuses it on a new payment. Both modes now require a reference |
| **Personal stay**: issue, pay, then vacate, in one dialog | **Done** | The row shows **Check out & settle**, which opens the invoice; the dialog gained a Mark as Vacated step |
| The server won't vacate a personal stay that isn't paid | **Done** | `vacateBlocker` + `updateBookingLifecycle(…, "VACATED", reason?)` |
| The manager can override with a reason if the invoice can't be issued | **Done** | `canOverrideVacatePayment` - the manager's, not reception's - behind a typed confirmation; the reason goes into the log |
| **Official stay**: issued at check-out, marked paid later by manager or caretaker | **Done** | Unchanged behaviour, now with a list that keeps it visible |
| A new **Awaiting payment** list at the foot of both consoles, **no 30-day limit** | **Done** | `awaitingPayment` over every issued-and-unpaid invoice, newest first; its own table, since a meal booking has no check-in, check-out or rooms. `InvoiceFilter.statuses` and `BookingFilter.ids` make it possible without a window |
| **Meal bookings**: personal ones paid at the guest house through the caretaker; official ones go to Awaiting payment | **Done** | Reception has the list too, and a dining booking appears in it from the moment its invoice is issued |
| A meal booking keeps **one invoice** | **Done** | Unchanged: one live invoice per booking |

### Phase 4 — lapsed requests become Missed (migration 29)

| Asked for | Status | Where |
| --- | --- | --- |
| A **Missed** status, in a migration of its own | **Done** | **Migration 29** is the enum value and nothing else: Postgres refuses to use a new enum value in the transaction that adds it |
| The nightly job marks pending requests whose check-in has passed, **logs it and mails** the requester | **Done** | `lib/missed-server.ts` `runMissedSweep`, wired into `/api/mail/cron` before the digest; `booking.missed.requester` |
| For a meal booking the cutoff is its **last meal day** | **Done** | `lapseDeadline` already measured a dining booking from `check_out`; the sweep reads it |
| **Running it twice changes nothing** | **Done** | A marked request is no longer active, and the mail is keyed on `updated_at`. Asserted in both suites |
| The manager can **reinstate** a Missed booking | **Done** | `reinstateMissedBooking` returns it to the stage it was waiting at (`statusBeforeMissed`), with a reason, audited. A reinstated request is never marked again - the sweep reads the reinstatement off the log |
| The queue shows Missed | **Done** | A **Missed requests** section on `/manager` (21 days), and a **Missed** tile in the Approval Log - its own tile, not filed under Cancelled |

## The office's ninth list — 8 October 2026

Relayed by the owner, who noted that **most of it is about the production
deployment** rather than the demo - the real accounts, the real heads, the real
mail. The lasting answer to that is a new file,
[06-production-requirements.md](06-production-requirements.md), which records
everything a production build needs in one place. Reasoning in
[03-decisions.md](03-decisions.md) ("8 Oct 2026"); what changed in
[99-recent-changes.md](99-recent-changes.md). One migration, **30**.

| Asked for | Status | Where |
| --- | --- | --- |
| The **nine debitable heads**, named: Institute Grant, Professional Development Fund, Project Grant, Department Budget, Special Budget, Personal Funds, Alumni Fund, Student Fund, Hostel Funds | **Done** | `STANDARD_DEBIT_HEADS`. All nine are in use now; three had been on the enum since migration 15 and offered to nobody |
| **Special Budget (Please specify the details)** - a text box, with an approval upload | **Done** | `debitDetailsRequired` includes it, so the box is **mandatory**; the upload is offered and stays optional (a requester waiting on a scan is not stopped from booking). One line to make it mandatory - [06](06-production-requirements.md) §2 |
| The **mapping of requester to head**: student / non-faculty → Personal; faculty → all but Institute Grant, Alumni, Student Fund and Hostel; offices → Institute Grant, Department, Special Budget, Student Fund, Hostel Funds, Alumni Fund; fests → Student Fund and Special Budget; Alumni IAR → Alumni Fund and Special Budget | **Done** | `DEFAULT_DEBIT_RULES` **revision 6**, which *replaces* a saved Settings row's lists rather than editing them - four categories changed which heads they have. "All funds except…" is also a **floor** (`FORBIDDEN_DEBIT_HEADS.faculty`), not only a default |
| A **declaration** whenever any fund but Personal is chosen: "I have the necessary approval for the usage of funds from the competent authority and verified that sufficient balance is there in the debitable head." | **Done** | `FUND_DECLARATION`, one constant. Inside the Debitable head card, so it appears and disappears with the head; checked on both sides; stored as `bookings.fund_declaration_at` (**migration 30**) |
| **All emails for one booking id in one thread** - "I think it's already like that, please verify" | **Verified and completed** | It was true of the **staff's** mail since 23 Sep and **not** of the requester's, which stood alone by an earlier decision. Eleven events moved into the booking thread, the invoice mail to Accounts among them. The cost is the shared subject, which is what a thread needs |
| **Less text on the website** - "it should look simple, that is the content; don't put too much explanations, instructions and mansplainings" | **Done** | The booking form's card descriptions and help paragraphs, the `/book` leads, the desk's lists and the Guidelines items. Every rule and figure kept; the clause that explains the clause dropped. The infant note had stated the room capacity that the room card below it states again |
| For the **GH Manager: add the users' data from Excel, edit the columns, and delete data** | **Done** - it was practical | Users & Roles → **Import from spreadsheet**: paste, **Check the paste**, Import, all or nothing. A **header line** names the columns in any order and only `email` is required, which is what "edit the columns" needed; a column the paste does not carry is left alone. Rows can be **ticked and deleted together**. `lib/users-import.ts` |
| A **.md file recording everything the production build needs** | **Done** | [06-production-requirements.md](06-production-requirements.md) - the users, the heads, the data the office must supply, the secrets, the migrations, what production turns off, and what was asked for and parked |

**Answered on 9 October 2026:**

| Question | Answer |
| --- | --- |
| Should the **Special Budget approval upload** be mandatory? | **No - leave it optional for now** (the office). The fund's name beside it stays mandatory |
| Why did the portal say **migrations 24-30** were missing from the hosted project, when they had been run in the SQL editor? | It did not - **these notes did**. The check recipe in [23-running-and-testing.md](23-running-and-testing.md) listed markers only up to migration 25, so nothing past it could be verified, and each round copied the previous round's "outstanding" sentence forward. A read-only probe found **1-30 all applied**. Fixed by replacing the prose with **`npm run check:migrations`**, which asks the project itself |

## The owner's list — 9 October 2026 (afternoon)

Not the office's: the owner's own reading of the portal, in one message. The
headline is **"the application is too verbose in many places… the text which
are supposed to be in the guidelines or should pop up when we make the error is
unnecessarily shown in the main page. This is the case for all pages."**
Reasoning in [03-decisions.md](03-decisions.md) ("9 Oct 2026 (afternoon)"); what
changed in [99-recent-changes.md](99-recent-changes.md). **No migration.**

| Asked for | Status | Where |
| --- | --- | --- |
| Less text everywhere - named: the infant note, "there is only one of each", "Maximum 4 people per room…", **"Double shared rooms will get first preference"**, and the tariff table's "The rates in force today…" | **Done** | All five off the booking form, with the capacity notice removed from **both** places it appeared. `INFANT_HELP_TEXT`, `uniqueRelationshipHint` and `parentDependencyHint` **deleted**; the banner is also stripped from a **saved** Form Builder row (`RETIRED_BANNERS` in `sanitizeFormConfig`). Six card descriptions and the pets notice's second paragraph went with them |
| "This is the case for all pages please fix all of that" | **Done** | Eight page leads across the portal (a lead now carries the **scope** or nothing), the desk's section descriptions (gone where the heading says it), the availability console's descriptions and trailing paragraph |
| The **room availability section in New Booking**: "showing the 10 of 10 rooms available for each day of the week… minimal and simple but not too juvenile… clean and easy to the eye but also aesthetic, this is too kiddish". And remove "Times are IST. Rooms are held by…" | **Done** | `components/availability-counts.tsx` redrawn: a labelled strip of ruled columns with the count at display size and a 3px meter, **Full** in vermilion on a full day, a headline figure for a one-day window, the 24-row hour table replaced by small chips. Every cell keeps the full sentence as its `aria-label`. The panel's toolbar is one row with `sr-only` labels |
| The privacy line on **My Bookings** is "too noticeable"; and the "Facing trouble booking?" line is not needed - "we can also put it in the black footer box right??" | **Done** | The band became a hairline row of three quiet links. The help line is gone from My Bookings **and** the booking form; the office's phone and email are in the **portal footer** on every signed-in page. `MANAGER_HELP_LINE` deleted |
| **Booking History**: "the filtering looks too cluttered and ugly… all the tick boxes"; and "we need to be able to export as pdf also" | **Done** | One row of selects (the fourteen date chips became one `<select>` with Rolling / Calendar groups); the thirteen stage and three meal tick boxes moved behind a **"Stages and meals"** disclosure that names what it is holding when closed. `canExportPdf` is **true for every role** - and a latent bug in `exportHistoryPdf`'s `defaultActor` was fixed on the way |
| **"What happens next"** off the room booking form for faculty and others | **Done** | Removed for every role: the requester hears by email at each step, and the steps are on the Guidelines page. The side column is the Requester details card alone |
| Where there is no default Copy to, do not mention it - "Copy to: Nobody - this request goes straight to the Guest House Manager…" | **Done** | `academicDetailsFor` returns `copyTo: null` when the chain is empty, so the row is absent. A lookup that *failed* still says so |
| **Meal booking**: the number of people as "a text box with up and down sliders", limit 30; and "At most 30 at a sitting" is unnecessary | **Done** | `QuantityInput`, `max` = `rules.meals.max_diners_per_meal`. **Reverses** 1 Oct's dropdown. The cap is still enforced by the schema and by `createBooking`'s check of the sitting |
| **Vegetarian and Non-Vegetarian** as the same kind of box | **Done** | Both are `QuantityInput`; answering one still fills the other with the rest |
| In a **meals-only** booking, the **room rate and extra bed rate** are not needed | **Done** | `previewItemsFor(servesMeals, service)` quotes the three meals and nothing else for `meals_only`; `/book` passes the service type |

## The office's tenth list — 9 October 2026 (evening): the offices' own debitable heads

A spreadsheet rather than a numbered list: **one row per institute office
mailbox, a column per debitable head, "Y" where that office may charge it**.
Kept verbatim as [offices-debitable-heads.csv](offices-debitable-heads.csv)
and tabulated in [06-production-requirements.md](06-production-requirements.md)
§2.

Reasoning in [03-decisions.md](03-decisions.md) ("9 Oct 2026 (evening)"); what
changed in [99-recent-changes.md](99-recent-changes.md). **No migration.**

| Asked for | Status | Where |
| --- | --- | --- |
| "The csv file has the mapping of the offices with the debitable heads, **Y** means the offices can use that debitable head… **Only show the debitable heads marked as Y do not show those which are not**" | **Done** | `OFFICE_DEBIT_HEADS` (`lib/office-debit-heads.ts`) is the spreadsheet transcribed, keyed by the **mailbox before the `@`**. `debitHeadsByType` intersects it with the Settings list, so the booking form and `createBooking` narrow from one computation. It does **not** follow `office_class`: six different lists fall across both classes of office |
| "Currently for offices we have directors office as the mock user. **So use this for that**" | **Done** | The demo `official` persona is the seed's "Director's Office" on `admin@`, aliased to the CSV's `director_iitpkd`. Its form offers **Institute Grant and Special Budget** and nothing else - verified by fetching `/book` as that persona. The demo department office (`cse.office@` → `office_cs`) offers **Department Budget and Special Budget**, which shows the mapping is per office |
| "Project Funds and Personal Funds wont be visible for any ig, if its not there in the csv" | **Confirmed, and already so** | The spreadsheet has no column for either. Neither was in the offices' category lists before this round, so nothing changed; a test now pins it (`project_grant` and `personal_funds` are on no row) |
| "Currently i guess we cant implement it because we are using mock authentication. But please keep it in .memories folder for production plan" | **Both done** | The mapping *is* implemented, because its key is the mailbox and an alias covers the demo address. What production still owes - the real mailboxes, dropping the four demo aliases, confirming `ro` is the Registrar's Office, and an editable home for the table - is [06-production-requirements.md](06-production-requirements.md) §2 and [04-roadmap.md](04-roadmap.md) |

**One thing to confirm with the office:** `ro` is read as the Registrar's
Office, and the whitelisted `registrar@iitpkd.ac.in` is aliased to it. That is
an inference from the mailbox name.

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
