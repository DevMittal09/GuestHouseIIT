# Roadmap — what is open, in priority order

## Meeting follow-ups - 9 November 2026

Implemented: room classes, VIP groups, Director-only isolation, named manager tariffs, official stay-length exemption, FCFS queues, cancellation notice, original-date preservation, caretaker invoice permissions, informational sidebar and editable guidelines link. This supersedes the earlier deferred named-category design in §2j.

Still requires office input:

1. Authoritative catering PDF (not present in attachments/repository). Meeting times are implemented provisionally.
2. Faculty reservation start/end dates for A1–A3. Reserved indefinitely until explicitly released; no three-year start was invented.
3. The actual Google Drive guidelines URL. The field is ready; the button stays hidden when empty.
4. Whether the 14-room cap is per selected house (current implementation) or shared across both. It is a cap on free counts, separate from physical inventory and access restrictions.
5. Alternative labels “Hamsanandi A1–A4/D1–D4, Bageshri B1–B10” have no verified mapping to the live inventory; no existing room was renamed.
6. The requirement names Personal/Official only, while established IAR alumni bookings have required alumni details and separate funding. That specialised workflow is preserved pending an explicit decision to retire it.

No waiting-list automation exists; cancellation releases rooms for manual FCFS allocation. Deployment steps are in [04-production.md](04-production.md).

---

The single list of what is **left**. Three neighbours, and the boundary
between them matters, because keeping one item in two places is how this
folder drifted before:

- **[04-production.md](04-production.md)** owns everything about the
  production deployment - the checklist of what it needs, how to deploy it,
  and what must be settled with the institute. This page names the *gates* and
  points there; it does not restate them.
- **[02-decisions.md](02-decisions.md)** owns why anything was done the way it
  was, including what was deliberately **not** built.
- **[99-recent-changes.md](99-recent-changes.md)** owns the last round only.

Rewritten **24 Sep 2026** after a full audit of these notes against the code,
and reorganised **10 Oct 2026**. The portal is feature-complete for every
workflow the institute has specified and has been through a ten-phase
production-readiness programme; it is **not deployed for real use**.

The repo-root [`setup.md`](../setup.md) is the consolidated implementation,
dependency, migration and deployment guide. This roadmap remains the source
for what is still open; the production checklist is in
[04-production.md](04-production.md).

---

## 1. Gates before real bookings go on it

Each of these is configuration or plumbing, not new design.

| # | Gate | Why | How |
| --- | --- | --- | --- |
| 1 | ~~Connect the institute's LDAP~~ **— closed, 2 Nov 2026.** LDAP removed entirely (the owner: "Keep only Google OAuth"). `lib/ldap/` deleted, `ldapts` removed, no LDAP door exists. `ldap_uid` column removed from the code and schema | Configure Google (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `APP_URL`). The flow is built and verified. [`GOOGLE-SIGN-IN.md`](../GOOGLE-SIGN-IN.md) at the repo root |
| 2 | **Close Mock Authentication** — **reopened, 7 Nov 2026.** `/mock-login`, `loginAs` and `mockLoginEnabled()` came back (the owner: "make a mock authentication for this instead of sign in with password"). Outside production the picker is always open; **in production it is open while Google is unset**, so configuring Google is what closes it | Configure Google, or set `MOCK_LOGIN=false`. `MOCK_LOGIN=true` is already a startup error in production |
| 3 | **Production secrets** | The server refuses to start without them | `APP_URL`, `CRON_SECRET`, `ID_ENCRYPTION_KEY`, `DATABASE_URL` ([05-credentials-and-security.md](05-credentials-and-security.md)) |
| 4 | **Change the console password** | Default `0000` | Console → Console Access |
| 5 | **Delete or disable the demo personas and demo data** | They are listed by name on `/mock-login`, and anyone who reaches that page can become any of them | Users & Roles, or `npm run seed:personas -- --keep-extra` against a database that has the real people. Closing the picker (gate 2) is the other half |
| 6 | **Apply every migration to the production database** | Missing ones fail writes quietly | **`npm run check:migrations`** asks the project and names what is missing. Do not write the answer down instead — that is how 24-30 were believed missing for weeks after they were applied |
| 7 | **The office's Settings** | Defaults are guesses: extra-bed rate (none), GSTIN, Accounts email (empty), bank details, retention days, heads of units, Faculty Advisors, hostels and wardens, whitelist | [04-production.md](04-production.md#3-data-the-office-has-to-supply) |
| 8 | **Decide `MAIL_REDIRECT_ALL_TO`** | Unset only in production; set everywhere else | |
| 9 | **Backups** | A regular backup strategy is needed | Confirm the plan; run the restore drill |
| **10** | ~~Close the GoTrue / PostgREST door~~ **- closed, 2 Nov 2026.** Supabase removed entirely. Direct Postgres via `pg` driver. No Supabase Auth, no GoTrue, no PostgREST. `init-postgres.sql` has no `auth.users` reference, no `authenticated` policies, no seeded passwords | N/A |
| **11** | ~~Make the user import atomic, or batch it~~ **- no longer a gate, 14 Oct 2026** | Two of the three problems are closed: the **inserts** are chunked (250 a request, so a first load is ~8 requests instead of ~2000), and a failure now **records where it stopped** - migration 32's undo record is written before the writes, so a part-way import is recoverable instead of a mystery | What remains is that the **updates** are still one request per person, which cannot be chunked (each row has different values). Mitigation in [04-production.md](04-production.md) §1a.6: read the plan's "updated" count, import in pieces when it is large, and undo if it times out. The remaining fix is a single upsert |

| **12** | **Stop finding an account by scanning every profile** - **new, 28 Oct 2026** | The Google callback and `profileForDirectoryEntry` both do `listProfiles()` then `.find()`. With direct Postgres this is a full table scan — not truncated silently as it was under Supabase's PostgREST (which capped at 1000 rows), but still inefficient at scale. Past a few thousand accounts this becomes slow | Add `getProfileByEmail` to `DataStore` and **both** stores and use it in the callback — `init-postgres.sql` already has `profiles (lower(email))` for this. [`GOOGLE-SIGN-IN.md`](../GOOGLE-SIGN-IN.md) §7 has the code |

| **13** | **A profile with a `security_audit` row cannot be deleted** - **new, 7 Nov 2026** | `security_audit.actor_id` is `on delete set null`, and that table's append-only trigger refuses every UPDATE - so `delete from profiles` fails with "security_audit is append-only" for any account that has ever signed in. The console's Delete user hits this as much as a script does, and the error names neither table | Either let `security_audit_guard()` allow an UPDATE that only nullifies `actor_id`, or make the FK `on delete no action` and have the application retire the account instead. `npm run seed:personas` already retires rather than deletes; the console should say so too |

