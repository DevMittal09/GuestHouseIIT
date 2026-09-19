-- Migration 11: room-scoped guests, citizenship, meals as a service, and the
-- policies that came with them (Sep 2026).
--
-- The guest house office asked for several things at once, and they turn out
-- to be one change: the booking form stopped being "a stay with a list of
-- people attached" and became "a set of rooms, each with the people in it".
--
--  1. Citizenship, nationality and passport number are asked **per guest**.
--     A room can hold an Indian host and a foreign collaborator, and the
--     register the guest house keeps for foreign nationals needs the passport
--     of whichever of them needs one. A booking-level answer could not say.
--
--  2. The infant threshold drops from under-10 to under-5, and infants get
--     their rows back (migration 7 had reduced them to one boolean). The row
--     is needed again because the occupancy rule is now per room: "3 guests
--     + 1 infant" cannot be checked against a flag. Infants are classified
--     from the age typed in, never from a category the requester picks.
--
--  3. Rooms are entered as cards — Room 1, Room 2 — with the guests inside
--     them, so `booking_rooms` holds what used to be just a count, and
--     `booking_guests` hangs off a room rather than off the booking.
--
--  4. Meals become a thing you can book *instead of* a room, not only
--     alongside one, so bookings carry a service type. A meals-only booking
--     has no rooms and no guest rows — the kitchen wants a head count, not a
--     register — so it carries `meal_guest_count` instead.
--
--  5. Every requester must acknowledge that pets are not allowed, and that
--     acknowledgement is stored: the guest house has no kennels, and a guest
--     who arrives with an animal has to be turned away at the desk.
--
--  6. The Guest House Manager books on other people's behalf, so a booking
--     records who submitted it separately from whose stay it is.
--
-- **Existing bookings are not reclassified.** Every one is migrated into a
-- single synthetic room holding all its guests, with its infant flags left
-- exactly as they were — a guest recorded as an infant under the under-10
-- rule stays one, because their stay was agreed on that basis. Those
-- synthetic rooms are marked `is_legacy` and the occupancy trigger skips
-- them, so a five-guest booking from last month does not become invalid.
--
-- Apply after migration 10. Safe to re-run.

-- ---------------------------------------------------------------- enums

do $$
begin
  if not exists (select 1 from pg_type where typname = 'citizenship') then
    create type public.citizenship as enum ('indian', 'other');
  end if;
  if not exists (select 1 from pg_type where typname = 'service_type') then
    create type public.service_type as enum ('room', 'room_meals', 'meals_only');
  end if;
  if not exists (select 1 from pg_type where typname = 'meal_preference') then
    create type public.meal_preference as enum ('veg', 'non_veg');
  end if;
end $$;

-- ---------------------------------------------------------------- bookings

alter table public.bookings
  add column if not exists service_type public.service_type not null default 'room',
  add column if not exists meal_preference public.meal_preference,
  add column if not exists meal_guest_count integer,
  add column if not exists pets_policy_acknowledged boolean not null default false,
  add column if not exists pets_policy_acknowledged_at timestamptz,
  add column if not exists has_foreign_national boolean not null default false,
  add column if not exists created_by uuid references public.profiles (id),
  add column if not exists on_behalf_of_name text,
  add column if not exists on_behalf_of_email text,
  add column if not exists on_behalf_of_phone text;

-- A booking that already had meals was a room-and-meals booking; everything
-- else was a room. Nothing existing was meals-only — there was no way to make
-- one. Only touches rows still at the column default, so re-running is safe.
update public.bookings
set service_type = 'room_meals'
where service_type = 'room'
  and jsonb_typeof(meals) = 'array'
  and jsonb_array_length(meals) > 0;

-- A meals-only booking holds no rooms, so the original "between 1 and 10"
-- has to admit zero. The pairing is pinned instead: rooms exactly when the
-- service type has them.
-- The original was an inline, auto-named `check (rooms_requested between 1
-- and 10)`. Dropping it by its expected name would silently do nothing if
-- this database named it something else, and the migration would then fail on
-- the first meals-only booking rather than here — so find it by what it says.
do $$
declare
  name text;
begin
  for name in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace ns on ns.oid = rel.relnamespace
    where ns.nspname = 'public'
      and rel.relname = 'bookings'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) like '%rooms_requested%'
  loop
    execute format('alter table public.bookings drop constraint %I', name);
  end loop;
end $$;

