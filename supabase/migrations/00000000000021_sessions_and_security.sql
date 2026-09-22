-- Migration 21: server-side sessions, developer 2FA, rate limits, consent
-- (Phase 8, Sep 2026).
--
--   * `sessions` — the session is a row, not a cookie. The cookie carries a
--     random token; only its SHA-256 is stored, so the table cannot be read
--     back into a login. A session dies at `idle_expires_at` (30 minutes of
--     silence, pushed forward on use) or `absolute_expires_at` (12 hours from
--     sign-in), whichever comes first, and can be revoked — one session, or
--     every session of a user ("sign out everywhere"). `rotated_from` records
--     the token rotation at sign-in and step-up.
--   * `user_mfa` — TOTP for developers: the secret encrypted with the app's
--     key (never in plain text), recovery codes stored as scrypt hashes, and
--     `last_step` to refuse a replayed code.
--   * `rate_limits` + `hit_rate_limit()` — throttles that survive a restart
--     and are shared by every instance, counted in one statement.
--   * `bookings.privacy_notice_version` / `privacy_consent_at` — DPDP: which
--     notice the requester agreed to, and when.
--   * `privacy_requests` — a data download or deletion request, and what the
--     office did about it.
--
-- Apply after migration 20. Safe to re-run.

-- ---------------------------------------------------------------- sessions

create table if not exists public.sessions (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references public.profiles (id) on delete cascade,
  token_hash          text not null unique,
  created_at          timestamptz not null default now(),
  last_seen_at        timestamptz not null default now(),
  idle_expires_at     timestamptz not null,
  absolute_expires_at timestamptz not null,
  revoked_at          timestamptz,
  /** When this session last proved a second factor — step-up for dangerous actions. */
  verified_at         timestamptz,
  /** The session whose token this one replaced, for rotation. */
  rotated_from        uuid references public.sessions (id) on delete set null,
  ip                  text,
  user_agent          text
);

create index if not exists sessions_user_idx on public.sessions (user_id);
create index if not exists sessions_expiry_idx on public.sessions (absolute_expires_at);

comment on table public.sessions is
  'Server-side sessions (Phase 8). The cookie holds a random token; this stores only its SHA-256. Expiry is idle (30 min, pushed forward) or absolute (12 h); revoked_at ends one or all.';

/** Housekeeping: sessions dead for a day are of no further interest. */
create or replace function public.purge_expired_sessions()
returns integer
language sql
security definer
set search_path = public
as $$
  with gone as (
    delete from public.sessions
     where absolute_expires_at < now() - interval '1 day'
        or (revoked_at is not null and revoked_at < now() - interval '1 day')
    returning 1
  )
  select count(*)::int from gone;
$$;

-- ---------------------------------------------------------------- 2FA

create table if not exists public.user_mfa (
  user_id        uuid primary key references public.profiles (id) on delete cascade,
  /** The TOTP secret, encrypted with the application key (lib/crypto.ts). */
  secret_enc     text not null,
  key_version    integer not null default 1,
  /** scrypt hashes of the one-time recovery codes; a used code is removed. */
  recovery_codes jsonb not null default '[]'::jsonb,
  /** The last accepted 30-second step, so a code cannot be replayed. */
  last_step      bigint,
  confirmed_at   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

comment on table public.user_mfa is
  'TOTP second factor (Phase 8). Required of developers; the secret is stored encrypted and recovery codes only as hashes.';

-- ---------------------------------------------------------------- throttles

create table if not exists public.rate_limits (
  key          text primary key,
  window_start timestamptz not null default now(),
  count        integer not null default 0
);

comment on table public.rate_limits is
  'Persistent throttles (Phase 8): sign-in attempts, console unlocks, expensive routes. Counted by hit_rate_limit() in one statement.';

/**
 * Count one attempt against `p_key`. Returns the number of attempts in the
 * current window and how long until it resets, so the caller can answer 429.
 */
create or replace function public.hit_rate_limit(p_key text, p_limit integer, p_window_seconds integer)
returns table (allowed boolean, attempts integer, retry_after integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.rate_limits;
begin
  insert into public.rate_limits (key, window_start, count)
  values (p_key, now(), 1)
  on conflict (key) do update
    set count = case
          when public.rate_limits.window_start < now() - make_interval(secs => p_window_seconds) then 1
          else public.rate_limits.count + 1
        end,
        window_start = case
          when public.rate_limits.window_start < now() - make_interval(secs => p_window_seconds) then now()
          else public.rate_limits.window_start
        end
  returning * into v_row;

  return query select
    v_row.count <= p_limit,
    v_row.count,
    greatest(0, ceil(extract(epoch from (v_row.window_start + make_interval(secs => p_window_seconds) - now())))::int);
end;
$$;

/** Forget windows nobody has touched for a day. */
create or replace function public.purge_rate_limits()
returns integer
language sql
security definer
set search_path = public
as $$
  with gone as (
    delete from public.rate_limits where window_start < now() - interval '1 day' returning 1
  )
  select count(*)::int from gone;
$$;

-- ---------------------------------------------------------------- consent

alter table public.bookings
  add column if not exists privacy_notice_version text,
  add column if not exists privacy_consent_at timestamptz;

comment on column public.bookings.privacy_notice_version is
  'The version of the privacy notice the requester agreed to when submitting (Phase 8, DPDP).';

create table if not exists public.privacy_requests (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  kind         text not null check (kind in ('export', 'deletion')),
  status       text not null default 'open' check (status in ('open', 'done', 'refused')),
  note         text,
  response     text,
  created_at   timestamptz not null default now(),
  handled_at   timestamptz,
  handled_by   uuid references public.profiles (id) on delete set null
);

create index if not exists privacy_requests_open_idx on public.privacy_requests (status, created_at);

comment on table public.privacy_requests is
  'DPDP requests (Phase 8): a data download or an erasure request, and what the office did about it.';

-- ---------------------------------------------------------------- access
--
-- None of these tables is ever read by a signed-in user directly: sessions and
-- 2FA secrets are the server''s, and a privacy request is answered by the
-- office. RLS on with no `authenticated` policy is a deny-all for the anon key.

alter table public.sessions enable row level security;
alter table public.user_mfa enable row level security;
alter table public.rate_limits enable row level security;
alter table public.privacy_requests enable row level security;

revoke all on public.sessions, public.user_mfa, public.rate_limits, public.privacy_requests from anon, authenticated;
grant all on public.sessions, public.user_mfa, public.rate_limits, public.privacy_requests to service_role;

drop policy if exists "service role manages sessions" on public.sessions;
create policy "service role manages sessions" on public.sessions for all to service_role using (true) with check (true);
drop policy if exists "service role manages mfa" on public.user_mfa;
create policy "service role manages mfa" on public.user_mfa for all to service_role using (true) with check (true);
drop policy if exists "service role manages rate limits" on public.rate_limits;
create policy "service role manages rate limits" on public.rate_limits for all to service_role using (true) with check (true);
drop policy if exists "service role manages privacy requests" on public.privacy_requests;
create policy "service role manages privacy requests" on public.privacy_requests for all to service_role using (true) with check (true);

revoke all on function public.hit_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.hit_rate_limit(text, integer, integer) to service_role;
revoke all on function public.purge_expired_sessions() from public, anon, authenticated;
grant execute on function public.purge_expired_sessions() to service_role;
revoke all on function public.purge_rate_limits() from public, anon, authenticated;
grant execute on function public.purge_rate_limits() to service_role;
