-- Migration 7: one "infant accompanying" flag per booking.
--
-- Migration 4 made infants guest rows (`booking_guests.is_infant`) so that
-- their name, age and gender reached the register. The guest house office has
-- since asked for the opposite trade-off: the requester only says *whether* an
-- infant is coming, however many, with no per-infant details. So the fact
-- moves onto the booking as one boolean.
--
-- Non-destructive. `booking_guests.is_infant` stays: rows written under
-- migration 4 are still infants — they share a guardian's bed, and the app
-- keeps them out of capacity — and dropping the column would silently turn
-- them into bed-occupying adults. New bookings always write false there.
--
-- Apply after migration 6. Until this runs, creating a booking against
-- Supabase fails, because the insert names `has_infant`.

alter table public.bookings
  add column if not exists has_infant boolean not null default false;

-- A booking that listed an infant as a guest row had an infant with it.
update public.bookings b
set has_infant = true
where not b.has_infant
  and exists (
    select 1
    from public.booking_guests g
    where g.booking_id = b.id
      and g.is_infant
  );

comment on column public.bookings.has_infant is
  'Whether one or more infants (under 10) accompany the party. One flag however many: infants share a guardian''s bed and need no ID. See lib/occupancy.ts.';

comment on column public.booking_guests.is_infant is
  'Legacy (migration 4): infants recorded as guest rows. New bookings write false and use bookings.has_infant (migration 7).';
