# Production — what it needs, how to deploy it, how to run it

The one file about the **real deployed portal**, as opposed to the demo.
Part 1 is the checklist of what a production build has to have and who must
supply it; Part 2 is how to deploy and operate it; Part 3 is what still has to
be settled with the institute before go-live.

Written **8 October 2026**, when the owner said that most of what the office
was asking for had become about the real portal rather than the demo. Merged
with the deployment runbook and the surviving parts of the 2 Sep production
plan on **10 October 2026**.

It is a checklist, not a design document. Why each thing is the way it is lives
in [02-decisions.md](02-decisions.md); what is open in general is
[03-roadmap.md](03-roadmap.md); every secret and variable by name is
[05-credentials-and-security.md](05-credentials-and-security.md). Where those
and this file disagree, **this one is about production and wins for
production**.

---

# Part 1 — The production checklist

## 0. The shortest version

Nothing on this list is new code. It is accounts, settings, secrets and
switches. In rough order of what breaks worst if skipped:

1. Connect the institute LDAP, and **close Mock Authentication**.
2. Load the real people into **Users & Roles** (now a spreadsheet paste).
3. Apply every migration to the production database, and **check with
   `npm run check:migrations`** rather than writing the answer down. (On the
   current hosted project, 1 – 30 were verified applied on 9 Oct 2026.)
4. Change the console password off `0000`; delete the demo accounts.
5. Unset `MAIL_REDIRECT_ALL_TO`; set `CRON_SECRET`, `APP_URL`,
   `ID_ENCRYPTION_KEY`, the Supabase keys.
6. Fill in the office's Settings - rates, GSTIN, bank details, heads of
   departments, Faculty Advisors, hostels and wardens, the official whitelist.
