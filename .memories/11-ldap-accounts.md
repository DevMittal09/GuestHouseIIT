# LDAP sign-in and the dummy LDAP accounts

Since **19 Sep 2026** the sign-in card on `/sign-in`, `/book-room` and
`/book-meal` asks for an **LDAP username and password**, with a
**"Sign in with Google"** button beneath it. Google is not connected yet: the
button opens the old persona picker at `/mock-login`, which stands in for it
during development.

Read this when you need a login, when connecting the real directory, or when
loading the institute's real LDAP usernames.

---

## 1. Dummy LDAP accounts (development)

Used whenever `LDAP_URL` is **unset** (the default). They live in
`lib/ldap/mock-directory.ts`. **Keep that file and this table in step.**

| Persona | Role | LDAP username | Password |
| --- | --- | --- | --- |
| Anjali Menon (Malhar) | Student | `112201001` | `Anjali@2026` |
| Rahul Nair (Saveri) | Student | `142202014` | `Rahul@2026` |
| Dr. Priya Sharma | Employee (Faculty & Staff) | `priya` | `Priya@2026` |
| Director's Office | Official / Dignitary | `admin` | `Director@2026` |
| Petrichor Fest Council | Club / Fest Council | `petrichor` | `Petrichor@2026` |
| IAR Student Cell | IAR Student Cell | `alumnicell` | `AlumniCell@2026` |
| Dr. Suresh Kumar | Hostel Warden (Malhar) | `warden.malhar` | `Malhar@2026` |
| Dr. Lakshmi Devi | Hostel Warden (Saveri) | `warden.saveri` | `Saveri@2026` |
| Dr. Arun Prasad | Faculty Advisor (Petrichor) | `fa.petrichor` | `Advisor@2026` |
| Prof. R. Venkatesh | **HOD, CSE** — employee (faculty) who heads the CSE unit; sees **HOD Queue** (`/hod`) | `hod.cse` | `HodCse@2026` |
| Meera Nair | Student — **Cultural Council secretary**, approves Petrichor at the club stage (`/approvals`) | `112301045` | `Meera@2026` |
| CSE Department Office | Official — a **department office** (Direct or Requires HOD approval → CSE HOD; debited to Department) | `cse.office` | `CseOffice@2026` |
| Ravi K. | Employee — **non-teaching staff**, CSE (official bookings go to the HOD; Department head only) | `ravi.k` | `Ravi@2026` |
| IAR Office | IAR Office | `iar` | `IarOffice@2026` |
| Guest House Manager | Guest House Manager | `guesthouse` | `Manager@2026` |
| Guest House Caretaker | Guest House Caretaker | `gh.reception` | `Reception@2026` |
| Portal Developer | Developer (Superadmin) | `developer` | `Developer@2026` |
| *(no portal account)* | — | `visitor` | `Visitor@2026` |

- **Usernames** are the local part of each persona's email address. For
  students that is the roll number, which matches the real format: the user
  gave `142301026` as an example of a real IIT Palakkad LDAP username. The
  format for staff is **unconfirmed**.
- **Usernames are case-insensitive and trimmed.** Passwords are
  case-sensitive, as in LDAP.
- **`visitor` is deliberately not linked to any profile.** It shows the
  "Your LDAP account is valid but is not registered on the guest house portal"
  path.
- **The developer console is still behind its own console password** (default
  `0000`), after signing in as `developer`.
- **`password123` is no longer a portal password.** It survives only as the
  Supabase Auth password in `supabase/seed.sql` and for console-created users.
  Nothing signs in with those auth users; they exist because
  `profiles.id → auth.users`.
- **The sign-in page shows one sample** (`priya` / `Priya@2026`, via
  `SAMPLE_ACCOUNT`) in the dashed demo note, and only while the dummy directory
  is in use.

## 2. How sign-in works

```
LDAP form ─▶ signInWithLdap() (app/actions/auth.ts)
              1. normalise the uid; reject blanks, "@" (unless the directory uses email usernames), bad characters
              2. throttle: 10 failures / 5 min per `ldap:<uid>` (shares lib/admin-lock.ts's counter)
              3. getDirectory().authenticate(uid, password)      ← "is this the password?"
                   LDAP_URL set → LdapDirectory (ldapts, search-then-bind)
                   otherwise    → MockDirectory (the table above)
              4. profileForDirectoryEntry(entry) (lib/ldap/link.ts) ← "which portal account?"
                   profiles.ldap_uid match, else (opt-in) link by email
              5. set the gh_mock_user cookie, redirect to safe `next` or homeForRole()

Google button ─▶ /mock-login?next=… ─▶ loginAs(profileId, next)   (placeholder for OAuth)
```

Two questions, two systems. **The directory checks the password. The portal's
`profiles.ldap_uid` says who you are:** role, hostel, club. So a valid LDAP
login with no matching profile gets in nowhere.

Error messages:

- **"Incorrect username or password"** covers both an unknown user and a wrong
  password, so the page cannot be used to find out which usernames exist.
- **"Not registered"** is only shown *after* the password is proven.
- **A directory outage** reads "could not be reached … or sign in with Google",
  and the real error is logged.

Session: still the unsigned `gh_mock_user` cookie. **LDAP proves who typed the
password; the cookie does not prove who is holding it.** Signing or
server-siding the session is still roadmap item 1.

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
