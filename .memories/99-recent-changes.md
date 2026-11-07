# Recent changes - the last round, and only the last round

This file is **replaced** every round, not appended to. The round before this
one is written up where every round is: what was asked in
[01-background.md](01-background.md), why it was done that way in
[02-decisions.md](02-decisions.md).

---

## Round of 7 November 2026 - one account per kind of user, mock authentication, and the hostel's three wardens

The owner uploaded a PDF of the accounts in the development database and
asked for them to be replaced by **one account per kind of user**, for the
password form to become a **mock authentication** picker organised by kind of
user, for mail to be **sent from `ghm@iitpkd.ac.in` and redirected to
`student.iitpkd01@gmail.com`**, and for the workflows to be correctly
assigned - *"Saveri Hostel residing student -> request sent to Saveri
Assistant warden [Mail copied to Warden] -> Forwarded to GHM"*.

### 1. The hostel warden office - three ranks, one stage

`deputy_warden` and `assistant_warden` had been in the `Role` union for
months and were used by nothing. They are now working roles.

- **`HOSTEL_WARDEN_ROLES`** (`lib/types.ts`) - `assistant_warden`,
  `deputy_warden`, `warden`, **most junior first**. The order is the rule.
  `isHostelWardenRole()` is the predicate.
- **`hostelWardenApproverIds` / `hostelWardenCopyIds`**
  (`lib/approval-routes.ts`): the most junior rank the requester's hostel
  actually has decides; everyone else in that office is copied. The copy
  list is **derived from the approver list**, so the two cannot name the
  same person. A hostel with nobody appointed is still nobody - the stage is
  skipped and the log says so.
- **A new `CopyToRule`, `hostel_warden`** (`lib/academic/fields.ts`,
  `lib/academic/copy-to.ts`), on `COPY_TO_RULE.student`. The Warden and
  Deputy Warden are therefore **CC on every staff mail** about the request,
  not merely a line on the card.
- **All three ranks resolve a hostel** - `profiles_v` and the mock store's
  `withComputed`, from `institute_wardens` by email.
- **All three land on `/warden`** (`homeForRole`, the portal layout's queue
  link, the page's guard) and get their hostel's archive (`historyScope`). A
  Warden whose hostel has an Assistant Warden sees an empty queue, which is
  the honest answer.
- `ROLE_LABELS.warden` is now **"Warden"**; it read "Assistant Warden".

### 2. The persona set - 29 accounts, two seeds, one parity test

Every account exists because it takes a route no other account takes.

| Kind | Accounts | What they cover |
| --- | --- | --- |
| Students | 5 | both parents on record / father only / neither (guardian) / **no hostel** / the council secretary |
| Faculty and staff | 6 | teaching, non-teaching, two HODs, a Faculty Advisor, the Registrar |
| Offices | 6 | an officer office with **no head** and one with a head, two department offices under different departments, the two IAR accounts |
| Clubs | 2 | the council and a fest under it, both booked for by one advisor |
| Hostel wardens | 7 | two hostels with all three ranks, one with only a Warden |
| The desk | 3 | manager, caretaker, developer |

- **`lib/store/seed.ts`** seeds the mock store; **`scripts/seed-personas.mjs`**
  (`npm run seed:personas`) seeds PostgreSQL. The set is written twice only
  because a Node script cannot import TypeScript, and
  **`tests/seed-parity.test.ts`** compares them on emails, names, roles,
  units, hostels, ranks and the whitelist.
- Nine units, seven hostels, and `institute_students` / `_employees` /
  `_offices` / `_fcc` / `_wardens` rows for every account that needs one.
- The whitelist is **exactly** the four office accounts, which a parity test
  asserts: an office account that is not whitelisted cannot book at all.
- The seeder is idempotent, **deletes** accounts outside the set where
  nothing points at them, and **retires** (`account_status = 'retired'`) the
  ones a booking or a `security_audit` row names. `--dry-run`,
  `--keep-extra` and `--drop-orphans` are the flags.

### 3. Mock authentication

- **`/mock-login` rebuilt as two steps**: the kind of user (six cards, each
  with a count and a line about how that kind's requests travel), then the
  accounts. `?kind=` and `?next=` are carried in the URL; the page is
  server-rendered and needs no JavaScript.
- **Each account shows the chain its request would actually take**,
  computed by `lib/mock-personas.ts` from `approvalStageDetailsFor` and
  `stageApproverIds` - the same functions that route the request - with the
  people named, who would be copied, what the account decides for others,
  the clubs a Faculty Advisor books for, and an office's **other** chain
  where it is asked Direct or Requires HOD approval. It names the rank that
  actually decides, so a hostel with no Assistant Warden reads "Warden".
- **`loginAs`** (`app/actions/auth.ts`) re-checks `mockLoginEnabled()` and
  `account_status` itself and audits `method: "mock"`.
- **`mockLoginEnabled()`** (`lib/env.ts`): always open outside production; in
  production only while Google is unset; `MOCK_LOGIN=false` closes it;
  `MOCK_LOGIN=true` in production is a **startup error**.
- **The email and password fields are off the sign-in card.**
  `components/login-form.tsx` draws one button per open door.
  `signInWithPassword`, its throttle and `profiles.password_hash` are
  untouched below the interface.

### 4. Mail

`MAIL_FROM=ghm@iitpkd.ac.in` is now stated rather than inferred from
`MAIL_USER`, and `MAIL_REDIRECT_ALL_TO=student.iitpkd01@gmail.com` is
unchanged. **Neither was working**: `MAIL_DRY_RUN` was set, and three values
in `.env.local` carried trailing `# comments` that the env loader keeps as
part of the value. Comments now sit on their own line, and `.env.example`
says why. SMTP authentication was verified against Gmail without sending.

### 5. Two schema faults found on the way

- **`scripts/init-postgres.sql` had `PENDING_WARDEN_REVIEW` and
  `PENDING_FA_REVIEW`** in `booking_status` - migration 1's labels, renamed
  by migration 15, never used by `lib/types.ts`. A database created from
  that file would have refused every booking at those two stages. Fixed;
  existing databases already have the short names.
- **`create or replace view` refuses a changed column list**, so `profiles_v`
  is dropped and recreated - keeping whichever of `ldap_uid`, `group_id`,
  `login_disabled_at` and `login_disabled_reason` the database actually has.

### Validation

`npm run lint` (clean), `npm run typecheck`, `npm test` (**648 tests, 37
files** - 39 new across `tests/hostel-warden-office.test.ts` and
`tests/seed-parity.test.ts`), `npm run build` - all clean. The seeder was run
against the owner's development database, twice, to prove it is idempotent;
the picker and both of its steps were read back from a running dev server
with `curl`.

### What is left open

Written up in [03-roadmap.md](03-roadmap.md) §2o and gate 13. The three that
matter:

- **A profile with a `security_audit` row cannot be deleted** - the
  append-only trigger refuses the FK's `on delete set null`. The console's
  Delete user has the same problem, with an error that names neither table.
  Six accounts in the owner's database are retired rather than deleted
  because of it.
- **`deputy_warden` and `assistant_warden` are not offered in Users &
  Roles.** A new Assistant Warden is added by the seeder or by SQL today.
- **Two old test bookings** belonging to retired accounts are still in the
  owner's development database;
  `npm run seed:personas -- --drop-orphans` clears them, deliberately not by
  default.
