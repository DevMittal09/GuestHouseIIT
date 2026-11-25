-- Migration 38: on_behalf_config table for booking on behalf of others.
--
-- Which non-teaching staff may be booked on behalf of, and by whom.
-- A booker (non-teaching staff) can submit a booking for a target (faculty
-- or other configured profile) when a row links the two here.
--
-- Additive and safe to re-run: the CREATE TABLE uses IF NOT EXISTS, and
-- the index and RLS are idempotent.
--
-- Until this is applied, the on-behalf booking feature and the Console ->
-- On Behalf settings page will fail with "relation does not exist".

BEGIN;

CREATE TABLE IF NOT EXISTS public.on_behalf_config (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_profile_id  uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  booker_profile_id  uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  created_at         timestamptz NOT NULL DEFAULT now(),
  created_by         uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  UNIQUE (target_profile_id, booker_profile_id)
);

ALTER TABLE public.on_behalf_config ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS on_behalf_config_booker_idx
  ON public.on_behalf_config (booker_profile_id);

COMMIT;
