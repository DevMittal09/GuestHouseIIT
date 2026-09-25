# LDAP sign-in — how it works, and switching to the real directory

Since **19 Sep 2026** the sign-in card on `/sign-in`, `/book-room` and
`/book-meal` asks for an **LDAP username and password**. Beneath it, a second
button reads **Mock Authentication** (the one-click persona picker at
`/mock-login`) while Google sign-in is unconfigured, and **Sign in with
Google** once `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and `APP_URL` are set.

Read this when connecting the real directory or loading the institute's real
LDAP usernames. **The dummy accounts and their passwords are in
[30-credentials-and-access.md](30-credentials-and-access.md#1-demo-logins-dummy-ldap-directory)**
— keep that table and `lib/ldap/mock-directory.ts` in step.

---

## 1. The dummy directory

Used whenever `LDAP_URL` is **unset** (`lib/ldap/mock-directory.ts`): one
account per seeded persona, plus `visitor`, which deliberately has no portal
account and shows the "valid LDAP account, not registered on the portal" path.

- **Usernames** are the local part of each persona's email address. For
  students that is the roll number, which matches the real format (the owner
  gave `142301026` as a real IIT Palakkad LDAP username). The staff format is
  **unconfirmed**.
- **Usernames are case-insensitive and trimmed.** Passwords are
  case-sensitive, as in LDAP.
- **`password123` is not a portal password.** It is the Supabase Auth password
  in `supabase/seed.sql` and for console-created users; nothing signs in with
  those auth users.
- **The sign-in page shows one sample** (`priya` / `Priya@2026`,
  `SAMPLE_ACCOUNT`) in the dashed demo note, only while the dummy directory is
  in use.

## 2. How sign-in works

```
LDAP form ─▶ signInWithLdap() (app/actions/auth.ts)
              1. normalise the uid; reject blanks, "@" (unless the directory uses email usernames), bad characters
              2. throttle: 8 attempts / 15 min per `ldap:<uid>` (a row in the database — RATE_LIMITS.signIn)
              3. getDirectory().authenticate(uid, password)      ← "is this the password?"
                   LDAP_URL set → LdapDirectory (ldapts, search-then-bind)
                   otherwise    → MockDirectory (accounts in 30-credentials-and-access.md)
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

## 3. Moving to the real LDAP accounts

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

## 4. What was verified (19 Sep 2026)

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
