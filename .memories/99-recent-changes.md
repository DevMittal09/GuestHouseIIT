# Recent changes - the last round, and only the last round

This file is **replaced** every round, not appended to. The round before this
one is written up where every round is: what was asked in
[01-background.md](01-background.md), why it was done that way in
[02-decisions.md](02-decisions.md).

---

## Round of 6 November 2026 (second round that day)

> The owner: *"For the time being, I want to use username/password
> authentication as the primary login method because it is much easier for
> testing... Our eventual intended authentication method is Google
> authentication."* With a required order on the sign-in page: **password,
> then Mock Authentication, then Google.**

Two things, and they are connected: the door, and the test database it signs
in against. Everything is on `production_migration` (which carries the merge);
nothing has been pushed, and **nothing has touched the hosted project**.

### Part 1 - the password door is back, with its two defects fixed

The integration earlier the same day **withdrew** an email + password door
into [`archive/password-sign-in/`](../archive/password-sign-in/) on two
grounds. The owner has now asked for it back as the primary door. It is
restored by that archive's own plan, and **both grounds are answered rather
than reintroduced**:

1. **It bypassed the second factor.** `setUserPasswordAction` asked only for
   the console unlock - a shared secret, default `0000` - so anyone holding it
   could set the developer's password and sign in as them. **That action is
   not restored at all.** Passwords are set by the seed or by SQL, so there is
   no console path to abuse; `setPasswordHash` is not on the store either, so
   there is no dead code waiting to be wired up wrongly. Rebuilding it with
   `{ stepUp: true }` is [03-roadmap.md](03-roadmap.md) §2s item 1.
2. **Four characters was the whole policy.** Nothing writes the column from
   user input now, so there is no policy to get wrong; the one that must come
   with the console field is named in the roadmap beside it.

What was built:

- **Migration 38**, `profiles.password_hash`. Additive, nullable, nothing
  backfilled - **a null hash means the door refuses that account**, so turning
  the door on does not by itself open anything. Deliberately **not** added to
  `profiles_v`, which is what every store read returns as a `Profile`: a hash
  left out of the view cannot reach a page, an action's return value or a
  browser. Verified by query, not by assertion.
- **`getPasswordHash(email)`** on `DataStore` and both stores. `PostgresStore`
  reads the **base table** (the only query in the codebase naming the column)
  and degrades to null on a `42703`, so a database still on 37 closes the door
  instead of throwing. **`MockStore`'s password source is the published dummy
  directory** (`lib/ldap/mock-directory.ts`): a mock deployment has no column
  to read, and a second set of demo passwords would be a second thing to keep
  in step, so a persona signs in with the password already listed in
  [05-credentials-and-security.md](05-credentials-and-security.md). The record
  is derived, which is why a fresh salt each time is correct - `verifySecret`
  reads the salt out of the record it is given.
- **`signInWithPassword`** in `app/actions/auth.ts`. Throttled per address
  (`RATE_LIMITS.passwordLogin`, 6 per 15 min - **lower** than the LDAP door's
  8, because here the portal holds the secret and there is no directory
  lockout behind it). Audited on success and on failure. The session is
  created **unverified**, so a developer still meets `stepUpProblem()` at the
  console. Refusals run through **`signInRefusal`**, which the archived
  version predated: a blocked account, a status that has moved on, and an
  address off the institute's two domains are all refused in one place.
- **One message for three failures.** An unknown address, an account with no
  password, and a wrong password all answer "Incorrect email or password", and
  the comparison is **always run** - against a per-process decoy record when
  there is no account - so the missing-account path does not return early and
  become a timing oracle for which addresses are registered.
- **The page**: `PasswordSignInForm` (the only client component of the three
  doors, because it is the only one with state), then Mock Authentication,
  then Google, both outlined under the solid form. `submitLabel` moved to the
  **form's submit button**, which is how `/book-room` still says "Sign in to
  book". `PASSWORD_LOGIN=false` is the one line that ends the arrangement.

### Part 2 - the office's backup, and what it could not do

The office sent `PostgreSQL.pdf` (29 test accounts, all with the password
**`test@gh`**) and `database_backup.sql`. **The backup's schema cannot run
this application**, and the data was seeded onto the migrations' schema
instead of the dump being restored. The full comparison is in
[21-database.md](21-database.md); the four that decide it:

1. **`booking_status` is wrong.** The dump declares `PENDING_WARDEN_REVIEW`,
   `PENDING_FA_REVIEW`, `PENDING_IAR_REVIEW`; the code writes
   `PENDING_WARDEN`, `PENDING_FA`, `PENDING_IAR`. **No student, club or IAR
   booking could be stored at all.** This is the same defect the integration
   found in `scripts/init-postgres.sql` and deleted the file over - the dump
   is of a database built from it.
