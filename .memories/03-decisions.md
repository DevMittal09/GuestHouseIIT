# Decision log

Each entry: what was decided, why, and what it costs — **in the order it was
decided**. Entries are a record, not a description of the present: they are
not rewritten when a later decision reverses them. Instead a dated
**Superseded** / **Updated** note sits under the heading. For how things are
*now*, read [10-roles-and-features.md](10-roles-and-features.md),
[11-booking-forms.md](11-booking-forms.md), [12-workflows.md](12-workflows.md)
and [13-settings-and-defaults.md](13-settings-and-defaults.md). The dated
summary of every session is [02-timeline.md](02-timeline.md).

## Mock authentication with one swap point

> **Superseded.** Phase 8 (22 Sep 2026) made the session a server-side row
> with an opaque cookie, and 23 Sep 2026 turned the persona picker into the
> **Mock Authentication** door, open only while Google is unconfigured. The
> "one swap point" (`lib/auth.ts`) still holds.

**Decision.** Ship a persona picker backed by a cookie, with all session reading
confined to `getCurrentUser()` in `lib/auth.ts`.

**Why.** The institute's SSO/LDAP integration was not available during the build,
and blocking on it would have stalled every other feature. Reviewing the approval
chain also requires switching between ten roles constantly — a persona picker
makes that a click instead of ten sets of credentials.

**Cost.** The app cannot go to production as-is: anyone can impersonate anyone by
setting a cookie. Mitigated by keeping the swap point to a single function and by
enforcing authorization server-side regardless of how identity arrives.

**Rejected alternative.** Supabase Auth immediately — would have coupled local
development to a running Supabase instance and made role switching tedious.

## Two sign-in doors: a credential form and the persona picker

**Decision.** `/` is an email + password form checking the address against a
profile and the password against one shared `DEMO_PASSWORD` (`password123`, the
same password `supabase/seed.sql` gives its auth users). The persona picker
moved to `/mock-login`, linked from below the form.

**Why.** The picker is the right tool for development and the wrong thing to
put in front of the institute — a wall of names with no password does not read
as a portal they would trust with guest data. Both were wanted: one to
demonstrate, one to work with. `/` had to stay the login route because every
signed-out guard already redirects there.

**Cost.** A second path onto the same cookie, and a password that is not a
secret — it is printed under the form. Neither is authentication, and both must
be deleted together when real auth lands (05-production-plan.md step 5), not
left behind a flag.

**Detail worth keeping.** A wrong password and an unknown address return the
*same* message. Distinguishing them would let an unauthenticated visitor
enumerate which institute addresses are registered.

**Superseded in part (19 Sep 2026).** The credential form moved from `/` to
`/sign-in` (and is embedded in the public `/book-room` and `/book-meal`),
because `/` became the public guest house website. The "every guard redirects
to `/`" constraint was resolved by pointing every guard at `SIGN_IN_PATH`
instead. Everything else here still holds. See the UI redesign entry below.

**Superseded (19 Sep 2026, later).** The email + `DEMO_PASSWORD` form was
replaced by LDAP sign-in, and the picker became the "Sign in with Google"
placeholder. See the next entry.

## LDAP sign-in, with a mocked Google door (19 Sep 2026)

> **Updated.** The costs below were fixed later: the session is a row since
> Phase 8, the throttle moved into the database (8 attempts per 15 minutes),
> and the placeholder button reads "Mock Authentication" since 23 Sep 2026.

**Decision.** The sign-in card asks for an **LDAP username and password**, with
**"Sign in with Google"** beneath it. Google is a placeholder: it opens the
persona picker (`/mock-login`, carrying `next`) until OAuth is set up, because
development needs one-click role switching.

LDAP is real code behind an environment switch, like the store and the mailer.
`LDAP_URL` selects `LdapDirectory` (`ldapts`, search-then-bind). Without it,
`MockDirectory` serves one dummy account per persona, listed with passwords in
[31-ldap-sign-in.md](31-ldap-sign-in.md) as the user asked.

**Identity is split in two.** The directory proves the password;
`profiles.ldap_uid` (migration 12) says which portal account that is. The user
said the real LDAP logins will be "added to the database", and the directory
knows nothing of roles, hostels or clubs.

**How the real usernames get loaded.** The user asked for a provision to work
with the original LDAP accounts once they are in the database. Four ways:

- the Users & Roles field, one user at a time;
- an all-or-nothing bulk import (`email, ldap username` lines);
- SQL;
- opt-in `LDAP_LINK_BY_EMAIL`, which links a first sign-in to the profile whose
  email is the directory's `mail`.

**Why not match LDAP users by email automatically?** A guessed identity mapping
signs one person in as another, so migration 12 does not backfill, and
link-by-email is off until someone confirms users cannot edit their own `mail`.
It also never overwrites an existing `ldap_uid`.

**Why search-then-bind rather than a DN template?** Students and staff are
likely in different OUs, and the layout is unknown. A subtree search for the
username works for any layout, at the cost of perhaps needing a read-only
service account (`LDAP_BIND_DN`).

**Details worth keeping:**

- **An empty password is refused before binding.** An empty password is an
  unauthenticated bind, which many servers report as success.
- **Unknown user and wrong password share one message.** "Not registered" only
  appears after the password is proven.
- **`LDAP_URL` without `LDAP_BASE_DN` throws** rather than falling back to the
  published dummy passwords.
- **Usernames may contain `@`,** because some directories log in by `mail` or
  `userPrincipalName`. The "not your email address" hint only appears when the
  attribute is not one of those.
- **The per-username throttle reuses the console lock's in-process counter.**

**Cost.**

- **The session is still an unsigned cookie**, so LDAP proves who typed a
  password, not who holds the cookie. Signing it remains roadmap item 1.
- **Anyone who reads the repo has the dummy passwords.** Deploying without
  `LDAP_URL` is as open as the picker ever was.
- **Hosted Supabase needs migration 12** before LDAP sign-in finds anyone there.

**Rejected alternatives:**

- **Keeping the email form alongside LDAP.** Two password forms for one
  institute is confusing, and the user asked for LDAP + Google.
- **Wiring Google OAuth now.** The user asked for the mock to stay while
  developing.

## Two data stores behind one interface

**Decision.** Define `DataStore` and implement it twice (JSON mock, Supabase).

**Why.** `npm install && npm run dev` works with zero external setup, which
matters for a handover to the Administration Section and for anyone reviewing the
project. It also forced the data access surface to stay explicit and small.

**Cost.** Every new operation must be written twice. This is real friction and is
called out as a rule in `AGENTS.md`.

**Rejected alternative.** Supabase-only with a local Docker instance — simpler
code, but a heavier barrier to a first run.

## Data-driven forms instead of hardcoded ones

**Decision.** Describe each role's form as a `RoleFormConfig` record, resolved at
request time, and edit it from the Form Builder UI.

**Why.** The spec's field lists will change — a field becomes optional, a new
question is needed for one category. Hardcoding means a developer and a redeploy
for each change; the Administration Section should be able to do it themselves.

**Cost.** More indirection: reading `booking-form.tsx` no longer tells you what a
student sees. Two mitigations — the same config drives client *and* server zod
schemas so the rules cannot diverge, and the resolution order is documented in
`AGENTS.md` and [20-architecture.md](20-architecture.md).

**Consequence to remember.** Editing `buildDefaultFormConfig` has no effect on a
role that has a saved config row.

## Manager approval only through room allocation

**Decision.** `reviewBooking` refuses manager approvals; the manager approves via
`allocateRooms()`, which assigns rooms and sets `APPROVED` together.

**Why.** An approved booking with no rooms assigned is a broken state that would
have to be handled everywhere downstream. Making it unrepresentable is cheaper
than validating against it.

**Cost.** The manager's flow is different in kind from the other reviewers', which
is mildly surprising until you know why.

## One approval log for every approver, not one per role

**Decision.** A single `/history` route shared by wardens, faculty advisors, the
IAR cell, the manager and the developer, with `historyScope()` deciding what
each may see — rather than four role-specific log pages.

**Why.** The reviewer *queues* already work this way (one `ReviewQueue`
component, three scopings). The log has the same shape: identical UI, different
slice of data. Four pages would be four places to fix every future bug.

**Cost.** The scope function has to be right, because it is the only thing
separating a warden from the whole archive. It is a pure function with tests,
and it is spread last when criteria are built so the URL cannot widen it.

## Search matching lives outside the stores

**Decision.** Put the tokenizer, matchers, faceting and paging in
`lib/booking-search.ts` as pure functions. Both `MockStore` and `SupabaseStore`
fetch candidates their own way and then call the same `runBookingSearch()`.

**Why.** The standing rule is that every data operation must be written twice —
and that is exactly where the two backends drift apart. Writing the *rules* once
and only duplicating the *fetch* shrinks the duplicated surface to a few lines
per store.

**Cost.** Supabase does less filtering in the database than it could. Accepted:
keyword matching spans joined tables, so most of it could not be pushed down
anyway. The scan cap plus a `truncated` flag keeps that honest.

**It paid for itself immediately.** The one predicate that *was* pushed down
(`statuses`) silently broke facet counts on Supabase while the mock store stayed
correct — see [25-troubleshooting.md](25-troubleshooting.md).

## Search state lives in the URL

**Decision.** Every filter is a query parameter, parsed and validated
server-side; the page is a server component that runs the search.

