# Recent changes - the last round, and only the last round

This file is **replaced** every round, not appended to. The round before this
one is written up where every round is: what was asked in
[01-background.md](01-background.md), why it was done that way in
[02-decisions.md](02-decisions.md).

---

## Round of 2 November 2026 (fifth session) - Consolidate hostels into institute_hostels

Consolidation of duplicate hostel tables and audit of unused tables. The owner noticed
that `institute_wardens` has `hostel_id` which was not present in the legacy `hostels`
table, and asked to drop unused tables and rewire `profiles` to use `institute_hostels`.

### What was delivered

**Consolidated Hostels in Postgres Schema** (`scripts/init-postgres.sql`):
- Dropped the legacy `public.hostels` table.
- Added `hostel_name text not null unique check (length(btrim(hostel_name)) between 1 and 60 and hostel_name = btrim(hostel_name))` constraint to `institute_hostels`.
- Rewired `profiles.hostel_name` foreign key constraint to reference `public.institute_hostels (hostel_name) on update cascade on delete restrict`.

**Consolidated Store Implementations**:
- `lib/store/postgres.ts`: `listHostels`, `addHostel`, `renameHostel`, `removeHostel` now operate on `institute_hostels`. Added foreign key deletion protection on `deleteInstituteHostel` and `deleteAllInstituteHostels` if profiles still reference a hostel.
- `lib/store/mock.ts`: Migrated `db.hostels` into `db.institute_hostels`. `listHostels`, `addHostel`, `renameHostel`, `removeHostel`, and `assertHostelExists` all read and write `institute_hostels`.
- `scripts/check-migrations.mjs`: Updated migration 16 marker to verify `institute_hostels.hostel_name`.

**Fixed Academic Adapter Logic Miss**:
- `lib/academic/store-source.ts` & `lib/institute/academic-adapter.ts`: When fetching a warden's academic record, `row.hostel_id` is now resolved to `hostel_name` from `institute_hostels` so `wardenToRecord` no longer returns `hostel: null`.
- `lib/oidc.ts`: Relocated `OAUTH_COOKIE` out of the route handler file to fix Next.js 16 type generation constraints.

**Verification**:
- Vitest suite: 34 files, 596 tests passed.
- Next.js type generation & TypeScript check: 0 errors.
- ESLint: 0 errors, 0 warnings.
- Production build: all 41 routes successfully compiled.
- `check:memories`: all 15 files and markdown links verified.
