-- ============================================================================
-- Migration 34 - Index the foreign keys that a delete has to check
--                (14 Oct 2026)
-- ============================================================================
--
-- WHY, measured rather than assumed
--
-- Postgres does not index a foreign key's **referencing** column for you. It
-- indexes the primary key being referenced. So every time a parent row is
-- deleted, each child table with an unindexed referencing column is **scanned
-- in full** to enforce the constraint.
--
-- 22 foreign keys in this schema had no supporting index, and 15 of them point
-- at `profiles`. That matters because profiles are deleted in bulk:
--
--   * Users & Roles -> tick rows -> Delete (`deleteUsersAction`), and
--   * **undoing a spreadsheet import** (migration 32), which deletes every
--     account the import created - up to `MAX_USER_IMPORT_ROWS`, i.e. 2000.
--
-- Measured in a throwaway postgres:16-alpine with 200,000 `booking_logs` rows
-- and 2,000 bookings - a small fraction of a few years of real use:
--
--   deleting 300 profiles, before this migration:  2,580 ms
--   deleting 300 profiles, after  this migration:      64 ms (3 samples,
--                                                       63.4 / 64.1 / 63.8)
--
-- a factor of ~40, and the before figure grows linearly with the history while
-- the after figure does not. Extrapolated to a 2,000-row undo it is the
-- difference between a server action that finishes and one that is still
-- scanning when the platform's request timeout cuts it off - which would leave
-- the undo half-applied, the one outcome migration 32 exists to prevent.
--
-- WHICH KEYS, AND WHY NOT ALL 22
--
-- An index earns its place here only if its parent is actually deleted. The
-- code deletes from `profiles`, `units`, `guest_houses`, `bookings`,
-- `academic_records`, `hostels`, `projects`, `room_blocks`, `tariffs`,
-- `form_configs`, `mail_templates` and `user_mfa`, and purges `sessions`.
--
--   * **the 15 pointing at `profiles`** - bulk deletes, above;
--   * **`units.parent_id` and `units.hod_unit_id`** - `deleteUnit` exists, and
--     both are self-references, so deleting one unit scans `units` twice;
--   * **`tariffs.guest_house_id`** - `deleteGuestHouse` exists;
--   * **`sessions.rotated_from`** - a self-reference on a table that is purged
--     in bulk (`purgeExpiredSessions`), so without it the purge is O(n^2) in
--     the number of sessions.
--
-- Deliberately **not** added: `invoices.replaces_invoice_id`. Invoices are
-- never deleted - an issued invoice is a record, and a correction is a new
-- document that points at the old one - so the index would earn nothing on a
-- delete, and nothing reads invoices by what they replace.
--
-- `booking_guests (booking_room_id, booking_id)` needs nothing either:
-- `booking_guests_room_idx` is on `booking_room_id`, the composite key's
-- leading column, which the constraint check can use.
--
-- COST
--
-- One b-tree per key, each on a column that is null for most rows in the
-- tables that are mostly history (`booking_logs.action_by`,
-- `bookings.created_by`, the four on `invoices`), so the `where ... is not
-- null` partial indexes below stay small. Writes take one more index entry
-- only when the column is set.
--
-- Additive: creates indexes and nothing else. Changes no row, no column and no
-- behaviour. Idempotent and safe to re-run, and **optional** - nothing in the
-- application requires it, it only makes a delete that already works finish in
-- time.
--
-- ROLLBACK: drop each index by name. They hold no data.
-- ============================================================================

-- ------------------------------------------------- the 15 pointing at profiles
--
-- Partial where the column is nullable and usually null: the index then has
-- one entry per row that actually names somebody, which is what a delete has
-- to find.
create index if not exists booking_logs_action_by_idx
  on public.booking_logs (action_by) where action_by is not null;

create index if not exists bookings_created_by_idx
  on public.bookings (created_by) where created_by is not null;

create index if not exists invoices_created_by_idx
  on public.invoices (created_by) where created_by is not null;
create index if not exists invoices_issued_by_idx
  on public.invoices (issued_by) where issued_by is not null;
create index if not exists invoices_paid_by_idx
  on public.invoices (paid_by) where paid_by is not null;
create index if not exists invoices_cancelled_by_idx
  on public.invoices (cancelled_by) where cancelled_by is not null;

create index if not exists privacy_requests_user_idx
  on public.privacy_requests (user_id);
create index if not exists privacy_requests_handled_by_idx
  on public.privacy_requests (handled_by) where handled_by is not null;

create index if not exists room_blocks_created_by_idx
  on public.room_blocks (created_by) where created_by is not null;

create index if not exists room_holds_override_by_idx
  on public.room_holds (override_by) where override_by is not null;

create index if not exists tariffs_created_by_idx
  on public.tariffs (created_by) where created_by is not null;

-- `units.head_id` / `acting_head_id`: also read on every approval, because an
-- HOD is found by looking for the unit a person belongs to and reading its
-- head (`hodApproversFor`). So these two pay for themselves twice.
create index if not exists units_head_idx
  on public.units (head_id) where head_id is not null;
create index if not exists units_acting_head_idx
  on public.units (acting_head_id) where acting_head_id is not null;

create index if not exists academic_records_imported_by_idx
  on public.academic_records (imported_by) where imported_by is not null;

create index if not exists user_import_batches_actor_idx
  on public.user_import_batches (actor_id) where actor_id is not null;
create index if not exists user_import_batches_reverted_by_idx
  on public.user_import_batches (reverted_by) where reverted_by is not null;

-- --------------------------------------------- the self-references and the rest
create index if not exists units_parent_idx
  on public.units (parent_id) where parent_id is not null;
create index if not exists units_hod_unit_idx
  on public.units (hod_unit_id) where hod_unit_id is not null;

create index if not exists tariffs_guest_house_idx
  on public.tariffs (guest_house_id) where guest_house_id is not null;

create index if not exists sessions_rotated_from_idx
  on public.sessions (rotated_from) where rotated_from is not null;
