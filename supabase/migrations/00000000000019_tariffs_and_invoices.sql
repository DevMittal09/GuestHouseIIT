-- Migration 19: tariffs and invoices (Phase 5, Sep 2026).
--
-- The guest house hands a guest an invoice at check-out, laid out as the
-- office's template (public/GHM_Invoice.docx). Until now the portal printed a
-- statement worked out on the fly from constants; this makes it a record:
--
--   * `tariffs` — room, extra-bed and per-meal rates, effective-dated, each
--     optionally narrowed by guest house, room type, booking type and the
--     requester's role (lib/tariffs.ts `resolveTariff` picks the most specific
--     row in force). A row already in force is never changed or deleted — a
--     new price is a new row from a later date — and a trigger enforces it.
--     Seeded from the office's tariff sheet. There is NO extra-bed rate on the
--     sheet, so none is seeded: an invoice with an extra bed cannot be issued
--     until the office adds one.
--   * `invoices` — one per issue, with a snapshot (`document`) of every field
--     printed, the reporting columns (head, project, totals, GST), and the
--     status draft → issued → paid, or → cancelled with a reason. Issued
--     invoices are immutable: a trigger allows only the payment fields to be
--     filled in, and cancellation. A correction is a cancellation and a new
--     invoice, which records the one it replaces.
--   * `invoice_counters` + `issue_invoice()` — the financial-year serial
--     (GH/2026-27/0001). The counter row is incremented and the invoice
--     written in one transaction, so two desks issuing at once get
--     consecutive numbers and a failed issue leaves no gap.
--   * `email_outbox.attachments` — references (never the bytes) to attach
--     when the message is sent: an official invoice is mailed to Accounts
--     with its PDF, rendered by the dispatcher from the snapshot.
--
-- Apply after migration 18. Safe to re-run.

-- ---------------------------------------------------------------- tariffs

create table if not exists public.tariffs (
  id             uuid primary key default gen_random_uuid(),
  guest_house_id uuid references public.guest_houses (id) on delete cascade,
  item           text not null check (item in ('room', 'extra_bed', 'breakfast', 'lunch', 'dinner')),
  room_type      text check (room_type in ('single', 'double_sharing')),
  booking_type   text check (booking_type in ('official', 'personal', 'alumni')),
  requester_role text check (requester_role in (
                   'student', 'employee', 'official', 'club', 'alumni',
                   'iar_cell', 'iar_student_cell', 'gh_manager')),
  rate           numeric(10, 2) not null check (rate >= 0),
  effective_from date not null,
  note           text,
  created_by     uuid references public.profiles (id) on delete set null,
  created_at     timestamptz not null default now(),
  constraint tariffs_room_type_for_rooms
    check (room_type is null or item in ('room', 'extra_bed'))
);

-- One rate per scope per date: a second row for the same scope and day is a
-- typo, not a price.
create unique index if not exists tariffs_one_per_scope_and_date on public.tariffs (
  coalesce(guest_house_id, '00000000-0000-0000-0000-000000000000'::uuid),
  item,
  coalesce(room_type, ''),
  coalesce(booking_type, ''),
  coalesce(requester_role, ''),
  effective_from
);

comment on table public.tariffs is
  'Guest house rates by date (Phase 5). Blank qualifiers mean "any"; the most specific row in force prices a charge (lib/tariffs.ts resolveTariff). Rows in force are immutable (tariffs_guard).';

-- A rate already in force has priced stays: it is never changed or deleted.
create or replace function public.tariffs_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.effective_from <= (now() at time zone 'Asia/Kolkata')::date then
    raise exception 'TARIFF_IN_FORCE|This rate is already in force, so stays have been priced with it. Add a new rate from a later date instead.'
      using errcode = 'P0001';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists tariffs_guard on public.tariffs;
create trigger tariffs_guard
  before update or delete on public.tariffs
  for each row execute function public.tariffs_guard();

