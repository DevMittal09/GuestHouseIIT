# Recent changes - the last round, and only the last round

This file is **replaced** every round, not appended to. The round before this
one is written up where every round is: what was asked in
[01-background.md](01-background.md), why it was done that way in
[02-decisions.md](02-decisions.md).

---

## Round of 4 November 2026 - remove department_or_club, roll_number and staff_category from profiles

Continuation of the "computed fields" pattern established on 3 Nov 2026 for
`hostel_name`. The three remaining derived columns - `department_or_club`,
`roll_number` and `staff_category` - are removed from the `profiles` table and
computed at read time, like `hostel_name` already was.

### What was delivered

**DB schema** (`scripts/init-postgres.sql`): the three columns dropped from
`CREATE TABLE profiles`. The `profiles_v` view expanded to compute all four
fields: `hostel_name` from `institute_students`/`institute_wardens`,
`department_or_club` from `units.name` via `unit_id`, `roll_number` from
`institute_students`, and `staff_category` from `institute_employees.employee_type`
(Teaching Staff -> `faculty`, Non Teaching Staff -> `staff`).

**Type system** (`lib/types.ts`): `NewProfileInput` now excludes all four
computed fields: `Omit<Profile, "id" | "hostel_name" | "department_or_club" |
"roll_number" | "staff_category">`. `Profile` type unchanged - all four fields
remain on the read type.

**Both stores**: `PostgresStore` writes no longer include the three fields.
`MockStore`'s `withComputed()` (renamed from `withHostel()`) resolves all four
fields at read time from the in-memory institute tables: students for
`hostel_name` and `roll_number`, wardens for `hostel_name`, `units.name` for
`department_or_club`, and `institute_employees.employee_type` for
`staff_category`. Seed profiles (`SeededProfileInput`) carry none of the four
fields; two `as Profile` casts in mock.ts bridge the type gap at insertion.

**User import** (`lib/users-import.ts`): `department_or_club`, `roll_number` and
`staff_category` removed from `UserImportRow`, `DEFAULT_COLUMNS`,
`KNOWN_COLUMNS`, `sameProfile()` and `changedFields()`. Import now handles
only `email`, `full_name`, `role` and `unit_id`. `staffCategoryFrom()` deleted.

**Import undo** (`lib/users-import-undo.ts`): `UserImportFields` reduced to
`full_name`, `role` and `unit_id`. `FIELD_LABELS` reduced accordingly.

**Actions** (`app/actions/admin.ts`): `userSchema` no longer includes the three
fields. `createProfileAction` and `updateProfileAction` no longer write them.

**Components** (`components/admin/users-manager.tsx`): form and table no longer
show Department/Club, Roll Number or Staff Category columns. The admin Users &
Roles page removed its unused imports.

**Business logic**: `lib/debit-heads.ts` and `lib/office-debit-heads.ts`
unchanged - they read `staff_category` from the `Profile` type, which still
carries it (computed at read time).

**Test helpers** (`tests/helpers.ts`): new `resolveComputed()` function mirrors
the `profiles_v` / `withComputed()` logic for test data: resolves all four
fields from seed institute tables. `asProfile()` and `asProfiles()` helpers
promote `SeededProfileInput` to full `Profile` with computed fields.

**All 10 affected test files** updated: `approval-routes`, `faculty-advisor`,
`fourteenth-round`, `workflow-hod`, `ninth-round`, `user-import-idempotency`,
`user-import-undo`, `store-settings`, `fourth-round`, `office-debit-heads`.

### Validation

`npm run lint` (0 errors, 0 warnings), `npm run typecheck`, `npm test`
(604 tests, 34 files), `npm run build` all clean.

### What is left open

- Existing Postgres databases with the old columns need
  `ALTER TABLE profiles DROP COLUMN department_or_club`,
  `ALTER TABLE profiles DROP COLUMN roll_number`,
  `ALTER TABLE profiles DROP COLUMN staff_category`.
  Or they can be left in place - the view shadows them on reads and writes
  ignore them. The `hostel_name` column (dropped 3 Nov) is the same.
- The `profiles_v` view must be created or replaced on any database that has
  the institute tables (migration 35) but not the view yet.
