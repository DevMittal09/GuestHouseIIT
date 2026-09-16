-- Email outbox: the queue behind every notification the portal sends.
--
-- Why a table and not a `sendMail()` call inside the server action:
--
-- 1. **The requester must not wait for SMTP.** A slow relay would add its
--    latency to every booking submission and every approval.
-- 2. **A failed send must not fail a booking.** If SMTP is down, the action
--    still succeeds and the message is still on disk to retry.
-- 3. **On a serverless host, un-awaited work is frozen the moment the function
--    responds** — mail started inside an action and not awaited simply
--    vanishes, silently.
-- 4. **You will want to answer "did the warden actually get told?"** at 11pm
--    during the pilot. That is a query against this table.
--
-- The worker is `lib/mail/dispatch.ts`, triggered by `after()` on the action
-- that queued the message and by the cron route as a safety net.
--
-- Additive: nothing existing reads or writes it, so applying this is safe at
-- any time and safe to re-run. Until it is applied, queueing degrades to a
-- logged warning and the rest of the app is unaffected (see
-- `lib/mail/notify.ts`).

do $$
begin
  if not exists (select 1 from pg_type where typname = 'email_status') then
    create type public.email_status as enum ('QUEUED', 'SENDING', 'SENT', 'FAILED');
  end if;
end $$;

create table if not exists public.email_outbox (
  id              uuid primary key default gen_random_uuid(),
  -- `set null`, not `cascade`: the mail was really sent, so the record of it
  -- outlives a booking a developer later hard-deletes.
  booking_id      uuid references public.bookings(id) on delete set null,
  event_key       text not null,
  -- The natural key for (event, subject, recipient). This unique index is what
  -- stops a retried action, or two dispatchers racing, from mailing the same
  -- parent twice; `enqueueEmails` inserts with `on conflict do nothing`.
  idempotency_key text not null unique,
  to_emails       text[] not null,
  cc_emails       text[] not null default '{}',
  subject         text not null,
  body_html       text not null,
  body_text       text not null,
  -- RFC 5322 threading, so a booking's mail arrives as one conversation
  -- rather than six standalone messages (asked for in the Guest House
  -- meeting). The root message claims `thread_root` as its own Message-ID;
  -- every later message sets In-Reply-To / References to it.
  thread_root     text,
  is_thread_root  boolean not null default false,
  status          public.email_status not null default 'QUEUED',
  attempts        int not null default 0,
  last_error      text,
  scheduled_for   timestamptz not null default now(),
  sent_at         timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- The worker's claim query: due rows in status order, oldest first.
create index if not exists email_outbox_pending on public.email_outbox (status, scheduled_for);
create index if not exists email_outbox_booking on public.email_outbox (booking_id);

alter table public.email_outbox enable row level security;

-- No `authenticated` policy, deliberately — the same treatment as
-- `app_settings`. Rendered bodies quote guest names, purposes of visit and
-- rejection reasons, so this table is more sensitive than the bookings it
-- describes. Only the service-role key (which bypasses RLS) reaches it, and
-- access is enforced in server actions: the outbox log is developer-only.
drop policy if exists "service role manages the email outbox" on public.email_outbox;
create policy "service role manages the email outbox"
  on public.email_outbox for all to service_role
  using (true) with check (true);

drop trigger if exists email_outbox_updated_at on public.email_outbox;
create trigger email_outbox_updated_at
  before update on public.email_outbox
  for each row execute function public.set_updated_at();

-- Claim up to `p_limit` due messages in one statement.
--
-- `for update skip locked` is the point: two workers running at once (the
-- `after()` hook on an action and the cron route, say) each get a disjoint
-- batch instead of both sending the same message. Rows stuck in SENDING for
-- longer than `p_stale_after` are reclaimed, so a process that dies mid-send
-- does not strand them.
create or replace function public.claim_queued_emails(
  p_limit int,
  p_stale_after interval
)
returns setof public.email_outbox
language sql
security definer
set search_path = public
as $$
  with due as (
    select id
    from public.email_outbox
    where scheduled_for <= now()
      and (
        status = 'QUEUED'
        or (status = 'SENDING' and updated_at < now() - p_stale_after)
      )
    order by scheduled_for
    limit p_limit
    for update skip locked
  )
  update public.email_outbox o
  set status = 'SENDING',
      attempts = o.attempts + 1,
      updated_at = now()
  from due
  where o.id = due.id
  returning o.*;
$$;

revoke all on function public.claim_queued_emails(int, interval) from public, anon, authenticated;
