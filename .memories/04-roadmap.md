# Roadmap — what is open, in priority order

> **For the production deployment, read
> [06-production-requirements.md](06-production-requirements.md) first**
> (8 Oct 2026). It is the single checklist of what a production build needs -
> the real accounts, the data the office must supply, the secrets, the
> migrations, and what production turns off. This page stays the list of what
> is *open*, including the things that are not deployment.

Rewritten **24 Sep 2026** after a full audit of these notes against the code.
The portal is feature-complete for every workflow the institute has specified
and has been through a ten-phase production-readiness programme; it is **not
deployed for real use**. This page is the single list of what is left.
The original plan from 2 Sep 2026, now mostly executed, is kept for its
reasoning in [05-production-plan.md](05-production-plan.md).

---

## 1. Gates before real bookings go on it

Each of these is configuration or plumbing, not new design.

| # | Gate | Why | How |
| --- | --- | --- | --- |
| 1 | **Connect the institute's LDAP** | Until `LDAP_URL` is set the dummy accounts work, and their passwords are published in this repository | [31-ldap-sign-in.md](31-ldap-sign-in.md) §3 — env vars, then load real usernames (Users & Roles → Import LDAP usernames) |
| 2 | **Close Mock Authentication** | Open wherever Google is unconfigured, production included; anyone reaching `/mock-login` becomes any account | Configure Google (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `APP_URL`) or set `MOCK_LOGIN=false` |
| 3 | **Production secrets** | The server refuses to start without them | `APP_URL`, `CRON_SECRET`, `ID_ENCRYPTION_KEY` + the Supabase keys ([30-credentials-and-access.md](30-credentials-and-access.md)) |
| 4 | **Change the console password** | Default `0000` | Console → Console Access |
| 5 | **Delete or disable the demo personas and demo data** | They sign in with published passwords | Users & Roles; `supabase/repairs/2026-09-21-clear-test-bookings.sql` for bookings |
| 6 | **Apply every migration to the production database** | Missing ones fail writes quietly | **`npm run check:migrations`** asks the project and names what is missing. Do not write the answer down instead — that is how 24-30 were believed missing for weeks after they were applied |
| 7 | **The office's Settings** | Defaults are guesses: extra-bed rate (none), GSTIN, Accounts email (empty), bank details, retention days, heads of units, Faculty Advisors, hostels and wardens, whitelist | [24-deployment-runbook.md](24-deployment-runbook.md#settings-the-office-must-fill-in) |
| 8 | **Decide `MAIL_REDIRECT_ALL_TO`** | Unset only in production; set everywhere else | |
| 9 | **Backups** | Supabase's free plan has none | Confirm the plan; run the restore drill in the runbook |

**Next security phase** (not a gate for a pilot, but the next real step):
move request-scoped database access off the service-role key so row-level
security becomes the boundary rather than a second line behind the server
([26-security.md](26-security.md) §6).

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
  [23-running-and-testing.md](23-running-and-testing.md) listed markers only up
  to migration 25, so the claim was carried forward by hand after the owner had
  already applied them. **Run the script rather than writing the answer down
  again.** Migrations **17 and 23** are function-only and it cannot see them;
  the one-line SQL for those is in the same file.
## 2a. Loose ends from the 8 Oct 2026 round

