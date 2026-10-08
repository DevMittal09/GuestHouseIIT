# What the production build needs — the single checklist

Written **8 October 2026**, when the owner said that most of what the office is
now asking for is about **the real deployed portal, not the demo**: the real
accounts, the real debitable heads, the real mail. This file is the one place
that records what a production build has to have, who has to supply it, and
what is still only a demo convenience.

It is a checklist, not a design document. Why each thing is the way it is lives
in [03-decisions.md](03-decisions.md); how to deploy is
[24-deployment-runbook.md](24-deployment-runbook.md); what is left overall is
[04-roadmap.md](04-roadmap.md). Where those and this file disagree, **this one
is about production and wins for production**.

---

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
| Role | What they can do - see [10-roles-and-features.md](10-roles-and-features.md) | Defaults to Student on a new row, which is rarely what is meant |
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

Every persona in [30-credentials-and-access.md](30-credentials-and-access.md)
signs in with a password **published in this repository**. Delete them, or the
portal has a dozen known logins. `lib/ldap/mock-directory.ts` only answers when
`LDAP_URL` is unset, so connecting the directory closes that door - but the
`profiles` rows stay until somebody removes them, and Google sign-in would
accept any of those addresses.

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

---

## 3. Data the office has to supply

| What | Where it goes | Until it is there |
| --- | --- | --- |
| **The people** | Users & Roles (spreadsheet paste) | Nobody but the demo personas can sign in |
| **LDAP usernames** | Users & Roles → Import LDAP usernames, or the `ldap_uid` column of the same paste | Those people cannot sign in |
| **Academic records** - students first | Console → Academic records (CSV paste, migration 28) | Every lookup falls through to the published dummy records, and a student types their parents' names instead of having them locked |
| **Departments, clubs, offices and their heads** | Departments & Clubs | An official booking's HOD stage is skipped, and the log says so |
| **Each council's and club's Faculty Advisor** and secretary's mailbox | Departments & Clubs → Faculty Advisors | **Nobody can book for that club at all** |
| **Hostels, and a warden per hostel** | Settings → Hostels; Users & Roles | A student's request has no reviewer |
| **The official email whitelist** | Settings | Those offices cannot book as an office |
| **Tariffs**, including an **extra-bed rate** | Tariffs & Invoicing | An invoice for a room with an extra bed cannot be issued at all |
| **GSTIN, bank details, Accounts email, guest house contact** | Tariffs & Invoicing | Invoices print the template's values; nothing is mailed to Accounts |
| **The house rules** (Guidelines §7-8) and the amenities | `lib/site.ts`, `lib/site-content.ts` - `grep -rn "TODO(site)"` | The public site shows plausible placeholders |
| **Photographs**, and which guest house each shows | `public/site/photos/` | The gallery is grouped by subject, never by guest house |

---

## 4. Secrets and switches

The full table is in
[24-deployment-runbook.md](24-deployment-runbook.md#environment-variables).
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
[23-running-and-testing.md](23-running-and-testing.md). Checking which ones a
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
  ([26-security.md](26-security.md) §6): either stop creating Auth users for
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
  ([03-decisions.md](03-decisions.md)). Two identities at once need two browser
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
- [ ] `MAIL_REDIRECT_ALL_TO` unset, and a test message from
      Console → Mail Outbox actually arrived
- [ ] Both cron routes scheduled and `CRON_SECRET` set
- [ ] A booking taken end to end on the production deployment, by a real
      requester, approved, allocated, invoiced and paid - **then deleted**
- [ ] Backups confirmed on the Supabase plan, and the restore drill run