-- The office's tariff sheet. Bageshri: ₹1,000 a room a day, everyone (₹750
-- until 23 Sep 2026; a database seeded before that is raised by
-- supabase/repairs/2026-09-23-bageshri-rate-1000.sql, since a rate in force is
-- never edited).
-- Hamsanandi: ₹2,000 (types 1 and 2), ₹4,000 for government officers from
-- outside — in portal terms the `official` role. Meals, per head: breakfast
-- ₹80, lunch ₹120, dinner ₹100; free to students and to alumni stays.
insert into public.tariffs (guest_house_id, item, room_type, booking_type, requester_role, rate, effective_from, note)
select s.gh, s.item, null, s.booking_type, s.requester_role, s.rate, date '2024-01-01', s.note
from (
  select (select id from public.guest_houses where name = 'Bageshri') as gh, 'room' as item,
         null::text as booking_type, null::text as requester_role, 1000::numeric as rate,
         'Tariff sheet: Bageshri, per room per day' as note
  union all
  select (select id from public.guest_houses where name = 'Hamsanandi'), 'room', null, null, 2000,
         'Tariff sheet: Hamsanandi types 1 and 2'
  union all
  select (select id from public.guest_houses where name = 'Hamsanandi'), 'room', null, 'official', 4000,
         'Tariff sheet: Hamsanandi type 3, government officers'
  union all select null, 'breakfast', null, null, 80, 'Tariff sheet: per head'
  union all select null, 'lunch', null, null, 120, 'Tariff sheet: per head'
  union all select null, 'dinner', null, null, 100, 'Tariff sheet: per head'
  union all select null, 'breakfast', null, 'student', 0, 'Tariff sheet: meals free to students'
  union all select null, 'lunch', null, 'student', 0, 'Tariff sheet: meals free to students'
  union all select null, 'dinner', null, 'student', 0, 'Tariff sheet: meals free to students'
  union all select null, 'breakfast', 'alumni', null, 0, 'Tariff sheet: meals free to alumni'
  union all select null, 'lunch', 'alumni', null, 0, 'Tariff sheet: meals free to alumni'
  union all select null, 'dinner', 'alumni', null, 0, 'Tariff sheet: meals free to alumni'
) s
where (s.item <> 'room' or s.gh is not null)
  and not exists (
    select 1 from public.tariffs t
    where t.guest_house_id is not distinct from s.gh
      and t.item = s.item
      and t.room_type is null
      and t.booking_type is not distinct from s.booking_type
      and t.requester_role is not distinct from s.requester_role
      and t.effective_from = date '2024-01-01'
  );

-- ---------------------------------------------------------------- invoices

create table if not exists public.invoice_counters (
  fy       text primary key check (fy ~ '^\d{4}-\d{2}$'),
  last_seq integer not null check (last_seq >= 0)
);

comment on table public.invoice_counters is
  'The running invoice number per financial year. Only issue_invoice() touches it, under the row lock its upsert takes.';

