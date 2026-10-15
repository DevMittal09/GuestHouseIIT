# Roadmap — what is open, in priority order

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

---

## 1. Gates before real bookings go on it

Each of these is configuration or plumbing, not new design.

| # | Gate | Why | How |
| --- | --- | --- | --- |
| 1 | **Connect the institute's LDAP** | Until `LDAP_URL` is set the dummy accounts work, and their passwords are published in this repository | [05-credentials-and-security.md](05-credentials-and-security.md) Part 2, "Moving to the real LDAP accounts" — env vars, then load real usernames (Users & Roles → Import LDAP usernames) |
| 2 | **Close Mock Authentication** | Open wherever Google is unconfigured, production included; anyone reaching `/mock-login` becomes any account | Configure Google (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `APP_URL`) or set `MOCK_LOGIN=false` |
| 3 | **Production secrets** | The server refuses to start without them | `APP_URL`, `CRON_SECRET`, `ID_ENCRYPTION_KEY` + the Supabase keys ([05-credentials-and-security.md](05-credentials-and-security.md)) |
| 4 | **Change the console password** | Default `0000` | Console → Console Access |
| 5 | **Delete or disable the demo personas and demo data** | They sign in with published passwords | Users & Roles; `supabase/repairs/2026-09-21-clear-test-bookings.sql` for bookings |
| 6 | **Apply every migration to the production database** | Missing ones fail writes quietly | **`npm run check:migrations`** asks the project and names what is missing. Do not write the answer down instead — that is how 24-30 were believed missing for weeks after they were applied |
| 7 | **The office's Settings** | Defaults are guesses: extra-bed rate (none), GSTIN, Accounts email (empty), bank details, retention days, heads of units, Faculty Advisors, hostels and wardens, whitelist | [04-production.md](04-production.md#3-data-the-office-has-to-supply) |
| 8 | **Decide `MAIL_REDIRECT_ALL_TO`** | Unset only in production; set everywhere else | |
| 9 | **Backups** | Supabase's free plan has none | Confirm the plan; run the restore drill in the runbook |
| **10** | ~~Close the GoTrue / PostgREST door~~ **- done in code; three production steps left** | Migration 31 drops the `profiles -> auth.users` key and all 38 `authenticated` policies, `createProfile` and `seed.sql` mint no Supabase password, and `tests/rls-surface.test.ts` keeps it that way | **Left to do, in this order:** (1) **disable the email/password provider** - Dashboard -> Authentication -> Providers -> Email. **Confirmed ON with signup open, 14 Oct 2026**, so this is now first: it is a toggle, needs no migration, and the portal does not use the provider; (2) apply migrations **31, 32, 33, 34** to the hosted project - `npm run check:migrations` prints the SQL for the ones it cannot probe; (3) run `supabase/repairs/2026-10-13-retire-seeded-auth-users.sql`, which refuses to run before 31. **31 and 32 are not optional once the code is deployed.** [04-production.md](04-production.md) §1a.1 |
| **11** | ~~Make the user import atomic, or batch it~~ **- no longer a gate, 14 Oct 2026** | Two of the three problems are closed: the **inserts** are chunked (250 a request, so a first load is ~8 requests instead of ~2000), and a failure now **records where it stopped** - migration 32's undo record is written before the writes, so a part-way import is recoverable instead of a mystery. A username moving between two accounts in one paste used to fail part-way; fixed | What remains is that the **updates** are still one request per person, which cannot be chunked (each row has different values). Mitigation in [04-production.md](04-production.md) §1a.6: read the plan's "updated" count, import in pieces when it is large, and undo if it times out. The remaining fix is a single upsert, which needs the `ldap_uid` swap handled inside it - [03-roadmap.md](03-roadmap.md) §2f |

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
- **The undo is not offered for the academic-records import.** That importer is
  all-or-nothing and keyed on `(kind, lower(email))` the same way, and it
  overwrites a student's parents' names - which is what the booking form locks
  a guest to. Migration 32's table is deliberately shaped to take a `kind`
  column if this is wanted.
