# Credentials, sign-in and security

Every login that exists today, how sign-in works, every secret by name and
place, and what protects the portal.

> **This folder is committed and pushed to GitHub**
> (`github.com/DevMittal09/GuestHouseIIT`). So this file holds only
> credentials that are **already public by design** — the dummy LDAP accounts,
> the demo console password, the seed's auth password — and, for every *real*
> secret, its **name and where it lives, never its value**. Real values are in
> `.env.local` on the developer's machine (git-ignored) and, once deployed, in
> the host's environment settings. Never paste a real key into this folder, an
> issue, a commit or a log.

Verified against `lib/ldap/mock-directory.ts`, `lib/store/seed.ts`,
`supabase/seed.sql`, `lib/env.ts`, `lib/oidc.ts`, `proxy.ts` and `.env.example`
on 10 Oct 2026. The reasoning behind these choices is in
[02-decisions.md](02-decisions.md); what production must still change is
[04-production.md](04-production.md).

---

## Part 1 — Every login that exists today

### Demo logins (dummy LDAP directory)

Used whenever `LDAP_URL` is **unset**. Sign in on `/sign-in` with the LDAP
username and password below — or, while Google is unconfigured, press **Mock
Authentication** and pick the persona with one click (no password).
**Keep this table and `lib/ldap/mock-directory.ts` in step.**

| Persona | Role | LDAP username | Password | Email | Mock profile id | Demonstrates |
| --- | --- | --- | --- | --- | --- | --- |
| Anjali Menon (Malhar) | Student | `112201001` | `Anjali@2026` | `112201001@smail.iitpkd.ac.in` | `student-anjali` | Student → Malhar warden; demo booking 1 |
| Rahul Nair (Saveri) | Student | `142202014` | `Rahul@2026` | `142202014@smail.iitpkd.ac.in` | `student-rahul` | Another hostel; no parents on record → guardian |
| Dr. Priya Sharma | Employee (faculty, CSE) | `priya` | `Priya@2026` | `priya@iitpkd.ac.in` | `employee-priya` | Official → CSE HOD; personal; meals only. Shown as the sample on the sign-in card |
| Dr. Arun Prasad | Employee (faculty, CSE) — **Faculty Advisor** of the Cultural Affairs Council and Petrichor | `arun.prasad` | `Arun@2026` | `arun.prasad@iitpkd.ac.in` | `faculty-arun` | "Booking as: Faculty Advisor — …", straight to the manager |
| Prof. R. Venkatesh | Employee (faculty) — **HOD, CSE** by appointment | `hod.cse` | `HodCse@2026` | `hod.cse@iitpkd.ac.in` | `hod-cse` | HOD Queue (`/hod`) |
| Ravi K. | Employee — non-teaching staff, CSE | `ravi.k` | `Ravi@2026` | `ravi.k@iitpkd.ac.in` | `staff-ravi` | Staff debit heads (**Personal Funds only**, 8 Oct 2026) |
| Director's Office | Official — officer office, whitelisted | `admin` | `Director@2026` | `admin@iitpkd.ac.in` | `official-admin` | Direct / HOD choice; Institute Grant; exempt from window and stay cap |
| CSE Department Office | Official — department office | `cse.office` | `CseOffice@2026` | `cse.office@iitpkd.ac.in` | `office-cse` | Department office → CSE HOD; the offices' six heads. On the whitelist through the demo seeds |
| Petrichor Fest Council | Club (fest) | `petrichor` | `Petrichor@2026` | `petrichor@iitpkd.ac.in` | `club-petrichor` | Cannot book — told to ask its Faculty Advisor; demo booking 2 (legacy club stage) |
| Cultural Affairs Council | Club (council's own account = secretary's mailbox) | `sec_arts` | `SecArts@2026` | `sec_arts@iitpkd.ac.in` | `council-cultural` | Booked for by its Faculty Advisor |
| Meera Nair | Student — Cultural Affairs **secretary** (heads the council) | `112301045` | `Meera@2026` | `112301045@smail.iitpkd.ac.in` | `secretary-cultural` | Club Approvals (`/approvals`) for legacy club requests |
| IAR Student Cell | IAR Student Cell | `alumnicell` | `AlumniCell@2026` | `alumnicell@iitpkd.ac.in` | `iar-student-cell` | Alumni booking → IAR Office; demo booking 3 |
| IAR Office | IAR Office | `iar` | `IarOffice@2026` | `iar@iitpkd.ac.in` | `iar-cell` | IAR Queue; books official / alumni |
| Dr. Suresh Kumar | Assistant Warden, Malhar | `warden.malhar` | `Malhar@2026` | `warden.malhar@iitpkd.ac.in` | `warden-malhar` | Warden queue |
| Dr. Lakshmi Devi | Assistant Warden, Saveri | `warden.saveri` | `Saveri@2026` | `warden.saveri@iitpkd.ac.in` | `warden-saveri` | Scoping (sees only Saveri) |
| Guest House Manager | GH Manager | `guesthouse` | `Manager@2026` | `guesthouse@iitpkd.ac.in` | `gh-manager` | Allocation, desk, invoices, console |
| Guest House Caretaker | GH Caretaker | `gh.reception` | `Reception@2026` | `gh.reception@iitpkd.ac.in` | `gh-caretaker` | Reception |
| Portal Developer | Developer | `developer` | `Developer@2026` | `developer@iitpkd.ac.in` | `developer` | Full console (needs 2FA enrolment — below) |
| *(no portal account)* | — | `visitor` | `Visitor@2026` | `visitor@iitpkd.ac.in` | — | "Valid LDAP account, not registered on the portal" |

