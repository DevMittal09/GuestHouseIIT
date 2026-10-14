# Importing the institute's users

How to load IIT Palakkad's students, faculty, staff and offices into the guest
house portal, in the order that works.

**This file is the procedure.** The reasoning behind it, and every decision
that shaped it, is in [`.memories/04-production.md`](.memories/04-production.md) §1a - that file stays the
technical reference, this one is what you follow with the spreadsheet open. If
the two ever disagree, §1a is right and this file needs fixing.

---

## 0. The one thing to understand first

**An import does not only add people. It updates whoever it already finds.**

Both importers match on the **email address, lowercased**. A line for somebody
who already has an account **changes that account** rather than creating a
second one. That is deliberate and it is what makes the import safe to run
twice - but it is also the thing that can go wrong:

> Re-importing a sheet that is a month out of date silently overwrites every
> correction the office has made by hand since.

The fields it overwrites are not cosmetic. `hostel_name` is what an Assistant
Warden's approval queue is scoped to; `unit` is how an employee's HOD is found;
`role` is the authorisation level itself.

So the single most important habit in this whole document:

**Before pressing Import, read the plan's "updated" count. On a first load it
should be 0.** Anything else means the sheet is changing accounts that already
exist, and you should know why before you continue.

Since 14 Oct 2026 an account import can be **undone** (§10). An academic
records import **cannot** - for that, the dry run and the backup are the
protection.

---

## 1. Who does what

| Console section | Who can open it |
| --- | --- |
| **Settings** (hostels, official whitelist) | **Developer only** |
| Departments & Clubs (units) | Guest House Manager, Developer |
| Users & Roles (the account import) | Guest House Manager, Developer |
| Academic records | Guest House Manager, Developer |

This matters for sequencing: **the developer has to go first.** Hostels and the
official whitelist live in Settings, which the manager cannot open, and the
account import *refuses* a hostel that is not on the list. So the developer
sets up the reference data, then the manager can import people.

Everything in the console additionally needs:

- the **console password** (default `0000` - change it at Console Access before
  go-live), and
- a **TOTP second factor**, re-proved within the last 10 minutes. The import
  and the undo both require it.

---

## 2. Before you start

Work this list once. Do not start the import until every line is true.

### 2.1 The database must be ready

```bash
npm run check:migrations
```

This asks the project read-only and names anything missing. You need **at least
migrations 31 and 32**, and neither is optional:

| Migration | Without it |
| --- | --- |
| **31** | Creating any account **fails outright**. `profiles.id` still demands a Supabase Auth user, and the code no longer makes one |
| **32** | The import **refuses to run**. It writes its undo record before it writes anybody, and will not import with no way back |
| 33, 34 | Optional. 34 is what makes a large undo finish in time - see §10 |

`check:migrations` cannot probe 31, 33 or 34 (they add no table or column); it
prints the SQL to paste in the Supabase SQL editor instead. Expected: 31's two
counts come back **0**, 33's count **1**, 34's count **20**.

### 2.2 The security steps must be done

In this order, from [`.memories/04-production.md`](.memories/04-production.md) §1a.1:

1. **Disable the email/password provider** - Supabase Dashboard →
   Authentication → Providers → Email → off. As of 14 Oct 2026 this is **on**,
   with signup open, which means anyone can obtain a database session without
   going near the portal. The portal does not use this provider.
2. **Apply migrations 31, 32** (then 33, 34).
3. **Run [`supabase/repairs/2026-10-13-retire-seeded-auth-users.sql`](supabase/repairs/2026-10-13-retire-seeded-auth-users.sql)** - it
   deletes the leftover Supabase Auth credentials. It refuses to run before
   migration 31.

> **Do not run [`supabase/repairs/2026-10-13-rollback-migration-31.sql`](supabase/repairs/2026-10-13-rollback-migration-31.sql).**
> Despite sharing a date with the one above, it is migration 31's *undo* and
> would reopen the hole. See the When column in [`.memories/21-database.md`](.memories/21-database.md).

### 2.3 Take a backup

```bash
supabase db dump -f guesthouse-before-import-$(date +%F).sql
```

The drill is in [`.memories/04-production.md`](.memories/04-production.md) under "Backup and restore". This
is a full `pg_dump` and **does** include `profiles`, which is what an import
needs to be undoable from outside the app.

