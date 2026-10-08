# Recent changes — the last round, and only the last round

**This file is deliberately short-lived.** It holds the most recent working
session so the next person (or agent) can pick up without reading everything.
When a new round lands, **delete what is here and write the new round in its
place**. Anything permanent belongs in [03-decisions.md](03-decisions.md) (the
log that accumulates), [02-timeline.md](02-timeline.md) (one row per session)
and `AGENTS.md` (the rules).

---

## Round of 8 October 2026 — the office's ninth list

Five items, relayed by the owner, who said that **most of what the office is
now asking for is about the production deployment, not the demo** - the real
accounts, the real debitable heads, the real mail. The lasting answer to that
is a new memory file: **[06-production-requirements.md](06-production-requirements.md)**,
the single checklist of what a production build needs.

Status item by item in [01-background.md](01-background.md) ("The office's
ninth list"); reasoning in [03-decisions.md](03-decisions.md) ("8 Oct 2026").

**One migration, 30** - and it is **already applied** on the hosted project,
along with 24-29 (see "Migrations, settled" below).

### 1. The debitable heads, as the office gave them

| Asked for | Now |
| --- | --- |
| The nine heads by name | `STANDARD_DEBIT_HEADS` holds all nine, in the office's order. **Alumni Fund, Student Fund and Hostel Funds** had been on the enum since migration 15 and offered to nobody; **Personal Funds** reaches a faculty member's *official* booking for the first time |
| The mapping of requester to head | `DEFAULT_DEBIT_RULES`, **revision 6**. Four categories changed which heads they have: non-teaching staff have **Personal Funds alone** (they lost the department budget), the two classes of office share **one list of six**, clubs and fests moved to the **Student Fund**, and alumni bookings to the **Alumni Fund** |
| "All funds except Institute Grant, Alumni, Student Fund and Hostel" for faculty | Read as a **floor**, not only a default: `FORBIDDEN_DEBIT_HEADS.faculty` holds all four, so Settings cannot tick them back on and a stored row that still lists one is ignored on read |
| Special **Budget** (it was labelled Special Funds from 24 Sep) | Relabelled in `DEBIT_HEAD_LABELS` and `INVOICE_HEAD_LABELS`. The stored value is still `special_budget`, so nothing in the database moved |
| "Special Budget (Please specify the details)" | `debitDetailsRequired` includes it, so the box is **mandatory**. The **Upload approval** beside it is offered and stays **optional** - a requester waiting on a scan should not be stopped from booking. One line to change if the office meant otherwise ([06](06-production-requirements.md) §2) |

**Revision 6 replaces a saved Settings row's lists** rather than editing them.
Revisions 2-5 each added or removed one head and could be applied field by
field; the office's mapping is different, not narrower, so there is no such
edit - and the office giving the list means the list *is* the configuration.
After revision 6 the row is the office's own again and is never touched.

### 2. The funds declaration (migration 30)

> "I have the necessary approval for the usage of funds from the competent
> authority and verified that sufficient balance is there in the debitable
> head."

- `FUND_DECLARATION` is the one constant, so the words on screen are the words
  in the record. `requiresFundDeclaration(head)` is **any head but Personal
  Funds**; `fundDeclarationError` is the one message, read by the form and the
  schema.
- **Inside the Debitable head card**, not beside the privacy tick: it is a
  statement about the head just chosen, and it appears and disappears with it.
- Enforced on **both sides**, and `createBooking` only records it where the
  head asked for it, so a personal booking cannot carry a declaration it never
  made.
- Stored as **`bookings.fund_declaration_at`** (migration 30) - an instant, like
  `privacy_consent_at` beside it. **Nothing is backfilled**: a null means
  either "personal booking" or "made before today".
- Until the migration is applied, the store leaves the column out unless the
  declaration was given, so **every personal booking still works** and only a
  booking on somebody else's budget is refused.

### 3. One mail thread per booking id - verified, and completed

The office said "I think it's already like that, please verify". It was true of
the **staff's** mail (since 23 Sep 2026) and **not** of the requester's, which
stood alone by an earlier decision from the meeting notes.

Eleven events moved into the booking thread (`MAIL_THREAD_OF`): every
`*.requester` event about a booking, the check-in reminder, and
`invoice.issued.accounts`. The threading machinery was already generic, so
nothing else changed. The daily log thread still carries the digest, the
escalation and the desk report - they are about a queue and have no booking to
hang on.

**The cost is the shared subject.** Gmail splits a thread the moment the
subject changes, so a requester now sees `[IITPKD-GH-2026-AB12C] Guest house
booking` and "Rooms allocated" moves to the inbox preview line. Same trade the
staff mail made in September.

### 4. Less text on screen

The supervisor asked for the content and not the commentary. Every rule and
every figure was kept; what went is the clause that explains the clause.

- **The booking form**: nine card descriptions cut or removed (Type of booking
  and Approval now have none - their own headings say it), and eight help
  paragraphs trimmed. The infant note stated the **room's capacity**, which the
  notice on the room card a few lines below states again - `INFANT_HELP_TEXT`
  is now the infant fact alone and is a constant, not a function of Settings.
- **`/book`**: the page lead is one short line or none; "What happens next"
  beside the form is where the steps live.
- **The desk**: Checking out today, the availability chart descriptions, the
  reviewer's Review dialog, the dashboard's "Your requests".
- **The Guidelines page**: every item is one statement. `BOOKING_STEPS` too,
  which is shared with the panel beside the booking form.

Two e2e assertions had to follow the copy: `kitchenName` reads "From the X
kitchen", and the Users console is recognised by "N accounts" rather than a
heading it never had.

### 5. Accounts from a spreadsheet (and bulk delete)

The office asked, for the GH Manager: "add the data from excel, edit the
columns, and delete data... when we add data of all users". It was practical,
so it is built rather than parked.

**Users & Roles → Import from spreadsheet.** Paste the columns out of Excel →
**Check the paste** (a plan: "412 added, 3 updated, 9 unchanged", and what
changed per person) → **Import**, all or nothing.

- **"Edit the columns" is the header line**: it names the columns in whatever
  order the office's sheet has them, and only `email` is required. Aliases in
  `KNOWN_COLUMNS` (`Roll No.`, `Dept / Club`, `LDAP username`…). With no header
  the default order is read.
- **A column the paste does not carry is left alone**, so a sheet of email and
  name cannot wipe everyone's hostel. A person already on the list is
  **updated**, matched on the email, so the same paste can be re-run when the
  sheet grows.
- `faculty` / `staff` are read as the **employee** role and set the staff
  category at the same time.
- A **header must start with the email column**, because `columnFor` also
  matches the bare word "email" - which is the first cell of a data line for
  anybody whose address is `email@…`.
- A manager cannot import a developer into existence, and an account they may
  not edit is refused **by name** (`assignableRoles`, `userEditError`, checked
  in the action). At most 2,000 rows a paste. Audited.
- **Bulk delete**: tick rows, Delete N selected, type the phrase. Whatever
  cannot go (a person with bookings, a developer's account to a manager) is
  **named back** and the rest still go - the opposite of the import, because a
  delete has no half-applied state to be confused about.

`lib/users-import.ts` is pure, so the console previews the plan with the same
function that applies it.

### Verified

`npm run lint`, `npm run typecheck`, **`npm test` - 431 passed** (24 files; new
`tests/ninth-round.test.ts` 24), a production build on the mock store
(`NEXT_PUBLIC_SUPABASE_URL=`), and **`npm run test:e2e` - 36 journeys**,
including a new `e2e/ninth-round.spec.ts`: a faculty booking refused without
the declaration and accepted with it, Special Budget demanding the fund's name,
and the manager importing two accounts from a paste, re-running it for
"0 added, 0 updated, 2 unchanged", and deleting both together.

**Migration 30 in a throwaway `postgres:16-alpine`**: 1-30 applied, 30
re-applied with the test rows still in place; the column nullable and
`timestamptz` with its comment; a booking stored without it (a personal stay)
and another with it beside a `department_budget` head; MISSED still last on the
enum.

**And on the hosted project** (9 Oct 2026, read-only):
`npm run check:migrations` reports **1-30 all applied**, with 17 and 23 named
as the two it cannot see.

Tests that now assert the opposite of what they did a week ago, as expected
when a mapping changes: the per-category head lists in
`tests/workflow-hod.test.ts` and `tests/dining.test.ts`, the Special
Funds/Budget blocks of `tests/fourth-round.test.ts` and
`tests/fifth-round.test.ts`, the revision assertions in
`tests/seventh-round.test.ts` and `tests/eighth-round.test.ts`, and the Missed
mail's subject in `tests/missed-requests.test.ts` (it is the thread's now).

### 6. Migrations, settled - and a script so it stays settled (9 Oct 2026)

The owner said migrations 24-30 had already been run in the Supabase SQL
editor and asked why the portal was reporting otherwise. **It was not the
portal - it was these notes.** `.memories/23-running-and-testing.md` said
"which migrations the hosted project has is not recorded here" and offered a
hand-written SQL query whose marker list **stopped at migration 25**. So 26
onwards could not be checked at all, and the sentence "24-30 are outstanding"
was copied forward from round to round, long after they were applied.

**Fixed by asking the database instead of writing the answer down:**

```bash
npm run check:migrations      # scripts/check-migrations.mjs
```

One marker per migration - the table, column or enum value it created - probed
**read-only** over PostgREST (`GET`, at most one row, shape only; nothing is
written and no guest data is read). It exits 1 if a marker is missing, so a
deploy step can gate on it.

**Result, 9 Oct 2026: migrations 1-30 are all applied** on the hosted project.
Migrations **17 and 23** are the two it cannot see - they only add or replace a
plpgsql function, PostgREST cannot read `pg_proc`, and calling either would be
a write - so it names them and prints the one-line SQL for the editor rather
than guessing. Their observable symptoms if missing: 23, Supabase refuses a
second infant in one room; 17, changing the turnaround buffer fails.

The old prose and the truncated query are gone from
[23-running-and-testing.md](23-running-and-testing.md), which now points at the
script, and the stale claims are struck through in
[04-roadmap.md](04-roadmap.md) and
[06-production-requirements.md](06-production-requirements.md).

### Still open

- **The Special Budget approval upload stays optional** (the office, 9 Oct
  2026). The details box beside it is mandatory; the upload is offered and not
  required, so a requester waiting on a scan is not stopped from booking.
  [06-production-requirements.md](06-production-requirements.md) §2 keeps the
  one-line change if that is ever revisited.
- **`MAIL_REDIRECT_ALL_TO` must be unset in the Vercel environment** or no
  Copy-to address will ever receive mail (carried over from 1 Oct).
- **Load the real accounts** once LDAP is connected - that is what the
  spreadsheet import is for, and §1 of
  [06-production-requirements.md](06-production-requirements.md) is the
  per-field guide.
- In Supabase mode an imported profile also creates a Supabase Auth user with
  the password `password123`. Harmless (that password is not a portal login)
  but wrong at six hundred rows -
  [06-production-requirements.md](06-production-requirements.md) §7.
- AM's photographs; the placeholder house rules (Guidelines §7-8); each
  council's Faculty Advisor and mailbox - [04-roadmap.md](04-roadmap.md).