alter table public.bookings
  add constraint bookings_rooms_for_service check (
    case
      when service_type = 'meals_only' then rooms_requested = 0
      else rooms_requested between 1 and 10
    end
  );

alter table public.bookings drop constraint if exists bookings_meal_guest_count;
alter table public.bookings
  add constraint bookings_meal_guest_count check (
    case
      when service_type = 'meals_only' then meal_guest_count between 1 and 100
      else meal_guest_count is null
    end
  );

comment on column public.bookings.service_type is
  'What is being booked: a room, a room with meals, or meals with no room. Distinct from booking_type, which says *why* the stay was booked. Meals-only skips the room approval chain — see initialStatusFor in lib/workflow.ts.';
comment on column public.bookings.meal_preference is
  'Veg / non-veg for the whole party, null when no meals were asked for. The kitchen cooks to a head count per type, not per person.';
comment on column public.bookings.meal_guest_count is
  'Head count for a meals-only booking, which has no guest rows. Null on every other kind.';
comment on column public.bookings.pets_policy_acknowledged is
  'Whether the requester confirmed that pets are not allowed. True on every booking made after migration 11; false means the question was never put to them.';
comment on column public.bookings.has_foreign_national is
  'Whether any guest is a foreign national. Derived from booking_guests on write so the desk can find these bookings without opening each one.';
comment on column public.bookings.created_by is
  'Who submitted the booking when that is not the requester — the manager booking on someone''s behalf. Null when the requester raised it themselves.';
comment on column public.bookings.on_behalf_of_name is
  'The guest a manager booked for when that person has no portal account. The booking still hangs off the manager''s user_id for referential integrity.';

-- ---------------------------------------------------------------- booking_rooms

create table if not exists public.booking_rooms (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete cascade,
  -- 1-based, and it is what the requester saw: "Room 2" is room_index 2.
  room_index integer not null check (room_index >= 1),
  -- The requester's preference. Null means they had none.
  room_type public.room_type,
  -- Which physical room the manager gave this card. `room_holds` stays the
  -- authority on whether a room is held and for when — this records which
  -- card it was held for, so the desk knows which party is in which room.
  assigned_room_id uuid references public.rooms (id) on delete set null,
  -- A room synthesised by this migration from a pre-migration-11 booking.
  -- Those hold however many guests the booking had, which may exceed the
  -- per-room limit, so the occupancy trigger below leaves them alone.
  is_legacy boolean not null default false,
  unique (booking_id, room_index)
);

-- Lets booking_guests reference (booking_room_id, booking_id) together, so a
-- guest cannot be attached to a room belonging to a different booking.
create unique index if not exists booking_rooms_id_booking_idx
  on public.booking_rooms (id, booking_id);

create index if not exists booking_rooms_booking_idx
  on public.booking_rooms (booking_id);
create index if not exists booking_rooms_assigned_idx
  on public.booking_rooms (assigned_room_id);

comment on table public.booking_rooms is
  'One row per room card on the booking form. Guests are entered inside a card because the occupancy rule is per room; a flat guest list cannot say who shares with whom.';

-- ---------------------------------------------------------------- booking_guests

alter table public.booking_guests
  add column if not exists booking_room_id uuid,
  add column if not exists citizenship public.citizenship not null default 'indian',
  add column if not exists nationality text,
  add column if not exists passport_number text;

-- Migration 4 added this; migration 7 stopped writing it. It is written again
-- from migration 11 on, derived from the age rather than asked for.
alter table public.booking_guests
  add column if not exists is_infant boolean not null default false;

-- ---------------------------------------------------------------- backfill

-- One synthetic room per existing booking that has none, holding everything
-- that booking already had. Room-less bookings (there are none today, but a
-- meals-only booking is one) are skipped.
insert into public.booking_rooms (booking_id, room_index, room_type, is_legacy)
select b.id, 1, null, true
from public.bookings b
where b.service_type <> 'meals_only'
  and not exists (select 1 from public.booking_rooms r where r.booking_id = b.id);

update public.booking_guests g
set booking_room_id = r.id
from public.booking_rooms r
where r.booking_id = g.booking_id
  and r.room_index = 1
  and g.booking_room_id is null;

