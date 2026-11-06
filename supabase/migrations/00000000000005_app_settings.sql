-- A small key/value store for things the app configures at runtime and that do
-- not deserve a table of their own. Currently one key: the developer console
-- password hash.
--
-- Deliberately NOT readable by ordinary authenticated users. Everything else in
-- this schema is world-readable to signed-in users because the app connects
-- with the service-role key and enforces access in server actions; this table
-- holds a credential hash, so it gets the stricter treatment now rather than
-- being remembered later when RLS becomes the real boundary.

create table public.app_settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.app_settings enable row level security;

-- No select/insert/update policy for `authenticated` on purpose: only the
-- service-role key (which bypasses RLS) reaches this table. Adding a developer
-- policy would expose the password hash to anyone who can set their own role.
create policy "developer manages app settings"
  on public.app_settings for all to service_role
  using (true) with check (true);

create trigger app_settings_updated_at
  before update on public.app_settings
  for each row execute function public.set_updated_at();