- **Retired:** `fa.petrichor` / `Advisor@2026` (the old dedicated Faculty
  Advisor account, replaced by Dr. Arun Prasad on 24 Sep 2026) and the alumnus
  persona (retired 16 Sep 2026). An old `.local-db.json` or a hosted database
  may still hold those rows — seeds never delete.
- Usernames are the local part of the email; case and surrounding spaces are
  ignored. Passwords are case-sensitive. The real student username format is the
  roll number (the owner gave `142301026` as an example); the staff format is
  unconfirmed.
- **Supabase ids:** `supabase/seed.sql` gives the same personas uuids
  `11111111-1111-1111-1111-1111111111NN` (01–20, no 06 or 09 any more) and the
  units `33333333-3333-3333-3333-3333333333NN`. The mock store uses the
  readable ids above.

### Other demo credentials

| What | Value | Notes |
| --- | --- | --- |
| **Console password** (`/admin`, manager and developer) | `0000` | Default until changed in Console Access; stored as a scrypt hash in `app_settings`. **Must be changed before go-live.** |
| **Developer second factor** | *enrol your own* | First console use as `developer`: Console → Security → set up an authenticator (TOTP), keep the ten recovery codes. Needed before any role change, Settings change or delete. Stored in the database the portal is using — deleting `.local-db.json` removes it |
| Supabase **Auth** password for seeded / console-created users | `password123` | Not a portal login — nothing signs in with it; the rows exist because `profiles.id → auth.users` |
| Sample shown on the sign-in card | `priya` / `Priya@2026` | Only while the dummy directory is in use |


### How to sign in quickly for a check


- **Browser:** `/sign-in` → Mock Authentication → pick a persona. Or type an
  LDAP username and password from the table above.
- **Playwright:** `e2e/helpers.ts` has `ACCOUNTS` and `signIn()`.
- **curl in development:** `DEV_LOGIN=true npm run dev`, then
  `curl -b "gh_mock_user=<mock profile id>" localhost:3000/<page>`. Only
  honoured with `DEV_LOGIN=true` outside production.

---

## Part 2 — How sign-in works, and the real directory

### How sign-in works

