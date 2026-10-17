# Recent changes - the last round, and only the last round

This file is **replaced** every round, not appended to. The round before this
one is written up where every round is: what was asked in
[01-background.md](01-background.md), why it was done that way in
[02-decisions.md](02-decisions.md).

---

## Round of 17 October 2026 - the owner's fourteenth list

Nine items about the booking page, the meal booking, the nav, My Bookings and
the approval route for a student with no hostel. **All nine are built.** Each
was checked against the code first; item 8 turned out to be half there already
and for the wrong reason, which is the only interesting part of the round.

> 1. Keep the tariff categories and their rates (₹1,000 for parents, ₹2,000
>    for official guests) on the **right-hand side** of the booking page, let
>    the user **select** the category, and remove the rates from where they
>    are now.
> 2. **Guest Details before Meal Booking.**
> 3. Ask **whether meals are required**; show the meal section only on Yes.
> 4. Put "In any case talk with caretaker for any change in meal booking" in
>    the meal section.
> 5. Replace **New Booking** in the nav with **Room Booking** and **Meal
>    Booking**.
> 6. Show fewer bookings on My Bookings.
> 7. Split it into **Upcoming, Current and Previous**.
> 8. A student with a hostel keeps the warden; a student whose **hostel is
>    NULL** goes **straight to the Guest House Manager**.
> 9. Add a test student with a genuinely null hostel.

### 1. The tariff is a panel beside the form, and the category is a question

**What a category is.** A tariff row is not something anybody picks: it is a
rate scoped by guest house, room type, booking type and requester role, and
`resolveTariff` takes the most specific row in force on the night it charges
for. So a **category is the pair the requester actually decides** - the guest
house and the kind of booking - shown with the rate those two resolve to.
Choosing one writes `guest_house_id` and `booking_type`, which is what the
rate is read from, so the selection is real and **cannot drift from the
invoice**: both ask one function.

- **`lib/tariff-categories.ts`** (new, pure): `tariffCategories` builds the
  eligible pairs from the previews the page already resolved, labelling each
  ("Hamsanandi - Official booking"), and naming the kind **only where the role
  has more than one**. Eligibility is the booking form's own rules -
  `bookingTypesFor`, `guestHousesForBookingType`, the Form Builder's allowed
  houses, kitchens only on a dining booking, and `mealsAllowedFor`. Nobody is
  shown a rate they cannot be charged. `tariffCategoriesFrom` is the same from
  a rate sheet, for a caller holding `tariffs`.
- **`components/tariff-panel.tsx`** (new): the heading, the categories as
  radios with each one's room rate, and `TariffTable` underneath for the
  chosen one - **unchanged**, caption and all. One category is **stated, not
  asked**, like the guest house and the booking type.
- **The Rates card is gone from the form.** It was a numbered section between
  the stay and the meals that answered nothing.
- **`BookingForm` lays out the two columns now** (they were the page's since
  30 Sep): the panel is a question, so it has to share the form's state.
  `BookingForm` takes the requester-details card as `aside`, and the `<form>`
  element is the **left column** - so the panels sit beside it rather than
  inside it, nothing in them is a registered field, and `numbered-sections`
  still counts the questions and nothing else.

**Not built, deliberately:** a *named* category stored on the booking
("parents", "government officer"). That is a second source of truth for
pricing unless `tariffs` carries the same column - a migration on both tables
and a new dimension in `resolveTariff`. The office's sheet already expresses
those categories as scope (its ₹4,000 Hamsanandi row is
`requester_role: official`), and that is what a requester's own role resolves
to. [03-roadmap.md](03-roadmap.md) §2j carries it as a question for the
office.

### 2, 3, 4. Guests, then "Do you require meals?", then the caretaker line

- **Guests, room by room** now stands **above** the meal card. The kitchen's
  head count *is* the guests entered above, and the two diet counts have to
  add up to it, so the old order asked about a number the requester had not
  given yet.
- **`wantsMeals`** is a Yes/No, **No** by default - which is what the form
  already did (`NO_MEALS`; meals on a stay are an extra). One gate,
  `mealsRequested`, feeds `mealPlan`, so **everything** follows from the one
  answer: the service type stays `room`, no diet split is sent, no meal rule
  can fire, and a hidden grid cannot submit a meal. The ticks stay in
  `mealChoices` while it is off, so Yes again restores them. A **dining
  booking is never asked** - the meals are the booking.
