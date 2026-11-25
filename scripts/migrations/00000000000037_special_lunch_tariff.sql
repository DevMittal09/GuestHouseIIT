-- Migration 37: add 'special_lunch' to the tariffs item CHECK constraint.
--
-- The portal now supports a fourth meal type, Special Lunch, served between
-- lunch and dinner. This migration widens the CHECK constraint on
-- tariffs.item so existing databases accept the new tariff item.
--
-- Additive and safe to re-run: re-creating the constraint with IF EXISTS
-- means a second application does nothing harmful.
--
-- Until this is applied, creating a special_lunch tariff row against
-- PostgreSQL fails with a CHECK violation.

BEGIN;

-- Drop the old constraint and re-add with the new value.
ALTER TABLE public.tariffs
  DROP CONSTRAINT IF EXISTS tariffs_item_check;

ALTER TABLE public.tariffs
  ADD CONSTRAINT tariffs_item_check
  CHECK (item IN ('room', 'extra_bed', 'breakfast', 'lunch', 'special_lunch', 'dinner'));

COMMIT;
