-- Migration 16: Settings — the rules the console can change — and the
-- security audit log (Sep 2026).
--
-- Rules that were constants in `lib/` become data the developer console
-- edits: the official whitelist, hostels, which offices are officer offices,
-- room capacity, the advance-booking window, the longest stay and the meal
-- serving times. Defaults are what the code did before, so applying this
-- changes no behaviour until someone saves a setting.
--
-- Where the data lives:
--
--   * **Scalar rules** are one jsonb row each in `app_settings`, keyed
--     `rules.<group>` (`rules.capacity`, `rules.booking`, `rules.meals`). No
--     rows are written here: a missing row means "the defaults in
--     lib/settings.ts", and the app merges a saved row over them so a row saved
--     before a field existed still reads.
--   * **Lists** get tables: `hostels` and `official_email_whitelist`.
--     Departments, clubs and offices were already `units` (migration 15);
--     this adds whether an office is an *officer* office (Director, Registrar)
--     or a *department* office, which decides its debitable head (Phase 4).
--
-- The database enforces what it can itself:
--
--   * `profiles.hostel_name` now references `hostels(name)` — `on update
--     cascade`, so renaming a hostel follows through to every account in it,
--     and `on delete restrict`, so a hostel someone still lives in cannot be
--     removed. Existing values are trimmed and seeded into `hostels` first, so
--     nothing already stored is refused.
--   * The per-room occupancy trigger from migration 11 reads its limits from
--     `rules.capacity` instead of a hardcoded 3 + 1, so the console and the
--     database cannot disagree.
--
-- And a **security audit log**, append-only, which every settings change
-- writes to from the first commit that can change a setting. The rest of the
-- events (sign-ins, role changes, document views, exports, invoices, 2FA) use
-- the same table.
--
-- Apply after migration 15. Safe to re-run.

-- ---------------------------------------------------------------- hostels

create table if not exists public.hostels (
  name       text primary key check (length(btrim(name)) between 1 and 60 and name = btrim(name)),
  created_at timestamptz not null default now()
);

comment on table public.hostels is
  'Hostels, as wardens are scoped by and students are assigned to. Edited in the developer console (Settings). profiles.hostel_name references it, so renaming cascades and a hostel still in use cannot be deleted.';

-- Tidy what is stored before it is made a reference: a trailing space would
-- otherwise become a hostel of its own.
update public.profiles
set hostel_name = nullif(btrim(hostel_name), '')
where hostel_name is distinct from nullif(btrim(hostel_name), '');

insert into public.hostels (name)
select distinct hostel_name
from public.profiles
where hostel_name is not null
on conflict (name) do nothing;

alter table public.profiles drop constraint if exists profiles_hostel_fk;
alter table public.profiles
  add constraint profiles_hostel_fk
  foreign key (hostel_name) references public.hostels (name)
  on update cascade on delete restrict;

-- ------------------------------------------------------ official whitelist

create table if not exists public.official_email_whitelist (
  email      text primary key check (email = lower(btrim(email)) and email like '_%@_%'),
  created_at timestamptz not null default now()
);

comment on table public.official_email_whitelist is
  'Accounts allowed to submit Official / Dignitary bookings. Moved out of lib/routes.ts; edited in the developer console (Settings).';

-- Seeded once, with the addresses that were hardcoded. Only into an empty
-- table: re-running this must not bring back an address the office removed.
insert into public.official_email_whitelist (email)
select e
from unnest(array[
  'admin@iitpkd.ac.in',
  'director.office@iitpkd.ac.in',
  'registrar@iitpkd.ac.in'
]) as e
where not exists (select 1 from public.official_email_whitelist);

-- ------------------------------------------------------------ office class

alter table public.units
  add column if not exists office_class text;

alter table public.units drop constraint if exists units_office_class_check;
alter table public.units
  add constraint units_office_class_check
  check (
    office_class is null
    or (kind = 'office' and office_class in ('officer', 'department'))
  );

comment on column public.units.office_class is
  'For offices only: ''officer'' (Director, Registrar, Deans — debited to the Institute Grant) or ''department'' (a department''s office — debited to the Department). Null for every other kind of unit.';

-- ------------------------------------------------------- occupancy from rules

