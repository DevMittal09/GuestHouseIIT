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

Verified against `lib/store/seed.ts`, `supabase/seed.sql`, `lib/env.ts`,
`lib/oidc.ts` and `.env.example` on 2 Nov 2026 (LDAP removed). The reasoning
behind these choices is in [02-decisions.md](02-decisions.md); what production
must still change is [04-production.md](04-production.md).

---

## Part 1 — Every login that exists today

### The demo accounts — one per kind of user (7 Nov 2026)

> **There are no passwords.** The portal's real door is **Google**; the way
> every workflow is tested is **Mock authentication** at `/mock-login`, which
> is one click per account and no password anywhere
> (`mockLoginEnabled()` in `lib/env.ts` — always open outside production, in
> production only while Google is unset, and closed outright by
> `MOCK_LOGIN=false`). `signInWithPassword` and `profiles.password_hash`
> still exist and still work; nothing in the interface calls them. The e2e
> suite signs in through `POST /api/auth/test-sign-in` with
> `E2E_TEST_SECRET`.
>
> **The set was rebuilt on 7 Nov 2026** (the owner: "accounts such that we
> can test all kinds of users which have some difference in workflows"). It
> replaced two overlapping sets — the old demo personas and a spreadsheet of
> `test1@`…`test009@` / `wardenhos1@`… accounts imported with every warden
> rank flattened to one role. **Every account below exists because it takes
> a route no other account takes.** The set is written down in
> `lib/store/seed.ts` for the mock store and `scripts/seed-personas.mjs` for
> PostgreSQL, and `tests/seed-parity.test.ts` compares the two.

**Students** — a personal stay at Bageshri, no meals, parents locked to the
academic record.

| Name | Email | Mock id | Hostel | Decided by | Demonstrates |
| --- | --- | --- | --- | --- | --- |
| Arjun Pillai | `btech.saveri@smail.iitpkd.ac.in` | `student-btech-saveri` | Saveri Boys | **Assistant Warden** Ms. Anu George (Warden and Deputy Warden copied) | B.Tech; **both parents** on record, so both are offered and locked |
| Nikhil Varma | `phd.malhar@smail.iitpkd.ac.in` | `student-phd-malhar` | Malhar Boys | **Assistant Warden** Mr. Sajeev Thomas (Warden and Deputy Warden copied) | PhD; **father only** on record, so Mother is not offered at all |
| Fathima Rasheed | `ms.tilang@smail.iitpkd.ac.in` | `student-ms-tilang` | Tilang A Girls | **Warden** Dr. Shalini Rao | The hostel has **no Assistant Warden**, so the stage falls down the ranks |
| Devika Iyer | `dayscholar@smail.iitpkd.ac.in` | `student-day-scholar` | *(none)* | GH Manager | **`hostel_name` is NULL**: a day scholar has no warden, so there is no stage and the log says why (17 Oct 2026) |
| Meera Nair | `secretary.arts@smail.iitpkd.ac.in` | `student-secretary` | Malhar Girls | GH Manager (that hostel has nobody appointed) | Heads the Cultural Affairs Council, so she decides the legacy club stage at `/approvals` |

**Faculty and staff** — official bookings go through their department's HOD.

| Name | Email | Mock id | Demonstrates |
| --- | --- | --- | --- |
| Dr. Priya Sharma | `faculty.cse@iitpkd.ac.in` | `faculty-cse` | Teaching staff: official → CSE HOD, personal → the desk, the faculty debit heads |
| Prof. R. Venkatesh | `hod.cse@iitpkd.ac.in` | `hod-cse` | **HOD of CSE** by appointment: the HOD Queue, and **their own** official booking skips the HOD stage |
| Prof. S. Anand | `hod.dse@iitpkd.ac.in` | `hod-dse` | **HOD of Data Science**, for that department office's HOD route |
| Ravi Kumar | `staff.cse@iitpkd.ac.in` | `staff-cse` | **Non-teaching** staff: the same route, but **Personal Funds only** (8 Oct 2026) |
| Dr. Arun Prasad | `advisor.cultural@iitpkd.ac.in` | `faculty-advisor` | **Faculty Advisor** of the Cultural Affairs Council and Petrichor: "Booking as: Faculty Advisor — …", straight to the desk |
| Dr. Mohan Das | `registrar@iitpkd.ac.in` | `registrar` | Heads the Registrar's Office, which is what makes that office's Direct / HOD question appear |

**Institute offices** — the four whitelisted mailboxes, each a different row
on the debitable-heads spreadsheet (`OFFICE_DEBIT_HEADS`, keyed on the
mailbox before the `@`).

| Name | Email | Mock id | Demonstrates |
| --- | --- | --- | --- |
| Director's Office | `director_iitpkd@iitpkd.ac.in` | `office-director` | An officer office with **no head**: never asked Direct or HOD (11 Oct 2026); Institute Grant; exempt from the booking window and the stay cap |
| Registrar's Office | `ro@iitpkd.ac.in` | `office-registrar` | An officer office **with** a head: asked Direct or Requires HOD approval |
| CSE Department Office | `office_cs@iitpkd.ac.in` | `office-cse` | A department office: HOD approval goes to the CSE HOD; Department Budget |
| Data Science Department Office | `office_ds@iitpkd.ac.in` | `office-dse` | The same, through a different department — the two cannot be confused |
| IAR Office | `iar@iitpkd.ac.in` | `iar-cell` | Books official / alumni **and** decides the Student Cell's requests; never `PENDING_IAR` on its own |
| IAR Student Cell | `alumnicell@iitpkd.ac.in` | `iar-student-cell` | Books **for an alumnus** only → IAR Office → desk |

**Clubs and councils** — neither account ever submits; its Faculty Advisor
books for it and it is copied on the mail.

| Name | Email | Mock id | Demonstrates |
| --- | --- | --- | --- |
| Cultural Affairs Council | `sec_arts@iitpkd.ac.in` | `club-cultural` | The council's own account *is* its secretary's mailbox |
| Petrichor Fest Council | `petrichor@iitpkd.ac.in` | `club-petrichor` | A fest under the council, with the same advisor; demo booking 2 is its legacy club stage |

**Hostel wardens** — three ranks per hostel, the most junior deciding
(`HOSTEL_WARDEN_ROLES`). Their hostel comes from `institute_wardens`, never
from the profile.

| Name | Email | Mock id | Rank | Hostel |
| --- | --- | --- | --- | --- |
| Dr. Suresh Kumar | `warden.malharboys@iitpkd.ac.in` | `warden-malhar` | Warden | Malhar Boys |
| Dr. Geetha Menon | `dwarden.malharboys@iitpkd.ac.in` | `dwarden-malhar` | Deputy Warden | Malhar Boys |
| Mr. Sajeev Thomas | `awarden.malharboys@iitpkd.ac.in` | `awarden-malhar` | **Assistant Warden — decides** | Malhar Boys |
| Dr. Lakshmi Devi | `warden.saveriboys@iitpkd.ac.in` | `warden-saveri` | Warden | Saveri Boys |
| Dr. Vinod Raj | `dwarden.saveriboys@iitpkd.ac.in` | `dwarden-saveri` | Deputy Warden | Saveri Boys |
| Ms. Anu George | `awarden.saveriboys@iitpkd.ac.in` | `awarden-saveri` | **Assistant Warden — decides** | Saveri Boys |
| Dr. Shalini Rao | `warden.tilangagirls@iitpkd.ac.in` | `warden-tilang` | **Warden — decides**, there being no Assistant Warden | Tilang A Girls |

**The desk and the console**

| Name | Email | Mock id | Demonstrates |
| --- | --- | --- | --- |
| Guest House Manager | `guesthouse@iitpkd.ac.in` | `gh-manager` | Allocation, the desk, invoices, 11 console sections, the approval workflow |
| Guest House Caretaker | `gh.reception@iitpkd.ac.in` | `gh-caretaker` | Reception: check-in, check-out, moving dates, invoices |
| Portal Developer | `developer@iitpkd.ac.in` | `developer` | All 15 console sections (needs 2FA enrolment — below) |

- **The four hostels with nobody appointed** — Malhar Girls, Saveri Girls,
  Tilang B, Brindavani — are deliberate: a student in one of them enters at
  the desk with the stage skipped and the reason logged, which is a fourth
  thing worth being able to see.
- **Retired:** every `test1@`…`test9@`, `test001@`…`test009@`,
  `wardenhos1-4@`, `deputy_wardenhos1-3@` and `assistant_wardenhos3-6@`
  account from the spreadsheet of 6 Nov 2026, and the older demo personas
  (Anjali Menon, Rahul Nair, `admin@`, `cse.office@`, `priya@`,
  `arun.prasad@`, `ravi.k@`, `warden.malhar@`, `warden.saveri@`).
  `npm run seed:personas` deletes them where nothing points at them, and sets
  `account_status = 'retired'` where a booking or a `security_audit` row
  does — a retired account cannot sign in and is not on the picker, and the
  row stays because it is part of somebody's record.
- **Nothing is seeded with a password.** Mock authentication needs none;
  `profiles.password_hash` is left null for every persona.

### Other demo credentials

| What | Value | Notes |
| --- | --- | --- |
| **Console password** (`/admin`, manager and developer) | `0000` | Default until changed in Console Access; stored as a scrypt hash in `app_settings`. **Must be changed before go-live.** |
| **Developer second factor** | *enrol your own* | First console use as `developer`: Console → Security → set up an authenticator (TOTP), keep the ten recovery codes. Needed before any role change, Settings change or delete. Stored in the database the portal is using — deleting `.local-db.json` removes it |
| Sample shown on the sign-in card | — | None. The dashed credentials box came off on 15 Oct 2026 and the LDAP form on 28 Oct; the card now carries only the doors that are open |

### How to sign in quickly for a check

- **Browser:** `/sign-in` → **Mock authentication** → the kind of user → the
  account. Or **Sign in with Google**, once it is configured.
- **Playwright:** `e2e/helpers.ts` has `ACCOUNTS` and `signIn()`. Uses
  `POST /api/auth/test-sign-in` with `E2E_TEST_SECRET` (set in
  `playwright.config.ts`).

---

## Part 2 — How sign-in works, and the real directory

### How sign-in works

> **LDAP was removed on 2 Nov 2026** (the owner: "Keep only Google OAuth
> only. Remove rest"). `lib/ldap/` is deleted and `signInWithLdap` no longer
> exists. The `ldap_uid` column and its migration 12 index are still in the
> database; restoring LDAP means rebuilding `lib/ldap/`, the action and the
> form fields.
>
> **Mock Authentication came back on 7 Nov 2026** (the owner: "make a mock
> authentication for this instead of sign in with password"), rebuilt rather
> than restored - this branch never had the version `main` carries.
> `/mock-login` is the two-step account picker and `loginAs` is its action.
> The **email and password form** it replaced is still underneath:
> `signInWithPassword`, its throttle (`RATE_LIMITS.passwordLogin`) and
> `profiles.password_hash` all work, and nothing in the interface calls
> them. Don't put the fields back without being asked.

```
Google        ─▶ "Sign in with Google" ─▶ /api/auth/google/start ─▶ callback (lib/oidc.ts)
Mock auth     ─▶ "Mock authentication" ─▶ /mock-login ─▶ loginAs(profileId)
E2E tests     ─▶ POST /api/auth/test-sign-in { email, secret } (gated by E2E_TEST_SECRET)
Password      ─▶ signInWithPassword  (built, works, not reachable from any page)
```

### Mock Authentication - the account picker (`/mock-login`)

**Where the door is open is the whole rule** (`mockLoginEnabled()` in
`lib/env.ts`), because this is not authentication: anyone who reaches the
page can become any account.

| Environment | Google configured | Open? |
| --- | --- | --- |
| Anything but production | either | **yes** - a developer who has just set a client id must not lose the one-click way of becoming each persona, and the Playwright suite needs a door |
| Production | no | yes - the sign-in button has to lead somewhere |
| Production | yes | **no** - `/mock-login` 404s and the button is Google's |
| Any | either, with `MOCK_LOGIN=false` | **no** |

`MOCK_LOGIN=true` is deliberately **not** the switch: a flag that forces the
picker open is the one that gets copied into production and forgotten.
Setting it there is a **startup error** (`envProblems`).

The page itself is two steps - the **kind of user** (`PERSONA_GROUPS` in
`lib/mock-personas.ts`), then the account - and each account shows the chain
its request would take under the routes currently configured, with the real
people named. `loginAs` re-checks `mockLoginEnabled()` and
`account_status === "active"` itself, because a server action is reachable
without the page, and audits the sign-in as `method: "mock"`.

Session: a row in `sessions` since Phase 8, with an opaque token in the cookie
(`lib/sessions.ts`; 30 min idle, 12 h absolute). Google proves who the person
is; the session row is what proves, on every later request, that the person
holding the cookie is the one who signed in. The unsigned `gh_mock_user`
cookie is honoured only with `DEV_LOGIN=true` outside production.

### Google sign-in - built, verified, unconfigured

**The intended door** (the owner, 28 Oct 2026). The flow is **written and
tested**; the only thing missing is a client id. **Do not rebuild it.**

> **The step-by-step setup is [`GOOGLE-SIGN-IN.md`](../GOOGLE-SIGN-IN.md) at
> the repo root** - what to ask the Computer Centre for, the Google Cloud
> steps, the exact redirect URI, the verification checklist, and the two
> things to fix before switching it on. This section is what the code does;
> that file is how to turn it on. One fact, one home.

| Piece | File |
| --- | --- |
| The protocol | `lib/oidc.ts` |
| Leg one (state, PKCE, redirect) | `app/api/auth/google/start/route.ts` |
| Leg two (verify, find the profile, start the session) | `app/api/auth/google/callback/route.ts` |
| The switch | `googleOauth()` in `lib/env.ts` |

**The switch is three variables** - `GOOGLE_CLIENT_ID`,
`GOOGLE_CLIENT_SECRET` and `APP_URL`. The redirect URI is **derived**
(`${APP_URL}/api/auth/google/callback`), never configured, and must be
registered in Google Cloud character for character. A malformed `APP_URL`
makes `googleOauth()` null and **silently reopens the mock door** rather than
erroring; in production `assertEnv()` refuses to start, so the silent case is
staging.

What it checks, in order, before a session exists:

1. `state` matches the httpOnly cookie minted at the start leg (10 min life).
2. The code is exchanged with the **PKCE** verifier.
3. The `id_token` is **verified**: RS256, signature against Google's JWKS
   (cached an hour), `iss`, `aud` = our client id, `exp`, and the `nonce`
   this request sent.
4. `email_verified` is true.
5. **Both** domain checks - `isInstituteEmail()` on the address *and* the
   `hd` claim, which proves a Workspace account rather than a personal one.
6. **A `profiles` row with that email must already exist.** No
   auto-provisioning: the row carries the role, hostel and unit, and there is
   no safe default for those ([03-roadmap.md](03-roadmap.md) §2n).

Both outcomes are audited (`signin.success` / `signin.failure`, `method:
"google"`, with a reason). The start leg is rate-limited per IP
(`RATE_LIMITS.oauth`, 20 per 10 min - watch it if the campus is behind one
NAT address). There is **no refresh token and no offline access**: the portal
asks Google who somebody is, once, and keeps its own session.

**Three things it does not do**, all recorded in
[03-roadmap.md](03-roadmap.md) §2n: it finds the profile by scanning
`listProfiles()` (gate 12 - Supabase truncates that at 1000 rows silently);
it matches on **email alone** and drops Google's immutable `sub`, so a
reassigned address hands over the previous holder's profile; and `hd` on the
start leg is narrower than `isInstituteEmail()`, which may keep `@smail`
students out of Google's account chooser.

**Configuring it deletes `/mock-login`**, which is how the Playwright suite
signs in - so never set these variables in CI.

### LDAP — removed 2 Nov 2026

> **The entire LDAP directory was removed** on 2 Nov 2026: `lib/ldap/` (7
> files), `lib/password.ts`, `ldapts` dependency, the `signInWithLdap` action,
> the "Import LDAP usernames" UI, and the LDAP username field in the edit
> dialog. The `ldap_uid` column and migration 12's unique index remain in the
> database as a profile attribute. The user import system (`lib/users-import.ts`)
> still handles `ldap_uid` as a spreadsheet column.
>
> The section below is kept as historical context. Rebuilding LDAP sign-in
> would require recreating `lib/ldap/`, restoring the `ldapts` dependency,
> writing a new `signInWithLdap` action, and adding form fields.
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
| `DATABASE_URL` | The PostgreSQL connection string - **and it carries the database password**, so the whole line is a secret | `.env.local` (set, pointing at the Supabase project since 8 Nov 2026); hosting provider's environment in production | Supabase -> Project Settings -> Database -> Connection string (**Session pooler**, port 5432) | Reset the password at Project Settings -> Database -> Reset database password, then give every collaborator the new string - **it breaks all of them at once**, so warn first |
| `DATABASE_SSL`, `DATABASE_SSL_REJECT_UNAUTHORIZED` | Switch TLS on, and stop node-postgres verifying Supabase's own CA. Both `true`/`false` strings, read by `lib/db/client.ts` | `.env.local` (`true` and `false` respectively) | n/a | Not secret |
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

> **An inline `# comment` after a value is part of the value.** The env
> loader trims whitespace and nothing else, so
> `MAIL_HOST=smtp.gmail.com   # default` sets the host to
> `"smtp.gmail.com   # default"` and every send fails with a DNS error that
> names a host nobody typed. `.env.local` carried exactly that on three
> lines until 7 Nov 2026, with `MAIL_DRY_RUN=true  # uncomment to suppress`
> among them - which is truthy, so the deployment had been silently sending
> nothing. Comments go on their own line.

> **The Supabase project is the live database again - as plain PostgreSQL**
> (8 Nov 2026, second round). The portal runs on **`DATABASE_URL`**, and that
> URL now points at the hosted project's PostgreSQL over its **session
> pooler** (port 5432). The four `NEXT_PUBLIC_SUPABASE_*` /
> `SUPABASE_SERVICE_ROLE_KEY` lines stay **commented out**: no code reads
> them, because `lib/store/supabase.ts` was deleted on 2 Nov 2026. Supabase
> is a managed PostgreSQL host here and nothing more. The three rows above
> that call those keys required describe the Supabase-store era.
>
> **Two connection details are not interchangeable.** The direct host
> `db.<ref>.supabase.co` resolves to **IPv6 only** and is unreachable from a
> network without an IPv6 route; and the **transaction** pooler (port
> **6543**) breaks `pg_dump` and DDL. Use the **session** pooler on 5432.
>
> There were **two** `NEXT_PUBLIC_SUPABASE_URL` lines,
> `http://127.0.0.1:54321` and `https://azfdzrahtsikofzovmda.supabase.co`,
> and the local one was removed. **The keys answer which is right, not
> preference:** both JWTs carry `"ref":"azfdzrahtsikofzovmda"` in their
> payload, so that is the only project they authenticate against and the
> `127.0.0.1` URL belonged to no running instance. Decode a Supabase key's
> middle segment (`base64 -d`) whenever a URL and a key may have drifted
> apart - it names the project.
>
> The **service-role key in `.env.local` still works on that project** and
> still bypasses RLS - it reaches PostgREST, which is a second door onto the
> same data that `DATABASE_URL` opens. It has not been rotated and the
> project has not been deleted. Note that the 8 Nov restore dropped the 38
> `authenticated` policies with the old schema and did **not** re-grant
> `anon` or `authenticated` any table privileges, so that key is now the only
> API credential that can read anything.

### Environment variables — all of them, and what each switches

Every variable the code reads (`lib/env.ts`, `lib/mail/config.ts`,
`lib/ldap/index.ts`, `lib/academic/index.ts`, `lib/store/index.ts`).
`.env.example` documents most of them with placeholders. This is the one copy;
[04-production.md](04-production.md) lists only *which* of these production
must set.

| --- | --- | --- |
| `DATABASE_URL` | **PostgreSQL (`PostgresStore`); without it the JSON mock (`.local-db.json`)**. The one switch between backends since 2 Nov 2026 | **Required** |
| `DATABASE_SSL`, `DATABASE_SSL_REJECT_UNAUTHORIZED` | TLS on; and `false` to accept Supabase's own CA. Needed for any hosted database | **Required against a hosted database** |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | **Read by nothing** since the store was deleted (2 Nov 2026); kept commented for PostgREST access to the same project | Not used |
| `APP_URL` (or `NEXT_PUBLIC_APP_URL`), `APP_BASE_URL` | OAuth redirect, server-action origin; absolute links in mail | **Required** (`APP_URL`) |
| `CRON_SECRET` | Guards `/api/mail/cron` and `/api/mail/dispatch` (≥ 16 chars) | **Required** |
| `ID_ENCRYPTION_KEY`, `ID_ENCRYPTION_KEYS_OLD` | Encrypt ID numbers / TOTP secrets; old keys for rotation (`v1:…,v2:…`) | **Required** (the key) |
| `LDAP_URL`, `LDAP_BASE_DN`, `LDAP_BIND_DN`, `LDAP_BIND_PASSWORD`, `LDAP_UID_ATTRIBUTE`, `LDAP_STARTTLS`, `LDAP_LINK_BY_EMAIL` | Real directory; without `LDAP_URL` the dummy accounts above work | **Required for any real deployment** |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Real Google sign-in (with `APP_URL`); closes Mock Authentication. The flow is built - [`GOOGLE-SIGN-IN.md`](../GOOGLE-SIGN-IN.md) | Recommended |
| `MOCK_LOGIN` | `false` closes Mock Authentication, anywhere. Outside production the picker is open whatever this says; `true` is a **startup error** in production (7 Nov 2026) | **Set to `false` unless Google is configured** |
| `DEV_LOGIN` | **Nothing. Gone.** Neither it nor the `gh_mock_user` cookie appears anywhere in the code (confirmed 8 Nov 2026); recipes that use them do not work. Sign in through `/mock-login`, or `/api/auth/test-sign-in` with `E2E_TEST_SECRET` | n/a |
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
| Database | **The hosted Supabase project's PostgreSQL 17.6, shared by every collaborator**, reached over `DATABASE_URL` (session pooler) since 8 Nov 2026. Its `public` schema is a restore of the laptop's `guesthouse_dev`, so its structure is `scripts/init-postgres.sql` plus what that database had accumulated. The laptop's local PostgreSQL survives as the commented `DATABASE_URL` for offline work. Dumps: `~/guesthouse-db-backups/` (outside the repository) |
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
- Row-level security is on for every table. **The server still uses the
  service-role key** (see "What is deliberately not done yet" at the foot of
  this file).

  > **This used to read "with no `authenticated` write policy - which is what
  > makes the public anon key safe to ship". That was wrong on both halves**
  > (checked against the migrations, 13 Oct 2026). There are **21 write
  > policies granted to `authenticated`**, ten of them `for all`, including
  > `developer manages profiles / guest houses / rooms / bookings /
  > booking_guests / form_configs` - each gated only on
  > `my_role() = 'developer'`, which is read from the JWT's own profile row.
  > What makes the anon key safe to ship is not the absence of those policies
  > but **the impossibility of obtaining an `authenticated` JWT**, and
  > `password123` on a confirmed email identity is exactly how one is
  > obtained. See the next section.

#### The second door: GoTrue and PostgREST

**Found 13 Oct 2026**, reviewing the schema before the institute's user
import. Not a new bug - a standing one whose consequence had been mis-stated,
and which **the import would multiply by a thousand**.

The portal has one front door: the LDAP form, then a session row
(`lib/auth.ts`). A Supabase project has **two more** that answer to the same
public anon key - `/auth/v1` (GoTrue) and `/rest/v1` (PostgREST) - and neither
knows the portal exists. The chain, each link verified in the repository:

| # | Link | Where |
| --- | --- | --- |
| 1 | The project URL and anon key reach the browser by design | `app/(portal)/layout.tsx:154`; present in the built client chunks |
| 2 | Every seeded persona is a **confirmed** `auth.users` row with `encrypted_password = crypt('password123', ...)` and `provider: email` | `supabase/seed.sql` lines 13-32, 18 personas including **`developer@iitpkd.ac.in`** |
| 3 | `createProfile` gives **every account the console or an import creates** the same password, also `email_confirm: true` | `lib/store/supabase.ts:841` |
| 4 | A GoTrue password grant on any of those returns an `authenticated` JWT | GoTrue's default email provider |
| 5 | `profiles` is readable by **any** `authenticated` JWT - `using (true)`, no scoping | migration 1 |
| 6 | `my_role()` reads the role off that JWT's own profile row, and `developer manages …` grants `for all` on six tables on that basis | migration 1 |
| 7 | `authenticated users read documents` grants `select` on the whole private `documents` bucket - `using (bucket_id = 'documents')`, **no per-user scoping** | migration 1 |

So a GoTrue sign-in as `developer@iitpkd.ac.in` / `password123` yields read
**and write** on profiles, bookings, guests, rooms, guest houses and form
configs, plus read of **every uploaded ID document and alumni card**. The
portal's own protections - the console password, TOTP, `requireConsole`,
`stepUpProblem`, the session rows - are all on the other door and stop none of
it.

**That one unverified link is now verified, and it is open (14 Oct 2026.)**
This paragraph used to say the provider state "cannot be read with the
service-role key", which was true and also beside the point: GoTrue publishes
it. `GET /auth/v1/settings` needs only the anon key that already ships in the
browser, writes nothing, and reports for the hosted project:

```
external providers enabled : email
disable_signup             : false
mailer_autoconfirm         : false
```

So link 4 holds today, and **there is a worse path than link 2.** With signup
open, an attacker does not need a published password or any portal account:
they sign up with an address they control, confirm it, and hold an
`authenticated` JWT - which until migration 31 is applied means links 5, 6 and
7, i.e. the whole directory and **every uploaded ID document and alumni card**.
`mailer_autoconfirm: false` only means they need a working mailbox.

**The `anon` role is not exposed**, checked the same way: `GET /rest/v1/` on
`profiles`, `bookings`, `booking_guests` and `academic_records` with the anon
key returns **HTTP 200 and zero rows**. RLS is on and no `anon` policy has ever
existed - which is also why dropping the `authenticated` policies cannot break
Realtime, the one client-side Supabase user, which connects as `anon`.

**Not tested any further, deliberately.** Confirming the document download
would mean creating an account on the production project and opening real
guests' identity documents. The policy text plus the provider state is enough
to act on.

**So the order of work changed.** Turning the provider off is now the *first*
step, not the third: it is a dashboard toggle, it needs no migration, the
portal does not use the provider, and it closes the open-signup path on its own.
[04-production.md](04-production.md) §1a.1 carries the steps.

**`academic_records` is not exposed** - migration 28 deliberately gives it no
`authenticated` policy, so parents' names and phone numbers stay
service-role-only. That is the pattern the other tables need.

### What was done about it, 13 Oct 2026

**Closed in code and in the schema.** Migration 31
(`00000000000031_decouple_auth_and_tighten_rls.sql`) and the changes beside it
break every link in the table above except the one that is not in the
repository:

| Link | Then | Now |
| --- | --- | --- |
| 2, 3 - a password exists | `createProfile` and `seed.sql` minted `auth.users` rows with `password123` | **Neither creates a Supabase Auth user at all.** `profiles.id` no longer references `auth.users (id)`, so none is needed; the column has its own `gen_random_uuid()` default |
| 5 - the directory is readable | `profiles` select `using (true)` | **Dropped.** RLS stays enabled, so `authenticated` is denied by default |
| 6 - a JWT could write | 38 `authenticated` policies, 21 of them writes, incl. `developer manages profiles` | **All 38 dropped.** The pattern migration 28 chose for `academic_records`, now applied to the rest |
| 7 - every ID document was readable | `select` on the whole `documents` bucket | **Dropped**, and the bucket forced `public = false`. Signed URLs are issued server-side |
| 1 - the anon key is public | unchanged, and correct | It is only safe because an `authenticated` JWT is now genuinely unobtainable - which is what the rest of this table establishes |

**`tests/rls-surface.test.ts` holds the line.** It parses the migrations and
fails if any `authenticated` policy survives, if RLS is ever disabled, if the
seed creates an Auth user, or if `password123` reappears in the store. Both
claims this file used to make were plausible, written in good faith, and read
twice without being checked against the SQL - so the invariant is asserted by
a test now rather than described in prose. Mutation-checked: removing one
`drop policy` line from migration 31 fails the test with that policy named.

**Three things remain, and two of them need production access:**

1. **Apply migration 31 to the hosted project.** Not done - a production
   change needing the owner's approval. `npm run check:migrations` prints the
   SQL that confirms it: both counts must come back 0.
2. **Then run the repair** -
   `supabase/repairs/2026-10-13-retire-seeded-auth-users.sql` deletes the
   `auth.users` rows that already exist. It **refuses to run before migration
   31**, because the old foreign key's `on delete cascade` would take every
   profile with them.
3. **Disable the email/password provider by hand** (Dashboard ->
   Authentication -> Providers -> Email). Still the one link that cannot be
   read or changed from the repository, and still unverified. After steps 1
   and 2 it is belt-and-braces; before them it is the control that matters
   most, because the published password is still live on those rows.

The import runbook is [04-production.md](04-production.md) §1a.

---

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

- **"Download my data" and "Ask for erasure"** at the foot of My Bookings,
  with the office answering each request from Console → Security. These are
  live and unchanged.
- **There is no privacy notice in the portal, and no consent is recorded**
  (14 Oct 2026, in two steps: the office asked for the privacy policy text to
  come off the request, then the owner asked for the feature to be removed
  completely but kept so it can be reverted). The tick and its paragraph went
  from the booking form, then the `/privacy` page, the
  `PRIVACY_NOTICE_VERSION` constant and all three links to it. `createBooking`
  writes neither `bookings.privacy_notice_version` nor `privacy_consent_at` -
  recording a consent nobody was asked for would record something that did not
  happen - and bookings made before that date keep both.
  **Everything removed, and the step-by-step restore, is in
  `archive/privacy-notice/`**; `/privacy` is a 404 and an e2e test keeps it
  one. **Whether the institute needs a published notice and a recorded consent
  is a question for it to answer** ([03-roadmap.md](03-roadmap.md) §2g,
  [04-production.md](04-production.md) "DPDP Act, 2023").
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
