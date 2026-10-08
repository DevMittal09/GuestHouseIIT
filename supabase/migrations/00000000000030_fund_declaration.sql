-- ============================================================================
-- Migration 30 - the requester's declaration about the debitable head
-- ============================================================================
--
-- The office's ninth list (8 October 2026) gave the debitable heads and the
-- mapping of requester to head, and added one sentence to the booking form:
--
--   "I have the necessary approval for the usage of funds from the competent
--    authority and verified that sufficient balance is there in the debitable
--    head."
--
-- It is asked for by every head except Personal Funds - a requester is the
-- competent authority for their own money, and there is no balance for them
-- to verify. Every other head spends a budget they do not own.
--
-- Recorded rather than merely enforced: an approver looking at a request, and
-- the accounts section looking at an invoice months later, both want to see
-- that the assurance was given and when. The column holds the instant, like
-- `privacy_consent_at` beside it, because "when" answers "was this the form
-- as it stood then" and a boolean does not.
--
-- Nothing is backfilled. A booking made before today was never asked, and a
-- timestamp invented for it would be a record of something that did not
-- happen; `fund_declaration_at is null` therefore means either "personal
-- booking" or "made before the question existed", and the booking's own date
-- tells them apart.
--
-- Additive, nullable and safe to re-run. Until it is applied the store leaves
-- the column out of the insert unless the declaration was actually given, so
-- every personal booking still works and only a booking on somebody else's
-- budget is refused (with "column does not exist" in the log).

alter table public.bookings
  add column if not exists fund_declaration_at timestamptz;

comment on column public.bookings.fund_declaration_at is
  'When the requester declared they hold the approval for the debitable head and that it has sufficient balance (migration 30). Null on a personal booking and on bookings made before 8 Oct 2026.';
