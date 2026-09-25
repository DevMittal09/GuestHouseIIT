# Production plan

How to get the Guest House Portal from "feature-complete demo" to something the
Administration Section actually runs on. Ordered by what blocks what, not by
what is most fun to build.

Companion to [04-roadmap.md](04-roadmap.md), which lists gaps. This one says how
to close them and in what order.

> **Read this as history (banner added 24 Sep 2026).** This is the plan
> written on **2 Sep 2026**, when authentication was a persona cookie, there was
> no mail, no tests and no billing. Almost all of it has been carried out — as
> the ten-phase programme of 21–23 Sep 2026 and the office's correction rounds
> — often differently from what is sketched here (LDAP rather than
> Supabase-Auth Google; `units` rather than `account_directory`; a Gmail sender
> rather than the relay, for now). Statements below such as "identity is fake",
> "nothing tells anyone anything" or "build (2) now" describe **2 Sep**, not
> today. **What is actually left is [04-roadmap.md](04-roadmap.md)**; what was
> done and why is [03-decisions.md](03-decisions.md) ("Phase 1" onwards). Kept
> because its reasoning — hosting options, the Computer Centre asks, the DPDP
> and Aadhaar notes, the rollout order — still applies.

> **Review notes (2026-09-02):** This plan was cross-referenced against the
> actual codebase. Key findings:
>
> - **Already done:** Git push (resolved), booking lifecycle statuses (`OCCUPIED`,
>   `VACATED`, `CANCELLATION_REQUESTED`, `CANCELLATION_APPROVED`), cancellation
>   request/approve/reject flow, universal `/history` access for all roles, PDF
>   report export for GH Manager and Developer, `ROOM_HOLDING_STATUSES` for
>   occupancy queries.
> - **Corrected:** Occupancy now checks `ROOM_HOLDING_STATUSES` (not just
>   `APPROVED`). The `getOccupiedRoomIds` comment in `store/types.ts` is stale
>   but the implementation is correct.
> - **Since built:** Email notifications (Phase 2) shipped 16 Sep 2026 —
>   `lib/mail/` plus the `email_outbox` queue (migration 10). The `room_holds`
>   exclusion constraint (Phase 3) shipped 3 Sep 2026.
> - **Still valid and unbuilt:** Real auth (Phase 1), tariff/billing
>   (Phase 4), DPDP compliance (Phase 5), tests and CI (Phase 6).
> - **Prerequisite noted:** The `account_directory` proposal references
>   `hostels(id)` and `clubs(id)` tables that do not exist yet. The
>   `hostels`/`clubs` FK migration must come first.

---

## Where the project actually stands

The build is in better shape than most student projects that reach this point.
Three things in particular hold up under production pressure:

- authorization is re-checked server-side on every action, so identity is the
  only thing that needs replacing, not the security model;
- the auth swap point is one function;
- the workflow, form config and search rules are pure functions in `lib/`, which
  is where the tests will go.

Four things are not production-shaped yet, and none of them are visible from the
UI:

1. **Identity is fake.** Anyone can be anyone with a cookie.
2. **Nothing tells anyone anything.** No email means the portal only works if
   people remember to check it. In practice that means it dies in month two.
3. ~~**Room holds are enforced in application code, not in the database.**~~
   ✅ **Done (2026-09-03).** `room_holds` with a `btree_gist` exclusion
   constraint is live — migration
   `00000000000003_room_holds_and_infants.sql`. `bookings.assigned_room_ids` is
   dropped and derived from holds on read; `allocateRooms()` no longer
   pre-checks (that was the race) and surfaces `RoomClashError` to the loser.
   See Phase 3 below for what is left: the timezone audit and the missing
   lifecycle states.
4. **You are storing Aadhaar scans** with no retention policy, no consent
   notice, and no named owner. That is the item with legal exposure attached.

Everything else is scope, and scope is negotiable.

---

## Phase 0 — the things that need other people

Start these in week one, before writing any code. At an institute these take
weeks of calendar time and no amount of coding speed helps.

### Ask the Computer Centre (`netadmin@iitpkd.ac.in`)

Send one email listing all of it, not one ask at a time.