-- A whole number from a `rules.*` row, or the default when the row, the path
-- or a sane value is missing. Never throws: a malformed setting must not stop
-- guests being written — the app validates what it saves.
create or replace function public.rule_int(p_key text, p_path text[], p_default integer)
returns integer
language sql
stable
set search_path = public
as $$
  select coalesce(
    (
      select (s.value #>> p_path)::integer
      from public.app_settings s
      where s.key = p_key
        and jsonb_typeof(s.value) = 'object'
        and (s.value #>> p_path) ~ '^\d{1,4}$'
    ),
    p_default
  )
$$;

comment on function public.rule_int(text, text[], integer) is
  'Reads an integer setting from app_settings (lib/settings.ts), falling back to the default. Used by triggers that enforce a rule the console can change.';

create or replace function public.check_room_occupancy()
returns trigger language plpgsql as $$
declare
  room_id uuid := coalesce(new.booking_room_id, old.booking_room_id);
  legacy boolean;
  guests integer;
  infants integer;
  max_guests integer := public.rule_int('rules.capacity', array['max_guests_per_room'], 3);
  max_infants integer := public.rule_int('rules.capacity', array['max_infants_per_room'], 1);
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

  if guests > max_guests then
    raise exception 'A room takes at most % guests (this one has %)', max_guests, guests
      using errcode = 'check_violation';
  end if;
  if infants > max_infants then
    raise exception 'A room takes at most % infant(s) (this one has %)', max_infants, infants
      using errcode = 'check_violation';
  end if;
  return null;
end $$;

-- ---------------------------------------------------------------- audit log

create table if not exists public.security_audit (
  id          bigint generated always as identity primary key,
  at          timestamptz not null default now(),
  actor_id    uuid references public.profiles (id) on delete set null,
  -- Denormalised like booking_logs.action_by_name, so the log still names the
  -- person after their account is deleted.
  actor_name  text not null,
  actor_role  text,
  event       text not null,
  target      text,
  details     jsonb not null default '{}'::jsonb,
  ip          text,
  user_agent  text
);

comment on table public.security_audit is
  'Append-only security audit log: sign-ins, role and settings changes, document views, exports, invoices, overrides, 2FA. Rows cannot be updated, and can be deleted only once older than 180 days (CERT-In) through purge_security_audit().';

create index if not exists security_audit_at_idx on public.security_audit (at desc);
create index if not exists security_audit_event_idx on public.security_audit (event, at desc);
create index if not exists security_audit_actor_idx on public.security_audit (actor_id, at desc);

-- Append-only, enforced by the database rather than by remembering not to.
-- An update is always refused. A delete is refused unless it comes through
-- purge_security_audit(), which sets a transaction-local flag, and even then
-- only for rows older than the 180 days CERT-In requires to be kept.
create or replace function public.security_audit_guard()
returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' then
    raise exception 'security_audit is append-only' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(current_setting('app.audit_purge', true), '') <> 'on' then
    raise exception 'security_audit rows are removed only by purge_security_audit()'
      using errcode = 'insufficient_privilege';
  end if;
  if old.at > now() - interval '180 days' then
    raise exception 'security_audit rows are kept for at least 180 days'
      using errcode = 'insufficient_privilege';
  end if;
  return old;
end $$;

drop trigger if exists security_audit_append_only on public.security_audit;
create trigger security_audit_append_only
  before update or delete on public.security_audit
  for each row execute function public.security_audit_guard();

-- Truncate bypasses row triggers, so it is refused outright.
create or replace function public.security_audit_no_truncate()
returns trigger language plpgsql as $$
begin
  raise exception 'security_audit cannot be truncated' using errcode = 'insufficient_privilege';
end $$;

drop trigger if exists security_audit_no_truncate on public.security_audit;
create trigger security_audit_no_truncate
  before truncate on public.security_audit
  for each statement execute function public.security_audit_no_truncate();

create or replace function public.purge_security_audit(p_keep_days integer default 365)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  removed integer;
begin
  if p_keep_days < 180 then
    raise exception 'Audit rows must be kept for at least 180 days (asked for %)', p_keep_days;
  end if;
  perform set_config('app.audit_purge', 'on', true);
  delete from public.security_audit where at < now() - make_interval(days => p_keep_days);
  get diagnostics removed = row_count;
  perform set_config('app.audit_purge', 'off', true);
  return removed;
end $$;

comment on function public.purge_security_audit(integer) is
  'Deletes audit rows older than p_keep_days (never fewer than 180). The only way rows leave security_audit.';

-- ---------------------------------------------------------------- access

-- The same posture as app_settings and email_outbox: the app reaches these
-- through the service role and enforces access in server actions. Signed-in
-- users may read the hostel list (it fills a dropdown); nothing else.
alter table public.hostels enable row level security;
alter table public.official_email_whitelist enable row level security;
alter table public.security_audit enable row level security;

drop policy if exists "hostels are readable" on public.hostels;
create policy "hostels are readable"
  on public.hostels for select to authenticated using (true);

drop policy if exists "service role manages hostels" on public.hostels;
create policy "service role manages hostels"
  on public.hostels for all to service_role using (true) with check (true);

drop policy if exists "service role manages the official whitelist" on public.official_email_whitelist;
create policy "service role manages the official whitelist"
  on public.official_email_whitelist for all to service_role using (true) with check (true);

drop policy if exists "service role appends to the audit log" on public.security_audit;
create policy "service role appends to the audit log"
  on public.security_audit for all to service_role using (true) with check (true);

revoke update, delete, truncate on public.security_audit from authenticated, anon;
