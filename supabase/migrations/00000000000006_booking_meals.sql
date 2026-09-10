-- Migration 6: meal preferences per booking.
--
-- The requester chooses breakfast / lunch / dinner when they book, so the
-- guest house kitchen knows head counts before the guests arrive.
--
-- Stored as one jsonb object rather than three boolean columns because it is
-- one answer to one question and is always read as a set — the same reasoning
-- (and the same shape of column) as `bookings.custom_fields`.
--
-- Non-destructive: existing bookings get "no meals requested", which is the
-- truthful answer for a booking made before the question was asked.

alter table public.bookings
  add column if not exists meals jsonb not null
  default '{"breakfast": false, "lunch": false, "dinner": false}'::jsonb;

-- Every key present and boolean, so the app never has to defend against a
-- half-written object coming back out of the database.
alter table public.bookings
  drop constraint if exists bookings_meals_shape;

alter table public.bookings
  add constraint bookings_meals_shape check (
    jsonb_typeof(meals -> 'breakfast') = 'boolean'
    and jsonb_typeof(meals -> 'lunch') = 'boolean'
    and jsonb_typeof(meals -> 'dinner') = 'boolean'
  );

comment on column public.bookings.meals is
  'Meals requested with this booking: {"breakfast":bool,"lunch":bool,"dinner":bool}. See lib/meals.ts.';