**Next security phase** (not a gate for a pilot, but the next real step):
move request-scoped database access off the service-role key so row-level
security becomes the boundary rather than a second line behind the server
([05-credentials-and-security.md](05-credentials-and-security.md), "What is
deliberately not done yet").

## 2. Loose ends from the 24 and 25 Sep 2026 rounds

- ~~Apply migration 26 to the hosted project~~ — **done; verified 9 Oct 2026**
  with the rest (`npm run check:migrations`).
- **Confirm the GST treatment with the office's accountant** (25 Sep 2026):
  the tariffs are read as **including** GST at 18% on rooms and 5% on food
  (Settings → Tariffs & Invoicing, "Rates include GST"), so the guest pays the
  tariff and the taxable value is backed out; if the tariffs are before GST,
  untick it. And that damage or loss recovered from a guest ("Other" charges)
  carries no GST.
- **The hosted invoice Settings row** is upgraded to 18% / 5% on read the
  first time; saving Tariffs & Invoicing once writes it (revision 2).
- ~~Office to confirm "Fill in from saved details"~~ — **answered 7 Oct 2026**:
  withdrawn for every role, with "Yourself". A student's parents come from the
  academic record and are locked instead.
- **Unset `MAIL_REDIRECT_ALL_TO` in the Vercel environment.** While it is set
  every message goes to that one mailbox and **CC is dropped**, so no "Copy
  to" address receives anything — the office's 1 Oct report. `/admin/mail`
  shows a red warning naming the mailbox whenever it is set. Keep it on any
  staging deployment.
- ~~Apply migrations 24 – 30 to the hosted project~~ — **done; verified
  9 Oct 2026.** `npm run check:migrations` asks the project itself and reports
  **1 – 30 all applied** (`azfd…`). It had said otherwise here for weeks
  because nobody could check: the recipe in
  [22-running-and-testing.md](22-running-and-testing.md) listed markers only up
  to migration 25, so the claim was carried forward by hand after the owner had
  already applied them. **Run the script rather than writing the answer down
  again.** Migrations **17 and 23** are function-only and it cannot see them;
  the one-line SQL for those is in the same file.
- **Find out whether migrations 31, 33 and 34 are applied, and record it.**
  Re-probed 27 Oct 2026: **32 is now in** (it had been recorded as deliberately
  not applied), so somebody applied at least one of the four. 31, 33 and 34 add
  only a dropped constraint, policies, a trigger and indexes, which PostgREST
  cannot see, so the script names them and prints the SQL. **31 is the one that
  matters**: without it `createProfile` fails outright and the 38
  `authenticated` policies are still behind any GoTrue JWT. Paste the four
  queries ([04-production.md](04-production.md) §5, also in
  [`DATA-REQUEST-AND-IMPORT.md`](../DATA-REQUEST-AND-IMPORT.md) §3.2).
- **Create the units on the hosted project.** `units` is **empty** there
  (measured 27 Oct 2026), so no `unit` value can be imported and **no faculty
  official booking has an HOD stage at all** - it is skipped, logged, and
  reaches the desk unapproved. Eleven departments, their department offices,
  the officer offices, the clubs and councils; how each is modelled is
  [`DATA-REQUEST-AND-IMPORT.md`](../DATA-REQUEST-AND-IMPORT.md) §4.2. This
  blocks the user import, not just HOD routing.
- **Decide the student-record policy before the institute's sheet is
  requested.** A student record with **one** parent named and the other blank
  withholds the missing parent from the form entirely - that student cannot
  book for their mother at all (`guestNameRule`). A record with **neither** is
  harmless, and **no record at all** leaves the form fully open. So a
  half-filled parent column is worse than an empty one, and the ask to the
  institute has to say so. Reasoning in
  [`DATA-REQUEST-AND-IMPORT.md`](../DATA-REQUEST-AND-IMPORT.md) §5.1.
- **Confirm the institute's real office mailbox addresses before loading the
  office accounts.** `OFFICE_DEBIT_HEADS` narrows an office's budgets on the
  **local part** of its address (`office_ds`, `director_iitpkd`, `ro`…), so an
  office loaded as `datascience.office@` silently keeps the category's wider
  six-head list. The fix is either the real mailbox or a new `aliases` entry,
  which is a code change - so it is much cheaper to ask first.
## 2a. Loose ends from the 8 Oct 2026 round

- ~~Confirm whether the Special Budget approval upload should be mandatory~~ —
  **answered 9 Oct 2026: it stays optional.** The details box beside it is
  mandatory; the upload is offered and not required, so a requester waiting on
  a scan is not stopped from booking and the desk can ask for it later.
  [04-production.md](04-production.md) §2 still
  records how to flip it if the office changes its mind.
- **An imported profile still creates a Supabase Auth user** with the password
  `password123` in Supabase mode. Harmless - that password is not a portal
  login, everyone signs in through LDAP or Google - but wrong at six hundred
  rows. Settle it when request-scoped database access moves off the
  service-role key: either stop creating Auth users for imported profiles, or
  create them with a random unusable password.
- **Load the real accounts** once LDAP is connected: Users & Roles → **Import
  from spreadsheet**, with the `ldap_uid` column or the separate LDAP import.
  The per-field guide is
  [04-production.md](04-production.md) §1.

- **Then import the real records** (7 Oct 2026): Console → **Academic
  records** → Students first, since that is the list the booking form locks
  parents' names against. A student who is not in the import simply types
  their parents' names, as before — nothing breaks, the rule just does not
  apply to them.
  Migration 25's backfill will name the old `fa.petrichor` account Petrichor's
  advisor — replace it with a faculty member in Departments & Clubs → Faculty
  Advisors.
- **Name each council's Faculty Advisor and secretary's mailbox.** Only
  Cultural Affairs (`sec_arts@`) is seeded. The owner's other example was
  `sec_acad@`; the Technical Affairs mailbox and the rest of the councils are
  not known. Councils need a `club`-role account (their secretary's mailbox)
  for the advisor to book *for the council itself*.
- **Check the hosted `form_configs`** for `employee` and `official`: the lighter
  defaults (name + gender; gender only) reach only a role with no saved row.
- **Merge `main` and `ui`.** `ui` holds only the 21 Sep vermilion redesign and is
  far behind; a trial merge gave 30 conflicting files, `booking-form.tsx`
  worst.
- **Sub-heads are free text.** If the office supplies each project's
  sub-heads, they belong on `projects` and the box becomes a list.
- A developer's old `.local-db.json` keeps the retired `fa-petrichor` account;
  delete the file for a clean demo.

### From the eighth list (7 Oct 2026)

- **Migrations 28 and 29 on the hosted project, then the real records** — see
  §2 above. These are the only two things in the round that are not already
  live in the code.
- **Confirm the lines under the GSTIN.** The office asked for "lines under the
  GSTIN removed", so **all** of them went on version 4 — the per-SAC
  taxable / CGST / SGST breakdown *and* the note that the tariff rates include
  GST. The breakdown is still computed and kept in every snapshot, so
  restoring either is a one-line change to `printsTaxLines` in
  `lib/invoice.ts`. Worth asking whether they meant the GST-inclusive note
  too.
- **The academic lookup cache is per server instance.** An import clears the
  cache on the instance that served it; another instance catches up within ten
  minutes (`ANSWER_TTL_MS`). Fine for a card, and worth knowing now that the
  booking form locks names from it — if the office ever reports a corrected
  parent name "not taking", that is the ten minutes.
- **The .docx template is two revisions behind the PDF** (see below).

### From the supervisor's review (30 Sep 2026)

- **Photographs — AM** ("Take couple of photos – AM"): new photos of the
  guest houses, to go through the recipe in
  [14-public-site-and-ui.md](14-public-site-and-ui.md#photographs). Ask
  which guest house each shows, so they can finally be attributed.
- **Fix the .docx typo**: `public/GHM_Invoice.docx` reads "GST @ 5% on B (D)";
  the PDF prints "on C (D)", as the supervisor's list does. (The PDF has moved
  on again — version 4, 7 Oct 2026 — so the .docx is further behind: it still
  shows the blank room row and the tax lines under the GSTIN.)
- **Add Self to a saved student form** on the hosted project, if
  `form_configs` holds a `student` row (Form Builder → relationship options
  and One of each, or Reset to spec defaults). Since "Yourself" went on 7 Oct
  2026 this only affects whether a student can *choose* Self; the name is
  typed either way.
- **Office to confirm** that a student may be a guest on their own request —
  the owner's reading of "let the student write their name as well".

## 2b. Loose ends from the 9 Oct 2026 (evening) round

The offices' debitable heads are implemented from the office's spreadsheet
(`OFFICE_DEBIT_HEADS`, `lib/office-debit-heads.ts`); what is left is about the
real deployment and about who may edit the table.

- **Point the rows at the real office mailboxes, and drop the demo aliases.**
  The key is the mailbox before the `@`, and Mock Authentication means three
  rows carry an alias so the demo personas are narrowed today: `admin` and
  `director.office` → Director Office, `cse.office` → `office_cs`,
  `registrar` → `ro`. Harmless, but they will drift once the real accounts
  exist. [04-production.md](04-production.md) §2.
- **Ask the office to confirm `ro` is the Registrar's Office.** The row is
  under "Administration" and the mailbox name is the only evidence; the
  whitelisted `registrar@iitpkd.ac.in` is aliased to it on that reading.
- **Give the table a home the office can edit.** Settings → Debitable heads
  edits the *category* lists; the per-office rows are a constant. An editable
  version is a column on `units` (a migration) plus a grid in Departments &
  Clubs. Deliberately not built while the offices it keys on are not accounts
  yet - and `narrowToOffice` is the only place the narrowing happens, so the
  change stays local. **Until then, a new institute office is a code change**,
  or it is offered all six heads.
- **The office has not said what a *new* office may charge by default.** The
  code keeps the category's six, which is the permissive answer; if the
  office would rather a mailbox it has not mapped could charge nothing, that
  is one line in `narrowToOffice` and a worse failure mode (a new office
  cannot book at all). Worth asking when they next revise the list.

## 2c. Opened by the 11 Oct 2026 round

- **The Approval card disappears when the console changes.** An office's
  Direct / Requires HOD approval question is now put only while its HOD unit
  has a head (`asksOfficeApproval`), so **naming or clearing a head in
  Departments & Clubs changes which questions that office's form asks**.
  Nothing warns the person doing it, as `lib/settings-impact.ts` would for a
  Setting. Low risk - the route is unchanged either way for a booking already
  waiting (`office_approval` is stored) - but worth a line in the Faculty
  Advisors / heads grid if the office ever asks why the card came and went.
- **Nothing states the convention on a form that has no star.** The note is
  rendered by the three forms that star a field; a fourth that starts starring
  one has to render it too. There is no lint for that - `AGENTS.md` and
  [14-public-site-and-ui.md](14-public-site-and-ui.md) carry the rule.

## 2d. Opened by the 11 Oct 2026 design pass

Presentation only; nothing here blocks anything.

- **The console's other thirteen sections were not gone through one by one.**
  They inherit the type scale, the primitives and the one-line empty state, so
  none of them looks like the old build - but **Users & Roles was the only one
  whose table was measured against its container** and narrowed to fit (name
  over email in one cell, role as plain text). Tariffs & Invoicing, All
  Bookings, Departments & Clubs and Academic records all carry wide tables and
  may still overflow their container at 1440px, which hides whatever is in
  their last column. Measuring one is a two-line script - the recipe is in
  [22-running-and-testing.md](22-running-and-testing.md).
- **"Type of booking" is still a numbered section with nothing to answer** for
  a role with one booking type - a student sees a card headed 1 whose body is
  the word "Personal". The pay-at-checkout note beside it stopped being a
  numbered card this round for exactly that reason; this one was left because
  the value is a real answer being recorded, not a sentence. Worth asking the
  office whether a student's form should open on **Stay details**.
- **Nothing enforces the type scale.** A new heading can still be written as a
  one-off `clamp()`, and `cn()` will now keep it. The five steps are in
  `app/globals.css` and [14-public-site-and-ui.md](14-public-site-and-ui.md);
  there is no lint rule.
- **`StatusBadge` is still the one place a colour means a state**, and the
  GOV.UK tag palette behind it was not revisited. If the office ever asks for
  fewer colours, that is the file.

## 2e. Opened by the 12 Oct 2026 rounds - the configurable approval workflow

Nothing here blocks anything; the feature works and is tested. These are the
edges it deliberately did not take. The second round of 12 Oct replaced the
**screen** (one chain per kind of request; the route list behind Advanced) and
closed none of these, because every one of them is about the engine.

- **The office cannot name a new waiting status.** A route is built from the
  four intermediate slots in `booking_status`, each at most once, and a stage
  renames the slot rather than adding one. A fifth stage is a migration, and
  Postgres cannot *use* a new enum value in the transaction that adds it
  (migration 29), so a console that could name one would need a migration per
  stage applied by hand before the stage worked. Four is twice the deepest
  chain the institute has asked for. If it is ever asked for, the honest
  shape is a batch of spare slots added in one migration, not a console that
  writes DDL.
- **`PENDING_GH_MANAGER` is not configurable**, so no route can end anywhere
  but the desk - see [02-decisions.md](02-decisions.md) ("The last stage is
  always the Guest House Manager"). Deliberate: approval there is room
  allocation.
- **The four queue pages are still four pages.** Each has grown something the
  others do not need - the warden's academic-record panels, the IAR Office's
  alumni card, the HOD's "HOD for X" caption - so a route pointing somebody
  at a slot sends them to the page that already exists for it, under that
  slot's own name unless every route renames it the same way
  (`configuredStageName`). One generated queue page per configured stage
  would be tidier and would lose those three things.
- **Changing a unit's head still changes routing with no warning**, as
  §2c already noted for the Approval card. The workflow's own impact check
  (`approvalRouteBlockers`) runs when the **routes** are saved, not when a
  head is cleared in Departments & Clubs, so a route that reads
  "the HOD for the requester's department" can quietly become unstaffed
  later. The booking's log says so at submission, and `canReview` keeps the
  request actionable, but nothing tells the person clearing the head.
- **No per-guest-house routes.** A condition can narrow by requester role,
  booking type, service, employee category, the office's own choice, the
  requester's unit and the requester's hostel - not by which guest house is
  asked for. Nobody has asked; the field would be one more entry in
  `ApprovalRouteWhen` and one more `CheckRow` under Advanced. It would not
  appear on the flow screen, which has no conditions on it at all.
- **"Try it" is the one part of the screen still shaped like the engine.**
  It asks for an account, a booking type, a service and an office's choice as
  four separate selects, which is the vocabulary the rest of the screen stops
  using. It could ask for one of the eleven kinds of request instead, and show
  the answer against that kind's own card. Left as it is because it names real
  people, which is what it is for, and because changing it would change the
  one control the office has already been shown twice.
- **A kind of request is a constant, not a Setting.** `REQUEST_CATEGORIES` is
  eleven entries in code. A twelfth - "faculty from one department", say -
  is a route under Advanced, and it shows on no card. The honest fix if the
  office starts wanting them is to derive the cards from the routes rather
  than the other way round, which needs a name and a representative request
  stored on each route.
- **The routes are not in `04-production.md`'s checklist** because the
  defaults are the institute's own pipeline and need no filling in. If the
  office decides a different chain before go-live, that becomes a row there.

## 2f. Opened by the 13 Oct 2026 rounds (the schema review and the fix), worked again on 14 Oct

The review is in [02-decisions.md](02-decisions.md) under 13 Oct 2026, the fix
in the entry after it; the normalization findings are in
[21-database.md](21-database.md); the runbook is
[04-production.md](04-production.md) §1a. **The schema needs no migration to
hold the college's data** - migration 31 is a security fix, not a modelling
one.

**Done in the second round of 13 Oct:**

- ~~Close the GoTrue / PostgREST door~~ - in code; gate 10 above has the two
  production steps left.
- ~~No test asserts the RLS surface~~ - `tests/rls-surface.test.ts`, 7 checks,
  mutation-verified.
- ~~`profiles` has almost no indexes and no check constraints~~ - migration
  31.
- ~~Nothing proves a re-import keeps profile ids~~ -
  `tests/user-import-idempotency.test.ts`, 9 checks.

**Done in the round of 14 Oct 2026:**

- ~~The email/password provider is unverified~~ - verified from GoTrue's public
  `/auth/v1/settings`: **enabled, with signup open**. It is now step 1 of
  [04-production.md](04-production.md) §1a.1, ahead of the migration, because
  it is a toggle and the portal does not use the provider.
- ~~`guest_houses.total_rooms` can drift~~ - migration 33's trigger.
- ~~No undo for an import's *updates*~~ - migration 32 and
  `lib/users-import-undo.ts`. Not the "before/after in the audit payload"
  suggested here: the audit log is purged, and the record has to be written
  **before** the writes so a failed import is recoverable too. §1a.7 has the
  procedure.
- ~~Foreign keys with no index~~ - migration 34, 20 of them, measured.

**Still open:**

- **Gate 10's production steps, then gate 11.** Nothing below is a blocker for
  the import; these are. Gate 10 is now four migrations plus the provider
  toggle and the Auth-user repair, in the order §1a.1 gives.
- **An import's *updates* are still one request per person.** The inserts are
  chunked (250 a request); the updates cannot be, since each row has different
  values. A sheet that mostly changes existing people can still exceed the
  platform's request timeout at ~2000 rows. The undo makes that recoverable
  rather than a mystery, which is why this is no longer a gate - but the real
  fix is a single upsert, which needs the `ldap_uid` swap handled inside it
  (the unique index is checked per row unless the constraint is deferred).
- **Nothing purges `user_import_batches`.** Each row holds the before-state of
  the accounts one import touched, so a year of monthly imports is a slowly
  growing copy of parts of the directory. It is service-role-only and small,
  but it is personal data with no retention rule - unlike `security_audit`,
  which has `purge_security_audit`. Wanted: the same, never below whatever
  period the office wants an undo for.
- **The undo is not offered for the institute-records import.** That importer
  (`lib/institute/import.ts`) is all-or-nothing and keyed on `lower(email)` the
  same way, and it overwrites a student's parents' names - which is what the
  booking form locks a guest to. Migration 32's table is deliberately shaped to
  take a `kind` column if this is wanted.
- **Add `profiles` and the `institute_*` tables to whatever is used as a
  pre-import snapshot.** The documented drill - `supabase db dump` - already
  covers them; the ad-hoc JSON export kept outside the repo does not, and must
  not be mistaken for a backup. The undo record is a safety net for one import,
  **not** a substitute for this.
- **No deactivation story for people who leave.** `profiles` has no
  `is_active`, and `deleteProfile` refuses anyone with a booking (correctly -
  it would orphan the history), so repeated imports only accumulate. Wanted:
  a flag that hides someone from pickers and refuses them a session without
  touching their bookings. Not urgent until the first graduation after
  go-live.
- **`MAX_USER_IMPORT_ROWS` is 2000 and the institute is larger.** The paste has
  to be split anyway while the updates are sequential, so this is a ceiling to
  remember rather than a bug.
- ~~`department_or_club` duplicates `unit_id`~~ **Done, 4 Nov 2026.** The column
  is eliminated from `profiles` and computed at read time from `units.name`
  via `unit_id`, along with `roll_number` and `staff_category`.
- **Migration 31 is the first migration that is not optional once the code is
  deployed.** `createProfile` cannot work on a database still on 30. If the
  project ever gains a real deploy pipeline, this is the case that argues for
  gating a release on the migration having run.

---

## 2g. Opened by the 14 Oct 2026 (later) round - the office's twelfth list

Four of the five items closed outright. What they opened:

- **The portal publishes no privacy notice and collects no consent, and that
  is the institute's call to make.** Updated the same evening: the tick and
  its paragraph came off the request at the office's request (and the stored
  consent with them, rather than being fabricated - `createBooking` writes
  neither `privacy_notice_version` nor `privacy_consent_at`), and then the
  owner asked for the whole feature to be withdrawn. The page, its version and
  its three links are in **`archive/privacy-notice/`**, which is also the
  restore ([02-decisions.md](02-decisions.md), two entries).
  **To settle with the institute** (and so also listed in
  [04-production.md](04-production.md) §4 and its "DPDP Act, 2023" section):
  whether the portal must publish a notice at all, and whether a booking must
  carry a recorded consent. If the institute has a notice of its own that
  covers the portal, linking to it is a line in the footer; if not, the
  archive's README restores this one in four steps with no migration.
- **The archive is now a thing to maintain.** `archive/README.md` holds the
  rule that keeps it undeployed - excluded from `tsconfig.json` and
  `eslint.config.mjs`, collected by neither test runner, imported by nothing.
  A second archived feature goes in beside it with its own restore and a row
  in that table; an archived feature that is restored is **deleted** from
  there in the same change, or the live copy and the archived copy start to
  drift and the wrong one gets edited.
- **A deployment that has saved the Booking window Setting keeps one month.**
  The default is now six, and a saved `rules.booking` row beats it. Nothing
  reads as broken - the form, the Guidelines and the error all quote the
  stored figure - so the only way to notice is to look. Open Settings once on
  any deployment that has pressed Save there. There is deliberately no
  `revision` upgrade for this group ([02-decisions.md](02-decisions.md)).
- **The header line on `/availability` still says "N free all month".** The
  office asked for the equivalent sentence to come off the **booking form**
  and said nothing about this one, so it stands. It is the same
  `freeThroughout` figure, and it answers less the longer the window - if the
  office asks again, it is the same removal.
- **Past days are greyed, not clipped, and the navigation is not blocked.**
  A requester can still step back a week and will see seven greyed cells. If
  the office would rather they could not, the cheap version is to disable
  *Previous* for a non-desk reader when the whole previous range has gone -
  but the desk shares those controls, so it has to stay a role question, not
  a date question.
- **Nothing tests the colour of a figure but one e2e assertion.** The green is
  checked by computed style in `e2e/official-and-dining.spec.ts`; the vermilion
  "Full" state and the meter are not. A visual regression test would cover the
  lot, and there is still none ([03-roadmap.md](03-roadmap.md) §5).

---

## 2h. Opened by the 15 Oct 2026 rounds - the photographs, and the slideshow

Every item of both rounds closed. What they opened:

**From the slideshow (second round)** - ~~the arrows, the numbering and the
Pause button~~ were removed on 27 Oct 2026, which closed the items about them.
What still stands, now about the hero:

- **Nothing drives the hero with a keyboard in the suite.** The pause control
  is a real `<button>` with a label and a visible focus ring, and the e2e
  journey clicks it, but no test tabs to it, and none checks that focus inside
  the hero holds the rotation - the behaviour a keyboard reader depends on.
  Nor is `prefers-reduced-motion` exercised; Playwright emulates it in one
  line (`test.use({ reducedMotion: "reduce" })`) and that is the cheap version
  of this item. **Bigger now than it was**, because the pointer no longer
  holds the rotation and focus is the only thing left that does.
- **The e2e journey costs ~15s per project, so ~30s of the suite**, waiting on
  real timers. It is the only honest way to test "it moves by itself". If the
  suite gets slow, look here first - the fix is to make `ADVANCE_MS`
  injectable rather than to delete the assertion.
- **No swipe, and now no arrows either.** A phone reader can pause by tapping
  and wait 6.5s for the other photograph; there is no way to go *back*. With
  two slides that is a small thing. If a third is ever added it stops being
  one - and the fix is touch handlers, not the arrows coming back, which the
  brief removed on purpose.
- **The hero's photographs are a hardcoded list** (`HOME_PHOTOS.slides`), like
  everything else in `lib/site.ts`. Changing which ones appear, or their
  order, is a code change - and these two are also `GUEST_HOUSE_PHOTOS`, so
  changing them changes which photograph the site attributes to each house.

**From the ink panel and the booking doors (later the same day):**

- **`/sign-in` still has its photograph while `/book-room` and `/book-meal` do not.** The owner named the two
  booking doors, so that is what changed, and `SignInPanel` takes an optional `photo` either way. If the
  owner wants `/sign-in` to match, it is deleting one prop.
- **`SIGN_IN_PHOTOS.bookRoom` and `.bookMeal` are unplaced.** Both photographs are still in the Gallery, so
  nothing is orphaned and no test fails; they are kept because restoring either image is one prop. Drop them
  from the registry if the decision settles.
- **The home page's title is the only centred block on the site**, and since
  27 Oct 2026 it is set over the photograph rather than under it. Centring the
  sections below would mean rebuilding `SectionHead`, whose construction *is*
  a left-hand label over a full-width hairline - and the gallery section needs
  that row for its link. Recorded so a later pass does not "make it
  consistent" by accident, in either direction.
- **Nothing tests that the credentials box stays gone.** It is the kind of thing a demo-friendly change puts
  back. A one-line unit or e2e assertion that no public page contains a password field's example value would
  hold it; `AGENTS.md` carries the rule in the meantime.

**From the photographs (first round):**

- **The home page lists the guest houses in the store's order, which is
  Bageshri first; `/contact` lists Hamsanandi first.** The map tabs follow
  `GUEST_HOUSE_LOCATIONS`, whose order is "as the owner listed them"; the home
  page follows `listGuestHouses()`, which seeds Bageshri first. The two have
  always disagreed, and it did not show while the houses were text-only cards
  low on the page. Now they are the hero and it does. Fixing it is either
  reordering the seed (touches `supabase/seed.sql` too) or sorting the cards by
  the registry - **the owner's call**, and not worth guessing at.
- **`GUEST_HOUSE_PHOTOS` is not editable from the console**, exactly like
  `GUEST_HOUSE_LOCATIONS` beside it. A guest house created in Guest Houses &
  Rooms gets the "photograph to follow" placeholder until someone adds a line
  to `lib/site.ts`. That is deliberate while there are two guest houses and no
  upload path; a console control for it needs somewhere to put the file, which
  is a Storage bucket decision, not a UI one.
- **Nothing checks that a served photograph is the building it claims.** The
  tests check that the registry has two entries, that they are distinct, that
  an unknown house gets `null` rather than another house's picture, and that
  no home-page alt text names a guest house. They cannot check the attribution
  itself - that rests entirely on the owner's message of 15 Oct 2026, which is
  quoted in [01-background.md](01-background.md).
- ~~**The hero is taller than it was**~~ - it is now a full viewport by
  design (27 Oct 2026), so "how far down the page the amenities start" is
  answered rather than open. §5's missing visual regression test still stands.

## 2i. Opened by the 16 Oct 2026 round - the owner's thirteenth list

All three items closed. What they opened:

- **"Future bookings only" was read as "a future effective date", which is
  narrower.** A new rate must now start later than today
  (`tariffStartError`), so nothing already quoted, approved or slept in is
  repriced. But `resolveTariff` still prices a stay **night by night**, so a
  rate starting tomorrow does price the later nights of a stay booked last
  week. Whether the office wants a booking to keep the figure it was quoted
  **at the moment it was made** is **a question for them** - and it is a much
  larger change: the rates would have to be snapshotted onto the booking, and
  a stay could then be invoiced at a price no longer in any tariff row. Ask
  before building it.
- **A tariff can still be back-dated through the stores**, and so by a repair
  script or a direct SQL insert. Deliberate - the rule is policy, in
  `createTariffAction`, and the first extra-bed rate had to be able to cover
  stays in progress - but there is no database guard the way `tariffs_guard`
  guards an *edit*. If the office ever reports a rate that appeared in the
  past, this is the door.
- **No end-to-end journey types a meal count any more.** The only one that
  did was the Bageshri invoice, where the boxes no longer exist; the live
  repricing of typed counts is covered by `tests/fifth-round.test.ts` and the
  journey still proves it through an additional charge. A Hamsanandi invoice
  journey would close it - and would be the only e2e cover for the dining
  section's own letters, (C) and (D). See §5.
- **`serves_meals` is now in the invoice snapshot, and a guest house can be
  edited.** Ticking "Serves meals" on Bageshri in Guest Houses & Rooms makes
  **new** invoices print a dining section; invoices already issued keep what
  they recorded, which is right. Nothing warns the developer that the tick
  changes what future invoices print, and `lib/settings-impact.ts` has no
  entry for it.
- **The guest house is on the desk's lists as a muted line under the rooms.**
  If the office asks to sort or filter a desk list by guest house, the
  consoles already take `?gh=`; what they do not have is a visible control on
  the Checked out - to bill and Awaiting payment sections themselves.

## 2j. Opened by the 17 Oct 2026 round - the owner's fourteenth list

All nine items closed. What they opened:

- **A *named* tariff category on the booking is a question for the office.**
  The panel offers the pair the rate is resolved from - the guest house and
  the kind of booking - because that is what a requester can honestly choose
  and what `resolveTariff` reads. If the office wants the requester to pick
  from the sheet's own wording ("parents", "government officer", "Hamsanandi
  type 3"), that is a **column on `tariffs` and a column on `bookings`**, a
  new dimension in `resolveTariff` and in `specificity()`, and a Form Builder
  or Settings control for which categories a role may claim. Ask before
  building it: the sheet currently expresses those categories as scope, which
  needs nothing stored.
- **The office cannot edit the categories, because there is nothing to
  edit.** They are derived. The only way to change what a requester is
  offered is to change the rate sheet, the Form Builder's allowed guest
  houses, or `bookingTypesFor` - which is the same list of levers as before,
  stated in one more place.
- **The caretaker sentence is on the form only.** Not in the booking mail and
  not on `BookingDetails`, where reviewers and the desk would read it too.
  `lib/mail/templates.ts` is where it would go if the office asks - beside
  the "Pets" line, which is the precedent for a sentence that lives in the
  mail and the Guidelines rather than on the form.
- **Nothing tests the booking page at 320px.** The two columns collapse to
  one below `lg` and the panel has no fixed widths, but only
  `e2e/public-site.spec.ts` runs on the phone project; the portal's pages have
  never been in it. Adding `/book` would need a signed-in phone project, which
  is a config change rather than a test.
- **`PREVIOUS_BOOKINGS_SHOWN` is a constant, not a Setting.** Five is a
  guess. It is one line in `lib/my-bookings.ts` and a prop on `MyBookings`, so
  the office can be given a different number without a migration; a *Setting*
  would want a group of its own.
- **My Bookings groups on the client, from `new Date()` at render.** A page
  left open overnight keeps yesterday's sections until something refreshes it
  (live updates do, within 30 seconds on the mock store). Server-side grouping
  would need the sections to be a prop, and would move with the server's clock
  instead - which is the same problem one layer down.
- **`/book/meals` and `/book?service=meals_only` are two addresses for one
  page.** The query form is kept for links and bookmarks made before today.
  If it is ever dropped, the redirect belongs in the route, not in the shared
  component.

---

## 2k. Opened by the 27 Oct 2026 (second) round - the cinematic landing page

Every item of the brief closed. What it opened:

- ~~**The overlay header reads the scroll position in JavaScript.**~~
  **Closed 28 Oct 2026**: the header is opaque on every page, so there is no
  scroll state and no first-frame flash. The original note follows, because
  the technique would come back with a translucent header.
- **(closed)** `scrollY > 24`
  in a listener, so between the first paint and hydration the header on `/` is
  always in its over-the-photograph state. That is the correct state at the
  top of the page, which is where a first paint is - but a reader who lands on
  `/` already scrolled (a reload part-way down) sees white type on white for
  one frame. A `scroll-timeline` or an `IntersectionObserver` sentinel would
  fix it without a listener; neither was worth it for one frame.
- **Nothing tests the overlay header at all.** The e2e journeys check the
  hero's behaviour and the sections below it, not that the header turns solid
  on scroll or that its links stay readable over the photograph. The contrast
  figures in [02-decisions.md](02-decisions.md) were measured by hand against
  the two photographs that are in the hero **today** - a third photograph, or
  a brighter replacement for either, is not checked by anything.
- **`prefers-reduced-motion` has three jobs here now** (the rotation, the
  drift, the pointer zoom) and is still exercised by nothing. See §2h.
- **The pointer zoom is mouse-only** (`e.pointerType !== "mouse"` returns
  early). A trackpad reports as a mouse and is fine; a pen does not, and gets
  the drift alone. Deliberate - a tap is the pause, and a zoom that followed a
  finger would fight it - but it is a decision nobody will remember.
- **Two map iframes now load on the home page.** They are `loading="lazy"` and
  below the fold, so nothing is fetched until a reader scrolls to them, but
  the home page can now reach Google's servers where it never did before. If
  the institute ever asks for a cookie or third-party notice, this is the page
  that needs it, not just `/contact`.
- **The maps are slow to paint.** Measured: the embed is a 301 to
  `google.com/maps/embed` and then four `maps.googleapis.com` scripts, so a
  screenshot 2.5s after scrolling is still blank. Unchanged from `/contact`
  and not something this round can fix, but worth knowing before somebody
  reports the home page's maps as broken.
- **`houseSummary` is deleted.** If the office ever asks for a line under each
  guest house's name again, it is in the git history of
  `lib/site-content.ts`, and a note where it was says so.
- **The guest houses are still listed in the store's order on the home page
  and the registry's order in the maps** - Bageshri first in the cards,
  Hamsanandi first in the maps, **on the same page now**, which is where it
  finally shows. See §2h for the two ways to fix it; it is the owner's call.

## 2l. Opened by the 28 Oct 2026 round - the Taramani pass and the sign-in

Every item of both briefs closed. What they opened:

- ~~The sign-in throttle no longer protects the door.~~ *Resolved 3 Nov 2026:*
  `RATE_LIMITS.signIn` removed with the rest of LDAP. Google OAuth has its own
  per-IP throttle (`RATE_LIMITS.oauth`).
- ~~The LDAP form has no test and no caller.~~ *Resolved 2 Nov 2026:* LDAP
  sign-in, `signInWithLdap`, the throttle, mock-login and all related code
  deleted. Google OAuth is the only sign-in door.
- **Nothing tests the opaque header**: not that white links stay readable
  over the hero (the measurement is in [02-decisions.md](02-decisions.md),
  taken against the two photographs that are in the hero *today*), and not
  that the centred row and the lockup do not collide at an awkward width.
  A third photograph, or a brighter replacement for either, is checked by
  nothing.
- **The quiet console is untested.** That a list with nothing in it is not
  drawn, that the index still names it, and that a zero row is not a link -
  three assertions, and the state is easy to arrange (a guest house with no
  bookings).
- **`fifth-round.spec.ts` has a midnight flake.** The database is seeded with
  a stay six days out and the test moves its check-in five days out; both are
  built from "now", so a run that crosses IST midnight makes them the same
  day and the button is correctly disabled. It cost a full suite run to
  diagnose. The fix is for the test to read the stay's current check-in and
  choose a different day, rather than counting from today.
- **`SIGN_IN_PHOTOS` is entirely unplaced** now that `/sign-in` has no
  photograph either. Kept deliberately (one prop restores any of them, and
  all are in the Gallery); drop the registry if the decision settles.
- **`text-hero` and `--saffron-deep` have one reader each.** That is correct
  for a type step used by one heading, but it is the shape a scale drifts
  into: check before adding a seventh step or a third saffron.

## 2m. Opened by the 28 Oct 2026 round (second) - the landing page again

Every item of that brief closed. What it opened:

- **The ban on shadows, gradients, pills and 16px radii has been tested twice
  in one day against the same reference site**, and held both times - the
  page was lifted with composition, ground, type and one accent colour
  instead. It is the one lever left if a fourth brief says "still basic", and
  pulling it is a decision about **the whole service**, since the tokens are
  shared with the portal. Decide it deliberately, in
  [02-decisions.md](02-decisions.md), or not at all.
- **Nothing tests the dark amenities band**: not that saffron on ink is what
  ships, and not that it does not merge with the ink footer at some width.
  It is the first ink section the public site has had.
- **Nothing tests the mosaic's shape.** The unit test pins the preview at six
  and keeps the three photo sets disjoint; the spans that tile twelve columns
  exactly are held only by the comment above them. A seventh photograph is a
  hole on the page and a green test run.
- **`HOME_PHOTOS` now has three sets to keep disjoint by hand.** The unit
  test checks it, but there is no helper, and a fourth slot on this page is a
  fourth set.
- **The hero's contrast measurement is still against the two photographs in
  the hero today.** This round moved it from 66% to 78%, so it is further
  from the edge than it was - but a brighter replacement photograph is still
  checked by nothing (see §2l).

## 2n. Opened by the 28 Oct 2026 round (third) - the Google sign-in plan

No code changed in the application. What the review of the auth seam turned up:

- **Gate 12 above is the hard one** - the 1000-row account lookup. It is a
  blocker for the institute's import as much as for Google sign-in.
- **The other 29 `listProfiles()` callers.** Raising Max rows makes them
  correct but not cheap: `lib/mail/digest.ts`, `lib/mail/recipients.ts`,
  `lib/academic/copy-to.ts`, `lib/approval-routes-server.ts` and
  `lib/booking-context-server.ts` each load **every** profile to find a
  handful of approvers, and the booking page does it per render. At 19
  personas that is free; at 5,000 accounts it is the portal's slowest query
  on its commonest path. The fix is a paginating `listProfiles` plus
  purpose-built lookups (`getProfileByEmail`, and a `profilesByIds`), not a
  bigger cap. **Not a gate** - correctness is gate 12; this is speed.
- **Email is the only identity key.** `completeGoogleSignIn` returns Google's
  immutable `sub` and the callback drops it, so a **reassigned** institute
  address (a reused roll number, a renamed staff account) hands the new
  holder the previous person's profile, bookings and role. The fix is
  `profiles.google_sub` (a migration 35), matched first and recorded on the
  first email match. Worth doing before the portal holds a year of real
  bookings; deliberately not done with the plan.
  [`GOOGLE-SIGN-IN.md`](../GOOGLE-SIGN-IN.md) §8.1.
- **`hd=iitpkd.ac.in` on the start leg is narrower than
  `isInstituteEmail()`.** If `smail.iitpkd.ac.in` is a separate Workspace
  tenant rather than a second domain of the same one, that hint keeps
  **every student** out of Google's account chooser - the portal would work
  for staff and be unusable for the people it is for. Answered only by the
  Computer Centre or by one real student account; the fix is one line
  (`hostedDomain: "*"`, or drop the hint - the return leg is the real check).
- **The OAuth state cookie is not cleared.** Set with
  `path: "/api/auth/google"`, deleted with a bare `jar.delete(OAUTH_COOKIE)`,
  which defaults to `/`. It lives out its 10-minute `maxAge` instead. Low
  severity - a code cannot be exchanged twice and the nonce is single-use -
  and one line to fix.
- **Configuring Google deletes `/mock-login`, which is how the Playwright
  suite signs in.** All 50 journeys go through `signIn()` in
  `e2e/helpers.ts`. `e2e/sign-in.spec.ts` says in its header that it expects
  to be *replaced* at that point; nothing replaces it yet, and the happy path
  cannot be driven without a real Google account. Mocking Google's two
  endpoints, or testing the callback's rejections directly, is the gap.
- **Auto-provisioning is still unanswered**, and should stay refused: a
  `profiles` row carries the role, hostel and unit, which decide the approval
  chain and the debitable heads, and there is no safe default for those. What
  can be improved cheaply is the refusal message, which is a dead end -
  naming the office's address from `GUEST_HOUSE_CONTACT` would give the
  person somewhere to go. [`GOOGLE-SIGN-IN.md`](../GOOGLE-SIGN-IN.md) §9.

### From the unit column rename (3 Nov 2026)

- **Rename columns on existing Postgres databases.** The code now expects
  `units.category` (was `kind`), `parent_department_id` (was `parent_id`),
  `office_type` (was `office_class`), `hod_approval_from_id` (was
  `hod_unit_id`), and `institute_offices.office_type` (was `office_class`).
  Five `ALTER TABLE … RENAME COLUMN` statements; no data changes needed.

## 2o. Opened by the 7 Nov 2026 round - the personas, mock auth and the warden ranks

- **A profile with an audit row cannot be deleted** - gate 13 above. This is
  the one with real consequences: the console's Delete user fails with an
  error that names neither table.
- **`deputy_warden` and `assistant_warden` are not offered in Users & Roles
  or the Form Builder.** The seeder writes them; `assignableRoles` and the
  role dropdowns have not been checked for whether a manager may create one.
  Until that is settled, a new Assistant Warden is added by the seeder or by
  SQL, which is not where the office should have to go.
- **The approval workflow console still calls the slot "Their hostel's
  Assistant Warden"** (`components/admin/workflow-flow.tsx`), which is right
  almost always and wrong at a hostel with no Assistant Warden. The engine
  names the real rank (`personaRoute` does it on the picker); the console
  could read it back the same way.
- **No e2e journey covers the Warden / Deputy Warden ranks.** The unit tests
  pin the resolution and the Copy-to; nothing drives the three accounts
  through a browser, and `e2e/helpers.ts` still has one `warden` entry
  (now the Assistant Warden of Malhar Boys).
- **`/mock-login` loads every profile on every view.** Fine at 29 accounts,
  and the same `listProfiles()` problem as gate 12 and §2n - it is listed
  here only so it is not discovered twice.
- **The four hostels with nobody appointed are deliberate**, but nothing
  warns the office that a hostel has no warden. Departments & Clubs names a
  unit with no head; `institute_hostels` has no equivalent.
- **Two old test bookings are still in the owner's development database**,
  belonging to retired accounts (`112201001@smail…`, `142301026@smail…`).
  They are why those two accounts could not be deleted.
  `npm run seed:personas -- --drop-orphans` clears both, and is deliberately
  not the default.

## 2p. Opened by the 7 Nov 2026 (second) round - the booking path on PostgreSQL

In order of what would have caught the most:

1. ~~**A test suite that runs on PostgreSQL.**~~ **Done the same day:**
   `npm run test:pg` (`tests-pg/`, 39 checks, a CI job on `postgres:16`).
   It covers create, forward, reject, allocate and the clash, Occupied /
   Vacated, the personal-stay settlement, invoice issue and payment,
   extensions and moved check-ins, both cancellation paths, dining and the
   kitchen cap, the missed sweep and reinstatement, the outbox, the foreign
   form config and an ID upload. Each of the day's four fixes was undone in
   turn and the suite failed every time. **Not yet in it:** reassigning
   rooms, editing meals after approval, room blocks, the Approval Log search
   and exports, the console's user import, and the developer's force-status.
2. **Remove the five foreign `form_configs` rows** on the owner's database
   (`student`, `employee`, `official`, `faculty_advisor`, `gh_manager`):
   Form Builder -> **Reset to spec defaults** for each. They are ignored now,
   and log a warning on every `/book` view until they go. Whatever wrote them
   on 1 Nov 2026 is outside the repo - find it before it runs again.
3. **The five `app_settings` rule rows are the same foreign shape**
   (`max_advance_days`, `gst_slab`, `lunch_cutoff`…), same date. They are
   harmless - `parseRuleGroup` merges over the defaults and validates - but
   every value in them is ignored, which a reader of the table would not
   guess. Remove them, or save each card in Settings once.
4. ~~**Not exercised by the audit:** invoices, Occupied / Vacated,
   extensions, meals at Hamsanandi, uploads.~~ All in item 1 now, and the
   suite found one more fault doing it: a stay booked for earlier today
   could never be allocated (`lapseDeadline`, fixed - see
   [02-decisions.md](02-decisions.md)).
5. **Insert builders that take columns from `Object.keys(row)`** in
   `PostgresStore` (profiles, projects, tariffs, sessions, MFA, privacy
   requests) send `undefined` as NULL. None of them failed in the audit, but
   that is the shape the outbox fault had.
6. ~~**An error the form cannot show still reads "fix the highlighted
   fields".**~~ **Done the same day:** the booking form's error summary
   (`components/error-summary.tsx`, `lib/form-problems.ts`) lists every
   problem, server refusals included. **Not yet run in a browser** -
   `e2e/error-summary.spec.ts` is written and waits for a build. The other
   console forms carry one message in their own dialog and were left as
   they are.

## 2q. Opened by the 8 November 2026 round - the rates

1. **There is no `extra_bed` rate**, here or in the hosted project the sheet
   came from, and the office has never sent one. A stay with an extra bed
   therefore **cannot be invoiced**: `resolveTariff` returns null and
   `invoiceBlocker` reports it rather than charging zero by omission. This
   is the office's figure to supply, not a default to guess - see
   [04-production.md](04-production.md) section 3. `npm run seed:reference`
   prints the warning on every run.
2. **Eight duplicate tariff rows in `guesthouse_dev`**, dated 2026-12-01:
   the Category I / II / III sheet at the same rates as the 5 Nov rows, from
   the office's first attempt when the console forced a future date. They
   change nothing (equal specificity, later date, identical rate - proved
   over 630 combinations on three dates) and are the office's own rows, so
   they were left. They are **not** in `seed-reference-data.sql`, which is
   why a fresh install holds 14 room rates and `guesthouse_dev` 22. Worth a
   tidy next time the manager edits rates.
3. **Nothing checks a database's reference data** the way
   `npm run check:migrations` checks its schema. A database can have every
   migration and still hold no rates, the wrong rooms, or ten rooms where
   the office has thirteen - which is exactly what this round found, weeks
   after the move. `seed:reference --dry-run` is a census, not a verdict;
   the useful thing would be a `check:reference` that exits 1 on a guest
   house with no rooms, a room list that does not match
   `lib/store/seed.ts`, or an item with no rate in force.
4. **The office's rate sheet is now in three places that must stay in step**:
   `scripts/seed-reference-data.sql` (the SQL),
   [12-settings-and-defaults.md](12-settings-and-defaults.md) (the table a
   reader looks at) and the database itself. The room numbers are in two:
   that SQL and `lib/store/seed.ts`. No test compares them, unlike
   `tests/seed-parity.test.ts` for the personas - the obvious next guard.

## 2r. Opened by the 8 November 2026 (second) round - one shared database

> **Amended 9 November 2026.** Item 8 below was added by that round, and the
> connection advice in item 7 now has a second half: the app runs on the
> **transaction pooler (6543)**, tooling on the **session pooler (5432)**.

1. **One database for everybody, so one person's mistake is everybody's.**
   A dropped table, a bad import or a `delete` with no `where` now costs the
   whole team, and there is no per-developer copy to fall back on. The cheap
   next step is a second database on the same host used as a scratch copy
   (restore from `~/guesthouse-db-backups/` and point one `.env.local` at
   it); the fuller answer is a database per developer, seeded from
   `scripts/init-postgres.sql` + `npm run seed:reference` +
   `npm run seed:personas`, with the shared one kept for demonstrating.
2. **The database password is now a shared secret.** It is in each
   collaborator's `.env.local`, and resetting it in the Supabase dashboard
   breaks every one of them at once. Nothing rotates it, nothing records who
   holds it. Named and located in
   [05-credentials-and-security.md](05-credentials-and-security.md).
3. **The application connects as `postgres`**, the superuser-equivalent
   owner, which is also what bypasses the 15 restored RLS policies. A narrower
   role owning nothing and granted only DML on `public` would be a real
   improvement, and is a prerequisite for ever trusting those policies. It
   needs the grants worked out against both stores first.
4. **`guesthouse_dev` on the laptop is now dead weight that looks alive.**
   It is no longer what the app reads and will drift from the shared database
   the moment anybody books. Either keep it deliberately as the offline copy
   (the commented `DATABASE_URL` is there for that) and expect to re-seed it,
   or drop it. What must not happen is diagnosing a bug against it by
   accident.
5. **No backup runs on a schedule.** The only dumps in existence are the two
   this round took by hand. A shared database holding the office's rates and
   directory deserves a nightly `pg_dump` - Supabase's own backups cover the
   paid tiers only, and this project is on the free one.
6. **The pre-migration history is in a file, not a database.** The hosted
   project's 35 bookings, 98 logs and **8 invoices** exist only in
   `~/guesthouse-db-backups/supabase-before-<stamp>.sql`. If any of those
   invoices turn out to be a real billing record rather than a test, they
   have to be read back out of that dump - which is why it is kept.
7. **The 17.6 / 16.15 version gap is a trap for the next person.** The shared
   database is PostgreSQL **17.6** and the laptop's client is **16.15**, so
   `pg_dump` against the shared database fails until it is run from a
   `postgres:17-alpine` container. Recipe in
   [22-running-and-testing.md](22-running-and-testing.md).

8. **The connection quota is the next thing that will bite, and it is a
   property of the plan.** Supabase's session pooler admits **15 clients for
   the whole project** on this tier, which is what failed on 9 Nov 2026 with
   one dev server open. Moving the app to the **transaction pooler (6543)**
   buys room by multiplexing, and `DATABASE_POOL_MAX` caps each process
   (default 10 in `lib/db/client.ts`), but neither raises the underlying
   limit. Three things follow. (a) Nobody owns the figure: on a production
   deployment running several instances the default multiplies by the instance
   count. (b) **Do not point the e2e suite at the shared database** - it
   builds its own throwaway one, and that is now a quota reason as well as a
   data one. (c) The same arithmetic has to be redone against the institute's
   database, which may be PgBouncer in transaction mode, no pooler at all, or
   a hard `max_connections` the portal shares with other services. Worked
   through in [02-decisions.md](02-decisions.md), *9 November 2026*.

## 2t. The Playwright suite - a harness that could not run, and specs that drifted

Found while verifying the meeting round (9 Nov 2026). The **harness** is
fixed; the **specs** are not, and the two are different problems.

**Fixed.** `npm run test:e2e` could not run at all: the production server
refused to start without Google, `signIn()` threw because
`E2E_TEST_SECRET` was set in the server's environment and not the runner's,
and `webServer.env` did not blank `DATABASE_URL` - so once the server *could*
start it would have pointed a production build at the **shared hosted
database**. Google is now blanked explicitly too, because `next start` loads
`.env.local` and a machine with real credentials in it was serving a different
page from CI and sending a journey to `accounts.google.com` with the owner's
client id. Full account in
[22-running-and-testing.md](22-running-and-testing.md), *The journeys could
not run at all*.

**Still open: 16 journeys assert behaviour that was deliberately changed, and
none of them on the meeting round's code.** Verified by running the same specs
against `HEAD` with only the harness fixes applied - they fail there
identically. In rough order of how many journeys each accounts for:

1. **The demo student is `phd.malhar`, whose record names only a father**
   (7 Nov 2026). `guestNameRule` therefore withholds **Mother**, and every
   journey whose fixture selects it dies in `selectOption` with *"did not find
   some options"* - which reads as a broken dropdown, not as a withheld
   option. Either the fixture should use **Father**, or `ACCOUNTS.student`
   should point at a persona with both parents (`btech.saveri`). That is a
   choice about what the journeys are *for*, which is why it is here and not
   done.
2. **`accommodated at Bageshri Guest House` is no longer on a student's
   form** (7 Nov 2026 - a student is not shown the guest house at all).
3. **A heading with a count reads `Current bookings: 3`** (28 Oct 2026), so
   `getByRole("heading", { name: "Current bookings" })` cannot match: the
   `name` option matches the whole accessible name.
4. **The father's name on the locked field is `Sudhakara Varma`**, not the
   `Ramesh Menon` the fixture expects - the same persona change as (1).

One **product** defect these journeys uncovered and that is **still open**,
because the sign-in door is not something to change on the side:

5. **`/sign-in` drops `next`.** Its `searchParams` type is `{ error?: string }`
   and it never reads `next`, so `/sign-in?next=%2Fbook` renders a door with
   no destination on it - and a visitor sent there by a portal guard is
   returned to their role's home rather than to the page they asked for.
   `safeNextPath` and `LoginForm`'s `withNext` are both already there.

> **A second one was fixed**, because blanking Google in the harness made it
> fail where it had been invisible: `LoginForm` read `submitLabel` on the
> **Google** button alone, so `/book-room`'s "Sign in to book" existed only
> where Google was configured, and on every other deployment that door read a
> bare "Sign in". The label now follows whichever door is the only one open.
> The lesson is the one this whole section is about: a check that cannot run
> is not a check, and two journeys had been passing for a reason that had
> nothing to do with the code being right.

## 2s. Opened by the 9 November 2026 (second) round - mail to real inboxes

1. **A skipped message reads SENT, which it was not.** A row settled because
   `MAIL_ALLOWED_RECIPIENTS` ruled every recipient out carries its reason in
   `last_error` and renders muted rather than red, but its *status* is wrong.
   The honest fix is a **`SKIPPED`** value on the `email_status` enum, and it
   is not free: Postgres refuses to use a new enum value in the transaction
   that adds it (migration 29's lesson), so it is a migration **plus**
   `MAIL_STATUSES`, `countEmailsByStatus`'s `Record<MailStatus, number>`, both
   stores, and the console's tiles and filter. Worth doing if the allow list
   outlives the test it was written for.
2. **Nothing reverts a temporary arrangement.** Three real inboxes are on
   three demo accounts, in **three places** that have to move together - the
   `.env.local` line, both seeds, and
   `scripts/repairs/2026-11-09-real-mail-test-addresses.sql`. Revert the seeds
   alone and `npm run seed:personas` sees three accounts outside its set and
   retires them. There is no reminder and no expiry; the only record that this
   is temporary is the prose in
   [05-credentials-and-security.md](05-credentials-and-security.md) Part 1,
   [01-background.md](01-background.md) and
   [02-decisions.md](02-decisions.md) under *9 November 2026 (second)*.
   **Not `99-recent-changes.md`** - that file is replaced every round, and the
   round after this one replaced it.
3. **The allow list is a workaround for a directory that is not loaded.**
   Every one of these problems - fake addresses, bounces, a drop list - goes
   away when the institute's real people are imported (Users & Roles ->
   Import from spreadsheet, `lib/users-import.ts`). Until then the demo
   personas are the directory, and most of their addresses do not exist.
4. **Three demo accounts can no longer sign in with Google**, because
   `isInstituteEmail()` refuses a `@gmail.com` address and the Google callback
   checks it. They sign in through `/mock-login`, which is how the demo
   accounts are used anyway - but if Google is ever configured on a deployment
   holding these addresses, those three accounts are locked out and the reason
   will not be obvious.
5. **`scripts/repairs/` is a new directory and nothing documents it but this.**
   `supabase/` was deleted on 2 Nov 2026 and took `supabase/repairs/` with it,
   so the one-off SQL had nowhere to live. Several places still *name* the old
   paths - `AGENTS.md` and [21-database.md](21-database.md) among them - which
   is drift from that deletion rather than from this round, and wants one pass
   over it.

## 2t. Opened by the 9 November 2026 (third) round - a copy on a laptop

1. **Nothing reconciles a local copy with the shared database, and nothing
   warns.** The moment anybody books on either, the two diverge silently, and
   there is no "you are on a stale copy" anywhere in the portal. The copy's
   stated purpose is offline work and destructive experiments - but the only
   thing stopping somebody from demonstrating the portal from a three-week-old
   copy is remembering which `DATABASE_URL` is commented out in their
   `.env.local`. A banner naming the database the app is connected to, in
   non-production only, would cost very little.
2. **Migration 36 now has to reach two places, and is applied in neither.**
   `scripts/migrations/00000000000036_room_classes_and_tariff_categories.sql`
   is in the tree; the shared database has neither `rooms.room_class` nor
   `tariffs.tariff_category`, so the dump does not either. Code expecting
   those columns works against no database that exists. When it is finished it
   has to be applied to the shared database **and** to every laptop that
   restored from this dump - which is the first time this project has had more
   than one database to keep in step since 8 Nov.
3. **There is still no record of which migrations a database has.**
   `npm run check:migrations` cannot see function-only, trigger-only,
   policy-only or index-only migrations (17, 23, 31, 33, 34 among them), which
   is exactly why *"I don't know from which commit"* had to be answered by
   replacing the schema rather than by catching it up. A
   `schema_migrations` table written by the migration runner would make the
   question answerable - and would have to be back-filled by hand once, which
   is the reason it keeps not happening.
4. **The dump is a hand-made artefact that will go stale.** It was taken,
   patched four ways and test-restored by hand; nothing produces it on a
   schedule and nothing stops somebody restoring November's copy in February.
   The patching is mechanical enough to be a script
   (`scripts/dump-shared-db.sh`), which would also be the nightly backup
   §2r item 5 still wants.

## 3. Found in the documentation audit (24 Sep 2026)

Small, real, and none urgent. Three were **fixed the same evening**: the
developer is no longer offered a booking form it could not submit (book on
behalf is the manager's alone), the help line shows the guest house's own
number from the one source in `lib/site.ts`, and Reception has a Meal counts
link to the kitchen page. Still open:

- **The one guest house students and alumni use is matched by name**
  (`RESTRICTED_GUEST_HOUSE_NAME` = `ALUMNI_GUEST_HOUSE_NAME` = "Bageshri",
  `lib/policy.ts`) — the one rule that breaks "never check a guest house's
  name", and since 7 Oct 2026 it carries students too. A flag like
  `serves_meals` would remove it.
- **The `iar_student_cell` debit category** (official bookings by the Student
  Cell) is unused since its Official option was withdrawn.
- **Mail still uses the pre-redesign amber header**; restyle to ink/vermilion if
  the office wants mail to match the site.
- **The Guidelines' house rules are placeholders** (§7 During your stay, §8
  Safety and help, marked "To be confirmed"), and the home page's amenities
  are unconfirmed: the office to confirm or replace them in
  `guidelineSections()` / `amenities()` (`lib/site-content.ts`), then set
  `GUIDELINES_PROVISIONAL` to false (`lib/site.ts`).

## 4. Things that need other people

**Moved.** Who to ask for what - the Computer Centre, the Administration
Section and the guest house office, the academic office - and the hosting
decision, the Aadhaar recommendation, the residual DPDP items and the rollout
order are all in
**[04-production.md](04-production.md) Part 3**. They were listed in both
places and the two drifted apart; Part 3 is now the only copy.

The one that is nobody's job yet and matters most: **an owner after the current
developers.** Someone at the institute must be named, or the portal becomes
unmaintained software holding ID data.

## 4a. Operational gaps

- **No uptime monitoring.** There is no `/api/health` route and nothing pinging
  the deployment, so the first sign of an outage would be somebody at the guest
  house office failing to sign in. A free pinger against a trivial health route
  is the whole fix. (Error tracking is wired - `SENTRY_DSN`; backups and the
  restore drill are in [04-production.md](04-production.md).)

## 5. Tests that are still thin

`npm test` (574 checks, 34 files) and `npm run test:e2e` (43 journeys) run in
CI. What would catch the most next:

1. the mail layer end to end — rendering, outbox claim and retry, recipients
   following `canReview`;
2. the availability grid's overlap arithmetic beyond the store tests;
3. end-to-end passes for more of the console — Settings, tariffs (Change rate
   and Faculty Advisors have one each);
4. **a Hamsanandi invoice journey** — since 16 Oct 2026 the only invoice
   journey is at Bageshri, which has no dining section, so nothing drives a
   meal-count box, the (C) and (D) letters or a dining additional charge
   through the UI (§2i);
5. accessibility assertions (axe) inside the Playwright run;
6. an RLS test with real user JWTs, once RLS becomes the boundary;
7. a store-parity suite (same operations on `MockStore` and `SupabaseStore`).

## 6. Accessibility

- The room grids are no longer colour-only (● booked, 🔧 maintenance, labelled
  bars, spelled-out legend), but have not had a screen-reader pass.
- Audit focus order and labels through the long booking form.

## 6a. Institute data tables (2 Nov 2026)

Migration 35 adds six `institute_*` tables (students, employees, offices,
fests/councils/clubs, hostels, wardens) with types in `lib/institute/types.ts`
and 30 `DataStore` methods. The second session rewired all dependent code:

- ~~Console pages~~ **Done.** The Academic Records console imports, views and
  deletes records per institute table kind.
- ~~Integration with the portal~~ **Done for the academic record path.**
  `StoreAcademicSource` reads institute_* tables through an adapter
  (`lib/institute/academic-adapter.ts`). The booking form's parent locking,
  the warden's family check, the Copy-to chain and the requester-details card
  all work unchanged.

**Done in the round of 3 Nov 2026:**

- ~~Header-aware institute import~~ — `lib/institute/import.ts` detects a header
  row automatically and maps columns by name using `KNOWN_*_COLUMNS` aliases, so
  the office's spreadsheet columns can be in any order and unknown columns are
  skipped. Positional fallback unchanged.
- ~~`year_of_admission` removed from `institute_students`~~ — redundant with
  `batch_year`. The alias `year_of_admission` -> `batch_year` ensures old
  spreadsheets still import. Existing databases need
  `ALTER TABLE institute_students DROP COLUMN IF EXISTS year_of_admission`.

What is **not built yet**:

- **Delete the dead code** in `lib/academic/stored.ts` (`planAcademicImport`,
  `StoredAcademicRecord`, `ACADEMIC_RECORD_KINDS` etc.) - no production code
  imports them any longer
- **Drop the old `academic_records` table** once migration 35 is applied and
  confirmed working on the hosted project
- **Migration 35 applied** to the hosted project
- **Drop `year_of_admission` from the hosted database** once migration 35 is
  applied — `ALTER TABLE institute_students DROP COLUMN IF EXISTS year_of_admission`
- ~~Warden scoping and approval routing from institute tables~~ **Done,
  3 Nov 2026.** `hostel_name` eliminated from the `profiles` table, computed
  at read time via `profiles_v` / `withComputed()`. **Extended 4 Nov 2026**:
  `department_or_club`, `roll_number` and `staff_category` also eliminated
  from `profiles` and computed the same way. All four fields remain on the
  `Profile` type; all downstream consumers unchanged

## 7. Features likely to be asked for next

- **Requester-side booking edits** — today a requester cancels and resubmits;
  the manager can already change dates, meals and rooms (Phase 7). Any date
  change must go through `set_room_holds()` and may fail on a clash.
- **Attachments on rejection.**
- **Per-guest-house managers** — scope `gh_manager` by a profile field, the way
  wardens are scoped.
- **Snapshot the academic record onto the booking** if reviewers need the
  requester's phone.
- **Just-in-time provisioning** of profiles on first sign-in - the 2 Sep
  plan's `account_directory` proposal, superseded by `units` and
  `official_email_whitelist` but never built for provisioning - instead of
  creating every account by hand.
- SMS — never asked for; it would be a second `Mailer`-shaped seam.

## 8. Public website follow-ups

Everything tagged `TODO(site)` in `lib/site.ts` and `lib/site-content.ts`:

- the **placeholder house rules** (Guidelines §7 During your stay, §8 Safety
  and help) - set `GUIDELINES_PROVISIONAL` to false once the office confirms
  them;
- the **amenities** list (six since 30 Sep 2026 - the meeting room and
  exercise room came off), the guidelines PDF URL, front-office hours;
- the guest house contact details and a map pin per guest house;
- ~~AM's new photographs~~ **(done, 15 Oct 2026)** - the office sent eleven,
  and they are served from `public/site/photos/`;
- **which guest house each photograph shows.** Two of the twenty-five now have
  an answer: the owner named `hamsanandi-courtyard.jpg` and
  `bageshri-front.jpg`, and `GUEST_HOUSE_PHOTOS` holds them. The other
  twenty-three do not, which is why `GALLERY_SECTIONS` is still grouped by
  **subject**. When the office attributes the whole set it can be grouped by
  guest house instead - the `TODO(site)` on it says so. The 19 Sep exteriors
  are plainly the same blocks as `hamsanandi-courtyard.jpg`, but that is an
  inference and the code does not act on it.

Copy stays plain and unpromising (the owner, 30 Sep 2026). Detail in
[14-public-site-and-ui.md](14-public-site-and-ui.md).

Also open on the UI side:

- **Mail templates** (`lib/mail/render.ts`) still use the pre-26-Sep amber
  header. Align them with ink / vermilion if the office wants the mail to match
  the site.
- The design handoff asks for SSO on the booking pages. LDAP is in (dummy
  accounts until `LDAP_URL`); real Google sign-in switches on with its three
  environment variables, which also closes Mock Authentication - item 1 above.
- The **`ui` branch** holds only the superseded 21 Sep redesign. Nothing from
  it needs merging.

---

## Done — for the record

Every item this roadmap used to carry that has since been built, with where it
is written up (all in [02-decisions.md](02-decisions.md) unless noted):

| Item | Done |
| --- | --- |
| Email notifications and the day-wise report | 16 Sep 2026 — [10-roles-and-workflows.md](10-roles-and-workflows.md) |
| Push to GitHub | 10 Sep 2026 |
| Automated tests (Vitest, Playwright, CI) | 21–23 Sep 2026 |
| Settings console (rules, hostels, whitelist) | Phase 1, 21 Sep |
| To = actioner, Copy to = CC | Phase 2, 21 Sep |
| Turnaround buffer | Phase 3, 21 Sep |
| HOD approval, debitable heads, projects | Phase 4, 22 Sep |
| Invoices in the office's template, tariffs, payments | Phase 5, 22 Sep — [13-billing-and-dining.md](13-billing-and-dining.md) |
| Dining (meals only) and the kitchen's day | Phase 6, 22 Sep |
| Extend, move rooms, no-shows, maintenance blocks, bulk rooms | Phase 7, 22 Sep |
| Sessions, real Google OIDC, TOTP, throttles in the DB, CSP, encrypted IDs, retention, DPDP | Phase 8, 22 Sep — [05-credentials-and-security.md](05-credentials-and-security.md) |
| Keyword search in Postgres, narrow revalidation, realtime instead of polling | Phase 9, 22–23 Sep |
| Workflow documentation and the production runbook | Phase 10, 23 Sep |
| The office's correction rounds (23 Sep ×2, 24 Sep) and Faculty Advisors by appointment (24 Sep) | [01-background.md](01-background.md), [99-recent-changes.md](99-recent-changes.md) |
| The eighth list, in four phases (7 Oct): the text cleanup, a personal booking never asked which budget pays, students and alumni held to one guest house and no meals, the rates on the form, availability as a count, **the institute's records kept in the portal** (migration 28) with a student's parents locked, invoice version 4, cash retired, a personal stay settled at check-out, **Awaiting payment**, and **Missed** (migration 29) | [01-background.md](01-background.md), [99-recent-changes.md](99-recent-changes.md) |
| The ninth list (8 Oct): the office's nine debitable heads and their mapping, the funds declaration (migration 30), one mail thread per booking, less text on screen, accounts from a spreadsheet | [01-background.md](01-background.md), [02-decisions.md](02-decisions.md) |
| The owner's list (9 Oct): the rules the form **enforces** stop being **stated** on it, the availability counts redrawn, the privacy line quietened, the office's number moved into the portal footer, the log's filters rearranged with **PDF export for every role**, the meal booking's numbers typed again, and a dining booking quoted meal rates only | [01-background.md](01-background.md), [02-decisions.md](02-decisions.md) |
| The eleventh list (11 Oct): an office with no HOD is not asked how its booking is approved, the pets notice off the form, and every starred form explaining its stars | [01-background.md](01-background.md), [02-decisions.md](02-decisions.md) |
| White-on-amber contrast | The 19 Sep redesign |