> Two files that are **not** backups: `my-guest-house-data-<date>.json` (that
> is one person's own DPDP data export) and the ad-hoc
> `guesthouse-supabase-backup-2026-09-23.json` kept outside the repo, which
> holds no `profiles` at all. Restoring either would not bring an account back.

---

## 3. Step 1 - set up the reference data

**Do this before importing anybody.** The importer refuses an unknown hostel or
unit rather than inventing one, so a missing value here shows up as a refused
paste, not as bad data. Both are `on delete restrict` foreign keys.

### 3.1 Hostels (developer, Settings)

Console → **Settings** → Hostels. Add every hostel exactly as the institute's
sheet spells it - "Malhar", "Saveri", and so on. `profiles.hostel_name` must
name one of these.

Needed for: **students**. It is what scopes an Assistant Warden's queue.

### 3.2 Departments, offices, clubs and councils (manager or developer)

Console → **Departments & Clubs**. Create a unit for every department, officer
office, department office, council and club that will appear in the sheet.

Needed for: **everybody whose approval goes through an HOD**. The `unit` column
is what finds a person's HOD.

> **This is the mistake that will not announce itself.** A sheet that fills
> `department_or_club` (free text, legacy) and leaves `unit` blank imports
> perfectly cleanly - and produces employees whose official bookings arrive at
> the desk **with no HOD approval stage at all**, because there is no unit to
> find a head on. Nothing on screen says so. Fill `unit`.

The importer matches a unit by **name or id, ignoring case**.

### 3.3 The official whitelist (developer, Settings)

Console → **Settings** → "Official / Dignitary whitelist". Add the mailboxes
allowed to submit Official / Dignitary bookings.

Needed for: **office accounts**. An account with the `official` role whose
address is not whitelisted cannot submit an official booking.

---

## 4. Step 2 - prepare the spreadsheets

### 4.1 The sheet feeds two different places

This is the whole mapping question, and getting it wrong is the main risk:

| | `profiles` (Users & Roles) | `academic_records` (Academic records) |
| --- | --- | --- |
| Holds | identity and **authorisation** | per-category **reference data** |
| One row per | person | (kind, email) |
| Read by | sign-in, every role check, every queue, every mail | the Requester details card, the warden's family check, the booking form's locked parent names |
| Can a browser reach it? | it is the directory - treat it as visible | **no** - service-role only, deliberately |

**Because the second is service-role-only and the first is not, parents' names
belong only in `academic_records`.** Nothing about a parent goes in `profiles`.

So split the institute's file into **one sheet per destination**:

- one sheet for the accounts, and
- one sheet per academic **kind**: `student`, `employee`, `office`,
  `student_rep`, `alumni_office`, `warden`.

### 4.2 Delete the columns the portal has no use for

**Do this before the file is copied anywhere** - including off the laptop it
was downloaded onto.

A college sheet usually carries date of birth, category, blood group, permanent
address, admission year, fee or CGPA columns, photographs, Aadhaar numbers,
bank details and **parents' phone numbers**. The portal has nowhere to put any
of them and asks for none.

Parents' *phone numbers* in particular are **not** on the student field list -
only the student's own `phone` and the parents' *names*. Drop them; do not
store them "in case". A column with no field is a column that becomes a
liability at the first subject-access request.

### 4.3 The header line - and the one rule that differs between the two imports

This catches people out, so read it carefully. **The two importers treat the
header differently.**

**Accounts (Users & Roles): the header names the columns, in any order.**

Put a header line on the sheet. It may name the columns in whatever order the
office's own file has them, and only `email` is required. Recognised spellings
are in `KNOWN_COLUMNS` ([`lib/users-import.ts`](lib/users-import.ts)) - for example `email`,
`email address`, `institute email`, `mail` all mean the email column.

Two constraints:

- the header must **start with the email column**, and
- **every** other cell must be a recognised name.

With no header at all, the paste is read in this fixed order:
`email, full_name, role, hostel_name, department_or_club, roll_number, ldap_uid`.

> **What a bad header looks like.** An unrecognised header line is read as
> **data**, so the first thing you see is *"Line 1: 'Name' is not an email
> address"*. If the first paste says that, the header is the problem, not the
> data.

**Academic records: the column order is fixed and the header is ignored.**

Each kind has a fixed column order, starting with `email`. The console shows
the exact header to copy. A line whose first cell is literally `email` is
skipped, so you may paste the header along with the data - but you **cannot
reorder the columns**. Rearrange the sheet to match.

A **short line is fine**: it is read as "the rest is not on record" rather than
refused. Real records have gaps.

### 4.4 Row limits

Both importers cap one paste at **2000 rows**. The institute is larger, so the
file has to be pasted in parts. See §6.2 on how big a part should be.

---

## 5. Step 3 - dry run against the mock database

**Do this first, every time.** It touches no real data and is the cheapest way
to find a bad column.

```bash
# An empty value here beats .env.local and selects the local JSON store.
NEXT_PUBLIC_SUPABASE_URL= npm run dev
```

Open http://localhost:3000, sign in as a demo persona (the dummy LDAP accounts
are listed in [`.memories/05-credentials-and-security.md`](.memories/05-credentials-and-security.md)), and run the import
there. Read the plan. Fix the sheet. Repeat until the plan reads the way you
expect.

