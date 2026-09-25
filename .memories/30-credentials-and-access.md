# Credentials and access — every login, and where every secret lives

> **This folder is committed and pushed to GitHub**
> (`github.com/DevMittal09/GuestHouseIIT`). So this page holds only
> credentials that are **already public by design** — the dummy LDAP accounts,
> the demo console password, the seed's auth password — and, for every *real*
> secret, its **name and where it lives, never its value**. Real values are in
> `.env.local` on the developer's machine (git-ignored) and, once deployed, in
> the host's environment settings. Never paste a real key into this folder, an
> issue, a commit or a log.

Verified against `lib/ldap/mock-directory.ts`, `lib/store/seed.ts`,
`supabase/seed.sql`, `lib/env.ts` and `.env.example` on 24 Sep 2026.

---

## 1. Demo logins (dummy LDAP directory)

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
| Ravi K. | Employee — non-teaching staff, CSE | `ravi.k` | `Ravi@2026` | `ravi.k@iitpkd.ac.in` | `staff-ravi` | Staff debit heads (Department / Special Funds) |
| Director's Office | Official — officer office, whitelisted | `admin` | `Director@2026` | `admin@iitpkd.ac.in` | `official-admin` | Direct / HOD choice; Institute Grant; exempt from window and stay cap |
| CSE Department Office | Official — department office | `cse.office` | `CseOffice@2026` | `cse.office@iitpkd.ac.in` | `office-cse` | Department office → CSE HOD; Department / Special Funds. On the whitelist through the demo seeds |
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

## 2. Other demo credentials

| What | Value | Notes |
| --- | --- | --- |
| **Console password** (`/admin`, manager and developer) | `0000` | Default until changed in Console Access; stored as a scrypt hash in `app_settings`. **Must be changed before go-live.** |
| **Developer second factor** | *enrol your own* | First console use as `developer`: Console → Security → set up an authenticator (TOTP), keep the ten recovery codes. Needed before any role change, Settings change or delete. Stored in the database the portal is using — deleting `.local-db.json` removes it |
| Supabase **Auth** password for seeded / console-created users | `password123` | Not a portal login — nothing signs in with it; the rows exist because `profiles.id → auth.users` |
| Sample shown on the sign-in card | `priya` / `Priya@2026` | Only while the dummy directory is in use |

## 3. Real secrets — names and places only

| Secret | What it is | Where it lives now | Where the real value comes from |
| --- | --- | --- | --- |
| `SUPABASE_SERVICE_ROLE_KEY` | Full database access, bypasses RLS — **the most dangerous secret** | `.env.local` (set) | Supabase → Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | The hosted project's URL and public key (not secret, but identify the project) | `.env.local` (set) | same |
| `MAIL_USER`, `MAIL_APP_PASSWORD` | The Gmail sender and its app password | `.env.local` (set) | Google account → App passwords (paste without spaces; the code strips them anyway) |
| `MAIL_REDIRECT_ALL_TO`, `MAIL_DRY_RUN` | Test mailbox that swallows all mail / no-send switch | `.env.local` (set) | a mailbox the developer reads |
| `APP_URL`, `APP_BASE_URL` | The site's own URL (redirects, links in mail) | `.env.local` (set) | the deployment URL |
| `CRON_SECRET` | Bearer token for `/api/mail/*` | **not set locally**; required in production | `openssl rand -base64 32` |
| `ID_ENCRYPTION_KEY` (+ `ID_ENCRYPTION_KEYS_OLD`) | AES key for ID numbers and TOTP secrets | **not set locally** (values stored in clear then); required in production | `openssl rand -base64 32` |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Real Google sign-in | not set | Google Cloud console (institute project) |
| `LDAP_URL`, `LDAP_BASE_DN`, `LDAP_BIND_DN`, `LDAP_BIND_PASSWORD` | The institute directory | not set (dummy directory in use) | the institute's LDAP administrators |
| `ACADEMIC_DB_URL`, `ACADEMIC_DB_TOKEN` | The academic database API | not set (dummy records) | the academic office / IT |
| `SENTRY_DSN`, `CLAMAV_HOST` | Error reporting, virus scanning | not set | optional |

**Rotation** of each is in
[24-deployment-runbook.md](24-deployment-runbook.md#rotating-a-secret);
`.gitleaks.toml` has rules that catch the service-role key, the mail password,
the cron secret and the encryption key in a commit.

## Environment variables

Every variable the code reads (`lib/env.ts`, `lib/mail/config.ts`,
`lib/ldap/index.ts`, `lib/academic/index.ts`, `lib/store/index.ts`), and what
it switches. `.env.example` documents most of them with placeholders.

| Variable | Effect | Production |
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

## 4. Accounts and places

| What | Where |
| --- | --- |
| Code | `https://github.com/DevMittal09/GuestHouseIIT.git`, branch **`main`** (the `ui` branch holds only the 21 Sep vermilion redesign and has diverged). Pushes from this machine's identity (`Rizzwan285`) work since 10 Sep 2026 |
| Database | One hosted Supabase project (development / demo data), reached through `.env.local`. **Migrations are applied by hand in its SQL editor** — which ones it has is not recorded ([23-running-and-testing.md](23-running-and-testing.md#hosted-supabase) has the check) |
| Deployment | Vercel (Hobby plan: two daily crons, no `regions`) — not yet a production deployment |
| Mail | A Gmail sender with an app password (in `.env.local`); the institute relay is the eventual target |
| Office contacts on the site / invoice | ghm@iitpkd.ac.in, +91 491 209 2016 (from the office's invoice template) |

## 5. How to sign in quickly for a check

- **Browser:** `/sign-in` → Mock Authentication → pick a persona. Or type an
  LDAP username and password from §1.
- **Playwright:** `e2e/helpers.ts` has `ACCOUNTS` and `signIn()`.
- **curl in development:** `DEV_LOGIN=true npm run dev`, then
  `curl -b "gh_mock_user=<mock profile id>" localhost:3000/<page>`. Only
  honoured with `DEV_LOGIN=true` outside production.

How LDAP sign-in works, and how to switch to the institute's real directory
and usernames: [31-ldap-sign-in.md](31-ldap-sign-in.md).