```
LDAP form ─▶ signInWithLdap() (app/actions/auth.ts)
              1. normalise the uid; reject blanks, "@" (unless the directory uses email usernames), bad characters
              2. throttle: 8 attempts / 15 min per `ldap:<uid>` (a row in the database — RATE_LIMITS.signIn)
              3. getDirectory().authenticate(uid, password)      ← "is this the password?"
                   LDAP_URL set → LdapDirectory (ldapts, search-then-bind)
                   otherwise    → MockDirectory (accounts in 05-credentials-and-security.md)
              4. profileForDirectoryEntry(entry) (lib/ldap/link.ts) ← "which portal account?"
                   profiles.ldap_uid match, else (opt-in) link by email
              5. create a session row (opaque cookie), redirect to safe `next` or homeForRole()

Second button, Google unconfigured ─▶ "Mock Authentication" ─▶ /mock-login?next=… ─▶ loginAs(profileId, next)
Second button, Google configured   ─▶ "Sign in with Google" ─▶ /api/auth/google/start ─▶ callback (lib/oidc.ts)
```

Two questions, two systems. **The directory checks the password. The portal's
`profiles.ldap_uid` says who you are:** role, hostel, club. So a valid LDAP
login with no matching profile gets in nowhere.

Error messages:

- **"Incorrect username or password"** covers both an unknown user and a wrong
  password, so the page cannot be used to find out which usernames exist.
- **"Not registered"** is only shown *after* the password is proven.
- **A directory outage** reads "could not be reached …", and the real error
  is logged.

Session: a row in `sessions` since Phase 8, with an opaque token in the cookie
(`lib/sessions.ts`; 30 min idle, 12 h absolute). LDAP proves who typed the
password; the session row is what proves, on every later request, that the
person holding the cookie is the one who did. The unsigned `gh_mock_user`
cookie it replaced is honoured only with `DEV_LOGIN=true` outside production.

### Moving to the real LDAP accounts

Nothing in the code changes. Three steps:

1. **Apply migration 12** (`supabase/migrations/00000000000012_profile_ldap_uid.sql`)
   to the Supabase project. It adds `profiles.ldap_uid` plus a unique index on
   `lower(ldap_uid)`. Until then, LDAP sign-in finds nobody on Supabase and
   saving a user in the console fails. Then re-run `supabase/seed.sql`, or just
   its `update … set ldap_uid` block, to give the demo personas their
   usernames.
2. **Put the real usernames on the profiles.** Any one of these:
   - **Developer console → Users & Roles → Import LDAP usernames.** Paste
     `email, ldap username` pairs, one per line. A two-column spreadsheet
     paste works, and a header row and `#` comments are skipped. It matches by
     email and is **all or nothing**: an unknown email, a bad or duplicated
     username, or a username already on another account refuses the whole
     paste and lists each problem. Swaps within one paste are allowed. The
     planning code is `planLdapUidImport` in `lib/ldap/import.ts`.
   - **The Edit dialog, one user at a time** (the "LDAP username" field).
   - **SQL, for a bulk load straight into Postgres:**
     ```sql
     update public.profiles p set ldap_uid = v.uid
     from (values ('142301026@smail.iitpkd.ac.in', '142301026')) as v(email, uid)
     where p.email = v.email;
     -- students only, if the username is always the roll number:
     -- update public.profiles set ldap_uid = roll_number
     --   where role = 'student' and ldap_uid is null and roll_number is not null;
     ```
   - **`LDAP_LINK_BY_EMAIL=true`** (below): each person links on first sign-in.
3. **Point the portal at the directory** (all in `.env.example`):
   ```
   LDAP_URL=ldaps://<institute ldap host>:636   # or ldap:// + LDAP_STARTTLS=true
   LDAP_BASE_DN=dc=iitpkd,dc=ac,dc=in           # required; subtree search
   LDAP_BIND_DN=…  LDAP_BIND_PASSWORD=…          # read-only service account, if anonymous search is refused
   LDAP_UID_ATTRIBUTE=uid                        # sAMAccountName on AD; mail / userPrincipalName if people log in with addresses
   ```
   - **Setting `LDAP_URL` turns the dummy accounts off entirely.**
   - **`LDAP_URL` without `LDAP_BASE_DN` fails sign-in** rather than falling
     back to the published dummy passwords.
   - **A certificate signed by the institute's own CA** needs
     `NODE_EXTRA_CA_CERTS=<ca.pem>`.

**`LDAP_LINK_BY_EMAIL=true`** (off by default) covers a login whose username is
on no profile yet. It links to the profile whose `email` equals the directory
entry's `mail`, provided that profile has no LDAP username of its own, and
records the username on it. It never overwrites an existing `ldap_uid`.

