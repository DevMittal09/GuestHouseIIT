-- Infants become guest rows rather than a count on the booking.
--
-- Migration 3 modelled infants as `bookings.infants`, on the reasoning that an
-- infant has no ID document so it should not be a guest row. That was wrong
-- about what the office needs: they still want the child's name, age and
-- gender on the register — it is only the *ID* that is waived. A bare count
-- cannot carry that, so the flag moves onto the guest.
--
-- `is_infant` is an explicit flag rather than an `age < 10` test because the
-- two answer different questions: age is a fact about the guest, is_infant is
-- a decision about whether they occupy a bed. The app still checks that an
-- infant's age is under the limit.

alter table public.booking_guests
  add column is_infant boolean not null default false;

-- Existing rows are all bed-occupying guests; the default above is correct for
-- them. The old count column has no per-guest detail to migrate into, so any
-- infants recorded under the old model are simply dropped rather than being
-- invented as nameless guest rows.
alter table public.bookings drop column infants;

-- Infants never need an ID, so a guest row with is_infant may legitimately
-- have neither an id_number nor an id_document_url. Nothing to enforce here —
-- the requirement is per-role form config, applied in the app.

create index booking_guests_infant_idx
  on public.booking_guests (booking_id)
  where is_infant;