- **`MEAL_CHANGE_NOTICE`** (`lib/meals.ts`) is the owner's sentence, word for
  word, rendered at the foot of the meal section on both doors and **nowhere
  else**. It is the one deliberate exception to "a rule the form enforces is
  not stated on the form" (9 Oct) and to the house-rule version of it
  (11 Oct): it is neither - the form cannot change a meal order, the desk
  can, so it says who to ask.

### 5. Two doors in the nav: Room Booking and Meal Booking

`/book` and **`/book/meals`**, two routes over one page
(`components/booking-request-page.tsx`, extracted from the page). A route
rather than `?service=meals_only` because `usePathname()` cannot see a query,
and a nav that lights the wrong item lies about where you are; `/book` is
matched **exactly** in the nav, since the meal door is nested under it.
`?service=meals_only` still works for older links. The My Bookings tile and
the public `/book-meal` card now point at `MEAL_BOOKING_PATH`, so four places
read two constants (`lib/routes.ts`). **Meal Booking is offered only where
the account could submit one** - the same `serviceTypesFor` question the tile
asks, with the kitchens the role's form allows, so a student sees one door.

### 6, 7. My Bookings is three sections

`lib/my-bookings.ts` (new, pure) places each booking: **status first, dates
second**.

- **`OCCUPIED` is always current** - the desk recorded the guest walking in.
- **A finished request is always previous** - rejected, cancelled, vacated,
  missed.
- **Anything still open** is placed by `stayPhase`, the function the
  manager's console groups by, so the requester and the desk cannot disagree
  about "current". An open request whose dates have passed is previous:
  nobody can approve it now.

Order: next arrival first in Upcoming, earliest departure first in Current,
**most recently touched** first in Previous (`updated_at`) - what that section
holds is things that have happened. Previous draws **five**
(`PREVIOUS_BOOKINGS_SHOWN`) with **Show all N** beside it and **All booking
history** linking the archive; the figure by the heading is the whole section,
not the slice. Finished rows are **compact**: one Stay column, no Rooms.
Nothing is deleted and nothing is unreachable.

### 8. A student with no hostel has no Assistant Warden

**It already routed to the desk - for the wrong reason.** The generic rule of
12 Oct 2026 drops a stage nobody can decide, and no warden matches a null
hostel, so the request did enter at `PENDING_GH_MANAGER`. Two things were
wrong with that:

1. The booking's log read "Nobody is set to decide Pending Assistant Warden
   Review, so that stage was skipped" - a day scholar reported as a console
   somebody forgot to fill in.
2. It only held **where the caller had every profile**. `routeFor` with units
   but no profiles - the mail module, the Copy-to chain - cannot count a
   warden stage, so it assumed the stage was staffed and **would have copied
   a warden who does not exist** on every mail about the request.

So the condition is now explicit and answered from the requester's own
account:

- **`hasHostel(profile)`** - NULL *and* a blank string are both "no hostel".
- **`approverNotApplicable(approver, requester)`** - why an approver rule
  cannot apply at all, in the words the log prints
  (`NO_HOSTEL_REASON`). Only the `warden` kind: for every other kind "nobody
  is appointed" is the honest reading.
- **`stageDropped`** (`lib/workflow.ts`) now answers in three states, and
  **`droppedStages`** carries the reason. `createBooking` words the log
  accordingly: *"The Pending Assistant Warden Review stage does not apply to
  this request: no hostel is recorded on the requester's account."*
  `skippedStages` keeps its old signature and behaviour.
- **`decidesStage`** refuses an inapplicable stage before it looks at the
  directory, so no warden can act on such a request either way.
- `stageApproverIds` and `couldDecide` read `hasHostel` instead of
  `Boolean(...)`, which is the same answer stated once.

**Nothing else changed.** A student *with* a hostel keeps the warden; faculty,
staff, offices, clubs and the IAR cells have no warden stage and no hostel, so
the exception cannot widen to them - a test covers each. The database already
agreed: `profiles.hostel_name` is nullable, migration 16 normalizes a blank to
NULL, and the console's Hostel dropdown has a **None** option whose "" the
action already turned into null.

