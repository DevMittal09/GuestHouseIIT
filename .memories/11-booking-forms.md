# Booking forms — what each requester is asked, and where the answers come from

The New Booking form (`/book`) as each role sees it, every rule the server
applies to a submission, and the **academic record** that fills and locks part
of it.

**Checked against the code on 10 Oct 2026** — `lib/form-config.ts`
(`buildDefaultFormConfig`), `lib/booking-types.ts`, `lib/debit-heads.ts`,
`lib/office-debit-heads.ts`, `lib/booking-schema.ts` (`bookingPayloadSchema`,
run on the client *and* the server), `app/actions/bookings.ts`
(`createBooking`), `lib/policy.ts`, `lib/occupancy.ts`, `lib/meals.ts`,
`lib/academic/*`.

Who each role *is* is in
[10-roles-and-workflows.md](10-roles-and-workflows.md); the value of every
limit, and who may change it, in
[12-settings-and-defaults.md](12-settings-and-defaults.md).

---

## Part 1 — The form


### How a role's form is decided

1. **The developer-saved config** for the role (Form Builder, `form_configs`),
   if one was ever saved;
2. otherwise **`buildDefaultFormConfig(role)`** — the defaults below;
3. then `sanitizeFormConfig` (drops deleted guest houses, repairs the
   relationship rules, turns a stored "hidden" age into required).

> **Trap.** A default change reaches only roles with **no saved row**. If a
> role was ever saved from the Form Builder, its row wins until someone
> presses **Reset to spec defaults** for it. The local mock database has no
> saved forms; the hosted database was not checked (24 Sep 2026).

The same config builds the zod schema on both sides, so a field's mode cannot
be bypassed by a crafted request.

---

### Guest fields per role (the defaults)

`R` required · `O` optional · `—` hidden.

| Field | Student | Employee (faculty & staff) | Official | Club (raised by its Faculty Advisor) | IAR Office | IAR Student Cell | GH Manager at the desk |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Guest name | R | **R** | O | R | R | R | R |
| Age | R | O | O | R | R | R | R |
| Gender | R | **R** | **R** | R | R | R | R |
| Relationship | R (dropdown) | O (free text) | — | — | — | — | R (dropdown) |
| Aadhaar / ID number | R | O | O | O | O | O | R |
| ID document upload | R | — | O | O | O | O | R |
| Guest houses offered | **Bageshri only** | all | all | all | all | all (an alumnus → Bageshri) | all |
| Banner | — (the double-sharing line was withdrawn on 9 Oct 2026) | — | — | — | — | — | — |

The last column is the base default: the manager is not a requester role, so
its form is not in the Form Builder and every guest field is required.

**Per-guest rules whatever the mode:**

- **Age may be optional, never hidden.** A blank age is an **adult**. An age
  **below 5** (`INFANT_AGE_LIMIT`) makes the guest an **infant**: no bed, no
  ID number, no ID document, and the relationship becomes free text.
- **"Add infant" opens an infant card** (25 Sep 2026), not a guest card:
  titled "Infant N", the age **chosen from a list** (below 1 year … 4 years,
  **required** whatever the role's age mode), name / gender per the role, the
  relationship free text, citizenship as for anyone; no Aadhaar, no ID
  upload. The payload marks it `infant: true` and the schema refuses one
  without an age below 5. The age still decides: a guest card given an age
  below 5 is an infant too. **The card no longer explains itself**: the
  sentence "A guest below 5 shares a guardian's bed, needs no bed of their own
  and is not asked for an ID" (`INFANT_HELP_TEXT`) was **deleted** on 9 Oct
  2026 — the infant card asks for an age 0-4 and no ID, which is the rule
  performed, and the Guidelines page states it in words.
- **A student's parents come from the academic record, locked** (7 Oct 2026,
  `lib/academic/guest-names.ts`). Where the record names them:
  - **Father** and **Mother** are on the dropdown, and choosing one puts the
    record's name in the box **read-only**, with "From your academic record -
    ask the guest house office if it is wrong" under it;
  - a parent the record does **not** name is **not offered at all** — there
    would be no name to lock it to;
  - **Guardian** appears only where the record names **neither** parent (and
    where it names neither parent and no guardian either, Guardian is left
    open with the name typed, because the record has nothing to say);
  - **Siblings and grandparents are typed by hand**, as before;
  - **no record → nothing is locked or withheld**, and the form is exactly
    what it was.

  The server does not take the form's word for it: `createBooking` rebuilds
  the rule from the record and **writes the record's name whatever arrived**.
  And a guest the record named is asked for **neither an Aadhaar number nor
  an ID document** — the institute has already identified them — while a
  sibling typed by hand still is.

  Matched against the Form Builder's own option list ignoring case, so
  renaming "Father" to "Dad" simply stops it being locked.

  > **"Fill in from saved details" and "Yourself" are gone** (7 Oct 2026,
  > for every role; `lib/known-guests.ts` deleted). Nothing is offered from
  > the requester's earlier bookings any more. The **Self relationship**
  > remains on the student form — a student may still be a guest on their own
  > request, typing their own name.
- **Aadhaar**, if typed, must be 12 digits even where optional. Shown as the
  last four everywhere afterwards; stored encrypted.
- **Citizenship** per guest: Indian (default) or Other. **Other makes
  nationality (from a country list) and passport number (5–20 letters and
  digits) mandatory**, and waives the Aadhaar number (the ID document is still
  demanded where the role requires one).