Then clean up:

```bash
rm -f .local-db.json     # only if there was no local database before
```

> Note that the mock database has its own hostels and units (the demo ones), so
> a hostel the real deployment has may be refused here and vice versa. The dry
> run is for catching **column** problems, not for proving the reference data.

---

## 6. Step 4 - import the accounts

Console → **Users & Roles** → **Import from spreadsheet**.

1. **Paste** the columns straight out of Excel, header line first.
2. Press **Check the paste**. Nothing is written yet.
3. **Read the plan.** It tells you:
   - `412 added, 3 updated, 0 unchanged`
   - which columns it read, and whether that came from your header line
   - a line per changed account, naming what changes about each
4. If any line is wrong, **nothing is imported** - fix the sheet and go back to
   step 1. The plan is all-or-nothing on validation.
5. Press **Import**.

### 6.1 What to check on the plan before pressing Import

- **"updated" should be 0 on a first load.** If it is not, the sheet is
  changing accounts that already exist. Read the per-account lines and satisfy
  yourself that is intended.
- **The column list** should match what you think you pasted.
- **The role words.** `faculty`, `staff` and `non-teaching staff` all map to the
  `employee` role; the `staff_category` column (or the role word itself)
  decides which. Anything unrecognised is refused by name.
- **Nobody should arrive as a developer.** A manager cannot import a developer
  into existence - that is enforced in the action, not just the UI - but
  confirm anyway.

### 6.2 How big a batch

The **inserts** are fast: they go in chunks of 250 per request, so a first load
of a few hundred new people is a handful of round trips.

The **updates** are not: each account is one request, because each row has
different values. A sheet that mostly *changes* existing people can still hit
the platform's request timeout at around 2000 rows.

So:

- a sheet of **new** people: paste up to the 2000-row cap freely;
- a sheet with **many updates**: paste 200-500 at a time.

### 6.3 If it stops part-way

You will see: *"The import stopped part-way - ... It is on record under Recent
imports and can be undone from there."*

That is the safety net working. The import wrote down what it was about to do
**before** it did it, so:

1. go to **Recent imports** (it will read "Stopped part-way"),
2. **Undo** it (§10),
3. re-import in smaller pieces.

A batch reading **"Did not finish"** means the process died without even
reaching the error handler. It is undoable the same way.

### 6.4 LDAP usernames

**Without an `ldap_uid`, an imported person cannot sign in.** Everything else
about the account is correct and they are simply locked out, with nothing on
screen saying why.

If the institute's sheet has a username column, include it. If not, the
accounts still import fine, and you load the usernames afterwards:

Console → Users & Roles → **Import LDAP usernames** - a two-column paste of
`email, ldap username` lines onto accounts that already exist.

Usernames are unique, compared lowercased. One paste may **move** a username
from one person to another (a swap, or a correction); giving two people the same
one is refused and names both.

---

## 7. Step 5 - import the academic records

Console → **Academic records**.

Do this **after** the accounts, and do **students first** - they are the records
the booking form actually depends on.

1. Pick the **kind**.
2. Copy the header the console shows, and make your sheet match that column
   order (§4.3).
3. **Paste** → **Check the paste** → read the plan → **Import**. All or nothing,
   the same as the accounts.

### 7.1 Why the student records matter more than they look

A student's **Father and Mother on the booking form come from their academic
record, and are locked to it**:

- a parent the record names is offered and **cannot be edited**;
- a parent it does **not** name is **not offered at all** - there would be no
  name to lock it to;