**Why.** Searches become bookmarkable and shareable ("here is the booking I
approved in March"), the server never trusts the client, and result payloads
stay proportional to one page instead of shipping the whole archive to the
browser.

**Cost.** Each filter change is a navigation rather than an instant local
re-filter. Mitigated with `useTransition` so the current results stay on screen,
dimmed, while the next page loads.

## Custom-field answers snapshotted onto the booking

**Decision.** Store each answer with its label and type on the booking itself,
rather than referencing the current form config.

**Why.** Admins edit forms over time. A reviewer looking at a six-month-old
booking must see the question that was actually asked, not today's version.

**Cost.** Duplicated label text per booking. Negligible, and it makes bookings
self-describing.

## Denormalized `action_by_name` in the audit log

**Decision.** Store the actor's display name on each log row; keep `action_by`
nullable with `on delete set null`.

**Why.** Deleting a departed warden's account must not erase who approved what.

## Free-form guest house names

**Decision.** Drop the original `check (name in ('Bageshri','Hamsanandi'))`
constraint.

**Why.** Admins can create guest houses from the console; a database constraint
listing two names would make that feature fail confusingly.

**Consequence.** Any code assuming exactly two guest houses is a bug. `/manager`
already guards the zero-guest-house case.

## Number inputs keep a raw string

**Decision.** `components/ui/quantity-input.tsx` stores the typed text,
including the empty string, and leaves validation to the caller. No component
may bind a number input to a coerced value.

**Why.** The guest-count box was `value={fields.length}` with
`onChange={e => setGuestCount(Number(e.target.value) || 1)}`. Selecting the "1"
and deleting it produced `""`, `Number("")` is `0`, `|| 1` snapped it back to
`1`, and the box became uneditable — the spinner arrows were the only way to
change it. Reported directly as bad UX, and it is the same class of bug as the
native time input.

**Cost.** Validation moves to the caller, so an empty box needs its own error
path. `countField` in the zod schema reports "Number of rooms is required" for a
blank field rather than `z.coerce.number()`'s misleading "At least 1 room".

**Detail.** The input is `type="text"` with `inputMode="numeric"` rather than
`type="number"`, which gives full control of the string and still shows a
numeric keypad on mobile; explicit −/+ buttons replace the spinner.

## Custom time picker instead of native inputs

**Decision.** Ban `datetime-local` and `type="time"`; use
`components/ui/time-select.tsx` (hour / minute / AM-PM dropdowns).

**Why.** Firefox renders native time inputs as type-only fields, which users read
as "I can't select the time" — this was reported directly during testing.

**Cost.** A controlled component with 12-hour ↔ 24-hour conversion, which is
exactly where such widgets break. The conversion helpers are exported and were
verified against the 12 AM / 12 PM edge cases.

## Native `<select>` over Radix Select

**Decision.** `components/ui/native-select.tsx` is the standard dropdown.

**Why.** This shadcn registry ships no `form` component, and Radix's Select does
not integrate with react-hook-form's `register()` without a controller wrapper
per field. A styled native select works everywhere, is keyboard- and
mobile-friendly, and supports type-ahead.

## Branding copied from the official dashboard (superseded 19 Sep 2026)

> Replaced by the guest house design handoff's navy/gold palette — see
> "UI redesign from the design handoff" at the end of this file. Kept for the
> history. **Then replaced again (26 Sep 2026)** by iitpkd.ac.in's own
> palette — ink, vermilion and the emblem's saffron; see "26 Sep 2026 — the
> public site redesigned" at the end of this file.

**Decision.** Take the palette and logo from https://dashboard.iitpkd.ac.in/
verbatim, including white-on-amber buttons.

**Why.** The portal should look like it belongs to the institute.

**Cost.** White on `#f7a600` is low contrast by WCAG. Accepted deliberately for
visual consistency; the fix (dark `--primary-foreground`) is documented in
[21-implementation.md](21-implementation.md).

## Print-Optimized HTML for PDF Reports

> **Superseded** by "The PDF export is a real PDF" below (jsPDF, downloaded
> as a file).

**Decision.** The `/history` PDF export generates a print-optimized HTML string server-side, opens it in a new window, and triggers the browser's `window.print()` dialog.

**Why.** Generating a true PDF server-side would require heavy dependencies like Puppeteer or `pdfkit`, which adds significant complexity to a Next.js serverless deployment. A styled HTML table printed to PDF by the user's browser provides excellent quality without backend overhead.

## The parent rule is config, not a role check

**Decision.** Express "siblings and grandparents only when a parent is staying"
as two arrays on `RoleFormConfig` (`parent_relationships`,
`dependent_relationships`) evaluated by one shared function, rather than an
`if (role === "student")` branch against hardcoded option names.

**Why.** The relationship options are already editable from the Form Builder. A
hardcoded rule matching the literal strings "Mother" and "Siblings" would break
silently the first time an admin renamed one — and breaking silently is the
failure mode this codebase has been burned by before (see the facet-count bug).
Making the rule reference the same list the dropdown renders means the two
cannot disagree.

**Cost.** Two more fields on a jsonb blob, a Form Builder section to edit them,
and a sanitizer that has to handle three degradation cases: a row saved before
the feature existed, an option renamed out from under the rule, and every parent
option removed. The last one deliberately **disables** the rule rather than
leaving options nobody can select.

**Rejected alternative.** Enforce it only in the UI. The zod schema is built on
both sides from the same config, so a crafted request would have sailed past a
client-only check — the same reasoning that made the field modes server-enforced.

## Advance-booking window exempts officials only

> **Updated.** `isAdvanceWindowExempt()` now also exempts `gh_manager` and
> `developer` — the desk books what the institute has already committed to —
> and the window is a Setting (Phase 1).

**Decision.** Cap check-in at one month ahead for every requester category
except `official`.

**Why.** The guest houses cannot commit rooms a year out, and an unbounded
window fills the calendar with speculative bookings that nobody cancels.
Officials are exempt for the same reason they bypass intermediate review:
dignitary visits are scheduled by the institute on its own notice, and the
manager needs to be able to hold rooms for an inspection committee whenever it
is announced.

**Cost.** A requester who genuinely needs a longer lead time has no path except
asking the office. Accepted — that conversation was happening anyway, and the
alternative is a per-role window setting nobody would tune.

**Detail worth keeping.** The cap is on check-in, not check-out: a stay
beginning inside the window may run past it. And it uses date-fns `addMonths`,
which clamps 31 January to 28 February; `setMonth` would have rolled it to
3 March.

## Availability is a third store method, not a reuse of the second

**Decision.** Add `listRoomOccupancy()` returning (room, booking, period)
segments, rather than making the availability grid call `getOccupiedRoomIds()`
once per hour or widening that method's return type.

**Why.** `getOccupiedRoomIds` collapses to a set of ids, which is exactly right
for "can I allocate this room" and useless for drawing when a room is taken.
Twenty-four calls per day per guest house would have been the alternative.

**Cost.** A third occupancy query to keep in step with `ROOM_HOLDING_STATUSES`
across both stores. Mitigated by checking the new method's room set against
`getOccupiedRoomIds` for the same window — if they ever diverge, that is a bug
in one of them.

**Related decision — hour bucketing lives in `lib/`.** Same reasoning as
`lib/booking-search.ts`: the interesting behaviour is at the boundaries (does an
11:00 checkout free the 11 AM cell?), and behaviour that subtle has to be
reachable by a test rather than buried in a client component.

## Availability shows periods to everyone, names to staff

**Decision.** `/availability` is open to every signed-in role, but
`requester_name` and `purpose_of_visit` are stripped for anyone who is not
`gh_manager` or `developer`.

**Why.** The grid exists to answer "is anything free that week", which needs no
guest identity. Publishing who is in which room to the entire institute would
have been a privacy regression on a system that already holds ID scans — the
opposite direction from the DPDP work in the production plan.

**Cost.** The manager's view and a student's view of the same data differ, so
the filtering has to happen in one place. It does: the store populates the
fields and the action removes them.

## Room occupancy moved into the database

**Decision.** Replace `bookings.assigned_room_ids uuid[]` with a `room_holds`
table carrying a `tstzrange` and an exclusion constraint, and drop the array
column rather than keeping it as a fallback.

**Why.** `allocateRooms()` re-read occupancy and then wrote. That is
check-then-act: correct for one manager, wrong for two, and wrong for one
manager who double-clicks. No amount of application code closes it, because the
gap is between the read and the write. Postgres can make the bad state
unwritable, so it should.

The bigger win was the invariant that came with it — *a row exists exactly while
the booking holds the room*. `ROOM_HOLDING_STATUSES` had been a filter that
every occupancy query, the room grid and the availability grid each had to
remember to apply. Now releasing rooms is one rule in `updateBookingStatus`, and
the queries are plain reads.

**Cost.** A third occupancy concept to keep in step across two stores, and the
mock store has to emulate an exclusion constraint. That emulation is honest,
though: the mock is single-process and writes synchronously, so a check
immediately before the write really is atomic there.

**Rejected alternative.** Keep the array column for one release as a read-only
fallback, as the production plan suggested. Two sources of truth for the same
fact is exactly what this change existed to remove, and the app is not yet in
production, so the fallback would only have been something to drift.

**Consequence.** `allocateRooms()` deliberately does **no** pre-flight clash
check. Adding one back would reintroduce the race it was written to remove;
losing the race is reported through `RoomClashError` instead.

## Infants are guest rows, not a count (superseded an earlier decision — and was itself superseded by migration 7, below)

**First decision, migration 3 — wrong.** `bookings.infants` as an integer, on
the reasoning that a guest row wants an Aadhaar number and an ID upload, neither
of which a two-year-old has, so infants should not be guests at all.

**What that got wrong.** It conflated "needs no ID" with "needs no record". The
guest house keeps a register, and the office wants the child's **name, age and
gender** on it like anyone else — a bare count cannot carry that, and a child
who is physically in the building was invisible to every reviewer view.

**Second decision, migration 4 — current.** `booking_guests.is_infant boolean`.
Infants are ordinary guest rows; only the **ID number and ID document are
waived**, and they occupy no bed.

**Why an explicit flag rather than `age < 10`.** The two answer different
questions. Age is a fact about the guest; `is_infant` is a decision about
whether they take a bed. Deriving it would also silently waive ID the moment
someone corrected an age, which is not a thing that should happen implicitly.
The app does check that a guest marked infant is actually under the limit.

**Consequence to remember.** Capacity maths uses `countBedGuests(guests)`, never
`guests.length`. Getting that wrong over-books every room by the number of
infants. A booking with **only** infants is refused — someone has to be on a bed.

## Infants are one switch on the booking (supersedes infant guest rows)

> **Superseded** by migration 11 (Sep 2026): infants are guest rows again,
> classified from the age typed (under 5), with the combined per-room limit of
> 23 Sep 2026. `has_infant` survives as a derived summary and for bookings made
> between migrations 7 and 11.

**Decision (15 Sep 2026, migration 7).** Replace the per-guest "Infant"
checkbox with one **"Infant accompanying"** switch for the whole booking,
`bookings.has_infant`. No count, no names, no ID.

**Why.** The guest house office asked for it in so many words: instead of the
option to add multiple infants, a single toggle saying an infant is going to be
there, irrespective of the number. The guest-row model optimised for a register
line per child; what the office actually wants is to know that a child is
coming, and the rows made requesters type a toddler's name, age and gender and
reason about which boxes an infant waived.

**What survives from the previous decision.** Infants still share a guardian's
bed and never count against capacity. With no rows at all the rule gets simpler
for new bookings: every guest row is a bed and follows the role's ID rule, and
the switch cannot change the guest ceiling.

**Why the old column stays.** Rows written under migration 4 are real infants.
Dropping `booking_guests.is_infant` would turn them into bed-occupying adults on
bookings that may still be awaiting allocation. So the column remains (commented
as legacy), new bookings write `false`, `countBedGuests` still excludes those
rows, and `hasInfant(booking)` / `describeParty(booking)` read both shapes —
"2 guests + 1 infant" for an old booking, "2 guests, with infant(s)" for a new
one. Migration 7 backfills the flag from the rows; the mock store does the same
on load, and the Supabase store derives it when the column is not there yet.

**Cost.** New bookings no longer record infants' names or ages — a trade the
office made explicitly. The PDF report's "Infants" total became **"With
infants"** (bookings, not children), because the count no longer exists.

**Rejected.** An infant *count* on the booking. That was the first model
(migration 3), and "irrespective of the number" rules it out.

## Room capacity is expressed as "with an extra bed"

**Decision.** `ROOM_CAPACITY[type]` is `{ standard, withExtraBed }`, and the UI
says "sleeps 2, 3 with an extra bed" rather than "3 max".

**Why.** The third occupant of a double is not a property of the room, it is a
bed somebody has to physically roll in. Naming the field `max` hid that: the
manager saw a capacity number and no indication that anything had to be
arranged. `extraBedsNeeded()` now tells them how many, on the allocation screen.

**Cost.** A rename that touched every capacity call site, done while the feature
was days old rather than after the vocabulary had set.

**Wording revised (15 Sep 2026 meeting).** The office read "sleeps 2, 3 with an
extra bed" in the Review & Allocate dialog as too informal and asked for it to
be made professional or removed. It was kept and rewritten rather than removed:
the extra-bed count is operational — someone has to roll a bed in — and the
dialog is the only place the manager sees it. `describeCapacity()` now returns
"Occupancy: 2 guests (maximum 3 with an extra bed)", section headings are
"Double sharing rooms" / "Single rooms" with that line beneath, and the
allocation summary became four labelled figures (rooms selected, guests,
capacity of selection, extra beds required) instead of a run-on sentence. The
error messages moved to the same register ("can accommodate at most…", "Please
select an additional room").

**Bug found on the way.** The dialog computed extra beds with
`extraBedsNeeded(guests, roomCount)`, which assumes double rooms, so two guests
in one *single* room reported 0 extra beds. It now uses
`extraBedsFor(guests, selectedRooms)`, counted against the rooms' real types;
`extraBedsNeeded` stays for the booking form, where no rooms exist yet.

## Room capacity varies by room type

> **Updated (23 Sep 2026).** Still how allocation is checked, but both guest
> houses are now **all double sharing**, so the single-room row only matters
> for older data. The per-room-card rule at submission is separate — see "The
> per-room rule is a combination" below.

**Decision.** A double sleeps 2 (3 at a stretch), a single sleeps 1 (2 at a
stretch), rather than one flat "2, max 3" for every room.

**Why.** The requirement was stated as "2, at most 3 in one room", but the
schema has always distinguished `single` from `double_sharing`, and putting
three people in a single room is not what the guest house means by a single.
Per-type capacity honours the intent for the room type that dominates and stays
sensible for the other.

**Cost.** One more table to keep in mind. It is one exported constant in
`lib/occupancy.ts`; flattening it to a uniform 2/3 is a one-line change if the
Administration Section wants that instead.

## The PDF export is a real PDF

**Decision.** Generate the report client-side with jsPDF + autotable and
`doc.save()` it, instead of returning styled HTML for the browser to print.

**Why.** The old flow opened a popup, wrote HTML into it and called `print()`,
which meant popup blockers, a file named like a report but ending `.html`, and a
"now choose Save as PDF" instruction. It also decoded the document with
`atob()`, which is Latin-1 — so every em dash in the report arrived mangled.
"Download as PDF" should download a PDF.

**Cost.** Two client dependencies (~400 KB), dynamically imported so they only
load for a manager or developer who actually clicks Export. jsPDF's built-in
fonts are WinAnsi, so `pdfSafe()` maps typographic punctuation to ASCII and
drops anything outside Latin-1 — a real Unicode font would add ~700 KB for
content that is romanised in practice.

**Kept.** The server action still re-derives the user, scope and filters from
the query string and returns *data*, not markup. The export can no more exceed
what the caller may see than it could before.

## A password on the developer console, enforced in the action layer

> **Updated.** The console now serves the manager too (9 of 13 sections,
> `requireConsole(section)`), the unlock throttle is in the database (6 per 15
> minutes), and since Phase 8 identity is a real session with a second factor
> for developers — so this password is one layer among several, not the only
> guard.

**Decision.** Gate `/admin` behind a console password (default `0000`,
changeable in-console), and check it inside `requireDeveloper()` rather than
only in the layout.

**Why the action layer.** Hiding the console behind a page check would have been
a five-line change, and worthless: this codebase's own rule is that the UI
hiding a button is never the security boundary. Every admin mutation already
funnels through `requireDeveloper()`, so adding the check there means a crafted
request with a developer persona cookie and no unlock gets nothing.

**Why the unlock cookie is signed with the password hash.** It gives password
rotation for free — change the password and every outstanding unlock stops
verifying, with nowhere to track sessions. The alternative, a server-side
session table, is real infrastructure for a demo guard.

**Why scrypt rather than a plain comparison.** Node ships it, so no dependency,
and the hash sits in a database the developer console can dump. A stored
plaintext `0000` would have been a plaintext password in an exportable table.

**What it costs — and what it is not.** Identity is still a persona cookie, so
anyone can claim to be the developer; this only stops casual poking during a
demo. It must not be described as securing the console, and it does not shorten
the real work in [05-production-plan.md](05-production-plan.md) Phase 1. The
throttle is in-process, so it resets on restart and does not span instances.

**Degradation.** A missing `app_settings` table falls back to the default
password instead of throwing — the same lesson as the stale session cookie: the
one page that could fix the problem must not be the page that crashes.

## Booking Lifecycle Expansion

**Decision.** Added `OCCUPIED` and `VACATED` to the end of the approval pipeline, and shifted cancellation flow to `CANCELLATION_REQUESTED` → `CANCELLATION_APPROVED` for approved bookings.

**Why.** A booking doesn't end when it's approved; the Guest House Manager needs to track live occupancy and release rooms when guests depart or cancel. The `ROOM_HOLDING_STATUSES` grouping (`APPROVED`, `OCCUPIED`, `CANCELLATION_REQUESTED`) ensures room capacity logic dynamically respects real-world occupancy.

## All wall-clock times are institute time, not the runtime's

**Decision.** Pin the whole app to `Asia/Kolkata` in `lib/tz.ts`. Instants stay
ISO/UTC in storage; exactly two operations are zoned — parsing a wall-clock time
the user typed (`instituteIso`) and rendering an instant back
(`formatInstitute*`, `instituteHour`, `instituteDayBounds`). `lib/format.ts`
delegates to it, so callers cannot get it wrong by forgetting.

**Why.** This was a live bug, not a precaution. `toIso()` was
`new Date(datetimeLocal).toISOString()`, and the ECMAScript spec resolves a
naked `"2026-09-15T12:00"` in the **process** timezone. That is correct on a
developer machine set to IST and wrong everywhere else. On a UTC host a 12:00
booking was stored as `12:00Z` and the Guest House Manager's console read it
back as 5:30 PM, a 10:00 check-out as 3:30 PM — reported as "the time is 05:30
and 3:30, it should be what the user has given".

**Why a fixed zone rather than the viewer's.** The guest house is one building.
"Check in at 12:00" means 12:00 there, and a warden reading the same booking
from anywhere must see the same number. Rendering in the *viewer's* zone would
have made the manager and the requester disagree about a single fact.

**Why not just `process.env.TZ`.** It fixes the server and leaves every browser
outside IST wrong, and it makes correctness depend on a deploy setting rather
than on the code. Explicit `Intl` zones also removed the SSR/hydration mismatch
class for free: a server-rendered date and its client hydration now agree even
when the two machines are in different zones.

**What it costs.** Two rules to hold: never `new Date(<naked datetime string>)`,
never format without a zone. `date-fns` `format` is no longer usable for
display. And the bug leaves a tail — rows written during the UTC window are
still stored 5h30m late, so the code fix needed a data repair beside it
(`supabase/repairs/2026-09-10-utc-parsed-bookings.sql`), which also has to
rebuild `room_holds` because `during` is derived from the booking's dates.

**What we got wrong the first time round.** [05-production-plan.md](05-production-plan.md)
Phase 3 predicted this bug and prescribed "add it to `lib/format.ts` and test
with `TZ=UTC npm run build`". Both halves were insufficient: fixing only
formatting leaves the *parse* wrong, which is the half that corrupts stored
data, and a build renders no user-entered times so it catches nothing. The test
that works is running the domain logic under a non-IST `TZ`.

## Meals are one jsonb column, not three booleans

**Decision.** `bookings.meals` is a single jsonb object
`{breakfast, lunch, dinner}` (migration 6), read only through
`normalizeMeals()`. *Revised by migration 8: the column stays, but its value is
now a per-day plan — see "Meals are chosen per day" below. The reasoning here
still holds for the column itself.*

**Why one column.** It is one answer to one question and is always consumed as a
set — the kitchen reads "table for four, breakfast and dinner". Three boolean
columns would have spread one concept across three places in the row type, the
insert type, both stores and every display. `custom_fields` is already jsonb for
the same reason.

**Why `normalizeMeals` is mandatory on read.** Bookings predate the field, so
the honest value for them is "none requested" rather than an error; the mock
store's JSON file gets hand-edited; and a `check` constraint protects Postgres
but not the mock backend. Normalising during hydration in both stores means
`Booking.meals` is always a complete object and no consumer downstream needs a
null check.

**Why always optional.** "No meals" is the common answer. Giving meals a
`FieldMode` in the form config would have implied a role could be *required* to
order dinner.

**What it costs.** Meals cannot be filtered or aggregated in SQL as cheaply as
columns could. If the kitchen ever wants "how many breakfasts next Tuesday" as a
query rather than a report, this becomes a jsonb expression index or a
generated column.

## The manager console groups stays by phase, not by status

**Decision.** Split the single "Upcoming & current stays" table into **Current
occupants**, **Awaiting check-out** and **Upcoming stays**, driven by
`stayPhase()` (`current` | `past` | `upcoming`) rather than by booking status.
Separately, refuse `APPROVED → OCCUPIED` before the booking's check-in
(`occupancyNotStartedError`), server-side, with the console disabling the button
from the same function.

**Why.** Status and time are different facts and the old table conflated them. A
booking approved for next week sat in the same list as a guest in the building,
and because a manager could mark anything Occupied at any time, a future stay
could genuinely carry the `OCCUPIED` badge — which is what was reported. Grouping
by phase makes the common question ("who is in the building right now?") a
heading rather than a scan.

**Why `OCCUPIED` needs a guard at all.** It is a fact recorded at the desk — the
guest walked in — not something a date implies. Letting it be set early makes the
current-occupants list and the availability grid both lie about the building.

**Why "Awaiting check-out" is its own section rather than part of current.** A
stay past its check-out that nobody marked Vacated is still holding its rooms, so
it cannot be hidden. But counting it under "Current occupants" would be the same
category error the split exists to remove. Its own section with a red count also
turns the long-standing no-show problem
([05-production-plan.md](05-production-plan.md) Phase 3) from invisible into
visible.

**What it costs.** Three tables where there was one, and the phase is computed at
request time, so a stay crosses between sections on the next poll rather than
live.

## The allocation grid is locked to the booking's own dates

**Decision.** `components/room-grid.tsx` reads occupancy for the booking's
`check_in`/`check_out` and nothing else. Its date and time pickers are gone, and
rooms held for any part of the stay render `disabled`.

**Why.** The pickers let the manager change the window the grid *displayed*
while `allocateRooms()` always wrote holds for the booking's *real* dates. Shift
the window past a conflict and an already-allotted room turned green, invited a
click, and then failed. The write was never unsafe — the `room_holds` exclusion
constraint refused it — but the grid was offering rooms allotted to someone else,
which is what "the same room can be allotted to a different person" described.

**Why remove the control rather than fix the query.** The control had no job left
once the occupancy query was correct: allocation is always for one fixed period,
and browsing other dates is what `/availability` is for. Keeping it would have
been a second way to ask the same question, which is how the two answers came to
disagree.

**What it costs.** A manager who wants to see the room's wider calendar leaves
the dialog. That is a real regression in convenience, and the fix if it bites is
a read-only link to `/availability`, not the pickers back.

## Per-tab session guard — built, then reverted

> **Updated.** `components/auto-refresh.tsx` was replaced by
> `components/live-updates.tsx` in Phase 9 (realtime where Supabase is
> configured, a 30 s poll otherwise). The advice — don't rebuild the guard —
> stands.

**Decision.** Do **not** try to make browser tabs behave like independent
sessions. `components/tab-session-guard.tsx` was written and removed the same
day; the app polls with `components/auto-refresh.tsx` as it always did.

**What it did.** Each tab recorded who it believed it was signed in as in
`sessionStorage`. When the server-rendered user later disagreed, the tab was
covered with a "This browser switched user" panel and its 5 s polling stopped,
so it froze with an explanation instead of quietly re-rendering as someone else.

**Why it was reverted.** Two reasons, both from using it:

- **The overlay was intrusive.** It interrupted a real, deliberate action —
  switching persona — with a modal explaining something the user already knew.
  A demo tool blocking the demo is worse than the behaviour it was guarding.
- **It cost every page load.** The guard mounted in the portal layout, so a
  concern that only arises when someone deliberately opens two personas was
  paid for on every navigation by everyone.

**The constraint that has not changed.** A cookie belongs to the browser, not to
a tab, so signing in anywhere changes every tab, and with polling the others
follow within seconds. Nothing in the UI can fix that; the session token has to
move somewhere per-tab, which is a change to authentication itself
([05-production-plan.md](05-production-plan.md) Phase 1). Until then the honest
answer is a private window or a second browser profile.

**So: do not rebuild this.** If tab bleed is raised again, the options are
per-tab sessions as part of real auth, or documenting the private-window
workaround — not another client-side guard.

## Week and month availability keep time running down

**Decision.** `/availability` gained Week and Month views (15 Sep 2026 meeting)
that keep the day view's axes — rooms across, time down — with one row per day
and time also running down *inside* each row, so a booking is one continuous
bar (`RangeOccupancyChart`, `bucketOccupancyByDay`).

**Why these axes.** A hotel "tape chart" puts rooms down and dates across, and
reads well on its own. But the day view — which every role already knew, and
which the booking form embeds — has rooms across and hours down. A switch that
rotated the picture would make Day → Week feel like a different chart instead
of a zoomed-out one. Keeping time vertical at both scales also makes continuity
free: a stay from noon Monday to 10:00 Wednesday is one bar starting halfway
down Monday and ending partway down Wednesday.

**Why a bar per booking rather than a colour per day.** Check-in and check-out
days are almost always partial — a noon check-in leaves the morning free — so a
"partly booked" colour would have been the commonest state while saying nothing
about *which* part of the day was free. The bar shows it; the per-day "N free"
figure and the per-room badge carry the counts.

**Why one bucketing for every view's badges.** The day view's badge used to
read "Occupied" when all 24 hour *cells* were touched, which a 00:30–23:30 stay
also satisfies. Badges now come from booked minutes (`roomRangeStatus`) in all
three views.

**Why "Booked", not "Booked / occupied".** A hold is a reservation; `OCCUPIED`
is a status the manager records when the guest arrives. Labelling red
"occupied" on a future date is the same confusion the manager console's phase
split removed, so the legend, badge and counts all say "booked".

**Cost.** A second chart component and a second bucketing function. The action
also gained a cap (`MAX_AVAILABILITY_DAYS`, 62): every signed-in role can call
it, and without one a single request could read every hold ever written.

**Rejected.** Seven or thirty one-day requests per view — one wider
`listRoomOccupancy` call returns the same segments.

## Meals are chosen per day, and only meals served during the stay are offered

**Decision (15 Sep 2026, migration 8).** Replace the single breakfast / lunch /
dinner answer with a per-day plan: a days × meals grid in the form, stored as
`[{date, breakfast, lunch, dinner}]` in the same jsonb column. A day offers a
meal only if that meal's serving window overlaps the stay.

**Why per day.** Reported directly: booked for two days and wanting breakfast on
one of them, a requester had no way to say so — "one selection for all days".
The kitchen's real question is how many breakfasts on Tuesday, which a
whole-stay answer cannot give.

**Why gate by serving window.** Without it the grid offers breakfast on a noon
arrival day and dinner on a 10 AM departure day, and one "Every day" click
orders meals nobody will eat. The serving times were already on screen
(`MEAL_TIMES`); they are now also the rule (`MEAL_SERVING_WINDOWS`), with the
labels derived from the windows so the two cannot disagree. Half-open like room
holds, so a 07:30 departure misses breakfast and a midnight check-out adds no
day.

**Why still one jsonb column.** Same reasoning as before — it is read and written
as a whole. Storing only days that have a meal keeps "no meals" as `[]`.

**Why convert old rows instead of living with two shapes.** Migration 8 expands
each old whole-stay answer over the stay's days with the same windows, in SQL,
so the column has one shape and per-day questions can be asked in SQL. The
`check` constraint then enforces that shape. `normalizeMeals` still reads the
old shape — for mock databases, and for a Supabase project where migration 8 has
not run yet — with the identical rule; both were run on the same fixtures and
agree.

**Why ticks live outside react-hook-form.** The grid's rows are derived from the
dates, so RHF field paths would shift under the user as dates change. A `Set` of
`"date|meal"` keys survives that, and `mealPlanFromSlots` drops whatever the stay
no longer covers at submit time; changing the dates back restores earlier ticks.

**Why every meal starts ticked.** The meeting notes asked for it, and it is the
common case — a guest staying in the guest house usually eats there, so the
kitchen would rather correct a head count than be surprised by one. Done in a
later round than the grid itself.

**Why the form holds the opt-outs, not the ticks.** The grid's rows follow the
stay dates, so a default of "on" has to survive a date change. Holding the
declined slots makes that fall out: a day that comes into range has nothing
against it and arrives ticked. Holding ticks instead would mean back-filling
them whenever the stay grew, and back-filling cannot tell a meal the requester
unticked from one that was never offered — it would silently re-tick the first.
`declinedFromMealSlots` only reconsiders slots currently on screen, so an
opt-out for dates the stay no longer covers survives and comes back with them,
mirroring what `mealPlanFromSlots` already does for ticks.

**Cost.** A bigger form card, a data-converting migration, and a jsonpath check
constraint instead of three key checks.

## Which guest houses serve meals is a flag, not a name

**Decision.** `guest_houses.serves_meals boolean` (migration 8) — on for
Hamsanandi, off for Bageshri, toggled in the developer console — rather than
`if (guestHouse.name === "Hamsanandi")`.

**Why.** Guest house names are free-form and editable (see "Free-form guest
house names" above). A name check would silently stop offering meals the day
someone renamed the building, and a new guest house could never serve meals
without a code change. The same meeting asked that the developer console be able
to change rules like this without an IT person.

**Where the name still appears.** Only as the one-time default: migration 8's
backfill, `supabase/seed.sql`, the mock seed and the mock store's self-heal for
old `.local-db.json` files — the role `buildDefaultFormConfig` plays for
"students book Bageshri".

**Enforcement.** The form shows the meals card only if some guest house the role
may book serves meals, and explains when the chosen one does not;
`createBooking` refuses a non-empty plan for a guest house with the flag off.
Before migration 8 the Supabase store reads the flag as false, so the card
disappears rather than offering meals that could not be saved.


---

## 16 Sep 2026 — meeting follow-ups

### Booking type is a column, not a role

**Options:** (a) new roles `employee_official` / `employee_personal`; (b) a
`booking_type` column on `bookings`; (c) an admin-defined custom field.

**Chose (b).** The same person books both ways, so (a) would have forced two
accounts on one member of staff. (c) would have made the approval route depend
on a free-text answer a developer could rename. `bookingTypesFor(role)` in
`lib/booking-types.ts` is the single policy, and a role with one option is
never shown the question — a toggle with one position is not a decision.

### The IAR Office both books and approves; the Student Cell only books

The office asked for the IAR Student Cell to raise requests (for its own office
or for an alumnus) with **approval going to the IAR Office**, and for the IAR
Office itself to book with **no approval step**.

So `iar_cell` appears in both `REQUESTER_ROLES` and `REVIEWER_ROLES`.
`initialStatusFor(role, type)` sends `iar_student_cell` to `PENDING_IAR` and
`iar_cell` straight to `PENDING_GH_MANAGER` — routing the latter through
`PENDING_IAR` would have it approve itself, which is not a control at all.
`canReview()` additionally refuses `reviewer.id === requester.id`, so that
stays true even if a booking somehow lands in the wrong queue.

`historyScope` for `iar_cell` needed to match **three** categories (Student
Cell, its own, legacy alumni), which a single `userRole` cannot express — hence
`userRoles?: Role[]` on `BookingSearchCriteria`. Like `statuses`, it is never
pushed down to SQL.

### Alumni logins removed, not the alumni role

Alumni have no LDAP account, so the persona and the login are gone. The `Role`
union keeps `alumni` because stored bookings carry it; deleting the enum value
would orphan them. `ARCHIVED_REQUESTER_ROLES` / `BOOKING_CATEGORY_ROLES` keep
those rows filterable in the archive while making them unbookable.

### Caretaker reuses the manager's components

**Options:** (a) a simplified copy of the stays tables; (b) the manager console
with pieces hidden by role; (c) extract the shared tables and compose two
consoles.

**Chose (c).** (a) drifts — two tables showing "the same" thing diverge within
a release. (b) makes the role check a rendering detail, and the office
explicitly wanted reception to see *less*, not the same screen with gaps.
`stays-table.tsx` and `checkouts-today.tsx` are shared; `/caretaker` composes
them and never loads the pending queue at all. The one shared action is gated
server-side by `canUpdateLifecycle()`.

### "Future bookings show as occupied" — fixed on both sides

The write guard already existed in `updateBookingLifecycle`, but the developer
console's force-status override bypassed it, and rows forced Occupied early
were already in the data. So: the override now runs the same
`occupancyNotStartedError()` check, **and** `displayStatus()` /
`describeSegmentStatus()` refuse to render a not-yet-started stay as Occupied.
Fixing only the write would have left the existing bad rows lying to reception.

### Availability inside the booking form became browsable

The panel was locked to the check-in date, which answered "is my date free?"
but not "then what *is*?". It now has Day/Week/Month and date navigation.

The trap avoided: letting the panel own a date that then disagrees with the
booking. `browsed` is stored as `{from, value}` tagged with the check-in date
it was chosen against, so a new check-in makes it stale and the chart snaps
back — derived, not an effect, so the React Compiler lint stays happy. A banner
states that browsing does not change the booking.

### Destructive admin actions

`window.confirm` said nothing about consequences and accepted a stray Enter.
`components/ui/confirm-dialog.tsx` lists what will be lost and requires the
operator to type the guest house name / user email / booking reference.

## Email: a queue between the action and the transport (16 Sep 2026)

Two Administration Section requirements (mail on allocation, the day-wise log)
and one meeting note (single-threaded email) all needed the same missing piece,
so they were built as one: `lib/mail/`.

**The transport is a seam, not a call site.** `Mailer` has one method, and
`getMailer()` picks an implementation from the environment exactly as
`lib/store/index.ts` picks a backend. SMTP today (Gmail with an app password);
the production plan is the institute's own relay, sending as `iitpkd.ac.in`
with SPF and DKIM already correct. That migration should be an `.env.local`
change and nothing else — which is why host, port, from, reply-to and the
Message-ID domain are all variables rather than constants.

The third implementation, `FileMailer` → `.local-mail/*.eml`, exists for the
reason `MockStore` exists: the first run of this project needs no credentials
and no network.

**Nothing sends inside a server action.** Actions queue into `email_outbox`;
`dispatch.ts` sends. Three reasons, the third being the one that fails
silently:

1. A slow SMTP host would add its latency to every booking submission.
2. A failed send must not fail a booking that is already stored.
3. On a serverless host, un-awaited work is frozen the moment the function
   responds, so mail started and not awaited simply vanishes.

Delivery is still prompt: `notify.ts` schedules the dispatch with `after()`
from `next/server`, which runs after the response is out. The cron route is the
safety net, not the normal path.

**The hooks are in the actions, not `updateBookingStatus()`.** The roadmap had
suggested the store method, since every transition funnels through it, and that
was wrong. The store sees a status pair; only the action knows *why* — which
reason the reviewer typed, which rooms were picked, whether a cancellation was
approved or declined. Hooking the store would also have mailed on the developer
console's force-status override, which is a repair tool: a developer fixing a
bad row should not send a parent a confirmation.

**Recipients come from `canReview()`.** Re-deriving "wardens of this hostel" in
the mail layer would be a second copy of the scoping rule, and the two would
drift — the Malhar warden would get mail about Saveri students while still,
correctly, being unable to act on them. It also means nobody is ever asked to
approve their own booking, because `canReview` already refuses that.

**Idempotency is the whole safety story.** A unique `idempotency_key` plus
`on conflict do nothing`, keyed on the booking's `updated_at` for a transition
and on the institute calendar date for a digest. Consequences worth keeping:

- a retried action queues nothing new;
- **the cron schedule is advisory** — a missed 8am run still delivers at 9am,
  and a second run at 9:05 sends nothing. A cron you can safely re-run is a
  cron you can debug;
- two dispatchers never double-send, because claiming is one
  `for update skip locked` statement (`claim_queued_emails`).

**Digests, not per-item mail, for reviewers.** Per-request mail to a warden
during fest week trains them to filter the portal into spam, and then the
portal stops working. One 8am summary does not. The manager is deliberately
*not* digested — their pending allocations are a section of the daily desk
report, and two mails listing the same queue is how a report stops being read.

**The daily log is sent even on a quiet day.** The first implementation skipped
a guest house with nothing to report, which was wrong for a *log*: a missing
report would mean either "nothing happened" or "the cron stopped running", and
the reader could not tell which. It now always sends (unless the guest house
has no rooms yet) and says plainly that the day was quiet. A test caught this.

**`MAIL_REDIRECT_ALL_TO` is applied at send time, not queue time.** The outbox
therefore records who the message was genuinely for, so flipping the variable
changes where mail goes without rewriting history, and the console's outbox
still answers "was the warden *supposed* to get this?". The redirected copy
carries `X-Original-To` **and** a banner in the body — the header is exactly
what nobody looks at when wondering why a test mailbox is full of other
people's bookings.

**HTML and plain text come from one block list.** A template that wrote the two
separately would drift until the text part was wrong, and the text part is what
every HTML-refusing client and every screen reader reads. `render.ts` describes
the content once and renders it twice.

**One thread per booking needs two things, not one.** A deterministic
`Message-ID` derived from the booking id *and* a subject that always leads with
the booking reference — mail clients split a thread when the subject changes,
so the headers alone are not enough.

Two smaller things worth not rediscovering:

- **Gmail app passwords are displayed as four groups of four.** People paste
  the spaces. `mailConfig()` strips whitespace from `MAIL_APP_PASSWORD` only —
  a generic `MAIL_PASSWORD` may legitimately contain a space.
- **`nodemailer` needs `serverExternalPackages`.** It resolves transports with
  dynamic requires and reaches for `net`/`tls`/`dns`, which the Server
  Components bundler cannot follow, and it is not on Next's built-in externals
  list.

## The booking schema accepts its own output (17 Sep 2026)

A bug, and the fix had a choice in it worth recording so the wrong one is not
"fixed" back in later.

**Symptom:** every booking, every role, rejected server-side with zod's
"Invalid input: expected string, received null" — and nothing highlighted in
the form, because the failing paths were `alumni_name` / `alumni_roll_number`,
fields a student's form never renders.

**Cause:** the form validates on the client and sends **`parsed.data`** — the
schema's *output* — and `createBooking` re-parses that with the same schema.
`optionalTrimmed` was `z.string().optional()` with a transform turning blank
into `null`. Its input rejected `null`; its output *was* `string | null`. So
the second pass rejected the first pass's own result.

**Two ways to fix it, and why the other one is wrong:**

1. **Make the transform round-trip safe** — `.nullish()` instead of
   `.optional()`. Chosen.
2. **Send the raw form values instead of `parsed.data`.** Rejected, and this is
   the tempting one. The server would then receive untrimmed strings, `""`
   instead of `null`, and string counts instead of numbers — so
   `NewBookingInput` would get `""` where the database expects null, and the
   trimming and normalisation the store relies on would silently stop
   happening. The client's parse is doing real work; throwing its output away
   to dodge a type mismatch trades one invisible bug for a quieter one.

**The invariant, therefore: every transform in `bookingPayloadSchema` must
accept what it produces.** `countField` already did this deliberately (it takes
`string | number` because the server re-parses its numeric output) and the
guest `age` field did too (`.optional().nullable()`) — `optionalTrimmed` was
simply the one that was missed. Accepting null weakens nothing: the refinements
test these with `!v.alumni_name` and `(g.id_number ?? "").length`, which treat
null as absent.

Guarded by a throwaway suite of 15 checks - the round trip for all six
requester roles, that a third parse is stable, and that the alumni,
required-ID and parent-dependency rules still reject what they should. Worth
keeping when a test runner is installed (roadmap §4).

## UI redesign from the design handoff (19 Sep 2026)

Detail in [16-public-site-and-ui.md](16-public-site-and-ui.md). The decisions, with the options
that lost:

### The public site is a route group, `/` included

**Decision.** `app/(site)/` holds the seven-tab website as real routes, and `/`
is its home page. The portal stays in `app/(portal)/` with its URLs unchanged.

**Why.** The design is a public front door; one URL per tab is what the
handoff asked for and what links, the back button and search engines need.
**Rejected:** keeping `/` as the sign-in page and putting the site at `/site` —
the institute would link the portal's login form as the guest house's home.
**Cost:** every `redirect("/")` in a portal guard had to become
`redirect(SIGN_IN_PATH)`; a new guard that copies an old file and redirects to
`/` will quietly land signed-out users on the brochure.

### Content from the backend, look from the design

**Decision.** Every sentence on the public site that states a rule the portal
enforces is rendered from `lib/` (`lib/site-data.ts`, `lib/site-content.ts`);
only amenities and house rules are literal copy, marked `TODO(site)`.

**Why.** The owner asked for the UI to be based on the backend, and the
prototype's copy contradicted it in places ("seven days in advance" against a
one-month *maximum*; fixed check-in/out times against per-booking times; a
meal-only booking flow that does not exist). A brochure hand-written once
drifts the first time the Form Builder changes who may book where.
**Cost:** the public pages read the store on every request (they are dynamic).

### "Book Meal" tells the truth instead of building a meal flow

> **Updated (19 Sep 2026, merge of `ui` into `main`):** `main` added service
> type `meals_only` (migration 11), so meals without a room now exist for
> `MEALS_ONLY_ROLES`, inside the same `/book` form. `/book-meal` still has no
> flow of its own; its copy now says who can book meals without a room.

**Decision.** `/book-meal` is the design's gated page, but it says meals are
chosen day by day inside the room request at the guest houses that serve them,
lists the serving times, and signs in to `/book`.

**Why.** There is no meal-only booking in the backend; a dining booking is in
the meeting notes as *not started* and needs billing (debitable heads). Building
a UI for it would be building the feature. **Rejected:** hiding the tab — the
design and the office both expect it.

### Institute domain enforced in `signIn()`, subdomains included

> **Superseded (19 Sep 2026):** `signIn()` and the email form are gone (LDAP
> sign-in takes a username). `isInstituteEmail()` is kept for real Google
> sign-in, which must enforce it on the verified address.


**Decision.** `isInstituteEmail()` accepts `@iitpkd.ac.in` and any
`@*.iitpkd.ac.in`; `signIn()` enforces it, the form repeats it.

**Why.** The design requires server-side enforcement, and students sign in as
`@smail.iitpkd.ac.in`, which an exact-match check would have locked out.
**Cost:** a developer-created account on a personal address can no longer use
the credential form (the persona picker still works).

### The portal restyle goes through the tokens, not the pages

> **Superseded in part (26 Sep 2026):** the tokens now point at the
> institute's own palette — `--primary` **ink** `#1A1A1A`, `--ring`
> vermilion, `--radius` 4px — and the "now" marker is ink. The approach
> (restyle through the tokens, not the pages) stands and was used again.

**Decision.** Re-point the shadcn tokens (`--primary` navy, `--ring` gold,
`--radius` 3px, fonts) and add one `PageHeader`; leave every feature component
alone.

**Why.** Dozens of components already speak `bg-primary`, `ring`, `rounded-lg`.
Changing the tokens restyles all of them consistently with no risk to
behaviour; editing each would have been a large diff with real regression risk
in the most-used screens. **Side effect accepted:** the availability chart's
"now" marker turned from amber to navy.

### Photos: resized copies served, originals ignored, no attribution

**Decision.** Serve 2000px, metadata-stripped copies from
`public/site/photos/`; gitignore the 180 MB of originals in `Images/`; group the
Gallery by subject, not by guest house.

**Why.** Originals are 10–18 MB each — unshippable, and bloating git forever.
Nothing says which guest house each photo shows; they probably show Hamsanandi,
but a guest-facing page that is wrong about which building a room is in is
worse than one that does not say. **Rejected:** attributing them to Hamsanandi
on inference.

### The map pins the institute, not the guest house

**Decision.** Use the institute's own Google Maps embed from the handoff, as one
configurable value.

**Why.** No guest-house-specific pin is published. A hand-placed pin would be a
guess; the institute pin is at least correct at campus scale, and replacing it
is a one-line change once the office supplies coordinates.

## Room-scoped guests and Service Types (Migration 11, Sep 2026)

> **Updated (23 Sep 2026).** "3 guests + 1 infant per room" became the
> office's combination: 4 people, at most 3 needing a bed, at most 3 infants
> (migration 23).

**The Problem:** The office required nationality tracking per guest (for Indian vs Foreign), an updated infant threshold (under 5 years instead of under 10), explicit room capacities (3 guests + 1 infant per room), and a "Meals Only" option for faculty/events.

**The Decision:** Shift from a booking-centric guest list to a room-centric guest list (`booking_rooms`).
- Guests belong to a room (`booking_room_id`). This allows accurate per-room occupancy validation.
- `service_type` (`room`, `room_meals`, `meals_only`) dictates whether rooms and guests are collected at all, or just a head count for meals.
- `booking_meals` view created to provide the kitchen with a relational shape of meal plans without duplicating data from the JSON column.
- Existing bookings were migrated into a single "legacy" synthetic room to preserve backwards compatibility, and legacy infant flags were retained untouched.

## Requester details from the academic database (21 Sep 2026)

The owner asked for each kind of account's record in the institute's academic
database to be shown at the top of New Booking, with dummy data until the
database is connected. Full detail: [17-academic-records.md](17-academic-records.md).

### A source seam, like the store, the mailer and the directory

`AcademicSource` has one method (`find(kind, email)`) and two implementations,
picked from `ACADEMIC_DB_URL`. **Rejected:** putting the fields on `profiles`
and seeding dummy values into both stores. That would mean a migration, and a
second copy of data the academic database owns that would go stale every
semester. It would also make "connect the real database" a data-migration job
instead of an environment variable.

### The real source is HTTP on a contract the portal defines

The academic database's shape is unknown, so the portal defines
`GET {url}/records/{kind}?email=` with snake_case fields, and puts every name
mapping in `recordFromJson`. **Rejected:** a direct database driver. It would
be a dependency for a database we have never seen, and a hosted portal is
unlikely to reach a campus database through the firewall. A different
transport is one class away (§4 of the memory file).

### Keyed by institute email

Email is the one identifier every profile and every kind of record carries.
Roll numbers cover students only, and employee ids cover staff only.

### Copy-to approvers come from `canReview()`, not the academic record

The card must name the person the request will actually reach. Routing uses
the portal profile's `hostel_name` / `department_or_club`, so Copy to does
too. It goes through `reviewersOfRequester` (split out of
`reviewersForStatus`), the same rule mail uses. **Rejected:** deriving the
warden from the academic record's hostel. When the two disagree, the card would
name a warden who never sees the request.

### Displayed, not mailed (superseded 21 Sep 2026 — Copy to is now CC; see Phase 2 below)

Per-submission mail to the warden or FA would reverse the "one digest, not one
mail per request" decision above. Mailing the office's HOD is new behaviour
nobody has specified, and the 15 Sep notes suggest the HOD should *approve*
office bookings, which is a pipeline change. Left for the office to decide.

### It must never block a booking

The lookup returns a status instead of throwing. The card falls back to the
profile and streams behind Suspense with a 3 s timeout. Answers are cached in
memory (10 min, or 1 min for an outage) because `/book` re-renders every 5 s.
The cost is that a correction in the academic database takes up to 10 minutes
to show.

### Wardens' card on `/warden`

Wardens never open New Booking, but their fields were on the list. The card
sits below their queue, because the queue is what they come to the page for.

## Production-readiness programme — Phase 1: Settings (21 Sep 2026)

The owner's brief: make the portal production-ready as the public website of
an Institute of National Importance, in ten phases, with no clarifying
questions — pick the sensible option, make it configurable from the developer
console, and log the assumption here. Each phase below records what was
decided and what was assumed.

### Room capacity: both rules, not one or the other (confirmed in the code)

The brief asked whether capacity is per room type (double 2/3, single 1/2) or
the flat "3 guests + 1 infant per room" from migration 11. **It is both, at
different moments**: the flat per-card rule at submission (no room exists yet),
the per-type rule at allocation (the manager has picked rooms). A card of 3 is
accepted, and must then be given a double. Recorded in
[11-booking-forms.md](11-booking-forms.md) and [13-settings-and-defaults.md](13-settings-and-defaults.md). Both are now Settings.

### Scalar rules are jsonb rows; lists are tables

`app_settings` already existed with a jsonb `value`, so each group of scalar
rules is one row (`rules.capacity`, `rules.booking`, `rules.meals`), merged
over the code defaults on read (`parseRuleGroup`). A row saved before a field
existed still reads, so a new setting never needs a data migration. **Lists**
— hostels, the official whitelist — got tables, as the brief asked, because a
list is edited an item at a time and the database can enforce things about it:
`profiles.hostel_name` references `hostels(name)` so a rename cascades and a
hostel in use cannot be removed.

### Rule functions take the rules as a parameter

Rather than a module-level "current settings" (unsafe across requests, and a
second copy on the client), every rule function takes the rules explicitly,
defaulting to `DEFAULT_RULES`. Server pages read them once with `getRules()`
(React `cache()`) and pass the *same object* to the client form and the server
action, so `bookingPayloadSchema` still validates identically on both sides.
The database trigger for the per-card rule reads the same row via
`rule_int()`.

### Legacy meal conversion keeps migration 8's windows

`normalizeMeals` expands the pre-migration-8 whole-stay object. It is pinned to
the original serving windows (`LEGACY_CONVERSION_WINDOWS`), not the Settings,
because the SQL conversion used those; a stored row must keep reading back as
the plan it was converted to.

### A change that would break stored data is refused, naming it

`lib/settings-impact.ts`: lowering a per-card or per-type limit below a live
booking's party, or moving meal times so a booked meal falls outside its stay,
or removing a whitelisted address that an `official` account uses. "Live" =
still pending, or holding rooms for a stay not yet over; past stays are never
re-judged. Nothing is ever silently adjusted to fit.

### Who may change Settings

The console is shared with the Guest House Manager, but the brief says
*developer* console, and these rules can lock people out (the whitelist) or
invalidate bookings. **Settings is developer-only.** Tariffs and invoice
settings (Phase 5) will be a separate section the manager can also use,
because pricing is the office's to run. Departments, clubs and offices stay in
the existing Departments & Clubs section (manager + developer), now with the
office class, a typed-name confirmation on delete, and every change — including
a change of HOD — written to the audit log, because who heads a unit decides
who approves.

**Assumed:** an office nobody has classified is treated as a *department*
office — the narrower debit rule (Department only) rather than the Institute
Grant.

### The audit table arrives in Phase 1, not Phase 8

The brief requires every settings change to write to the security audit log,
which Phase 8 specifies. The table (`security_audit`, append-only by trigger,
180-day minimum) is created by migration 16 so that the first commit able to
change a setting also records it. Audit rows are written *after* the change
succeeds, and a failed audit write is logged, not raised — the change has
happened, and failing the request would only mislead the operator.

### Throwaway Postgres without Docker

This development machine (Windows) has no Docker. Migrations are tested on a
real **PostgreSQL 16** server from the `embedded-postgres` npm package, in a
fresh temporary cluster per run (UTF-8, `C` locale — the Windows default code
page broke on migration 12's arrows), with the same Supabase stand-ins, never
the hosted project. Recipe in [23-running-and-testing.md](23-running-and-testing.md#verifying-changes).

### Vitest installed in Phase 1

The brief requires `npm test` to be clean after every phase, so Vitest went in
with the first phase instead of Phase 9. Store tests point the mock store at a
throwaway file through `MOCK_DB_PATH` and never touch `.local-db.json`; the
suite runs with `TZ=UTC` so a zone bug shows up.

## Phase 2: To is the actioner, Copy to is CC (21 Sep 2026)

**Owner's decision:** "Copy to" means CC, and the To line is the one person who
must act next. It supersedes "Displayed, not mailed" above.

- **To** = `reviewersForStatus(booking, status)` — `canReview()` for the stage
  the booking is in — or the desk for a desk record. When the booking moves
  on, the next mail's To moves with it.
- **CC** = the Copy-to list, one rule in `lib/academic/copy-to.ts` shared by the
  form's card: every approver of **every stage of the chain**
  (`approvalStagesFor`, new in `lib/workflow.ts`), plus an office's head. The
  chain rather than the current stage, so the warden who forwarded a request
  is still copied when it is allocated or cancelled. Anyone already in To is
  removed; both lines are de-duplicated ignoring case (`addressStaffMail`).
- **Assumed:** Copy to now has an approver rule for **employees** (their HOD on
  an official booking; nobody on a personal one) and for the **IAR Student
  Cell** (the IAR Office), which previously had none — the brief says CC follows
  the routing, and those are the routed approvers. An office's head comes from
  the Departments & Clubs console first (the office unit's head, or the unit
  above it) and the academic record only as a fallback, because the console
  is where the office maintains it.
- **The reviewers' separate "Cancellation requested — for your information"
  mail is retired** — they are CC on the manager's mail, which says the same
  thing to the same people in one message. Kept in `MailEventKey` for old outbox
  rows, hidden from the template editor (`RETIRED_MAIL_EVENTS`).
- **No migration.** The brief asked for `cc` in `email_outbox` in a new
  migration, but `cc_emails text[]` has existed since migration 10 and every
  transport already sent CC; adding a second column would have split one fact
  in two.
- **Redirect:** `X-Original-To` keeps the original To and `X-Original-Cc` the
  original CC (two headers, rather than folding CC into `X-Original-To`, so a
  filter can still tell who was asked to act); the banner names both, and CC is
  emptied.
- **Threads:** unchanged — one message per To address, CC on the first message
  only, so a CC recipient receives it once and joins that To's daily thread.
  *(Threads became per booking on 23 Sep 2026.)*

## Phase 3: the turnaround buffer (21 Sep 2026)

Meeting note: "±4 hr buffer for bookings" — read as a minimum gap between one
stay's check-out and the next check-in on the same room. Default 4 hours
(`rules.booking.buffer_minutes`), 0 disables it.

- **Only the end is padded.** "±4 hr" padded at both ends would make the real
  gap 8 hours.
- **The padding is in `guard`, not `during`.** The brief said "pad
  `room_holds.during`", but since migration 14 the exclusion constraint
  compares `guard`, and `during` is what the charts, the reports and (Phase 5)
  the invoice read as the truthful stay. Padding `guard` gives the same clash
  rule while keeping `during` honest. The exclusion constraint is still the
  only clash check.
- **The turnover override survives the buffer.** An accepted turnover's guard
  starts at `check_in + 2 h + buffer`, so it clears the previous stay's padded
  end exactly when the real overlap is at most 2 h — migration 14's promise,
  unchanged. A manager can therefore accept any gap shorter than the buffer
  (a "turnaround" conflict, hatched in the grid) or an overlap of up to 2 h
  ("soft", amber). A neighbour of an already-overridden hold is judged by the
  app as if it were ordinary, which is stricter than the database — the safe
  direction.
- **Rebuilds are atomic.** The constraint became `DEFERRABLE INITIALLY
  IMMEDIATE` (ordinary writes still checked immediately) so the migration and
  `set_booking_buffer()` can rebuild every hold through `set_room_holds()` in
  one transaction, checked at commit. Both first list clashes and stop,
  changing nothing, rather than dropping or moving a booking.
- **All holds, not only future ones, are rebuilt.** A hold exists only while a
  booking holds its room (past stays are Vacated and have none), so "future
  holds" and "all holds" are the same set except for stays awaiting check-out —
  and those are exactly the ones whose next guest the buffer protects.
- **Assumed:** the availability panel on the booking form shows the turnaround
  to requesters too (hatched, labelled "Turnaround"), since a requester
  choosing dates needs to know the room is not free at 11:00 just because the
  previous guest leaves then. The public guidelines state the buffer from the
  setting.

## Phase 4: HOD approval and debitable heads (22 Sep 2026)

Built on migration 15's units (an HOD is the head of a unit, found when
someone looks) rather than a new `hod` role — the brief allowed either, and a
role would have to be kept in step with the units by hand. That is the "HOD
flag with department scoping": `units.head_id`, scoped by `hodApproversFor`.

- **One route function.** `routeFor(role, service, context)` returns the whole
  chain; entry status, next stage, Copy-to and the public site read it. Before,
  "intermediate approval always forwards to the manager" was a separate rule,
  which cannot express club → FA → HOD.
- **Staff official bookings now go to the HOD too** — the brief says
  "faculty/staff". Migration 15 had routed staff straight to the manager.
- **Self-approval:** `hodApproversFor` never includes the requester. An HOD's
  own official booking therefore has no HOD stage (logged as skipped) unless an
  acting HOD is set; `canReview` still refuses self-approval as a backstop.
- **Office route is stored per booking** (`office_approval`), so changing units
  later cannot move a waiting request to a different stage.
- **Assumed — whose HOD:** a department is its own; a department office answers
  to its parent department; an officer office (Director, Registrar) to its own
  head ("Requires HOD approval" for the Director's office means its head);
  clubs have **no** HOD stage until the console names one (`hod_unit_id`), so
  today's club route is unchanged by default. Club → FA → HOD, as the brief
  asks ("put the HOD after the FA"). *(Superseded for new bookings on
  24 Sep 2026: clubs no longer submit, and a booking raised by the club's
  Faculty Advisor goes straight to the manager.)*
- **Assumed — clubs' debitable head:** Department (the brief lists none). IAR
  Student Cell: Institute. On behalf of an alumnus: Institute or Personal.
  All configurable in Settings → Debitable heads.
- **Debit head values kept from migration 15.** The five invoice heads map onto
  existing values (department_budget, institute_grant,
  professional_development_fund, personal_funds, project_grant); the legacy
  ones (special budget, alumni/student/hostel funds) stay valid for stored rows
  and can be re-enabled in Settings, but are not offered by default.
- **Projects** are picked, not typed; `debit_details` snapshots number and
  title so an edited project list never rewrites a booking. A used project can
  be deactivated, never deleted (foreign key, on delete restrict).
- **Queues:** `/hod` for HOD approval, `/approvals` renamed "Club Approvals"
  for the FA / council-secretary stage, each shown only to people who hold that
  appointment. Mail to an HOD links to `/hod`.
- **Display:** the head is a second line under the requester in the manager and
  caretaker tables, the history list, a column in the PDF export, the CSV
  column "Debitable head", and "Debitable head" in every booking mail's facts.

## Phase 5: invoices (22 Sep 2026)

The office's template (`public/GHM_Invoice.docx`) is reproduced to its
measurements; the brief's `docs/invoice-template.docx` does not exist — the
template was in `public/`. The header images are `word/media/image1.jpg` and
`image2.gif` (converted to PNG), now in `public/invoice/`.

- **Server-side PDF, one renderer.** The same bytes are printed at the desk,
  downloaded by the requester and attached to the Accounts mail, so the PDF is
  drawn on the server (jsPDF, which was already a dependency) rather than in
  the browser. It is drawn from the stored snapshot, never recomputed.
- **Fonts.** jsPDF's built-in fonts have no ₹, so the old invoice printed
  "INR". Arimo (SIL OFL, metrically Arial — the template's font) is embedded,
  subset to Latin-1 + ₹ (16 KB a weight). The footer's Latin text is Arimo Bold
  rather than the template's Palanquin Dark: a viewer that substitutes
  Palanquin draws it wider than jsPDF measured and it overran the Hindi.
- **Hindi is artwork.** jsPDF cannot shape Devanagari (matra reordering,
  conjuncts), so "कंजिकोड पश्चिम, पालक्काड, केरल - ६७८ ६२३" is a PNG rendered
  from the template's own Palanquin Dark Bold in Chrome, at 3×.
  `pdfSafe()` is gone. **Assumed:** the Hindi address never changes; the Latin
  address, phone and email are Settings.
- **Assets are compiled in** (`lib/invoice-assets.generated.ts`, base64, 180
  KB, `server-only`) so a serverless function needs no access to `public/`.
- **Day(s) counts nights by default**, as the brief asks, although the office's
  tariff sheet words Bageshri's rate as "24 hours with ±4 hours". Both are
  implemented; Setting `day_basis` switches, `grace_hours` defaults to 4.
  **Office to confirm.**
- **Rates by date, most specific wins.** Guest house > requester role >
  booking type > room type, then the latest `effective_from`; a later general
  rate never overrides an officer-specific one. Rates in force are immutable;
  a back-dated rate is allowed (the console warns) because the first extra-bed
  rate has to cover stays already in progress — invoices already issued keep
  their rates regardless.
- **No extra-bed rate is seeded** — the tariff sheet has none. A stay with an
  extra bed cannot be invoiced until the office adds one; the console and the
  invoice say so. Nothing is priced at ₹0 by omission.
- **Meals are priced at the rate in force on the stay's first day**, not split
  by date: the dining table must be exactly three rows, and the desk corrects
  counts, not dated covers. **Meals are free to students and alumni stays** as
  zero-rate rows, as the sheet says, so the rows still print.
- **"Requester category" = the requester's role**, the portal's own category.
  The sheet's Type 3 "government officers" is the `official` role (as before).
- **Rates include GST (user, 22 Sep 2026).** The office's prices are what the
  guest pays: the Grand Total is exactly the sum of the rates, and the invoice
  backs the taxable value out (`splitGst`) — the Tariff and Amount columns and
  Total (A+B) are before GST, "GST on Total (CGST 2.5% + SGST 2.5%)" is the
  difference, and a breakdown per SAC with CGST / SGST sits under the GSTIN.
  Rates checked online on 22 Sep 2026: since 22 Sep 2025 (56th GST Council)
  accommodation up to ₹7,500 a unit a day is 5% without ITC (above it 18%),
  restaurant service 5% (SAC 996311 accommodation, 996331 food). Kerala GSTIN
  and a Kerala property, so intra-state: half CGST, half SGST. All of it is a
  Setting (`prices_include_gst`, room / above-threshold / food rates, threshold,
  SACs); switching `prices_include_gst` off adds GST on top instead, rounded
  half-up to the rupee per SAC group. An extra bed takes its room's slab.
  **Office to confirm** with its accountant that the guest house supplies are
  taxable at these rates (an institute guest house can have exemptions).

  > *Superseded 25 Sep 2026:* the slab is gone. The owner gave the rates —
  > **18% on rooms, 5% on food** — and the office's revised template charges
  > each on its own subtotal ("GST @ 18% on Subtotal (A)"). Rates-include-GST
  > is still a Setting and still on. See "25 Sep 2026" below.
- **Numbering** is per financial year, `GH/2026-27/0001` (prefix and width are
  Settings), taken by `issue_invoice()` in the same transaction as the insert:
  no gaps, no duplicates, and a refused issue spends no number (verified).
- **One live invoice per booking.** A correction is cancel-with-reason, then a
  new invoice that records `replaces_invoice_id`. Only the manager (and the
  developer) may cancel; the caretaker issues and records payments.
- **Issued at check-out, including while occupied.** The desk is often asked
  for the bill before the guest formally leaves, so an occupied stay can be
  invoiced; it is billed to its booked check-out. Once vacated, actual times
  are used (read from the desk's log entries; no new columns).
- **Payment:** cash (reference optional), UPI (transaction id required),
  account transfer (UTR required); a date may be back-dated, never future.
- **Official → Accounts.** Mailed To the Accounts email, CC the requester's
  HOD and the requester, PDF attached (rendered at send time from a reference
  on the outbox row). "Department/HOD in CC" is read as the HOD of the
  requester's HOD unit. Personal bookings are not mailed; the requester
  downloads from `/dashboard`, where an official requester sees theirs too.
  **Nothing is mailed until the office sets the Accounts address.**
- **Who edits what.** Tariffs & Invoicing (`/admin/billing`) is the manager's
  as well as the developer's — pricing is the office's to run; changes are
  audited like Settings.
- **Contact details** on the public site now come from the invoice footer
  (+91 491 209 2016, ghm@iitpkd.ac.in), as the brief asks; the earlier number
  was the iitpkd.ac.in guest house page's.
- **"plus dining bookings"** in the brief's meal-count rule is read as: a
  dining (meals-only) booking is invoiced the same way, its covers being its
  head count × meals. Phase 6 builds on this.

## Phase 6: dining (22 Sep 2026)

Most of dining already existed (meals-only service, `/book-meal`, the per-day
kitchen page `/manager/meals`, dining debit heads from Phase 4). Phase 6 closed
the gaps:

- **Who:** meals without a room are for faculty, staff and offices —
  `employee`, `official`, `iar_cell` (the IAR Office is an office), plus the
  manager booking for someone. The IAR **Student** Cell was dropped: it is
  students, and the brief names faculty, staff and offices. It still books
  room + meals.
- **Where:** only at guest houses flagged `serves_meals`; the server now refuses
  a meals-only booking elsewhere even with an empty meal grid.
- **Heads:** Department / PDF / Personal for faculty, Department for staff, the
  office's head for offices; never Project (schema-enforced since Phase 4).
- **Kitchen count** is one pure function (`kitchenHeadCount`,
  `isKitchenConfirmed` in `lib/meals.ts`) used by the kitchen page and the daily
  report, so the two cannot disagree. Approved / occupied /
  cancellation-requested bookings count; pending ones are shown apart.
- **Daily desk report** gains, for a guest house that serves meals, the plates
  per meal (veg / non-veg / unspecified) and the day's dining bookings. A day
  with lunches to cook is not "quiet".
- **Billing:** a dining booking is invoiced from its first meal day once
  approved (`invoiceBlocker`), from "Dining to invoice" on the kitchen page (or
  the Invoice button on its row). Covers are the head count × meals; the desk
  corrects them to what was served. No separate dining booking is attached to a
  stay's invoice — each is invoiced on its own.

## Phase 7: operational states (22 Sep 2026)

The manager actions for changing a booking (`app/actions/manager.ts`:
dates, meals, rooms, cancel, reinstate) existed but **had no UI at all**.
Phase 7 gives the reception tables a **Manage** dialog per approved or current
stay, and adds:

- **Extend a stay** — manager and caretaker. The holds move through the same
  store path as any date change (`set_room_holds` on Supabase), so another
  stay in the room by then refuses it with the clash message.
- **Requester asks, manager decides.** "Request extension" in the requester's
  booking view stores `extension_requested_until` / reason; the list shows
  "⏳ Extension to …"; the manager approves (moves the holds) or declines with a
  note (required); both are mailed (`booking.extension_requested.manager`,
  `booking.extension_decided.requester`). A request the check-out already
  covers is settled automatically when the dates move.
- **Move rooms mid-stay** — the existing `reassignRooms`, now reachable, with a
  required reason, written to the security audit log (`booking.room_moved`).
  **Simplification:** the holds keep one period per booking, so the new room is
  held for the whole stay and the old one released entirely; the log records
  when the move happened, and the invoice prints the room held at issue.
- **No-shows** — the manager releases a stay whose booked check-in has passed
  with nobody checked in; the booking is cancelled, its rooms freed,
  `no_show_released_at` set, audited and mailed. The same release runs from the
  daily cron when Setting `booking.no_show_release_hours` > 0 (default **0 =
  off**: the office decides whether to automate it). Idempotent: a released
  booking is no longer APPROVED, and the mail is keyed on the release time.
  The release code lives in `lib/no-show-server.ts` (server-only) so the
  automatic run is never exposed as a server action.
- **Early check-out** needed nothing new: Vacated deletes the holds, so the
  room is free from that moment; the actual time is the log entry (tested).
- **Maintenance blocks** are `room_blocks` rows (migration 20), not holds with
  no booking — `room_holds` has a booking primary key and its exclusion
  constraint stays the only check between stays. Triggers on both tables,
  each locking the room row first, refuse a block over any stay's *guard*
  (stay + turnaround) and a stay into a block; a buffer change that would
  push a stay into a block is refused too. Blocks are drawn cross-hatched with
  🔧, are "hard" in the allocation grid, count as occupied everywhere, and are
  managed in Guest Houses & Rooms (audited as `room.maintenance`). A block's
  reason is shown to everyone — it is not personal.
- **Bulk rooms** — "B-101 to B-120" (also "B-101..B-120", lists, zero-padding
  kept), previewed with rooms that already exist skipped, then confirmed; all
  or nothing; at most 200 at once.
- **Not colour alone** — a ● in booked bars and a 🔧 in maintenance bars,
  `aria-label`s on the bars, the legend spelled out, and ⏳ on pending
  extensions.

## Phase 8: security (22 Sep 2026)

- **Sessions are rows, not cookies** (migration 21). The cookie holds 32 random
  bytes; only its SHA-256 is stored, so a database dump cannot be replayed as a
  login. 30 minutes idle (pushed forward on use), 12 hours absolute, revocable
  one at a time or all at once. The token is **rotated** when a session gains
  privilege — at sign-in and when the second factor is proved. `__Host-` prefix
  in production (HTTPS, no Domain, Path=/); a plain name in development, where
  the prefix's Secure requirement cannot be met. `lib/auth.ts` remains the only
  reader.
- **Rotation is on privilege, not on a timer.** A rotation on every request
  would need a write and a `Set-Cookie` on every request, and server components
  cannot set cookies at all; the idle window is pushed forward in the row
  instead (at most one write a minute).
- **Real Google sign-in** (`lib/oidc.ts`): state + PKCE in a ten-minute
  httpOnly cookie, the id_token verified against Google's JWKS (signature,
  issuer, audience, expiry, nonce), then `email_verified`, the `hd` claim and
  `isInstituteEmail`, and finally an existing portal account. Written with
  `fetch` and Node crypto rather than an OAuth dependency — an authentication
  library is a supply-chain risk of its own.
- **The developer doors are gone in production** *(superseded 23 Sep 2026 —
  see "Mock authentication is a door, not a flag": the picker is now open
  wherever Google is unconfigured, production included)*: `/mock-login` 404s and
  `loginAs` refuses unless `DEV_LOGIN=true` outside production, and `lib/env.ts`
  refuses to boot production with that flag set, or without Supabase, APP_URL,
  CRON_SECRET or ID_ENCRYPTION_KEY. `ALLOW_MOCK_STORE=true` is the one escape
  hatch, for running a production build locally against the mock store.
- **TOTP for developers** (`lib/totp.ts`, ~100 lines of HMAC): secret encrypted
  at rest, ten recovery codes kept only as scrypt hashes, replay refused by
  remembering the last accepted step. **Step-up**: a developer proves a code
  again within ten minutes before role changes, settings, or any delete;
  `stepUpProblem()` returns null for other roles, who are already behind the
  console password — that is the seam where a second factor would be demanded
  of them too.
- **Throttles moved into the database** (`hit_rate_limit`), so a restart does
  not reset a brute-force counter and every instance shares it. Routes answer
  **429** with `Retry-After`; server actions return the message.
- **Headers in `proxy.ts`** (Next 16's middleware): CSP with a per-request
  nonce and `strict-dynamic`, HSTS (production only — an HSTS header from a
  local build would pin localhost to HTTPS), `frame-ancestors 'none'`,
  nosniff, Referrer-Policy, Permissions-Policy, COOP, CORP, and
  `X-Robots-Tag: noindex` on every portal path. `style-src` keeps
  `'unsafe-inline'`: the charts position bars with `style=` attributes, which a
  nonce cannot cover. Maps and Supabase are named explicitly.
- **Cron is POST-only** and reads the secret from the Authorization header
  alone — a secret in a query string is written to every access log it passes.
- **Uploads** (`lib/uploads.ts`): the bytes decide the type, EXIF and PNG text
  chunks are stripped, the uploader's filename is thrown away, and files live
  outside `public/`. They are served by `/api/documents/…`, which checks who is
  asking (desk, requester, or the approver it is waiting on), writes a
  `document.viewed` audit row, and signs a **five-minute** link. The year-long
  signed URL this replaced was, in effect, a permanent public link to an ID
  card. ClamAV is used when `CLAMAV_HOST` is set; a configured-but-unreachable
  scanner refuses the upload rather than storing it unscanned.
- **ID numbers are encrypted at rest** (AES-256-GCM, key version in the value,
  `ID_ENCRYPTION_KEYS_OLD` for rotation) and shown as their last four
  everywhere — screens and exports. Without a key configured the value is
  stored as it is, which is what lets a fresh clone run and old rows still
  read; production refuses to start without one.
- **Retention** (`lib/retention-server.ts`, daily): identity fields and their
  documents are erased `id_retention_days` after a stay ends (Setting, default
  365); the audit log is trimmed to `audit_retention_days`, which the database
  will not let fall below 180. The stay itself is kept — it is the guest
  house's own record.
- **DPDP**: a versioned privacy notice at `/privacy` that reads its retention
  period from Settings, a consent tick on the booking form stored with the
  notice's version, "Download my data" and "Ask for erasure" on the dashboard,
  and the office answering each request from Console → Security. Erasure is a
  request, not a switch: records the guest house must keep for audit cannot be
  erased, and the answer says so.
- **Audit**: sign-ins (success and failure), console unlocks, role and settings
  changes, document views, exports, invoices, overrides, 2FA and privacy events,
  readable at Console → Audit Log (developer), append-only in the database.
  `lib/log.ts` gives structured JSON logs with emails, long digit strings and
  secrets redacted, and posts to Sentry when `SENTRY_DSN` is set.
- **Not done as the brief describes: RLS with per-request clients.** Every
  table has RLS on and no `authenticated` write policy, which is what protects
  the public anon key, and the policies are tested with two users in the
  migration harness. But the server still reaches the database with the
  service-role key from one server-only module: making the store per-request
  and user-scoped would mean minting Supabase JWTs and rewriting every write
  path to satisfy policies, which is a phase of its own. The boundary today is
  the server: every action re-checks the caller. **Left for the next phase.**
- **Dependencies**: `npm audit` is clean (Next 16.3.6, Vitest 5, @types/node
  24). Node is pinned by `.nvmrc` and `engines`. Dependabot groups Next's
  packages together; gitleaks has rules for the service-role key, the mail
  password, the cron secret and the encryption key.

## Phase 9: performance and tests (22–23 Sep 2026)

- **Caching the data, not the page.** `export const revalidate` was written on
  the five public pages first and did nothing: the `(site)` layout greets
  whoever is signed in, so it reads the session cookie and every segment under
  it is dynamic. The answer is to cache what the pages *say* —
  `lib/site-data.ts` holds the guest houses and the policy summary under the
  `site` tag for half an hour, and `revalidateEverything()` expires that tag
  when a Setting, a guest house or a room changes. `/guidelines` went from
  ~68 ms to ~27 ms warm (measured; see
  [25-troubleshooting.md](25-troubleshooting.md)).
- **One subscription instead of a render every five seconds.**
  `components/live-updates.tsx` replaces `auto-refresh.tsx`: with Supabase it
  subscribes to `postgres_changes` on bookings, room holds, blocks and
  invoices and re-fetches on a 400 ms debounce; without it (the mock store) it
  polls every 30 seconds. It also refreshes when the tab comes back to the
  front, and never refreshes the pages that fetch their own data (`/history`,
  `/availability`, the mail and audit consoles). A reception screen open for a
  shift made ~5,800 requests; now it makes one.
- **Revalidation names what changed.** Twenty-five `revalidatePath("/",
  "layout")` calls threw away the whole application's cache because one
  booking moved. `lib/revalidate.ts` has three lists — booking views, console
  views, everything — and the call sites say which they mean.
- **Search is Postgres's job** (migration 22). `bookings.search_text` is a
  generated tsvector (reference and roll number weighted A, purpose and names
  B) with a GIN index, and `SupabaseStore.searchBookings` pushes the keyword
  down with `websearch` before JavaScript ranks what comes back, falling back
  to the unfiltered scan when the keyword matches nothing. **Guests' names are
  deliberately not in the vector**: they are personal data and the column would
  be reachable by anything that can query the table; the JavaScript matcher
  still covers them for the staff allowed to see them.
- **End-to-end tests sign in like a person.** `playwright.config.ts` builds and
  starts a **production** server against the mock store on a throwaway database
  file (`MOCK_DB_PATH=./.e2e-db.json`), so a test run cannot touch a
  developer's `.local-db.json`, let alone the hosted project. The tests use the
  LDAP form and the dummy directory, because the developer sign-in door does
  not exist in a production build — which is exactly the build they run
  against. Fields are addressed by their `name` attribute (`rooms.0.guests.0.age`),
  the key the payload is built from, rather than by label text.
- **Two defects the journeys found**, both invisible to the unit tests:
  - **A checked-out stay could not be invoiced.** Marking a guest Vacated
    released the room holds *and* cleared the room cards, and the manager
    console listed no Vacated bookings at all — so the bill vanished with the
    guest, while `invoiceBlocker` says an invoice is issued "at check-out".
    Holds are still the sole authority on occupancy, but the cards now survive
    a check-out (they are the record of which room the party was given, which
    is what the invoice is priced from) and are dropped only when the stay
    never happened — cancelled, rejected, no-show. The manager console grew a
    **"Checked out — to bill"** section: stays that have left and whose invoice
    is not yet paid, for the last 30 days.
  - **A meals-only booking could not be submitted.** One guest house serves
    meals, so the guest-house select was locked to a single option — and a
    locked select never fires a change, so the field stayed empty and the
    schema refused the booking. The form now sets the value when there is only
    one to set.
- **CI is offline by construction** (`.github/workflows/ci.yml`): lint,
  typecheck, unit tests, then a production build and the Playwright journeys,
  all with `NEXT_PUBLIC_SUPABASE_URL` empty and `MAIL_DRY_RUN` on. **No secret
  is configured for CI and none should be** — nothing there may be able to
  reach the hosted project. The build in the e2e job clears the Supabase
  variables because `NEXT_PUBLIC_*` values are inlined at build time.

## Phase 10: documentation (23 Sep 2026)

- **Two new pages rather than more sections in old ones.**
  [12-workflows.md](12-workflows.md) is what each role does and where a request
  goes — every pipeline as a Mermaid diagram, the states a booking can be in,
  and what happens without anybody pressing anything.
  [26-security.md](26-security.md) is the operational view of Phase 8: what is
  protected, by what, where each secret lives, and what to do about an
  incident. The reasoning stays here in the decision log; those pages say what
  is true now.
- **A production runbook, not a deployment checklist**
  ([23-running-and-testing.md](24-deployment-runbook.md#production-runbook)): every environment
  variable with an example and what breaks without it, how to rotate each
  secret (including the one that needs care —
  `ID_ENCRYPTION_KEY`/`ID_ENCRYPTION_KEYS_OLD`), a **backup restore drill**
  because a backup nobody has restored is not a backup, CERT-In's **6-hour**
  reporting window and the DPDP obligations beside it, what is retained for how
  long, and the branch-protection rules with the two CI checks to require.
- **The public guidelines gained a "Charges and settlement" card**, built like
  every other card from `lib/` — the day basis and grace hours from the invoice
  rules, and the plain statement that **the tariff includes GST**, so the total
  is the rate the office quoted. A visitor should not have to ask the desk how
  the bill is worked out.
- **Stale statements were hunted, not just added to.** The docs still said
  authentication was mocked, that the session was an unsigned cookie holding a
  profile id, that Google sign-in was a placeholder, that there were eight
  migrations, that queue pages polled every five seconds, and that there was no
  test framework. Each of those was true when written and is not now; every one
  was corrected in place, with the dated entries in this log left as they are —
  a decision log is a record of what was decided when, not a description of the
  present.

---

## 23 Sep 2026 — the office's second round of corrections

Ten items from the guest house office, most of them the same complaint in
different places: **the portal asks questions whose answer is already known.**

### Mock authentication is a door, not a flag

Google sign-in is still not built. Phase 8 wired the real OpenID Connect flow
and made the placeholder — the persona picker at `/mock-login` — depend on
`DEV_LOGIN=true` outside production. The office's deployment sets neither, so
the second button on the sign-in card vanished and **every demo account became
unreachable**: the page 404'd and `loginAs` threw.

The fix is to stop gating the door on a flag somebody has to remember, and gate
it on the thing it stands in for: `mockLoginEnabled()` is true while
`googleOauth()` is null. Configure Google and the door closes by itself; there
is no switch left set the wrong way. `MOCK_LOGIN=false` closes it early for a
deployment that wants LDAP only.

It is also **labelled honestly**. The button read "Sign in with Google" and
opened a persona picker; it now reads **"Mock Authentication"** and drops
Google's "G" mark, which had no business on a button that does not talk to
Google. `e2e/sign-in.spec.ts` holds this to account against a *production*
build with no Google configuration — the exact deployment where it broke.

> Unchanged: this is a placeholder, not authentication. Anyone who can reach
> the page can become any account on it. It must not be open on a deployment
> holding real bookings — [04-roadmap.md](04-roadmap.md) item 1.

### One room type, so stop asking

Both guest houses are **all double sharing**. The form asked for a "room type
preference" whose only real answer was the one type that exists, the developer
console asked for a type on every new room, and the manager's grid split into
"Double sharing rooms" and an empty "Single rooms".

`RoomType` **stays** in the schema: tariffs and invoice lines are priced per
type, and rows created earlier are still recorded as `single`. What went is the
*asking*. The console creates doubles; the grid splits only when both types are
actually present (`splitByType`), and prints one "Rooms" heading otherwise;
`booking-details` names a room's type only when it is a leftover single. The
seed makes every room double sharing, and
`supabase/repairs/2026-09-23-all-rooms-double-sharing.sql` converts an existing
database — as a repair, not a migration, because whether the institute has a
single room is the office's fact, not ours.

### The per-room rule is a combination, not two caps

The office stated it as a table:

```
3 adults + 1 infant  ok      3 adults + 2 infants  no
2 adults + 2 infants ok      2 adults + 3 infants  no
1 adult  + 3 infants ok      1 adult  + 4 infants  no
```

`max_guests_per_room` (3) and `max_infants_per_room` (1) could not express
that, and **refused two of the three combinations the office allows**. A room
holds **four people however they are made up, of whom at most three may need a
bed** — so there is a third setting, `max_occupants_per_room` (4), and the
infant cap rises to 3. All three are Settings, all three are checked in
`roomPartyError`, and migration 23 teaches the `booking_guests` trigger the
same rule.

The two Add buttons now take **both** counts: a room with one guest and three
infants is full for guests although only one of the three guest places is
used, and `addGuestBlockedReason(1, 3)` has to say so.

The wording is **derived, not written**: `maximalRoomParties()` computes the
full parties from the three numbers and `describeRoomParties()` renders them,
so the copy cannot drift when the office changes a value. `roomOccupancyNotice`
states both halves, because either alone reads as permission — "up to 4 people"
invites four adults, "3 guests plus 3 infants" invites six.

This is also the most likely cause of the reported *"one room with father,
mother, sibling under 3, and another with 2 siblings and one infant shows some
error"*. The exact composition is within every rule and always was
(`tests/booking-rules.test.ts` proves it against the schema) — but the second
infant in a *single* room was unreachable, because the form's "Add infant"
button stopped at one and the Supabase trigger refused a second. The reporter
could not recall the message, so the rule was made right and the composition
pinned by a test and by `e2e/room-party.spec.ts`, which fills that room through
the real form.

### An infant's relationship is a text box

The dropdown lists the relationships an **adult** guest can have to the
requester — Mother, Father, Guardian, Grandmother, Grandfather, Siblings. It
has no "Nephew" or "Cousin's daughter" on it, and a two-year-old recorded as
"Siblings" to get past the form tells the desk something untrue. So an infant's
row is free text whatever the role's style is.

That moved the membership check out of the field and into a `superRefine` over
the rooms, because the field-level refinement could not see the age that
decides which kind of guest the row is.

### Guardian counts as a parent

Siblings and grandparents are accommodated only alongside a parent. A student
whose parents have both died, or who are abroad and cannot travel, could
therefore **never bring a sibling at all** — the rule was waiting for someone
who cannot come.

The institute already holds the answer: the academic database carries
`guardian_name`, and the Requester details card shows it exactly where both
parents' names are missing (a rule that has been there since 19 Sep). The
booking form did not know about it. **Guardian** is now one of
`STUDENT_RELATIONSHIPS` and one of `STUDENT_PARENT_RELATIONSHIPS`, so it
satisfies the dependency. Config, not a code branch — as the rule has been
since it was built.

### Meals: a dining booking is not a stay

The meals-only form was a stay with the rooms taken out. It asked for a guest
house (a locked dropdown: only a kitchen can take a dining booking, and there
is one), a "First day of meals" and a "Last day of meals" — two date boxes that
somebody booking one lunch had to fill in with the same day twice.

It is now a **set of dates**, each with its own breakfast / lunch / dinner
(`components/meal-dates-picker.tsx`): it opens on the first day the kitchen can
still cook for, and "Add another date" adds the next. `check_in` and
`check_out` are derived from the first and last date at submission, because
that is what the booking record holds.

**The kitchen's notice period is a new rule** (`lib/meals.ts`): a meal has to
be asked for **before the previous one finishes being served**, because that is
the last head count the kitchen can buy and cook against. Lunch closes when
breakfast ends, dinner when lunch ends, and tomorrow's breakfast when tonight's
dinner ends. So:

- `stayMealDays(..., now)` stops offering a meal that has closed, which means
  nothing is ticked by default that the schema would then refuse;
- the room flow's grid explains a closed cell as "too late" with the deadline,
  instead of the misleading "served after you check out";
- `firstBookableMealDate()` is why the dining form opens on **today** until
  today is over and on **tomorrow** afterwards — the office asked for exactly
  that ("if it's already dinner time, I should get the next day's booking as
  default");
- `mealLeadTimeError` is checked on the server too, so a form left open past a
  deadline is refused rather than silently accepted.

Allowing meals **today** broke something one layer down: `hasLapsed()` measured
every request from `check_in`, and a dining booking's `check_in` is midnight on
its first day — already past. The manager could not approve a dining booking
made for today at all ("its check-in has passed"). A meals-only booking now
lapses on its **last day of meals**, which is what "can the kitchen still serve
it" actually means. `e2e/official-and-dining.spec.ts` caught this, which is the
argument for having it.

Two smaller ones in the same area: the invoice-at-checkout line is gone from a
dining booking's Debitable head card (nobody checks in, so there is no
checkout), and **"Meals requested" is hidden where the guest house serves no
meals** — on `BookingDetails` and as a column on `StaysTable`. At Bageshri the
row could only ever read "None requested", which the assistant warden read as a
request that had been *refused* rather than a question never asked. The booking
mail had applied that rule since Phase 2; the screens had not.

### No ID document from an employee's guests

`buildDefaultFormConfig("employee")` hides `id_document` and makes `id_number`
optional. The requester is a member of the institute, identifiable from their
own account. The Aadhaar number is still taken for the guest house register and
still validated if typed — just not demanded.

> **Trap, as ever:** a role whose config was ever saved from the Form Builder
> keeps its stored row, so this default does not reach it. "Reset to spec
> defaults" is the way back. The same applies to Guardian reaching a student's
> `parent_relationships`.

### And the placeholder that read as policy

"e.g. Parents visiting for convocation" is gone from Purpose of visit. A
placeholder is read as a suggestion, and the office did not want that one
suggested.

## 23 Sep 2026 — the office's third round of corrections

Seven items, reported after the office worked the portal. The short-lived
summary is [99-recent-changes.md](99-recent-changes.md); what follows is the
reasoning, which stays.

### One guest house is not a question

**Decision.** Where a role has exactly one guest house to book, the booking
form states its name and carries the id in a hidden registered field. No
`<select>`, disabled or otherwise.

**Why.** The IAR Student Cell books only for alumni, alumni go to Bageshri, so
the list narrows to one — and the form rendered that as a **disabled dropdown
with one option** and then refused the request with "Select a guest house". The
requester was being asked for an answer the form had already decided and was
not offering. Two things were wrong and only one of them was cosmetic: a
disabled control reads as a question answered wrongly, *and* a disabled input
is at the mercy of what the browser and react-hook-form each think a disabled
field's value is.

**What made it stick.** The locked value is computed **before `useForm`**
(`initialGuestHouseId`), not set by an effect afterwards, so it is present in
the server-rendered HTML. An effect-set value is empty for the first paint and
for anything that reads the form before hydration — which is exactly how a test
or a fast submit sees it.

**Reach.** Students are Bageshri-only too, so they get the same treatment. The
meals-only flow already did this (it never drew a Kitchen dropdown for a single
kitchen); this makes the two consistent.

**Cost.** `e2e/helpers.ts` can no longer assume the field is a `<select>`;
`selectedGuestHouseName` branches on the tag.

### One of each: a student has one mother

**Decision.** A new `unique_relationships` list on `RoleFormConfig` — Mother,
Father, Guardian, Grandmother, Grandfather for students — whose members may
appear at most once on a request. **Siblings is not on it.**

**Why.** The form let "Mother" be chosen for two different guests. Two names,
both the requester's mother, and nothing at the desk to say which record was
right.

**Why config rather than a hardcoded check**, for the third time in this file:
the Form Builder can rename the relationship options, and a rule written in
words would silently stop matching. It sits beside `parent_relationships` and
`dependent_relationships` and is sanitized the same way — backfilled from the
spec defaults for a row saved before the rule, narrowed to the options actually
offered, and **emptied for a free-text role**, because "Mother " and "mother"
are two different answers when there is no option list to be unique within.

**Two defences, as with the parent dependency.** The dropdown greys the option
out on every *other* guest, with "— already on this request" on the option
itself; the zod `superRefine` is what actually enforces it. A guest never has
its own current answer greyed out — that would silently clear the box.

**Detail worth keeping.** The error is attached to the **repeat**, not the
first one. Flagging both reads as though both were wrong, and the first is
almost always the one the requester meant.

### An overlap should not look like a booking

**Decision.** Where two bookings hold one room at the same time, the
availability charts draw that stretch in its own colour (`bg-overlap`: solid
violet) over both bars. **Amended 23 Sep 2026:** it was a striped violet with a
`◆` on range bars; the office asked for a plain colour in the overlapping area,
so the pattern and the glyph are gone. Only the fill says it.

**Why.** The turnaround buffer's whole point is that the manager may *accept* a
changeover with up to two hours of real overlap (`isOverridable`, Phase 3).
Having accepted one, the manager had no way to see it: the grid drew red, which
is what one ordinary stay looks like. The room reads as taken either way, so
the picture answered "is this room free" and lost "and is something unusual
happening here".

**Where the logic lives.** `lib/availability.ts`, with the rest of the calendar
maths, not in the components — `bucketOccupancyByHour` gains `overlaps` per
hour and `bucketOccupancyByDay` gains `overlaps` as clipped spans, from
`overlapSpans()`. That is what makes the boundary behaviour testable, and the
boundary is the interesting part: **stays that merely touch at check-out are
not an overlap**, the same half-open rule as `room_holds.during`.

**Pattern, not just colour.** Four states now share these charts — booked,
turnaround, out of service, overlap — and each has its own hatch direction or
symbol, so they survive printing and colour-blind eyes.

### The desk account is not a person

**Decision.** `bookingTypesFor("gh_manager")` drops `personal`; it is
`["official", "alumni"]`.

**Why.** The manager books at the desk for people who never open the portal —
that is why every *other* kind is open to them. "Personal" on that account
means the manager's own family, and staff in that post hold an ordinary
institute account for exactly that. Leaving it there meant a private stay could
be raised, invoiced and approved from the one console that also approves
everybody else's.

**Cost.** None found: `debitCategoryFor` maps a personal booking to the
`personal` category whoever makes it, so nothing downstream was keyed on the
manager having the option.

### Mail threads on the booking, not on the day

**Decision.** `MailThreadKind` becomes `"booking" | "daily_log"`. Staff mail
about a booking joins one thread **per booking, per mailbox**, rooted at
`bookingThreadRoot(referenceId, address)` with the fixed subject
`[IITPKD-GH-2026-AB12C] Guest house booking`.

**Why the daily thread was wrong.** It grouped by *when a message was queued*,
which is not a thing anyone follows. A club's request, an unrelated
cancellation and a dignitary's allocation landed in one conversation because
they happened on the same morning, and two messages about the same booking a
day apart were split into different ones. Threading on the booking is what the
reference id already promises: search for it and get the whole story.

**What stays daily.** The digest, the escalation nudge and the per-guest-house
day-wise log. They are about a queue, not about a booking, so there is nothing
else to hang them on — and a new institute day starting a new one is the point:
today's digest should not keep bumping last week's.

**What stays standalone.** Requester mail. Each step is news to them, and a
standalone subject can say *what happened* — which a threaded subject cannot,
because Gmail splits a thread the moment the subject changes. This was not part
of the complaint; if the office wants the requester's mail threaded too, it is
one line, at the cost of every requester subject becoming the same words.

**Unchanged.** Everything else about threading still holds: one message per To
address, CC on the first one only, and the first message *actually sent* claims
the root `Message-ID` (decided in `dispatch.ts`, not at queue time, so a failed
opener hands the role on).

### Faculty cannot debit the Institute Grant

**Decision.** `FORBIDDEN_DEBIT_HEADS` in `lib/debit-heads.ts` — a floor under
Settings, not a default.

**Why a floor.** The grant was already absent from `DEFAULT_DEBIT_RULES.room.faculty`,
but Settings → Debitable heads is a grid of checkboxes and a default can be
ticked back on. The grant is the institute's own money, spent by the offices
that hold it; a faculty member hosting a visitor charges the department, a
project or their PDF.

**Three places, one rule.** `allowedHeads()` strips it on read — so a row
already saved with it is ignored rather than throwing, and the same computation
feeds the booking form and `createBooking`; `debitRulesSchema` refuses to save
it; the console greys that cell with the reason in its tooltip rather than
hiding it, so the table still reads as one grid.

### And the test fixture that was quietly wrong

`tests/booking-rules.test.ts` built its capacity rooms out of three guests all
related as "Father" — which the one-of-each rule correctly refuses, and which
was never a booking anybody could make. It is one Father and then siblings now:
the only shape that isolates the capacity rules from the relationship rules.

`e2e/global-setup.ts` now wipes `.e2e-db.json` before each run. The mock store
keeps the sign-in throttle in the database it writes (`RATE_LIMITS.signIn`: 8
per uid per 15 minutes), so running the suite twice inside that window locked
the dummy accounts out and the journeys failed on a sign-in that had nothing
wrong with it — a failure that looks like a portal bug and is not.

## The office's real rooms and the Bageshri rate (23 Sep 2026)

**The rooms are no longer invented.** The seed used to generate B-101..B-120
and H-101..H-116 so a first run had a grid to look at. The office gave the
actual list:

| Guest house | Rooms | Count |
| --- | --- | --- |
| Bageshri | 201, 202, 203, 204, 206, 302, 303, 305, 306, 307 | 10 |
| Hamsanandi | A4, B1–B4, C1–C4, D1–D4 | 13 |

Bageshri numbers by floor and skips 205, 301 and 304; Hamsanandi is four
blocks and only A4 exists in A. Both lists are exported from
`lib/store/seed.ts` (`BAGESHRI_ROOM_NUMBERS` / `HAMSANANDI_ROOM_NUMBERS`) so
the mock seed and any future check read one list, and mirrored literally in
`supabase/seed.sql`. Room ids in the mock store are still
`` `${ghId}-${room_number}` `` — so `gh-bageshri-201`, `gh-hamsanandi-C2`. The
numbers are the office's fact, not a format: don't "normalise" them to a
`B-`/`H-` prefix, and don't assume a room number is numeric.

**All of them are double sharing** — unchanged, and the reason `makeRooms`
still hardcodes the type.

**An existing database is corrected by a repair, not a migration**
(`supabase/repairs/2026-09-23-real-room-numbers.sql`), because which rooms the
institute has is the office's fact and a hosted database may already have
stays in the dummy rooms. It creates the real rooms, **deletes** a dummy room
nothing references and **deactivates** one something does — `room_holds`,
`booking_rooms` and `room_blocks` all cascade from `rooms`, so deleting a room
that held a stay would silently erase the history of where those guests slept.
It then recounts `total_rooms`, which no trigger does: both stores recount it
in their own room CRUD.

**Bageshri is ₹1,000 a room a day**, up from ₹750. The seed and migration 19
carry the new figure, so a fresh database is right. A live one gets
`supabase/repairs/2026-09-23-bageshri-rate-1000.sql`, which **inserts a second
row** with a later `effective_from` instead of editing the ₹750 one: a rate in
force priced past stays and `tariffs_guard` refuses to touch it, by design.
`resolveTariff` then prices each night at whatever was in force that night.
Hamsanandi and the meal rates are untouched.

## 24 Sep 2026 — the office's fourth list of corrections

Nine items, built on `main`. The working copy was on the `ui` branch (the 21
Sep vermilion redesign, 3 commits of its own and 24 behind `main`); every item
touched code that exists only on `main` — the office-template invoice, the
projects list, dining, Settings — so the owner chose to build on `main` and
leave the redesign to be merged separately. A trial merge of `main` into `ui`
gave 30 conflicting files (~80 hunks), mostly `booking-form.tsx`.

### Invoices after check-out: the desk's list, on both consoles, and the archive

**Decision.** `awaitingSettlement()` is the one rule for "Checked out — to
bill" and both `/manager` and `/caretaker` show it; "Checking out today" has an
Invoice button; the Approval Log offers Invoice to the desk on every
checked-out stay and approved dining booking.

**Why.** Reception issues invoices (Phase 5: "the caretaker issues and records
payments"), but only the manager's console listed stays that had left. At the
desk the bill vanished with the guest. The Approval Log covers what the 30-day
list does not — a paid invoice to reprint, a stay from last quarter — without
making the daily list longer. **Rejected:** widening the window, which grows
the list every day and still ends somewhere.

### A dining invoice is its own shape, read from the snapshot

**Decision.** `InvoiceDocument.kind` and `meal_dates`, and one function,
`invoiceFacts()`, for the PDF and the desk's preview. Dining drops check-in,
check-out, rooms, infants, primary guest, the room table and the A/B labels.

**Why.** A dining booking has no room; the old invoice printed "No. of
Room(s): 0", an empty room table with two ruled rows and "Sub Total (A):
₹0.00", and check-in/out times of midnight and 23:59 that nobody chose.
**Snapshots stay frozen**: `kind` is absent on invoices issued before today and
`invoiceKind()` reads it from the shape (no rooms, no room lines), so reprinting
an old dining invoice drops the empty table without any figure changing.

### Project rows only with Project; the sub-head typed, not listed

**Decision.** Project Detail / Number / Sub-head print only when the head is
Project. The sub-head is a free-text column, `bookings.debit_subhead`, not part
of the Projects list.

**Why.** Blank project rows on a department-funded invoice read as a form
someone forgot to finish. Sub-heads differ per project and per year and the
office has not supplied a list; the owner asked for a text box. It is kept out
of `debit_details` (which snapshots "number — title (PI)" and is parsed back by
`projectFromDetails`) so neither string has to be split twice. The database
checks it only exists alongside `project_grant`.

### Name and gender for faculty/staff, gender for official — and a blank age is an adult

**Decision.** Change the two roles' defaults; let a form make age *optional*
(never hidden); a blank age parses to `null`, which is an adult.

**Why.** The office asked for exactly those mandatory fields. Age had been
pinned to required because infants are defined by it; optional keeps the box
(an infant's age is still typed) while no longer demanding it for every adult
colleague. **This also fixed a bug:** `z.coerce.number()` made "" into 0 — an
infant — so a blank age was never "required" anywhere, it was a baby. The
`ageField` transform is round-trip safe (null in, null out). **Kept:** a foreign
national still needs nationality and passport number on every form — that is
the register the guest house keeps for foreigners, not a portal preference.
**Rejected:** hiding the optional fields for official bookings — "only gender
needed" read as "only gender mandatory", and the office can still hide fields
in the Form Builder.

### A club's booking is raised by its faculty in-charge, and stays the club's

> **Updated the same afternoon** ("Faculty Advisors by appointment", at the
> end of this file): the faculty in-charge is now only the Faculty Advisor
> named on the council or club in the console — the two ways described under
> "Who is the faculty in-charge" were copied into that field by migration 25
> and removed from the code — and the booking goes **straight to the
> manager**; the HOD stage no longer stays.

**Decision.** The club's account cannot submit; a faculty in-charge submits
for it via `/book?for=<club>`. The booking's `user_id`/`user_role` are the
club's; `created_by` is the faculty member; the Faculty Advisor stage is
skipped.

**Why the club owns it.** Everything downstream — routing (a club's HOD unit),
debit heads (the club category), approval-log scoping, reports, the club's
own dashboard — already keys on the requester being the club. Recording it as
the faculty member's own booking would have made a club booking look like a
faculty member's official stay and sent it to *their* department's HOD.
`created_by` already existed for the manager's desk bookings.

**Who is the faculty in-charge.** The club unit's own head or acting head
(not a student, and not inherited from its council — a council's head is a
student secretary), or a `faculty_advisor` profile with the club's
Department/Club — how the demo's Petrichor advisor is set up. The academic
record's "Faculty in Charge Email" is **not** consulted: it is an outside
lookup, and the console is where appointments are maintained.

**Why the FA stage goes.** The person who would forward it is the one who
raised it. An HOD stage stays; the creator is excluded from it
(`canReviewBooking`, and the HOD count in `createBooking`), so a faculty
in-charge who is also the HOD cannot approve their own request.

**Assumed.** "Clubs/fests and all" is the `club` role (Club / Fest Council).
The IAR Student Cell is unchanged — its requests already go to the IAR Office.

### Copy to is per booking, CC on the requester's mail

**Decision.** `bookings.copy_to_emails`, any number up to 25, CC on every mail
to the requester about the booking. Not on staff mail.

**Why.** The owner asked for "further mails" to reach addresses named on the
booking — a secretary, the guest, a co-organiser — which is the requester's
correspondence. Staff mail has its own CC (the approval chain) and its "please
review" wording would only confuse an outsider. The list lives on the booking,
not the profile, because it changes from one request to the next. The 25 cap is
a guard against a crafted request turning the outbox into a mailing list;
blank rows and repeats are dropped silently, a malformed address is an error on
its row. The requester's own address is dropped (they are To already).

**Not to confuse with** the Requester details card's "Copy to" line — the
approvers who get CC on staff mail (`lib/academic/copy-to.ts`). Different list,
different audience; the card's wording was left alone.

### Special Funds reuses `special_budget`, with a one-time upgrade for saved Settings

**Decision.** Relabel `special_budget` as Special Funds, add it to
`STANDARD_DEBIT_HEADS` and to every official category's default, forbid it for
students and personal bookings, make its details and sanction letter optional,
and upgrade saved Settings rows once through `DebitRules.revision`.

**Why reuse.** Migration 15 already created the value for the same idea, the
database check allows it, and no default offered it — so no stored booking
changes meaning. **Why optional fields.** The office asked for the head; the
old Special Budget's mandatory justification and upload would have been a new
obstacle nobody asked for. **Why a revision number.** Settings rows replace
default lists wholesale and the console only lists heads in use, so a row
saved before today would never offer Special Funds and nobody could tick it.
A row without `revision` is upgraded on read; saving from the console writes
`revision: 2`, after which an untick sticks. **Rejected:** a floor like the
Institute Grant ban — that would take the choice away from the office for good.

> *Superseded in part 25 Sep 2026:* Special Funds is now offered to
> **everyone except students** — personal and alumni bookings and the IAR
> Student Cell included — and only students are floored. Revision 3. See
> "25 Sep 2026" below.

### Migration 24 also fixes infants on Supabase

`booking_guests.age` had `check (age between 1 and 120)` since migration 1,
while the schema's minimum is 0. A baby typed as 0 could never be booked on
Supabase; the mock store never checked. The constraint is now
`age is null or age between 0 and 120` — null because age is optional on some
forms.

## 24 Sep 2026 (afternoon) — Faculty Advisors by appointment

The owner's follow-up to the morning's club rule. The student bodies are a
hierarchy — **Faculty Advisor → student secretary (Technical Affairs, Cultural
Affairs) → clubs**, and a fest (Petrichor) has an advisor too. The advisor
books for each secretary and club; Copy to starts with the secretary's mailbox
(`sec_arts@`, `sec_acad@`); every professor should be able to book as a
Faculty Advisor, with each council mapped to its advisor in the backend
because the post is a one- or two-year contract that the developer changes;
and an advisor's booking needs nobody to forward it.

### The advisor is a field on the unit, not a role and not an account

**Decision.** `units.faculty_advisor_id` (migration 25), edited in Departments
& Clubs → Faculty Advisors. A club with none of its own takes its council's.
Any faculty member may be named (`canBeFacultyAdvisor`); whoever is named gets
"Booking as: Faculty Advisor — X" on New Booking from their **own** faculty
login.

**Why.** It is the change that happens every year or two, and the owner asked
for exactly that: one place to name the advisor, and the booking right moving
with it. A dedicated `faculty_advisor` account (the morning's `fa.petrichor`)
has to be handed over, and is a second login for someone who already has one.
It is the same argument as HODs in Phase 4 — approvers by appointment, resolved
when someone looks. **Rejected:** a `faculty_advisor` role on the professor's
own profile — a role is one per account, so a professor who advises a council
could no longer book as faculty; and the role would have to be kept in step
with the units by hand.

**Why its own column, not `head_id`.** A council's head is its student
secretary, who approved club requests at the old `PENDING_FA` stage and still
does for requests stored before today. The advisor is a different person with a
different power (booking, not approving). The club/council head title is now
"Secretary" in the console.

**Why inherit from the council.** "A faculty advisor for each council, with
clubs under it": naming the Cultural Affairs advisor once covers every cultural
club. Petrichor, which has its own, keeps its own. This reverses the morning's
"not inherited from a council", which was about the council's *head* — a
student — never an advisor.

**One rule, not three.** The morning found the faculty in-charge two other
ways (a non-student club head; a `faculty_advisor` account matched by
Department/Club). Keeping them beside the field would give "who may book for
this club" three answers and a console that shows one. Migration 25 copies
each into the field once, so nobody who could book yesterday loses it; the
code reads only the field.

### Straight to the Guest House Manager — the HOD stage goes too

**Decision.** `routeFor("club", …, { raisedByFacultyInCharge: true })` is `[]`.

**Why.** The owner: the advisor's booking "doesn't require forwarding by anyone,
it goes directly to the guest house manager". The morning had kept an HOD
stage where the console named one for the club (`hod_unit_id`); that is
dropped for advisor bookings. A club request stored before the rule keeps its
old route, and one waiting at `PENDING_HOD` can still be forwarded
(`nextStatusAfter` falls through to the manager).

### The secretary's mailbox is a default in Copy to, not a rule

**Decision.** `units.secretary_email`, the club's own else its council's, is
filled into the first Copy-to row when the advisor books
(`defaultCopyToFor`). The advisor can clear it or add more.

**Why a mailbox, not the secretary's profile.** The owner gave the addresses as
`sec_arts@` / `sec_acad@`: role mailboxes that outlive any one secretary, which
is the same reason the advisor is a field. **Why a default.** "By default the
copy to should be to the secretary" — and a mandatory CC would be the portal
deciding who hears about a guest the advisor may have reasons to keep quiet.
**Why left out for the council's own account.** The council's account *is* its
secretary's mailbox, already mailed as the requester.

**Copy to on every new booking** was already so from the morning (every role,
room and meals-only); nothing changed there but the pre-fill.

### A council books as a `club` account

**Decision.** The Cultural Affairs Council has an account of role `club` on
`sec_arts@iitpkd.ac.in`, attached to the council unit, so "book for each
secretary" works exactly like booking for a club. **Rejected:** a new role for
councils — every rule that keys on `club` (debit heads, scoping, reports, the
refusal to self-book) would need a twin.

### The retired `fa.petrichor` persona

The owner asked for Petrichor's advisor to be a faculty (employee) account.
Dr. Arun Prasad is now `arun.prasad@`, an ordinary CSE faculty member named
advisor of the council and of Petrichor; the `fa.petrichor` account left both
seeds and the dummy directory. Seeds never delete, so an existing database
keeps the row — and on the hosted project migration 25's backfill will name it
Petrichor's advisor, to be replaced in the console.

### And the form that kept the last requester's answers

"Booking as" is a set of links to `/book` and `/book?for=…`. Next's client-side
navigation keeps the page's component tree, so the same `BookingForm` stayed
mounted with `useForm`'s first defaults — the Faculty Advisor's form opened with
the professor's own booking type and an empty Copy to. The end-to-end journey
caught it; unit tests could not. The form is keyed by `requester.id` and the
service. Any page that renders a stateful form from search params needs the
same.

## 24 Sep 2026 (evening) — the notes audited against the code, and three small fixes

The owner asked for `.memories` to be rebuilt so a new chat starts with the
whole project. Every file was checked against the code first; about twenty
statements had drifted (the Mock Authentication door, the requester's cancel,
the Student Cell's booking types, the manager's console sections, the
exemptions, the throttles, the demo data counts, the retention default). They
were corrected in place, older decisions here gained *Superseded* notes, and
the folder was regrouped — context (`01`–`05`), the product as configured
(`10`–`17`), engineering (`20`–`26`), credentials (`30`–`31`), recent (`99`).

**Why real secrets are not in the credentials file.** The folder is pushed to
GitHub. It holds what is public by design (the dummy LDAP passwords, the demo
console password) and every real secret by name and location only.

The audit also found three defects in the code. The owner said fix them:

### The developer does not book

**Decision.** `canBookOnBehalf` is the manager's alone; `/book` sends the
developer back to the console. **Why.** The developer had the desk's
book-on-behalf permission through `FULL_ACCESS_ROLES`, but no booking types
and no route (`routeFor` throws for the role) — so New Booking opened a form
that could never be submitted. **Rejected:** giving the developer the desk's
booking types and a route — the developer runs the portal, not the guest
house, and a booking raised from the console account would muddle whose
request it was. The other full-access powers (overrides, cancelling,
reinstating) are unchanged.

### One phone number for the guest house

**Decision.** `GUEST_HOUSE_CONTACT` (`lib/site.ts`) is the one source in code;
the "Facing trouble booking?" line and the invoice's default contact read it.
**Why.** The help line carried its own placeholder (+91 04923 226 100,
`guesthouse@`) while the site and invoice showed the office's own number from
its invoice template (+91 491 209 2016, `ghm@`). The invoice's copy stays a
Setting the office can change.

### Reception reaches the kitchen

**Decision.** A **Meal counts** button on Reception (for a guest house that
serves meals), and the kitchen page's back link goes to each role's own desk.
**Why.** `/manager/meals` was already open to the caretaker — it bills dining
from there — but only the manager's console linked to it, and its "Back to the
desk" link sent the caretaker to `/manager`, which bounced them home.

## 25 Sep 2026 — the office's fifth list of corrections

Nine items relayed by the owner; all done. The list and its status are in
[01-background.md](01-background.md).

### The Assistant Warden sees the student's record, and a check of the family against it

**Decision.** On `/warden`, the Review dialog of a student's request shows the
student's academic record (the same rows as the student's own card, parents'
and guardian's names included) and a table: each Father / Mother / Guardian on
the request beside the name on record, with a verdict — matches, partly
matches, differs, not on record. The queue row carries a one-glance badge
(`✓ Matches record` / `⚠ Check names`). `lib/academic/family.ts` compares
(case, spacing, punctuation and titles ignored; "Ramesh" against "Ramesh
Menon" is *partly*); `studentRecordPanels` builds it on the warden's page.

**Why the warden may now see the record.** Until today the record was shown
only to the person it describes. The office asked for the forwarding approver
to verify the parents, and the Assistant Warden is the student's own hostel's
approver — `canReview` already scoped the queue to them. The panels are built
for the requests in that queue and nothing else, and the record is still
never stored, logged or mailed. **Rejected:** snapshotting the record's
parents onto the booking at submission — it would put the parents' names in
the database for every stay, which the DPDP notes avoid, and the warden
decides within days, while the record is current. Only the warden's queue
gets the panel: the other approvers see no students.

### Guests the portal already knows are filled in, not typed

**Decision.** `KnownGuest` (`lib/known-guests.ts`) from two sources, in order:
the academic record's father, mother and guardian (students only — the other
record kinds describe the requester, not a family), then the adults on the
requester's own earlier bookings. Choosing a one-of-each relationship (Father,
Mother, Guardian, Grandmother, Grandfather — the Form Builder's
`unique_relationships`) fills the name and the gender it implies when the name
box is empty, or still holds what the previous choice filled in. Every guest
card has **Fill in from saved details**, which fills name, gender,
relationship, citizenship and nationality. A line under the name says where it
came from ("As on your academic record (Father)").

**Why these fields and no others.** The ID number and passport number are
stored encrypted and are the requester's to type again — sending them back to
the browser to save typing is the wrong trade. The age is left out because it
changes and it decides who is an infant (last year's four-year-old is five).
Infants are left out for the same reason. **Why only one-of-each relationships
fill automatically:** there is one father; there may be two siblings, and the
second must not arrive with the first one's name. **Why not for the desk:** the
manager's "own" bookings are other people's guests. **Why a booking raised for
a club does not count:** those guests are the club's, not the professor's.
**Rejected:** matching the relationship typed in a free-text box — typing
"Mother-in-law" passes through "Mother" and would fill the wrong name.

### Additional charges: charged under a section, which decides the GST

**Decision.** The desk can add up to 20 charges while invoicing — what it was,
a comment printed under it, a quantity and an amount — each **charged under**
Room charges (A, accommodation GST), Dining charges (B, food GST) or Other (no
GST, its own table, Subtotal (C)). They are priced like tariff lines (the
typed amount includes GST when the tariffs do), kept as typed on the draft
(`invoices.extra_charges`, migration 26), and frozen priced in the snapshot
(`extra_lines`).

**Why a section rather than a free GST rate per line.** The office's revised
template prints one GST rate per section ("GST @ 18% on Subtotal (A)"); a line
at another rate inside (A) would make that row untrue. An extra bed is
accommodation, a birthday cake is food, a broken vase is compensation for
damage — which is not a supply, so no GST, and it cannot sit under (A) or (B)
without being taxed. **Rejected:** negative charges (discounts) — not asked
for, and a discount on a tax invoice has its own rules. **Rejected:** changing
`issue_invoice()` to take the charges — the Supabase store writes the draft
first and the function promotes it, so the SQL stays as migration 19 left it.

### Typed meal counts reprice at once

**Decision.** `priceInvoiceDraft` prices the unsaved counts and charges; the
dialog calls it 350 ms after the desk stops typing and shows those figures,
and the Issue dialog quotes that grand total. "Save counts" became "Save
draft"; Preview PDF still wants a saved draft (it prints the saved one).

**Why.** The report — "the extra meals are not reflected in the final price" —
was the preview: the amounts and the grand total only moved after Save counts,
and the Issue dialog quoted the old total. Issuing did use the typed counts,
but nothing on screen said so. **Rejected:** pricing in the browser — the
tariffs and rules are server data, and the dialog's rule has always been
"nothing is shown that the server did not price".

### GST 18% on rooms, 5% on food, per section — and old invoices print as issued

**Decision.** `gst_room_percent` 18 (every room line and extra bed),
`gst_meal_percent` 5; the ₹7,500 slab and its two Settings are gone. A saved
invoice-Settings row from before is upgraded **once** (`upgradeInvoiceRules`,
`InvoiceRules.revision` 2): the slab dropped, both rates from the defaults.
New invoices are `InvoiceDocument.version: 2` — Rate column, Room Charges
Subtotal (A) + GST on it, Dining Charges Subtotal (B) + GST on it, Other
Charges when there are any, Grand Total (Including GST) — the owner's edit of
`public/GHM_Invoice.docx`. `invoiceTable()` is the one description of the
table for the PDF and the preview; a `version: 1` snapshot is laid out exactly
as it was issued (Tariff, Sub Total (A)/(B), Total (A+B), GST on Total).

**Why reset a saved rate.** A row saved before today holds `5` because that
was the default, not because anyone chose it — the same reasoning as the
capacity and debit upgrades. After the upgrade a rate set in the console
stands. **Why keep rates-include-GST on.** The owner gave the rates, not a
change of pricing; with it on, the guest pays the same and the taxable value
backed out is smaller. **Office to confirm** that the tariffs are
GST-inclusive at 18% — if they are exclusive, untick "Rates include GST".
**Why the PDF learnt to turn a page.** Additional charges make the table
longer; it used to run into the bank-details box. It now continues on the next
page, with the footer on every page.

### Special Funds for everyone but students — and a student is a student

**Decision.** Special Funds joins the personal, alumni and IAR Student Cell
defaults (room and dining); only students are floored. Debit rules revision 3
adds it once to a saved row, per revision, so a category the office unticked
after revision 2 stays unticked. **`debitCategoryFor` checks the student role
first.** A student's only booking type is personal, so their bookings used to
fall into the "personal" category and the Students row in Settings was never
read — harmless while the two lists matched, a leak the moment personal
bookings were offered Special Funds.

### "Add infant" makes an infant card

**Decision.** The form row has a `kind`; "Add infant" appends an infant card —
"Infant N", its age a list of 0–4, no Aadhaar and no ID upload, the
relationship free text. The payload marks it `infant: true`, and the schema
then requires an age below 5 on it (on both sides), so an infant card cannot
arrive as an adult on a form where ages are optional. **The age still
decides** who is an infant: a guest card with an age below 5 is still one, as
before. **Rejected:** an `is_infant` column filled from the card — the stored
flag has always been derived from the age, and two sources could disagree.

### An earlier check-in, for whoever may extend

**Decision.** Manage → Extend the stay has **Earlier check-in** beside Later
check-out, for the manager and the caretaker (`canUpdateLifecycle`, the same
people who extend). `earlierCheckInError` mirrors `extensionError`: an
approved or current stay, earlier than the booked check-in, by at most
60 days. The holds
move through `updateBookingDetails`, so a room someone else still holds — or
their turnaround — refuses it. Logged; no mail, as a desk extension sends
none. **Why.** A guest arriving a day early could not be marked Occupied
(refused before the booked check-in) and the only way round was cancelling
and rebooking. The Manage dialog's date boxes also stopped using
`datetime-local`, which the traps list forbids: a date box and `TimeSelect`.

## 26 Sep 2026 — the public site redesigned

The owner: the site "looks ass", "too dull and dead"; wanted a clean,
professional site that impresses anyone who opens it **without looking
AI-generated**, following the backend, keeping Mock Authentication, in **the
colour palette used by IITPKD websites**; a map for each of Hamsanandi and
Bageshri (two Google Maps links supplied); MRBS and the institute site in the
footer; a Guidelines page with placeholder rules; and the New Booking / Meal
Booking buttons in the portal made to stand out. Detail in
[16-public-site-and-ui.md](16-public-site-and-ui.md).

### The institute's palette, taken from its CSS, not from the handoff

**Decision.** Ink `#1A1A1A`, vermilion `#E94C26`, the emblem's saffron
`#F5A300`, a warm band `#F3F1EB` — read from iitpkd.ac.in's theme CSS
(`typo-colors.css`, `menu.css`) and the logo's pixels, not guessed.

**Why.** "The colour palette used by IITPKD websites" is a checkable fact: the
institute's links, buttons and active menu are `#E94C26`, its top bar and
footer menu `#1A1A1A`, its headings Source Serif. The handoff's navy/gold was a
designer's choice that appears nowhere on the institute's site.
**Contrast rules that follow:** white text only on `vermilion-deep`
`#C43C1C` (5.2:1; bright vermilion is 3.8:1); saffron carries ink.
**Rejected:** a vermilion `--primary` — a second red beside the portal's
Reject buttons (the `ui` branch's finding, kept). Ink is primary; vermilion
is `Button variant="brand"` for the one call to action.

### Not AI-looking: specific content and hairlines, not effects

**Decision.** No gradients, shadows, glass, pills or bento; 2–4px corners;
hairline rules as structure (every section opens on a full-width rule with a
label); serif display type with the optical-size axis; asymmetric 12-column
layouts; captioned photographs; tables for tabular content; a numbered policy
document for the guidelines; real numbers from the backend in the copy.

**Why.** Research on "AI slop" design (Sep 2026) names the tells — default
fonts, purple gradients, rounded-2xl + drop shadows, identical card grids,
emoji icons, vague headlines — and the fixes: specificity, a real palette,
one radius vocabulary, borders and contrast. The 21 Sep `ui` attempt had the
right colours but exactly those effects. A guest house site's most
impressive asset is its own facts and photographs, so the design puts them
first: "23 rooms across Bageshri and Hamsanandi", "Everyone except students",
the approval routes as a table, the meal timetable.
**Rejected:** merging the `ui` branch's redesign — 30 conflicting files, and
the look the owner is now steering away from.

### One map pin per guest house, as config keyed by slug

**Decision.** `GUEST_HOUSE_LOCATIONS` in `lib/site.ts`, keyed by
`guestHouseSlug(name)` like `GUEST_HOUSE_PHOTOS`; the Contact page shows the
store's guest houses that have a pin as tabs. The embed searches the place's
own Google Maps name plus its coordinates (`q=<name>&ll=<lat,lng>`), with no
API key.

**Why.** Guest houses are data, so the map cannot hardcode two names in a
component; a slug-keyed registry is the pattern the photos already use.
Searching the name *with* the coordinates was checked to resolve to the place
card itself; coordinates alone give an anonymous pin.
**Rejected:** a `lat`/`lng` column on `guest_houses` — a migration and a
console field for two values that change never; revisit if the office starts
adding guest houses.

### MRBS gets a sentence, not just a link

**Decision.** The footer opens with "Booking a lecture hall or meeting room?
Those are reserved on the institute's Meeting Room Booking System, not here"
and an Open MRBS button; MRBS is also in the Institute links, on the Contact
page and in the portal footer.

**Why.** Someone who wanted a seminar room is the most likely visitor at the
wrong door; a bare "MRBS" link in a list does not tell them so.

### The guidelines: portal rules computed, house rules marked provisional

**Decision.** Nine numbered sections from `guidelineSections()`. Sections 1–7
are the portal's rules, rendered from `lib/` and Settings (who may book
where, approval routes, the advance window, the stay cap, capacity, meals and
the kitchen's notice rule, charges and GST, cancellation). Sections 8 (During
your stay) and 9 (Safety and help) are placeholder house rules typical of
institute guest houses, each marked "To be confirmed", with a "Provisional
edition" note while `GUIDELINES_PROVISIONAL` is true.

**Why.** The owner asked for dummy guidelines "for now"; publishing invented
rules without saying so would put words in the office's mouth. The flag and
the chips make the provisional part visible and one line to retire.

### My Bookings leads with two large doors

**Decision.** "New room booking" (vermilion tile) and "Meal booking" (ink
tile), each naming its guest house(s), directly under the title; a Faculty
Advisor's "Book for <club>" as tiles beside them. The booking form's Submit and
the manager's "New booking for a guest" became `variant="brand"`.

**Why.** Two small buttons at the far end of the title row were being missed;
people come to this page to book. Two colours keep room and meals distinct.