Only enable it after the LDAP admins confirm that users **cannot edit their
own `mail`** in the directory. Otherwise anyone could claim anyone's profile.

**Questions for the institute's LDAP admins:**

- the host and port, and ldaps vs StartTLS
- the base DN and the OUs students and staff live in
- whether anonymous search is allowed, or a service account is needed
- the username attribute
- whether `mail` is admin-controlled
- the staff username format

### What was verified (19 Sep 2026)

- **Throwaway `osixia/openldap:1.5.0` container**, with students and staff in
  different OUs:
  - search-then-bind through a service account
  - a wrong password, an empty password and an unknown user all return `null`
    (an empty password must never become an unauthenticated bind)
  - `*` is escaped, not treated as a wildcard
  - a bad service password, a down server, a refused anonymous search, and
    StartTLS against an untrusted certificate all fail closed as
    `DirectoryUnavailableError`
  - `LDAP_UID_ATTRIBUTE=mail` works
- **Full stack on a mock-store dev server pointed at that container:**
  - a real login lands on `/book`
  - the dummy password is refused
  - an unlinked account is "not registered"
  - link-by-email is off by default; when on, it records the username and
    refuses to overwrite one
- **Dummy mode:**
  - every persona's login
  - uid case and spaces are ignored
  - wrong password, `visitor`, and an address typed as the username
  - the Google button carries `next=/book` through `/mock-login`
  - the console import (a bad paste changes nothing; a good one applies)
  - 320 px layout on `/sign-in`, `/book-room` and `/mock-login`
- **Migration 12 in a throwaway `postgres:16-alpine`:** re-runnable; the index
  refuses `PRIYA` beside `priya`; the seed update is idempotent.

The throwaway scripts are not in the repo. Re-create them from the list above
if you touch `lib/ldap/`.

---

## Part 3 — Secrets and environment variables

### Every real secret — name, place, and what to do if it leaks

One table, because the two this folder used to keep drifted apart. **No value
appears here.**

