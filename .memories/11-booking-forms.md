# Booking forms — what each requester is asked, and what is mandatory

The New Booking form (`/book`) as each role sees it, and every rule the
server applies to a submission. **Checked against the code on 24 Sep 2026**,
and updated for the 25 Sep round (infant card, filling in known guests,
Special Funds):
`lib/form-config.ts` (`buildDefaultFormConfig`), `lib/booking-types.ts`,
`lib/debit-heads.ts`, `lib/booking-schema.ts` (`bookingPayloadSchema`, run on
the client *and* the server), `app/actions/bookings.ts` (`createBooking`),
`lib/policy.ts`, `lib/occupancy.ts`, `lib/meals.ts`.

Who each role *is* is in [10-roles-and-features.md](10-roles-and-features.md);
the value of every limit, and who can change it, in
[13-settings-and-defaults.md](13-settings-and-defaults.md).

---

## How a role's form is decided

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

## Guest fields per role (the defaults)

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
| Banner | "Double shared rooms will get first preference" | — | — | — | — | — | — |

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
  below 5 is an infant too.
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
- A guest with no name is stored as "Guest".

---

## What every booking is asked, top to bottom

| # | Section | Who sees it | Mandatory? |
| --- | --- | --- | --- |
| 1 | **Booking as** — Yourself / Faculty Advisor — each council or club | Professors named Faculty Advisor | Choosing one switches whose form it is |
| 2 | **Requester details** (academic record, read-only, with its Copy-to line; no caption when the record is found, a line saying so when it falls back to the profile) | Everyone | — (never stored) |
| 3 | **Type of booking** — Official / Personal / On behalf of an alumnus | Only roles with more than one option: Employee (Official default, Personal), IAR Office (Official, Alumni), GH Manager (Official, Alumni) | Yes; others record their single type silently |
| 4 | **What to book** — Room booking / Room + Meals / Meals only | When a guest house the role may book serves meals | Yes. Meals only: Employee, Official, IAR Office, GH Manager |
| 5 | **Approval** — Direct / Requires HOD approval | Offices (`official`, `iar_cell`), room bookings | **Yes** for offices; refused for anyone else |
| 6 | **Debitable head** | **Not a personal booking at all** (7 Oct 2026 — the money is the requester's own, so the question is not put and the server records Personal Funds). Shown, not asked, when a role has only one. A personal **stay** gets a **Payment** card instead: "An invoice will be generated and can be settled at the time of checkout. Multiple payment options are available at the guest house." A personal **meal** booking gets no card - nobody checks out | **Yes**, where it is asked |
| 6a | Project — **number and title, typed** into the details box beside the head (1 Oct 2026; it was a dropdown of the Projects list) | Head = Project | **Yes** |
| 6b | Project sub-head (text, ≤ 120) | Head = Project | Optional; refused with any other head |
| 6c | Special fund's name / sanction reference (≤ 300) and sanction letter upload | Head = Special Funds | Both optional |
| 7 | **On behalf of** — guest's name, email, phone | GH Manager | Name **yes** |
| 8 | **Alumnus** — full name, student / roll number, **Alumni ID card** | Booking type = alumni | All three **yes** |
| 9 | **Guest house** | Stated as text when only one is possible; a dropdown otherwise; no question at all for meals only. **Students and alumni bookings are Bageshri alone** (7 Oct 2026, `restrictedToOneGuestHouse`), checked on the server, the manager excepted | **Yes** |
| 10 | **Check-in** date + time, **check-out** date + time (hour / minute / AM-PM dropdowns, with a "Your stay" read-back) | Room bookings | **Yes** |
| 11 | **Purpose of visit** — labelled **Remarks** on a meal booking | Everyone | **Yes**, ≥ 5 characters, on a stay; **optional** on a meal booking (1 Oct 2026) |
| 12 | **Rooms** — room cards, each with its guests | Room bookings | **At least 1 room, at most 10** |
| 13 | **Meals** — days × breakfast / lunch / dinner grid, **nothing ticked by default on a stay** (they are charged), plus **how many vegetarian and how many not** | Room + Meals | **At least one meal**, and a split adding up to the guests needing a bed |
| 14 | **Meals only** — a list of dates, each with its meals ("Add another date", **lunch ticked**), number of people as a **1…30 dropdown**, and the vegetarian / non-vegetarian split | Meals only | Count **1–30** (the kitchen's limit per sitting, a Setting), at least one meal, a split adding up to the count |
| 15 | **Additional information** (custom fields) | Whatever the Form Builder added for the role | As configured |
| 16 | **Copy to** — email rows, "Add another email" | Everyone | Optional, **at most 25**; pre-filled with the council secretary's mailbox when a Faculty Advisor books |
| 17 | Pets notice ("Pets are not allowed…") | **Room bookings only** (1 Oct 2026 — nobody stays on a meal booking) | Displayed only — the tick box was removed |
| 18 | **Privacy consent** tick | Everyone | **Yes** |
| 18a | **Confirm your meal booking** — kitchen, people, preferences, each day and its sittings, who pays, remarks | Meals only | Read-only, live |
| 18b | **Rates** — what this guest house charges, from the office's own rate sheet (7 Oct 2026): room per day, extra bed per day, and each meal where the kitchen serves them. Resolved through the **same function the invoice prices from**, so the figure quoted is the figure charged; an unpriced charge reads "Not published" | Everyone | Read-only |
| — | Room availability panel — **"N rooms available"** per day, and per hour on a single day (7 Oct 2026). The room-by-room chart is the **desk's** only | Room bookings | Read-only |

---

## Rules checked on submission

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
  buttons stop at the limit. The database trigger enforces the same.
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

## Per role: what they book, where it goes, what it is charged to

| Requester | Booking types | Services | Route after submission | Debitable heads — room (default) | Dining |
| --- | --- | --- | --- | --- | --- |
| Student | Personal (not asked) | Room, **Bageshri only and no meals** - a rule since 7 Oct, not just a consequence of Bageshri having no kitchen | Assistant Warden → GH Manager | **Not asked** (7 Oct 2026): Personal Funds, recorded by the server | — |
| Employee — faculty, official | Official | Room, Room + Meals, Meals only | HOD → GH Manager (meals only: GH Manager) | Department, Project, PDF, Special Funds | Department, PDF, Personal, Special Funds |
| Employee — staff, official | Official | same | same | Department, Special Funds | Department, Special Funds |
| Employee — personal | Personal | same | GH Manager | **Not asked** (7 Oct 2026): Personal Funds, recorded by the server | **Not asked**: Personal Funds |
| Official — officer office | Official (not asked) | same | Direct → GH Manager, or its own head → GH Manager | Institute Grant, Special Funds | Institute Grant, Special Funds |
| Official — department office | Official (not asked) | same | Direct, or the parent department's HOD → GH Manager | Department, Special Funds | Department, Special Funds |
| Club (by its Faculty Advisor) | Official (not asked) | Room, Room + Meals | **GH Manager directly** | Department, Special Funds | — |
| IAR Office | Official / Alumni | Room, Room + Meals, Meals only | Direct, or its head → GH Manager | Official: its office class; Alumni: Institute Grant, Personal Funds, Special Funds | Official: its office class; Alumni: Personal Funds, Special Funds |
| IAR Student Cell | Alumni (not asked) | Room, **Bageshri only and no meals** (7 Oct 2026 — every alumni booking, whoever raises it) | IAR Office → GH Manager | Institute Grant, Personal Funds, Special Funds | — |
| GH Manager at the desk | Official / Alumni | Room, Room + Meals, Meals only | GH Manager (its own queue) | Official: Department, Institute Grant, PDF, Personal, Project, Special Funds; Alumni: Institute Grant, Personal Funds, Special Funds | Official: the same less Project; Alumni: Personal Funds, Special Funds |

**Special Funds is offered to everyone except students and personal bookings**
(25 Sep 2026, narrowed 7 Oct). **Floors under Settings**
(`FORBIDDEN_DEBIT_HEADS`, cannot be ticked back on): faculty never the
Institute Grant; students never Special Funds; **a personal booking never
Special Funds** — and is not asked which budget pays at all
(`asksForDebitHead`). A student's booking is always the *student* category,
never *personal*.

**A meals-only booking** skips every approval stage and goes straight to the
GH Manager, whoever raises it.

**An HOD stage with nobody to give it** (no head, or the requester is the only
head) is skipped, and the submission log says so.

---

## Where each piece lives, if you need to change it

| To change | Change |
| --- | --- |
| A field's mode, relationship options, banner, allowed guest houses, custom fields | Console → Form Builder (per role) — or the default in `buildDefaultFormConfig` (then Reset the saved row) |
| Booking types a role may pick | `ROLE_BOOKING_TYPES` in `lib/booking-types.ts` |
| Who may book meals only | `MEALS_ONLY_ROLES` in `lib/booking-types.ts` |
| Debitable heads per category | Console → Settings → Debitable heads (floors in code) |
| Booking window, stay cap, buffer, capacity, meal windows | Console → Settings |
| Stay-cap / window exemptions | `BOOKING_DURATION_EXEMPT_ROLES` (`lib/policy.ts`), `isAdvanceWindowExempt` (`lib/workflow.ts`) |
| The one guest house students and alumni use (Bageshri) | `RESTRICTED_GUEST_HOUSE_NAME` / `ALUMNI_GUEST_HOUSE_NAME` in `lib/policy.ts` — the one rule still matched on a guest house's name |
| Who may be offered meals at all | `mealsAllowedFor` (`lib/policy.ts`) — not students, not an alumni booking |
| Whether a booking type is asked which budget pays | `asksForDebitHead` (`lib/debit-heads.ts`) |
| A student's locked parent names | Console → **Academic records** (migration 28); the rule is `guestNameRule` (`lib/academic/guest-names.ts`) |
| Copy-to cap (25) | `MAX_COPY_TO_EMAILS` (`lib/booking-schema.ts`) and migration 24's check |
