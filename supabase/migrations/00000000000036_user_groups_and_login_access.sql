-- ============================================================================
-- Migration 36 - User groups, and accounts that may no longer sign in
--                (5 Nov 2026)
-- ============================================================================
--
-- WHY
--
-- The institute's people arrive as batches: "BTech 2023", "PhD 2022", the
-- faculty. Nothing recorded that, so the office could not load a batch, say who
-- a batch's bookings copy, or stop a batch signing in when it graduates. And
-- the only way to stop somebody signing in was to delete the account, which the
-- owner does not want: a graduate's bookings and invoices stay on record.
--
-- WHAT THIS ADDS
--
--   * `user_groups` - a programme and batch, or a named kind of user, with the
--     role its members hold and its two Copy to lists;
--   * `profiles.group_id` - one group per person. A person may have none, and
--     then nothing about their booking changes;
--   * `profiles.login_disabled_at` / `login_disabled_reason` - null means they
--     may sign in. A timestamp rather than a boolean so the record says when,
--     and restoring access is clearing it.
--
-- `lib/user-groups.ts` holds the rules; `lib/auth.ts` is what refuses a blocked
-- account on every request, not only at sign-in.
--
-- RLS: enabled with no `authenticated` policy, the pattern migrations 28, 31
-- and 32 use. Service-role only.
--
-- Additive. Every existing account gets null in all three columns, which is
-- today's behaviour. Idempotent and safe to re-run.
--
-- SHIPS WITH THE CODE for the group features: `profileWriteError` names this
-- file if a group is assigned before it is applied. Everything else reads the
-- missing columns as "no group, not blocked".
-- ============================================================================

create table if not exists public.user_groups (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  role            public.user_role not null,
  programme       text,
  batch_year      integer,
  intake          text,
  prefill_copy_to text[] not null default '{}',
  allowed_copy_to text[] not null default '{}',
  created_at      timestamptz not null default now(),
  constraint user_groups_name_not_blank check (btrim(name) <> ''),
  constraint user_groups_programme_known
    check (programme is null or programme in ('BTech', 'MTech', 'MSc', 'MS', 'PhD')),
  constraint user_groups_batch_plausible
    check (batch_year is null or batch_year between 2000 and 2100),
  -- A batch only means something together with its programme.
  constraint user_groups_batch_needs_programme
    check ((programme is null) = (batch_year is null)),
  -- MS and PhD join twice a year; every other programme once.
  constraint user_groups_intake_known
    check (intake is null or intake in ('jan', 'aug')),
  constraint user_groups_intake_only_research
    check ((programme is not null and programme in ('MS', 'PhD')) = (intake is not null))
);

create unique index if not exists user_groups_name_key
  on public.user_groups (lower(name));

alter table public.user_groups enable row level security;

alter table public.profiles
  add column if not exists group_id uuid
    references public.user_groups (id) on delete set null,
  add column if not exists login_disabled_at timestamptz,
  add column if not exists login_disabled_reason text;

create index if not exists profiles_group_idx
  on public.profiles (group_id)
  where group_id is not null;
