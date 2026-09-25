-- ============================================================================
-- Migration 26 — Additional charges on an invoice
-- ============================================================================
--
-- The office's fifth list of corrections (25 Sep 2026). While invoicing, the
-- desk (manager or caretaker) can add charges the tariff does not know about
-- — an extra bed arranged at the desk, a broken vase — each with a comment
-- saying what it was, and choose whether it is charged with the rooms (GST on
-- accommodation), with the dining (GST on food) or on its own with no GST
-- (compensation for damage or loss).
--
-- The priced charges live in the issued invoice's snapshot (`document ->
-- 'extra_lines'`), which needs nothing here: it is jsonb. This column holds
-- them **as the desk typed them on the draft**, the way `meal_counts` holds
-- the desk's meal-count correction, so a draft saved at 10 pm is still there
-- at check-out the next morning. One element per charge:
--
--   {"section": "room" | "dining" | "other", "description": "Broken vase",
--    "comment": "Vase in B-104 broken on 3 Oct", "quantity": 1,
--    "unit_price": 150000}                        -- paise, as typed
--
-- `issue_invoice()` promotes the draft row and leaves this column as it is;
-- the app writes the draft first when there are charges
-- (`SupabaseStore.issueInvoice`). Once issued, `invoices_guard` freezes it
-- with every other column.
--
-- Additive and idempotent; every existing invoice reads as having none.
-- Until this is applied the app still saves drafts and issues invoices — it
-- leaves the column out when there are no charges — but a draft or an
-- invoice that carries an additional charge is refused with a message naming
-- this file.
--
-- Safe to re-run.
-- ============================================================================

alter table public.invoices
  add column if not exists extra_charges jsonb not null default '[]'::jsonb;

-- An array of at most 20 charges — the form's and `parseExtraCharges`'s
-- limit (`MAX_EXTRA_CHARGES`), so a crafted request cannot grow a draft
-- without bound.
alter table public.invoices drop constraint if exists invoices_extra_charges_shape;
alter table public.invoices
  add constraint invoices_extra_charges_shape
  check (jsonb_typeof(extra_charges) = 'array' and jsonb_array_length(extra_charges) <= 20);

comment on column public.invoices.extra_charges is
  'The desk''s additional charges as typed on the draft (migration 26): [{section, description, comment, quantity, unit_price (paise)}]. The issued snapshot holds them priced, in document->''extra_lines''.';