- Guardian is offered only where the record names neither parent;
- no record at all means nothing is locked or withheld.

A guest the record named is also asked for **neither an Aadhaar nor an ID
document**.

So a wrong `father_name` is not a cosmetic error: it is a name the student
cannot correct, on their own booking. And a missing parent means that student
**cannot bring that parent at all**.

The Assistant Warden also sees each student's record beside their request, with
every Father / Mother / Guardian on the request checked against it.

### 7.2 There is no undo here

The account import can be undone. **The academic records import cannot.** What
the console offers instead is remove-one, clear-a-kind and clear-everything,
each behind a typed confirmation.

So for this import, the protection is the **dry run** (§5) and the **backup**
(§2.3). Do not skip either.

### 7.3 Records are cached for 10 minutes

The portal caches academic lookups for 10 minutes, and the cache is cleared on
every import, delete and clear. If you edit a record outside the console and it
reads back as the old one, that is why.

---

## 8. Step 6 - the appointments an import cannot make

An import loads **people**. It cannot make any of the following, and the portal
does not work properly until they are set by hand:

| What | Where | Why it matters |
| --- | --- | --- |
| **Head of each unit** (and acting head) | Departments & Clubs | This is who an HOD approval goes to. An HOD is an **appointment**, not a role - there is no "HOD" to import |
| **Faculty Advisor** of each council and club | Departments & Clubs → Faculty Advisors | A club's own account **cannot book**; its Faculty Advisor books for it |
| **Secretary mailbox** of each council and club | Departments & Clubs | Pre-filled as Copy-to on an advisor's bookings |
| **Assistant Wardens** | Users & Roles (role) + their hostel | The warden role plus `hostel_name` is what scopes their queue |
| **Official whitelist** | Settings | §3.3 |

An office with **no head set** is never asked the "Requires HOD approval"
question at all - both answers would reach the same place - so a missing head
shows up as a form that is quietly simpler, not as an error.

---

## 9. Step 7 - verify

Work this list after each import.

1. **Re-paste the same sheet.** Everything should come back **unchanged**
   (`0 added, 0 updated, N unchanged`). That is the idempotency check, and it is
   free. It proves the batch landed and that a re-run is harmless.
2. **Open Recent imports.** The batch should read **applied** with the counts
   the plan showed. `applying` or `failed` means it did not finish - undo it and
   import again in smaller pieces.
3. **`npm run check:migrations`** - nothing newly missing.
4. **Sign one imported person in by LDAP**, end to end. Check they land on the
   right page with the right menu.
5. **Open `/book` as an imported student.** The Requester details card should
   show their own record, and **Father / Mother should be locked** to the
   academic record's names.
6. **Check one imported employee's official booking finds an HOD.** If `unit`
   was left blank there is no HOD and the request routes straight to the desk -
   §3.2.
7. **Spot-check that nobody arrived as `developer`.**

---

## 10. If it goes wrong - undoing an account import

Console → **Users & Roles** → **Recent imports**. The ten newest imports are
listed with who ran them, what they did, and their status. Press **Undo** and
type `UNDO`.

An undo:

- **puts back the previous values** of every account the import changed, from
  the record written before the import ran;
- **deletes the accounts it created**, naming back anyone it cannot remove - the
  store refuses an account that has a booking, because a booking made on an
  imported account is real;
- **leaves alone, and names, any account changed since the import.** The undo
  takes back what *that import* did; it does not roll the directory back to a
  date. If somebody has corrected an account by hand since, reverting it would
  throw the newer value away.

It is **partial by design**: whatever it could not undo is reported, and the
rest still is. It needs the console password and a fresh TOTP step-up, and it is
audited.

Two limits worth knowing before you rely on it:

- **An undo cannot always restore an LDAP username.** If two accounts swapped
  usernames in one import and one has since been corrected by hand, the other
  cannot have its old username back - the corrected account still holds it, and
  usernames are unique. That row is **named and skipped whole** rather than left
  with no username at all.
- **A second undo is refused.** The batch is marked as undone, with who did it
  and when.

### 10.1 When the portal itself will not run

[`supabase/repairs/2026-10-14-restore-user-import.sql`](supabase/repairs/2026-10-14-restore-user-import.sql) is the same undo in plain
SQL, against one batch row. Sections 0-2 are read-only, so you can read exactly
what it would do before anything is written; sections 3 and 5 are the writes.