create table if not exists public.invoices (
  id                  uuid primary key default gen_random_uuid(),
  booking_id          uuid not null references public.bookings (id) on delete restrict,
  status              text not null default 'draft'
                        check (status in ('draft', 'issued', 'paid', 'cancelled')),
  invoice_number      text unique,
  fy                  text,
  seq                 integer,
  document            jsonb not null default '{}'::jsonb,
  meal_counts         jsonb,
  debit_head          text,
  project_number      text,
  subtotal_rooms      numeric(12, 2) not null default 0,
  subtotal_dining     numeric(12, 2) not null default 0,
  total               numeric(12, 2) not null default 0,
  gst_percent         numeric(5, 2) not null default 0,
  gst_amount          numeric(12, 2) not null default 0,
  grand_total         numeric(12, 2) not null default 0,
  payment_mode        text check (payment_mode in ('cash', 'upi', 'account_transfer')),
  payment_reference   text,
  paid_at             timestamptz,
  paid_by             uuid references public.profiles (id) on delete set null,
  issued_at           timestamptz,
  issued_by           uuid references public.profiles (id) on delete set null,
  cancelled_at        timestamptz,
  cancelled_by        uuid references public.profiles (id) on delete set null,
  cancel_reason       text,
  replaces_invoice_id uuid references public.invoices (id) on delete restrict,
  created_by          uuid references public.profiles (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint invoices_serial_unique unique (fy, seq),
  constraint invoices_issued_is_numbered
    check (status = 'draft' or (invoice_number is not null and issued_at is not null and fy is not null and seq is not null)),
  constraint invoices_paid_has_payment
    check (status <> 'paid' or (payment_mode is not null and paid_at is not null)),
  constraint invoices_transfer_has_reference
    check (payment_mode is null or payment_mode = 'cash' or length(btrim(coalesce(payment_reference, ''))) > 0),
  constraint invoices_cancel_has_reason
    check (status <> 'cancelled' or (cancelled_at is not null and length(btrim(coalesce(cancel_reason, ''))) > 0))
);

-- One live invoice per booking; cancelled ones stay as history beside it.
create unique index if not exists invoices_one_live_per_booking
  on public.invoices (booking_id) where status <> 'cancelled';
create index if not exists invoices_issued_at on public.invoices (issued_at);
create index if not exists invoices_paid_at on public.invoices (paid_at);

comment on table public.invoices is
  'Guest house invoices (Phase 5). document is the snapshot of every printed field; issued invoices are immutable apart from payment and cancellation (invoices_guard).';

-- Issued invoices are immutable. From `issued` only the payment may be
-- recorded (→ paid) or the invoice cancelled; from `paid` only cancelled;
-- a cancelled invoice never changes. Only drafts may be deleted.
create or replace function public.invoices_guard()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_mutable text[];
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then
      raise exception 'INVOICE_IMMUTABLE|Invoice % has been issued and cannot be deleted — cancel it with a reason instead.', old.invoice_number
        using errcode = 'P0001';
    end if;
    return old;
  end if;

  if old.status = 'draft' then
    return new;
  end if;

  if old.status = 'cancelled' then
    raise exception 'INVOICE_IMMUTABLE|Invoice % is cancelled and cannot change.', old.invoice_number
      using errcode = 'P0001';
  end if;

  if old.status = 'issued' and new.status = 'paid' then
    v_mutable := array['status', 'payment_mode', 'payment_reference', 'paid_at', 'paid_by', 'updated_at'];
  elsif old.status in ('issued', 'paid') and new.status = 'cancelled' then
    v_mutable := array['status', 'cancelled_at', 'cancelled_by', 'cancel_reason', 'updated_at'];
  elsif new.status = old.status then
    v_mutable := array['updated_at'];
  else
    raise exception 'INVOICE_IMMUTABLE|Invoice % cannot go from % to %.', old.invoice_number, old.status, new.status
      using errcode = 'P0001';
  end if;

  if (to_jsonb(new) - v_mutable) is distinct from (to_jsonb(old) - v_mutable) then
    raise exception 'INVOICE_IMMUTABLE|Invoice % has been issued; its contents cannot change. Cancel it and issue a new one.', old.invoice_number
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists invoices_guard on public.invoices;
create trigger invoices_guard
  before update or delete on public.invoices
  for each row execute function public.invoices_guard();

-- Issue the booking's invoice: take the next number of the financial year
-- and write the snapshot, in one transaction. The draft (saved meal
-- corrections) is promoted when there is one. Refuses when the booking
-- already has a live issued invoice.
create or replace function public.issue_invoice(
  p_booking_id uuid,
  p_fy text,
  p_prefix text,
  p_digits integer,
  p_document jsonb,
  p_meal_counts jsonb,
  p_issued_by uuid,
  p_replaces uuid default null
)
returns public.invoices
language plpgsql
security definer
set search_path = public
as $$
declare
  v_live   public.invoices;
  v_seq    integer;
  v_number text;
  v_doc    jsonb;
  v_row    public.invoices;
begin
  select * into v_live from public.invoices
   where booking_id = p_booking_id and status <> 'cancelled'
   for update;
  if found and v_live.status <> 'draft' then
    raise exception 'INVOICE_EXISTS|This booking already has invoice % — cancel it first to issue a corrected one.', v_live.invoice_number
      using errcode = 'P0001';
  end if;

  insert into public.invoice_counters (fy, last_seq) values (p_fy, 1)
  on conflict (fy) do update set last_seq = public.invoice_counters.last_seq + 1
  returning last_seq into v_seq;

  v_number := p_prefix || '/' || p_fy || '/' || lpad(v_seq::text, greatest(p_digits, length(v_seq::text)), '0');
  v_doc := jsonb_set(p_document, '{invoice_number}', to_jsonb(v_number));

  if v_live.id is not null then
    update public.invoices set
      status = 'issued', invoice_number = v_number, fy = p_fy, seq = v_seq,
      document = v_doc, meal_counts = p_meal_counts,
      debit_head = v_doc->>'debit_head', project_number = v_doc->>'project_number',
      subtotal_rooms = (v_doc->>'subtotal_rooms')::numeric / 100,
      subtotal_dining = (v_doc->>'subtotal_dining')::numeric / 100,
      total = (v_doc->>'total')::numeric / 100,
      gst_percent = (v_doc->>'gst_percent')::numeric,
      gst_amount = (v_doc->>'gst')::numeric / 100,
      grand_total = (v_doc->>'grand_total')::numeric / 100,
      issued_at = (v_doc->>'invoice_date')::timestamptz, issued_by = p_issued_by,
      replaces_invoice_id = p_replaces, updated_at = now()
    where id = v_live.id
    returning * into v_row;
  else
    insert into public.invoices (
      booking_id, status, invoice_number, fy, seq, document, meal_counts,
      debit_head, project_number, subtotal_rooms, subtotal_dining, total,
      gst_percent, gst_amount, grand_total, issued_at, issued_by,
      replaces_invoice_id, created_by)
    values (
      p_booking_id, 'issued', v_number, p_fy, v_seq, v_doc, p_meal_counts,
      v_doc->>'debit_head', v_doc->>'project_number',
      (v_doc->>'subtotal_rooms')::numeric / 100, (v_doc->>'subtotal_dining')::numeric / 100,
      (v_doc->>'total')::numeric / 100, (v_doc->>'gst_percent')::numeric,
      (v_doc->>'gst')::numeric / 100, (v_doc->>'grand_total')::numeric / 100,
      (v_doc->>'invoice_date')::timestamptz, p_issued_by, p_replaces, p_issued_by)
    returning * into v_row;
  end if;
  return v_row;
end;
$$;

revoke all on function public.issue_invoice(uuid, text, text, integer, jsonb, jsonb, uuid, uuid) from public;
revoke all on function public.issue_invoice(uuid, text, text, integer, jsonb, jsonb, uuid, uuid) from anon, authenticated;
grant execute on function public.issue_invoice(uuid, text, text, integer, jsonb, jsonb, uuid, uuid) to service_role;

-- ---------------------------------------------------------------- outbox

alter table public.email_outbox
  add column if not exists attachments jsonb not null default '[]'::jsonb;

comment on column public.email_outbox.attachments is
  'What to attach when sending, as references — e.g. [{"kind":"invoice","invoice_id":"…"}]. The dispatcher renders them at send time; no file is stored here.';

-- ---------------------------------------------------------------- access

alter table public.tariffs enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_counters enable row level security;

-- Explicit rather than left to Supabase's default privileges, so the
-- policies below are the whole story: signed-in users may only read, and
-- only what the policies admit; writes go through the server.
revoke all on public.tariffs, public.invoices, public.invoice_counters from anon, authenticated;
grant select on public.tariffs, public.invoices to authenticated;
grant all on public.tariffs, public.invoices, public.invoice_counters to service_role;

drop policy if exists "tariffs are readable" on public.tariffs;
create policy "tariffs are readable"
  on public.tariffs for select to authenticated using (true);

drop policy if exists "service role manages tariffs" on public.tariffs;
create policy "service role manages tariffs"
  on public.tariffs for all to service_role using (true) with check (true);

-- The desk reads every invoice; a requester reads the issued invoices of
-- their own bookings (never a draft).
drop policy if exists "invoices are readable by the desk and the requester" on public.invoices;
create policy "invoices are readable by the desk and the requester"
  on public.invoices for select to authenticated using (
    public.my_role() in ('gh_manager', 'gh_caretaker', 'developer')
    or (status <> 'draft' and exists (
      select 1 from public.bookings b where b.id = booking_id and b.user_id = auth.uid()))
  );

drop policy if exists "service role manages invoices" on public.invoices;
create policy "service role manages invoices"
  on public.invoices for all to service_role using (true) with check (true);

drop policy if exists "service role manages invoice counters" on public.invoice_counters;
create policy "service role manages invoice counters"
  on public.invoice_counters for all to service_role using (true) with check (true);