| Ask | Why you need it | Likely answer |
| --- | --- | --- |
| Which identity provider backs `iitpkd.ac.in` and `smail.iitpkd.ac.in` | Decides the whole login implementation | Almost certainly Google Workspace — the institute runs Google Sites on `sites.google.com/iitpkd.ac.in`. Confirm rather than assume. |
| An OAuth 2.0 client (client id + secret) with an authorised redirect URI | Sign in with institute account | Needs a named requesting department — get the Administration Section to co-sign |
| Whether a central SSO / LDAP exists that they'd prefer you use | They may not want a new OAuth client | If `dashboard.iitpkd.ac.in` has a login, ask what it uses |
| A sending mailbox, e.g. `guesthouse@iitpkd.ac.in`, plus SMTP relay access | Sending mail as the institute | See Phase 2 |
| A subdomain — `guesthouse.iitpkd.ac.in` — and a TLS cert | Nobody trusts `guesthouse-iitpkd.vercel.app` | May be routed through their reverse proxy |
| Hosting: campus VM or external | Decides your deployment target and whether you get a static IP | See "Hosting" below |
| Whether outbound internet is available from that VM | Supabase, if hosted, is external | Some institute VMs are LAN-only |

### Ask the Administration Section

- **Written sign-off on the current workflow.** Print the five pipelines and get
  them initialled. The person who gave you the spec should confirm it is still
  what they want.
- **Tariff.** Do guests pay? Different rates by requester category? This is the
  single biggest feature you have not built and they will ask for it. Get the
  rate card now even if you build it later.
- **Retention.** How long do ID documents live after checkout? Get a number.
- **The real hostel list and the current wardens.** Your seed uses Malhar and
  Saveri; public sources list Bageshri, Brindavani and Tilang. Names have
  probably changed and Bageshri appears to be both a hostel and a guest house.
  Get the authoritative list from the Hostel Office, in writing.
- **The current faculty advisors, per club**, from the Students' Affairs Council.
- **Who owns this after you.** You graduate in 2027. If no institute staff member
  is named as owner, the portal becomes unmaintained software holding Aadhaar
  data. Name someone now and build for handover.

### Hosting

| Option | For | Against |
| --- | --- | --- |
| Campus VM (Docker + Node) | Data stays on campus, static IP for the SMTP relay, no vendor spend, institute IT already runs VMs | You own patching, backups, TLS renewal, uptime |
| Vercel + Supabase Mumbai region | Zero ops, previews, automatic builds | External hosting for ID documents needs institute approval; no static outbound IP on the free/Pro tier |

Recommendation: **campus VM if IT will give you one.** It removes the data
residency conversation entirely, gives you a static IP that makes the Google SMTP
relay trivial, and an institute service should outlive your Vercel account. Ship
to Vercel only if the VM ask stalls, and keep the app portable — nothing in the
current code is Vercel-specific.

---

## Phase 1 — real identity

This is the blocker. Everything else can ship after it.

### The mental model correction

You wrote: "I need to set up all the college emails including students,
professors, event emails, office emails."

**Don't.** Never create user accounts for 972 students and 127 faculty. Any list
you import is stale the day the next batch joins. Instead:

> Let anyone with an institute Google account log in. Create their profile row
> the first time they do. Derive what you can from the email address. Keep a
> small admin-managed table for the few things the email cannot tell you.

That is called just-in-time provisioning, and it means your user table starts
empty and fills itself.

### What the email address tells you

Confirmed from public institute sources:

| Pattern | Meaning |
| --- | --- |
| `112201001@smail.iitpkd.ac.in` | Student. The local part is the roll number. |
| `padmesh@iitpkd.ac.in` | Faculty or staff. |
| `trc@iitpkd.ac.in`, `yacc@iitpkd.ac.in`, `dac@iitpkd.ac.in`, `vadya@`, `akshar@`, `bioscope@`, `shutterbug@`, `grafica@`… | **Club shared mailboxes — also on the staff domain.** |
| `admin@`, `registrar@`, `director.office@iitpkd.ac.in` | Office mailboxes. |

So the naive rule "staff domain means employee" is wrong: clubs and offices sit
on the same domain. Domain gives you a baseline; an explicit table overrides it.

