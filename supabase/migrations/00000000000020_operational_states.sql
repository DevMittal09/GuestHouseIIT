-- Migration 20: operational states (Phase 7, Sep 2026).
--
-- What happens to a stay after it is allocated, beyond check-in and check-out:
--
--   * `room_blocks` — a room out of service for maintenance over a period,
--     with no booking. A block and a stay may never overlap on the same room.
--     `room_holds` keeps its exclusion constraint as the only check between
--     stays; a block is checked against the holds' `guard` (the stay plus the
--     turnaround buffer) by triggers on BOTH tables, each of which first locks
--     the room's row, so a block and an allocation racing for the same room
--     are serialised and the second one is refused (`ROOM_BLOCKED|…`).
--   * `bookings.extension_requested_until` / `extension_reason` /
--     `extension_requested_at` — a requester asks to stay longer; the manager
--     approves (the stay's holds move through `set_room_holds`, so a clash is
--     refused exactly as for any other change) or declines. Null when nothing
--     is asked.
--   * `bookings.no_show_released_at` — the stay was released because the guest
--     never arrived: by the manager, or automatically N hours after the booked
--     check-in (Setting `rules.booking.no_show_release_hours`, 0 = off). The
--     booking is cancelled and its rooms freed; this column is what tells a
--     no-show apart from an ordinary cancellation in reports.
--
-- Early check-out needs nothing new: marking a stay Vacated deletes its holds,
-- so the room is free from that moment; the actual time is the log entry.
--
-- Apply after migration 19. Safe to re-run.

-- ---------------------------------------------------------------- blocks

create table if not exists public.room_blocks (
  id         uuid primary key default gen_random_uuid(),
  room_id    uuid not null references public.rooms (id) on delete cascade,
  during     tstzrange not null check (not isempty(during) and lower(during) is not null and upper(during) is not null),
  reason     text not null check (length(btrim(reason)) between 3 and 300),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint room_blocks_no_overlap exclude using gist (room_id with =, during with &&)
);

create index if not exists room_blocks_room_idx on public.room_blocks (room_id);

comment on table public.room_blocks is
  'Rooms out of service for maintenance (Phase 7). Never overlaps a stay''s guard on the same room: room_blocks_respect_holds and room_holds_respect_blocks check both ways under a lock on the room row.';

-- A block may not cover a room someone is (or will be) staying in.
create or replace function public.room_blocks_respect_holds()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_ref text;
  v_room text;
begin
  -- Serialise with allocations of the same room.
  perform 1 from public.rooms where id = new.room_id for update;
  select b.booking_reference_id into v_ref
    from public.room_holds h join public.bookings b on b.id = h.booking_id
   where h.room_id = new.room_id and h.guard && new.during
   limit 1;
  if v_ref is not null then
    select room_number into v_room from public.rooms where id = new.room_id;
    raise exception 'ROOM_BLOCKED|Room % is held for % during that time — move that stay first, or block a different period.', v_room, v_ref
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists room_blocks_respect_holds on public.room_blocks;
create trigger room_blocks_respect_holds
  before insert or update on public.room_blocks
  for each row execute function public.room_blocks_respect_holds();

-- A stay may not be put in a room that is blocked. Named to fire after
-- `room_holds_guard` (triggers run in name order), so `guard` is set.
create or replace function public.room_holds_respect_blocks()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_reason text;
  v_room text;
begin
  perform 1 from public.rooms where id = new.room_id for update;
  select reason into v_reason
    from public.room_blocks
   where room_id = new.room_id and during && new.guard
   limit 1;
  if v_reason is not null then
    select room_number into v_room from public.rooms where id = new.room_id;
    raise exception 'ROOM_BLOCKED|Room % is out of service for maintenance then (%).', v_room, v_reason
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists room_holds_respect_blocks on public.room_holds;
create trigger room_holds_respect_blocks
  before insert or update on public.room_holds
  for each row execute function public.room_holds_respect_blocks();

-- ---------------------------------------------------------------- bookings

alter table public.bookings
  add column if not exists extension_requested_until timestamptz,
  add column if not exists extension_reason text,
  add column if not exists extension_requested_at timestamptz,
  add column if not exists no_show_released_at timestamptz;

comment on column public.bookings.extension_requested_until is
  'A requester''s request to stay until this time (Phase 7), awaiting the manager. Null when nothing is asked.';
comment on column public.bookings.no_show_released_at is
  'When the stay was released because the guest never arrived (Phase 7) — by the manager or automatically. The booking is CANCELLED and its rooms freed.';

-- ---------------------------------------------------------------- access

alter table public.room_blocks enable row level security;
revoke all on public.room_blocks from anon, authenticated;
grant select on public.room_blocks to authenticated;
grant all on public.room_blocks to service_role;

drop policy if exists "room blocks are readable" on public.room_blocks;
create policy "room blocks are readable"
  on public.room_blocks for select to authenticated using (true);

drop policy if exists "service role manages room blocks" on public.room_blocks;
create policy "service role manages room blocks"
  on public.room_blocks for all to service_role using (true) with check (true);
