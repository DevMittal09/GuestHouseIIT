# Roadmap — what is open, in priority order

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
| 6 | **Apply every migration to the production database** | Missing ones fail writes quietly | [23-running-and-testing.md](23-running-and-testing.md#hosted-supabase) has a query that shows which are missing |
| 7 | **The office's Settings** | Defaults are guesses: extra-bed rate (none), GSTIN, Accounts email (empty), bank details, retention days, heads of units, Faculty Advisors, hostels and wardens, whitelist | [24-deployment-runbook.md](24-deployment-runbook.md#settings-the-office-must-fill-in) |
| 8 | **Decide `MAIL_REDIRECT_ALL_TO`** | Unset only in production; set everywhere else | |
| 9 | **Backups** | Supabase's free plan has none | Confirm the plan; run the restore drill in the runbook |

**Next security phase** (not a gate for a pilot, but the next real step):
move request-scoped database access off the service-role key so row-level
security becomes the boundary rather than a second line behind the server
([26-security.md](26-security.md) §6).

## 2. Loose ends from the 24 and 25 Sep 2026 rounds

- **Apply migration 26 to the hosted project** (with 24 and 25 if missing).
  Until it is applied, an invoice with an additional charge is refused there;
  everything else works.
- **Confirm the GST treatment with the office's accountant** (25 Sep 2026):
  the tariffs are read as **including** GST at 18% on rooms and 5% on food
  (Settings → Tariffs & Invoicing, "Rates include GST"), so the guest pays the
  tariff and the taxable value is backed out; if the tariffs are before GST,
  untick it. And that damage or loss recovered from a guest ("Other" charges)
  carries no GST.
- **The hosted invoice Settings row** is upgraded to 18% / 5% on read the
  first time; saving Tariffs & Invoicing once writes it (revision 2).
- **Office to confirm "Fill in from saved details"** is welcome for every
  role: it offers the people on a requester's own earlier bookings (names,
  gender, relationship, citizenship only).
- **Apply migrations 24 and 25 to the hosted project** (and check what else it
  is missing — its state is not recorded). Until 25, nobody can book for a club
  there; until 24, a booking with a Copy-to address or a project sub-head is
  refused, and a baby typed as age 0 still is. Migration 25's backfill will
  name the old `fa.petrichor` account Petrichor's advisor — replace it with a
  faculty member in Departments & Clubs → Faculty Advisors.
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

## 3. Found in the documentation audit (24 Sep 2026)

Small, real, and none urgent. Three were **fixed the same evening**: the
developer is no longer offered a booking form it could not submit (book on
behalf is the manager's alone), the help line shows the guest house's own
number from the one source in `lib/site.ts`, and Reception has a Meal counts
link to the kitchen page. Still open:

- **The alumni guest house is matched by name** (`ALUMNI_GUEST_HOUSE_NAME =
  "Bageshri"`, `lib/policy.ts`) — the one rule that breaks "never check a guest
  house's name". A flag like `serves_meals` would remove it.
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

`npm test` (304 checks) and `npm run test:e2e` (26 journeys) run in CI. What
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
and house rules, which guest house each photograph shows. Detail in
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
| White-on-amber contrast | The 19 Sep redesign |