```ts
// lib/auth/identity.ts
const STUDENT_DOMAIN = "smail.iitpkd.ac.in";
const STAFF_DOMAIN = "iitpkd.ac.in";

/** What we can infer with no database lookup. Overridable. */
export function baselineRoleFor(email: string): UserRole | null {
  const [local, domain] = email.toLowerCase().split("@");
  if (domain === STUDENT_DOMAIN) return "student";
  if (domain === STAFF_DOMAIN) return "employee";
  return null; // not an institute account — alumni/guest path
}

export function rollNumberFor(email: string): string | null {
  const [local, domain] = email.toLowerCase().split("@");
  return domain === STUDENT_DOMAIN && /^\d{9}$/.test(local) ? local : null;
}
```

### The override table

One new table replaces the hardcoded official whitelist, the club list, and every
reviewer assignment. Seed it once; the Administration Section maintains it from
`/admin` afterwards.

```sql
create table account_directory (
  email              text primary key,
  role               user_role not null,
  hostel_id          uuid references hostels(id),
  club_id            uuid references clubs(id),
  display_name       text,
  note               text,          -- 'Warden, Brindavani, from 2026-07'
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
```

Rows you seed: every warden, every faculty advisor, the IAR cell mailbox, the GH
manager, you (developer), every club mailbox with `role = 'club'`, and every
office mailbox with `role = 'official'`. That is maybe 60 rows total, and
the official whitelist (already a table, `official_email_whitelist`, since migration 16) can be folded into it.

Resolution on login: `account_directory` row if one exists, else
`baselineRoleFor(email)`, else reject. Same shape as your form-config resolution,
so it will feel familiar.

### Fix the string-matched scoping while you're here

`canReview()` currently compares `profile.hostel_name` and
`profile.department_or_club` as free text. A warden typed as "Brindavani " with a
trailing space silently sees nothing, and nothing in the system tells you why.
Add `hostels` and `clubs` tables with uuid primary keys and point both the
student/club profile and the warden/FA profile at the same row. It is a small
migration now and an unfixable data-cleanup job later.

### The two hard cases

**Students → hostels.** Nothing in the email says which hostel a student lives
in, and it changes every year. Options, best first:

1. Get a CSV of roll number → hostel from the Hostel Office each semester and
   import it from `/admin`. Cleanest, needs an ongoing relationship.
2. Ask the student to pick their hostel on their first booking, store it, and
   show the warden a "self-declared" badge. Works from day one, warden catches
   errors.

Build (2) now and (1) when the Hostel Office will give you the file. If a student
has no hostel resolved, route to a "hostel unknown" queue the manager can see —
do not silently drop the request.

**Alumni have no institute account.** Your seed uses
`vikram.iyer@alumni.iitpkd.ac.in`, which probably does not exist as a real mail
domain. Confirm with the IAR cell. If it doesn't:

- allow signup with any email via Supabase Auth magic link or email OTP;
- mark the account `alumni_unverified`;
- the mandatory alumni ID card upload is what the IAR cell verifies, which is
  exactly what the workflow already does;
- **this is your only public-facing signup**, so it needs rate limiting and a
  captcha (Cloudflare Turnstile is free), and alumni accounts must not be able to
  reach any other role's routes.

### Implementation checklist

1. Add `@supabase/ssr`; create the browser and server clients per its docs.
2. Google provider in Supabase Auth, restricted to the two institute domains.
   Set `hd` on the OAuth request **and** re-verify the email domain server-side —
   `hd` is a UI hint, not a security control.
3. Rewrite `getCurrentUser()` to read the Supabase session, then load or JIT-create
   the profile. Nothing else in the app changes. This is the payoff for the
   discipline in `AGENTS.md`.
4. Add `middleware.ts` for session refresh, and keep the route guards where they
   are — middleware is a convenience, not the boundary.
