-- ============================================================================
-- Migration 24 — Copy-to addresses, a project's sub-head, and infants aged 0
-- ============================================================================
--
-- The office's fourth list of corrections (24 Sep 2026). Three columns'
-- worth of it needs the database:
--
-- 1. **Copy to.** A requester may name any number of extra addresses on New
--    Booking; every mail sent to the requester about that booking is copied
--    to them (`lib/mail/notify.ts`). Stored on the booking, because the list
--    belongs to the request — the same person copies their secretary on one
--    booking and a visiting collaborator on the next. Capped at 25 so a
--    crafted request cannot turn the outbox into a mailing list; the form
--    and the schema carry the same number (`MAX_COPY_TO_EMAILS`).
--
-- 2. **A project's sub-head.** With the Project head, the requester can type
--    the sub-head the accounts section debits ("Travel", "Contingency"). It
--    is printed on the invoice under the project, and only there.
--
-- 3. **An infant aged 0.** Migration 1 checked `age between 1 and 120`, but
--    the portal has always accepted 0 for a baby under a year — the schema's
--    minimum is 0 and `INFANT_AGE_LIMIT` counts them as infants. On Supabase
--    that row was refused, so a family bringing a six-month-old could not be
--    booked at all. The check now allows 0. Age stays nullable: faculty,
--    staff and official forms no longer require it, and a guest with no age
--    is an adult (`booking_guests.is_infant` is derived with `age is not null
--    and age < 5`, migration 11).
--
-- Special Funds, the other new debitable head, needs nothing here: it is
-- stored as `special_budget`, which migration 15 already allows.
--
-- Additive and idempotent. Every existing row reads as "nobody copied" and
-- "no sub-head". Until this is applied the app still books — it leaves both
-- columns out of the insert when they are empty — but a booking that does
-- name a copy-to address or a sub-head is refused.
--
-- Safe to re-run.
-- ============================================================================

alter table public.bookings
  add column if not exists copy_to_emails text[] not null default '{}',
  add column if not exists debit_subhead text;

alter table public.bookings drop constraint if exists bookings_copy_to_emails_check;
alter table public.bookings
  add constraint bookings_copy_to_emails_check
  check (cardinality(copy_to_emails) <= 25);

alter table public.bookings drop constraint if exists bookings_debit_subhead_check;
alter table public.bookings
  add constraint bookings_debit_subhead_check
  check (
    debit_subhead is null
    or (debit_head = 'project_grant' and char_length(debit_subhead) between 1 and 120)
  );

comment on column public.bookings.copy_to_emails is
  'Extra addresses copied (CC) on every mail sent to the requester about this booking. Entered on New Booking; at most 25.';
comment on column public.bookings.debit_subhead is
  'The project sub-head the requester typed, with the Project debitable head only. Printed on the invoice under the project.';

-- ---------------------------------------------------------------- infants

alter table public.booking_guests drop constraint if exists booking_guests_age_check;
alter table public.booking_guests
  add constraint booking_guests_age_check
  check (age is null or age between 0 and 120);
