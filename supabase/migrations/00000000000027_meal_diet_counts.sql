-- ============================================================================
-- Migration 27 — Each person's own meal preference
-- ============================================================================
--
-- The office's seventh list of corrections (1 Oct 2026): "for Meal booking we
-- need personal preferences for meal order, not just one preference for the
-- whole group".
--
-- A booking used to carry one `meal_preference` for everybody, so a party of
-- thirty with two vegetarians was booked as non-vegetarian and the kitchen
-- cooked thirty non-vegetarian plates. What it carries now is the split:
--
--   {"veg": 18, "non_veg": 12}
--
-- Counts rather than a row per person, because a dining booking has no guest
-- list at all — only a head count — and the kitchen cooks to numbers. The
-- split has to add up to that head count, which the app checks on both sides
-- (`dietCountsError`); the database only checks the shape, because a stay's
-- head count is the guest rows and they are inserted after the booking.
--
-- `meal_preference` is kept and is **not** dropped: bookings written before
-- today carry only it, and `mealDietCounts()` reads them by spreading that one
-- answer over the head count. Nothing is backfilled — a legacy row has no
-- split of its own and should not be given an invented one.
--
-- Additive, defaulted to null, and safe to re-run. Until it is applied the
-- store leaves the column out of the insert (`SupabaseStore.createBooking`),
-- so bookings still work and only the split is lost: the booking then reads
-- back through the legacy preference, which is what it did before today.
-- ============================================================================

alter table public.bookings
  add column if not exists meal_diet_counts jsonb;

-- Whole, non-negative counts and nothing else in the object. A booking with
-- no meals leaves it null.
--
-- "Nothing else" is checked by removing the two keys and requiring an empty
-- object: a check constraint may not contain a subquery, so counting the keys
-- with `jsonb_object_keys` is not available here.
alter table public.bookings drop constraint if exists bookings_meal_diet_counts_shape;
alter table public.bookings
  add constraint bookings_meal_diet_counts_shape
  check (
    meal_diet_counts is null
    or (
      jsonb_typeof(meal_diet_counts) = 'object'
      and (meal_diet_counts ->> 'veg') ~ '^[0-9]+$'
      and (meal_diet_counts ->> 'non_veg') ~ '^[0-9]+$'
      and (meal_diet_counts - 'veg' - 'non_veg') = '{}'::jsonb
    )
  );

comment on column public.bookings.meal_diet_counts is
  'Each person''s own meal preference as a count per kind (migration 27): {"veg": n, "non_veg": n}, adding up to the booking''s head count. Null on a booking with no meals and on rows written before 1 Oct 2026, which carry only meal_preference.';
