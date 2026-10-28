# What data to request for each kind of user, and how to import it

**Written for the portal owner and the guest house office** — the person who
has to go back to the institute and say "send me *these* columns", and then
load what arrives.

This document answers three questions in order:

1. **What the database actually looks like**, in enough detail to understand
   why the columns are what they are (§1).
2. **Exactly which columns to request for each kind of user** — Student,
   Faculty, Non-teaching staff, Department Office (Data Science…), Officer
   Office (Director, Registrar), IAR Office, IAR Student Cell, Club / Council,
   Assistant Warden (§5 and §6). §6 is the copy-and-send version.
3. **How to import it**, in the order the portal needs it (§4, §7, §8).

Two companion documents already exist and are **not** replaced by this one:

| Document | What it is |
| --- | --- |
| [`IMPORTING-USERS.md`](IMPORTING-USERS.md) | The click-by-click runbook for the day of the import: what to press, the dry run, the verification list, every refusal message |
| [`.memories/04-production.md`](.memories/04-production.md) §1–§1a | The reference: the reasoning, the constraints, the security steps that must come first |

**This document is the data-request specification.** Where it and
`04-production.md` disagree, `04-production.md` is right and this one needs
fixing.

> **Measured against the live database on 27 October 2026.** Every column
> name, header line and row count below was read from the hosted Supabase
> project, not from notes. §3 is what is in it today.

---

## 0. The one-screen version

**The portal does not create accounts by itself.** A valid LDAP sign-in with no
row in `profiles` gets in nowhere. So every person who will use the portal has
to be loaded first.

The institute's data goes to **two different places**, and splitting it
correctly is the whole mapping question:

| | `profiles` | `academic_records` |
| --- | --- | --- |
| **What it is** | Who can sign in, and what they are allowed to do | Reference data shown back to the person on the booking form |
| **One row per** | person | (kind, email) |
| **Where you import it** | Console → Users & Roles → *Import from spreadsheet* | Console → Academic records |
| **Read by** | sign-in, every role check, every approval queue, every mail | the Requester details card, the warden's family check, the **locked parent names** on a student's form |
| **Readable by a browser?** | **Yes** — any signed-in session can read the directory | **No** — server-only, deliberately |
| **Undo?** | **Yes** (Recent imports → Undo) | **No** |

Because the second is server-only and the first is not:
**parents' names go only in `academic_records`. Nothing about a parent ever
goes in `profiles`.**

Three **reference lists** must exist *before* either import, because the
database refuses an unknown value rather than inventing it:

1. **Hostels** — Console → Settings → Hostels (developer)
2. **Units** — departments, offices, clubs, councils — Console → Departments &
   Clubs (manager or developer)
3. **The official whitelist** — Console → Settings (developer)

So the order of work is:

```
reference data  →  accounts (profiles)  →  academic records  →  appointments
   §4               §5, §7                   §5.10, §7            §8
```

---

## 1. The database structure, in one page

### 1.1 The five tables that matter for an import

```
       hostels                        units
    ┌──────────────┐          ┌────────────────────────┐
    │ name (PK)    │          │ id (PK)                │
    └──────┬───────┘          │ name          (unique) │
           │                  │ kind                   │
           │ FK               │ parent_id      ──┐     │
           │ on update cascade│ head_id          │self │
           │ on delete restrict│ acting_head_id  │ref  │
           │                  │ office_class   ──┘     │
           │                  │ hod_unit_id            │
           │                  │ faculty_advisor_id     │
           │                  │ secretary_email        │
           │                  └───────────┬────────────┘
           │                              │ FK (on delete restrict)
           ▼                              ▼
    ┌──────────────────────────────────────────────────┐
    │ profiles                                         │
    │  id, email (unique), full_name, role,            │  ← readable by any
    │  hostel_name, department_or_club, roll_number,   │    signed-in session
    │  ldap_uid (unique), unit_id, staff_category      │
    └──────────────────────────────────────────────────┘
           ▲                              ▲
           │ 19 foreign keys              │ matched by lower(email)
           │ (bookings, logs, invoices…)  │ — no database link
           │                   ┌──────────┴───────────────────────┐
    official_email_whitelist   │ academic_records                 │
    ┌──────────────┐           │  kind, email, + every kind's     │  ← server-only
    │ email (PK)   │           │  fields as nullable columns      │    (no browser
    └──────────────┘           │  unique on (kind, lower(email))  │     can read it)
                               └──────────────────────────────────┘
```

**`academic_records` is joined to `profiles` by email, not by a foreign key.**
That is deliberate: a record can be loaded before the account exists, or for
somebody who never signs in. It also means a **typo in the email means the
record is simply never found** — no error, just a form that asks the student to
type their parents' names.

### 1.2 `profiles` — the account table, column by column

Read from the live database. Ten columns; `id` is generated, so **nine are
importable**.