5. **Keep the LDAP form; retire the development shortcuts.** Since
   19 Sep 2026 the sign-in card is LDAP (`signInWithLdap`, `lib/ldap/`) plus a
   "Sign in with Google" button that opens the persona picker at `/mock-login`.
   For production:
   - set `LDAP_URL`, which turns the dummy accounts off;
   - replace `/mock-login` + `loginAs` with real Google OAuth;
   - have both doors create a real session instead of the unsigned
     `gh_mock_user` cookie.

   Do not leave the picker behind a flag; a flag is a backdoor. The three pages
   keep their routes: every signed-out guard redirects to `/sign-in`
   (`SIGN_IN_PATH`). (`/` is the public website since 19 Sep 2026.) Real LDAP
   usernames are loaded onto profiles as described in
   [31-ldap-sign-in.md](31-ldap-sign-in.md) §3.
6. Move request-scoped reads to the anon key with the user's session so **RLS
   becomes the real boundary**. Keep one service-role client, used only by
   `app/actions/admin.ts` for user creation.
7. Verify `can_access_booking()` and `historyScope()` agree. Your own database
   doc flags this; do it as a test, not a read-through.
8. Change the seeded password and delete the demo personas from the production
   project.
9. Keep the mock store for local dev. `ConsoleAuth` + `MockStore` is why the
   project runs with `npm install` and that is worth preserving.

### Test matrix before you call it done

For each of the 10 roles: can log in, lands on the right page, sees only what
they should, and gets a 307 or 403 on every route they should not reach. Twenty
minutes of `curl` with real session cookies, and worth writing as a script since
you will run it after every auth change.

---

## Phase 2 — email ✅ Built 16 Sep 2026

Shipped as `lib/mail/` essentially as planned below — Nodemailer behind a
`Mailer` interface, an outbox table, a cron-triggered worker, and
`MAIL_DRY_RUN` / `MAIL_REDIRECT_ALL_TO`. Differences from this plan, all
deliberate:

- **It sends as a Gmail mailbox with an app password today**, not the institute
  relay. Host, port, from and reply-to are all environment variables precisely
  so that swap is config rather than code. The argument below for using the
  institute's own infrastructure still stands and is still the target.
- **No `HttpMailer`.** The third implementation is `FileMailer`, writing
  `.eml` files for zero-setup local runs; a transactional-API transport is
  unnecessary until the institute declines to send on the portal's behalf.
- **Hooks are in the server actions, not `updateBookingStatus()`** — the store
  sees a status pair, but only the action knows which reason was typed, which
  rooms were picked, or whether a cancellation was approved. It would also have
  mailed on the developer console's force-status override, a repair tool.
- **Templates are a block list rendered to HTML *and* plain text by
  `lib/mail/render.ts`**, not React Email — one description, two bodies, so the
  text part cannot drift. No new dependency.
- **The daily report is HTML tables, not a PDF**, because `lib/report-pdf.ts`
  is client-side (jsPDF) and a cron job has no browser.
- **Threading was added** (not in this plan but asked for in the meeting
  notes): a deterministic per-booking `Message-ID` plus a reference-led subject,
  because mail clients need both to group a conversation.

Still open: the cron is external (something must call `/api/mail/cron`), and
there is no SMS.

The original plan, for reference:

### Your question: Nodemailer, or something better?

Nodemailer is the right library. The interesting decisions are underneath it.

**Use the institute's own mail infrastructure, not a third-party sender.** If
IIT Palakkad is on Google Workspace, an admin configures the SMTP relay service
(`smtp-relay.gmail.com`, ports 465 or 587) and your app sends as
`guesthouse@iitpkd.ac.in`. Two reasons this beats Resend/SES/Postmark here:

- **No DNS request.** SPF and DKIM are already correct for the domain. Getting
  DNS records added to `iitpkd.ac.in` for an external sender is a multi-week
  approval; getting a mailbox is a same-week one.
- **Mail genuinely originates from the institute**, which is what the
  Administration Section will care about when parents receive it.

Volume is a non-issue: the Workspace relay allows on the order of 10,000
recipients per day per licence, and this portal will send tens.

Authentication on the relay is by allowlisted IP or by SMTP credentials. **This
is where hosting couples to email:** a campus VM has a static IP and IP
allowlisting is the clean setup; Vercel has no fixed outbound IP on ordinary
plans, so you would need credential auth on the relay instead. Another point for
the VM.

Fallbacks if the relay isn't granted:

