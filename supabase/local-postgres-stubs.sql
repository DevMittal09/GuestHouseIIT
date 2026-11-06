-- ============================================================================
-- Stand-ins for Supabase's own objects, for a plain PostgreSQL server
-- ============================================================================
--
-- The migrations were written against a Supabase project, so the early ones
-- name objects that a plain PostgreSQL 16 server does not have. Apply this
-- **once, before migration 1**, when building a local development database:
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/local-postgres-stubs.sql
--   cat supabase/migrations/*.sql | psql "$DATABASE_URL" -v ON_ERROR_STOP=1
--
-- What needs standing in, and why:
--
--   * **`authenticated`, `anon`, `service_role`** - the roles Supabase's RLS
--     policies are granted to. Migration 31 drops all 38 `authenticated`
--     policies, but the ones before it still name the role.
--   * **`auth.users`** - migration 1 made `profiles.id` a foreign key to it.
--     Migration 31 drops that key (the portal has never authenticated with
--     Supabase Auth), so after a full run the table is vestigial and empty.
--   * **`auth.uid()`** - read by the RLS policies migrations 1-30 create.
--   * **`storage.buckets` / `storage.objects`** - migration 1 creates the
--     private `documents` bucket, and 31 forces `public = false` on it. ID
--     documents are stored through `lib/storage/`, which on a local
--     deployment with no `SUPABASE_URL` writes to a folder instead, so these
--     two tables stay empty.
--
-- Nothing here is part of the application's schema and nothing reads it at
-- run time. It is safe to re-run.
-- ============================================================================

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin;
  end if;
end $$;

create schema if not exists auth;
create table if not exists auth.users (id uuid primary key);
create or replace function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;

create schema if not exists storage;
create table if not exists storage.buckets (id text primary key, name text, public boolean);
create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text
);
