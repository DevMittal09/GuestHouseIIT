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
- **Filled in from what the portal knows** (25 Sep 2026, `lib/known-guests.ts`):
  on a guest card, choosing **Father / Mother / Guardian / Grandmother /
  Grandfather** (the one-of-each relationships) fills the name — from the
  student's **academic record** first (father, mother, guardian), then from
  the requester's **own earlier bookings** — and the gender the word implies,
  but only into an empty box or one the previous choice filled. **Fill in
  from saved details** (a list at the top of every guest card, every role but
  the desk) fills name, gender, relationship, citizenship and nationality from
  the record's family or anyone on the requester's earlier bookings. Never an
  ID number, a passport number or an age. A line under the name says where it
  came from.
- **Aadhaar**, if typed, must be 12 digits even where optional. Shown as the
  last four everywhere afterwards; stored encrypted.
- **Citizenship** per guest: Indian (default) or Other. **Other makes
  nationality (from a country list) and passport number (5–20 letters and
  digits) mandatory**, and waives the Aadhaar number (the ID document is still
  demanded where the role requires one).
- **ID document**: JPG, PNG, WEBP or PDF, **5 MB**, typed by its bytes; EXIF
  stripped.
- **Student relationship rules** (config, editable in the Form Builder):
  options Mother, Father, Guardian, Grandmother, Grandfather, Siblings;
  **Grandmother / Grandfather / Siblings only when a Mother, Father or
  Guardian is on the same request** (any room); **Mother, Father, Guardian,
  Grandmother, Grandfather at most once per request** — Siblings may repeat.
- A guest with no name is stored as "Guest".

---

## What every booking is asked, top to bottom

| # | Section | Who sees it | Mandatory? |
| --- | --- | --- | --- |
| 1 | **Booking as** — Yourself / Faculty Advisor — each council or club | Professors named Faculty Advisor | Choosing one switches whose form it is |
| 2 | **Requester details** (academic record, read-only, with its Copy-to line) | Everyone | — (never stored) |
| 3 | **Type of booking** — Official / Personal / On behalf of an alumnus | Only roles with more than one option: Employee (Official default, Personal), IAR Office (Official, Alumni), GH Manager (Official, Alumni) | Yes; others record their single type silently |
| 4 | **What to book** — Room booking / Room + Meals / Meals only | When a guest house the role may book serves meals | Yes. Meals only: Employee, Official, IAR Office, GH Manager |
| 5 | **Approval** — Direct / Requires HOD approval | Offices (`official`, `iar_cell`), room bookings | **Yes** for offices; refused for anyone else |
| 6 | **Debitable head** | Everyone (shown, not asked, when there is only one) | **Yes** |
| 6a | Project (from the Projects list) | Head = Project | **Yes** |
| 6b | Project sub-head (text, ≤ 120) | Head = Project | Optional; refused with any other head |
| 6c | Special fund's name / sanction reference (≤ 300) and sanction letter upload | Head = Special Funds | Both optional |
| 7 | **On behalf of** — guest's name, email, phone | GH Manager | Name **yes** |
| 8 | **Alumnus** — full name, student / roll number, **Alumni ID card** | Booking type = alumni | All three **yes** |
| 9 | **Guest house** | Stated as text when only one is possible; a dropdown otherwise; no question at all for meals only | **Yes** |
| 10 | **Check-in** date + time, **check-out** date + time (hour / minute / AM-PM dropdowns, with a "Your stay" read-back) | Room bookings | **Yes** |
| 11 | **Purpose of visit** | Everyone | **Yes**, at least 5 characters |
| 12 | **Rooms** — room cards, each with its guests | Room bookings | **At least 1 room, at most 10** |
| 13 | **Meals** — days × breakfast / lunch / dinner grid, every served meal ticked by default, plus Vegetarian / Non-vegetarian | Room + Meals | **At least one meal** and the **preference** |
| 14 | **Meals only** — a list of dates, each with its meals ("Add another date"), guest count, preference | Meals only | Count **1–100**, at least one meal, preference |
| 15 | **Additional information** (custom fields) | Whatever the Form Builder added for the role | As configured |
| 16 | **Copy to** — email rows, "Add another email" | Everyone | Optional, **at most 25**; pre-filled with the council secretary's mailbox when a Faculty Advisor books |
| 17 | Pets notice ("Pets are not allowed…") | Everyone | Displayed only — the tick box was removed |
| 18 | **Privacy consent** tick | Everyone | **Yes** |
| — | Room availability panel (day / week / month, browsable) | Room bookings | Read-only |

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
| Student | Personal (not asked) | Room (Bageshri serves no meals) | Assistant Warden → GH Manager | Personal Funds | — |
| Employee — faculty, official | Official | Room, Room + Meals, Meals only | HOD → GH Manager (meals only: GH Manager) | Department, Project, PDF, Special Funds | Department, PDF, Personal, Special Funds |
| Employee — staff, official | Official | same | same | Department, Special Funds | Department, Special Funds |
| Employee — personal | Personal | same | GH Manager | Personal Funds, Special Funds | Personal Funds, Special Funds |
| Official — officer office | Official (not asked) | same | Direct → GH Manager, or its own head → GH Manager | Institute Grant, Special Funds | Institute Grant, Special Funds |
| Official — department office | Official (not asked) | same | Direct, or the parent department's HOD → GH Manager | Department, Special Funds | Department, Special Funds |
| Club (by its Faculty Advisor) | Official (not asked) | Room, Room + Meals | **GH Manager directly** | Department, Special Funds | — |
| IAR Office | Official / Alumni | Room, Room + Meals, Meals only | Direct, or its head → GH Manager | Official: its office class; Alumni: Institute Grant, Personal Funds, Special Funds | Official: its office class; Alumni: Personal Funds, Special Funds |
| IAR Student Cell | Alumni (not asked) | Room (Bageshri) | IAR Office → GH Manager | Institute Grant, Personal Funds, Special Funds | — |
| GH Manager at the desk | Official / Alumni | Room, Room + Meals, Meals only | GH Manager (its own queue) | Official: Department, Institute Grant, PDF, Personal, Project, Special Funds; Alumni: Institute Grant, Personal Funds, Special Funds | Official: the same less Project; Alumni: Personal Funds, Special Funds |

**Special Funds is offered to everyone except students** (25 Sep 2026).
**Floors under Settings** (`FORBIDDEN_DEBIT_HEADS`, cannot be ticked back on):
faculty never the Institute Grant; students never Special Funds. A student's
booking is always the *student* category, never *personal*.

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
| Alumni guest house (Bageshri) | `ALUMNI_GUEST_HOUSE_NAME` in `lib/policy.ts` — the one rule still matched on a guest house's name |
| Copy-to cap (25) | `MAX_COPY_TO_EMAILS` (`lib/booking-schema.ts`) and migration 24's check |