| Secret | What it is | Where it lives now | Real value comes from | If it leaks |
| --- | --- | --- | --- | --- |
| `SUPABASE_SERVICE_ROLE_KEY` | Full database access, bypasses RLS — **the most dangerous secret** | `.env.local` (set); hosting provider's environment in production | Supabase → Project Settings → API | Rotate immediately in Supabase → Settings → API, redeploy, then read the audit log for what was done with it |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | The hosted project's URL and public key (not secret, but they identify the project) | `.env.local` (set) | same | Nothing to rotate; RLS is what makes the anon key safe to ship |
| `ID_ENCRYPTION_KEY` (+ `ID_ENCRYPTION_KEYS_OLD`) | AES-256-GCM key for ID numbers and TOTP secrets | **not set locally** (values stored in clear then); required in production | `openssl rand -base64 32` | Generate a new one, move the old value into `ID_ENCRYPTION_KEYS_OLD`, redeploy; rows re-encrypt as they are written |
| `CRON_SECRET` | Bearer token for `/api/mail/*` | **not set locally**; required in production | `openssl rand -base64 32` | Rotate and redeploy; the endpoints refuse the old value at once |
| `MAIL_USER`, `MAIL_APP_PASSWORD` | The Gmail sender and its app password | `.env.local` (set) | Google account → App passwords (paste without spaces; the code strips them anyway) | Rotate with the institute's mail administrator (today a Gmail app password) |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Real Google sign-in | not set | Google Cloud console (institute project) | Rotate in the Google Cloud console |
| `LDAP_BIND_PASSWORD` (with `LDAP_URL`, `LDAP_BASE_DN`, `LDAP_BIND_DN`) | The institute directory and its read-only service account | not set (dummy directory in use) | the institute's LDAP administrators | Rotate with the directory administrators |
| `ACADEMIC_DB_TOKEN` (with `ACADEMIC_DB_URL`) | The academic database API | not set (the office's own imported records are used) | the academic office / IT | Rotate with whoever issued it |
| `MAIL_REDIRECT_ALL_TO`, `MAIL_DRY_RUN` | Test mailbox that swallows all mail / no-send switch | `.env.local` (set) | a mailbox the developer reads | Not a secret — but **unset the redirect in production** or no Copy-to address ever receives anything |
| `APP_URL`, `APP_BASE_URL` | The site's own URL (redirects, links in mail) | `.env.local` (set) | the deployment URL | Not a secret |
| `SENTRY_DSN`, `CLAMAV_HOST` | Error reporting, virus scanning | not set | optional | Rotate the DSN in Sentry |

`.env` and `.env.local` hold real values on a developer's machine. They are
git-ignored, and `.gitleaks.toml` has rules for the service-role key, the mail
password, the cron secret and the encryption key. **Never commit one, never log
one, never paste one into an issue.** Rotation procedure:
[04-production.md](04-production.md#rotating-a-secret).

### Environment variables — all of them, and what each switches

Every variable the code reads (`lib/env.ts`, `lib/mail/config.ts`,
`lib/ldap/index.ts`, `lib/academic/index.ts`, `lib/store/index.ts`).
`.env.example` documents most of them with placeholders. This is the one copy;
[04-production.md](04-production.md) lists only *which* of these production
must set.

| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Supabase store; otherwise the JSON mock (`.local-db.json`) | **Required** (URL + service key) |
| `APP_URL` (or `NEXT_PUBLIC_APP_URL`), `APP_BASE_URL` | OAuth redirect, server-action origin; absolute links in mail | **Required** (`APP_URL`) |
| `CRON_SECRET` | Guards `/api/mail/cron` and `/api/mail/dispatch` (≥ 16 chars) | **Required** |
| `ID_ENCRYPTION_KEY`, `ID_ENCRYPTION_KEYS_OLD` | Encrypt ID numbers / TOTP secrets; old keys for rotation (`v1:…,v2:…`) | **Required** (the key) |
| `LDAP_URL`, `LDAP_BASE_DN`, `LDAP_BIND_DN`, `LDAP_BIND_PASSWORD`, `LDAP_UID_ATTRIBUTE`, `LDAP_STARTTLS`, `LDAP_LINK_BY_EMAIL` | Real directory; without `LDAP_URL` the dummy accounts above work | **Required for any real deployment** |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Real Google sign-in (with `APP_URL`); closes Mock Authentication | Recommended |
| `MOCK_LOGIN` | `false` closes Mock Authentication | **Set to `false` unless Google is configured** |
| `DEV_LOGIN` | Development-only developer doors (the legacy `gh_mock_user` cookie) | **Never** — the server refuses to start |
| `ALLOW_MOCK_STORE` | Lets a production build run on the JSON store (e2e only) | **Never** |
| `MAIL_USER`, `MAIL_APP_PASSWORD` / `MAIL_PASSWORD`, `MAIL_HOST`, `MAIL_PORT`, `MAIL_SECURE`, `MAIL_FROM`, `MAIL_FROM_NAME`, `MAIL_REPLY_TO`, `MAIL_MESSAGE_ID_DOMAIN` | SMTP transport; otherwise `.local-mail/*.eml` | Needed to send mail |
| `MAIL_DRY_RUN` | Log mail, send nothing | — |
| `MAIL_REDIRECT_ALL_TO` | Every message to one address (originals in `X-Original-To/Cc`) | **Unset only in production; set everywhere else** |
| `ACADEMIC_DB_URL`, `ACADEMIC_DB_TOKEN` | Real academic records | When available |
| `SENTRY_DSN` | Error reporting | Optional |
| `CLAMAV_HOST`, `CLAMAV_PORT` | Virus-scan uploads (an unreachable scanner refuses uploads) | Optional |
| `MOCK_DB_PATH`, `E2E_DB`, `E2E_PORT` | Throwaway databases for tests | Tests only |


### Accounts and places

| What | Where |
| --- | --- |
| Code | `https://github.com/DevMittal09/GuestHouseIIT.git`, branch **`main`** (the `ui` branch holds only the 21 Sep vermilion redesign, superseded by the 26 Sep redesign on `main`, and has diverged). Pushes from this machine's identity (`Rizzwan285`) work since 10 Sep 2026 |
| Database | One hosted Supabase project (development / demo data), reached through `.env.local`. **Migrations are applied by hand in its SQL editor** — which ones it has is not recorded ([22-running-and-testing.md](22-running-and-testing.md#hosted-supabase) has the check) |
| Deployment | Vercel (Hobby plan: two daily crons, no `regions`) — not yet a production deployment |
| Mail | A Gmail sender with an app password (in `.env.local`); the institute relay is the eventual target |
| Office contacts on the site / invoice | ghm@iitpkd.ac.in, +91 491 209 2016 (from the office's invoice template) |


---

## Part 4 — What protects the portal

### What we are protecting

| Asset | Why it matters |
| --- | --- |
| Guests' identity numbers and ID documents | Aadhaar and passport numbers, uploaded ID cards. Personal data under the DPDP Act. |
| Who stayed where, and when | A guest register is a record of people's movements. |
| Invoices and payments | The institute's financial record. Numbered, and immutable once issued. |
| Staff accounts and roles | Whoever can change roles can approve anything. |
| The service-role key | It bypasses row-level security entirely. |

**The single most dangerous secret is `SUPABASE_SERVICE_ROLE_KEY`.** It reads
and writes every table with no policy in its way. It is set on the server only,
never exposed to the browser, never logged, and never committed.

---

### The controls, in order of what they stop

#### Authentication

- **LDAP** against the institute directory (`lib/ldap/`), or **Google sign-in**
  restricted to institute domains (`lib/oidc.ts`: state + PKCE, the id_token
  verified against Google's JWKS — signature, issuer, audience, expiry, nonce —
  then `email_verified`, the `hd` claim, and finally an existing portal
  account). No portal passwords exist to steal.
- **Sessions are rows** (`sessions`, migration 21). The cookie holds 32 random
  bytes; only its SHA-256 is stored, so a database dump cannot be replayed as a
  login. 30 minutes idle, 12 hours absolute, revocable one at a time or all at
  once, rotated whenever a session gains privilege. `__Host-gh_session` in
  production. `lib/auth.ts` is the only reader.
- **Mock Authentication** — the one-click persona picker (`/mock-login`,
  `loginAs`) — is open **whenever Google sign-in is not configured, production
  included** (`mockLoginEnabled()`, 23 Sep 2026: the office's demo deployment
  needs it). Configuring Google closes it; `MOCK_LOGIN=false` closes it early.
  **Anyone who reaches it can become any account**, so a deployment holding
  real bookings must do one or the other. `lib/env.ts` separately refuses to
  boot production with `DEV_LOGIN` set (the legacy `gh_mock_user` cookie door).
- Sign-in attempts: 8 per username per 15 minutes; console unlock 6 per 15
  minutes; second-factor codes 10 per 10 minutes — all counted in the database.

#### Authorisation

- Every server action re-checks the caller server-side. The UI hiding a button
  is a courtesy, never the control.
- The developer console is behind its own password **and** a second factor:
  TOTP (`lib/totp.ts`), with ten recovery codes kept only as scrypt hashes.
  Role changes, Settings and every delete need the code proved again within ten
  minutes (`stepUpProblem`).
- Row-level security is on for every table, with no `authenticated` write
  policy — which is what makes the public anon key safe to ship. **The server
  still uses the service-role key** (see "What is deliberately not done yet"
  at the foot of this file).

#### Data at rest

- Identity numbers and TOTP secrets are encrypted with AES-256-GCM
  (`lib/crypto.ts`), the key version stored in the value so
  `ID_ENCRYPTION_KEYS_OLD` can carry old rows through a rotation. Screens and
  exports show the last four digits only.
- Uploaded documents live outside `public/`, are named randomly, have their
  EXIF and PNG text chunks stripped, and are typed by their **bytes**, not
  their filename. Optional ClamAV (`CLAMAV_HOST`); a configured-but-unreachable
  scanner refuses the upload rather than storing it unscanned.
- Documents are served only by `/api/documents/…`, which checks who is asking,
  writes a `document.viewed` audit row, and signs a five-minute link.

#### Data in transit and in the browser

- `proxy.ts` sets, on every response: a Content-Security-Policy with a
  per-request nonce and `strict-dynamic`, HSTS (production only),
  `frame-ancestors 'none'`, `X-Content-Type-Options: nosniff`,
  Referrer-Policy, Permissions-Policy, COOP, CORP, and `X-Robots-Tag: noindex`
  on every portal path.
- `style-src` still allows `'unsafe-inline'`: the charts position bars with
  `style=` attributes, which a nonce cannot cover.

#### Abuse

- Throttles live in the database (`hit_rate_limit`), so a restart does not
  reset a brute-force counter and every instance shares one. Routes answer
  **429** with `Retry-After`.
- The cron endpoints take a bearer secret in the Authorization header. A GET is
  accepted only when it also carries Vercel's `x-vercel-cron` header. **A
  secret never travels in a query string** — that is written to every access
  log it passes.

#### Accountability

- `security_audit` records sign-ins (success and failure), console unlocks,
  role and settings changes, document views, exports, invoice actions,
  overrides, second-factor events and privacy requests. Append-only; readable
  at Console → Audit Log.
- `lib/log.ts` writes structured JSON with emails, long digit strings and
  secrets redacted, and posts to Sentry when `SENTRY_DSN` is set.

#### Retention and privacy (DPDP)

- A versioned privacy notice at `/privacy`, a consent tick on the booking form
  stored with the notice's version, "Download my data" and "Ask for erasure"
  on the dashboard, and the office answering each request from Console →
  Security.
- `lib/retention-server.ts` runs nightly: identity fields and their documents
  are erased `id_retention_days` (Setting, default 365) after a stay ends, and
  the audit log is trimmed to `audit_retention_days` — which the database will
  not let fall below 180.
- Erasure is a **request**, not a switch. Records the guest house must keep for
  audit cannot be erased, and the answer says so.

---

### If something goes wrong

1. **Contain.** Rotate the secret involved (Part 3) and redeploy. Revoke sessions
   from Console → Security if an account is suspected.
2. **Find out what happened.** Console → Audit Log, filtered by event and time;
   the server logs; Supabase's own logs.
3. **Report.** A personal-data breach is reportable to **CERT-In within 6
   hours** of becoming aware of it, and to the Data Protection Board and the
   affected people under the DPDP Act. The institute's own incident process
   decides who files; the portal's part is the evidence. The runbook, with
   who to contact, is in
   [22-running-and-testing.md](04-production.md#incident-response).
4. **Write it down.** A short note in [22-running-and-testing.md](22-running-and-testing.md)
   — what happened, what was done, what would have prevented it.

`public/.well-known/security.txt` tells a finder where to report a
vulnerability. Keep its `Expires` date current.

---

### Keeping it healthy

- `npm audit` on every dependency change; Dependabot groups Next's packages.
- Node is pinned by `.nvmrc` and `engines`.
- CI runs lint, types, unit tests and the end-to-end journeys **with no
  secrets at all** — nothing in CI can reach the hosted project, by
  construction.
- Migrations are tested in a throwaway Postgres before they are committed
  ([22-running-and-testing.md](22-running-and-testing.md#verifying-changes)).

---

### What is deliberately not done yet

**Real sign-in in front of real data.** Until `LDAP_URL` is set the dummy
directory accepts the passwords published in Part 1 of this file, and until
Google is configured (or `MOCK_LOGIN=false`) Mock Authentication is open. Both are
fine for the demo deployment and both must change before real bookings.

**Per-request, user-scoped database clients.** Every table has RLS on and no
`authenticated` write policy, and the policies are tested with two users in the
migration harness — but the server still reaches the database with the
service-role key from one server-only module. Making the store per-request
would mean minting Supabase JWTs and rewriting every write path to satisfy the
policies. Today the boundary is the server: every action re-checks the caller.
This is the first item of the next security phase
([03-roadmap.md](03-roadmap.md)).

**A second factor for staff other than developers.** Wardens, HODs and the
manager sign in with the institute directory and nothing more. The seam is
`stepUpProblem()`, which returns null for those roles today; that is where the
demand would be added if the institute asks for it.