2. **`user_role` has no `alumni`**, and has `deputy_warden` and
   `assistant_warden`, which this application does not. 7 of the 29 accounts
   carried a role the portal cannot read.
3. **Six migrations are absent**: 12 (`ldap_uid`), 16 (`hostels`), 28
   (`academic_records`), 35 (the tariff columns - **the manager could not
   approve a stay**), 36 (user groups and blocking), and the four stored scope
   columns 37 keeps. Its `profiles_v` reads the institute tables **only**,
   which is the bug the integration fixed with a COALESCE.
4. **There is no booking data.** Every operational table is empty - bookings,
   guests, logs, holds, invoices, sessions, audit. 29 profiles and reference
   rows is the whole of it, so nothing operational is lost by not restoring it.

So `supabase/seed-test-accounts.sql` seeds the **data** onto the migrations'
schema, idempotently, keeping the backup's UUIDs. Three corrections, each
argued in the file's own header:

- **The 11 warden accounts are all seeded `warden`** (the owner's decision),
  which is the portal's one reviewer role and the one `lib/types.ts` already
  labels "Assistant Warden". The kind of warden is a property of the person
  and is kept in `institute_wardens.warden_role` (4 / 3 / 4), which is also
  what `profiles_v` scopes them by. Nothing is lost and it is reversible.
- **`profiles.full_name` is corrupted in the dump on all 29 rows** - "AA"
  stored as "AAAAAA", "Dr. A" as "Dr. AbbAAAA". The institute tables carry the
  names the PDF lists, and those are seeded. Two do not fit: migration 31's
  `profiles_full_name_present` wants two characters and the PDF names `test8`
  and `test9` "A" and "B", so those two are **"Student A"** and **"Student
  B"**.
- **`app_settings`, `form_configs` and `mail_templates` are left out.** They
  are the other branch's placeholders, and a saved `form_configs` row *wins*
  over the spec defaults, so seeding them would quietly replace the booking
  forms with a three-key stub. Checked against the real parsers first: they
  reduce to the defaults anyway.

`supabase/local-postgres-stubs.sql` is new - the `auth` / `storage` / role
stand-ins a plain PostgreSQL server needs before migration 1, which until now
lived only as a recipe in [22-running-and-testing.md](22-running-and-testing.md).

### Part 3 - which door an account belongs to

> The owner, once the test accounts were in: *"mock authentication should have
> the original dummy accounts I created not the new ones. The new dummy
> accounts we can login through login page."*

Seeding 29 accounts into the database put all 29 into the **account picker**,
which reads `listProfiles()`. The rule that separates them is already in the
data: **an account with a password signs in at the form; the picker is for the
ones with no other way in.**

- **`hasStoredPassword(email)`** and **`listProfilesWithoutPassword()`** on
  `DataStore`. The first is deliberately *not* the same question as
  `getPasswordHash`: on PostgreSQL they coincide (`password_hash is not
  null`), but on the **mock store nothing has a password set on it** - the
  record is derived from the dummy directory - so it returns false for all
  nineteen personas and the picker goes on offering them. A fresh clone and
  the Playwright suite need exactly that.
- **`loginAs` refuses an account with a password**, not just the page. The
  picker signs anyone in with no secret at all, so leaving the test accounts
  off the list while `loginAs` still accepted their id would have been a
  hidden button, not a boundary.
- A database still on migration 37 has no column to read, so nothing has a
  password and the picker behaves exactly as it did before the door existed.

**`supabase/seed.sql` was broken and is fixed.** It still used the `units`
column names migration 37 renamed four days earlier (`kind`, `parent_id`,
`office_class`), so it **aborted at line 71**: a database seeded with it got
the profiles and then nothing - no units, no guest houses, no rooms. That is
why the owner's local database had 29 test accounts and no demo personas at
all. With the renames applied it runs clean, and the local database now holds
**48 profiles: 19 without a password (the picker) and 29 with (the form)**, 6
units, 2 guest houses and 20 rooms.

### Part 4 - three bugs that made every room booking fail

The owner submitted a room booking against the new local database and got
*"Something went wrong while submitting the booking"*. The real error goes to
the server's log, not the browser, and there were **three in a row** - each
only visible once the one before it was fixed. All three are in
`PostgresStore.createBooking`, none of them reachable by the test suite,
which runs on the mock store.

1. **`pg` renders a JS array as a PostgreSQL array literal, not as JSON.**
   `meals: []` went down the wire as `{}`, which a `jsonb` column stores as
   the empty **object**, so `jsonb_typeof` answered `object` and
   `bookings_meals_shape` refused the row. The error named the constraint, not
   the cause. `custom_fields` had it too; `meal_diet_counts` escaped only
   because it is an object, which `pg` does serialise as JSON. Every other
   jsonb write in the file already called `JSON.stringify` - including
   `updateBookingDetails` on the *same column* - so this was the one path that
   missed it. Now `lib/store/jsonb.ts`: `jsonbParam`, `serializeJsonbColumns`
   and `BOOKING_JSONB_COLUMNS`, in their own module with no imports so a test
   can reach them (`postgres.ts` pulls in `pg` and `server-only`).
   `saveUserMfa` had the same bug on `recovery_codes` and is fixed with it -
   TOTP enrolment would have failed the same way.
2. **`room_index` was 0-based.** The insert passed the loop counter, and
   migration 11 declares `check (room_index >= 1)` with the comment
   *"1-based, and it is what the requester saw: Room 2 is room_index 2"*.
   `MockStore` has always written `index + 1`.
3. **`action_by_name` was given `on_behalf_of_name`** - the *guest's* name on
   a desk booking, and null on every other booking - into a NOT NULL column.
   It is now resolved in the statement
   (`coalesce((select full_name from profiles where id = $2), 'Unknown')`),
   which matches `MockStore` and needs no second round trip. The default
   remark was null where the mock store writes "Booking submitted"; now both
   do.

**What this says about the suites.** All three survived a clean lint,
typecheck, build, 710 unit tests and 56 Playwright journeys, because every one
of those runs on the mock store. The two stores are only as equivalent as
something checks, and nothing checks `PostgresStore` against a real
PostgreSQL. That is now [03-roadmap.md](03-roadmap.md) §2s item 6.

### What was verified, and how

- **All 29 accounts against a real PostgreSQL 16**: stubs, 38 migrations, the
  seed twice (idempotent), then the application's own `getProfileByEmail` +
  `getPasswordHash` + `verifySecret` + `signInRefusal` for each. 29/29 accept
  `test@gh`, reject a wrong password, carry no refusal, land on the right
  home, and **no `Profile` carries a password field**. `password_hash` is
  absent from `profiles_v` by query.
- **`test@gh` verifies against the backup's own hash** under the application's
  `verifySecret`, so no hash was replaced and no plaintext was stored.
- **The door split, against the owner's own database**: 48 profiles, the
  picker offers **19** and all of them are the demo personas, the other **29**
  are offered nowhere but the form, and the rule was checked in both
  directions (nothing in the picker has a password; nothing excluded lacks
  one).
- **Playwright: 56 passed** (55 before, plus a new journey that signs a
  persona in with a password, is refused twice without the page naming the
  account, keeps the session across a navigation and signs out). The picker
  journeys still pass, which is the check that the mock store kept all
  nineteen personas.
- **A real room booking, end to end against PostgreSQL**: created, then read
  back through `getBooking` - `room_index` 1, `meals` a jsonb **array**, the
  log reading *PENDING_WARDEN by "BB" - Booking submitted*, guests and the
  derived flags right. Then a stay **with** a two-day meal plan, diet counts
  and a custom field, to exercise the jsonb paths with content in them. Both
  test bookings were deleted afterwards.
- **`npm test` 715 passed** (699 before, plus 16), lint and typecheck clean, a
  production build clean.

### Two pieces of drift found and corrected

- **[05-credentials-and-security.md](05-credentials-and-security.md) said LDAP
  had been deleted** on 2 Nov 2026 - `lib/ldap/` gone, `ldapts` removed,
  `signInWithLdap` gone. All seven files, the dependency and the action are
  **present**: the integration restored them and that file was never brought
  back. Corrected, with the restored state named.
- **Migration 37 was never written up in
  [21-database.md](21-database.md).** Added, with 38.

### Left open

[03-roadmap.md](03-roadmap.md) §2s. The two that matter:

- **There is no way to set a password from the application** - only the seed
  or SQL. That is deliberate for a temporary testing door, and the console
  field is the named follow-up, with `{ stepUp: true }` and a real minimum
  length as conditions of building it.
- **The local database is not finished.** `guesthouse_dev` exists on the
  owner's server (port 5433, role `rizwan`), but `rizwan` lacks `CREATEROLE`,
  so the three Supabase stand-in roles cannot be created and the migrations
  cannot be applied there yet. One `sudo` command, in the roadmap.