- ~~Confirm whether the Special Budget approval upload should be mandatory~~ —
  **answered 9 Oct 2026: it stays optional.** The details box beside it is
  mandatory; the upload is offered and not required, so a requester waiting on
  a scan is not stopped from booking and the desk can ask for it later.
  [06-production-requirements.md](06-production-requirements.md) §2 still
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
  [06-production-requirements.md](06-production-requirements.md) §1.

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
  [16-public-site-and-ui.md](16-public-site-and-ui.md#photographs). Ask
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

From the original plan's "Phase 0", still open:

- **Computer Centre:** LDAP host / base DN / service account / username
  attribute and whether users can edit their own `mail`; a Google OAuth client
  (or confirmation that LDAP alone will do); an SMTP relay or sending mailbox
  (`guesthouse@` / `ghm@`); a subdomain and TLS; hosting (campus VM or Vercel).
- **Administration Section / guest house office:** written sign-off on the
  pipelines ([12-workflows.md](12-workflows.md)); the extra-bed rate and GST
  treatment; the ID retention period; the authoritative hostel and warden list;
  each department's HOD; **each council's Faculty Advisor and secretary
  mailbox**; the guest house phone, email, house rules and photo attribution
  (`grep -rn "TODO(site)"`).
- **Academic office / IT:** the academic database API and token
  ([17-academic-records.md](17-academic-records.md) §4).
- **An owner after the current developers** — someone at the institute must be
  named, or the portal becomes unmaintained software holding ID data.

## 5. Tests that are still thin

`npm test` (405 checks) and `npm run test:e2e` (33 journeys) run in CI. What
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
- **Just-in-time provisioning** of profiles on first sign-in (the plan's
  `account_directory` idea) instead of creating accounts by hand.
- SMS — never asked for; it would be a second `Mailer`-shaped seam.

## 8. Public website follow-ups

Everything tagged `TODO(site)` in `lib/site.ts` and `lib/site-content.ts`:
contact details, a guest-house map pin, the guidelines PDF URL, amenity lines
(six since 30 Sep 2026 — the meeting room and exercise room came off) and
house rules, which guest house each photograph shows, AM's new photographs.
Copy stays plain and unpromising (the owner, 30 Sep 2026). Detail in
[16-public-site-and-ui.md](16-public-site-and-ui.md).

---

## Done — for the record

Every item this roadmap used to carry that has since been built, with where it
is written up (all in [03-decisions.md](03-decisions.md) unless noted):

| Item | Done |
| --- | --- |
| Email notifications and the day-wise report | 16 Sep 2026 — [14-notifications.md](14-notifications.md) |
| Push to GitHub | 10 Sep 2026 |
| Automated tests (Vitest, Playwright, CI) | 21–23 Sep 2026 |
| Settings console (rules, hostels, whitelist) | Phase 1, 21 Sep |
| To = actioner, Copy to = CC | Phase 2, 21 Sep |
| Turnaround buffer | Phase 3, 21 Sep |
| HOD approval, debitable heads, projects | Phase 4, 22 Sep |
| Invoices in the office's template, tariffs, payments | Phase 5, 22 Sep — [15-billing-and-invoices.md](15-billing-and-invoices.md) |
| Dining (meals only) and the kitchen's day | Phase 6, 22 Sep |
| Extend, move rooms, no-shows, maintenance blocks, bulk rooms | Phase 7, 22 Sep |
| Sessions, real Google OIDC, TOTP, throttles in the DB, CSP, encrypted IDs, retention, DPDP | Phase 8, 22 Sep — [26-security.md](26-security.md) |
| Keyword search in Postgres, narrow revalidation, realtime instead of polling | Phase 9, 22–23 Sep |
| Workflow documentation and the production runbook | Phase 10, 23 Sep |
| The office's correction rounds (23 Sep ×2, 24 Sep) and Faculty Advisors by appointment (24 Sep) | [01-background.md](01-background.md), [99-recent-changes.md](99-recent-changes.md) |
| The eighth list, in four phases (7 Oct): the text cleanup, a personal booking never asked which budget pays, students and alumni held to one guest house and no meals, the rates on the form, availability as a count, **the institute's records kept in the portal** (migration 28) with a student's parents locked, invoice version 4, cash retired, a personal stay settled at check-out, **Awaiting payment**, and **Missed** (migration 29) | [01-background.md](01-background.md), [99-recent-changes.md](99-recent-changes.md) |
| White-on-amber contrast | The 19 Sep redesign |
