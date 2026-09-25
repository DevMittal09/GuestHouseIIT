# Deployment and production runbook

How to deploy the portal and how to run it once it is live. Local runs and every way of verifying a change are in [23-running-and-testing.md](23-running-and-testing.md); secrets and logins in [30-credentials-and-access.md](30-credentials-and-access.md).

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
   — [31-ldap-sign-in.md](31-ldap-sign-in.md) §3). **Never deploy without
   `LDAP_URL`:** with it unset the portal accepts the dummy accounts, whose
   passwords are published in this repository.
2. **Delete or disable the demo personas** once the real accounts exist.
3. **Per-request, user-scoped database clients.** Every table has RLS with no
   `authenticated` write policy, but the server still uses the service-role
   key from one server-only module. The boundary today is the server: every
   action re-checks the caller. See
   [26-security.md](26-security.md#6-what-is-deliberately-not-done-yet).

**Deployment steps once those are done:**

1. Push the repository to GitHub (`main` on
   `https://github.com/DevMittal09/GuestHouseIIT.git`; pushes work since
   10 Sep 2026).
2. Import the project in Vercel.
3. Set the environment variables in Vercel's project settings — mark
   `SUPABASE_SERVICE_ROLE_KEY`, `MAIL_APP_PASSWORD`, `CRON_SECRET`,
   `ID_ENCRYPTION_KEY` and `GOOGLE_CLIENT_SECRET` as server-only (do **not**
   prefix them with `NEXT_PUBLIC_`). The full table is in
   [§ Environment variables](#environment-variables) below. Set `APP_URL` and
   `APP_BASE_URL`, or sign-in redirects break and every link in an email points
   at localhost.
4. Deploy; Vercel detects Next.js automatically. `npm run build` must pass first.
5. Apply **all** migrations, in order, and the seed to the production Supabase
   project if it is separate from the development one.
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
  [25-troubleshooting.md](25-troubleshooting.md).
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

# Production runbook

Everything below is for whoever operates the portal once it is live.

## Environment variables

`instrumentation.ts` checks these at boot and refuses to start a production
server that is not fit, naming exactly what is wrong. `.env.example` documents
every one with an example value.

**Required in production**

| Variable | Example | What breaks without it |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://abcdefgh.supabase.co` | The portal has no database |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `eyJhbGciOi...` | The browser cannot subscribe for live updates |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJhbGciOi...` | Every server read and write |
| `APP_URL` | `https://guesthouse.iitpkd.ac.in` | Sign-in redirects, server-action origins |
| `CRON_SECRET` | 32+ random characters | The daily jobs would be open to anyone |
| `ID_ENCRYPTION_KEY` | `openssl rand -base64 32` | Guests' ID numbers would be stored in clear |

**Needed for the portal to be useful**

| Variable | Example | What it turns on |
| --- | --- | --- |
| `LDAP_URL`, `LDAP_BASE_DN` | `ldaps://ldap.iitpkd.ac.in:636`, `dc=iitpkd,dc=ac,dc=in` | Real sign-in. **Without it the dummy accounts work** |
| `LDAP_BIND_DN`, `LDAP_BIND_PASSWORD` | a read-only service account | Directory search where anonymous search is refused |
| `MAIL_USER`, `MAIL_APP_PASSWORD`, `MAIL_HOST` | the institute's relay | Sending mail instead of writing `.eml` files |
| `APP_BASE_URL` | `https://guesthouse.iitpkd.ac.in` | Absolute links inside mail |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | from the Google Cloud console | Real "Sign in with Google" (with `APP_URL`). While unset, the same button reads **Mock Authentication** and opens the persona picker — see `MOCK_LOGIN` |
| `MOCK_LOGIN` | `false` | Closes the Mock Authentication door early. **Required on any deployment with real data while Google is unconfigured** |
| `ACADEMIC_DB_URL`, `ACADEMIC_DB_TOKEN` | the institute ERP | Real requester details instead of the dummy records |

**Optional**

| Variable | Effect |
| --- | --- |
| `ID_ENCRYPTION_KEYS_OLD` | Reads rows written under a retired key: `v1:<base64>,v2:<base64>` |
| `CLAMAV_HOST`, `CLAMAV_PORT` | Virus-scans uploads; an unreachable scanner refuses the upload |
| `SENTRY_DSN` | Error reporting |
| `MAIL_REDIRECT_ALL_TO` | **Set this on every non-production deployment** |
| `MAIL_DRY_RUN` | Logs mail and sends nothing |

**Must never be set in production:** `DEV_LOGIN` (the server refuses to start)
and `ALLOW_MOCK_STORE` (it lets a production build run on a JSON file).
**Must be set on a real deployment unless Google is configured:**
`MOCK_LOGIN=false`.

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

## Settings the office must fill in

Everything below is edited in the portal, not in code, and everything has a
working default — but a default is a guess, and some of these are guesses the
office must replace before real money and real people are involved. Ordered by
what hurts most if it is left alone.

**Must be changed before go-live**

| Setting | Where | Default, and why it must change |
| --- | --- | --- |
| Console password | Console → Access | **`0000`.** It guards every developer action. |
| Room, extra-bed and meal rates | Console → Tariffs & Invoicing | Seeded from the office's tariff sheet (Bageshri ₹1,000/day, raised from ₹750 on 23 Sep 2026; Hamsanandi ₹2,000, and ₹4,000 for the `official` role — "government officers"; breakfast ₹80, lunch ₹120, dinner ₹100; meals free to students and on alumni bookings). **There is no extra-bed rate at all** — an invoice for a room with an extra bed cannot be issued until one is entered. Confirm every rate and its effective date. |
| GSTIN | Console → Tariffs & Invoicing | Carried over from the invoice template. Confirm it against the institute's registration — it is printed on every invoice. |
| Accounts email | Console → Tariffs & Invoicing | **Empty**, so nothing is mailed to Accounts when an official booking's invoice is issued. |
| Bank details (holder, account number, IFSC, branch) | Console → Tariffs & Invoicing | From the template. Guests pay against these. |
| Guest house contact (address, phone, email) | Console → Tariffs & Invoicing | From the template; also shown on the public site. |
| Departments, clubs and their heads | Console → Departments & Clubs | The HOD queue follows whoever heads a unit. Nobody set means the HOD stage is skipped and the log says so. |
| Each council's and club's **Faculty Advisor** and secretary's mailbox | Console → Departments & Clubs → Faculty Advisors | Nobody can book for a club until its advisor (or its council's) is named. Only `sec_arts@` is seeded. |
| Hostels and their wardens | Console → Users & Roles | A student's request goes to the warden of the hostel on their profile. |
| Official email whitelist | Console → Settings | Which addresses may book as an office. |

**Should be reviewed, because the default is a policy choice**

| Setting | Default | What it decides |
| --- | --- | --- |
| Advance booking window | 1 month | How far ahead a check-in may be requested. Official, the manager and the developer are exempt. |
| Longest stay | 14 nights | 0 removes the limit. Official, the manager, the developer and `director.office@` are exempt. |
| Turnaround buffer | 240 minutes | The least gap between one stay's check-out and the next check-in on the same room. Changing it rebuilds every hold and is refused if that would make two stays clash. |
| No-show release | 0 (off) | Hours after the booked check-in at which an unclaimed stay is released automatically, with mail to the requester. |
| Day basis and grace hours | Nights, 4 hours | What "Day(s)" on an invoice counts. |
| Rates include GST | Yes | The office's rates do, so the Grand Total is the quoted price and the tax is shown inside it. |
| GST percentages and SAC codes | 5% up to ₹7,500/day, 18% above, 5% on food | As in force since 22 Sep 2025. Check before the next Council revision bites. |
| Meal windows | 07:30–09:30, 12:30–14:00, 19:30–21:00 | Which meals a stay can include, and the kitchen's day. |
| Room capacity | Per room type: single 1 (2 with an extra bed), double 2 (3). Per room card: 4 people, at most 3 needing a bed, at most 3 infants | Room type at allocation; room card at submission. |
| Debitable heads per category | See [13-settings-and-defaults.md](13-settings-and-defaults.md#debitable-heads--rulesdebit) | What each kind of requester may charge a stay to. **Faculty can never be given the Institute Grant, and students and personal bookings never Special Funds** (`FORBIDDEN_DEBIT_HEADS`) — those cells are greyed, and the rule is applied on read as well as on save. |
| ID retention | 365 days after the stay | When identity numbers and ID documents are erased. |
| Audit retention | 180 days | Cannot be set lower — CERT-In expects 180 days of logs. |

**Outside Settings, still the office's to confirm:** the guest house phone and
email on the public site and the house rules on `/guidelines` (everything
tagged `TODO(site)` in `lib/site.ts` and `lib/site-content.ts`), and the
wording of the automatic mail (Console → Mail Templates).

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
[25-troubleshooting.md](25-troubleshooting.md).

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
5. **Write it up** in [25-troubleshooting.md](25-troubleshooting.md): what
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