**Take a `supabase db dump` first** - it writes to `profiles`.

### 10.2 The undo is not a backup

The record covers the eight fields an import may write, for the accounts that
**one** import touched. It is not a copy of `profiles` and it cannot undo
anything else. The dump in §2.3 remains the thing to take before the first real
import.

---

## 11. Column reference

### 11.1 Accounts (`profiles`) - Users & Roles

Header may name these in any order; only `email` is required.

| Column | Notes |
| --- | --- |
| `email` | **The match key. Required.** Lowercased for matching, stored as typed |
| `full_name` | Required for a person who has no account yet |
| `role` | A portal role, by value or label. `faculty`, `staff` and `non-teaching staff` all map to `employee` |
| `staff_category` | `faculty` or `staff`. Only meaningful for `employee`; forced to null otherwise |
| `hostel_name` | Students. Must already be a hostel (§3.1) |
| `department_or_club` | Free text, legacy. **`unit` is the one that routes approvals** |
| `roll_number` | Students; the office also uses it for an employee id |
| `ldap_uid` | **Without it the person cannot sign in.** Unique, compared lowercased |
| `unit` | Name or id of a department, club or office. **This is what finds their HOD** |

A column the paste **does not carry is left as it is**, never cleared - a sheet
of email and name must not wipe everyone's hostel.

### 11.2 Academic records - fixed column order per kind

`email` is always first and is the key. Paste the header or leave it out; do not
reorder.

| Kind | Columns, in order after `email` |
| --- | --- |
| `student` | `roll_number`, `name`, `program`, `department`, `phone`, `father_name`, `mother_name`, `guardian_name`, `hostel` |
| `employee` | `employee_id`, `name`, `department`, `employee_type`, `phone`, `office_number` |
| `office` | `department`, `phone`, `head_name`, `head_email` |
| `student_rep` | `representative_type`, `phone`, `faculty_in_charge_email` |
| `alumni_office` | `department`, `phone` |
| `warden` | `name`, `phone`, `hostel` |

The console shows the exact header for the kind you have selected - copy it from
there rather than from this table, which is a summary.

`academic_records.hostel` is **free text**, unlike `profiles.hostel_name`: it is
the institute's own spelling and is display-only.

---

## 12. Troubleshooting - what each refusal means

| Message | What it means |
| --- | --- |
| *Line 1: "Name" is not an email address* | Your header line was not recognised, so it was read as data. Check the spellings against `KNOWN_COLUMNS`, and that the header starts with the email column |
| *"X" is not a hostel on record* | Add it at Settings → Hostels (developer), or fix the spelling in the sheet |
| *"X" is not a department, club or office on record* | Add the unit at Departments & Clubs, or fix the spelling |
| *"X" is not a role this console can assign* | Unrecognised role word, or you are a manager trying to import a developer |
| *... is also given on line N* | The same email appears twice in one paste |
| *LDAP username X already belongs to Y* | That username is held by somebody who is not in this paste |
| *LDAP username X is given to more than one person in this paste* | Two lines claim the same username |
| *a second header line* | Two sheets were pasted together. Import one list at a time |
| *N columns, but M were expected* | Add a header line (accounts), or match the fixed order (academic records) |
| *More than 2000 rows in one paste* | Split the list |
| *Cannot create an account until migration 31 is applied* | §2.1 |
| *Cannot import accounts until migration 32 is applied* | §2.1 |
| *The import stopped part-way* | §6.3 - undo it and import in smaller pieces |
| *This user has bookings - delete or reassign those first* | On an undo or a delete: that account has a real booking and is kept, and named |

---

## 13. The short version

For when you have done this once already:

1. `npm run check:migrations` - 31 and 32 present.
2. `supabase db dump` - take the backup.
3. Developer: hostels (Settings), units (Departments & Clubs), whitelist (Settings).
4. Split the file per destination; delete the columns on the drop list; add a header to the accounts sheet; match the fixed order on each academic sheet.
5. Dry run on `NEXT_PUBLIC_SUPABASE_URL= npm run dev`.
6. Users & Roles → Import from spreadsheet. **Read the "updated" count.**
7. Academic records, students first. **No undo here.**
8. Set the appointments by hand: unit heads, Faculty Advisors, secretary mailboxes, wardens.
9. Verify: re-paste for `unchanged`, Recent imports reads `applied`, one LDAP sign-in, one student's locked parents, one employee's HOD.