- **Add `profiles` and `academic_records` to whatever is used as a pre-import
  snapshot.** The documented drill - `supabase db dump` - already covers them;
  the ad-hoc JSON export kept outside the repo does not, and must not be
  mistaken for a backup. The undo record is a safety net for one import, **not**
  a substitute for this.
- **No deactivation story for people who leave.** `profiles` has no
  `is_active`, and `deleteProfile` refuses anyone with a booking (correctly -
  it would orphan the history), so repeated imports only accumulate. Wanted:
  a flag that hides someone from pickers and refuses them a session without
  touching their bookings. Not urgent until the first graduation after
  go-live.
- **`MAX_USER_IMPORT_ROWS` is 2000 and the institute is larger.** The paste has
  to be split anyway while the updates are sequential, so this is a ceiling to
  remember rather than a bug.
- **`department_or_club` duplicates `unit_id`** and the two can disagree - a
  real 3NF violation kept because five modules read it
  ([21-database.md](21-database.md), finding 1). The practical risk at import
  time is different: a sheet that fills the free-text column and leaves
  `unit` blank produces people whose official bookings have **no HOD**. The
  runbook says to check it; the real fix is to retire the column once every
  account has a unit.
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

**From the slideshow (second round):**

- **Nothing drives the slideshow with a keyboard in the suite.** The controls are real `<button>`s with
  labels and visible focus rings, and the e2e journey clicks them, but no test tabs to them, and none
  checks that focus inside the carousel holds the rotation - which is the behaviour a keyboard reader
  actually depends on. Nor is `prefers-reduced-motion` exercised; Playwright can emulate it in one line
  (`test.use({ reducedMotion: "reduce" })`) and that is the cheap version of this item.
- **The e2e journey costs ~14s per project, so ~28s of the suite**, waiting on real timers. It is the only
  honest way to test "it moves by itself". If the suite gets slow, look here first - the fix is to make
  `ADVANCE_MS` injectable rather than to delete the assertion.
- **No swipe.** A phone reader uses the arrows (44px targets at the photograph's edges). Touch-dragging is
  the obvious next ask and is not built; it would need pointer handlers on the track and care not to eat
  vertical scrolling.
- **The slideshow's photographs are a hardcoded list** (`HOME_PHOTOS.slides`), like everything else in
  `lib/site.ts`. Changing which ones appear, or their order, is a code change.

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
- **The hero is taller than it was**, because it now carries two photographs
  instead of one. Verified at 320px (no sideways scroll, one `<h1>`), but
  nothing measures how far down the page the amenities now start. §5's missing
  visual regression test would cover this and the green figures both.

---

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

`npm test` (494 checks) and `npm run test:e2e` (39 journeys) run in CI. What
would catch the most next:

1. the mail layer end to end — rendering, outbox claim and retry, recipients
   following `canReview`;
2. the availability grid's overlap arithmetic beyond the store tests;
3. end-to-end passes for more of the console — Settings, tariffs (only Faculty
   Advisors has one);
4. accessibility assertions (axe) inside the Playwright run;
5. an RLS test with real user JWTs, once RLS becomes the boundary;
6. a store-parity suite (same operations on `MockStore` and `SupabaseStore`).

## 6. Accessibility

- The room grids are no longer colour-only (● booked, 🔧 maintenance, labelled
  bars, spelled-out legend), but have not had a screen-reader pass.
- Audit focus order and labels through the long booking form.

## 7. Features likely to be asked for next

- **Requester-side booking edits** — today a requester cancels and resubmits;
  the manager can already change dates, meals and rooms (Phase 7). Any date
  change must go through `set_room_holds()` and may fail on a clash.
- **Attachments on rejection.**
- **Per-guest-house managers** — scope `gh_manager` by a profile field, the way
  wardens are scoped.
- **Snapshot the academic record onto the booking** if reviewers need the
  requester's phone, and **fill `hostel_name` from the record at sign-in** so
  warden routing stops depending on a hand-typed profile field.
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