- `smtp.gmail.com` authenticated as a single `guesthouse@` mailbox. Workspace no
  longer accepts plain passwords, so this means OAuth2 (XOAUTH2) or an app
  password where policy still permits one. Lower ceiling (roughly 2,000/day) but
  fine for this.
- A transactional API (Resend, SES Mumbai, Brevo) only if the institute declines
  to send on your behalf. Then you are asking for DNS records anyway, so ask for
  the mailbox first.

### Two things people get wrong, that you should design around now

**1. Do not send inside the server action.** If SMTP is slow, the user waits. If
it fails, do you fail the booking? On Vercel specifically, any un-awaited work is
frozen the moment the function responds, so mail silently vanishes.

Write to an outbox table in the same transaction as the status change, and let a
worker send.

```sql
create type email_status as enum ('QUEUED','SENDING','SENT','FAILED');

create table email_outbox (
  id               uuid primary key default gen_random_uuid(),
  booking_id       uuid references bookings(id) on delete set null,
  event_key        text not null,               -- 'booking.approved'
  idempotency_key  text not null unique,        -- event_key + booking + log id
  to_email         text not null,
  cc_emails        text[] not null default '{}',
  subject          text not null,
  body_html        text not null,
  body_text        text not null,
  status           email_status not null default 'QUEUED',
  attempts         int not null default 0,
  last_error       text,
  scheduled_for    timestamptz not null default now(),
  sent_at          timestamptz,
  created_at       timestamptz not null default now()
);

create index email_outbox_pending on email_outbox (status, scheduled_for);
```

The worker is a cron-triggered route (Vercel Cron, or plain `systemd` timer on a
VM) that claims rows with `for update skip locked`, sends, and marks. Retries
push `scheduled_for` forward exponentially and give up after five attempts. The
unique `idempotency_key` is what stops a retry from mailing the same parent
twice.

This also gives you something you will want at 11pm during the pilot: a table you
can query to answer "did the warden actually get told?"

**2. Put the transport behind an interface**, exactly like `DataStore`.

```ts
// lib/mail/types.ts
export interface Mailer {
  send(msg: OutboundMessage): Promise<{ messageId: string }>;
}
```

Three implementations: `SmtpMailer` (Nodemailer), `HttpMailer` (an API provider,
if it ever comes to that), and `ConsoleMailer` for local dev that writes `.eml`
files to `.local-mail/`. The last one preserves your zero-setup first run — the
same reason `MockStore` exists.

Two environment variables that will save you from a genuinely bad day:

```bash
MAIL_DRY_RUN=true              # log, never send
MAIL_REDIRECT_ALL_TO=dev@…     # staging: every message goes here instead
```

Without the second one, someone will point staging at real data and mail a real
parent. Set it in staging on day one.

### What to send

| Event | To | Contains |
| --- | --- | --- |
| Booking submitted | Requester | Reference id, summary, "no action needed yet" |
| Booking submitted | First-tier reviewer (warden / FA / IAR / manager) | Who, when, direct link to the queue |
| Approved at a tier | Requester | Progress; what happens next |
| Rejected at any tier | Requester | **The reason**, verbatim |
| Rooms allocated | Requester | Room numbers, check-in time, what ID to carry, guest house location |
| Rooms allocated | GH manager | Confirmation for their own record |
| Cancellation requested | GH manager | Reason, original booking |
| Cancellation decided | Requester | Outcome |
| Day before check-in | Requester | Reminder + directions |
| Daily, 8am | Each reviewer with a non-empty queue | Digest, not one mail per booking |
| Daily, 8am | GH manager | Today's arrivals and departures |
| Pending > 48h | Reviewer, cc manager | Escalation nudge |

The digest matters more than it looks. Per-item mail to a warden during fest
season trains them to filter you into spam; one 8am summary does not.

Templates: React Email renders to HTML with your amber branding and gives you a
plain-text version for free. Set `Reply-To: guesthouse@iitpkd.ac.in` so replies
reach a human, and never put ID document links in an email body — link to the
portal.

Hook point is `updateBookingStatus()`, which every transition already funnels
through. Your roadmap already spotted this; it is correct.

---

## Phase 3 — correctness gaps that only appear under real load