-- A booking migrated into one room requested one room, whatever the old count
-- said. Keeping the old number would leave `rooms_requested` disagreeing with
-- the rows, and the rows are now the answer.
update public.bookings b
set rooms_requested = coalesce(
  (select count(*) from public.booking_rooms r where r.booking_id = b.id), 0
)
where b.service_type <> 'meals_only'
  and b.rooms_requested <> (
    select count(*) from public.booking_rooms r where r.booking_id = b.id
  );

-- Every existing guest was recorded as an Indian citizen, because that is the
-- only thing the old form could express.
update public.booking_guests
set citizenship = 'indian'
where citizenship is null;

-- Now that every guest has a room, pin the relationship. The composite
-- reference is what stops a guest pointing at another booking's room.
alter table public.booking_guests drop constraint if exists booking_guests_room_fk;
alter table public.booking_guests
  add constraint booking_guests_room_fk
    foreign key (booking_room_id, booking_id)
    references public.booking_rooms (id, booking_id)
    on delete cascade;

create index if not exists booking_guests_room_idx
  on public.booking_guests (booking_room_id);

-- A foreign national has both a nationality and a passport number; an Indian
-- citizen has neither. This is the same rule the booking schema applies, kept
-- here so a write that bypasses the app cannot store half of it.
alter table public.booking_guests drop constraint if exists booking_guests_citizenship;
alter table public.booking_guests
  add constraint booking_guests_citizenship check (
    case citizenship
      when 'other' then
        nationality is not null and length(btrim(nationality)) > 0
        and passport_number is not null and length(btrim(passport_number)) > 0
      else nationality is null and passport_number is null
    end
  );

-- Migration 7 set this comment when the threshold was under-10 and the flag
-- was the *only* record of an infant. Both of those have changed.
comment on column public.bookings.has_infant is
  'Whether any infant is on the booking. Derived from the guest rows on write, and kept as a column so a list of bookings can show it without loading every guest. Infants are rows again from migration 11; between migrations 7 and 11 this was the only record of one.';

comment on column public.booking_guests.booking_room_id is
  'The room card this guest was entered in. Bookings made before migration 11 were migrated into a single synthetic room.';
comment on column public.booking_guests.is_infant is
  'Derived from age on write (under 5 from migration 11, under 10 before it). Stored, not generated: re-deriving would reclassify guests whose stay was agreed under the old threshold.';
comment on column public.booking_guests.citizenship is
  'Asked per guest — one room can mix Indian and foreign nationals.';
comment on column public.booking_guests.nationality is
  'ISO 3166-1 alpha-2 country code. Set only when citizenship = ''other''. Codes, not names: names get re-spelled.';

-- ---------------------------------------------------------------- infant rule

-- Classify from the age, so the form and the desk cannot disagree about who
-- is an infant. Legacy rooms are left alone: their flags were set under the
-- under-10 rule and re-deriving them would turn a 7-year-old who was booked
-- as an infant into a guest needing a bed the room was never allocated for.
create or replace function public.derive_is_infant()
returns trigger language plpgsql as $$
declare
  legacy boolean;
begin
  select r.is_legacy into legacy
  from public.booking_rooms r
  where r.id = new.booking_room_id;

  if coalesce(legacy, false) then
    return new;
  end if;

  new.is_infant := new.age is not null and new.age < 5;
  return new;
end $$;

drop trigger if exists booking_guests_derive_infant on public.booking_guests;
create trigger booking_guests_derive_infant
  before insert or update of age, booking_room_id on public.booking_guests
  for each row execute function public.derive_is_infant();

-- ---------------------------------------------------------------- occupancy rule

-- Maximum 3 guests + 1 infant per room, enforced where it cannot be argued
-- with. The form disables its Add buttons and the booking schema refuses the
-- submission; this refuses the row.
create or replace function public.check_room_occupancy()
returns trigger language plpgsql as $$
declare
  room_id uuid := coalesce(new.booking_room_id, old.booking_room_id);
  legacy boolean;
  guests integer;
  infants integer;
begin
  if room_id is null then
    return null;
  end if;

  select r.is_legacy into legacy from public.booking_rooms r where r.id = room_id;
  if coalesce(legacy, false) then
    return null;
  end if;

  select
    count(*) filter (where not g.is_infant),
    count(*) filter (where g.is_infant)
  into guests, infants
  from public.booking_guests g
  where g.booking_room_id = room_id;

  if guests > 3 then
    raise exception 'A room takes at most 3 guests (this one has %)', guests
      using errcode = 'check_violation';
  end if;
  if infants > 1 then
    raise exception 'A room takes at most 1 infant (this one has %)', infants
      using errcode = 'check_violation';
  end if;
  return null;
