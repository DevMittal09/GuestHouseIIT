# Recent changes — the last round, and only the last round

**This file is deliberately short-lived.** It holds the most recent working
session so the next person (or agent) can pick up without reading everything.
When a new round lands, **delete what is here and write the new round in its
place**. Anything permanent belongs in [03-decisions.md](03-decisions.md) (the
log that accumulates), [02-timeline.md](02-timeline.md) (one row per session)
and `AGENTS.md` (the rules).

---

## Round of 9 October 2026 (evening) — the offices' own debitable heads

The office sent a **spreadsheet** instead of a numbered list: one row per
institute office mailbox, a column per debitable head, **"Y" where that office
may charge it**. The owner's instruction with it:

> "The csv file has the mapping of the offices with the debitable heads, "Y"
> means the offices can use that debitable head… Currently for offices we have
> directors office as the mock user. So use this for that. **Only show the
> debitable heads marked as Y do not show those which are not.** Project Funds
> and Personal Funds wont be visible for any ig, if its not there in the csv"

**No migration.** Nothing in the database moved, no Settings row changed.

The file is kept verbatim as
[offices-debitable-heads.csv](offices-debitable-heads.csv), tabulated in
[06-production-requirements.md](06-production-requirements.md) §2, reasoned in
[03-decisions.md](03-decisions.md) ("9 Oct 2026 (evening)"), and recorded item
by item in [01-background.md](01-background.md).

### What the spreadsheet says that the code did not

Settings → Debitable heads keys the allowed heads by the requester's
**category**, and since 8 Oct both classes of office (`officer_office`,
`department_office`) carried the same six: Institute Grant, Department Budget,
Special Budget, Student Fund, Hostel Funds, Alumni Fund. The spreadsheet is
finer than that, and **it does not follow `office_class`**:

| Office | May charge |
| --- | --- |
| Director's Office | Institute Grant, Special Budget |
| Sports & Physical Education | Institute Grant **only** |
| Students Section | Special Budget, Student Fund, Hostel Funds |
| IAR Office | Special Budget, Alumni Fund |
| The eleven department offices | Department Budget, Special Budget |
| Institute Clinic, Security, CCE, Placements, Outreach, CET | Special Budget **only** |
| Hostel | Hostel Funds **only** |

No category boundary produces those lists, so every office was being offered
up to five budgets it has no authority over.

### 1. `lib/office-debit-heads.ts` — the spreadsheet as data

`OFFICE_DEBIT_HEADS`: 34 rows, keyed by the **mailbox before the `@`**,
because that is the account that signs in. `officeDebitRowFor` /
`officeDebitHeads` / `narrowToOffice` read it.

**Project Grant and Personal Funds are on no row** - the spreadsheet has six
columns for nine heads, which is the office saying an office spends neither.
Neither was in the offices' category lists before, so nothing changed there;
a test pins it now.

### 2. `debitHeadsByType` narrows, as a ceiling over Settings

The narrowing goes **inside the one computation the booking form and
`createBooking` both read** (`bookingContextFor` → `debitHeadsByType`), so the
form cannot offer a head the server would refuse.

It is an **intersection**, not a replacement. Settings is the office's live
control over heads in general; the spreadsheet is this office's own authority.
Narrowing from both sides means **neither can widen the other** - the same
shape as `FORBIDDEN_DEBIT_HEADS` being a floor under Settings, in the other
direction.

Three guards worth keeping:

- **Only the two office categories.** `people@iitpkd.ac.in` is an
  Administration mailbox *and* a plausible person's address, so an employee, a
  student or a club keeps their own category's heads whatever their address
  looks like.
- **An office not on the spreadsheet keeps the category's six.** Guessing
  narrower would stop a new office booking; guessing wider is what the table
  prevents.
- **An empty intersection stays empty.** The form then says "No debitable head
  is set up for this kind of booking", which is true, rather than quietly
  restoring a budget the office has no authority over.

### 3. The demo personas, narrowed today

Mock Authentication puts the demo offices on addresses the institute does not
use for them, so a row may name **aliases**, matched like the mailbox:
`admin` and `director.office` → Director Office, `cse.office` → `office_cs`,
`registrar` → `ro`. Renaming the seed instead would have broken the whitelist,
the demo bookings and every recorded login.

So the owner's instruction is visible now, verified by fetching `/book` as
each persona on a dev server over the mock store:

| Persona | Heads rendered |
| --- | --- |
| `official-admin` — "Director's Office" (the demo `official`) | `institute_grant`, `special_budget` — and nothing else |
| `office-cse` — CSE Department Office | `department_budget`, `special_budget` |
| `iar-cell` — IAR Office (official booking) | `special_budget`, `alumni_fund` |

The second row is the clearest demonstration that the mapping is per office
and not per class.

### Verified

`npm run lint` · `npx tsc --noEmit` · `npm test` (**451** passing, 26 files -
13 new in `tests/office-debit-heads.test.ts`) ·
`NEXT_PUBLIC_SUPABASE_URL= npm run build` · the three `/book` fetches above.

One existing test moved: `tests/workflow-hod.test.ts`'s round-trip check takes
**the first head on each requester's list** and sent no `debit_details`. The
IAR Office's official list now begins at Special Budget, whose details are
mandatory since 8 Oct, so the payload fills them in whenever
`debitDetailsRequired(head)`. The check itself is unchanged.

`npm run test:e2e` was **not** re-run this round: no journey asserts an
office's debit heads, and the build and unit suites cover the change. Run it
before committing if you want the full gate.

### Still open

- **Point the rows at the real office mailboxes and drop the four demo
  aliases** once LDAP is connected -
  [06-production-requirements.md](06-production-requirements.md) §2,
  [04-roadmap.md](04-roadmap.md) §2b.
- **Ask the office to confirm `ro` is the Registrar's Office.** The row sits
  under "Administration" and the mailbox name is the only evidence;
  `registrar@iitpkd.ac.in` is aliased to it on that reading.
- **Ask what a newly added office may charge by default.** The code keeps the
  category's six (permissive); the alternative is nothing, which is one line
  and a worse failure mode.
- **The table is not editable from the console.** Deliberate while the offices
  it keys on are not accounts: an editable version is a column on `units` and
  a grid in Departments & Clubs. `narrowToOffice` is the only place the
  narrowing happens, so that change stays local.
- Carried over, unchanged: **`MAIL_REDIRECT_ALL_TO` must be unset in the
  Vercel environment** or no Copy-to address receives mail; **load the real
  accounts** (Users & Roles → Import from spreadsheet); an imported profile in
  Supabase mode still creates an Auth user with `password123`
  ([06-production-requirements.md](06-production-requirements.md) §7);
  migrations **1-30 are all applied** on the hosted project (verified 9 Oct
  with `npm run check:migrations`); AM's photographs; the placeholder house
  rules (Guidelines §7-8); each council's Faculty Advisor and mailbox.