- **ID document**: JPG, PNG, WEBP or PDF, **5 MB**, typed by its bytes; EXIF
  stripped.
- **Student relationship rules** (config, editable in the Form Builder):
  options Mother, Father, Guardian, Grandmother, Grandfather, Siblings,
  **Self** (30 Sep 2026 — the student as a guest on their own request);
  **Grandmother / Grandfather / Siblings only when a Mother, Father or
  Guardian is on the same request** (any room — Self does not count);
  **Mother, Father, Guardian, Grandmother, Grandfather, Self at most once per
  request** — Siblings may repeat. A student form saved in the Form Builder
  before 30 Sep lacks Self until it is added there or reset.

  > **Neither rule is written out on the form any more** (9 Oct 2026). The
  > **option itself** says why it cannot be picked — "Siblings - needs a
  > parent on this request", "Mother - already on this request" — and
  > `parentDependencyError` / `duplicateRelationshipError` still enforce both
  > on the client and the server. The two sentences that described them
  > (`parentDependencyHint`, `uniqueRelationshipHint`) are **deleted**; the
  > rules themselves are on the Guidelines page.
- A guest with no name is stored as "Guest".

---

### What every booking is asked, top to bottom

| # | Section | Who sees it | Mandatory? |
| --- | --- | --- | --- |
| 1 | **Booking as** — Yourself / Faculty Advisor — each council or club | Professors named Faculty Advisor | Choosing one switches whose form it is |
| 2 | **Requester details** (academic record, read-only, with its Copy-to line **only when there is somebody to copy** — 9 Oct 2026; no caption when the record is found, a line saying so when it falls back to the profile) | Everyone | — (never stored) |
| 3 | **Type of booking** — Official / Personal / On behalf of an alumnus | Only roles with more than one option: Employee (Official default, Personal), IAR Office (Official, Alumni), GH Manager (Official, Alumni) | Yes; others record their single type silently |
| 4 | **What to book** — Room booking / Room + Meals / Meals only | When a guest house the role may book serves meals | Yes. Meals only: Employee, Official, IAR Office, GH Manager |
| 5 | **Approval** — Direct / Requires HOD approval | Offices (`official`, `iar_cell`), room bookings | **Yes** for offices; refused for anyone else |
| 6 | **Debitable head** | **Not a personal booking at all** (7 Oct 2026 — the money is the requester's own, so the question is not put and the server records Personal Funds). Shown, not asked, when a role has only one. A personal **stay** gets a **Payment** card instead: "An invoice will be generated and can be settled at the time of checkout. Multiple payment options are available at the guest house." A personal **meal** booking gets no card - nobody checks out | **Yes**, where it is asked |
| 6a | Project — **number and title, typed** into the details box beside the head (1 Oct 2026; it was a dropdown of the Projects list) | Head = Project | **Yes** |
| 6b | Project sub-head (text, ≤ 120) | Head = Project | Optional; refused with any other head |
| 6c | Special fund's name / sanction reference (≤ 300) | Head = Special Budget | **Yes** since 8 Oct 2026 — the office's list writes the head as "Special Budget (Please specify the details)" |
| 6d | **Upload approval** (JPG/PNG/WEBP/PDF, ≤ 5 MB) | Head = Special Budget | Optional — a requester waiting on a scan is not stopped from booking |
| 6e | **Funds declaration** tick: "I have the necessary approval for the usage of funds from the competent authority and verified that sufficient balance is there in the debitable head." | **Every head except Personal Funds** (8 Oct 2026) | **Yes**. Inside the Debitable head card, so it appears and disappears with the head. Stored as `bookings.fund_declaration_at` (migration 30) |
| 7 | **On behalf of** — guest's name, email, phone | GH Manager | Name **yes** |
| 8 | **Alumnus** — full name, student / roll number, **Alumni ID card** | Booking type = alumni | All three **yes** |
| 9 | **Guest house** | Stated as text when only one is possible; a dropdown otherwise; no question at all for meals only. **Students and alumni bookings are Bageshri alone** (7 Oct 2026, `restrictedToOneGuestHouse`), checked on the server, the manager excepted | **Yes** |
| 10 | **Check-in** date + time, **check-out** date + time (hour / minute / AM-PM dropdowns, with a "Your stay" read-back) | Room bookings | **Yes** |
| 11 | **Purpose of visit** — labelled **Remarks** on a meal booking | Everyone | **Yes**, ≥ 5 characters, on a stay; **optional** on a meal booking (1 Oct 2026) |
| 12 | **Rooms** — room cards, each with its guests | Room bookings | **At least 1 room, at most 10** |
| 13 | **Meals** — days × breakfast / lunch / dinner grid, **nothing ticked by default on a stay** (they are charged), plus **how many vegetarian and how many not** | Room + Meals | **At least one meal**, and a split adding up to the guests needing a bed |
| 14 | **Meals only** — a list of dates, each with its meals ("Add another date", **lunch ticked**), the number of people as a **typed box with − / + steppers** (`QuantityInput`, 9 Oct 2026 — it was a 1…30 dropdown from 1 Oct), and the vegetarian / non-vegetarian split in two boxes of the same kind | Meals only | Count **1–30** (the kitchen's limit per sitting, a Setting — the stepper's max, the schema's max, and `createBooking`'s check of the sitting), at least one meal, a split adding up to the count |
| 15 | **Additional information** (custom fields) | Whatever the Form Builder added for the role | As configured |
| 16 | **Copy to** — email rows, "Add another email" | Everyone | Optional, **at most 25**; pre-filled with the council secretary's mailbox when a Faculty Advisor books |
| 17 | Pets notice ("Pets are not allowed…") | **Room bookings only** (1 Oct 2026 — nobody stays on a meal booking) | Displayed only — the tick box was removed |
| 18 | **Privacy consent** tick | Everyone | **Yes** |
| 18a | **Confirm your meal booking** — kitchen, people, preferences, each day and its sittings, who pays, remarks | Meals only | Read-only, live |
| 18b | **Rates** — what this guest house charges, from the office's own rate sheet (7 Oct 2026): room per day, extra bed per day, and each meal where the kitchen serves them — **the meals alone on a dining booking** (9 Oct 2026, `previewItemsFor(servesMeals, service)`: there is no room on one to charge for). Resolved through the **same function the invoice prices from**, so the figure quoted is the figure charged; an unpriced charge reads "Not published". **The table and nothing beside it** — the paragraph about rates in force, GST and night-by-night pricing is on the Guidelines page | Everyone | Read-only |
| — | Room availability panel — **how many rooms are free**, as a labelled strip of figures per day (redrawn 9 Oct 2026), or a headline figure and hour chips on a single day. The room-by-room chart is the **desk's** only | Room bookings | Read-only |

---

### Rules checked on submission

**Dates**

- Check-in in the **future** (skipped for meals only — its "check-in" is
  midnight on the first meal day).
- Check-in within **1 month** of today (`advance_booking_months`).
  **Exempt:** Official, GH Manager, developer. Applies to check-in only.
- Check-out after check-in — the message names both times as read, and points
  at the AM/PM dropdowns when they are on the same day.
- At most **14 nights** (`max_stay_nights`, 0 = no cap), counted in institute
  calendar days. **Exempt:** Official, GH Manager, developer, and
  `director.office@iitpkd.ac.in`.
- All times are **Asia/Kolkata**, whatever the server's zone.

**Rooms and parties** (per room card, at submission)

- At most **4 people**, of whom at most **3 need a bed** and at most **3 are
  infants** — so 3+1, 2+2, 1+3 fit; 3+2, 2+3, 1+4 do not. The two "Add"
  buttons stop at the limit and say why
  (`addGuestBlockedReason` / `addInfantBlockedReason`). The database trigger
  enforces the same.

  > **The form no longer states the rule** (9 Oct 2026). "Maximum 4 people per
  > room, of whom at most 3 may need a bed…" (`roomOccupancyNotice`) appeared
  > under *Number of rooms* **and** again in every room card; it is on the
  > Guidelines page, and the disabled Add button is the rule where it matters.
  > The function stays — Guidelines renders it.
- At allocation the manager's rooms must hold the party by **room type**:
  double 2 (3 with an extra bed), single 1 (2). Both guest houses are all
  double sharing.

**Meals**

- Only where the chosen guest house **serves meals** (`serves_meals`;
  Hamsanandi on, Bageshri off).
- A day offers only the meals whose serving window overlaps the stay
  (breakfast 07:30–09:30, lunch 12:30–14:00, dinner 19:30–21:00).
- **Notice period:** a meal must be booked **before the previous one finishes
  being served** — lunch before breakfast ends, dinner before lunch ends,
  tomorrow's breakfast before tonight's dinner ends. The dining form opens on
  today while today has a meal left, otherwise tomorrow.

**Who and how**

- The **booking type** must be one the role may use; the **service type** too
  (meals only is refused for students, clubs and the Student Cell).
- The **debitable head** must be in the role's list for that booking type
  (room or dining — dining is never Project). Project needs an active project.
- **Official** role: the account must be on the **official whitelist**.
- **Club** accounts cannot submit; a `for_club` submission is re-checked
  against the clubs the caller is Faculty Advisor of.
- An **alumnus** must go to **Bageshri** (the GH Manager may override; the
  override is written into the booking's first log line).
- **ID document** is demanded server-side where the role's config requires it
  (never for an infant).
- The requester's own address is dropped from Copy to (they are mailed
  anyway); blanks and repeats are dropped; a malformed address is an error on
  its row.

---

### Per role: what they book, where it goes, what it is charged to

The heads are **the office's own list of 8 October 2026** — all nine in use,
the mapping below. Dining is each category's list less Project, which dining
can never be charged to.

| Requester | Booking types | Services | Route after submission | Debitable heads — room (default) |
| --- | --- | --- | --- | --- |
| Student | Personal (not asked) | Room, **Bageshri only and no meals** - a rule since 7 Oct, not just a consequence of Bageshri having no kitchen | Assistant Warden → GH Manager | **Not asked** (7 Oct 2026): Personal Funds, recorded by the server |
| Employee — faculty, official | Official | Room, Room + Meals, Meals only | HOD → GH Manager (meals only: GH Manager) | PDF, Project, Department, Special Budget, Personal — "all funds except Institute Grant, Alumni, Student Fund and Hostel" |
| Employee — staff (non-faculty), official | Official | same | same | **Personal Funds** |
| Employee — personal | Personal | same | GH Manager | **Not asked** (7 Oct 2026): Personal Funds, recorded by the server |
| Official — officer office | Official (not asked) | same | Direct → GH Manager, or its own head → GH Manager | Institute Grant, Department, Special Budget, Student Fund, Hostel Funds, Alumni Fund — **then narrowed to this office's own row** (below) |
| Official — department office | Official (not asked) | same | Direct, or the parent department's HOD → GH Manager | the same six as a category, **then narrowed the same way** |
| Club, council or fest (by its Faculty Advisor) | Official (not asked) | Room, Room + Meals | **GH Manager directly** | **Student Fund, Special Budget** |
| IAR Office | Official / Alumni | Room, Room + Meals, Meals only | Direct, or its head → GH Manager | Official: **Special Budget, Alumni Fund** (`iar`'s row); Alumni: **Alumni Fund, Special Budget** |
| IAR Student Cell | Alumni (not asked) | Room, **Bageshri only and no meals** (7 Oct 2026 — every alumni booking, whoever raises it) | IAR Office → GH Manager | **Alumni Fund, Special Budget** |
| GH Manager at the desk | Official / Alumni | Room, Room + Meals, Meals only | GH Manager (its own queue) | **All nine** (dining: the same less Project) |

**Floors under Settings** (`FORBIDDEN_DEBIT_HEADS`, cannot be ticked back on):
faculty never the Institute Grant, the Alumni Fund, the Student Fund or the
Hostel Funds; students never Special Budget; **a personal booking never
Special Budget** — and is not asked which budget pays at all
(`asksForDebitHead`). A student's booking is always the *student* category,
never *personal*.

**A ceiling over Settings: each office's own row** (9 Oct 2026). Settings
keys the heads by *category*, so both classes of office share one list of six.
The office's spreadsheet is per **mailbox** -
[04-production.md](04-production.md), tabulated in
[04-production.md](04-production.md) §2 - and
`debitHeadsByType` intersects the two, so an office is offered only the heads
its own row marks. It does not follow `office_class`: the Director's Office
gets Institute Grant and Special Budget, a department office its department's
budget and Special Budget, the Students Section the student and hostel funds,
the Sports Officer the grant alone. **Project Grant and Personal Funds are on
no row.** An office the spreadsheet does not name keeps the category's six.
The narrowing applies to the two office categories only, so a person whose
address resembles an office mailbox keeps their own heads.

**Any head but Personal Funds asks for the funds declaration** (row 6e above),
and **Special Budget must name the fund**.

**A meals-only booking** skips every approval stage and goes straight to the
GH Manager, whoever raises it.

**An HOD stage with nobody to give it** (no head, or the requester is the only
head) is skipped, and the submission log says so.

---

### Where each piece lives, if you need to change it

| To change | Change |
| --- | --- |
| A field's mode, relationship options, banner, allowed guest houses, custom fields | Console → Form Builder (per role) — or the default in `buildDefaultFormConfig` (then Reset the saved row) |
| Booking types a role may pick | `ROLE_BOOKING_TYPES` in `lib/booking-types.ts` |
| Who may book meals only | `MEALS_ONLY_ROLES` in `lib/booking-types.ts` |
| Debitable heads per category | Console → Settings → Debitable heads (floors in code) |
| Debitable heads **per office** | `OFFICE_DEBIT_HEADS` in `lib/office-debit-heads.ts` — a constant, not yet editable from the console |
| Booking window, stay cap, buffer, capacity, meal windows | Console → Settings |
| Stay-cap / window exemptions | `BOOKING_DURATION_EXEMPT_ROLES` (`lib/policy.ts`), `isAdvanceWindowExempt` (`lib/workflow.ts`) |
| The one guest house students and alumni use (Bageshri) | `RESTRICTED_GUEST_HOUSE_NAME` / `ALUMNI_GUEST_HOUSE_NAME` in `lib/policy.ts` — the one rule still matched on a guest house's name |
| Who may be offered meals at all | `mealsAllowedFor` (`lib/policy.ts`) — not students, not an alumni booking |
| Whether a booking type is asked which budget pays | `asksForDebitHead` (`lib/debit-heads.ts`) |
| A student's locked parent names | Console → **Academic records** (migration 28); the rule is `guestNameRule` (`lib/academic/guest-names.ts`) |
| Copy-to cap (25) | `MAX_COPY_TO_EMAILS` (`lib/booking-schema.ts`) and migration 24's check |

---

## Part 2 — The academic record behind the form


### 1. The fields, by kind of account

The list the guest house office gave on 21 Sep 2026, verbatim in substance.
Each kind is one record type in `lib/academic/types.ts`. The order below is
the display order (`academicRecordRows` in `lib/academic/fields.ts`).

| Kind (`AcademicRecordKind`) | Portal roles | Fields shown | Copy to |
| --- | --- | --- | --- |
| **Student** (`student`) | `student` | Roll Number, Name, Program, Department, Email ID, Phone Number, Father's Name, Mother's Name, *Guardian's Name* (see below), Hostel | The approver: the Assistant Warden of their hostel |
| **Faculty / Non-faculty** (`employee`) | `employee` | Employee ID, Name, Department, Employee Type, Phone Number, Email ID, Office Number | — |
| **Office** (`office`) | `official`, `iar_cell` | Department, Email ID, Phone Number | The HOD / head of the office, from the office's record |
| **Student Representative** (`student_rep`) | `club` | Type of Representative, Email ID, Phone Number, Faculty in Charge Email | The approvers of the route — **none** on a booking its Faculty Advisor raises, which goes straight to the manager (legacy club requests: the council secretary) |
| **Alumni Office** (`alumni_office`) | `iar_student_cell` | Department, Email ID, Phone Number | — |
| **Warden / Assistant Warden** (`warden`) | `warden` | Name, Phone Number, Email, Hostel | — |

Offices include Admin, Academics, the Director's Office, the Registrar's Office,
the Student Section, EWD and IAR. The role → kind table is `KIND_FOR_ROLE` in
`lib/academic/fields.ts`. It is a `Record<Role, …>`, so a new role will not
compile until someone decides its kind.

- **The two IAR accounts are mapped from the 15 Sep meeting notes.** The notes
  say "Two roles, Office and Alumni". So the IAR Office (`iar_cell`) is an
  **Office** and the IAR Student Cell account (`alumnicell@`) is the
  **Alumni Office**. If the office meant something else, change the two lines
  in `KIND_FOR_ROLE`.
- **No kind** (the card shows the portal profile, as before): `faculty_advisor`,
  `gh_manager` (booking at the desk), `gh_caretaker`, `developer`, and the
  retired `alumni`.
- **The guardian rule.** Guardian's Name replaces the two parent rows **only
  when the database has neither parent's name**. If only one parent is
  missing, both parent rows stay and the missing one reads "Not on record".
  Rahul's dummy record exercises this.
- **Office Number.** It is unconfirmed whether this means an office landline or
  a room. The label is kept as given, and the dummy value is a landline.

### 2. How it works

```
/book page (server)                          /warden page (server)
  └─ <AcademicDetailsCard user title="Requester details">   ← components/academic-details.tsx
       <Suspense fallback={Pending}>          streams in; the form below never waits for it
         academicDetailsFor(user)             lib/academic/details.ts
           ├─ academicRecordFor(user)         lib/academic/index.ts — cached, never throws
           │    └─ getAcademicSource().find(kind, email)
           │          ACADEMIC_DB_URL set → HttpAcademicSource   (lib/academic/http-source.ts)
           │          otherwise           → MockAcademicSource   (lib/academic/mock-source.ts)
           ├─ rows: academicRecordRows(record)  or  profileRows(profile)   (lib/academic/fields.ts)
           └─ copyTo: copyToFor(user, formRouteFor(user))       lib/academic/copy-to.ts
                COPY_TO_RULE[kind] is a list:
                "approver"           → every profile canReview() lets act on ANY stage of
                                       the request's chain (approvalStagesFor, lib/workflow.ts)
                "head_of_department" → the office unit's head in Departments & Clubs
                                       (or the unit above it), else record.head_name / head_email

Staff mail about a booking: CC = copyToFor(booking.requester, booking)   (lib/mail/recipients.ts
copyToAddresses → lib/mail/addressing.ts addressStaffMail removes anyone in To)
```

The same seam as `getStore()`, `getMailer()` and `getDirectory()`: **one
interface (`AcademicSource`, a single `find(kind, email)`) and two
implementations, picked from the environment.**

Rules worth keeping:

- **Records are looked up by institute email.** Every profile and every
  academic record carries one. The roll number (students only) and the
  employee id (staff only) do not cover all six kinds. Emails are lowercased
  and trimmed before the lookup.
- **The lookup never throws.** `academicRecordFor` returns a status:
  `found`, `not_found`, `unavailable` or `not_applicable`. On anything except
  `found`, the card shows the portal profile's fields and says why; on
  `found` it has **no caption at all** (the supervisor had "From the
  institute's academic database (Student)." removed, 30 Sep 2026). A
  database outage must never stop anyone from booking. Failures are logged
  with the kind only, never the email.
- **Answers are cached in-process.** Records and "no record" are kept for
  10 minutes, an outage for 1 minute. An open `/book` re-renders whenever the
  desk's data changes (`components/live-updates.tsx`), so without the cache the
  form would ask the academic database again on every one. Consequence: **a
  correction in the academic database takes up to 10 minutes to show**, or
  restart the server.
- **The card streams behind Suspense.** The HTTP source times out after 3 s,
  and only the card waits for it.
- **Copy-to approvers come from `canReview()` on the portal profile, never
  from the academic record.** The card must name the person the request will
  actually reach. The warden and the FA are found by the same rule that routes
  the request and that mail uses (`copyToFor` in `lib/academic/copy-to.ts`,
  over `approvalStagesFor` + `canReview`). So if the academic record says hostel X but the
  profile says Y, the card shows X under Hostel, and the Y warden under
  Copy to, because the Y warden is who approves. If nobody is set up to
  approve, the card says so ("No Assistant Warden is set up on the portal for
  Brindavani yet").
- **No Copy-to row at all when nobody is to be copied** (9 Oct 2026). An empty
  chain used to print "Nobody - this request goes straight to the Guest House
  Manager, or nobody is set up to approve it yet", on exactly the roles that
  never need it (a faculty member's own booking goes straight to the desk).
  `academicDetailsFor` returns `copyTo: null` instead, so the row is absent.
  A lookup that **failed** still says so - "could not be looked up right now"
  is a different fact from "nobody".
- **Copy to is CC (Phase 2, owner's decision).** The same list the card shows
  is CC on every staff mail about the booking — submission, forwarding,
  allocation, cancellation — while **To is whoever must act next**. Anyone in
  To is removed from CC, and addresses are de-duplicated. The card uses the
  role's default booking type; the mail uses the booking's own, so an
  employee's *personal* booking copies nobody. Rules by kind: student,
  student rep, employee and alumni office → the approvers of the chain;
  office → the approvers (if its route has any) plus its head. The record
  itself is still never mailed.
- **A second "Copy to" exists since 24 Sep 2026, and it is not this one.** On
  New Booking the requester may type extra addresses (`bookings.copy_to_emails`)
  that are CC'd on the *requester's* mail. The card's list is the approval
  chain on *staff* mail. Different people, different mail — keep them apart.
- **On a club's form filled in by its Faculty Advisor** the card shows the
  club's record ("Club details"), and its Copy-to line follows that booking's
  route (`formRouteFor(club, raisedBy)`) — which since 24 Sep 2026 has no
  stage at all, so since 9 Oct 2026 the row is simply not drawn. The requester-side copy (the council
  secretary's mailbox) is the booking's own **Copy to** field, not this line.
- The "Faculty in Charge Email" on a student-representative record is
  **display only**: who may book for a club is decided by the Faculty Advisor
  named in Departments & Clubs, never by the academic record.
- **The card is outside the `<form>`** on `/book`. It is read-only and
  submits nothing, and nothing from the record is stored on the booking.
- **Personal data.** The student record holds parents' names and a phone
  number. It is shown to the person it describes and — since 25 Sep 2026 —
  to the **Assistant Warden reviewing that student's request** (§2a). It is
  never stored or logged by the portal, and never goes into mail. Keep it
  that way. The DPDP notes in [04-production.md](04-production.md)
  apply.
- **The record's family is no longer "filled in" — it is the answer** (7 Oct
  2026, §2c). Choosing Father or Mother on a student's guest card puts the
  record's name in the box **read-only**, and the server writes the record's
  name whatever the browser sent. The 25 Sep "fill in from the record" and
  30 Sep "Yourself" mechanisms, and `lib/known-guests.ts` with them, are
  **gone** — withdrawn for every role at the office's request.
- **A dashed "Demo build" note** appears under the card while a **dummy**
  record is shown. Per record since 7 Oct 2026, not per deployment:
  `AcademicSource.find` returns where the record came from
  (`database` / `imported` / `sample`), because on the same install one
  person's card can be their own imported record and the next a sample.

### 2a. The Assistant Warden's check (25 Sep 2026)

The office asked that whoever forwards a student's request can verify the
parents on it. On `/warden`, `studentRecordPanels` (`lib/academic/family-server.ts`)
looks up the record of each student whose request is in the warden's queue —
the same cached, never-throwing `academicRecordFor` — and the Review dialog
shows it (`components/student-record-check.tsx`): the record's rows, then a
table of Father / Mother / Guardian — the name on record, the guests on the
request with that relationship, and a verdict from `checkFamily`
(`lib/academic/family.ts`):

| Verdict | When |
| --- | --- |
| Matches the record | The same name, ignoring case, spacing, punctuation and titles (Mr, Dr, Smt, Shri…) |
| Partly matches — check | One name inside the other ("Ramesh" / "Ramesh Menon"), or the same words reordered |
| Differs from the record | Anything else |
| Not on record | The request names one; the record has no such name |
| Not on this request | On record, and nobody with that relationship is on the request |

The queue row carries **✓ Matches record** (every parent or guardian on the
request matches) or **⚠ Check names**. Infants are never compared, whatever
relationship was typed for them. With no record or an outage, the dialog says
so and the warden checks the names themselves — the queue still works.

Only the warden's queue gets this: `canReview` already confines it to their
hostel's students, and no other approver sees students.

### 2b. The records the office keeps (migration 28, 7 Oct 2026)

**Console → Academic records** (`/admin/academic`, manager **and**
developer). One list per kind of record, because the columns differ.

- **Paste → Check the paste → Import.** The console shows the columns in
  order, with a **Copy the header** button, and the paste may be comma-,
  semicolon- or tab-separated (spreadsheet quoting is handled, so a department
  called "Physics, Applied" survives). The **first column is the institute
  email** — that is what a record is found by; everything after it is
  optional, and a short line simply leaves the rest off the record. `#`
  comments and a pasted header row are ignored.
- **Check the paste** reports what the import *would* do — "412 added, 3
  updated, 9 unchanged" — before it does it, and an import is **all or
  nothing**: one unreadable line and nothing lands. A half-applied list of
  students is worse than a rejected one, because nobody can tell which half
  landed. At most 2,000 rows a paste.
- The office's "we do not have it" spellings (`-`, `--`, `N/A`, `nil`,
  `none`, `null`) are read as a **gap**, not as a name.
- A row can be removed, a whole kind cleared, or everything cleared (typed
  confirmation). **Every change is audited** — these rows decide what a
  student's booking form locks their parents' names to.
- The table is **`academic_records`**: one flat row per `(kind, email)`
  (unique on `lower(email)`), with every kind's fields as nullable columns.
  **Service-role only, no `authenticated` policy** — it holds parents' names
  and phone numbers, like `app_settings`.
- **Where the records come from** is `getAcademicSource()`:
  `ACADEMIC_DB_URL` set → the institute's database over HTTP; otherwise
  `StoreAcademicSource`, which prefers an imported row and falls through to
  `lib/academic/mock-source.ts`. A table that is not there yet (migration 28
  unapplied) falls through too, rather than reading as an outage.
- **The 10-minute cache is cleared on every import, delete and clear**
  (`forgetAcademicRecords`). Without it a pasted record read back as the one
  it replaced for ten minutes — and the booking form went on locking a parent
  to the name the office had just corrected.

### 2c. What the booking form locks (7 Oct 2026)

`lib/academic/guest-names.ts`, `guestNameRule(record, relationshipOptions)`.
The office's words: "Father and Mother are offered when the record has them,
with the name filled in and locked. Guardian is offered only when the record
has neither parent. Siblings and grandparents are typed by hand. If there's no
record, names stay editable."

| The record says | The form does |
| --- | --- |
| Father's name | **Father** on the dropdown; the name read-only in the box |
| No father's name | **Father is not offered at all** — there would be no name to lock it to |
| Mother's name | **Mother**, likewise |
| Neither parent, a guardian | **Guardian**, locked to that name; Father and Mother not offered |
| Neither parent, no guardian | **Guardian** offered with the name **typed** — the record has nothing to say |
| Either parent on record | **Guardian is not offered** |
| No record at all | Nothing locked, nothing withheld — the form is exactly what it was |

Two things follow, both enforced on the server and not merely shown:

- **`createBooking` writes the record's name**, whatever the browser sent. It
  rebuilds the rule from the record rather than trusting the submission — the
  whole point is that the name is the institute's.
- **A guest the record named is asked for neither an Aadhaar number nor an ID
  document.** The institute has already identified them; demanding a document
  as well is asking the student to prove what the record says. A sibling or
  grandparent, typed by hand, is still asked — which is why the exemption is
  keyed on the relationship being locked, not on the role.

Matched against the Form Builder's own option list, ignoring case, so an
office that renames "Father" to "Dad" gets a dropdown that stops being locked
rather than a form nobody can submit.

> This supersedes the warden's check in one sense and leaves it in another.
> The check (§2a) was there because a student typed a name and somebody had to
> compare it afterwards; now the request carries the right one. It is kept for
> the guests the form does **not** fix (a request from a student with no
> record, and anything stored before this round), and because the warden still
> wants the record in front of them.

### 3. The dummy records

In `lib/academic/mock-source.ts`, matched by email to the seeded personas.
**Keep that file and this table in step.** Every value is invented. Phones are
in the obviously fake `+91 90000 …` range.

| Persona (email) | Kind | Highlights |
| --- | --- | --- |
| Anjali Menon (`112201001@smail…`) | Student | B.Tech, CSE, Malhar, father Ramesh Menon, mother Sreeja Menon |
| Rahul Nair (`142202014@smail…`) | Student | M.Tech, EE, Saveri, **no parents on record → guardian Gopinath Nair** |
| Dr. Priya Sharma (`priya@`) | Faculty / Non-faculty | FAC-1042, "Faculty — Assistant Professor", office 0491 000 1042 |
| Dr. Arun Prasad (`arun.prasad@`) | Faculty / Non-faculty | FAC-1057, "Faculty — Associate Professor", office 0491 000 1057 |
| Director's Office (`admin@`) | Office | Copy to: Director `director@iitpkd.ac.in` |
| IAR Office (`iar@`) | Office | Copy to: Dean, International & Alumni Relations `dean.iar@iitpkd.ac.in` |
| Petrichor (`petrichor@`) | Student Representative | "Fest Council — Petrichor", faculty in charge `arun.prasad@` |
| Cultural Affairs Council (`sec_arts@`) | Student Representative | "Council — Cultural Affairs (Secretary)", faculty in charge `arun.prasad@` |
| IAR Student Cell (`alumnicell@`) | Alumni Office | "International & Alumni Relations — Alumni Cell" |
| Dr. Suresh Kumar (`warden.malhar@`) | Warden | Malhar |
| Dr. Lakshmi Devi (`warden.saveri@`) | Warden | Saveri |

A persona with a kind but no dummy record (for example, a user created in the
console) shows "no … record for <email>" and falls back to the profile. That is
also exactly what happens with the real database for someone it does not know.

### 4. Connecting the real academic database

**Nothing in the pages or components changes.** Only the source does.

#### Option A: an HTTP API (built; env only)

1. **Get the institute to expose a read-only lookup** that follows this
   contract. It can be a thin wrapper in front of the ERP.

   ```
   GET {ACADEMIC_DB_URL}/records/{kind}?email={institute email, lowercased}
   Authorization: Bearer {ACADEMIC_DB_TOKEN}          (sent only if set)
   Accept: application/json

   200 → one JSON object with that kind's fields
   404 → no such record
   anything else, a 3 s timeout, or a body that is not a JSON object → "unavailable"
   ```

   `{kind}` is one of `student`, `employee`, `office`, `student_rep`,
   `alumni_office`, `warden`. The field names are the snake_case keys in
   `lib/academic/types.ts`, listed per kind in `ACADEMIC_RECORD_FIELDS`:

   ```jsonc
   // GET …/records/student?email=142301026@smail.iitpkd.ac.in
   {
     "roll_number": "142301026", "name": "…", "program": "B.Tech",
     "department": "…", "email": "142301026@smail.iitpkd.ac.in",
     "phone": "…", "father_name": "…", "mother_name": "…",
     "guardian_name": null, "hostel": "Malhar"
   }
   // employee: employee_id, name, department, employee_type, phone, email, office_number
   // office:   department, email, phone, head_name, head_email
   // student_rep: representative_type, email, phone, faculty_in_charge_email
   // alumni_office: department, email, phone
   // warden:   name, phone, email, hostel
   ```

   Unknown keys are ignored, and nothing else in the response is ever shown. A
   missing, blank or non-text field becomes "Not on record". Numbers are
   accepted as text, so a numeric roll number is fine.

2. **Set the environment** (`.env.local` or the host's settings; documented in
   `.env.example`):

   ```
   ACADEMIC_DB_URL=https://<erp host>/api/guesthouse/     # trailing slash optional
   ACADEMIC_DB_TOKEN=<read-only token>                     # optional, server-only
   ```

   **Setting `ACADEMIC_DB_URL` turns the dummy records off entirely** and hides
   the "Demo build" note. Restart the server. These are not `NEXT_PUBLIC_`, so
   no rebuild is needed.

3. **Check hostel names match the portal's.** Wardens are scoped by
   `profiles.hostel_name`, compared as exact text (`canReview`). If the
   academic database says "Malhar Hostel" and the portal says "Malhar", the
   card shows the first under Hostel, and routing still follows the profile.
   Either align the names, or map them in `recordFromJson`.

#### If their API has a different shape

Change **`recordFromJson`** in `lib/academic/http-source.ts`, and nothing else
if only field names differ. It is the one place the database's names meet
ours. For example, `"fatherName"` becomes `father_name`, or nested
`{ parents: { father } }` is flattened there. If the URL layout differs (for
example `/students/{roll}`), change the `new URL(…)` line in
`HttpAcademicSource.find`. The roll number can be derived from a student email
(the local part), as [04-production.md](04-production.md) shows.

#### Option B: some other transport (direct SQL, a nightly CSV, a synced table)

Write another class that implements `AcademicSource`, and choose it in
`getAcademicSource()` (`lib/academic/index.ts`):

```ts
export class SqlAcademicSource implements AcademicSource {
  readonly description = "academic database (SQL)";
  async find(kind: AcademicRecordKind, email: string): Promise<AcademicRecord | null> {
    // query by email; map the row to the kind's fields; null when no row;
    // throw AcademicSourceUnavailableError when the database cannot answer
  }
}
```

The class must: return `null` for no record, throw
`AcademicSourceUnavailableError` for an outage (the caller turns it into a
fallback), and fill every field of the kind with `string | null`.
`recordFromJson(kind, row)` does that mapping for any plain object whose keys
already match. A new driver (`pg`, `mysql2`…) is a new dependency, and
probably needs `serverExternalPackages` in `next.config.ts` like `nodemailer`.

If the institute will only hand over a periodic export, a table in Supabase
(plus an import in the developer console) is the likely shape. That means a
migration and store methods in **both** stores, per the usual rule.

#### Verifying the switch

This is what was done on 21 Sep 2026, and it is quick to repeat:

1. Run a fake API on the contract above (a 30-line `node:http` server that
   answers 200 for one email, 500 for another and 404 for the rest).
2. Start the dev server on the mock store with the env pointed at it:
   `NEXT_PUBLIC_SUPABASE_URL= ACADEMIC_DB_URL=http://127.0.0.1:4545/api ACADEMIC_DB_TOKEN=… npm run dev`.
3. With `DEV_LOGIN=true` (development only),
   `curl -b "gh_mock_user=student-anjali" localhost:3000/book` and check that
   the card shows the served values, that blanks read "Not on record", that
   unknown keys do not appear, and that there is no Demo note. The 500 persona
   shows "could not be reached", with the form still rendered below. The 404
   persona shows "no Student record" with Copy to still resolved. A second
   load is served from the cache (the fake API's log does not grow).

#### Questions for the academic office / IT

- Is there an API, or only database access or exports? Who issues a
  read-only token?
- Is the institute email the key on every kind of record (students, staff,
  offices, club mailboxes, the alumni cell, wardens)?
- The exact hostel names, and whether they match the portal's.
- What "Office Number" means (a landline or a room), and what "Employee Type"
  contains.
- Who the "head" of each office is in their data (the HOD, the Registrar, the
  Director…), and whether they have email addresses on record.
- How current the data is: are hostel changes at the start of a semester
  reflected immediately?

### 5. What the record deliberately does not do

- ~~Copy to is not mailed~~ — **built in Phase 2**: Copy to is CC on staff
  mail (§2). An office's head is CC'd on every staff mail about its bookings;
  whether the head also *approves* is the office's per-booking choice
  ("Requires HOD approval", Phase 4).
- **Nothing from the record is stored on the booking.** Since 25 Sep 2026
  the Assistant Warden *sees* a student's record while reviewing (§2a), read
  live. Other reviewers still do not. If a later stage needs it after the
  record may have changed, snapshot the rows onto the booking at submission
  (as `custom_fields` snapshots its labels).
- **The profile is not synced from the record.** Routing still uses
  `profiles.hostel_name` and `department_or_club`, set by the developer
  console, so warden scoping depends on a hand-typed hostel.

Both of those are **candidates, not plans** - snapshotting the record onto the
booking, and filling the profile from it at sign-in, are listed in
[03-roadmap.md](03-roadmap.md) §7, which is where the decision belongs.

### 6. What was verified (21 Sep 2026)

- **Throwaway `tsx` test, 23 cases:**
  - role → kind for every role
  - the field order for each kind
  - the guardian rule (both parents missing, one missing, all three missing)
  - every seeded persona with a kind has a dummy record
  - the `recordFromJson` adapter (unknown keys, blanks, numbers, non-objects)
  - the HTTP source against a local server: path, query, bearer token,
    trailing slash, 404, 500, non-JSON, a malformed URL, and the 3 s timeout
  - `academicRecordFor` returns "unavailable" instead of throwing, caches it,
    and does not log the email
  - Copy to for every persona, a hostel with no warden, and an office with no
    record
- **HTTP smoke test on the mock store:** every requester persona's `/book`,
  the manager's `/book` (profile fallback, no Copy to), and `/warden`.
- **Full stack against a fake API** (§4, "Verifying the switch").
- `npm run lint` and `npm run build` are clean.

The scripts are not in the repo. Re-create them from this list if you touch
`lib/academic/`.
