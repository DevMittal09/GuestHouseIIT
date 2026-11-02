# Recent changes - the last round, and only the last round

This file is **replaced** every round, not appended to. The round before this
one is written up where every round is: what was asked in
[01-background.md](01-background.md), why it was done that way in
[02-decisions.md](02-decisions.md).

---

## Round of 2 November 2026 (second session) - rewire Academic Records to institute tables

The previous session created six `institute_*` tables and 30 `DataStore`
methods. This session **rewired every dependent module** so the Academic Records
console, the booking form's parent locking, and the `StoreAcademicSource`
adapter all read from the new tables instead of the old `academic_records`
table.

### What was delivered

**Adapter layer** (`lib/institute/academic-adapter.ts`): five pure functions
(`studentToRecord`, `employeeToRecord`, `officeToRecord`, `fccToRecord`,
`wardenToRecord`) that convert each institute table's row type into the
`AcademicRecord` union the rest of the portal reads. Downstream code -
the booking form's parent locking, the warden's family check, the Copy-to
chain, the requester-details card - is unchanged.

**`StoreAcademicSource` rewired** (`lib/academic/store-source.ts`): reads
institute_* tables via the adapter instead of `academic_records`. Falls through
to `MockAcademicSource` (dummy records) for `alumni_office` (no table) and
when tables are missing (Postgres error `42P01`).

**Console rewritten** (`components/admin/academic-records-manager.tsx`,
`app/(portal)/admin/academic/page.tsx`, `app/actions/academic.ts`): imports,
views, and deletes records per institute table kind. The component manages
per-kind record loading and counts. Server actions route to the correct store
method per kind. Import planning uses `lib/institute/import.ts`.

**Import planning** (`lib/institute/import.ts`): `planInstituteImport`,
`describeImport`, `csvColumnsFor`, `csvHeaderFor`, `columnLabel` - the same
all-or-nothing CSV-paste logic as the old `planAcademicImport`, but reading
each table's own column arrays from `lib/institute/types.ts`.

**Shared CSV utility** (`lib/csv.ts`): `splitCsvLine` moved here from
`lib/academic/stored.ts` and re-exported from there for backward
compatibility. `lib/projects.ts` and `lib/users-import.ts` now import it
directly from `lib/csv.ts`.

**Seed data aligned** (`lib/store/seed.ts`): the institute_students seed
records now match `lib/academic/mock-source.ts` exactly (father/mother/guardian
names, programme, department, phone), so `StoreAcademicSource` returns
consistent data whether it reads from the store or falls through to
the dummies.

**Tests rewritten** (`tests/academic-records.test.ts`): CSV-paste tests use
`planInstituteImport`; store tests use the new `store.saveStudents` /
`findStudent` / `listStudents` / `deleteStudent` / `deleteAllStudents`
methods; the `StoreAcademicSource` adapter test verifies an imported record
wins over a sample and a missing record falls through.

### What is open

- **Dead code in `lib/academic/stored.ts`**: `planAcademicImport`,
  `sameRecord`, `recordFromFields`, `StoredAcademicRecord`,
  `NewAcademicRecordInput`, `ACADEMIC_RECORD_KINDS`,
  `ACADEMIC_RECORD_KIND_LABELS`, `AcademicImportPlan` are no longer imported
  by any production code. The old academic_records store methods were removed
  in the first session. These types and functions can be deleted once the
  migration from academic_records is confirmed complete.
- **Migration 35 is not applied** to the hosted project
- **The old `academic_records` table** (migration 28) still exists in the
  database schema and in the Supabase migration files but is no longer read
  or written by any code path

### Validation

`npm run typecheck`, `npm run lint`, `npm test` (606 tests, 35 files) and
`npm run build` all clean.
