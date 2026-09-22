-- Migration 22: search and indexes (Phase 9, Sep 2026).
--
-- The archive search scans up to 1,000 bookings and matches keywords in
-- JavaScript, over joined guests, rooms and logs. That is fine for a few
-- hundred bookings and hopeless at ten thousand: it reads rows it will throw
-- away, and tells the reader the result was truncated.
--
--   * `bookings.search_text` — a generated tsvector over the columns the
--     search actually matches on the booking itself (reference, purpose,
--     on-behalf name, alumni name and roll number), with a GIN index. The
--     store pushes the keyword down when there is one, so Postgres finds the
--     candidates and JavaScript only ranks and filters them.
--   * Indexes for the reads that happen on every page: the desk's date
--     windows, the requester's own list, the queues' status filter, holds and
--     blocks by room, invoices by booking, guests by booking, logs by booking.
--     `create index if not exists` throughout, so this is safe to re-run.
--
-- Guests' names are deliberately **not** in the search vector: they are
-- personal data, the column would be searchable by anyone who can reach
-- PostgREST, and the JavaScript matcher already covers them for the staff who
-- may see them.
--
-- Apply after migration 21. Safe to re-run.

-- ---------------------------------------------------------------- search

alter table public.bookings
  add column if not exists search_text tsvector
  generated always as (
    setweight(to_tsvector('simple', coalesce(booking_reference_id, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(purpose_of_visit, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(on_behalf_of_name, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(alumni_name, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(alumni_roll_number, '')), 'A')
  ) stored;

create index if not exists bookings_search_idx on public.bookings using gin (search_text);

comment on column public.bookings.search_text is
  'Generated search vector for the archive (Phase 9): reference and roll number weighted A, purpose and names B. Guest names are not included — they are personal data and the application matches them after loading.';

-- ---------------------------------------------------------------- indexes

-- The desk's windows: "arriving today", "in house", "leaving today".
create index if not exists bookings_check_in_idx on public.bookings (check_in);
create index if not exists bookings_check_out_idx on public.bookings (check_out);
-- The queues: one status at a time, newest first.
create index if not exists bookings_status_created_idx on public.bookings (status, created_at desc);
-- "My bookings".
create index if not exists bookings_user_created_idx on public.bookings (user_id, created_at desc);
-- The archive's ordering, and the manager's per-guest-house filters.
create index if not exists bookings_guest_house_check_in_idx on public.bookings (guest_house_id, check_in);

-- Everything hung off a booking, loaded whenever one is shown.
create index if not exists booking_guests_booking_idx on public.booking_guests (booking_id);
create index if not exists booking_rooms_booking_idx on public.booking_rooms (booking_id);
create index if not exists booking_logs_booking_idx on public.booking_logs (booking_id, timestamp);
create index if not exists invoices_booking_idx on public.invoices (booking_id);

-- The audit console reads newest-first, filtered by kind.
create index if not exists security_audit_at_idx on public.security_audit (at desc);
create index if not exists security_audit_event_idx on public.security_audit (event, at desc);

-- The outbox worker claims by status and due time.
create index if not exists email_outbox_due_idx on public.email_outbox (status, scheduled_for);
