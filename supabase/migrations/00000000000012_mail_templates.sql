-- Migration 12: the guest house edits its own emails (Sep 2026).
--
-- Every automatic mail's wording lived in `lib/mail/templates.ts`, so
-- changing a subject line or adding "bring a photo ID to reception" meant a
-- developer, a deploy, and a wait. The office asked to do it themselves.
--
-- What is editable is deliberately the *wording around* the facts, not the
-- facts: the subject, a sentence of context at the top, a standing note at the
-- bottom, who else is copied, and whether the mail goes out at all. The
-- booking tables inside the body — dates, rooms, the party, the approval
-- trail — are still assembled in code from the booking itself, because a
-- free-text editor over those could only produce a mail that contradicts the
-- database.
--
-- **Only edited rows are stored.** An empty table means "nothing has been
-- customised", and deleting a row is how the console's Reset works. That way
-- the built-in wording stays the single source of the default, and a template
-- nobody has touched cannot drift from the code that renders it.
--
-- Apply after migration 11. Safe to re-run.

create table if not exists public.mail_templates (
  -- Plain text, not an enum, for the same reason `email_outbox.event_key` is:
  -- a new kind of mail should need code (something has to decide when to send
  -- it), not a migration.
  event_key  text primary key,
  enabled    boolean not null default true,
  subject    text,
  intro      text,
  outro      text,
  cc_emails  text[] not null default '{}',
  updated_at timestamptz not null default now()
);

comment on table public.mail_templates is
  'Per-event overrides for the automatic emails: subject, an intro paragraph, a closing note, extra CC addresses, and an on/off switch. Only edited events have a row — no row means the built-in wording in lib/mail/templates.ts. See lib/mail/template-config.ts.';
comment on column public.mail_templates.subject is
  'Replaces the built-in subject entirely, including the [reference] prefix. May contain {reference}, {guest_house}, {requester}, {check_in}, {check_out}.';
comment on column public.mail_templates.enabled is
  'False suppresses this kind of mail. The honest way to stop one, rather than deleting the code that sends it.';

drop trigger if exists mail_templates_updated_at on public.mail_templates;
create trigger mail_templates_updated_at
  before update on public.mail_templates
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------- RLS
--
-- Readable by the console; written only through the service role, which is
-- what the server actions use. The dispatcher reads it as the service role
-- too, so a misconfigured policy can never silently stop mail going out.

alter table public.mail_templates enable row level security;

drop policy if exists "console reads mail templates" on public.mail_templates;
create policy "console reads mail templates"
  on public.mail_templates for select to authenticated
  using (public.my_role() in ('gh_manager', 'developer'));

drop policy if exists "console manages mail templates" on public.mail_templates;
create policy "console manages mail templates"
  on public.mail_templates for all to authenticated
  using (public.my_role() in ('gh_manager', 'developer'))
  with check (public.my_role() in ('gh_manager', 'developer'));

drop policy if exists "service role manages mail templates" on public.mail_templates;
create policy "service role manages mail templates"
  on public.mail_templates for all to service_role
  using (true) with check (true);