### ~~Close the double-booking race in the database~~ ✅ Done

Shipped in `00000000000003_room_holds_and_infants.sql` on 2026-09-03,
essentially as designed below. Differences from this plan, all deliberate:

- **`assigned_room_ids` was dropped immediately**, not kept for a release as a
  read-only fallback. Two sources of truth for the same fact is what the change
  existed to remove, and the app is not yet in production.
- **Writes go through a `set_room_holds()` plpgsql function** so delete+insert
  is one transaction — two PostgREST calls would drop the old holds before
  discovering the new ones do not fit.
- **`allocateRooms()` no longer pre-checks occupancy at all.** Keeping the check
  would have kept the race.
- `23P01` is caught and surfaced as `RoomClashError` → "those rooms were just
  taken — refresh the grid".

The original design, for reference:

```sql
create extension if not exists btree_gist;

create table room_holds (
  booking_id uuid not null references bookings(id) on delete cascade,
  room_id    uuid not null references rooms(id),
  during     tstzrange not null,
  primary key (booking_id, room_id),
  constraint room_holds_no_overlap
    exclude using gist (room_id with =, during with &&)
);
```

Build `during` as `tstzrange(check_in, check_out, '[)')` — the half-open range
gives you exactly the strict-overlap semantics you already implement. (Built
in migration 3; since migrations 14 and 17 the constraint compares a `guard`
column that adds the turnaround buffer after each stay.) A row exists only while the
booking holds the room, so `VACATED`, `CANCELLED` and `CANCELLATION_APPROVED`
delete it. `ROOM_HOLDING_STATUSES` stops being a rule you remember to apply and
becomes a table that cannot lie.

- **Early checkout** now works for free, as predicted: `VACATED` is outside
  `ROOM_HOLDING_STATUSES`, so `updateBookingStatus` deletes the holds and the
  room is immediately free.
- **Still open:** a **no-show** booking holds its room until someone marks it
  `VACATED` or `CANCELLED`. An auto-release job (or a manager action) is the
  remaining piece.

### ~~Timezones~~ ✅ Done — and it had already happened

This section predicted the bug almost word for word:

> A guest house booking that shifts by 5:30 hours because a server runs UTC is
> the kind of bug that gets a system switched off.

It did. Once the app ran on a UTC host, `toIso()` —
`new Date("2026-09-15T12:00").toISOString()` — resolved the form's wall-clock
string in the **process** timezone, stored 12:00 as `12:00Z`, and the Guest
House Manager read it back as **5:30 PM**; a 10:00 check-out became 3:30 PM.
It was reported from the manager's console, which is exactly the "switched off"
path this warned about.

Fixed on 2026-09-10 by `lib/tz.ts`, which pins the app to `Asia/Kolkata`:
`instituteIso()` parses a typed time, `formatInstitute*` / `instituteHour` /
`instituteDayBounds` read instants back. `lib/format.ts` delegates to it, so
nothing has to remember. Verified under `TZ=IST`, `TZ=UTC` and
`TZ=America/New_York` — identical output.

Two lessons worth keeping:

- **The plan's own advice was not enough.** "Add it to `lib/format.ts`" would
  have fixed rendering and left the *parse* wrong, which is where the corruption
  actually was — the bad value went into the database. Both directions have to
  be zoned, and the parse is the one that does lasting damage.
- **`TZ=UTC npm run build` would not have caught it.** A build renders nothing
  with a user-entered time in it. What catches it is running the domain logic
  under a non-IST `TZ`, which is now what the throwaway suite does.

**Still outstanding:** four bookings written during the UTC window are stored
5h30m late and stay wrong until repaired —
`supabase/repairs/2026-09-10-utc-parsed-bookings.sql` shifts them and rebuilds
their room holds. Not run automatically; read its header first.

### Missing states that the office will hit in week one

- **Modify a booking.** Currently cancel-and-resubmit, which loses the approval
  chain. At minimum let the requester change dates while pending.
- **Extend a stay.** Extremely common and currently impossible.
- **Move a guest to a different room mid-stay.** Also common; maintenance happens.
- **No-show.** A booking that was never occupied and never vacated holds a room
  forever. Add an auto-release or a manager action. **Partly addressed:** the
  manager console now has an **Awaiting check-out** section listing exactly
  these — past their check-out, still holding rooms — so they are visible
  rather than silently hoarding inventory. Closing them off is still manual.