| Column | Type | Required | What it does |
| --- | --- | --- | --- |
| `id` | uuid | auto | Generated by the database. 19 foreign keys point at it, so it must never change — which is why an import **updates** by email instead of replacing |
| `email` | text, **unique** | **yes** | The match key. Lowercased for matching, stored as typed. Printed on every mail |
| `full_name` | text | **yes** | On every request, every queue, every invoice |
| `role` | enum | **yes** | What the person may do. §2 lists every value |
| `hostel_name` | text → `hostels(name)` | students | Sends a student's request to **that hostel's** Assistant Warden. Must already exist in `hostels` |
| `department_or_club` | text, free | no | Legacy free text. Used for reports and the retired Faculty Advisor role. **It does not route anything** |
| `roll_number` | text | no | Printed on the request. The office also uses it for an employee id |
| `ldap_uid` | text, unique on `lower()` | effectively yes | The institute LDAP username. **Without it the person cannot sign in** |
| `unit_id` | uuid → `units(id)` | faculty, staff, offices | **This is what finds their HOD.** Blank means their official booking reaches the desk with no HOD stage at all |
| `staff_category` | `faculty` \| `staff` | employees | Decides which budgets they may charge. Only meaningful for `employee`; forced to null for every other role |

### 1.3 `academic_records` — one table, six kinds

One table with every kind's fields as nullable columns, and a `kind` column
saying which ones mean anything. The six kinds and the role each serves:

| Role on the account | Academic record kind | Why that record exists |
| --- | --- | --- |
| `student` | `student` | **Locks the father's and mother's names** on the booking form, and exempts them from ID uploads |
| `employee` | `employee` | Shows the person their own department, employee id, office number |
| `official` | `office` | Shows the office its details, and names the **head** the request is copied to |
| `iar_cell` | `office` | Same record kind as any other office |
| `club` | `student_rep` | Names the faculty in charge |
| `iar_student_cell` | `alumni_office` | Department, email, phone |
| `warden` | `warden` | Name, phone, hostel |
| `gh_manager`, `gh_caretaker`, `developer` | **none** | The portal describes them; the institute's records do not |

**`academic_records.hostel` is free text**, unlike `profiles.hostel_name`: it is
the institute's own spelling and is display-only.

### 1.4 `units` — departments, offices, clubs and councils

This is the table that routes approvals, and it is the one most likely to be
got wrong, so it is worth reading twice.

A unit has four kinds — `department`, `office`, `club`, `council` — and:

| Field | Meaning |
| --- | --- |
| `name` | Unique. The import matches a unit by **name or id**, case-insensitively |
| `kind` | One of the four above |
| `parent_id` | The unit this one sits under — a department office's department, a club's council |
| `head_id` | The HOD (department), the Head (office), the student Secretary (club / council) |
| `acting_head_id` | Stands in while set. Both may approve |
| `office_class` | Offices only: `officer` (Director, Registrar, Deans) or `department` (a department's own office). **An office nobody classifies is treated as a department office** |
| `hod_unit_id` | Override: whose HOD approves this unit's requests, when it is not the obvious one |
| `faculty_advisor_id` | Clubs and councils only. The professor who **books for** the club |
| `secretary_email` | Clubs and councils only. The secretary's mailbox, pre-filled into Copy to |

**How the HOD is found** (`hodUnitIdFor` in [lib/units.ts](lib/units.ts#L178)):

- a **department** → its own head;
- an **officer office** → its own head;
- a **department office** → **its parent department's** head;
- a **club or council** → no HOD stage at all.

A unit with no head of its own takes its parent's, and so on up. If nobody
anywhere up the chain is set, the stage is **skipped** and the submission log
says so — the request is not stuck, it just reaches the desk unapproved.

> **This is the answer to "Department Offices [Director, Branch Department like
> Data Science]".** They are not one thing. Modelling them is §4.2.

### 1.5 `official_email_whitelist`

An account with the `official` role **also** has to be on this list, or the
booking form refuses it with *"This account is not whitelisted for official
bookings"* ([app/actions/bookings.ts:131](app/actions/bookings.ts#L131)). It is
a separate list on purpose: the role says what kind of account it is, the
whitelist says which ones the institute has actually authorised to book as a
dignitary's office.

Officials are also **exempt from the six-month booking window and the 14-night
stay cap**, which is the other reason the list is kept short and explicit.

### 1.6 Why there is not one table per kind of user

Asked and settled on 13 October 2026. The short answer: 19 foreign keys across
11 tables point at `profiles.id`, a portal role is an authorisation level that
changes rather than a category of person, and the per-category fields already
exist in `academic_records` behind a `kind` discriminant. **No schema change is
needed to hold the institute's data.** The full argument is
[`DATABASE-DESIGN.md`](DATABASE-DESIGN.md).

---

## 2. Every role, and the words the importer accepts

The `role` column may be the enum value or the label, in any case. These are the
only words accepted; anything else is refused **by name** on the plan.

| Enum value | Label | Also accepted | Use it for |
| --- | --- | --- | --- |
| `student` | Student | — | Every student, PhD included |
| `employee` | Employee (Faculty & Staff) | `faculty`, `staff`, `non-teaching staff` | Faculty **and** non-teaching staff. The `staff_category` column separates them |
| `official` | Official / Dignitary | — | Institute office mailboxes (Director, Registrar, department offices…) |
| `club` | Club / Fest Council | — | A club's or council's own shared mailbox. **It cannot book** — its Faculty Advisor books for it |
| `iar_cell` | IAR Office | — | The IAR Office mailbox. Books, **and** approves the Student Cell |
| `iar_student_cell` | IAR Student Cell | — | Books for alumni only, via the IAR Office |
| `warden` | Assistant Warden | — | Approves their hostel's students |
| `gh_manager` | Guest House Manager | — | The desk. **Create by hand, not from a sheet** |
| `gh_caretaker` | Guest House Caretaker | — | Reception. **Create by hand** |
| `developer` | Developer (Superadmin) | — | **Developer only** — a manager cannot import a developer into existence |
| `alumni` | Alumni (via IAR, legacy) | — | **Do not use.** Retired; kept only for stored bookings |
| `faculty_advisor` | Faculty Advisor | — | **Do not use.** Retired — a Faculty Advisor is now an *appointment* on a unit (§8), set on an ordinary faculty account |

Writing `faculty` or `staff` in the role column sets **both** the role
(`employee`) and the category, so a sheet that only has "Faculty / Staff" in one
column needs nothing else.

---

## 3. What is in the live database today (27 October 2026)

Measured, not remembered. This is the starting point the import lands on.

| Table | Rows | What that means |
| --- | --- | --- |
| `profiles` | **13** | All demo personas. **Every one has `ldap_uid` empty, `unit_id` empty, `staff_category` empty** |
| `units` | **0** | ⚠️ **No departments, offices, clubs or councils exist at all.** No HOD approval can route anywhere, and any `unit` value in an import would be refused |
| `hostels` | **2** | Saveri, Malhar only |
| `official_email_whitelist` | **3** | `admin@`, `director.office@`, `registrar@` |
| `academic_records` | **0** | No student's parents are locked; every Requester details card falls back to a sample or to the profile |
| `guest_houses` | 2 | Bageshri (10 rooms, no kitchen), Hamsanandi (13 rooms, serves meals) |
| `rooms` | 23 | Correct |
| `bookings` | 34 | Demo and test data |
| `user_import_batches` | 0 | **The table exists**, so the account import will run and will be undoable |

### 3.1 Four things to fix before the first real import

1. **`units` is empty.** This is the biggest gap. Until the departments and
   offices exist, a faculty member's official booking goes straight to the desk
   with no HOD stage, and the `unit` column cannot be imported at all. §4.2.
2. **Only two hostels exist.** Every hostel a student might be in has to be
   added first, spelled exactly as the sheet spells it. §4.1.
3. **The 13 demo accounts are still there**, with passwords published in this
   repository. Delete them once the real accounts are loaded — see
   [`.memories/05-credentials-and-security.md`](.memories/05-credentials-and-security.md).
4. **The seed on the hosted project is older than the code.** It still has
   `fa.petrichor@` as a `faculty_advisor` role, which the code retired. It does
   no harm, but do not treat those 13 rows as an example of how real accounts
   should look.

### 3.2 Migration status, as probed

`npm run check:migrations` confirms **1–30 and 32 are applied**. Five cannot be
probed over the REST API — PostgREST reads tables and columns but not
`pg_proc`, `pg_constraint`, `pg_policies`, `pg_trigger` or `pg_indexes`.

> **This differs from what `.memories` says.** The notes record 31–34 as
> deliberately not applied, re-verified on 14 October 2026. Migration 32's table
> now exists, so at least 32 has been applied since. **Run the four queries
> below in the Supabase SQL editor before importing** — do not assume either
> way, and update `.memories/04-production.md` §5 with the answer.

```sql
-- 17 and 23 (functions). Both names present means both are applied.
select proname from pg_proc
 where proname in ('set_booking_buffer','check_room_occupancy');

-- 31: profiles decoupled from auth.users, and the authenticated RLS surface closed.
-- BOTH counts must come back 0.
select (select count(*) from pg_constraint
         where conrelid='public.profiles'::regclass
           and contype='f' and confrelid='auth.users'::regclass) as auth_fk_expect_0,
       (select count(*) from pg_policies
         where 'authenticated' = any(roles)
           and schemaname in ('public','storage'))               as authenticated_policies_expect_0;

-- 33: total_rooms maintained by a trigger. Expect 1.
select count(*) as recount_trigger_expect_1 from pg_trigger
 where tgname = 'rooms_recount_total' and not tgisinternal;

-- 34: indexes on the foreign keys a delete has to check. Expect 20.
select count(*) as fk_indexes_expect_20 from pg_indexes
 where schemaname = 'public' and indexname like '%_idx';
```

**Migration 31 matters for the import specifically.** Without it, creating an
account fails two ways (`profiles.id` still requires a matching Supabase Auth
user), and the `authenticated` role still has 38 RLS policies behind it —
including the whole directory readable and the private `documents` bucket. The
full chain is `.memories/04-production.md` §1a.1, and **step 1 of it takes
thirty seconds**: Dashboard → Authentication → Providers → Email → **off**.

---

## 4. Step 1 — the reference data, before anything is pasted

Both of the first two are `on delete restrict` foreign keys, and the importer
**refuses an unknown name** rather than creating it. So a mismatch shows up as a
refusal, not as bad data. That is the good case.

### 4.1 Hostels — Console → Settings → Hostels (developer)

Add every hostel that appears in the student sheet, spelled **exactly** as the
sheet spells it. Renaming one later cascades to every student automatically
(`on update cascade`); deleting one that still has students is refused.

> **A student with a blank hostel is a meaningful choice, not missing data**
> (17 October 2026). A student whose `hostel_name` is NULL or blank has no
> Assistant Warden, so their request goes **straight to the Guest House
> Manager**, and the booking's log says why. That is how a **day scholar** is
> represented. So: fill the hostel for residents, and leave it blank for day
> scholars — do not invent a hostel for them.

### 4.2 Units — Console → Departments & Clubs (manager or developer)

**This is the step that is completely undone today, and it is the one that
decides whether HOD approval works at all.**

Take "Department Offices [Director, Branch Department like Data Science]" apart.
There are three different things in that phrase, and each is modelled
differently:

**(a) An academic department — "Data Science"**

```
name         : Data Science
kind         : department
parent_id    : (none)
head_id      : the HOD's profile          ← this is who approves
```

Its own head is its HOD. Create one per department. From the office's own
spreadsheet, the eleven are: Biological Sciences and Engineering, Chemistry,
Civil Engineering, Computer Science and Engineering, **Data Science**,
Electrical Engineering, Humanities and Social Sciences, Materials and
Metallurgical Engineering, Mathematics, Mechanical Engineering, Physics.

**(b) A department's own office — "Data Science Office"**

```
name         : Data Science Office
kind         : office
office_class : department            ← important
parent_id    : Data Science          ← important: this is where its HOD comes from
head_id      : (usually none)
```

A department office's official booking routes to **its parent department's**
HOD. If `parent_id` is left blank it falls back to its own head, and with no
head either, the request goes straight to the desk.

**(c) An officer office — "Director's Office", "Registrar's Office"**

```
name         : Director's Office
kind         : office
office_class : officer               ← important
parent_id    : (none)
head_id      : the Director's profile, or none
```

An officer office's HOD unit is **itself**. With a head set, the office is asked
on the form: *Direct* or *Requires HOD approval*. **With no head set, the
question is not asked at all** — the request enters at the desk, and the form
withholds the whole Approval card rather than showing an option that explains
itself with "nobody is set as HOD for your office yet".

**(d) Clubs and councils** — `kind: club` / `kind: council`, a club's
`parent_id` being its council. These also need `faculty_advisor_id` and
`secretary_email`, which **an import cannot set** (§8).

> ### ⚠️ The office mailbox name decides which budgets that office may charge
>
> This is easy to miss and expensive to get wrong. Which budgets an office can
> debit is narrowed **per mailbox**, keyed on the part of the address **before
> the `@`** ([lib/office-debit-heads.ts](lib/office-debit-heads.ts)) — the
> office's own spreadsheet of 9 October 2026, 34 rows:
>
> | Mailbox | Office | May charge |
> | --- | --- | --- |
> | `director_iitpkd` | Director Office | Institute Grant, Special Budget |
> | `ro`, `personnel`, `people`, `recruitment`, `office_deanadmn` | Administration | Institute Grant, Special Budget |
> | `office_ds` | **Data Science** | **Department Budget, Special Budget** |
> | `office_cs`, `office_ce`, `office_ee`, `office_ph`, … | the other department offices | Department Budget, Special Budget |
> | `office_studentssection` | Students Section | Special Budget, Student Fund, Hostel Funds |
> | `iar` | International & Alumni Relations | Special Budget, Alumni Fund |
> | `sportsofficer` | Sports & Physical Education | Institute Grant **only** |
> | `hostelmanager` | Hostel | Hostel Funds **only** |
> | `cce`, `tpo`, `placements`, `mo`, `security`, `cet`, `eduoutreach` | — | Special Budget only |
>
> **So the email addresses you request must be the institute's real office
> mailboxes.** If the sheet comes back with `datascience.office@iitpkd.ac.in`
> instead of `office_ds@iitpkd.ac.in`, the narrowing does not match and that
> office keeps the wider six-head list for its category. The fix is either the
> real mailbox, or adding the institute's spelling to that row's `aliases` in
> `lib/office-debit-heads.ts` — which is a code change, so it is much cheaper to
> ask for the right address now.
>
> **Ask the institute for the office's actual mailbox address, not a friendly
> name.** Project Grant and Personal Funds are on no office's row at all.

### 4.3 The official whitelist — Console → Settings (developer)

Every account you give the `official` role also goes on this list. Three are
there already (`admin@`, `director.office@`, `registrar@`).

---

## 5. What to request, per kind of user

Each subsection gives: **the accounts row** (one sheet, all users together) and
**the academic record** (one sheet per kind).

Conventions used by both importers:

- Separators: **comma, tab or semicolon.** A paste straight out of Excel works.
- Quoted fields are handled, so `"Physics, Applied"` is one value.
- Blank lines and lines starting `#` are skipped.
- These words all mean "we do not have it" and are read as blank:
  `-`, `--`, `n/a`, `na`, `nil`, `none`, `null`.
- **At most 2,000 rows per paste.** A longer list is refused with "split the
  list", never silently truncated.

> ### The one rule that differs between the two imports
>
> **Accounts sheet: a header line, any column order.** It may name the columns
> in whatever order the institute's sheet has them, and **only `email` is
> required**. The header must **start with the email column**.
>
> **Academic records: a fixed column order, no remapping.** The header line is
> *skipped* if present, but it is never read — the columns must be in the exact
> order below. Copy the header from the console, which prints the right one for
> the kind you have selected.

### 5.1 Student

**Accounts row** (`profiles`):

| Column | Fill it? | Value |
| --- | --- | --- |
| `email` | **required** | `112201001@smail.iitpkd.ac.in` — the student domain |
| `full_name` | **required** | |
| `role` | **required** | `student` |
| `hostel_name` | yes, if resident | Must be in `hostels`. **Blank = day scholar → straight to the manager** |
| `roll_number` | yes | Also the local part of the address |
| `ldap_uid` | **yes** | Usually the roll number. Without it they cannot sign in |
| `unit_id` | no | Students have no HOD stage |
| `department_or_club` | optional | Free text, reports only |
| `staff_category` | no | Forced to null |

**Academic record** — kind `student`. **This is the most important record in the
whole import.** Exact header:

```
email, roll_number, name, program, department, phone, father_name, mother_name, guardian_name, hostel
```

> #### ⚠️ An incomplete student record is worse than no record at all
>
> This is the single most important thing to get right in the whole data
> request, and it is not obvious. The rule
> ([lib/academic/guest-names.ts](lib/academic/guest-names.ts)):
>
> | What the record says | What the student's booking form does |
> | --- | --- |
> | **No record found at all** | Nothing locked, nothing withheld. The student types every guest's name freely — exactly as before this feature existed |
> | `father_name` **and** `mother_name` both filled | Father and Mother offered, names filled in and **read-only**. Neither is asked for an Aadhaar number or an ID document |
> | `father_name` filled, `mother_name` **blank** | Father locked. **"Mother" is not offered on the dropdown at all** — the student *cannot book for their mother* |
> | Both parents blank, `guardian_name` filled | Guardian offered and locked. Father and Mother both withheld |
> | Both parents blank, guardian blank too | Guardian offered, free text. Father and Mother withheld |
>
> A student who hits the third row gets *"Your academic record does not name a
> mother. Ask the guest house office to add it if it is missing."* — correct
> behaviour, and a support call for every such student.
>
> **So: either request both parents' names for every student, or accept that a
> partially filled column locks those students out of booking for the missing
> parent.** If the institute can only supply one parent reliably, it is better
> to supply **neither** and let the form stay open than to supply one.
>
> Note also that siblings and grandparents may only be booked **when a parent is
> on the same request** — and a Guardian counts as a parent for that rule. So a
> student with both parents blank and a guardian on record can still bring a
> sibling; a student with one parent withheld cannot bring a sibling unless the
> remaining parent comes too.

**What to request from the institute for students:**

| Ask for | Goes to | Notes |
| --- | --- | --- |
| Institute email | both sheets | The key for both |
| Roll number | both | |
| Full name | both | |
| Programme (B.Tech / M.Tech / PhD…) | academic | Display only |
| Department | academic | Display only; free text |
| Student's own phone | academic | |
| **Father's name** | academic | **Both or neither** — see the box above |
| **Mother's name** | academic | **Both or neither** |
| Guardian's name | academic | Only where the institute genuinely has no parent on file |
| Hostel | **both** | `profiles.hostel_name` must match the `hostels` list; `academic_records.hostel` is free text |
| LDAP username | accounts | If it is not the roll number, ask explicitly |

**Do not ask for** a parent's phone number — there is nowhere to put it and §9
explains why that matters.

### 5.2 Faculty

**Accounts row:**

| Column | Fill it? | Value |
| --- | --- | --- |
| `email` | **required** | `priya@iitpkd.ac.in` — the staff domain |
| `full_name` | **required** | |
| `role` | **required** | `faculty` (or `employee` with the category column) |
| `staff_category` | **yes** | `faculty`. **If blank, the person counts as faculty anyway** — the wider budget set |
| `unit_id` | **yes — this one matters** | The **department** unit, e.g. `Data Science`. This is what finds their HOD |
| `roll_number` | optional | The office uses it for the employee id |
| `ldap_uid` | **yes** | |
| `hostel_name` | no | |
| `department_or_club` | optional | Free text; `unit` is what routes |

A faculty member's **official** booking goes to their **HOD** and then the desk;
a **personal** booking goes straight to the desk. An HOD's own official booking
has no HOD stage — it skips it, logged, unless an acting head is set.

Faculty may charge every budget **except** Institute Grant, Alumni Fund, Student
Fund and Hostel Funds — a floor in code, not just a setting.

**Academic record** — kind `employee`:

```
email, employee_id, name, department, employee_type, phone, office_number
```

`employee_type` is free text — "Associate Professor", "Professor" — as the
institute words it.

### 5.3 Non-teaching staff

Identical to faculty except:

- `role`: `staff` (or `non-teaching staff`)
- `staff_category`: **`staff`** — and here it is worth being explicit, because a
  blank reads as *faculty* and hands the person a wider budget list than they
  should have.
- Non-teaching staff may charge **Personal Funds only**.

Same `employee` academic record kind.

### 5.4 Department Office — "Data Science", "Computer Science and Engineering"…

The account is the **office mailbox**, not a person.

| Column | Fill it? | Value |
| --- | --- | --- |
| `email` | **required** | **The institute's real office mailbox** — `office_ds@iitpkd.ac.in`. See the box in §4.2: this decides the budgets |
| `full_name` | **required** | "Data Science Office" |
| `role` | **required** | `official` |
| `unit_id` | **yes** | The **office** unit (`Data Science Office`), whose `parent_id` is the department. Not the department itself |
| `ldap_uid` | **yes** | Whatever the directory calls the shared mailbox |
| `department_or_club` | optional | "Data Science" |
| `hostel_name`, `roll_number`, `staff_category` | no | |

**Also add the address to the official whitelist** (§4.3), or the account cannot
book at all.

**Academic record** — kind `office`:

```
email, department, phone, head_name, head_email
```

`head_name` / `head_email` are the office's own "Copy to": the Departments &
Clubs console is consulted first, and this record is the fallback.

### 5.5 Officer Office — Director, Registrar, Deans

Same as §5.4 with two differences:

- The unit is `kind: office`, **`office_class: officer`**, no parent.
- Set `head_id` on the unit to the officer's own profile **if** you want the
  office to be asked *Direct* vs *Requires HOD approval*. Leave it unset and the
  request simply enters at the desk — which, for the Director's Office, is what
  the institute actually wanted.

Mailboxes: `director_iitpkd`, `ro`, `office_deanadmn`, `personnel`, `people`,
`recruitment`. Academic record kind `office`, same header.

### 5.6 IAR Office

| Column | Value |
| --- | --- |
| `email` | `iar@iitpkd.ac.in` — the mailbox `iar` narrows it to Special Budget + Alumni Fund |
| `full_name` | "IAR Office" |
| `role` | **`iar_cell`** — not `official` |
| `unit_id` | An `office` unit, "International & Alumni Relations" |
| `ldap_uid` | yes |

The IAR Office is both a requester **and an approver** — it approves the IAR
Student Cell's alumni bookings. It never waits at `PENDING_IAR` for its own
requests, because it *is* that approver.

**Academic record** — kind **`office`** (not a kind of its own):

```
email, department, phone, head_name, head_email
```

### 5.7 IAR Student Cell

| Column | Value |
| --- | --- |
| `email` | `alumnicell@iitpkd.ac.in` |
| `full_name` | "IAR Student Cell" |
| `role` | **`iar_student_cell`** |
| `unit_id` | the same IAR office unit, or blank |
| `ldap_uid` | yes |

It books **for an alumnus only** — which requires the alumnus's name, roll
number and Alumni ID card upload on the form — and routes **IAR Office → Guest
House Manager**. May charge Alumni Fund and Special Budget.

**Academic record** — kind `alumni_office`:

```
email, department, phone
```

> **Alumni have no login and never will.** There is no alumnus account and no
> alumnus sheet. An alumni booking is made *about* an alumnus by the IAR Office
> or the Student Cell, and their name and roll number are typed on the form.

### 5.8 Club, Fest or Council

| Column | Value |
| --- | --- |
| `email` | The club's shared mailbox — `petrichor@iitpkd.ac.in`, `sec_arts@iitpkd.ac.in` |
| `full_name` | "Petrichor Fest Council" |
| `role` | `club` |
| `unit_id` | The `club` or `council` unit |
| `department_or_club` | optional, free text |

> **A club's own account cannot submit a booking.** Its **Faculty Advisor**
> books for it from their own faculty login, and the request goes straight to
> the Guest House Manager — nobody forwards it. The club sees the booking and
> gets the mail. So a club account with no Faculty Advisor named on its unit
> **cannot book at all**. Naming the advisor is §8, and an import cannot do it.

Note that club mailboxes sit on the **staff domain** (`trc@`, `yacc@`,
`vadya@`, `shutterbug@`…), so you cannot infer a club from the address.

**Academic record** — kind `student_rep`:

```
email, representative_type, phone, faculty_in_charge_email
```

### 5.9 Assistant Warden

| Column | Value |
| --- | --- |
| `email` | `warden.malhar@iitpkd.ac.in` or the person's own institute address |
| `full_name` | |
| `role` | `warden` |
| `hostel_name` | **required in practice** — this is the scope. A warden sees **only** their own hostel's students |
| `ldap_uid` | yes |

One warden account per hostel. If a hostel has no warden, its students'
requests skip the stage and reach the desk.

**Academic record** — kind `warden`:

```
email, name, phone, hostel
```

### 5.10 The accounts the office must create by hand

Not from a sheet:

- **Guest House Manager** and **Guest House Caretaker** — they are the guest
  house, not people. Staff in those posts book their own family from their
  ordinary institute accounts.
- **At least one developer**, with two-factor set up (Console → Security)
  **before** the demo developer is deleted. Deleting the last developer locks
  the console's own sections.

---

## 6. The consolidated request — what to send the institute

Copy this. One sheet per block; one row per person.

### Sheet 1 — Students

```
email, roll_number, full_name, programme, department, phone, father_name, mother_name, guardian_name, hostel, ldap_username
```

- `father_name` and `mother_name`: **both, for every student, or neither.** A
  column filled for some students and blank for others locks those students out
  of booking for the missing parent (§5.1).
- `hostel`: blank means day scholar. Send the exact spellings used, so they can
  be added to the portal's hostel list first.
- `ldap_username`: only if it is **not** the roll number.

### Sheet 2 — Faculty and non-teaching staff

```
email, employee_id, full_name, department, faculty_or_staff, designation, phone, office_number, ldap_username
```

- `faculty_or_staff`: the words `faculty` or `staff`. **This decides which
  budgets they may charge**, so it cannot be blank.
- `department`: must match a department created in the portal, spelled
  identically.
- `designation` becomes `employee_type` — free text.

### Sheet 3 — Institute offices (including department offices and IAR)

```
office_mailbox_email, office_name, office_class, parent_department, phone, head_name, head_email, ldap_username
```

- `office_mailbox_email`: **the real institute mailbox**, not a friendly
  address. `office_ds@iitpkd.ac.in`, not `datascience.office@…`. This decides
  the budgets (§4.2).
- `office_class`: `officer` for Director / Registrar / Deans, `department` for a
  department's own office.
- `parent_department`: for a department office only — the department whose HOD
  approves its bookings.

### Sheet 4 — Clubs, fests and councils

```
club_mailbox_email, club_name, club_or_council, parent_council, faculty_advisor_email, secretary_mailbox
```

- `faculty_advisor_email` and `secretary_mailbox` are **appointments set by
  hand** (§8), not imported — but ask for them in the same sheet so they are
  all in one place.

### Sheet 5 — Hostels and wardens

```
hostel_name, warden_email, warden_full_name, warden_phone, ldap_username
```

Needed before the student sheet can be imported, because the hostel list has to
exist first.

### And ask these questions alongside the sheets

1. **What is the LDAP username format?** Roll number for students, mailbox name
   for staff, or something else? The portal accepts letters, digits and
   `. _ - + @`, no spaces. **Without a username a person cannot sign in**, and
   nothing else about the account shows it.
2. **Is there a header row, and are the spellings stable?** The importer reads a
   header and maps it, but an unrecognised header is read as *data*, and the
   first error you see is then *"line 1: Name is not an email address"*.
3. **Which office mailboxes are real and in use?** The budget narrowing is keyed
   on them (§4.2).
4. **For each department: who is the HOD right now?** An import cannot set this;
   it is a field on the unit (§8).
5. **For each club and council: who is the Faculty Advisor, and what is the
   secretary's mailbox?** A club with no advisor cannot book at all.

---

## 7. Step 2 — the import procedure

The click-by-click version with every refusal message is
[`IMPORTING-USERS.md`](IMPORTING-USERS.md). This is the shape of it.

1. **Take a backup.** `supabase db dump`. The account import has an undo; the
   academic import does not.
2. **Check the migrations** — §3.2. 31 and 32 must be in.
3. **Create the reference data** — hostels, units, whitelist (§4). Nothing else
   works until this is done.
4. **Dry-run against the mock database first.** This touches no real data and is
   the cheapest way to find a bad column:
   ```bash
   export NVM_DIR="$HOME/.nvm" && . "$NVM_DIR/nvm.sh" && nvm use 20
   NEXT_PUBLIC_SUPABASE_URL= npm run dev     # empty value selects the local JSON store
   ```
   Import there, read the plan, then delete the `.local-db.json` it created.
5. **Paste five rows first** on the real deployment and read the plan. It prints
   *"Read as … (from your header line)"* — that line is the check that your
   header was understood.
6. **Users & Roles → Import from spreadsheet** → paste → **Check the paste** →
   read the plan → **Import**. All or nothing: one bad line and nothing is
   written.
7. **Then the academic records**, students first. Console → Academic records,
   one kind at a time, matching the fixed column order.
8. **Then the appointments** (§8), which no import can make.

### What the plan tells you, and what to look at

- **`added` / `updated` / `unchanged`** — if you expected 600 added and see 600
  updated, you are importing over existing accounts. Stop and look.
- **The columns it read**, in order, and whether it recognised your header.
- **Every problem, line by line.** Any problem at all means **nothing** is
  written.

### Running it twice is safe and expected

A person already on the list is **updated**, matched on `lower(email)`, so their
`id` never changes and all 19 foreign keys survive. **A column the paste does
not carry is left alone**, never cleared — a sheet of email and name will not
wipe everyone's hostel. Re-pasting a sheet that is already loaded should report
everything `unchanged`, which is the idempotency check worth running.

### Undo

Every account import writes an undo record **before** it touches anything
(migration 32): Console → Users & Roles → **Recent imports → Undo**. Three
limits worth knowing:

- An account **changed since the import is left alone and named**. The undo
  takes back what that import did; it does not roll the directory back to a
  date.
- Only the **eight fields an import may write** are restored.
- **There is no undo for academic records.** Re-import a corrected sheet
  instead — it updates in place.

### Batch size

`MAX_USER_IMPORT_ROWS` is **2,000** per paste, and the institute is larger than
that. Split the file. Accounts are written 250 per insert.

---

## 8. Step 3 — the appointments an import cannot make

These are fields on a **unit**, not on a person, and they have to be set by hand
in Console → Departments & Clubs. Every one of them is audited.

| Appointment | Where | What breaks without it |
| --- | --- | --- |
| **Department head (HOD)** | `units.head_id` on the department | Faculty official bookings skip the HOD stage and reach the desk unapproved |
| **Acting head** | `units.acting_head_id` | An HOD's own booking has no approver |
| **Office head** | `units.head_id` on an officer office | The office is never asked *Direct* vs *Requires HOD approval* — it just goes to the desk |
| **Faculty Advisor** | `units.faculty_advisor_id` on a club or council | **The club cannot book at all** |
| **Secretary's mailbox** | `units.secretary_email` | Copy to is not pre-filled on the advisor's bookings |
| **Warden's hostel** | `profiles.hostel_name` — importable | The warden's queue is empty |
| **Official whitelist** | Console → Settings | An `official` account cannot book |

Any professor can be named a Faculty Advisor — an `employee` who is not
non-teaching `staff`. The advisor then gets *"Booking as: Yourself / Faculty
Advisor — X"* on the booking page.

---

## 9. What **not** to request

Ask for less than the institute is willing to send. The portal has nowhere to
put any of this and asks for none of it:

date of birth · category · blood group · permanent or correspondence address ·
admission year · fees · CGPA or marks · photographs · Aadhaar numbers · bank
details · **parents' phone numbers**

**Parents' phone numbers in particular are not in the student field list** —
only the student's own `phone` and the parents' *names*. They are dropped, not
stored "in case".

**Delete these columns before the file is copied anywhere**, including off the
laptop it was downloaded onto. A column with no field in the portal is a column
that becomes a liability at the first subject-access request under the DPDP Act,
2023 — and the portal's own retention job can only erase what it knows about.

---

## 10. Step 4 — verify

Six checks, in this order:

1. **Re-paste the accounts sheet.** Everything should read `unchanged`.
2. **Recent imports** shows the batch as `applied`, not `applying`. A batch
   stuck on `applying` is an import that did not finish — undo it and import in
   smaller pieces.
3. **One real LDAP sign-in**, by somebody who was imported.
4. **One student's booking form**: are the parents' names filled in and
   read-only? If the boxes are empty and editable, the academic record was not
   found — check the email matches exactly.
5. **One faculty member's official booking**: does it show an HOD stage, and is
   the HOD the right person? If there is no stage, `unit_id` is blank or the
   unit has no head.
6. **One department office's booking**: are the debitable heads the two from
   §4.2's table, and not six? If six, the mailbox did not match.

---

## 11. Quick reference — every header line in one place

**Accounts** (`profiles`) — any order, header required if not this order, only
`email` mandatory:

```
email, full_name, role, hostel_name, department_or_club, roll_number, ldap_uid
```

Also accepted in a header: `staff_category`, `unit`. Aliases per column are in
`KNOWN_COLUMNS`, [lib/users-import.ts](lib/users-import.ts#L64) — `name`,
`hostel`, `dept`, `club`, `roll no`, `employee id`, `ldap username`, `uid`,
`category`, `unit name`, and more.

**Academic records** — **fixed order**, one sheet per kind:

| Kind | Header line |
| --- | --- |
| `student` | `email, roll_number, name, program, department, phone, father_name, mother_name, guardian_name, hostel` |
| `employee` | `email, employee_id, name, department, employee_type, phone, office_number` |
| `office` | `email, department, phone, head_name, head_email` |
| `student_rep` | `email, representative_type, phone, faculty_in_charge_email` |
| `alumni_office` | `email, department, phone` |
| `warden` | `email, name, phone, hostel` |

The console prints the exact header for the kind you have selected — copy it
from there rather than from this table, which is a summary.

---

## 12. Troubleshooting

| Message | What it means |
| --- | --- |
| *Line 1: "Name" is not an email address* | Your header line was not recognised, so it was read as data. Check the spellings, and that the header starts with the email column |
| *"X" is not a hostel on record* | Add it at Settings → Hostels, or fix the spelling in the sheet |
| *"X" is not a department, club or office on record* | Add the unit at Departments & Clubs, or fix the spelling. **Today `units` is empty, so every value fails** |
| *"X" is not a role this console can assign* | Unrecognised role word (§2), or a manager trying to import a developer |
| *… is also given on line N* | The same email appears twice in one paste |
| *LDAP username X already belongs to Y* | That username is held by somebody not in this paste |
| *LDAP username X is given to more than one person in this paste* | Two lines claim the same username |
| *a second header line* | Two sheets were pasted together. Import one list at a time |
| *N columns, but M were expected* | Add a header line (accounts), or match the fixed order (academic records) |
| *More than 2000 rows in one paste* | Split the list |
| *Cannot create an account until migration 31 is applied* | §3.2 |
| *Cannot import accounts until migration 32 is applied* | §3.2 — this one is already applied |
| *This user has bookings — delete or reassign those first* | On a delete or an undo: that account has a real booking, so it is kept and named back |
| *Your academic record does not name a mother* | The student's record has one parent and not the other. §5.1 |
| *This account is not whitelisted for official bookings* | Add the address at Settings → Official email whitelist (§4.3) |
| *Enter your authenticator code to confirm this change* | A **developer** must have proved their second factor in the last 10 minutes. A manager is behind the console password only |

---

## 13. The short version

1. Run the four SQL queries in §3.2. Turn the email/password provider **off**.
2. Backup: `supabase db dump`.
3. **Create the units** — 11 departments, their offices, the officer offices,
   the clubs and councils. `units` is empty today and nothing routes without it.
4. Add every hostel. Add the office addresses to the whitelist.
5. Request the five sheets in §6. Insist on **both parents' names or neither**,
   and on **real office mailbox addresses**.
6. Delete every column on §9's drop list before the file goes anywhere.
7. Dry-run on the mock store. Paste five rows on production and read the plan.
8. Accounts first, in batches under 2,000. Then academic records, students
   first — **no undo there**.
9. Set the appointments by hand: HODs, acting heads, Faculty Advisors,
   secretary mailboxes.
10. Work the six checks in §10. Then delete the 13 demo accounts.