### 9. The day scholar - a test account with a null hostel

`student-day-scholar`, **Devika Iyer (day scholar - no hostel)**,
`122203099@smail.iitpkd.ac.in`, in `lib/store/seed.ts`, `supabase/seed.sql`
(`…121`, with `null` in the hostel column) and the dummy directory
(`122203099`). The login is in
[05-credentials-and-security.md](05-credentials-and-security.md). No academic
record behind it, so the booking form asks for the parents' names rather than
locking them - which is also the path a student the office has not imported
takes.

### Files

**New:** `lib/tariff-categories.ts`, `lib/my-bookings.ts`,
`components/tariff-panel.tsx`, `components/booking-request-page.tsx`,
`app/(portal)/book/meals/page.tsx`, `tests/fourteenth-round.test.ts`
(29 tests), `e2e/fourteenth-round.spec.ts` (5 journeys).

**Changed:** `components/booking-form.tsx` (the two columns, the `aside` prop,
the Rates card deleted, guests before meals, the Yes/No, the notice, the
categories and `chooseCategory`), `app/(portal)/book/page.tsx` (a wrapper),
`app/(portal)/layout.tsx` (the two doors, `exact`, `offersMealBooking`),
`app/(portal)/dashboard/page.tsx` (the tile's href, no "Your requests"
heading), `components/my-bookings.tsx` (three sections, the compact row),
`app/(site)/book-meal/page.tsx` (one constant), `lib/routes.ts`
(`ROOM_BOOKING_PATH`, `MEAL_BOOKING_PATH`, `MEALS_ONLY_SERVICE`),
`lib/meals.ts` (`MEAL_CHANGE_NOTICE`), `lib/approval-routes.ts` (`hasHostel`,
`approverNotApplicable`, `NO_HOSTEL_REASON`), `lib/workflow.ts`
(`stageDropped`, `droppedStages`), `app/actions/bookings.ts` (the log's
wording), `app/actions/academic.ts` and `app/actions/projects.ts` (revalidate
both doors), `lib/store/seed.ts`, `lib/ldap/mock-directory.ts`,
`supabase/seed.sql` (the day scholar), `e2e/helpers.ts`
(**`submittedReference`**, `latestReference` deleted, the day scholar in
`ACCOUNTS`), `e2e/booking-doors.spec.ts` (the tile's new URL), and six
journeys that read a reference.

**Unchanged:** every store, `resolveTariff` and the rest of the tariff
resolution, `components/tariff-table.tsx`, the invoice, `rules.approval`'s
shape, the four waiting statuses - **no migration in this round**.

### How it was checked

- `npm run lint`, `npm run typecheck` - clean.
- **`npm test` - 603 passing, 35 files** (574 + 29).
- `NEXT_PUBLIC_SUPABASE_URL= npm run build` - clean; `/book/meals` is in the
  route list.
- **`npm run test:e2e` - 48 passing**, the whole suite (43 + 5). The new
  journeys drive the tariff panel setting the form's own fields, the guests
  card standing above the meals card, Yes then No with nothing left behind,
  the two nav doors and which one is current, the three sections, and a day
  scholar's request reaching the desk while a hostelled student's still
  reaches the warden.
- A dev server on the mock store, by `curl`, for every role's booking page:
  the panel's categories and rates per role (a student one, faculty four, the
  Director's Office two at ₹750 and ₹4,000), both doors, and the nav's
  `aria-current`.
- `npm run check:memories`.

### Left open

- **A named tariff category** stored on the booking is a question for the
  office, not a thing half-built - [03-roadmap.md](03-roadmap.md) §2j.
- **The meal notice is on the form only.** It is not in the booking mail or on
  `BookingDetails`, where it would also be read by reviewers and the desk. If
  the office asks, the mail templates are the place.
- **A trap the round found**: a journey that read a reference with
  `page.getByText(REFERENCE).first()` was reading **the dashboard behind the
  toast**, which the three sections reordered. Fixed by
  `submittedReference(page)`, which reads the toast; see
  [22-running-and-testing.md](22-running-and-testing.md) Part 2.