7. Import the **academic records** (students first).
8. Schedule the two mail routes.
9. **Point the per-office debitable heads at the real office mailboxes** and
   drop the demo aliases - [§2](#and-then-narrowed-per-office-9-oct-2026).

---

## 1. The users

**The portal does not create accounts by itself.** A valid LDAP sign-in with no
`profiles` row gets in nowhere, deliberately - the institute's directory says
who a person *is*, and the portal's own table says what they may *do*. So every
person who will use the portal has to be on the list before they can sign in.

### How the list is loaded (8 Oct 2026)

**Console → Users & Roles → Import from spreadsheet.** Paste the columns
straight out of Excel, press **Check the paste**, read the plan, press
**Import**. All or nothing: one bad line and nothing is written.

- A **header line** names the columns in whatever order the office's own sheet
  has them, and only `email` is required - so a sheet of email, name and roll
  number imports without being rearranged. With no header the paste is read as
  `email, full_name, role, hostel_name, department_or_club, roll_number,
  ldap_uid`.
- Accepted column names (any case, spaces or underscores) are in
  `KNOWN_COLUMNS`, `lib/users-import.ts`: `email`, `name`, `role`, `hostel`,
  `department` / `dept` / `club`, `roll no` / `employee id`, `ldap username` /
  `uid`, `category`, `unit`.
- A person **already on the list is updated**, matched on the email, so the
  same paste can be run again when the office's sheet grows. **A column the
  paste does not carry is left alone** - a sheet of email and name will not
  wipe everyone's hostel.
- `faculty` and `staff` are both read as the **employee** role, and set the
  staff category at the same time.
- A **manager cannot import a developer** into existence, and cannot touch a
  developer's row (`assignableRoles`, `userEditError`, enforced in the action).
- At most **2,000 rows** in one paste; a longer list is refused with "split the
  list", never silently truncated.
- Every import is **audited** (`security_audit`, "user import", with the counts
  and the columns).

**Editing and deleting.** Each row still has **Edit** (every field) and
**Delete**, and rows can be **ticked and deleted together** behind a typed
confirmation. A person who has bookings is refused by the database and **named
back** to the operator rather than skipped quietly; the rest still go.

### What the office has to decide per person

| Field | Why it matters | Leave blank? |
| --- | --- | --- |
| Email | The key. Matched for the import, printed on mail | No |
| Full name | On every request and invoice | No |
| Role | What they can do - see [10-roles-and-workflows.md](10-roles-and-workflows.md) | Defaults to Student on a new row, which is rarely what is meant |
| LDAP username | **Without it they cannot sign in** (unless Google is configured and their institute address matches) | Only if loaded later by the LDAP import |
| Hostel | A student's request goes to **that hostel's** Assistant Warden | Only for non-students |
| Department / Club | Scoping for the legacy Faculty Advisor role and reports | Usually fine |
| Unit | Whose **HOD** approves their official bookings | A blank unit means their request routes as if nobody were set |
| Staff category | Faculty or non-teaching staff - decides the **debitable heads** offered | Counts as faculty, the wider set |
| Roll number | Printed on the request | Yes |

### Accounts the office must create by hand, not from a sheet

- **The two desk accounts** - Guest House Manager and Guest House Caretaker.
  They are the guest house, not people: staff in those posts book their own
  family from their ordinary institute accounts.
- **At least one developer**, with a second factor set up
  (Console → Security) before the demo developer is deleted. Deleting the last
  developer locks the console's own sections.
- **The office accounts on the whitelist** (Director, Registrar, Deans), which
  must also be added to Console → Settings → Official email whitelist.

### Demo accounts to delete

Every persona in [05-credentials-and-security.md](05-credentials-and-security.md)
signs in with a password **published in this repository**. Delete them, or the
portal has a dozen known logins. `lib/ldap/mock-directory.ts` only answers when
`LDAP_URL` is unset, so connecting the directory closes that door - but the
`profiles` rows stay until somebody removes them, and Google sign-in would
accept any of those addresses.

---

### What an institute address does and does not tell you

Confirmed from public institute sources, and worth knowing before anyone
writes a rule that infers a role from an address:

| Pattern | Meaning |
| --- | --- |
| `112201001@smail.iitpkd.ac.in` | Student. The local part is the roll number |
| `padmesh@iitpkd.ac.in` | Faculty or staff |
| `trc@`, `yacc@`, `dac@`, `vadya@`, `akshar@`, `bioscope@`, `shutterbug@`, `grafica@`… | **Club shared mailboxes - also on the staff domain** |
| `admin@`, `registrar@`, `director.office@iitpkd.ac.in` | Office mailboxes |

So **"the staff domain means employee" is wrong**: clubs and offices sit on the
same domain, and `people@` is an Administration mailbox that is also a
plausible person's address. The domain gives a baseline at best; the role comes
from the profile, which the office loads. This is the same reason
`OFFICE_DEBIT_HEADS` is applied only to the two **office** categories and not
by domain ([§2](#2-the-debitable-heads-as-the-office-gave-them-8-oct-2026)).

---

## 2. The debitable heads, as the office gave them (8 Oct 2026)

Nine heads, and who may use which. This is `DEFAULT_DEBIT_RULES`
(`lib/debit-heads.ts`, revision 6) and it is also what Console → Settings →
Debitable heads shows, so the office can narrow it without code.

| Head | Stored as |
| --- | --- |
| Institute Grant | `institute_grant` |
| Professional Development Fund | `professional_development_fund` |
| Project Grant | `project_grant` |
| Department Budget | `department_budget` |
| Special Budget | `special_budget` |
| Personal Funds | `personal_funds` |
| Alumni Fund | `alumni_fund` |
| Student Fund | `student_fund` |
| Hostel Funds | `hostel_funds` |

| Requester | May charge |
| --- | --- |
| Student | Personal Funds |
| Faculty | Every head **except** Institute Grant, Alumni Fund, Student Fund and Hostel Funds |
| Non-teaching staff | Personal Funds |
| Offices (officer and department alike) | Institute Grant, Department Budget, Special Budget, Student Fund, Hostel Funds, Alumni Fund |
| Clubs, councils and fests | Student Fund, Special Budget |
| On behalf of an alumnus, and the IAR Student Cell | Alumni Fund, Special Budget |
| Any personal booking | Personal Funds - **and the question is not asked** |
| The desk, booking for a guest | All nine |

Three of these are **floors under Settings**, not merely defaults
(`FORBIDDEN_DEBIT_HEADS`): faculty can never be given the four funds above,
students never Special Budget, and no personal booking ever Special Budget.
Those cells are greyed in the console, the rule is applied on read as well as
on save, and a stored row that still lists one is ignored rather than fatal.

**Special Budget asks which fund, and the box is mandatory. The approval
letter beside it is optional** - settled by the office on 9 Oct 2026. A
requester waiting on a scan is not stopped from booking, and the desk can ask
for it later. **If that is ever revisited**, making the upload mandatory is one
line: require it in `app/actions/bookings.ts` where
`acceptsDebitDocument(payload.debit_head)` is read, and in the form's own file
check beside it.

**Project Grant** asks for the number and title, typed, and is mandatory.

### And then narrowed per office (9 Oct 2026)

The table above keys the heads by **category**, so every office shares one
list of six. On 9 Oct 2026 the office sent the real mapping as a spreadsheet,
kept verbatim at the foot of this section
([The office's spreadsheet, verbatim](#the-offices-spreadsheet-verbatim)): one
row per office mailbox, a column per head, **"Y" where that office may charge
it**. It is
finer than a category, and it does not follow `office_class` either - the
Director's Office spends the Institute Grant, a department office its
department's budget, the Students Section the student and hostel funds, IAR
the alumni fund, the Sports Officer the grant and nothing else.

It is transcribed into `OFFICE_DEBIT_HEADS` (`lib/office-debit-heads.ts`) and
applied by `debitHeadsByType` as a **ceiling over the Settings list**: an
intersection, so Settings can still take a head away from every office at once
and this takes away the ones a particular office may not touch, and **neither
can widen the other**. An office that is not on the spreadsheet keeps its
category's list unchanged - guessing a narrower one would stop it booking, and
guessing a wider one is the thing the table exists to prevent.

**Project Grant and Personal Funds are on no row.** The spreadsheet has no
column for either, which is the office saying an office does not spend them: a
project is held by its investigator, and an office has no private money.
Neither was in the offices' category lists before this, so nothing changed -
but it is why there are six columns and nine heads.

| Office | Mailbox (`@iitpkd.ac.in`) | May charge |
| --- | --- | --- |
| Director Office | `director_iitpkd` | Institute Grant, Special Budget |
| Administration | `office_deanadmn` | Institute Grant, Special Budget |
| Administration | `ro` | Institute Grant, Special Budget |
| Administration | `personnel` | Institute Grant, Special Budget |
| Administration | `people` | Institute Grant, Special Budget |
| Administration | `recruitment` | Institute Grant, Special Budget |
| Academics | `academic` | Institute Grant, Special Budget |
| Academics | `acadresearch` | Institute Grant, Special Budget |
| Finance & Accounts | `accounts` | Institute Grant, Special Budget |
| Stores & Purchase Section | `purchase` | Institute Grant, Special Budget |
| ICSR | `icsr` | Institute Grant, Special Budget |
| Students Section | `office_studentssection` | Special Budget, **Student Fund, Hostel Funds** |
| CCE | `cce` | Special Budget |
| Placement / Career Development Cell | `tpo` | Special Budget |
| Placement / Career Development Cell | `placements` | Special Budget |
| International & Alumni Relations | `iar` | Special Budget, **Alumni Fund** |
| Outreach | `eduoutreach` | Special Budget |
| EWD | `ewd` | Institute Grant, Special Budget |
| CET | `cet` | Special Budget |
| Biological Sciences and Engineering | `office_bse` | Department Budget, Special Budget |
| Chemistry | `office_cy` | Department Budget, Special Budget |
| Civil Engineering | `office_ce` | Department Budget, Special Budget |
| Computer Science and Engineering | `office_cs` | Department Budget, Special Budget |
| Data Science | `office_ds` | Department Budget, Special Budget |
| Electrical Engineering | `office_ee` | Department Budget, Special Budget |
| Humanities and Social Sciences | `office_hss` | Department Budget, Special Budget |
| Materials and Metallurgical Engineering | `office_mm` | Department Budget, Special Budget |
| Mathematics | `office_ma` | Department Budget, Special Budget |
| Mechanical Engineering | `office_me` | Department Budget, Special Budget |
| Physics | `office_ph` | Department Budget, Special Budget |
| Institute Clinic | `mo` | Special Budget |
| Sports & Physical Education | `sportsofficer` | **Institute Grant only** |
| Security | `security` | Special Budget |
| Hostel | `hostelmanager` | **Hostel Funds only** |

#### What production has to do about it

1. **The key is the mailbox before the `@`**, because that is the account that
   signs in. The real office accounts do not exist yet (Mock Authentication,
   LDAP unconnected), so each row may also name **aliases** - demo or legacy
   addresses that are the same office. Three are set today:
   `admin` and `director.office` → Director Office (the demo `official`
   persona is "Director's Office" on `admin@`), `registrar` → `ro`, and
   `cse.office` → `office_cs` (the demo department office).
   **Delete those aliases when the real accounts are loaded** - leaving them
   is harmless but they will drift.
2. **`ro` is read as the Registrar's Office**, and `registrar@iitpkd.ac.in`
   (on the whitelist from `DEFAULT_OFFICIAL_EMAILS`) is aliased to it. That is
   an inference from the mailbox name, not something the office wrote. **Ask
   them to confirm it.**
3. **An office the spreadsheet does not name keeps all six heads.** Any office
   the institute adds later has to be added to the table, or it will be
   offered more than it may spend. Until the console can edit it (below), that
   is a code change.
4. **It is not editable from the console yet.** Settings → Debitable heads
   still edits the *category* lists. The per-office rows are a constant.
   Giving them a home the office can edit means a column on `units` (a
   migration) and a grid in Departments & Clubs; the seam is already there,
   because `narrowToOffice` is the one place the narrowing happens.
   [03-roadmap.md](03-roadmap.md) carries it.
5. **The whitelist and this table are different lists.** `official_email_whitelist`
   says who may book *as* an office; this says what that office may *charge*.
   An office needs to be on both.

### The office's spreadsheet, verbatim

The office sent this as a CSV on **9 October 2026**, one row per office
mailbox, "Y" where that office may charge that head. It is kept here word for
word so the transcription in `lib/office-debit-heads.ts` can always be read
against the original. **Do not edit it to match the code** - if they disagree,
the code is wrong. (It lived as `04-production.md` in this folder
until 10 Oct 2026.)

```csv
Offices,Office Mail (add @iitpkd.ac.in at the end),Institute Grant,Department Grant,Special grant,Alumni ,Student,Hostel
Director Office,director_iitpkd,Y,,Y,,,
Administration,office_deanadmn,Y,,Y,,,
Administration,ro,Y,,Y,,,
Administration,personnel,Y,,Y,,,
Administration,people,Y,,Y,,,
Administration,recruitment,Y,,Y,,,
Academics,academic,Y,,Y,,,
Academics,acadresearch,Y,,Y,,,
Finance & Accounts,accounts,Y,,Y,,,
Stores & Purchase Section,purchase,Y,,Y,,,
ICSR,icsr,Y,,Y,,,
Students Section,office_studentssection,,,Y,,Y,Y
CCE,cce,,,Y,,,
Placement Cell/Career Development Cell,tpo,,,Y,,,
Placement Cell/Career Development Cell,placements,,,Y,,,
International & Alumni Relations,iar,,,Y,Y,,
Outreach,eduoutreach,,,Y,,,
EWD,ewd,Y,,Y,,,
CET,cet,,,Y,,,
Biological Sciences and Engineering,office_bse,,Y,Y,,,
Chemistry,office_cy,,Y,Y,,,
Civil Engineering,office_ce,,Y,Y,,,
Computer Science and Engineering,office_cs,,Y,Y,,,
Data Science,office_ds,,Y,Y,,,
Electrical Engineering,office_ee,,Y,Y,,,
Humanities and Social Sciences,office_hss,,Y,Y,,,
Materials and Metallurgical Engineering,office_mm,,Y,Y,,,
Mathematics,office_ma,,Y,Y,,,
Mechanical Engineering,office_me,,Y,Y,,,
Physics,office_ph,,Y,Y,,,
Institute Clinic,mo,,,Y,,,
Sports & Physical Education,sportsofficer,Y,,,,,
Security,security,,,Y,,,
Hostel,hostelmanager,,,,,,Y
```

---

### The funds declaration

Every head but Personal Funds asks the requester to tick:

> I have the necessary approval for the usage of funds from the competent
> authority and verified that sufficient balance is there in the debitable
> head.

`FUND_DECLARATION` in `lib/debit-heads.ts` - one constant, so the words on
screen are the words in the record. Checked on the client **and** the server,
and stored as `bookings.fund_declaration_at` (**migration 30**), so an approver
and the accounts section can see it was given and when. Nothing is backfilled:
a null means either a personal booking or a booking made before 8 Oct 2026, and
the booking's own date tells them apart.

## 3. Data the office has to supply

Everything here is entered in the portal, not in code, and everything has a
working default — but a default is a guess. Ordered by what hurts most if it is
left alone.

| What | Where it goes | Until it is there |
| --- | --- | --- |
| **The console password** | Console → Console Access | It is **`0000`**, and it guards every developer and manager console action |
| **The people** | Users & Roles (spreadsheet paste) | Nobody but the demo personas can sign in |
| **LDAP usernames** | Users & Roles → Import LDAP usernames, or the `ldap_uid` column of the same paste | Those people cannot sign in |
| **Academic records** - students first | Console → Academic records (CSV paste, migration 28) | Every lookup falls through to the published dummy records, and a student types their parents' names instead of having them locked |
| **Departments, clubs, offices and their heads** | Departments & Clubs | An official booking's HOD stage is skipped, and the log says so |
| **Each council's and club's Faculty Advisor** and secretary's mailbox | Departments & Clubs → Faculty Advisors | **Nobody can book for that club at all.** Only `sec_arts@` is seeded |
| **Hostels, and a warden per hostel** | Settings → Hostels; Users & Roles | A student's request has no reviewer |
| **The official email whitelist** | Settings | Those offices cannot book as an office |
| **Tariffs**, including an **extra-bed rate** | Tariffs & Invoicing | An invoice for a room with an extra bed **cannot be issued at all**. Seeded from the office's sheet: Bageshri ₹1,000/day (raised from ₹750 on 23 Sep 2026), Hamsanandi ₹2,000 and ₹4,000 for the `official` role, breakfast ₹80, lunch ₹120, dinner ₹100, meals free to students and on alumni bookings. Confirm every rate and its effective date |
| **GSTIN** | Tariffs & Invoicing | The template's value is printed on every invoice. Confirm it against the institute's registration |
| **Accounts email** | Tariffs & Invoicing | **Empty**, so nothing is mailed to Accounts when an official booking's invoice is issued |
| **Bank details** (holder, account number, IFSC, branch) | Tariffs & Invoicing | Guests pay against the template's values |
| **Guest house contact** (address, phone, email) | Tariffs & Invoicing | The template's values show on the invoice *and* the public site |
| **The house rules** (Guidelines §7-8) and the amenities | `lib/site.ts`, `lib/site-content.ts` - `grep -rn "TODO(site)"` | The public site shows plausible placeholders |
| **Photographs**, and which guest house each shows | `public/site/photos/` | The gallery is grouped by subject, never by guest house |

**Defaults that are policy choices, not guesses — the office should review each
once.** The value, the meaning and who may change it are in
[12-settings-and-defaults.md](12-settings-and-defaults.md): the advance-booking
window (1 month), the longest stay (14 nights), the turnaround buffer (4 h), the
no-show release (off), the day basis and grace hours, "rates include GST" (yes),
the GST percentages and SAC codes, the meal serving windows, the kitchen's 30 per
sitting, room capacity, the debitable heads per category, ID retention (365 days)
and audit retention (180 days, which cannot be set lower).

**Also outside Settings:** the wording of every automatic mail
(Console → Mail Templates).

## 4. Secrets and switches

The full table is in
[05-credentials-and-security.md](05-credentials-and-security.md#environment-variables--all-of-them-and-what-each-switches).
What matters for production:

| Variable | Production value | What goes wrong otherwise |
| --- | --- | --- |
| `LDAP_URL` + `LDAP_BASE_DN` | The institute's directory | The published dummy passwords work |
| `MOCK_LOGIN` | `false`, unless Google is configured | **Anyone reaching `/mock-login` becomes any account** |
| `GOOGLE_CLIENT_ID` / `SECRET` / `APP_URL` | Set, if Google is the second door | - |
| `DEV_LOGIN` | **Unset.** `instrumentation.ts` refuses to start a production server with it | - |
| `NEXT_PUBLIC_SUPABASE_URL` + keys | The production project | The mock store - a single JSON file, no concurrency safety |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only, never `NEXT_PUBLIC_` | - |
| `ID_ENCRYPTION_KEY` | Set, and **never rotated without the re-encrypt step** | Server refuses to start; identity numbers unreadable |
| `CRON_SECRET` | Set - required in production | The mail routes are open |
| `APP_URL` / `APP_BASE_URL` | The real host | Sign-in redirects break; every link in an email points at localhost |
| `MAIL_USER` + `MAIL_APP_PASSWORD` | The sending mailbox | Mail is written to `.local-mail/*.eml` and nobody gets it |
| `MAIL_REDIRECT_ALL_TO` | **Unset** | Every message goes to one mailbox and **CC is dropped**, so no "Copy to" address ever receives anything. This is the office's "copy to mail is not working" report of 1 Oct 2026 |

Two scheduled routes, both guarded by `CRON_SECRET`:
`/api/mail/dispatch` every few minutes, and `/api/mail/cron` at 08:00 IST
(`30 2 * * *` UTC). Without the second there are no digests, no check-in
reminders, no day-wise log and **nothing marks a request Missed**.

---

## 5. Migrations

Applied **by hand**, in order. A missing one fails writes quietly - the store
leaves an unknown column out of the insert where it can, so usually only the
bookings that use that feature are refused.

**Ask the database, do not write the answer here:**

```bash
npm run check:migrations
```

It probes one marker per migration, read-only, against the project in
`.env.local`, and exits 1 if anything is missing. **Migrations 17 and 23 are
function-only** and it cannot see them; it says so and prints the one-line SQL
for the editor.

> **The current hosted project (`azfd…`) has 1 – 30, verified 9 Oct 2026.**
> This file previously said 24 – 30 were outstanding. They were not: they had
> been applied in the SQL editor, and the note was wrong because the old check
> recipe listed markers only up to migration 25, so nothing past it could be
> verified. That is exactly why the number is no longer recorded in prose.

The table below is what a *missing* migration costs, which is the reason to
check at all:

| # | Without it |
| --- | --- |
| 24 | A booking with a Copy-to address or a project sub-head is refused; a baby typed as age 0 is refused |
| 25 | **Nobody can book for a club** |
| 26 | An invoice with an additional charge is refused |
| 27 | A booking's meal split is dropped and reads back as the old whole-party preference |
| 28 | Every academic lookup falls through to the dummy records; the records console names the missing table |
| 29 | The nightly sweep cannot mark anything Missed (it logs the enum error per booking and carries on) |
| 30 | A booking on anybody's budget but Personal Funds is refused ("column does not exist"); personal bookings still work |

Every migration is tested in a throwaway `postgres:16-alpine`, never against
the hosted project - recipe in
[22-running-and-testing.md](22-running-and-testing.md). Checking which ones a
project *has* is the read-only script above, which is safe to run against
production.

---

## 6. What production turns off

| Demo convenience | Production |
| --- | --- |
| Mock Authentication / `/mock-login` | Closed (`MOCK_LOGIN=false`, or Google configured) |
| The dummy LDAP directory (`MockDirectory`) | Replaced the moment `LDAP_URL` is set |
| The demo personas and their published passwords | Deleted |
| The six demo bookings | Mock store only; `supabase/repairs/2026-09-21-clear-test-bookings.sql` for a hosted one |
| The published dummy academic records | Still **behind** the office's imported rows, as a fallback. The card's caption says per record which it used |
| Console password `0000` | Changed from Console → Console Access |
| `.local-db.json` / `public/uploads/` | Unused - Supabase Postgres and Storage instead |

---

## 7. Asked for, and parked

Recorded here so the next session does not have to rediscover the reasoning.

### Done on 8 Oct 2026

- **Add the users from Excel, edit the columns, delete the data.** Built as
  §1 above - the paste, the header line, bulk delete. This was the office's ask
  and it was practical, so it is in rather than parked.

### Not built, and why

- **A real bulk *create* in Supabase mode also needs an Auth user.** Today
  `createProfile` in Supabase mode creates a Supabase Auth user with the
  password `password123` (it needs the service-role key). That is fine for
  demo accounts and wrong for six hundred real ones - though harmless, because
  **the Auth password is not a portal login**: everyone signs in through LDAP
  or Google. Worth revisiting when the service moves off the service-role key
  ([05-credentials-and-security.md](05-credentials-and-security.md) §6): either stop creating Auth users for
  imported profiles, or create them with a random unusable password.
- **Editing the users table in place, cell by cell** (a spreadsheet in the
  browser). The office asked to "edit the columns", which the header line
  answers for an import; a live editable grid is a different feature, needs its
  own validation story for every field, and the per-row Edit dialog already
  covers correcting one person. Not worth it until somebody asks twice.
- **An .xlsx upload** rather than a paste. The paste handles what a
  spreadsheet copy actually puts on the clipboard (tabs, quoted commas), needs
  no parser dependency and no file upload limit, and shows the plan before
  anything is written. A real `.xlsx` reader would be a package and a new
  upload path for the same result. Revisit only if the office says pasting
  thousands of rows is awkward.
- **Per-tab sessions.** One cookie means signing in as somebody else in one
  tab changes who every tab is. A blocking guard was built and reverted
  ([02-decisions.md](02-decisions.md)). Two identities at once need two browser
  profiles.
- **The tax breakdown under the GSTIN** came off the invoice on 7 Oct 2026
  (`printsTaxLines` false from version 4). It is still computed and kept in
  every snapshot, so putting it back is one line if the office asks.

---

## 8. Before the first real booking - the one-page check

- [ ] `LDAP_URL` set and a real person has signed in
- [ ] `/mock-login` returns nothing
- [ ] Console password changed; demo accounts deleted; a real developer has a
      second factor
- [ ] Every migration applied, verified by `npm run check:migrations` (plus the
      one-line SQL for 17 and 23, which it cannot see)
- [ ] Real users imported; wardens, HODs and Faculty Advisors named
- [ ] Academic records imported (students at least)
- [ ] Tariffs entered, **including the extra-bed rate**; GSTIN and bank
      details confirmed; Accounts email set
- [ ] Every office on `OFFICE_DEBIT_HEADS` matches a real mailbox, the demo
      aliases (`admin`, `director.office`, `cse.office`, `registrar`) are gone,
      and `ro` has been confirmed as the Registrar's Office
- [ ] `MAIL_REDIRECT_ALL_TO` unset, and a test message from
      Console → Mail Outbox actually arrived
- [ ] Both cron routes scheduled and `CRON_SECRET` set
- [ ] A booking taken end to end on the production deployment, by a real
      requester, approved, allocated, invoiced and paid - **then deleted**
- [ ] Backups confirmed on the Supabase plan, and the restore drill run

---

# Part 2 — Deploying and operating it

## Deploying to production

Not yet deployed. The intended path is Vercel + hosted Supabase.

**What used to block this is done** (Phase 8, Sep 2026): sessions are rows with
an opaque cookie that cannot be forged, Google sign-in is the real OpenID
Connect flow, and `instrumentation.ts` will not let a production server start
if `DEV_LOGIN` is set, or if Supabase, `APP_URL`, `CRON_SECRET` or
`ID_ENCRYPTION_KEY` is missing.

> **The Mock Authentication door is open in production too** while Google is
> not configured (`mockLoginEnabled()`: open until `GOOGLE_CLIENT_ID`,
> `GOOGLE_CLIENT_SECRET` and `APP_URL` are all set, unless `MOCK_LOGIN=false`).
> That is deliberate for the office's demo deployment, and fatal for a real
> one: anyone who reaches `/mock-login` can become any account. **A deployment
> holding real bookings must set `MOCK_LOGIN=false` or configure Google.**

**Still to settle before the first real deployment:**

1. **Connect the directory.** Set `LDAP_URL` and friends (`.env.example`) and
   load the real usernames onto profiles (migration 12, then the console import
   — [05-credentials-and-security.md](05-credentials-and-security.md) §3). **Never deploy without
   `LDAP_URL`:** with it unset the portal accepts the dummy accounts, whose
   passwords are published in this repository.
2. **Delete or disable the demo personas** once the real accounts exist.
3. **Per-request, user-scoped database clients.** Every table has RLS with no
   `authenticated` write policy, but the server still uses the service-role
   key from one server-only module. The boundary today is the server: every
   action re-checks the caller. See
   [05-credentials-and-security.md](05-credentials-and-security.md#what-is-deliberately-not-done-yet).

**Deployment steps once those are done:**

1. Push the repository to GitHub (`main` on
   `https://github.com/DevMittal09/GuestHouseIIT.git`; pushes work since
   10 Sep 2026).
2. Import the project in Vercel.
3. Set the environment variables in Vercel's project settings — mark
   `SUPABASE_SERVICE_ROLE_KEY`, `MAIL_APP_PASSWORD`, `CRON_SECRET`,
   `ID_ENCRYPTION_KEY` and `GOOGLE_CLIENT_SECRET` as server-only (do **not**
   prefix them with `NEXT_PUBLIC_`). The full table is in
   [05-credentials-and-security.md](05-credentials-and-security.md#environment-variables--all-of-them-and-what-each-switches). Set `APP_URL` and
   `APP_BASE_URL`, or sign-in redirects break and every link in an email points
   at localhost.
4. Deploy; Vercel detects Next.js automatically. `npm run build` must pass first.
5. Apply **all** migrations, in order, and the seed to the production Supabase
   project if it is separate from the development one.
   Then **`npm run check:migrations`** against that project (read-only) to see
   that each one's marker is really there — do not rely on a note saying so,
   which is how 24–30 were believed missing for weeks after they were applied.
   It cannot see 17 and 23 (function-only) and prints the SQL for those.
6. Schedule the two mail routes (`vercel.json` `crons`, or a systemd timer):
   `/api/mail/dispatch` every few minutes, `/api/mail/cron` at 08:00 IST
   (`30 2 * * *` UTC). Without the second, digests, reminders and the day-wise
   log never go out — per-event mail still does, via `after()`.
7. **Decide `MAIL_REDIRECT_ALL_TO` deliberately.** Production is the one place
   it should be unset. Anywhere else, leaving it unset means the portal mails
   real parents and wardens from a staging database.

**Configuration that must survive deployment:**

- **The host's timezone no longer matters — keep it that way.** `lib/tz.ts`
  pins every wall-clock operation to `Asia/Kolkata`, so the app is correct on a
  UTC host (Vercel) and on an IST laptop alike. Do not "fix" a date problem by
  setting `TZ` on the deployment: that would make correctness depend on a deploy
  setting and would still leave browsers outside IST wrong. This is the bug that
  stored bookings 5h30m late once already — see
  [22-running-and-testing.md](22-running-and-testing.md).
- `next.config.ts` raises `experimental.serverActions.bodySizeLimit` to `25mb`
  for document uploads. Without it, uploads fail as an opaque browser
  `NetworkError`.
- Per-file limits (5 MB; JPG/PNG/WEBP/PDF) are enforced in
  `app/actions/bookings.ts`.

**Operational notes:**

- The mock store must never be used in production — it is a single JSON file
  rewritten on every mutation, with no concurrency safety. In production the
  Supabase variables will always be set, so this is automatic, but do not
  "temporarily" unset them on a live deployment.
- Uploaded documents contain Aadhaar/ID data. Keep the bucket private, keep
  signed-URL lifetimes reasonable, and confirm retention expectations with the
  Administration Section before going live.

---

## What `vercel.json` may and may not ask for

A deployment that fails **with no build log, and never appears in the
project's Deployments list**, was rejected before it was built. Vercel does
that when `vercel.json` asks for something the plan does not include — and it
reports the failure only as a red check on the commit in GitHub, which is a
miserable way to find out. It cost us three pushes to work out (23 Sep 2026).

On the **Hobby** plan:

- **Cron jobs run once a day, and there may be two of them.** Anything more
  frequent — `*/10 * * * *` for the outbox worker, which is what this file
  asked for first — is refused. Both crons are daily now: `/api/mail/cron` at
  02:30 UTC (08:00 IST) and `/api/mail/dispatch` at 03:00 UTC. That is enough,
  because dispatch is only a safety net: mail normally leaves within a second
  of the action that queued it, through `after()`.
- **`regions` is a Pro feature.** `["bom1"]` (Mumbai) would put the functions
  next to the institute and next to a Supabase project in that region; on
  Hobby it is simply not allowed, so it is out of the file.

**On upgrading to Pro, restore both** — put `"regions": ["bom1"]` back and set
the dispatch cron to `*/10 * * * *`. Nothing else in the file is plan-specific:
`installCommand` is there because `npm ci` cannot install this lockfile on
Linux (see the CI workflow's comment).

## Environments, and the migration rule

Three environments, with **separate Supabase projects**:

| | Store | Sign-in | Mail |
| --- | --- | --- | --- |
| local | mock (`.local-db.json`) | Mock Authentication | `FileMailer` (`.local-mail/*.eml`) |
| staging | Supabase staging | real LDAP or Google | `MAIL_REDIRECT_ALL_TO` **set** |
| production | Supabase production | real LDAP or Google | live, redirect **unset** |

**Every schema change is a new numbered file, applied forward only.** Never
edit a migration that has been applied anywhere - the early rule of amending
`00000000000001_init.sql` was safe only while no database existed that anyone
cared about. See [21-database.md](21-database.md), and
`npm run check:migrations` for what a project actually has.

## Rotating a secret

Rotation is routine, not an emergency measure. Do it on a schedule, and after
anyone with access leaves.

**The service-role key.** Supabase -> Settings -> API -> *Reset service role
key*. Put the new value in the hosting provider's environment, redeploy, then
confirm the portal reads and writes. The old key stops working the moment it is
reset, so this is a short outage if the redeploy is slow -- do it outside desk
hours.

**`ID_ENCRYPTION_KEY`.** This one needs care: rows encrypted with the old key
must stay readable.

```bash
openssl rand -base64 32          # the new key
```

1. Move the current `ID_ENCRYPTION_KEY` value into `ID_ENCRYPTION_KEYS_OLD`,
   prefixed with its version -- `v1:<old key>`, comma-separated if there are
   already old keys.
2. Set `ID_ENCRYPTION_KEY` to the new value.
3. Redeploy. New writes use the new key; old rows are still read through the
   old one, and are re-encrypted whenever they are written.
4. Keep the old key until the retention window has passed
   (`id_retention_days`, default 365), then drop it.

**`CRON_SECRET`.** Generate, set it in the environment *and* in the cron
configuration, redeploy. The endpoints refuse the old value immediately.

**Mail, Google, LDAP.** Rotate at the source (the mail administrator, the
Google Cloud console, the directory administrators), then update the
environment and redeploy.

After any rotation, read Console -> Audit Log for the period the old secret was
live.

## Backup and restore

Supabase takes daily backups on its paid plans; on the free plan **there are
none**, which is not acceptable for a guest register. Confirm which plan the
project is on before go-live.

**A backup that has never been restored is not a backup.** Run this drill once
before go-live, and then every six months:

```bash
# 1. Dump the production database (read-only; safe at any time).
supabase db dump --db-url "$PROD_DB_URL" -f backup-$(date +%F).sql

# 2. Restore it into a throwaway local Postgres -- never into production.
docker run --rm -d --name gh-restore -e POSTGRES_PASSWORD=pw -p 55432:5432 postgres:16
psql "postgresql://postgres:pw@127.0.0.1:55432/postgres" -f backup-$(date +%F).sql

# 3. Check the numbers agree with production.
psql "postgresql://postgres:pw@127.0.0.1:55432/postgres" -c \
  "select (select count(*) from bookings), (select count(*) from invoices);"

# 4. Throw the copy away.
docker rm -f gh-restore
```

Record the date of the drill and the counts in
[22-running-and-testing.md](22-running-and-testing.md).

**Uploaded documents are not in the database dump.** They live in Supabase
Storage; back up the bucket separately, and remember it holds ID documents --
the copy needs the same protection as the original.

**Restoring into production** is Supabase's own point-in-time restore. Tell the
Guest House Manager before doing it: any booking made after the restore point
is gone, and the office will have to re-enter it.

## Incident response

A personal-data breach here means guests' ID numbers, ID documents or the guest
register. The portal's part is containment and evidence; the institute's own
incident process decides who reports.

1. **Contain** -- rotate the secret involved (above), revoke sessions from
   Console -> Security, and if necessary take the deployment down. A portal
   that is off leaks nothing.
2. **Preserve evidence** -- export Console -> Audit Log for the period, and
   pull the hosting and Supabase logs before their own retention closes.
3. **Report inside 6 hours.** CERT-In's directions of 28 April 2022 require
   specified cyber incidents, data breaches among them, to be reported **within
   6 hours of noticing them**, to `incident@cert-in.org.in` (forms at
   cert-in.org.in). The DPDP Act 2023 separately requires informing the Data
   Protection Board and every affected person. The institute's Data Protection
   Officer / IT Section files these -- contact them first, and do not wait for
   a full diagnosis: an initial report inside the window can be corrected
   later.
4. **Keep the logs** that CERT-In expects Indian ICT systems to retain for
   **180 days**. That is why `audit_retention_days` cannot be set below 180.
5. **Write it up** in [22-running-and-testing.md](22-running-and-testing.md): what
   happened, what was done, and what would have prevented it.

## Retention, in practice

| Data | Kept for | Set where |
| --- | --- | --- |
| Guests' ID numbers and documents | `id_retention_days` after the stay ends (default 365) | Console -> Settings -> Privacy |
| Audit log | `audit_retention_days` (default 180, which is also the floor) | Console -> Settings -> Privacy |
| The booking itself | Indefinitely -- it is the guest house's own record | -- |
| Mail outbox | Kept; it is the evidence that a notice was sent | -- |

`/api/mail/cron` runs the erasure nightly. Check Console -> Audit Log after
changing a retention Setting: the change is recorded, and so is what the next
run deleted.

## Branch protection

The repository should not accept a push straight to `main`.

On GitHub: **Settings -> Branches -> Add branch ruleset**, targeting `main`:

- Require a pull request before merging (1 approval).
- Require these status checks to pass: `Lint, types and unit tests` and
  `End-to-end journeys` -- the two jobs in `.github/workflows/ci.yml`.
- Require branches to be up to date before merging.
- Block force pushes and deletions.
- Require conversation resolution before merging.

For a one-person repository, keep the status checks and the force-push block
even if the approval requirement is relaxed: the checks are what stop a broken
migration or a failing journey from reaching production.

**Never add a repository secret that can reach the hosted project.** CI is
offline by construction -- it runs with `NEXT_PUBLIC_SUPABASE_URL` empty and
`MAIL_DRY_RUN` on, against the mock store on a throwaway file.

---

# Part 3 — Still to be settled with the institute

Everything in Parts 1 and 2 is ours to do. This part is not: it needs an
answer, a mailbox, a machine or a signature from someone else, and at an
institute each of those takes weeks of calendar time that no amount of coding
speed shortens. **Send the asks before they are needed.**

Carried over from the production plan of 2 Sep 2026, which is otherwise
executed (its reasoning, phase by phase, is in
[02-decisions.md](02-decisions.md)).

## Ask the Computer Centre (`netadmin@iitpkd.ac.in`)

Send one email listing all of it, not one ask at a time.

| --- | --- | --- |
| Which identity provider backs `iitpkd.ac.in` and `smail.iitpkd.ac.in` | Decides the whole login implementation | Almost certainly Google Workspace — the institute runs Google Sites on `sites.google.com/iitpkd.ac.in`. Confirm rather than assume. |
| An OAuth 2.0 client (client id + secret) with an authorised redirect URI | Sign in with institute account | Needs a named requesting department — get the Administration Section to co-sign |
| Whether a central SSO / LDAP exists that they'd prefer you use | They may not want a new OAuth client | If `dashboard.iitpkd.ac.in` has a login, ask what it uses |
| A sending mailbox, e.g. `guesthouse@iitpkd.ac.in`, plus SMTP relay access | Sending mail as the institute | See Phase 2 |
| A subdomain — `guesthouse.iitpkd.ac.in` — and a TLS cert | Nobody trusts `guesthouse-iitpkd.vercel.app` | May be routed through their reverse proxy |
| Hosting: campus VM or external | Decides your deployment target and whether you get a static IP | See "Hosting" below |
| Whether outbound internet is available from that VM | Supabase, if hosted, is external | Some institute VMs are LAN-only |

### Ask the Administration Section

## Ask the Administration Section and the guest house office

- **Written sign-off on the current workflow.** Print the pipelines
  ([10-roles-and-workflows.md](10-roles-and-workflows.md) Part 2) and get them
  initialled. Whoever gave the spec should confirm it is still what they want.
- **The authoritative hostel list and the current wardens**, in writing, from
  the Hostel Office. The seed uses Malhar and Saveri; public sources list
  Bageshri, Brindavani and Tilang, and **Bageshri appears to be both a hostel
  and a guest house**, so this cannot be guessed.
- **Every rate and its effective date**, including the **extra-bed rate**,
  which has no default at all - an invoice for a room with an extra bed cannot
  be issued until one is entered.
- **The ID retention period.** A number, to replace the 365-day default.
- **Each department's HOD**, and **each council's and club's Faculty Advisor
  and secretary mailbox**, from the Students' Affairs Council. Nobody can book
  for a club until its advisor is named.
- **Whether `ro` on the debitable-heads spreadsheet is the Registrar's
  Office** - that is an inference from the mailbox name - and what a **newly
  added office** may charge by default ([§2](#2-the-debitable-heads-as-the-office-gave-them-8-oct-2026)).
- **The GST treatment.** The tariffs are read as **including** GST (18% rooms,
  5% food), so the guest pays the tariff and the taxable value is backed out.
  If the office's rates are before GST, untick "Rates include GST". And confirm
  that damage or loss recovered from a guest ("Other" charges) carries no GST.
- **The guest house phone, email, house rules and photo attribution** -
  everything tagged `TODO(site)` in `lib/site.ts` and `lib/site-content.ts`.
- **Who owns this after us.** The current developers graduate in 2027. If no
  institute staff member is named as owner, the portal becomes unmaintained
  software holding ID data. Name someone now and build for the handover.

Also, from the academic office or IT: **the academic database API and token**
([11-booking-forms.md](11-booking-forms.md) Part 2). No longer blocking - since
7 Oct 2026 the office keeps the records itself - but it is still the eventual
source.

## Hosting

Still an open decision.

| Option | For | Against |
| --- | --- | --- |
| Campus VM (Docker + Node) | Data stays on campus, static IP for the SMTP relay, no vendor spend, institute IT already runs VMs | You own patching, backups, TLS renewal, uptime |
| Vercel + Supabase Mumbai region | Zero ops, previews, automatic builds | External hosting for ID documents needs institute approval; no static outbound IP on the free/Pro tier |

Recommendation: **campus VM if IT will give you one.** It removes the data
residency conversation entirely, gives a static IP that makes the Google SMTP
relay trivial, and an institute service should outlive a personal Vercel
account. Ship to Vercel only if the VM ask stalls, and keep the app portable -
nothing in the current code is Vercel-specific.

## The legal side, which is the part with real exposure

Not legal advice — but these need a decision from the institute, in writing,
before go-live.

### Reconsider collecting Aadhaar at all

The portal stores Aadhaar numbers and full scans. Handling Aadhaar carries
specific statutory obligations under the Aadhaar Act, and UIDAI guidance
discourages storing the number where an alternative exists. **A guest house
does not need it.** A cheaper and safer design:

- accept **any** government photo ID, with the type recorded;
- store only the **last four digits**, never the full number (the portal
  already shows only the last four everywhere);
- keep the scan only until check-in is complete, then delete it on a schedule
  (the retention job already does this after `id_retention_days`);
- or best: verify the ID physically at the desk and store only "verified by,
  on".

Ask the Administration Section what the data is actually for. If the answer is
"the register at the gate", the scans need not be stored at all, and dropping
that requirement removes most of the risk from this project.

### DPDP Act, 2023 — what is built, and what still needs a person

The Rules were notified on 13 November 2025, with substantive obligations due
by **13 May 2027** — inside this system's operating life.

**Built** (Phase 8, 22 Sep 2026 — see
[05-credentials-and-security.md](05-credentials-and-security.md)): a versioned
consent notice at the point of collection, purpose limitation, a nightly
retention and deletion job, access / correction / erasure requests handled from
the dashboard and Console → Security, and an audit trail of each.

**Still needs a person, not code:**

- **a named grievance officer**, published on the site;
- **someone watching for a breach** — notification is due to CERT-In within
  **6 hours** and to the Data Protection Board and the affected people under
  the DPDP Act;
- **the consent standard for minors.** Many requesters are parents of students,
  and some guests may be minors, which is stricter. Raise it; do not decide it
  here.

## Rollout order

1. **Pilot with one category.** Employees only, for three weeks. Smallest
   pipeline, most forgiving users, and it exercises the manager console fully.
2. **Run in parallel** with email and paper. Do not switch the old process off
   until the manager stops using it voluntarily.
3. **Train the manager first**, then the wardens. One page each, with screenshots.
   The manager is the single point of failure in every pipeline.
4. **Then students**, which is where the volume is. Announce through the usual
   student channels.
5. **Alumni and officials last** — lowest volume, highest visibility, most
   embarrassing place to find a bug.
6. **Publish a runbook**: how to reset a password, add a warden mid-year, restore
   a backup, what to do when mail stops. Written for the person who takes this
   over from you.

---