end $$;

drop trigger if exists booking_guests_room_occupancy on public.booking_guests;
create trigger booking_guests_room_occupancy
  after insert or update on public.booking_guests
  for each row execute function public.check_room_occupancy();

-- ---------------------------------------------------------------- meals view

-- Part of the same request as `bookings.meals`: the kitchen wants "what is
-- being served on the 18th", which the per-booking jsonb cannot answer without
-- every caller re-implementing the unnesting.
--
-- Deliberately a **view, not a table**. `bookings.meals` is already the
-- per-day record (migration 8) and is written, read and validated as one
-- answer to one question; a second copy in a table would be a second source of
-- truth to keep in step, and the first time they disagreed the kitchen would
-- cook to the wrong one. The view gives the relational shape — one row per
-- (booking, date, meal) — with no such risk.
-- `security_invoker` so the view obeys the caller's row-level security on
-- `bookings`. Without it a view runs as its owner, and this one would hand
-- every authenticated user every booking's meals.
create or replace view public.booking_meals
with (security_invoker = true) as
select
  b.id as booking_id,
  b.guest_house_id,
  b.status,
  b.meal_preference,
  (day ->> 'date')::date as meal_date,
  meal.meal_type,
  case
    when b.service_type = 'meals_only' then coalesce(b.meal_guest_count, 0)
    else (select count(*) from public.booking_guests g
          where g.booking_id = b.id and not g.is_infant)
  end as guest_count
from public.bookings b
cross join lateral jsonb_array_elements(b.meals) as day
cross join lateral (values ('breakfast'), ('lunch'), ('dinner')) as meal(meal_type)
where jsonb_typeof(b.meals) = 'array'
  and (day ->> meal.meal_type)::boolean;

comment on view public.booking_meals is
  'One row per booking, date and meal actually asked for — the relational read over bookings.meals. A view, not a table: bookings.meals is the single source of truth and a copy would be one more thing to keep in step.';

-- ---------------------------------------------------------------- RLS

alter table public.booking_rooms enable row level security;

drop policy if exists "rooms follow their booking" on public.booking_rooms;
create policy "rooms follow their booking"
  on public.booking_rooms for select to authenticated
  using (exists (select 1 from public.bookings b
                 where b.id = booking_id and public.can_access_booking(b)));

drop policy if exists "rooms insert with own booking" on public.booking_rooms;
create policy "rooms insert with own booking"
  on public.booking_rooms for insert to authenticated
  with check (exists (select 1 from public.bookings b
                      where b.id = booking_id and b.user_id = auth.uid()));

-- The manager allocates rooms, so they update these rows; the developer
-- console manages everything.
drop policy if exists "manager and developer manage booking rooms" on public.booking_rooms;
create policy "manager and developer manage booking rooms"
  on public.booking_rooms for all to authenticated
  using (public.my_role() in ('gh_manager', 'developer'))
  with check (public.my_role() in ('gh_manager', 'developer'));

-- The manager books on other people's behalf, which means inserting a booking
-- whose `user_id` is not their own. The original insert policy allowed only
-- `user_id = auth.uid()`, so this is the exception that makes Part 6 possible.
drop policy if exists "manager creates bookings for others" on public.bookings;
create policy "manager creates bookings for others"
  on public.bookings for insert to authenticated
  with check (public.my_role() = 'gh_manager' and created_by = auth.uid());

drop policy if exists "manager manages bookings" on public.bookings;
create policy "manager manages bookings"
  on public.bookings for all to authenticated
  using (public.my_role() = 'gh_manager')
  with check (public.my_role() = 'gh_manager');

drop policy if exists "manager manages booking guests" on public.booking_guests;
create policy "manager manages booking guests"
  on public.booking_guests for all to authenticated
  using (public.my_role() = 'gh_manager')
  with check (public.my_role() = 'gh_manager');

drop policy if exists "developer manages booking rooms" on public.booking_rooms;
create policy "developer manages booking rooms"
  on public.booking_rooms for all to authenticated
  using (public.my_role() = 'developer') with check (public.my_role() = 'developer');

-- ---------------------------------------------------------------- notes
--
-- `booking_type` keeps its 'official' value even though the IAR Student Cell
-- can no longer choose it (Part 10). Bookings that used it are still readable
-- and still say what they said; dropping an enum value would orphan them.