- **Early checkout.** `VACATED` before `check_out` should free the room
  immediately, which the `room_holds` model gives you for free.

---

## Phase 4 — what the Administration Section will ask for within a month

Ranked by how likely you are to be asked.

1. **Tariff and billing.** Rates per room type and requester category, a bill at
   checkout, payment mode recorded (cash / UPI / institute account transfer), a
   receipt with a serial number, and a monthly collection report. This is a real
   subsystem and it is entirely absent. Ask for the rate card in Phase 0 so you
   can size it.
2. **Occupancy calendar.** A month view per guest house. The cinema grid answers
   "is this room free now"; the manager also needs "how full are we next week".
3. **Monthly report, emailed automatically.** Bookings by category, occupancy
   rate, rejections with reasons. You already have PDF export; put it on a cron.
4. **Guest register.** A printable arrivals/departures sheet for the front desk,
   because the front desk will not be at a computer.
5. **Per-guest-house managers.** Already in your roadmap; the data model supports
   it the same way wardens are scoped.
6. **Bulk room creation.** "Add B-101 to B-120" in one action.
7. **Blocking rooms for maintenance** without a fake booking.

---

## Phase 5 — the legal side, which is the part with real exposure

Not legal advice — but these need a decision from the institute, in writing,
before go-live.

### Reconsider collecting Aadhaar at all

You are storing Aadhaar numbers and full scans. Handling Aadhaar carries specific
statutory obligations under the Aadhaar Act, and UIDAI guidance discourages
storing the number where an alternative exists. A guest house does not need it.

Cheaper and safer design:

- accept **any** government photo ID, with the type recorded;
- store only the **last four digits**, never the full number;
- keep the scan only until check-in is complete, then delete it on a schedule;
- or best: verify ID physically at the desk and store only "verified by, on".

Ask the Administration Section what they actually need this data for. If the
answer is "the register at the gate", you do not need to store scans at all, and
deleting that requirement removes most of the risk from this project.

### DPDP Act, 2023

The DPDP Rules were notified on 13 November 2025, with substantive obligations
due by **13 May 2027**. That lands inside this system's operating life, so build
for it now rather than retrofitting:

- a **consent notice** at the point of collection, itemising what you collect,
  why, and how to withdraw — a checkbox on the booking form linked to a plain
  privacy page;
- **purpose limitation** — say the data is used only for this booking;
- **retention and deletion** — a scheduled job that deletes documents past the
  agreed window, plus a log that it ran;
- **rights handling** — access, correction, erasure. A `privacy@` mailbox and a
  documented procedure is enough at this scale;
- **breach notification** within 72 hours, which means someone must be watching;
- **a named grievance officer** published on the site.

Note that many requesters are parents of students, and some guests may be minors,
which brings a stricter consent standard. Raise it; don't decide it yourself.

Practically: write a one-page privacy notice, get it approved, link it from the
footer, and add the deletion cron. That is most of the compliance surface for a
system this size.

### Storage hygiene

Your Supabase store returns a **long-lived signed URL and saves it in the
database**. Anyone who obtains that URL — from a log, a backup, a leaked CSV —
can fetch an Aadhaar scan with no authentication, for as long as it lives. Fix
it: store only the object path, and mint a 60-second signed URL at view time
inside the server action that already checked the caller can see the booking.

---

## Phase 6 — engineering hygiene

### Tests

Install Vitest and start with the list already in your roadmap. Add two:

- **RLS tests** — once RLS is the real boundary, assert with real user JWTs that
  a warden cannot read another hostel's booking. This is the one test suite that
  is genuinely load-bearing after Phase 1.
- **Store parity** — run the same operations against `MockStore` and
  `SupabaseStore` and assert identical results. This is precisely how the facet
  count bug got in, and a parity suite would have caught it in seconds.

### CI

GitHub Actions on every PR: `npm run build`, `npm run lint`, `npm test`. Ten
minutes to set up and it ends the "did I break the typecheck" question forever.

### Environments

Three, with separate Supabase projects:

| | Store | Auth | Mail |
| --- | --- | --- | --- |
| local | mock | mock personas | `ConsoleMailer` |
| staging | Supabase staging | real Google OAuth | `MAIL_REDIRECT_ALL_TO` |
| production | Supabase prod | real Google OAuth | live |

### Migration discipline

`22-database.md` says to update `00000000000001_init.sql` when the schema
changes. That is fine today and dangerous the moment production exists — you can
never edit an applied migration. Change the rule now to: **every schema change is
a new numbered file, applied forward only.** Adopt the Supabase CLI (`supabase
migration new`, `supabase db push`) rather than pasting into the SQL editor, and
install it as a dev dependency since you already found `npx` stalls on it.

### Operations

- **Error tracking** — Sentry free tier. Server actions fail silently otherwise.
- **Backups** — Supabase point-in-time recovery on a paid tier, or a nightly
  `pg_dump` to institute storage. Test a restore once; an untested backup is a
  rumour.
- **Uptime monitoring** — any free pinger hitting a `/api/health` route.
- **Rate limiting** — on `createBooking` and hard on the alumni signup path.
- **Upload validation** — check magic bytes, not just the declared MIME type;
  reject SVG outright; strip EXIF from photos.
- **Append-only audit log** — revoke `update` and `delete` on `booking_logs` for
  everyone but the service role, so the trail cannot be quietly rewritten.
- **Security headers** — CSP, `X-Frame-Options`, HSTS via `next.config.ts`.

### Accessibility

Do the `--primary-foreground` contrast fix, add a non-colour indicator to the
room grid, and check the booking form with a keyboard only. This is a Government
of India institute site; accessibility is an expectation, not a nice-to-have.

---

## Phase 7 — rollout

1. ~~**Fix the git push**~~ — ✅ Done. Code is on GitHub at
   `https://github.com/DevMittal09/GuestHouseIIT.git`, branch `main`.
2. **Pilot with one category.** Employees only, for three weeks. Smallest
   pipeline, most forgiving users, and it exercises the manager console fully.
3. **Run in parallel** with email and paper. Do not switch the old process off
   until the manager stops using it voluntarily.
4. **Train the manager first**, then the wardens. One page each, with screenshots.
   The manager is the single point of failure in every pipeline.
5. **Then students**, which is where the volume is. Announce through the usual
   student channels.
6. **Alumni and officials last** — lowest volume, highest visibility, most
   embarrassing place to find a bug.
7. **Publish a runbook**: how to reset a password, add a warden mid-year, restore
   a backup, what to do when mail stops. Written for the person who takes this
   over from you.

---

## Suggested order

| Weeks | Work |
| --- | --- |
| 1 | Phase 0 asks sent. `hostels` / `clubs` / `account_directory` migration. |
| 2–4 | Real auth end to end, RLS becomes the boundary, persona picker deleted, test matrix green. |
| 4–6 | Outbox + `Mailer` interface + `ConsoleMailer`; real SMTP as soon as the mailbox lands. Core templates. |
| 6–7 | `room_holds` exclusion constraint. Timezone audit. Retention job + consent notice. |
| 7–8 | Vitest, CI, staging environment, Sentry, backups. |
| 8–11 | Employee pilot, in parallel with the old process. Fix what it surfaces. |
| 11+ | Tariff and billing, occupancy calendar, monthly reports — driven by what the pilot asks for. |

Adjust freely; the dependency order is the part that matters. Auth before mail,
mail before pilot, `room_holds` before real booking volume.

## This week

1. ~~Fix the git push and get the repo off your laptop.~~ ✅ Done.
2. Send the Computer Centre email. It has the longest lead time of anything here.
3. Ask the Administration Section for the tariff card, the retention period, and
   the authoritative hostel and warden list.
4. ~~Write the `hostels` / `clubs` migration and move the official whitelist
   into it~~ — done: `hostels`, `units` and `official_email_whitelist`
   (migrations 15–16). `account_directory` is still open.
5. Spike Google OAuth against a throwaway Supabase project with your own
   `@smail.iitpkd.ac.in` account, so you know exactly what Phase 1 costs before
   you commit to it.
