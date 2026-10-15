# Decision log — why it is built this way

Each entry: what was decided, why, and what it cost — **in the order it was
decided**. Entries are a record, not a description of the present: they are
**not rewritten** when a later decision reverses them. Instead a dated
**Superseded** / **Updated** note sits under the heading, so a reader can see
that the question was reopened and what won.

Two parts, in one file because they are one sequence: the standing decisions
that explain the shape of the codebase come first, then one entry per working
round from 16 September 2026 onwards.

- For how things are **now**: [10-roles-and-workflows.md](10-roles-and-workflows.md),
  [11-booking-forms.md](11-booking-forms.md),
  [12-settings-and-defaults.md](12-settings-and-defaults.md).
- For **what was asked** in each round, with the status of every item:
  [01-background.md](01-background.md).
- For **where the code is**: [20-architecture.md](20-architecture.md).

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
be deleted together when real auth lands (04-production.md step 5), not
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
[05-credentials-and-security.md](05-credentials-and-security.md) as the user asked.

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
correct — see [22-running-and-testing.md](22-running-and-testing.md).

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
[20-architecture.md](20-architecture.md).

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

> **Superseded in its figure, 14 Oct 2026.** The office asked to "allow users
> to make bookings more than 30 days in advance", so the default window is
> **six months**, not one. Everything else here stands: it is still a cap on
> check-in only, still `addMonths`, still exempt for official / dignitary
> bookings, the manager and the developer, and still a Setting the office can
> take to 24 months. See "Bookings open six months ahead, not one" at the end
> of this file.

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
the real work in [04-production.md](04-production.md) Phase 1. The
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

**What we got wrong the first time round.** [04-production.md](04-production.md)
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
([04-production.md](04-production.md) Phase 3) from invisible into
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
([04-production.md](04-production.md) Phase 1). Until then the honest
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

Detail in [14-public-site-and-ui.md](14-public-site-and-ui.md). The decisions, with the options
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
database is connected. Full detail: [11-booking-forms.md](11-booking-forms.md).

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
[11-booking-forms.md](11-booking-forms.md) and [12-settings-and-defaults.md](12-settings-and-defaults.md). Both are now Settings.

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
the hosted project. Recipe in [22-running-and-testing.md](22-running-and-testing.md#verifying-changes).

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
  and the office answering each request from Console → Security.
  > **Superseded in part, 14 Oct 2026, twice in one day.** First the
  > **consent tick** went at the office's request, and with it the stored
  > consent: `createBooking` writes neither `privacy_notice_version` nor
  > `privacy_consent_at`, because recording a consent nobody was asked for
  > would record something that did not happen. Then the **notice itself**
  > went at the owner's: the `/privacy` page, its version and every link to it
  > are in `archive/privacy-notice/`. What remains of this bullet is the
  > retention period, the export, the erasure request and the audit trail -
  > all unchanged and live. See the two entries at the end of this file. Erasure is a
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
  [22-running-and-testing.md](22-running-and-testing.md)).
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
  [10-roles-and-workflows.md](10-roles-and-workflows.md) is what each role does and where a request
  goes — every pipeline as a Mermaid diagram, the states a booking can be in,
  and what happens without anybody pressing anything.
  [05-credentials-and-security.md](05-credentials-and-security.md) is the operational view of Phase 8: what is
  protected, by what, where each secret lives, and what to do about an
  incident. The reasoning stays here in the decision log; those pages say what
  is true now.
- **A production runbook, not a deployment checklist**
  ([22-running-and-testing.md](04-production.md#part-2--deploying-and-operating-it)): every environment
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
> holding real bookings — [03-roadmap.md](03-roadmap.md) item 1.

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
in their own room CRUD. (**Superseded 14 Oct 2026**: migration 33 adds that
trigger. Both stores still recount, for the mock store's sake.)

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

> **Superseded, 7 Oct 2026.** The office withdrew the whole mechanism for
> every role: `lib/known-guests.ts` is deleted, and nothing is offered from
> earlier bookings any more. A student's **parents** are now taken from the
> academic record and locked instead (migration 28), which is the narrower
> and firmer version of the same idea; everybody else types their guests.
> See "A student's parents are taken from the record, not typed".

> **Extended (30 Sep 2026, afternoon):** the requester themselves comes first
> — "Yourself", relationship **Self** — for a student or employee. See
> "Yourself, on your own request" under that date.

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

> **Superseded in part (30 Sep 2026, afternoon):** the letters — on a
> `version: 3` invoice dining is (C) and Other charges (E). The sections and
> their GST stand.

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

> **Superseded in part (30 Sep 2026, afternoon):** the labels. New invoices
> are `version: 3` — every figure lettered in turn: Room Charges Subtotal (A),
> GST @ 18% on A (B), Dining Charges Subtotal (C), GST @ 5% on C (D), Other
> Charges (E), Grand Total (A+B+C+D). The rates, the upgrade and "old
> invoices print as issued" stand — a `version: 2` invoice still prints the
> labels below.

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
[14-public-site-and-ui.md](14-public-site-and-ui.md).

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

> **Superseded in part (26 Sep 2026, afternoon):** the owner found the
> result "too plain" and did not want the figures, the approval-route table,
> the meal timetable or instruction text on the home page. The page is now
> photo-led and quiet; see "26 Sep 2026 (afternoon)" below. The bans on
> shadows, glass, pills and bento stand.

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

> **Superseded, 7 Oct 2026.** The office asked for the Meeting Room Booking
> System to come off the site altogether - the footer banner, the Contact
> page sentence, the footer link and the portal footer's link. `MRBS_URL` is
> gone from `lib/site.ts` with every use of it.

**Decision.** The footer opens with "Booking a lecture hall or meeting room?
Those are reserved on the institute's Meeting Room Booking System, not here"
and an Open MRBS button; MRBS is also in the Institute links, on the Contact
page and in the portal footer.

**Why.** Someone who wanted a seminar room is the most likely visitor at the
wrong door; a bare "MRBS" link in a list does not tell them so.

### The guidelines: portal rules computed, house rules marked provisional

> **Superseded in part (26 Sep 2026, afternoon):** the "Who may book" list
> of requester categories and the approval-route table are gone — the public
> site no longer names roles or approvers. The sections are now eight, in
> general terms, opened by "How booking works". Computed rules and the
> provisional house rules stand.

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

## 26 Sep 2026 (afternoon) — the public site made quiet, visual and discreet

The owner on the morning's redesign: the header (logo and "Guest House")
"should look more aesthetic"; the site "looks too plain", "too mehh"; no
figures ("23 rooms… 1 month… 14 nights…"), no "see them on the map", no
photo captions; "How booking works" into the guidelines, vaguer; "do not
display the backend logic like who are the users, who approves who and all
to the public"; no instruction text or meal timings on the landing page.
Detail in [14-public-site-and-ui.md](14-public-site-and-ui.md).

### The portal's internals stay off the public site

**Decision.** No requester categories, approval chains or role names on any
public page. Deleted `getSitePolicies()` (and `approversFor`), `homeFacts`,
`openTo` and the route tables; the guidelines speak of "members of the
institute", "the person hosting them" and "the Guest House Office". A unit
test fails if any `ROLE_LABELS` value reaches the public copy.

**Why.** The owner's instruction. It is also sound: who approves whose
request is internal process that changes with appointments, and publishing it
invites people to route around it. **Cost:** the site no longer tells a
student in advance that their Assistant Warden will see the request; the
portal says so when they book.

### The landing page is a front door, not a rulebook

**Decision.** Home is photographs, the guest-house names as the title, one
sentence, the houses beside a photograph, a caption-free mosaic, short
amenity labels, and a closing photo band. Rules, meal times and "How
booking works" (five general steps) live on `/guidelines`.

**Why.** The morning's page was accurate but read as a policy sheet, and the
owner wanted it to impress. Hotel and campus-housing sites that feel
premium lead with photography and very few words.
**Rejected:** keeping the figures in a quieter style — the owner named them
specifically.

### The lockup: the emblem, and the words set in type

**Decision.** `BrandBlock` uses `iitpkd-logo.png` (emblem only) beside
"Guest House" in the serif and a tracked "IIT PALAKKAD", everywhere — site
header, footer, portal header. The header lies transparent over the hero on
`/`, and the charcoal utility strip is gone.

> **Superseded in part (26 Sep 2026, evening):** the header no longer lies
> over a photograph — it is a plain white bar, sticky from `lg`. The lockup
> itself stands.

**Why.** The stacked logo file's own "IIT PALAKKAD" was ~8px tall at header
size — the main reason the header looked cheap. Setting the name in the
site's typefaces makes the lockup crisp at any size and on photographs.
**Rejected:** a wider header logo (the old `iitpkd-web-logo.jpg` banner) —
it is a JPEG with a white background, unusable over a photograph.

### "Less plain" through photographs, not effects

> **Superseded (26 Sep 2026, evening):** full-screen and banner photographs
> read as "so weird" to the owner. Photos are now contained in the layout;
> see "26 Sep 2026 (evening)" below.

**Decision.** Photo banners behind inner-page titles (`PAGE_PHOTOS`), a
split ink/photo panel, a closing photo band, split-screen sign-in pages.
Dark washes over photos for legibility are the only gradients.

**Why.** The site's best material is the office's photographs; the morning
version used three of them. Effects (gradients, glass, shadows) are what the
"AI look" research warned against.

## 26 Sep 2026 (evening) — clean and institutional: photographs contained

The owner on the afternoon version: "it looks so weird. Make it look clean
and professional. The image filling the page this much looks so weird. Look
online for ideas and inspirations." Detail in
[14-public-site-and-ui.md](14-public-site-and-ui.md) ("The evening brief").

**Decision.** Photographs are **contained in the layout**: a split hero
(headline, buttons and the front-office number beside one 4:3 photo), a
bordered card per guest house, eight amenity cards, a row of four equal
thumbnails, a boxed closing call to action; plain light mastheads on inner
pages; the form beside a contained photo on sign-in pages. The header is a
plain white bar, sticky from `lg`. 8px corners on cards and photos, 6px on
buttons and inputs, no shadows, no gradients.

**Why.** The closest peer, IIT Madras's Taramani Guest House site, and the
clean hotel and university sites in design roundups all keep photography
inside a grid; full-screen photo heroes are a luxury-resort convention, and
on an institute's guest-house site they read as out of place. Cards and a
split hero are what visitors of an institutional site expect, which is
what "professional" means here.
**Rejected:** a full-width photo at a smaller height — still a banner, and
still the thing the owner called weird. **Kept from the afternoon:** the
lockup, no figures, no routes or role names, no captions, instructions on
the Guidelines.


## 30 Sep 2026 — UI revamp: an editorial public site, a GOV.UK portal

The owner's brief: authoritative and institutional, "anti AI slop" — 4px
inputs, 6px buttons, 8px cards; no pills, drop shadows, gradients or frosted
glass; photographs contained in asymmetric grid columns; IIT Madras's
Taramani Guest House for structure, Aman / The Standard for editorial
whitespace and dividing rules, GOV.UK for the portal's tables and tags.
Presentation layer only.

**Decisions.**

- **The corner scale is fixed, not derived** (`--radius-*` in `@theme
  inline`): `rounded` 4px, `rounded-md` 6px, `rounded-lg` 8px, and `xl`–`4xl`
  capped at 8px. The shadcn default multiplied one `--radius`, so the names
  meant nothing in particular and `rounded-4xl` made the badge a pill.
  Capping the top of the scale means no class anywhere can produce a pill.
- **Restyle through the primitives, not page by page** (as on 26 Sep): the
  portal has 35 cards and dozens of tables; changing `Card`, `Table`,
  `Button`, `Badge`, the inputs and `Dialog` restyles all of them
  consistently and leaves the pages' logic untouched.
- **Cards are GOV.UK summary cards**: the header is a band-tinted strip over
  a hairline. A 12-card booking form now reads as titled sections rather
  than floating boxes. **Rejected:** a coloured top border on each card —
  with 8px corners a thick top edge curls at the ends.
- **Status tags use the GOV.UK tag palette** (`tag-*` utilities; pale fill,
  same-hue dark text, 7:1+, square): yellow at an approver, blue at the
  manager, green approved, purple in house, turquoise vacated, red / grey /
  orange / pink for the endings. Sentence case, not uppercase — the label is
  matched by text in tests and read aloud.
- **Occupied and Vacated are distinct by colour *and* shape**: `occupy`
  (deep green `#00703C`) with a log-in icon, `vacate` (deep indigo
  `#3730A3`) with a log-out icon, both white text above 6:1. The icons are
  `aria-hidden`, so the buttons' names are unchanged.
- **Room seats are tinted, not saturated**: white text on bright emerald was
  about 2.5:1. Free is pale green with a green edge; taken stays solid red and
  is struck through; picked is solid blue — so the states differ by more than
  hue. The `title` texts (which e2e selects on) are untouched.
- **Public sections open on a hairline ink rule with the label in the left
  quarter** (`SectionHead`, 3 + 9 of 12 columns) and their content offset
  into the same column — the editorial hotel-site habit, in place of stacked
  floating boxes. The hero is 5 + 7 columns (asymmetric); the closing box
  became a row of ruled links; amenities are one ruled grid (a 1px gap over
  a border-coloured ground — safe because `amenities()` always returns
  eight). *Six, in three columns, since the afternoon — the meeting room and
  exercise room were removed.*
- **Guest-house switchers are link tabs** (`LinkTabs`, `aria-current`) and
  the console's sections a segmented list (`ConsoleNav`), replacing the
  "pill in a well" with a shadow.

**Kept:** every content rule from 26 Sep (no figures, captions, role names
or routes on the public site; photos never placed as one particular guest
house), the palette, the lockup's words, the map tabs, the MRBS strip.

**Second pass, same day.** The owner: "You didn't change much." The first
pass had restyled tokens and primitives but kept every screen's layout, so
it read as the 26 Sep site. The second pass changed layouts: the portal
became a GOV.UK service (ink masthead, white service navigation, a tinted
canvas), `/book` two columns with numbered sections, the desk consoles an
"at a glance" strip, the home hero an ink panel joined to the photograph,
sign-in a split-screen panel, inner mastheads asymmetric, the MRBS line a
callout. Control edges were darkened to `#8C857D` because the `#CEC8BF`
hairline (1.6:1) fails WCAG 1.4.11's 3:1 for form controls — hairlines stay
for structure, not for things you must find and click. **Lesson:** when the
owner asks for a "revamp", change what each screen looks like at a glance,
not only its tokens.

## 30 Sep 2026 (afternoon) — the supervisor's review of the live site

The supervisor went through the Vercel deployment and sent nine short notes;
the owner relayed them and, asked, said what three of them meant. The
working summary is [99-recent-changes.md](99-recent-changes.md).

### The public site promises less

**Decision.** The hero's sentence is now "Bageshri and Hamsanandi provide
accommodation on campus for guests of the institute." The meeting room and
the exercise room are off the amenities, which are six (a 3-column grid).

**Why.** Asked what "First sentence ?" meant, the owner: "Don't keep too many
promises — make the messages vague and less promising." The old line listed
who stays (visiting faculty, collaborators, examiners, families of students
and staff) — close to the requester categories the site already keeps off
(26 Sep) — and was a fragment. The two rooms are shared facilities rather
than something each guest house or room has; the owner chose removing them
over labelling them "(common)". **Rule for later copy:** state what exists,
plainly; no adjectives about the rooms, no lists of who may stay, no services
the office has not confirmed.

### The academic record's card loses its caption

**Decision.** When the record is found, the Requester details card has no
line under its title; the fallbacks keep theirs.

**Why.** The supervisor asked for "From the institute's academic database
(Student)." to go — it told the requester nothing they could act on. A
fallback is different: "no record… so these are from your portal profile"
explains why a field reads "Not on record", so it stays.

### Paying for a personal stay, in the office's words

**Decision.** `PAY_AT_CHECKOUT_NOTE` is the supervisor's sentence ("An invoice
will be generated and can be settled at the time of checkout. Multiple payment
options are available at the guest house."), printed on its own line under
the head, and only when that head is Personal Funds.

**Why.** The old note promised a bank transfer "using the details on it" —
exactly the kind of specific promise the office wants to avoid. The fixed-head
box used to print the note under *any* single head, which was only harmless
because the one fixed head in use is a student's Personal Funds.

### Requesters see booked or free; the desk sees why

> **Superseded, 7 Oct 2026.** The office went further: a requester is now
> sent **a count and no rooms at all** - "N rooms available" per day, and per
> hour on a one-day window. The simplified chart and the legend's `detailed`
> flag are retired, since there is nobody left to simplify them for. See
> "Availability: a count, not a simplified chart".

**Decision.** `getRoomAvailability` returns `detailed` for `gh_manager`,
`gh_caretaker` and `developer`. Everyone else gets `simple` charts — the
turnaround and an accepted overlap are not drawn, maintenance is drawn as
booked ("not available" on hover) — and a legend of Booked, Free and the
"now" marker. One `AvailabilityLegend` serves both the booking form's panel
and `/availability`, which had a copy each. The notes say "Times are IST."

**Why.** "Let's not show all these to users — overlap need not be shown."
The turnaround and the overlap are housekeeping the desk acts on; a requester
does not pick rooms, only dates, and the manager decides a turnaround at
allocation. **Why not draw the turnaround as booked:** the booked bar ends at
check-out — the truthful stay, as on the desk's chart — and the "free all
week" figures already count only booked time. **Why the caretaker gets the
detail** although it does not see occupants' names: it runs the rooms.
**Rejected:** deciding in the browser by role — the server already decides
what each role may see here (`showsOccupant`), so it decides this too.

### Yourself, on your own request

> **Superseded, 7 Oct 2026.** "Yourself" was withdrawn with the whole
> "Fill in…" list, for every role, at the office's request. The **Self
> relationship** on the student form remains - a student may still name
> themselves as a guest, typing their own name. See "Fill-in and 'Yourself'
> withdrawn".

**Decision.** "Fill in from saved details" starts with **Yourself — <name>**
for a student or employee (`knownGuestSelf`): the academic record's name, else
the profile's; relationship **Self**; no gender, age or ID (as for any known
guest). **Self** is added to the student relationship list and to One of
each; choosing it fills the name like Father or Mother does. It is neither a
parent nor a dependent — a sibling still needs a parent on the request.

**Why.** The note was "let the student write their name as well"; the name
box was already editable, and the owner's reading was that a student may book
for themselves and should be able to fill in their own details. **Why not
offices, clubs, the Student Cell:** those accounts are not a person — there is
no name to fill in. **Why employees too:** the same reasoning holds for a
member of staff staying on their own request, and the list is only an
offer. **Not backfilled into saved Form Builder rows:** an administrator may
have removed an option on purpose, and a saved row cannot say whether it
predates "Self". A saved student row needs Self added by hand (or Reset to
spec defaults); until then "Yourself" fills the name and leaves the
relationship. **Office to confirm** the policy.

### The invoice letters every figure — as a new version

> **Extended, 7 Oct 2026.** New invoices are **version 4**: the lettering is
> unchanged, but there are no blank ruled rows, no tax lines under the GSTIN,
> and the CGST/SGST split now reads in each GST row's own label. A `version:
> 3` snapshot reprints exactly as it was issued. See "Invoice version 4".

**Decision.** New invoices are `version: 3`: Room Charges Subtotal (A),
GST @ 18% on A (B), Dining Charges Subtotal (C), GST @ 5% on C (D), Other
Charges Subtotal (E) when there are any, Grand Total (A+B+C+D[+E]). A dining
invoice starts at its own subtotal: (A), GST on A (B), Grand Total (A+B[+C]).
Where GST is added on top (not the default) and the rupee rounding makes the
letters not sum to the grand total, a **Round off** row sits above it. The
dialog's "Charged under" follows (Dining charges (C)); the collections CSV
columns and the accounts mail went unlettered (Rooms (taxable), Room
charges…).

**Why a version and not a relabel.** The labels are computed from the
snapshot at print time, so relabelling `version: 2` would have changed
invoices already handed over — the rule since 25 Sep is that an issued
invoice reprints exactly as issued. **Why a round-off row:** a grand total
that says "(A+B+C+D)" must be their sum; a tax invoice shows rounding as its
own line. **Why unletter the CSV and the mail:** one month's sheet holds
invoices of both versions, whose letters disagree about dining. **Nothing
fills the .docx** — the owner's "fix the code that fills it" is the jsPDF
redraw of it (`lib/invoice-pdf.ts`), through `invoiceTable()`. The template
itself says "GST @ 5% on B (D)", a typo for "on C (D)"; the code follows the
supervisor's list.


---

## 1 Oct 2026 — the office's seventh list

### Each person's own meal preference, as counts

A booking carried one `meal_preference` for everybody, so a party of thirty
with two vegetarians was booked as non-vegetarian and the kitchen cooked
thirty non-vegetarian plates. The office asked for "personal preferences for
meal order, not just one preference for the whole group".

**Counts, not a row per person** (`bookings.meal_diet_counts`, migration 27:
`{veg, non_veg}`). A **dining booking has no guest list at all** — only a head
count — so there is nobody to attach a preference to, and the kitchen cooks to
numbers: "30 people, 18 veg" is what it acts on, and it is the same number
whether the names were collected or not. One mechanism covers both kinds of
booking, and the split has to add up to the head count (`dietCountsError`,
client and server).

`meal_preference` is **kept and not dropped**: rows written before today carry
only it. `mealDietCounts(booking, headCount)` is the one reader, and it spreads
that single answer over the head count, so every console, mail and export shows
a legacy booking the same way it shows a new one. Nothing was backfilled — a
legacy row has no split of its own and should not be given an invented one.
`kitchenHeadCount` keeps its `unknown` column for a booking with meals and no
preference at all, and adds the remainder to it when a split no longer adds up
(the desk changed the head count afterwards): the kitchen would rather see
"unknown" than have plates lost.

### The kitchen's limit is about the other bookings, so it is not in the schema

30 people at a sitting (`rules.meals.max_diners_per_meal`, a Setting; 0 turns
it off), **counting everyone already booked for it**. Two halves:

- The schema caps **one booking's** head count at the limit, on both sides —
  no booking can be larger than the most the kitchen will serve at once.
- `createBooking` checks the **sitting**, per day *and* per meal, against every
  live booking for it (`mealPlatesBooked`). It is deliberately not in the
  schema: the browser cannot see the other bookings and must not be told about
  them, and a limit checked only in the browser is not a limit.

A request **still waiting for the manager holds its places**
(`countsAgainstMealCapacity`) — otherwise several submissions could each pass
the check and then all be approved. Rejected and cancelled requests release
theirs.

### Lunch by default — on a meal booking only

The office asked for lunch instead of all three. Applied to the **dining**
flow, where meals are the whole point. A **stay** still starts with nothing
ticked: meals on a stay are an extra the requester opts into, and defaulting
them on would put dining charges on every stay at a guest house with a
kitchen, for guests who never asked and might not notice until the invoice.

The form's state changed shape for this. It used to hold the meals turned
*off* (every meal was on once a preference was chosen); with lunch on and the
other two off, opt-outs cannot express "breakfast on". It now holds a
`Map<slot, boolean>` of the slots the requester has **decided about**
(`mealSlotsFromChoices` / `choicesFromMealSlots`), so an untouched day still
takes its default when the dates change — the property the opt-out model
existed for.

### A typed project, not a dropdown

The console's project list was always behind the real one: a sanction that
landed last week was not on it and the requester had nothing to choose. The
number and title are typed into the details box beside the head, **required**
there, and snapshotted onto the booking as before — the invoice already splits
"number — title" (`projectFromDetails`), so nothing downstream changed. A
payload that still carries a `project_id` is checked against the console's
list rather than silently kept, so the Projects console keeps working for
anything that uses it.

### No auto-fill, even for parents

> **Superseded, 7 Oct 2026.** The compact "Fill in…" control described here
> is gone too, for every role. In its place, a student's father and mother
> are **taken from the academic record and locked** - not filled in for them
> to check, but not theirs to type either. See "A student's parents are taken
> from the record, not typed".

Choosing "Mother" filled in the name and gender from the academic record, and
choosing something else took them back out. The office asked for it to stop. A
box that writes itself is a box nobody checks, and the one thing the desk needs
from this form is a name that is actually the guest's. Everything the portal
knows is still one click away, in the **Fill in…** list on the guest's own
card — asked for, therefore read. That control also moved onto the card's
header line, small, because at full width above every guest it was the largest
thing in the section.

### DD/MM/YYYY

One convention, day-first, for an Indian institute's staff, students and
guests. Every rendered date already went through `lib/tz.ts`, so it is three
functions. **Native date inputs are not included** — a browser renders
`<input type="date">` in its own locale and no attribute changes that.

### A late arrival

Two separate blocks, both reported as "late entry check-in is not possible":

1. **The desk could only move a check-in earlier.** A guest whose flight slips
   to the next day has a booking whose stay has already begun on paper; the
   desk could extend the check-out but could not say the stay starts later, so
   the register disagreed with the building and the first night was billed to
   somebody who was not in it. `moveCheckInError` now allows either direction
   (not past the check-out — that is an extension), and the holds move through
   `updateBookingDetails` as before, so a room somebody else has by then still
   refuses the change.
2. **A new booking's check-in had to be strictly in the future.** That refused
   the entry the desk most often has to make — a guest standing at the counter
   whose stay began an hour ago — and also refused a requester who picked
   today's 12:00 and pressed Submit at 12:01. The floor is now **midnight this
   morning**, institute time (`earliestBookableCheckIn`). Yesterday is still
   refused; the stay cap and the advance window are untouched.

`occupancyNotStartedError` was never the problem: it only refuses marking a
stay Occupied *before* its check-in.

### Copy to: the addressing was right, the deployment was not

The office reported that Copy-to addresses receive nothing. Every mail to the
requester does carry the list as CC (`requesterCopyTo`, now tested on
submission, allocation, rejection and cancellation). The cause is
**`MAIL_REDIRECT_ALL_TO`**: applied at send time, it replaces To with one
mailbox and **clears CC entirely** — by design, so a staging server cannot mail
a real parent. With it set, no Copy-to address can ever receive anything.

It is config, not code, so the fix is to unset it on the deployment. What was
added is the thing that stops it being diagnosed twice: `/admin/mail` now says
in red that every message is being redirected and that Copy-to receives
nothing, and `.env.example` says the same. The redirect itself was left alone —
weakening it is how staging mails a real parent.

### Meal bookings in their own section of the desk

They sat in "Incoming requests" under headings that are all about rooms —
check-in, check-out, rooms, "Review & Allocate" — with a dash in most cells.
Nobody arrives on a meal booking and there is nothing to allocate. The manager
now has **Incoming room requests** and **Incoming meal bookings**, the second
showing the days and sittings, the head count and the split. The caretaker has
no approval queue at all, so nothing changed there.

### The availability console's room list is the desk's

> **Extended, 7 Oct 2026.** Still true, and now the chart is the desk's as
> well: a requester is sent counts and no rooms at all.

The grid answers "is this room free", which is all a requester needs. The list
underneath adds every booking's exact period, reference id and housekeeping
state — the guest house's own business, and it made the page read like an
operations screen. It follows the same `detailed` flag as the chart's legend
(30 Sep), so what is drawn and what the server sends cannot drift.

### Special Funds off a personal meal booking

> **Widened, 7 Oct 2026.** Off **every** personal booking, a stay as well as
> a meal, and the question is no longer asked at all on one.
> `FORBIDDEN_DEBIT_HEADS.personal` is the floor now (so `FORBIDDEN_DINING_HEADS`
> is empty), and revision 5 withdraws it from a stored row. See "A personal
> booking is not asked which budget pays".

A special fund pays for an institute occasion, not for somebody ordering lunch
for their own family. Done as a **floor** (`FORBIDDEN_DINING_HEADS`), like the
students' one, so a Settings row that still lists it is ignored on read rather
than breaking the form — and `upgradeDebitRules` revision 4 withdraws it from a
stored row once, after the earlier revisions have added everything they add, so
the office can tick it back on and have that stick.

## 7 Oct 2026 — the office's eighth list

Four phases, each gated on the five checks before the next began. The whole
round is in [99-recent-changes.md](99-recent-changes.md); this is why each
decision went the way it did.

### Em dashes: a blanket replacement, and a reader that takes both

The office asked for every em dash to become a hyphen. Done as a blanket
replacement over the source (1,559 of them, 214 files), not file by file: a
rule applied by hand to the strings somebody noticed is a rule that lasts
until the next message is written.

The one place it was not cosmetic is the **project**. A Project head stores
"number — title" in `debit_details` and the invoice splits it back
(`projectFromDetails`). Replacing the separator in the code would have made
every project stored before today print its whole entry as the project
*number*, with the title blank, on invoices for stays that have already
happened. So the reader takes **both** separators, em dash first — a hyphen
also occurs inside project numbers and titles, where an em dash never did.

Markdown and SQL comments were left as prose. They are not the product.

### Keralam: once, and on a word boundary

The spelling is in two kinds of place: the code's own defaults, and the
office's copy in a saved Settings row. The first is an edit. The second is a
one-time rewrite behind the invoice revision (`INVOICE_RULES_REVISION` 3), the
same mechanism the GST change used on 25 Sep: once, and never again, so an
office that deliberately writes something else keeps it.

Two details worth keeping. The rewrite matches `\bKerala\b` — "Keralam"
contains "Kerala", and a plain replace on a row already corrected would have
produced "Keralamm". And it only touches a row that carries its own `contact`:
writing `contact: undefined` over the default fails the schema, which
`parseRuleGroup` reads as "no invoice settings at all" — found by the Accounts
mail test, which went quiet because the whole invoice group had fallen back to
defaults with an empty Accounts address.

Issued invoices keep the words they were printed with. They are snapshots.

### A personal booking is not asked which budget pays

The office's words: personal bookings, students included, show no debitable
head. The money is the requester's own, so the question has one possible
answer, and a card headed "Debitable head" on a family visit read as though a
department might be about to pay for it.

Implemented as **a rule, `asksForDebitHead(bookingType)`**, not as a
consequence of the allowed list having one entry. `fixedDebitHead` already
handled "one option": it *states* the answer. This is different — the question
is not put at all — and the two say different things to a requester. The
server writes `personal_funds` itself, in the **schema's closing transform**
rather than in `createBooking`, because the form validates with the same
schema and sends `parsed.data`: doing it there means the browser's copy of the
payload and the stored booking name the same budget.

A crafted payload naming a department on a private stay is **overwritten, not
rejected**. Rejecting it would mean an error message about a field the
requester never saw.

### Students and alumni: a rule, not a coincidence

Both were already Bageshri-only in practice, and Bageshri has no kitchen, so
"no meals" fell out of the configuration. That is not the same as a rule: a
developer ticking "Serves meals" on Bageshri, or adding either to
Hamsanandi's `allowed_guest_house_ids`, would have started offering meals the
office does not sell them. Now `restrictedToOneGuestHouse` and
`mealsAllowedFor` say it, the form applies it, and `createBooking` checks it.
The manager overrides both, logged — the desk books what is standing at the
counter.

### The meal split fills itself in

The two counts must add up to the head count, so answering one settles the
other. Asking twice was asking the requester to do the subtraction, and the
commonest way to meet "the two have to add up to N" was to answer one box and
stop. Either box fills the other, so a correction still works, and it is
written from the change event only — never an effect — so the box the
requester is touching is never the one that moves.

The rule itself stays in `dietCountsError` on both sides. The form can no
longer produce a mismatch; a crafted payload still can.

### The rates on the form come from the invoice's own function

A requester quoted one figure on the form and charged another at check-out has
been misled, and the only way to be sure that cannot happen is for both to
read one function. `tariffPreviews` resolves through `resolveTariff` with the
same query shape `buildInvoiceDocument` builds.

Computed **on the server** and handed down as a prop, one set per guest house
and booking type the requester may pick — a handful of rows, and no round
trip while they fill the form in. Two limits are stated rather than hidden:
the rates are today's, and a charge with no rate reads "Not published" rather
than a zero, which is what the invoice does with it too.

### Change rate, instead of letting a rate in force be edited

A rate in force is never edited — stays have been priced with it — so changing
a price means adding a row with the same scope from a later date. That is four
dropdowns to repeat by hand, and repeating them by hand is how a new rate ends
up applying to something slightly different from the old one. The button
copies the scope and leaves the rate blank, dated today.

### Availability: a count, not a simplified chart

On 30 Sep requesters were given a simplified chart — booked or free, no
turnaround, no overlap. The office went further: only how many rooms are free,
and the server to send them that and nothing else.

Which room is free is of no use to a requester. They cannot choose one, the
manager allocates, and publishing the grid told anyone with a login which
rooms a named stay occupied. So this is now a line between **two different
answers**, not two styles of one: the desk gets rooms and segments, everyone
else gets `AvailabilityCounts` with both arrays empty. A component that has no
room numbers cannot leak one.

The hourly breakdown is kept for a single day. Someone whose date is full
needs to know whether it is full all day or only in the morning, and that is
the one piece of detail a count can give without naming a room.

With nobody left to simplify the charts for, the `simple` mode and the
legend's `detailed` flag were retired rather than left as dead branches.

### The institute's records, kept in the portal (migration 28)

The academic database the portal was designed to read does not exist and
nobody could say when it would. Meanwhile the booking form needs a student's
parents **now**, because from this round it locks their names. So the office
keeps the records themselves, pasted in as CSV.

**One table for all six kinds**, with every field of every kind as a nullable
column. The kinds share more than they differ by, and six tables would mean
six importers and six console sections for the same six pastes. A row is
folded into an `AcademicRecord` through `ACADEMIC_RECORD_FIELDS`, so a column
that no record type names — or the other way round — is a compile error rather
than a field nothing ever fills.

**Service-role only, no `authenticated` policy**, exactly like `app_settings`:
the rows hold parents' names and phone numbers, and what reaches a browser is
only ever what the server chose to show.

**A third `AcademicSource`, with the dummies behind it.** `StoreAcademicSource`
prefers an imported row and falls through to `MockAcademicSource`, so a fresh
install, the test suite and the demo personas keep working with nothing
imported, while a real student not in the import correctly has no record —
which is what leaves their parents' names editable. A missing table (migration
28 unapplied) falls through too, rather than reading as an outage.

**The "sample" caption became per lookup.** `isMockAcademicSource()` asked one
question of the deployment, which stopped being a fair answer the moment the
office could import real records alongside the published dummies: on the same
install, one person's card is their own record and the next is a sample.
`AcademicSource.find` now returns the record **and where it came from**.

**The cache had to be invalidated.** Lookups are cached for ten minutes, so an
imported record read back as the one it replaced — and, since this round, the
booking form went on locking a parent to a name the office had just corrected.
Found by the journey, not by reasoning. `forgetAcademicRecords()` runs on every
import, delete and clear.

### A student's parents are taken from the record, not typed

The Assistant Warden's job at a student's request has been to confirm that the
"Father" on it is the father the institute has on file (25 Sep). If the portal
knows the name, there is nothing to compare: the request simply carries the
right one. It also closes the one thing the check could only report — a
student naming someone else's parent as their own.

Three consequences, all the office's own words:

- **A relationship the record cannot support is not offered.** No father on
  record, no "Father" on the dropdown. Offering it would invite a typed parent
  back in through the door this closes. Guardian is the mirror: it is for the
  student whose parents have died or are abroad, so it appears only where the
  record names neither — and where it names neither parent *and* no guardian,
  Guardian is left open, because the record has nothing to say about them.
- **The server writes the record's name**, whatever arrived. The form shows it
  read-only; that is a courtesy, not the boundary.
- **A recorded guest is not asked for an Aadhaar or an ID document.** The
  institute has already identified them; asking for a document as well is
  asking the student to prove what the record says. A sibling or grandparent,
  typed by hand, is still asked — which is why the exemption is keyed on the
  relationship being locked rather than on the role.

Matched against the Form Builder's own option list, ignoring case, so an
office that renames "Father" to "Dad" gets a dropdown that stops being locked
rather than a form nobody can submit.

### Fill-in and "Yourself" withdrawn

On 1 Oct the office asked for auto-fill to go, because a box that writes
itself is a box nobody checks, and the explicit "Fill in…" list replaced it.
On 7 Oct they asked for that list to go too, for every role, "Yourself" with
it. `lib/known-guests.ts` went with it rather than being left as dead code,
and the tests that covered it were deleted rather than left asserting a
feature the office had removed.

`Self` stays on the student relationship list. It is a relationship, typed by
hand, and withdrawing it would reverse a separate 30 Sep decision nobody asked
to reverse.

### Invoice version 4

Three changes, one version. Labels are computed at print time, so a change of
wording is a new version and never an upgrade of an invoice already handed
over — the same rule versions 2 and 3 were added under.

- **No blank rows.** The template had two ruled room rows, so a one-room stay
  printed an empty second one that read as a charge nobody had filled in.
- **No lines under the GSTIN.** The per-SAC taxable/CGST/SGST breakdown came
  off. It is still computed and kept in the snapshot, so restoring it is one
  line in `printsTaxLines` if the office wants it back. The "rates include
  GST" note went with them, being one of the lines under the GSTIN — worth
  confirming they meant that one too.
- **The CGST/SGST split in the GST row's own label**, next to the figure it
  describes rather than in a footnote under it. That is where the removed
  information went.

### Cash retired, but not erased

`cash` stays in the `PaymentMode` union and in the labels: invoices paid in
cash before today say so, and an invoice is a snapshot — a stored payment is a
record of what happened, not a choice that can be re-made. What is gone is the
*offer*. `PAYMENT_MODES` no longer lists it and `paymentModeError` refuses it
on a new payment, so a crafted request cannot record one either. Both
remaining modes carry a reference, so the reference is now required for both
rather than optional for cash.

### A personal stay is settled before the guest leaves

Nobody chases a private guest for a guest-house bill once they have driven
home, and the desk was discovering the unpaid invoice weeks later in "Checked
out — to bill". So a personal stay's check-out **is** its invoice: one button,
**Check out & settle**, and the room is released from inside the dialog, after
the payment.

Enforced on the server (`vacateBlocker`), not merely arranged in the UI. An
official stay is the opposite and is untouched: issued at check-out, settled
later by whichever department is paying.

**The manager can set it aside with a reason**, and reception cannot. An
invoice can be impossible to issue — no tariff covers a night, the office has
agreed to bill a guest later — and a rule the desk cannot lift would leave a
guest in the building on paper, holding a room nobody can let. But setting a
payment rule aside is a decision about money, and reception records what
happens. The reason goes into the log.

### Awaiting payment has no window

"Checked out — to bill" is the desk's **daily** list and is bounded to a few
weeks: a stay nobody has invoiced yet is a thing to do today. This is the
other half, and the opposite: the invoice has gone out and the money has not
come in. An official stay's bill can sit with a department for months, so a
list that quietly dropped it after thirty days would be a list of debts that
forgets them.

Built from the **invoices** rather than the bookings — `InvoiceFilter.statuses`
and `BookingFilter.ids` were added for it — because with no window, loading
every booking ever made to find the few that still owe money would not scale.

Its own table, not `StaysTable`. A dining booking is exactly the sort of bill
that waits, and it has no check-in, check-out or rooms: the office's own
decision of 1 Oct was that a meal booking does not belong in a table of rooms
with a dash in most of its cells.

### Missed: a status, because "lapsed" was only a description

`hasLapsed()` has described this state since September — the queues drew a
badge and `lapsedError` refused to forward it — but the request kept its
pending status. So it sat in somebody's queue for ever waiting to be rejected
by hand, and the requester was never told: they had asked for a room, the date
had gone past, and the portal still said "pending".

**It is not a rejection.** Nobody decided anything, which is why it has its
own status and why it can be undone. A rejection is a decision and should not
be reversible by a single button.

**Migration 29 contains the enum value and nothing else.** Postgres refuses to
*use* a new enum value in the transaction that adds it, and a migration runner
wraps each file in one — so anything that reads or writes 'MISSED' belongs in
a later file, and there is nothing in 29 to tempt it. Nothing is backfilled
either: the first nightly run marks what has lapsed, and that is the same run
that tells the requester.

**Reinstating returns the request to the stage it was waiting at**, not to the
manager's queue. Nobody decided it, so the decision is still owed by whoever
owed it. Read from the log entry that marked it (`statusBeforeMissed`).

**And the sweep must not undo that.** A reinstated request's check-in is still
in the past, so the next night would mark it again, every night, for ever.
`missedSweepable` therefore skips a request reinstated since it was last
marked — read **structurally** off the log, as a row whose `previous_status` is
MISSED, rather than by matching the remarks or by adding a column. A
reinstatement is already a log row that says where it came from.

No "this stay has already ended" guard on reinstating, unlike the cancelled
and rejected path: a missed request's check-in is in the past **by
definition**, so that guard would refuse nearly every one of them. What the
manager does next is move the dates and allocate — which is what they did with
a lapsed request before this status existed.

A **Missed** tile of its own in the Approval Log, not filed under Cancelled: a
cancellation is something somebody asked for, and this is the opposite — the
question asked and never answered. The office needs to be able to count them.

## 8 Oct 2026 — the office's ninth list

Five items, relayed by the owner, and all of them about **the production
portal** rather than the demo: the debitable heads the institute actually uses,
the declaration that goes with them, one mail thread per booking, less text on
screen, and loading the real accounts. The owner also asked for a single place
recording what a production build needs, which is
[04-production.md](04-production.md).

### The debitable heads are the office's list, not a table derived from them

> **Supersedes** "Debitable heads per requester category" (23 Sep 2026) and the
> narrowings of 24 Sep, 25 Sep, 1 Oct and 7 Oct, all of which edited a table
> taken from the meeting notes. The office has now given the mapping itself.

All **nine** heads are in use. Alumni Fund, Student Fund and Hostel Funds had
been on the enum since migration 15 and offered to nobody; Personal Funds
reaches a faculty member's *official* booking for the first time.

Four categories changed which heads they have, not merely how many:
**non-teaching staff** lost the department budget and have Personal Funds
alone; the **two classes of office** were merged onto one list of six, which
the old defaults split between officer and department offices; **clubs, fests
and councils** moved from the department budget to the **Student Fund**; and
**alumni bookings** moved from the Institute Grant to the **Alumni Fund**.

**So revision 6 replaces a saved Settings row's lists rather than editing
them.** Revisions 2 to 5 each added or removed one head (Special Budget) and
could be applied field by field, which let an earlier untick of the office's
stand. There is no such edit here — the mapping is different, not narrower —
and the office giving the list means the list *is* the configuration. After
revision 6 the row is the office's own again and is never touched.

**"All funds except Institute Grant, Alumni, Student Fund and Hostel" is read
as a floor, not a default.** `FORBIDDEN_DEBIT_HEADS.faculty` now holds all
four: the grant is the institute's money, spent by the offices that hold it,
and the other three belong to the alumni, the students and the hostels. A
default can be ticked back on in Settings; this cannot, and
`allowedHeads` strips it on read so a stored row that still lists one is
ignored rather than fatal.

**Special Budget is relabelled back.** The office called it "Special Funds" on
24 Sep and "Special Budget" on this list; the label follows the office. The
stored value is still `special_budget`, so nothing in the database moved -
and an **invoice issued before today still prints "Special Funds"**, because
`debit_head_label` is snapshotted into the `InvoiceDocument` at issue time.
That is the right answer for the same reason the invoice versions are: an
issued invoice is a record of what happened, not a view of today's
configuration.

**And it must now say which fund.** The office writes the head as "Special
Budget (Please specify the details)", so `debitDetailsRequired` includes it: a
sanction nobody names cannot be checked by the accounts section. **The approval
letter beside it stays optional** — a requester waiting on a scan should not be
stopped from booking, and the desk can ask for it later. That is a judgement,
not the office's instruction, and §2 of
[04-production.md](04-production.md) says how to make
it mandatory in one line if they meant otherwise.

### The funds declaration lives in the Debitable head card, not with the privacy tick

**Decision.** Any head but Personal Funds asks the requester to tick the
office's sentence, word for word, and the instant is stored
(`bookings.fund_declaration_at`, migration 30).

**Why inside that card.** It is a statement *about the head just chosen*, and
it appears and disappears with it. Beside the privacy consent at the foot of
the form it would read as a second piece of boilerplate, and a requester who
switched from a department budget to their own money would still be looking at
it.

**Why Personal Funds is not asked.** The requester is the competent authority
for their own money and there is no balance for them to verify. A tick there
would be theatre, and the office's own list says "whenever any other fund
except Personal fund is checked".

**Why it is stored and not merely enforced.** An approver reading a request,
and the accounts section reading an invoice months later, both want to see that
the assurance was given. An instant rather than a boolean, like
`privacy_consent_at` beside it, because "when" also answers "was this the form
as it stood then". Nothing is backfilled: a booking made before today was never
asked, and inventing a timestamp for it would record something that did not
happen.

**Cost.** A thirtieth migration applied by hand. The store names the column
only when the declaration was actually given, so until it is applied every
personal booking still works and only a booking on somebody else's budget is
refused.

> **Written as "a project with six already outstanding", which was wrong** -
> see "The hosted project's migrations were never missing" below. 24-30 had all
> been applied; these notes could not check and said otherwise.

### Every mail about one booking is one thread, the requester's included

> **Updates** "Mail threads on the booking, not on the day" (23 Sep 2026),
> which threaded the staff's mail and deliberately left the requester's
> standalone.

**Decision.** The requester's mail joins the booking's thread too, as does the
invoice mail to Accounts.

**Why the old reasoning no longer wins.** The meeting notes' point was that
each step is news to the person who asked. It still is, and the thread does not
take it away: each message still arrives, with what happened leading its
heading and its inbox preview line. What standing alone cost was the trail — a
requester with three bookings in a fest week had nine loose messages whose only
connection was a reference id they had to notice and search for. One
conversation per request is what the reference id already promised.

**Cost.** The shared subject. Gmail splits a thread the moment the subject
changes, so `[IITPKD-GH-2026-AB12C] Guest house booking` is now what a
requester sees in their list, and "Rooms allocated" moves to the preview. That
is the same trade the staff mail made in September, and it is the whole reason
the preheader carries the per-message subject.

Nothing else moved: the threading machinery was already generic, so this is
eleven lines in `MAIL_THREAD_OF`. The daily log thread still carries the
digest, the escalation and the desk report, which are about a queue and have no
booking to hang on.

### Less text on screen: one fact per line

**Decision.** Cut the explanatory prose from the booking form, the `/book`
page, the desk's lists and the Guidelines items. Keep every rule and every
figure; drop the sentence that explains the sentence.

**Why.** The supervisor asked for the content and not the commentary. The form
had reached twenty-eight card descriptions and twenty-nine help paragraphs,
several of them explaining the same rule twice — the infant note stated the
room's capacity, and the room card below it stated the capacity again. Reading
"Who the stay is for decides who approves it and how it is settled, so this
comes first" before a question titled "Type of booking" is work, not help.

**What was kept.** Anything that is a rule or a figure (the kitchen's limit,
the room capacity, the Aadhaar length, the pay-at-checkout note, the privacy
consent, the "nothing is held until a room is allocated" line), and anything
the office asked for by name.
> **Superseded for one of them, 14 Oct 2026.** The **privacy consent** was
> kept here as a rule and has since been removed outright, at the office's
> request - the paragraph, the tick and the stored consent. Everything else on
> this list stands. **What went** is the second clause: the
"so that…", the "which is what…", the restatement of what the heading already
says.

**Cost.** A requester who would have read the explanation now has to infer it,
and two e2e assertions had to follow the copy (`kitchenName` reads "From the X
kitchen"). The Guidelines page is the place that still explains things, which
is where the owner put the instructions on 26 Sep.

### Accounts come in from a spreadsheet, as a plan then a write

**Decision.** Users & Roles takes a paste: copy the columns out of Excel,
**Check the paste**, read the plan, **Import**. All or nothing. Rows can be
ticked and deleted together.

**Why a paste and not an .xlsx upload.** The paste handles what a spreadsheet
copy actually puts on the clipboard — tabs, quoted commas — reuses
`splitCsvLine` from the academic-records import, needs no parser dependency and
no upload path, and can show the plan before anything is written. An `.xlsx`
reader would be a package and a new file route for the same result.

**Why a header line is the answer to "edit the columns".** The office's sheet
has its columns in its own order and holds only some of them. A header names
them in any order, only `email` is required, and **a column the paste does not
carry is left alone** — so a sheet of email and name cannot wipe everyone's
hostel. Without a header the default order is read, which is what a two-column
paste of email and name most likely means.

**Why a header must start with the email column.** `columnFor` also matches the
bare word "email", which is the first cell of a data line for anybody whose
address is `email@…`. Requiring the first cell to be the email column *and*
every other cell to be a known name is what tells a header from a row.

**All or nothing, like the other two imports.** Half an imported list is worse
than none, because nobody can tell which half landed — and these rows decide
who can sign in and what they can approve. **Bulk delete is the opposite**:
whatever cannot go (a person with bookings, a developer's account to a manager)
is named back and the rest still go, because a delete has no half-applied state
to be confused about and stopping the whole batch for one person would leave
the office stuck.

**The roles a paste may hand out are the caller's** (`assignableRoles`), and an
account the caller may not edit is refused by name, so a manager cannot import
a developer into existence. Checked in the action, not only in the plan.

**Cost.** In Supabase mode `createProfile` also creates a Supabase Auth user
with the password `password123`. That is harmless — the Auth password is not a
portal login, everyone signs in through LDAP or Google — but it is wrong at
six hundred rows, and it is recorded as a thing to revisit in
[04-production.md](04-production.md) §7.

## 9 Oct 2026 — two answers from the office, and one of our own mistakes

### The Special Budget approval upload stays optional

**Decision.** The fund's name beside the head is mandatory; the approval letter
is offered and not required. Asked on 8 Oct, answered by the office on 9 Oct:
leave it optional for now.

**Why it was a question at all.** The office's list writes the head as
"Special Budget (Please specify the details) [Upload Approval (doc upload)]",
and brackets do not say whether the upload is part of the requirement. The
guess made on 8 Oct was to require the typed details and offer the file,
because a requester waiting on a scan should not be blocked from booking and
the desk can ask for the letter later. That guess is now the office's answer.

**Cost.** A sanction can be claimed on a booking with nothing attached. The
accounts section still has the fund's name, which is what they chase. Making
the upload mandatory is one line if that changes
([04-production.md](04-production.md) §2).

### The hosted project's migrations were never missing

> **Supersedes** the line in every round since 24 Sep 2026 that said
> migrations 24-30 (and before that 24-26, then 24-29) were "outstanding on
> the hosted project".

**What happened.** The owner said they had run 24-30 in the Supabase SQL editor
and asked why the portal was reporting otherwise. The portal was not: **these
notes were.** `22-running-and-testing.md` said in prose that "which migrations
the hosted project has is not recorded here", and offered a hand-written check
query whose marker list **stopped at migration 25**. So from 26 onwards there
was no way to check, and each round's author copied the previous round's
sentence forward. A read-only probe on 9 Oct 2026 found **1-30 all applied**.

**Decision.** Stop recording the answer and start asking the question:
`scripts/check-migrations.mjs` / `npm run check:migrations`.

**Why a script rather than a longer query in the notes.** The query *was* the
problem - it was a list that had to be extended by hand with every migration,
and nobody did, so it quietly stopped covering the recent ones while still
looking authoritative. A marker table in code sits next to the migrations it
describes, is reviewed with them, and is the kind of thing a reviewer notices
is missing an entry. It also exits non-zero, so a deploy step can gate on it
instead of a person remembering.

**Why PostgREST and not SQL.** No new dependency and no database password:
`.env.local` already holds the project URL and the service-role key, which is
how the app itself reads the database. The cost is that **PostgREST cannot see
functions**, so migrations **17 and 23** - which only add or replace a plpgsql
function - cannot be probed. The script names them and prints the one-line
`pg_proc` query rather than reporting them as applied or missing, because the
whole point is not to assert what has not been checked. Calling either function
to test it would be a *write*, which this script will not do.

**Read-only, deliberately.** Every request is a `GET` of at most one row and
reads only whether a column, table or enum label exists - never anybody's
data. It is safe to run against production, which is the only way a check like
this is any use.

**What it cannot tell you** is whether a migration was applied *correctly* -
only that its marker exists. That is what the throwaway `postgres:16-alpine`
run is for, and that stays the rule for every new migration.

---

## 9 Oct 2026 (afternoon) — the portal stops talking: a round of removals

The owner's own round, relayed in one list: "the application is too verbose in
many places… the text which are supposed to be in the guidelines or should pop
up when we make the error is unnecessarily shown in the main page. This is the
case for all pages."

It is the second pass of the supervisor's 8 Oct request, and a sharper rule
than that one. 8 Oct cut **the clause that explains the clause**. This round
cuts **the sentence that states a rule the form already enforces**, because a
rule has three possible homes and only one of them is the form:

| Where a rule belongs | Why |
| --- | --- |
| **The Guidelines page** | Someone reading about the guest house before booking. Rendered from `lib/` and Settings (`guidelineSections`), so it cannot drift |
| **The error, when it fires** | Someone who has just broken the rule. They are told at the moment it matters, with their own numbers in it |
| **The control itself** | A greyed-out option that says why it is greyed out teaches the rule by being unusable |

A form that states all three is a form that has said the same thing to
everybody, including the people it does not apply to.

### What came off the booking form

| Removed | Where the rule still lives |
| --- | --- |
| "A guest below 5 shares a guardian's bed, needs no bed of their own and is not asked for an ID." (`INFANT_HELP_TEXT`) | Guidelines §Rooms; the infant card asks for an age 0-4 and no ID, which is the rule performed |
| "Mother, Father, Guardian… can each be entered only once - there is only one of each." (`uniqueRelationshipHint`) | The option reads **"Mother - already on this request"** and cannot be picked; `duplicateRelationshipError` on both sides |
| "Grandmother, Grandfather and Siblings become selectable once a guest is marked Mother, Father or Guardian." (`parentDependencyHint`) | The option reads **"Siblings - needs a parent on this request"**; `parentDependencyError` on both sides |
| "Maximum 4 people per room, of whom at most 3 may need a bed…" (`roomOccupancyNotice`, **twice** - under Number of rooms and in every room card) | Guidelines §Rooms; the Add buttons disable with `addGuestBlockedReason` / `addInfantBlockedReason`, and `roomPartyError` refuses it |
| "Double shared rooms will get first preference" (the student banner) | Nowhere. The office asked for it to go; both guest houses are all double sharing, so it promised a preference between one thing |
| "The rates in force today, and the same ones your invoice is priced from. GST is charged at 18% on accommodation and 5% on food. A stay that crosses a change of rate is priced night by night." | Guidelines §Charges. The invoice prints its own GST lines |
| "At most 30 at a sitting, counting everyone already booked." | `mealCapacityError` says how many places are left, which is the useful form of it |
| "The two must add up to {n}." (the diet split) | `dietCountsError`; and the line under the two boxes reads the split back |
| "Times are IST. Rooms are held by approved, occupied and pending-cancellation bookings - a request still awaiting approval reserves nothing…" | Guidelines; the panel's own banner already says nothing is held |
| "There are no kennels on the premises and no way to isolate an animal…" | The notice above it (`PETS_POLICY_NOTICE`) is the rule |
| Six card descriptions (Rates, Room availability, Meals, Guests room by room) | Their headings |

**`INFANT_HELP_TEXT`, `uniqueRelationshipHint` and `parentDependencyHint` are
deleted, not just unused.** A constant nothing renders is an invitation to
render it again.

> **Superseded, 11 Oct 2026** - for the pets row only. This round kept the
> notice itself ("the notice above it is the rule") and cut only its second
> paragraph. The office then asked for the notice to go as well: it is a
> **house rule**, which the form does not enforce, so the Guidelines page and
> the booking mail are its homes. The card is gone; `PETS_POLICY_NOTICE`
> stays, because the mail still prints it. See "11 Oct 2026" below.

### The banner is stripped from a **saved** row too

`buildDefaultFormConfig` losing the banner would leave it on screen for any
role saved from the Form Builder - which is how a default change silently does
nothing in this project (trap #2). So `sanitizeFormConfig` drops a stored
banner that **exactly** matches the retired string (`RETIRED_BANNERS`), the way
`upgradeInvoiceRules` revision 3 rewrote Kerala once. A banner the office typed
itself is untouched.

### "What happens next" comes off `/book`

The numbered panel beside the form (Request → Approval → Arrival → Departure,
and the office's phone) is gone. The requester is told by email at each step,
and the steps are on the Guidelines page where somebody deciding whether to
book can read them. `BOOKING_STEPS` stays - the Guidelines page renders it.

The side column is now the Requester details card alone, which is the one
thing there that is about *this* request.

### "Copy to: Nobody" is not a fact worth a row

`academicDetailsFor` returns `copyTo: null` when the chain is empty, so the row
is **absent** rather than reading "Nobody - this request goes straight to the
Guest House Manager, or nobody is set up to approve it yet". That sentence
appeared on exactly the roles that never need it (a faculty member's own
booking goes straight to the desk). A lookup that *failed* still says so -
"could not be looked up" is different from "nobody".

### The availability panel, redrawn

> **Supersedes** the per-day cards introduced with the counts on 7 Oct 2026
> (the component, not the decision: requesters still get counts and no rooms).

The owner: "its showing the 10 of 10 rooms available for each day of the week…
I want it to look minimal and simple but not too juvenile."

Seven cards, each spelling out "10 of 10 rooms available", and underneath a
single day a **24-row table** of the same sentence. The figure is the answer,
so the figure is what is drawn:

- a strip of ruled columns under one label, **Rooms free each day** - the date
  in micro-type, the count at display size, `/23` beside it, a 3px meter for
  the proportion, and a vermilion rule with the word **Full** on a day with
  nothing free;
- a **one-day** window leads with the figure itself ("**21** of 23 rooms free
  all day") instead of a one-cell grid;
- the hours of a day become a wrapped grid of small chips, the current hour
  outlined;
- **every cell carries the full sentence as its `aria-label`**, so nothing was
  taken from a screen reader - the repetition was visual.

The panel's toolbar is one row (view, date, back to check-in, Refresh) with the
field labels moved to `sr-only`: three labels over three small controls was
most of what the panel looked like.

### The privacy line is a line, not a notice

"Your details are held as set out in the privacy notice. You can take a copy,
or ask for it to be erased.", in a tinted band with a rule down its left edge
at the foot of My Bookings. A standing legal right drawn like something that
had just happened. It is now a hairline-ruled row of three quiet links -
Privacy notice · Download my data · Ask for erasure - and an open erasure
request still states itself, because that *is* news.

### "Facing trouble booking?" moves into the footer

The office's phone and email were a notice at the foot of My Bookings **and**
at the foot of every booking form. They are in the **portal footer** now, on
every signed-in page, beside the copyright - which is where a reader looks for
a number, and is what the owner proposed ("we can also put it in the black
footer box right??"). `MANAGER_HELP_LINE` and `GUEST_HOUSE_MANAGER_CONTACT` are
deleted; `GUEST_HOUSE_CONTACT` (`lib/site.ts`) stays the one place either is
written down.

### A meal booking's head count is typed again

> **Supersedes** the 1 Oct 2026 decision to make it a 1…30 dropdown.

1 Oct replaced a stepper with a dropdown, reasoning that "reaching 24 by
pressing + twenty-three times is not a way to answer a question". True, and the
dropdown has the opposite fault: the number is hidden inside a list that has to
be scrolled, and the answer is not visible as a number at all. The owner asked
for "a text box with up and down sliders", which is what `QuantityInput`
already is - the control the room count uses, which keeps the **raw string**
(trap: never bind a number input to a coerced value) and leaves validation to
the schema. Both diet counts moved with it.

The three boxes are written with `setValue`, like the two `TimeSelect`s beside
them: they are in `defaultValues`, so the submitted payload carries them
without a `register()` of their own. The kitchen's cap is the stepper's `max`,
the schema's `max`, and `createBooking`'s check of the sitting - three times,
on purpose.

### A dining booking is quoted meals and nothing else

`previewItemsFor(servesMeals, service)` returns the three meals for
`meals_only`. A room rate and an extra-bed rate on a form for ordering lunch
were two figures that could not be charged, on a booking with no room. The
service type comes from the page, which knows which door the requester came in
by.

### The log's filters: capability behind a disclosure

The owner: "the filtering looks too cluttered and ugly… all the tick boxes and
all makes it looks too cluttered."

What was on screen at once: **thirteen** stage tick boxes, three meal tick
boxes (all ticked, because an empty list means "all"), **fourteen** date chips
in two labelled rows, two date boxes, three selects, a toggle, and a paragraph
of search prefixes. Nothing can filter less than before; it is arranged by how
often it is used:

- one row of ordinary selects - Show, Guest house, Requester category,
  **Check-in** (the presets as one grouped list, each option carrying its
  dates), From, Until, Sort by;
- **"Stages and meals"**, a `<details>` disclosure, holding the two tick-box
  lists and the search-prefix help. Closed, it names what it is holding ("4 of
  13 stages"), so a filter can never be in force invisibly;
- the six **tiles** above are unchanged and remain the everyday status filter.

The date chips became a `<select>` with `<optgroup>` for Rolling and Calendar,
which is what a list of named periods is. The grouping survives, because "last
30 days" is still not "last month" (1 Oct).

### Everyone may export their own log as a PDF

`canExportPdf` returns true for every role. CSV already was open to everyone,
and both exports take **nothing but a query string** and re-derive the user,
the scope and the filters server-side - so a requester's PDF is their own
bookings and an approver's is their jurisdiction, exactly as the page is.
Withholding PDF meant a requester could have the same rows in the one format a
guest house office will not accept.

One real bug surfaced while doing it: `exportHistoryPdf` computed its
`defaultActor` as `developer ? "all" : "me"`, missing the
`scope.isOwnBookings` case the page and the CSV export both have. A requester's
PDF would have been filtered to bookings they had *acted on*.

### The leads come off the portal's pages

Eight page leads were a sentence restating the title ("A complete record of all
your guest house booking requests and their status" under **Booking History**).
What a lead can carry that a title cannot is the **scope** - which hostel, which
department, which slice of the archive - so that is all that is left, and only
where there is one. The desk's section descriptions went the same way: gone
where the heading says it (Current occupants, Upcoming stays), one short fact
where it does not ("Past check-out, never marked Vacated - still holding their
rooms").

## 9 Oct 2026 (evening) — an office's debitable heads are the office's, not its class's

The office sent a spreadsheet: one row per office mailbox, a column per
debitable head, **"Y" where that office may charge it**. Kept verbatim as
[04-production.md](04-production.md), tabulated in
[04-production.md](04-production.md) §2, transcribed
into `OFFICE_DEBIT_HEADS` (`lib/office-debit-heads.ts`).

The owner's instruction: **"Only show the debitable heads marked as Y do not
show those which are not."** And, on the fact that the real office accounts do
not exist yet: *"Currently i guess we cant implement it because we are using
mock authentication… Currently for offices we have directors office as the mock
user. So use this for that."*

### Decision. Per mailbox, as a ceiling over Settings.

Settings → Debitable heads keys the allowed heads by the requester's
**category**, and for offices there are two of those (`officer_office`,
`department_office`), both carrying the same six heads since 8 Oct. The
spreadsheet is finer than either, and **it does not follow `office_class`**:

| | |
| --- | --- |
| Director's Office (officer) | Institute Grant, Special Budget |
| Sports & Physical Education (officer) | Institute Grant **only** |
| Students Section | Special Budget, Student Fund, Hostel Funds |
| IAR Office | Special Budget, Alumni Fund |
| CSE Department Office (department) | Department Budget, Special Budget |
| Institute Clinic | Special Budget **only** |

There is no category boundary that produces those six lists. So the table is
keyed by the **mailbox before the `@`** - the CSV's own key, and the account
that signs in - and applied by `debitHeadsByType` as an **intersection** with
the Settings list.

**Why an intersection rather than a replacement.** The two lists answer
different questions and both have to hold. Settings is the office's live
control over heads in general: if they retire Special Budget, it has to
disappear everywhere, including from an office whose row marks it. The
spreadsheet is this office's own authority: it may not reach a head Settings
offers offices at large. Narrowing from both sides means **neither can widen
the other**, which is the same shape as `FORBIDDEN_DEBIT_HEADS` being a floor
under Settings - this is a ceiling over it.

**Why one function.** `debitHeadsByType` is already the single computation the
booking form and `createBooking` both read, through `bookingContextFor`. The
narrowing goes inside it, so the form cannot offer a head the server would
refuse, and a crafted payload naming the Student Fund from the Director's
Office is rejected by the same list that drew the dropdown.

**Only the two office categories.** `people@iitpkd.ac.in` is an Administration
mailbox on the spreadsheet *and* a plausible address for a person. The
spreadsheet maps **offices' official spending**, so an employee, a student or a
club keeps their own category's heads whatever their address looks like. A
personal booking is not asked at all (7 Oct).

**An office not on the spreadsheet keeps the category list.** Guessing a
narrower list would stop a new office booking; guessing a wider one is the
thing the table exists to prevent. Leaving it alone is the honest answer and
the office supplies the row when it has one. An empty intersection is likewise
returned as such - the form then says "No debitable head is set up for this
kind of booking", which is true, rather than quietly restoring a budget the
office has no authority over.

### Project Grant and Personal Funds are on no row

The spreadsheet has six columns for nine heads. That is the office saying an
office does not spend either: a project is held by its investigator, and an
office has no private money. Neither was in the offices' category lists
before, so nothing changed - but it answers the owner's question ("Project
Funds and Personal Funds wont be visible for any ig, if its not there in the
csv"): correct, and for offices it was already so.

### The demo aliases, and what production owes

Mock Authentication means the demo personas sit on addresses the institute
does not use for these offices. Rather than renaming the seed - which would
break the whitelist, the demo bookings and every recorded login - each row may
name **aliases**, matched like the mailbox:

- `admin`, `director.office` → **Director Office** (`admin@` is the seed's
  "Director's Office" profile, the demo `official`)
- `cse.office` → **Computer Science and Engineering** (`office_cs`)
- `registrar` → **Administration** (`ro`)

The first two are what makes the owner's instruction visible today: the demo
official's form now offers Institute Grant and Special Budget and nothing
else, and the department office beside it offers Department Budget and Special
Budget - which is also the clearest demonstration that the mapping is per
office and not per class.

**`ro` read as the Registrar's Office is an inference, not the office's
words.** It is flagged for confirmation in
[04-production.md](04-production.md) §2.

### What is deliberately not built

**The console cannot edit the table.** Settings still edits the category
lists; the per-office rows are a constant in code. Giving them an editable
home means a column on `units` and a grid in Departments & Clubs, and it is
not worth a migration while the offices it keys on do not exist as accounts
yet. The seam is in place - `narrowToOffice` is the only place the narrowing
happens - so that change is local when the office asks for it.
[03-roadmap.md](03-roadmap.md) carries it.

### Cost

One existing test moved. `tests/workflow-hod.test.ts`'s round-trip check takes
**the first head on each requester's list** and submitted no `debit_details`;
the IAR Office's official list now begins at Special Budget, whose details are
mandatory since 8 Oct, so the payload fills them in whenever
`debitDetailsRequired(head)`. The check itself - that the schema accepts its
own output for every role - is unchanged.

## 10 Oct 2026 — the process lives in `CLAUDE.md`, the rules in `AGENTS.md`

**Decision.** `CLAUDE.md` at the repo root stops being a one-line
`@AGENTS.md` import and carries the **process**: read `.memories/` before
planning a change, update it before calling the change finished, run
`npm run check:memories`. `AGENTS.md` keeps the hard rules about the code.

**Why two files rather than one.** `AGENTS.md` is 1,700 lines of what the code
does and what will bite you. The instruction "update the notes when you are
done" was a short section near its end, which is exactly where it got read
last and skipped first - the owner's report was that a change would update a
couple of context files and leave the rest stale. Putting the process in a
separate, short file that loads at the top of every session makes it the frame
around the work rather than a footnote inside it. The split is also honest:
one file is about the product, the other about how to work on it.

**Why not fold it into `.memories/README.md` alone.** The README is *inside*
the folder it describes, so it only helps whoever already opened it. The
instruction to open it has to live somewhere that loads unprompted.

**The order of the steps is the point.** The contract ends with README's
*"if the round changed X, update Y as well"* table and says to **read** it
rather than work from memory. Every other step is mechanical; that one is a
judgement call, and judgement under time pressure is what produced the drift.

**Cost, and the thing that nearly made this unsafe.** `next dev` regenerates
its managed agent-rules block and will **overwrite `CLAUDE.md` with
`@AGENTS.md\n`** - but only when `CLAUDE.md` is the file hosting that block.
`writeAgentFiles` returns `claudeMd: "skipped"` whenever `AGENTS.md` carries
the `<!-- BEGIN:nextjs-agent-rules -->` marker, which it does. Verified by
running `writeAgentFiles` against a copy of both files: the result was
`{"agentsMd":"unchanged","claudeMd":"skipped"}` and `CLAUDE.md` came back
byte-identical. **So the marker must stay at the top of `AGENTS.md`.** Move it
into `CLAUDE.md` and the next `next dev` silently deletes all of this.

## 11 Oct 2026 — the office's eleventh list: a question with one answer is not asked

Three items, relayed by the owner. Nothing configurable changed and there is
no migration; two of the three are copy, and the first is a rule.

### An office with no HOD is not offered the HOD route

> "For director, its showing 'Requires HOD Approval' but since his office
> doesnt have a HOD it shouldn't show that right [It is showing 'Nobody is set
> as HOD for your office yet - it would go straight to the manager.' though
> but i would prefer that it shouldn't show that button itself]"

**Decision.** `asksOfficeApproval(role, service, hasHodApprover)` in
`lib/workflow.ts` decides whether the **Approval** card is put at all, and the
form, the schema and `createBooking` all read it.

**Why the hint was the wrong answer.** It was written in Phase 4 as a courtesy
- an office with no HOD should not be left wondering where its request went -
but what it actually said was *"this option does nothing"*. An option that
does nothing is not an option. `routeFor` has always treated it that way:
`context.hasHodApprover` is false, the HOD stage is dropped, and Direct and
Requires HOD approval enter the pipeline at the same place. The Director's
Office is not a configuration gap either - it genuinely has no HOD, which is
why it is an *officer* office.

**Why the whole card, not just the one radio.** With the HOD option gone the
card is a single pre-selected radio labelled "Direct" - the one-option control
this project has already ruled out twice (the disabled guest-house dropdown
that broke the Student Cell's booking, and "a role with one booking type is
never asked"). So the card is withheld and the value is **recorded**, exactly
as a personal booking records Personal Funds without being asked.

**Why `createBooking` overwrites rather than refuses.** The schema's rule is
now conditional, so a payload that was never offered the choice and carries
none is accepted; one that carries `"hod"` anyway is **rewritten to
`"direct"`** rather than rejected. Refusing it would mean a form that asked
nothing failing on a field the requester never saw - the same reasoning as
the debitable head on a personal stay (7 Oct 2026). The stored value stays
honest: `office_approval = 'direct'` is what actually happened.

**Why it is not a change to the Director's Office's data.** Appointing a head
for the office in Departments & Clubs brings the question straight back -
`asksOfficeApproval` is computed per request from `hodApproversFor`, never
stored. The alternative (a "no HOD" flag on the unit) would be a second place
for the same fact to be wrong.

**Cost.** A new field on `BookingSchemaContext` (`hasHodApprover`), which
**defaults to true** so every existing caller and test behaves as before;
`createBooking` reads the approver list once and hands it to both the schema
and the route, where it used to compute it only for the route. Two e2e
journeys (the Director's Office and the CSE Department Office, which does have
an HOD) and eleven unit tests.

### The pets notice is the Guidelines', not the form's

> "'Pets are not allowed in the guest house premises.' is only required in the
> guidelines no need to show it here."

**Decision.** The amber card comes off every booking form.
`PETS_POLICY_NOTICE` is unchanged and still prints as the **"Pets" line in
every booking mail**; the Guidelines' "During your stay" section carries the
rule.

**Why this is consistent with 9 Oct rather than a reversal of it.** That round
cut *"the sentence that states a rule the form enforces"*, and the pets notice
enforces nothing - which is exactly why it survived, and why it was then the
loudest thing left on the form. The rule it belongs to is the broader one: a
form asks; it does not brief. A conduct rule for the stay is read before
booking (Guidelines) or in the confirmation (mail), not between Purpose of
visit and the rate table.

**Why the constant stays.** The mail still needs the sentence, and it is the
one place it is written down. Deleting it would put the wording in a template.

### Every form that stars a field says what the star means

> 'Mention "These field are mandatory for those shown with *" Whenever we are
> using it [*].'

**Decision.** `components/required-fields-note.tsx` holds
`MANDATORY_FIELDS_NOTE` - "Fields marked with * are mandatory." - and the
`RequiredFieldsNote` that draws it. It is rendered **above** the first starred
label in the three forms that star a field: the booking form, Users & Roles'
add/edit dialog, and the rejection dialog.

**Why a component and not a sentence per form.** Three copies of a convention
drift into three wordings, and this is a convention rather than a fact about
any one form. One component also makes the rule enforceable by review: a new
form either renders it or does not star its fields.

**Why above the fields and not at the foot of the form.** A legend after the
thing it explains is read second. The booking form is long enough that a note
at the bottom would be read after Submit was pressed.

**Why not "(mandatory)" beside each starred label.** That is the commentary
8 Oct took out - the star and the word say the same thing. For the same reason
the rejection dialog's description lost "A reason is mandatory.": with the
note above it, the sentence said it twice.

**What this does not change.** The stars themselves, and which fields carry
them, are untouched - including the ones that follow the Form Builder
(`star(mode)`, custom fields) and the conditional ones (Alumni ID card, ID
document, the debit details box), which read "(optional)" when they are not
required.

---

## 11 Oct 2026, the design pass

> "The current site looks too meh, bland as well as looks too ai generated
> [give the claude generated look]. The current UI looks generic and
> recognizably AI-generated."

The fourth time the look has been reworked, and the first where the answer was
**not** the palette. What was asked for in detail: the institute's own
branding, distinctive typography and spacing, no generic AI dashboard
patterns, no excessive cards, gradients, decorative icons, unnecessary badges
or repetitive layouts, a welcoming booking journey, dense approval and desk
screens, minimal text, and consistency without one layout for every page.

### The palette was checked again rather than changed

iitpkd.ac.in's theme CSS was pulled and counted: `#e94c26` 22 times, then
`#fff`, `#333`, `#ededed`, `#1a1a1a`, with `font-family: 'Source Serif Pro'`
on the headings. That is what `app/globals.css` already holds, and it was put
there on 26 Sep by reading the same files. **Nothing was recoloured.**

**Why this mattered to the decision.** Three of the four previous rounds
reached for colour (navy and gold, then vermilion with pills and gradients,
then the institute's palette) and the complaint survived all of them. The
things that actually read as template were countable, and none of them was a
hue:

| Screen | Measured |
| --- | --- |
| Manager console | 7 tiles 110px tall reading 0, then 6 near-identical sections, 4 of them 90px dashed boxes; the one row with work 1300px down |
| Approval Log | 6 tiles in a 5-column grid, one orphaned on a second row |
| My Bookings | 1150 x 180 of vermilion holding two lines of type |
| Room availability | 20 cards, 19 reading "Free all week - available to book" |
| Home | A quarter of every section empty, holding a six-word label |
| Approver queues | A Status column repeating the single status the queue filters on, pushing Reject off a 1440px page |

So the decision was to leave the colour alone and spend the whole round on
**composition, type and density**.

### Five named type steps, and two devices taken from the institute

**Decision.** `--text-display / title / section / card / meta`, and two
utilities, `rule-title` and `figure-serif`.

**Why named steps.** Headings were written as one-off `clamp()` values at the
point of use, which is how eight sizes of heading reached one page and how a
section heading could be larger than the page title under it. A step is a
decision about rank, so it is named once and referred to.

**Why those two utilities and not more.** They are iitpkd.ac.in's own, which
is the difference between "institutional" and "a template in institute
colours": `h1.node-title { border-bottom: solid 1px #e94c26 }` and
`.counters span { font-family: 'Source Serif Pro'; font-size: 4.5em }`. A
third was written from its `.subtitle:after` and **deleted unused** - there was
nowhere it did not double up with a rule already there, and an unused utility
is a future inconsistency.

**What `rule-title` replaced.** A 2px **ink** rule, which is the same mark
`Table` uses to close its header row. A page and a table in it opened
identically and neither outranked the other.

> **The trap.** tailwind-merge classifies an unknown `text-<word>` as a
> **colour**, so `cn("text-title", "text-ink")` dropped the size as the losing
> half of a colour conflict and three home page headings rendered at 16px with
> no error anywhere. `lib/utils.ts` builds `cn` with `extendTailwindMerge` now
> and registers the five names under `font-size`. **Any new `--text-*` step
> has to be added there too.**

### A zero is not worth a tile

**Decision.** `DeskSummary` is one ruled index - label, leader rule, figure,
on a 44px baseline - with a zero set small and grey and a live count set in
the serif at display size. `EmptyState` is one line against a hairline, not a
dashed box 90px tall; 22 of them were replaced.

**Why.** The desk's own screen, on an ordinary morning, was seven large
figures all reading 0 followed by four boxes explaining that there was nothing
in them. Both patterns spend the most space on the least information, which is
the thing that makes a page read as generated rather than designed.

**Why the order never re-sorts on the count.** It was tempting to float the
lists with work in them to the front. This screen is read all day by the same
two people, and a figure that moves because somebody checked out is a figure
they have to find again.

### A column that repeats itself is not a column

**Decision.** `ReviewQueue` drops the **Status** column; check-in and
check-out share one **Stay** cell. `BookingDetails` keeps one badge; the role,
booking type, service type and diet split are a line of text. The manager
queue's Category cell and Users & Roles' Role cell are plain text.

**Why.** `/warden`, `/hod`, `/approvals` and `/iar` each list exactly one
status, so the column printed the same words down every row - and it was what
pushed **Forward** and **Reject** past the right edge of a 1440px page. The
column cost the approver the two buttons the page exists for. After the change
the table measures 1150px inside a 1150px container.

**Why a badge is not free.** Six outlined pills opened `BookingDetails`, of
which one was a state. The others were classifications, and in a row they read
as decoration and buried the one that meant something. A foreign national
keeps a mark of its own: the guest house has to report one.

### The grid before the record

**Decision.** The allocation dialog renders `RoomGrid` first and
`BookingDetails` under it.

**Why.** The dialog is called "Allocate rooms" and its only control is the
grid. On a request with meals and a few guests the manager scrolled past a
meal table, a guest table and the approval trail to reach it. Nothing had to
be read first: the grid's own header carries the stay's period and "N of M
requested", and the description now names the requester and the guest house -
which also replaced an instruction sentence of the kind 9 Oct removed
everywhere else.

### What the form keeps, and what stops being a section

**Decision.** The pay-at-checkout note stays, as an inset line rather than a
numbered card. The form is six sections, not seven.

**Why this is not a reversal of 8 Oct.** That round reviewed the portal's
prose and **kept** this note by name. It is kept. What changed is that a
numbered section is a thing to fill in, and a student's form opened on two of
them before the first question - one holding a read-only value, one holding a
sentence.

### The home page's empty quarter

**Decision.** `SectionHead` puts the label and any link on one line above a
full-width hairline with the heading under it; the
`lg:ml-[calc(25%+10px)]` indent comes off all three sections. The hero is
6 + 6 rather than 5 + 7.

**Why.** The label-in-the-left-quarter arrangement is a real editorial device,
but it only works when the column holds something. Here it held a six-word
label and then 600px of nothing, down the whole page - the single biggest
reason the page read as mostly empty. The hero's five columns, meanwhile, left
371px of text width for a 64px headline, so "Guest houses of IIT Palakkad"
broke over three lines.

**What was not touched.** Every content rule the owner and the supervisor set
between 26 and 30 Sep: no figures, no requester categories, no approval chains
or role names, no photo captions, photographs contained in the layout, promise
little. This round moved boxes and type and left the words alone, apart from
three page leads that restated their own titles.

## 12 Oct 2026 — the approval workflow becomes configuration

The owner:

> I want to make a feature such that the guest house manager can change,
> insert and delete connections, basically who forwards whose request, who
> approves whose and all. Like the entire approval workflow should be in the
> control of the guest house manager such that they can change and update it,
> like make the feature robust.

### The pipeline is a list of routes, not a `switch`

**Decision.** `rules.approval` - a jsonb row in `app_settings`, edited at
Console -> **Approval Workflow** - is an **ordered list of routes**. A request
takes the first active route whose conditions match it; the route holds the
stages before the desk, each naming who decides it. `lib/approval-routes.ts`
is the model and the defaults, `lib/workflow.ts` applies them unchanged in
shape (`routeFor` still returns an ordered list of statuses).

**Why.** `routeFor`'s `switch` had ten cases, and the history of this file is
the history of those cases changing: the club route was rewritten on 24 Sep
when advisors started booking, the HOD stage arrived in Phase 4, the office's
Direct / HOD choice on 11 Oct, the IAR split when alumni lost their logins.
Each was a deploy for what the office experiences as an administrative
decision. The office already edits the people (Departments & Clubs), the
money (debitable heads), the questions (Form Builder) and the wording (Email
Templates); the chain was the last thing in the product that needed us.

**Why a list of rules rather than one chain per requester category.** A keyed
record - the shape `DebitRules` uses - would have been less code. It cannot
express "requests from Civil go to the Dean" or "Malhar's students skip the
warden", which is half of what "who approves whose" means, and the office has
asked for narrower routing twice before by other means (`hod_unit_id`,
`office_class`). An ordered list with optional conditions covers the keyed
case as a special case: every default route is one of the old `switch`'s arms
with its conditions written out.

**What it cost.** Order is now a rule, which is a thing a console can get
wrong invisibly: a narrow route placed under a broad one never fires. So the
list is explicitly ordered with Up / Down, new routes are inserted at the
**top**, and the section carries a **Try it** panel that runs the routes being
edited for one real account and names the people who would decide each stage.
"I added it and nothing happened" is the one failure this section must not
have.

**Rejected:** a `workflow_routes` table. It is a list that grows, which is the
project's own test for a table rather than a jsonb row - but it would have
been a migration, two store implementations, and a `DataStore` addition, for
data that is read once per request, is never queried by anything but the
portal, and is at most a few dozen rows. `parseRuleGroup` already merges a
saved row over the defaults and self-heals a row saved before a field
existed. Revisit if the office starts wanting routes per guest house.

**Refined the same day (second round).** Everything above stands - the stored
shape, the ordering, the matching, `routeFor`. What did not survive contact
with the owner was the **screen**: an ordered list of routes with its match
conditions and approver kinds on show is the engine with a form around it,
and it was rejected in those words ("Its all wrong"). The list is now behind
**Advanced**, and the office works in kinds of request. See "12 Oct 2026
(second)" at the end of this file.

### Four waiting statuses, and a name for each stage

**Decision.** A route is built from the four intermediate slots that exist in
`booking_status` - `PENDING_WARDEN`, `PENDING_FA`, `PENDING_HOD`,
`PENDING_IAR` - each at most once per route. A stage carries an optional
`label` for where the slot's own name is wrong for the job it has been given;
`configuredStageName` reads it back for the queue page and the navigation, and
returns null where two routes name one slot differently.

**Why not a status per stage the office names.** `booking_status` is a
Postgres enum. Adding a value is a migration, and migration 29 is the standing
lesson that Postgres will not let you *use* a new value in the transaction
that adds it - so a console that could name a stage would need a migration per
stage, applied by hand, before the stage worked. Four slots before the desk is
twice the deepest chain the institute has ever asked for, and renaming one is
the part the office actually wants: "Pending Club Approval" on a slot now used
for the Dean of Students is what they would complain about.

**Why at most once per route.** `nextStatusAfter` finds the next stage by
`stages.indexOf(current)`. One status twice has no single successor, so the
schema refuses it by name.

### The last stage is always the Guest House Manager

**Decision.** `PENDING_GH_MANAGER` is not a configurable slot. Every route
ends there whether it says so or not, and `canReview` answers that status from
the role alone.

**Why.** Approval at the desk *is* room allocation (`allocateRooms` assigns
rooms and sets `APPROVED` in one step, and `reviewBooking` explicitly refuses
a manager's generic approval of a room booking). A route that ended anywhere
else would be a request that is approved but holds no room - a state nothing
downstream can price, allocate or check in.

### Six kinds of approver, three of them relative to the requester

**Decision.** `ApproverRule` is `warden` | `hod` | `unit_head` | `role` |
`unit` | `profile`.

**Why both kinds.** The first three keep the property the units system was
built for in the first place (see *Approvers belong to the unit, not to a
matched string*): they are resolved when somebody looks, so changing an HOD
moves the waiting requests and nobody edits a route. The last three are what
the old code could not say at all - a named office, a named person - and are
how "who approves whose" gets answered for a one-off arrangement. A route that
names a person is also the only way to give a queue to somebody who heads
nothing, which the e2e journey uses deliberately.

### A reconfiguration must not strand a request

**Decision.** Three defences, all of them kept:

1. **`canReview` falls back to the slot's built-in meaning**
   (`BUILT_IN_STAGE_APPROVERS`) for a request waiting at a stage the current
   routes no longer describe.
2. **A stage nobody can decide is skipped** at submission, and the log names
   it (`skippedStages`) - the HOD rule of Phase 4, generalised to every
   stage. Only where the caller passed both a directory and a requester:
   without them a stage is assumed staffed, which is exactly what the
   hardcoded pipeline did, so a mail module with units but no profiles
   behaves as it always has.
3. **The save is refused** when a request already waiting would be left with
   nobody to decide it, or a stage points at a unit with no head, a deleted
   account or a role nobody holds (`approvalRouteBlockers`). Named, refused,
   nothing saved - the contract every Setting has.

**Why all three and not one.** They cover different moments. (3) is the only
one that can tell the office *before* they break something, but it cannot see
a unit whose head is removed next week. (2) stops a route that says more than
it does. (1) is the floor: whatever happens to the configuration, a request in
a queue stays actionable by whoever the stage used to mean.

**Deliberately not built: a manager override on an intermediate stage.** The
obvious fourth defence is "the desk can always act on anything". It was
considered and left out: `reviewBooking` refuses a manager's approval of a
room booking by design, so the override could only ever reject, and giving the
desk a half-power at every stage is a worse answer than refusing the change
that would need it. The developer console's force-status override remains the
escape hatch it has always been.

### A queue is "a route points at you"

**Decision.** `stagesDecidedBy` / `stageQueuesFor` decide the navigation links
and guard the four queue pages. `/warden` and `/iar` now filter their list
through `canReviewBooking` instead of listing a status outright.

**Why.** The old gates were role tests (`user.role === "warden"`) and
appointment tests (`isHodForAny`), which both answer a question the routes
have taken over. A professor a route names heads no unit and holds no reviewer
role; without this they would have a stage and nowhere to work it. `/warden`
was worse than a gate: it was a store query scoped by `hostelName`, so a
request routed through that slot from somebody with no hostel would have been
filtered out of the only queue it was in.

**The exception, and why.** `warden`, `iar_cell` and the legacy
`faculty_advisor` keep their link whatever the routes say, because
`homeForRole` sends them to that page - turning them away is a redirect loop.
An empty queue costs nothing; a queue somebody is in and cannot reach costs a
request.

### What the office is told, in words

**Decision.** `describeRouteChanges`, not `describeRuleChanges`, for the
confirmation dialog and the audit log. `ConfirmDialog`'s consequence list
scrolls.

**Why.** `describeRuleChanges` walks the JSON and names every leaf, which is
right for a handful of numbers. Inserting one stage produced a dozen lines of
`rules.1.stages.1.approver.kind: undefined -> "profile"` - unreadable, and
long enough that the dialog's own buttons went off the bottom of the screen
with nothing to click. A route change is about chains and conditions, so it
says `"Student - Assistant Warden": Assistant Warden - Guest House Manager ->
Assistant Warden - Dean of Students - Guest House Manager`.

### One door to the routes

**Decision.** `saveRuleGroup` **refuses** the `approval` group and names
Console -> Approval Workflow. The section is `workflow`, open to the manager
and the developer, and is not in the developer-only Settings page.

**Why.** `rules.approval` is a rule group, so the generic settings action
would have written it - skipping the impact check and the audit wording that
belong to it. Two doors to one `app_settings` row means one of them skipping
both. And the section's owner is the point of the round: the office runs the
approval chain, the developer runs the portal.

### Derived, not asserted: whether an office is asked

**Decision.** `asksOfficeApproval` computes the route twice, once with each
answer, and asks only when they differ.

**Why.** The 11 Oct rule was "an office with no HOD is not asked", written as
`hasHodApprover`. That is the right answer for the default routes and the
wrong shape once the routes are editable: an office whose route has no HOD
stage at all should not be asked either, and an office the manager routes
through a named person *should*. One computation answers both, and the
11 Oct behaviour falls out of it unchanged.

## 12 Oct 2026 (second) — the workflow screen is a flow, not a rule table

The owner, on the console built that morning:

> Its all wrong and not at all what i wanted.

with the brief repeated unchanged. The clause it turned on:

> The interface should be simple, intuitive, and visual, allowing the manager
> to understand exactly how requests will flow without needing technical
> knowledge.

### The office works in kinds of request, not in routes

**Decision.** Console -> Approval Workflow opens on **one chain per kind of
request**, drawn left to right and ending at the desk: eleven cards -
student, faculty official, staff official, employee personal, club via its
advisor, office direct, office through its HOD, IAR Office, IAR Student Cell,
dining, the desk's own. `lib/approval-categories.ts` holds them. The ordered
list of routes is shut, under **Advanced**.

**Why.** The ordered list is the right shape for the thing that runs and the
wrong shape for the person who maintains it. To move one approver, the office
had to hold first-match precedence in their head, know that a narrow route
under a broad one never fires, fill in eight rows of match conditions, choose
an approver *kind* from a six-way taxonomy that only means something if you
know the data model, and pick which of four waiting statuses the stage sits
in - then rename it, because the slot's own name is somebody else's job. Every
one of those is a question about the implementation. The office's own question
is "who approves a faculty member's official stay", and there was nowhere on
the screen that asked it.

**Why not a keyed record after all.** The morning's entry rejected "one chain
per requester category" as the *stored* shape, and that reasoning is
untouched: conditions are what express "requests from Civil also go to the
Dean", and a keyed record cannot. This round changes the *presentation* only.
`categoryChains` answers with `matchingRule`, so a card shows what the portal
will actually do; a card that worked its own chain out would be a second
implementation of precedence, and the two would disagree the first time
somebody wrote a route by hand under Advanced.

### A card that shares a route forks it

**Decision.** Editing a kind whose governing route governs **only** that kind
edits it in place. Editing one whose route governs others as well **inserts a
route for that kind alone, immediately above** the one it is leaving.
`setCategoryStages` is the whole rule; the card says which will happen before
anything is saved.

**Why.** The defaults put faculty and non-teaching staff on one official-stay
route, and both classes of office on one direct route - so "change who
approves faculty" has no honest answer that is not either "this also changes
staff" or "faculty gets its own route". Silently changing both would be
wrong; refusing would make the screen useless for the commonest real request.
**Above**, because the engine takes the first match. **Immediately** above,
rather than at the top, because a route further up still matches whatever it
matched before, so nothing that used to win stops winning.

**What it buys.** The thing the morning's screen could only do by hand-writing
a condition: a different chain for faculty than for staff. A second edit of
the same kind finds its own route governing it alone, so it edits in place and
nothing accumulates.

### The slot is chosen for the step, and never moves after

**Decision.** `slotForApprover` picks the waiting status a new step occupies -
the slot whose built-in meaning *is* that approver where one is free, else the
first free one. Changing a step's approver afterwards **never** moves its
slot; where the new approver is not what the slot means, the step is named
after them instead (`setStageApprover`), and a name the office typed is never
overwritten.

**Why.** The slot is an implementation fact - four values in a Postgres enum -
and asking the office to choose one was asking them to know why there are
four. But it cannot be hidden *and* mutable: a request already waiting is
sitting in that status, so moving the slot would move the request. Naming the
step is the honest alternative, and it is what the Forward button and the
queue page read anyway (`stageLabel`, `configuredStageName`).

### An active route no card governs is named, not hidden

**Decision.** `uncoveredRules` lists any active route no kind of request maps
to - today, the legacy club-own route - in one line above Advanced.

**Why.** A workflow screen that silently failed to mention a route which is in
force would be worse than the list it replaced. The screen is allowed to be
simpler than the engine; it is not allowed to be less true than it.


---

## 13 Oct 2026 - one `profiles` table, and the second door that the import would have opened

Asked before importing the college's Excel file of users: **is a single table
for students, faculty, staff and the rest the right design, or should each
category have its own table?** And: what has to be true before the file is
loaded?

No code was changed this round. What came out of it is one modelling decision,
one correction to a documented security claim, and the runbook in
[04-production.md](04-production.md) §1a.

### The decision: keep one table. The alternative is not cheaper, it is unsafe

`public.profiles` stays as it is. (There is no `users` table and never was -
`auth.users` is Supabase's, `public.profiles` is ours.) Four pieces of
evidence, all from the repository rather than from preference:

1. **19 foreign keys across 11 tables point at `profiles.id`** -
   `bookings.user_id` and `.created_by`, `booking_logs.action_by`,
   `units.head_id` / `.acting_head_id` / `.faculty_advisor_id`,
   `room_holds.override_by`, `academic_records.imported_by`,
   `security_audit.actor_id`, `tariffs.created_by`, `invoices.paid_by` /
   `.issued_by` / `.cancelled_by` / `.created_by`, `room_closures.created_by`,
   `sessions.user_id`, `user_totp.user_id`, `security_events.user_id` /
   `.handled_by`. Splitting the table means either four FKs where there is one,
   or a polymorphic `(table, id)` pair with **no** database-enforced
   integrity. The project's whole approach to room clashes was to move an
   invariant *into* the database (`room_holds`, migration 3); giving up
   referential integrity on identity would be that decision in reverse.

2. **A role is an authorisation level, not a category of person.** Users &
   Roles lets a developer change anyone's role (`assignableRoles`,
   `userEditError`). Under separate tables a student graduating into staff is
   a DELETE plus an INSERT - a **new primary key** - and every row above
   breaks. `booking_logs.action_by_name` is denormalised precisely so history
   survives an account being deleted; separate tables would make that the
   normal path rather than the exception.

3. **Half the roles are posts, not categories.** `warden`, `gh_manager`,
   `gh_caretaker`, `iar_cell`, `developer` describe a job someone holds. An
   Assistant Warden *is* a faculty member. A students / faculty / staff split
   has nowhere to put them without duplicating a person, and HODs and Faculty
   Advisors are already modelled the right way - **an appointment on a unit**
   (`units.head_id`, `units.faculty_advisor_id`, migrations 15 and 25), not a
   row in a different table.

4. **The per-category split already exists, on the correct axis.** Migration
   28 faced this exact question for six kinds of academic record and chose one
   table with a `kind` discriminant, writing the reason into the file: six
   tables would be "six times the surface for the same six CSV pastes". The
   useful boundary is not student-vs-faculty, it is **identity and
   authorisation (`profiles`, readable by the app) vs. per-category reference
   data (`academic_records`, service-role only)**. The college's sheet feeds
   both, and that is the mapping question worth spending care on.

The cost of one table is six nullable columns, and three of them are already
constrained - `hostel_name` to `hostels`, `unit_id` to `units`,
`staff_category` to a check. Only `department_or_club` and `roll_number` are
loose free text, and `department_or_club` is already legacy: `unit_id` is what
routes an approval. **No migration is needed to hold the college's data.**

> **What would change the answer.** A category acquiring a dozen fields of its
> own that no other category has, or its own lifecycle. Students are the
> candidate (programme, semester, graduation). If that arrives it is a
> *satellite* table keyed on `profiles.id` - one-to-one, additive, no FK
> churn - which is what `academic_records` already is.

### The correction: "the Auth password is harmless" was wrong

[04-production.md](04-production.md) §7 parked the `password123` problem as
"fine for demo accounts and wrong for six hundred real ones - though
harmless, because **the Auth password is not a portal login**: everyone signs
in through LDAP or Google." And
[05-credentials-and-security.md](05-credentials-and-security.md) Part 4 stated
that row-level security has "no `authenticated` write policy - which is what
makes the public anon key safe to ship."

**Both are wrong, and the import is what would have made them expensive.** A
Supabase project has two doors the portal does not guard - GoTrue
(`/auth/v1`) and PostgREST (`/rest/v1`) - and they answer to the anon key that
ships in the browser by design. The portal's LDAP form, session rows, console
password and TOTP are all on the other door.

- The seed creates 18 **confirmed** email identities with
  `crypt('password123', ...)`, `developer@iitpkd.ac.in` among them, and the
  password is published in this repository.
- `lib/store/supabase.ts:841` gives the same password to **every account the
  console or an import creates**.
- There are **21 write policies granted to `authenticated`**, ten of them
  `for all`, including `developer manages profiles / guest houses / rooms /
  bookings / booking_guests / form_configs` - gated only on `my_role() =
  'developer'`, which is read from the JWT's own profile row.
- `profiles` is readable by any JWT (`using (true)`).
- `authenticated users read documents` grants `select` on the **entire**
  private `documents` bucket - `using (bucket_id = 'documents')`, no
  per-user scoping. That is every uploaded ID document and alumni card.

So the claim should have been the other way round: the anon key is safe to
ship **only because an `authenticated` JWT is supposed to be unobtainable**,
and a published password on a confirmed identity is exactly how one is
obtained. Importing the institute multiplies the reachable accounts from 18 to
a few thousand, and gives each of them a name and a roll number to disclose.

**One link is unverified and must be checked by hand:** whether the hosted
project has the email/password provider enabled. That is an Auth dashboard
setting, not in the repository, and not readable with the service-role key.
If it is off, every other link still holds and the exposure is one toggle
away.

**`academic_records` is the counter-example that shows the fix.** Migration 28
deliberately gave it no `authenticated` policy, so parents' names and phone
numbers are service-role-only. That is what the other tables need.

### Why this is recorded as a decision and not just a bug

Because the previous reasoning was written down, was plausible, and was read
and carried forward twice. It failed in a specific way worth naming: **it
reasoned about one door and concluded about the system.** The portal's own
controls were all enumerated correctly; what was missing was that they are not
the only way in. Any future claim of the form "X is not a portal login, so X is
harmless" needs checking against PostgREST and GoTrue before it is believed.

### Two smaller findings from the same review

- **The import is validated atomically but applied row by row.**
  `importUsersAction` refuses a plan with any bad line, then loops
  `await store.createProfile(row)` - two HTTP round trips each in Supabase
  mode. At `MAX_USER_IMPORT_ROWS` (2000) that is ~4000 sequential round trips
  in one server action, with no `maxDuration` in `vercel.json`. It will time
  out part-way and nothing records where. The code comment already admits the
  shape ("one profile at a time because that is what `DataStore` offers"); the
  practical answer for now is batches of 100-200 plus a re-paste, which is
  safe because the upsert is idempotent, and the real answer is a bulk upsert
  in `SupabaseStore` ([03-roadmap.md](03-roadmap.md) §1 gate 11).
- **There is no undo for an import's *updates*.** New rows can be ticked and
  deleted; updated rows have lost their previous values, and the audit row
  keeps only the counts and the column list. So the plan's **"updated" count
  is the number to read before pressing Import** - on a first load it should
  be 0. Worth keeping in mind before adding a before/after to the audit
  payload, which is the cheap fix if the office ever needs one.

### What was deliberately not done

- **No migration was written.** The schema holds the college's data as it
  stands; writing one now would imply the modelling question was open.
- **The security fix was not applied either.** It changes
  `createProfile`, the seed, and possibly the `profiles.id -> auth.users`
  foreign key - three things with their own blast radius, and the owner
  commits. It is written up as [03-roadmap.md](03-roadmap.md) §1 gate 10 and
  [04-production.md](04-production.md) §1a.1 instead.
- **No importer was changed.** `planUserImport` is already keyed on
  `lower(email)`, already leaves absent columns alone, already checks LDAP
  uniqueness against the state it would leave, and is already covered by 15
  assertions in `tests/ninth-round.test.ts`. Repeatable imports were the thing
  to verify, not to build.

---

## 13 Oct 2026 (second) - the second door is closed, and the schema is left alone

The round after the review above. The owner asked for the normalization
question answered properly, the security findings **implemented** with
regression tests, and the import prepared - all before the college's
spreadsheet arrives.

**One migration, three code changes, two repair scripts, two test files. No
table was split, no column dropped, no feature changed.**

### Normalization: almost nothing to do, and that is the finding

The full list is in [21-database.md](21-database.md) under *"Normalization -
the review of 13 Oct 2026"*, so it is not repeated here. What matters as a
decision is **what was deliberately not changed**, because each is a thing a
later session will be tempted by:

- **`profiles.department_or_club` stays**, although it genuinely duplicates
  `unit_id` and the two can disagree. Five modules still read it
  (`approval-routes`, `workflow`, `booking-search`, `invoice`,
  `mail/templates`). Removing it is a feature removal dressed as a
  normalization, and the instruction was explicit: establish that nothing
  depends on a column before dropping it. Something does.
- **`academic_records` stays one table with nullable per-kind columns.**
  Migration 28 decided this and wrote the reason down; nothing has changed
  except that there is now a second reason - the college's sheet feeds it, and
  six tables would be six importers.
- **`academic_records.hostel` stays free text** rather than a foreign key to
  `hostels`. It is the institute's own spelling in a table that records what
  the office pasted in, and it is **display-only** - checked, no reader scopes
  or authorises on it. A foreign key here would reject a valid import to
  enforce a consistency nothing needs.
- **`guest_houses.total_rooms` stays app-maintained**, although it can drift
  if a room is inserted by SQL. The fix is a trigger, it is cheap, and it is
  **not** what the import needs - so it is on the roadmap rather than smuggled
  into a security migration. Recorded rather than fixed is a decision, not an
  oversight.
  > **Superseded 14 Oct 2026.** The trigger is migration 33, in its own
  > migration for the reason given here - 32 is required by the code, 33 is
  > optional, and they must roll back separately. The column stays; dropping
  > it would change `GuestHouse` in `lib/types.ts` and two console pages.
  > `recountRooms()` is kept for the mock store, which has no triggers.

Four denormalizations were examined and kept because they are *correct*:
`bookings.user_role` and `booking_logs.action_by_name` preserve history on
purpose, issued invoices are snapshots on purpose, and `bookings.search_text`
turned out not to be a denormalization at all - it is `generated always as
... stored`, so Postgres maintains it.

### The security fix: remove the reason for the credential, not the credential

The obvious fix for `password123` was to rotate it - give `createProfile` a
random password instead. That was rejected. It would leave every imported
person with a working GoTrue credential, just an unknown one, and the
`authenticated` role would still have 38 policies behind it. The vulnerability
was not a weak password; it was **that a portal account implied a database
credential at all**.

So migration 31 removes the thing that forced it: `profiles.id` no longer
references `auth.users (id)`. The portal has never authenticated with Supabase
Auth - it is LDAP or Google, then a session row (migration 21) - so the
foreign key was the only reason those users existed. With it gone,
`createProfile` is one insert, the seed creates no Auth users, and all 38
`authenticated` policies can go because nothing legitimate holds such a JWT.

**The three facts that made this safe to do, each checked rather than
assumed:**

1. **Nothing connects as `authenticated`.** The server uses the service-role
   key, which bypasses RLS. Sign-in is LDAP plus `sessions`.
2. **Realtime connects as `anon`, not `authenticated`.**
   `components/live-updates.tsx` creates its client with
   `persistSession: false`, and there has never been an `anon` policy - so
   dropping the `authenticated` ones cannot break live updates. This was the
   one thing that could have made the change a regression, and it is why it
   was checked before anything was written.
3. **RLS stays enabled.** With RLS on and no policy, `authenticated` is denied
   by default and service-role still bypasses. That is migration 28's
   deliberate pattern for `academic_records`, now applied to the rest - as
   opposed to disabling RLS, which would open the tables to every role.

> **Keeping `my_role()` and `can_access_booking()`** although nothing calls
> them now. They are the starting point if the app ever moves to per-user
> Supabase sessions. The important note for whoever does that:
> **`auth.uid() = profiles.id` stops being true at this migration**, so the
> old policies cannot simply be restored - they would silently deny
> everything. That is also why the policies were dropped rather than left in
> place looking like enforcement.

### The one coupling this creates, and why it was accepted

`createProfile` now inserts without an id and without an Auth user. A database
still on migration 30 refuses that two ways - no default on `id` (23502) and
the foreign key (23503). **So the code and migration 31 ship together**; there
is no version of the code that works on both schemas, because the foreign key
fundamentally requires an Auth user to exist.

That is a real backward-compatibility cost and it was accepted rather than
engineered around, because the alternatives are worse: supplying a
client-generated id does not help (the foreign key still fails), and keeping
the Auth user is the vulnerability. What was done instead is make the failure
**legible**: `profileWriteError` catches both error codes and names the
migration, the way migration 25's absence names itself when an advisor is
saved. Verified against a throwaway database on migration 30: the insert fails
with `null value in column "id"`, which without the handler would send
somebody looking at the application code.

This is the first migration in the project that is **not optional once the
code is deployed**, and [04-production.md](04-production.md) §5 now says so in
the table of what a missing migration costs.

### The tests exist because the prose was wrong

`tests/rls-surface.test.ts` asserts the invariant against the SQL itself: no
`authenticated` policy survives, RLS is never disabled, the seed creates no
Auth user, the store mints no password. It also pins the historical count at
38 so the parser cannot silently stop matching and pass vacuously.

It exists because **two written claims in this folder were false** and had
been read forward twice without being checked (see the entry above). A
regression test is the only form of that claim that cannot rot. It was
mutation-checked - removing one `drop policy` line from migration 31 fails it
with the policy named - because a test that cannot fail is the same problem in
a new place.

`tests/user-import-idempotency.test.ts` asserts the property the college's
*repeated* spreadsheets depend on, which `tests/ninth-round.test.ts` does not
cover: a person imported twice is **one row with one id, for ever**. That
matters because 19 foreign keys point at `profiles.id`; if a re-import
inserted a second row or reassigned an id, everyone's booking history would
detach in one press, and nothing on screen would say so.

> **A trap it found.** The mock store's `loadDb()` self-heals by adding any
> missing seeded persona, so a test fixture of `profiles: []` is never empty -
> and three of the sheet's addresses collided with demo personas, which turned
> "added" into "updated" and looked like a bug in the importer. The test now
> uses addresses the seed does not have and asserts **deltas**, not totals.
> Noted in [22-running-and-testing.md](22-running-and-testing.md).

### What was deliberately left for the owner

**Migration 31 is not applied to the hosted project, and the Auth users are
still there.** Both are production actions on live data. The working tree has
the migration, the rollback script and the repair; §1a.1 of
[04-production.md](04-production.md) has the order, and the order matters -
the repair refuses to run before the migration, because the old foreign key's
`on delete cascade` would take every profile with the Auth users it deletes.

**The email/password provider is still unverified.** It is a dashboard
setting, not in the repository, not readable with the service-role key. Until
the repair runs, it is the control that matters most, because the published
password is live on those 18 rows right now.

> **Superseded 14 Oct 2026 - it is verified, and it is on.** "Not readable with
> the service-role key" was true and beside the point: GoTrue publishes the
> provider list at `GET /auth/v1/settings`, which needs only the anon key and
> writes nothing. Email is **enabled** and `disable_signup` is **false**, so
> the exposure does not even need the published password - an attacker signs
> up with an address they control. Turning the provider off is now step 1 of
> [04-production.md](04-production.md) §1a.1, ahead of the migration.

---

## 14 Oct 2026 - an import you can undo, and the indexes a delete needs

The round before this one prepared the institute's user import and said, in
[04-production.md](04-production.md) §1a.7, exactly what was missing:

> "A wrong batch of updates is the dangerous one. There is no undo: the
> previous values are not kept, and the audit row records only the counts and
> the column list, not the old values."

This round closes that, and two things found while closing it.

### The undo is a record written before the writes, not a reconstruction after

**Decided: one row per import, holding the previous values, written before the
first profile is touched** (migration 32, `lib/users-import-undo.ts`).

The alternative considered first was **reconstructing** the previous state from
`security_audit`, which already exists, is append-only by trigger, and already
records every import. Rejected on three counts:

1. **It does not hold the values.** `recordAudit` was called with the counts
   and the column list. Reconstruction would need the before-state recorded
   anyway, so the only question was *where*.
2. **The audit log is purged** (`purge_security_audit`, never below 180 days).
   An undo record that expires is not one.
3. **A 2000-row before-state in one `details` jsonb** is the wrong shape for
   the table that every other security event shares, and the audit log is read
   as a list of events by a human.

**Why "before the writes" rather than after** is the part that matters most,
and it is what makes a *failed* import recoverable rather than a mystery.
§1a.6 had warned that the import "can still time out part-way, and nothing
records where it stopped". A record written at the end would be missing for
exactly the imports that need it. Written first, it is complete whatever
happens next, and `status` starts at `applying` - so a batch still reading
`applying` is itself the report that an import did not finish.

**Consequence accepted: the ids are minted by the application.** The record has
to name the accounts the import is about to create, so it cannot wait for
`gen_random_uuid()`. Hence `SeededProfileInput` and `createProfiles`. This also
made the common case fast - a first load is almost all inserts, and those are
now chunks of 250 rather than one request per person.

### An undo restores what the import did, not the directory as of a date

**Decided: an account changed since the import is left alone and named.**

The tempting behaviour is "put everything back". It is wrong: if the office has
corrected an account by hand after a bad import, reverting it destroys the
newer, better value - and the office would have no way of knowing which rows
the undo had quietly overwritten. So the undo compares each account with what
the import *gave* it, and skips anything that no longer matches, reporting it.

Same spirit as `deleteUsersAction`, which removes what it can and names back
whoever it could not: **partial, and explicit about it.** Only the eight fields
an import may write are restored, for the same reason - a profile holds more
than that, and the undo has no business touching the rest.

The console's own per-account rule (`userEditError`) is passed in rather than
imported, so the module stays pure and a manager cannot reach a developer's
account through an undo.

### Two bugs the implementation found, both in the same place

Both are about `lower(ldap_uid)` being unique, and both existed before this
round.

**1. A username swap broke the import itself.** `planUserImport` deliberately
allows one paste to move a username from one account to another, and checks it
against the state the import would leave. But the writes were applied one row
at a time, so the account *receiving* the username was written while the
account *giving it up* still held it - a unique violation, part-way through an
import. The old holder now releases it first, the same two passes as
`importLdapUidsAction`, and before the inserts too, because a new account can
be the one taking it.

**2. An undo could leave an account unable to sign in.** Found by running the
SQL recovery script against a throwaway Postgres. Two accounts swap usernames;
somebody then corrects one of them by hand, so the undo must leave that one
alone - which means the *other* one cannot have its old username back, because
the corrected account still holds it. The first implementation released the
username and then failed to write the old one, leaving that account with
**none**: worse than not undoing it. It is now classified as a conflict before
anything is written, and skipped whole. `planUserImportRevert` and the SQL
script's `skip_reason` agree on this deliberately, and
`tests/user-import-undo.test.ts` pins both.

### The recovery path is plain SQL, and that decided the table's shape

**Decided: `added` and `updated` are jsonb arrays on one row, not child
tables.**

A batch is written whole, read whole and never queried across - nobody asks
"which imports touched this person", they ask "undo that import". Child tables
would add two foreign keys, two indexes and a join for no query that exists.

The deciding reason, though, is that an undo has to work **when the application
cannot run**: the wrong project, a portal that will not start, a console that
will not open. `supabase/repairs/2026-10-14-restore-user-import.sql` restores
from one row, with sections 0-2 read-only so the plan can be read before
anything is written. A recovery path that needs a join and a working
application is not a recovery path.

> **Three bugs in that script, all found by running it** rather than by reading
> it, and all worth recording because each would have failed in production on
> live data:
>
> - **psql does not interpolate `:'batch'` inside a dollar-quoted block**, so
>   the guard in section 0 was a syntax error. The id is now carried in a
>   session setting, interpolated once.
> - **`profiles.staff_category` is plain `text`**, not an enum (migration 15).
>   The cast to `public.staff_category` failed, and with it the whole restore -
>   while the later sections went on to mark the batch `reverted`. Hence
>   `\set ON_ERROR_STOP on`, which the first draft did not have.
> - **A temp *view* is re-evaluated by every statement that reads it.** The
>   restore releases usernames first, which made the plan's "still holds what
>   the import gave it" test false for exactly the rows about to be restored -
>   so the second statement matched nothing and the script reported success
>   having changed almost nothing. The plan is now a temp **table**: a snapshot
>   taken before any of it is applied. This is the one that would have been
>   worst, because it failed *quietly*.

### `total_rooms` gets its trigger, in its own migration

Finding 2 of the 13 Oct normalization review, which recorded it and left it:
the column is a stored derived value maintained only by application code, so a
room inserted or deactivated by SQL leaves it stale.

**Decided: a trigger (migration 33), not dropping the column.** Dropping it
would be the stricter normalization and was rejected - `GuestHouse.total_rooms`
is in `lib/types.ts`, both stores hydrate it and two console pages label guest
houses with it. That is a change to the domain type to fix something a trigger
closes completely.

**Its own migration, not folded into 32.** The previous round kept it out of 31
because "a derived-value trigger has nothing to do with closing an
authentication hole", and the same applies here: 32 is required by the code, 33
is optional, and they must be able to roll back separately.

`recountRooms()` stays in both stores. The mock store has no triggers and needs
it; in Supabase mode it now writes the number the trigger already wrote, which
costs one statement and keeps the console working against a database that has
not had 33 applied.

### Twenty indexes, because the measurement said so

**Found while building the undo**, and it is the kind of thing that is invisible
until the operation that needs it exists. Postgres indexes the key being
*referenced*, never the column *referencing* it. 22 foreign keys had no
supporting index, 15 of them pointing at `profiles` - so deleting one profile
scanned 15 child tables in full, and **undoing an import deletes every account
it created, up to 2000.**

**Measured rather than assumed**, in a throwaway Postgres with 200,000
`booking_logs` rows and 2,000 bookings:

| | 300 profiles deleted |
| --- | --- |
| before | 2,580 ms |
| after | 64 ms (3 samples: 63.4 / 64.1 / 63.8) |

The before figure grows linearly with the history; the after figure does not.
Extrapolated to a 2000-row undo it is the difference between a server action
that finishes and one the platform's request timeout cuts off part-way -
which would leave the undo half-applied, the single outcome migration 32
exists to prevent.

**Only the 20 whose parent is actually deleted**, which is why it is 20 and not
22. `invoices.replaces_invoice_id` earns nothing (an issued invoice is a
record and is never deleted; a correction is a new document pointing at the
old one), and `booking_guests (booking_room_id, booking_id)` needs nothing
because `booking_guests_room_idx` is on the composite key's leading column,
which the constraint check can use.

### The provider question, answered the cheap way

The 13 Oct round recorded, twice, that whether the hosted project has the
email/password provider enabled "cannot be read with the service-role key" and
was therefore unverified. True, and beside the point: **GoTrue publishes it.**
`GET /auth/v1/settings` needs only the anon key that already ships in the
browser, writes nothing, and answers in one request.

It is **enabled**, with `disable_signup: false`. So there is a worse path than
the published `password123`: with signup open, an attacker needs no portal
account and no leaked password at all - they sign up with an address they
control and hold an `authenticated` JWT, which until migration 31 is applied
means the whole directory and every uploaded ID document.

Two things follow:

- **Turning the provider off moves to the front of the queue.** It is a
  dashboard toggle, needs no migration, and the portal does not use the
  provider. §1a.1 now has it as step 1.
- **The `anon` role was checked the same way and is not exposed** - 200 and
  zero rows on `profiles`, `bookings`, `booking_guests` and
  `academic_records`. This independently confirms the 13 Oct claim that
  dropping the `authenticated` policies cannot break Realtime, which connects
  as `anon`.

**Deliberately not tested further:** the document download. Confirming it would
mean creating an account on the production project and opening real guests'
identity documents. The policy text and the provider state are enough to act
on, and a security check should not be the thing that reads the data it is
worried about.

### What was deliberately left alone

- **Nothing applied to the hosted project.** 31, 32, 33 and 34 are written,
  tested in a throwaway Postgres and **not** applied; the Auth users are still
  there; the provider is still on. All are production actions on live data.
  §1a.1 has the order, and the order matters.
- **No real user data imported**, and no guess at the Excel file's columns.
  §1a.3a is the list to work once it arrives, and says what is deliberately
  not prepared and why.
- **`lib/users-import.ts` not rebuilt.** It was verified correct last round and
  is correct: the only change this round is where its plan is *applied*.
- **`profiles.department_or_club`, `is_active`, and the 2000-row ceiling** -
  still open, [03-roadmap.md](03-roadmap.md) §2f.

---

# The office's twelfth list - 14 October 2026

Five items. Two of them reverse earlier decisions of ours, and both reversals
are recorded as *Superseded* notes above: the one-month booking window and the
privacy consent tick.

## The number on the contact page is the Guest House Manager's

**Decision.** The label on `GUEST_HOUSE_CONTACT.phone` reads **Guest House
Manager** instead of "Front office", and the label is written **once**, in
`lib/site.ts`, for the three places that print that number: the contact page,
the home page's hero line and the site footer.

**Why one place.** It is one number. The label was written out three times, so
the office's correction would have been applied to the page they happened to
be looking at and left the other two reading "Front office" - exactly the
drift that put the guest house's phone number in `GUEST_HOUSE_CONTACT` in the
first place (9 Oct 2026). The address beside it has been `ghm@iitpkd.ac.in`
since 24 Sep, so the page was already naming the manager in one half of the
card and not the other.

**This is a deliberate exception to "no role names on the public site"**
(26 Sep 2026, above). That rule is about the portal's *internals* - who
forwards whose request - and the unit test that enforces it guards the copy
that states process: `BOOKING_STEPS` and `guidelineSections`. The Guest House
Manager is a post a guest telephones, not a stage in a pipeline, and the
office asked for it by name. **Don't widen it**: Assistant Warden, HOD, IAR
and Faculty Advisor stay off every public page, and the test still fails if any
of them reaches that copy.

## Green means "free", and a date that has gone says nothing

**Decision.** The count of free rooms is drawn in **green** - `--occupy`,
#00703c, the deep green of the desk's own *Mark as Occupied* button - in the
counts panel (`/availability` and the booking form), in its hour strip and
meter, and in the desk chart's date column. And a day that has **already
gone** carries no figure at all: it is greyed, labelled *Past*, and its
`aria-label` says "a past date, not available to book". `isPastDay(day,
today)` in `lib/availability.ts` is the one rule, read by the requester's
panel and the desk's week/month chart.

**Why green at all.** The office asked for it. It is also the only colour the
panel was missing: a full day has been vermilion since 9 Oct, and the figure
beside it was ink - so the two states that matter most to a reader were a
colour and an absence of one. **No new token:** `--occupy` already exists for
the check-in button, and adding a second green is how a palette stops being a
palette. White on it is 6:1; ink-on-white green text is 5.3:1, above AA.

**Why the past days needed a rule rather than a tidy-up.** A week runs Monday
to Sunday and a month is a whole calendar month (`availabilityRange`), so the
range containing today almost always contains days nobody can book - and each
of them printed "10 free", which reads as an offer. The schema has always
refused them (`earliestBookableCheckIn` is midnight this morning); the panel
was contradicting the form.

**Why greyed and not removed.** Three reasons, in order. The **desk** reads
the same chart for history: the bars on a past day are the record of what
happened, and the office browses backwards deliberately. **Clipping the
range** instead would mean the week view sometimes shows four days and
sometimes seven, and a range wholly in the past would show nothing at all.
And the days have to stay in place for the **figures** below them to line up
with the dates above them. The office's own words allowed it: "hiding or
blurring previous dates where appropriate".

**What was deliberately left alone.** The navigation: *Previous week* still
works for everyone, because the desk needs it and a requester who presses it
now sees seven greyed cells, which is a clearer answer than a disabled button.
And the header line on `/availability` ("23 rooms · 2 booked during this month
· 21 free all month") keeps its figures - the office asked about the booking
form's sentence, not this one. If they want that gone too it is the same
removal.

## The privacy consent tick is gone, and so is the consent record

**Decision.** The tick and its paragraph come off the booking form.
`privacy_consent` stays in `bookingPayloadSchema` as **optional**, so a stored
payload still parses, exactly like `pets_policy_acknowledged` beside it. And
`createBooking` writes **neither** `bookings.privacy_notice_version` nor
`privacy_consent_at`.

**Why the record went with the tick.** This is the part worth arguing about.
The two columns mean "the notice the requester agreed to" and "when they
agreed to it"; with nothing on screen to agree to, filling them in would
record something that did not happen - the same rule as
`fund_declaration_at`, which is never invented for a booking that was never
asked, and as the 7 Oct refusal to backfill. A consent trail an auditor would
rely on is the worst thing to fabricate. Null reads as "not asked", which is
true, and bookings made before today keep both values.

**Why it is not simply a loss.** The notice has three other homes and keeps
them all: `/privacy`, versioned, with the retention period read from Settings;
a link in the footer of every public page; the closing paragraph of the
Guidelines; and "Privacy notice · Download my data · Ask for erasure" on the
dashboard. This is the same shape as the pets notice (19 Sep, 11 Oct): the
rule is *told*, not signed for.

> **Superseded the same day, 14 Oct 2026.** None of those homes survived: the
> owner asked for the privacy policy feature to be removed completely, kept so
> it can be reverted. The page, the version and all three links are in
> `archive/privacy-notice/`. See "The privacy notice is withdrawn, not
> deleted" at the end of this file. What this entry decided about the
> **record** still stands, and is the reason there is nothing to restore in
> the database.

**The concern, stated plainly, since the office may not have meant this far.**
Phase 8 built the tick for DPDP, which wants notice given at or before
consent. After this round the portal gives notice everywhere except at the
moment of submission, and holds no consent record for new bookings. That is a
judgement for the institute, not for us, and it is **two edits to reverse**:
the block in `components/booking-form.tsx` and the refinement in
`lib/booking-schema.ts`, plus the one line in `app/actions/bookings.ts` that
records the version. Each of the three names the other two in a comment.
[03-roadmap.md](03-roadmap.md) §2g carries it as an open question for the
institute.

## Bookings open six months ahead, not one

**Decision.** `DEFAULT_RULES.booking.advance_booking_months` is **6**. The
Setting's range (1-24) and the exempt roles are unchanged.

**Why six and not "no limit".** The office asked to allow bookings "more than
30 days in advance", not to remove the window: the original reasoning - a
guest house cannot commit rooms a year out, and an unbounded window fills the
calendar with speculative bookings nobody cancels - is still sound at twelve
months and plainly wrong at one, which refused a parent booking for
convocation and a conference guest invited a term ahead. Six months is a
semester. A window of **zero** remains refused by `bookingRulesSchema`, and
deliberately: every figure the Guidelines page prints has to be a figure, and
`advanceWindowMessage` has to be able to name the last bookable date.

**Why the default rather than a new rule.** It has been a Setting since
Phase 1, so this is a one-line change to what a fresh install starts with, and
the office can take it to 24 months from the console without us. **The cost,
written down because it will bite:** a deployment that has already pressed
Save on the Booking window card keeps its own stored value - a saved row beats
a changed default, the same trap as a Form Builder row. There is no
`revision` upgrade for `rules.booking`, and one would be heavier than the
problem: the fix is to open Settings once. The local mock database has no
`app_settings` row at all, and the hosted project's was never saved from the
console.

## The privacy notice is withdrawn, not deleted

**Decision** (14 Oct 2026, the owner, hours after the consent tick came off:
*"Remove privacy policy feature completely, but keep it saved in the repo as
an archive... keep it saved here somewhere in the project root but do not
deploy it"*). The `/privacy` page and route, `PRIVACY_NOTICE_VERSION` and all
three links to it (the site footer's bottom line, the Guidelines' closing
sentence, the first item of the My Bookings row) are **removed from the
application** and kept in **`archive/privacy-notice/`** at the repo root, with
a `README.md` that is the restore. The now-dead `privacy_consent` field came
off the payload schema with them.

**What was kept live, and why that is the whole scope of this decision.** The
owner was asked which of three layers to take, and chose the narrowest: the
notice itself. So **"Download my data" and "Ask for erasure"** stay, with the
office's answers in Console -> Security, and so does the nightly
**retention job**. The reasoning the owner was given: those are what a person
can *do* about their data rather than a document about it, and
`lib/retention-server.ts` is the control that erases Aadhaar numbers and ID
scans after a stay - removing it would mean keeping identity documents for
ever. `rules.privacy`, `privacy_requests` and both booking columns are
untouched for the same reason.

**No migration, and no column dropped.**
`bookings.privacy_notice_version` and `privacy_consent_at` hold real values
for every booking made before today, and the data export prints them. Nothing
writes either now. That is also why a restore needs no database work at all.

### Why an archive folder rather than git history

Git history already holds it - `8a6ebe5` is the last commit with the whole
feature, and the archive's README says so and gives the `git show` lines. The
folder exists because **"revert it later" and "find it later" are different
problems**. Six months on, nobody will know which commit to look in, that the
removal came in two steps the same day, that the consent half was the office's
decision and the notice half the owner's, or which four files have to change
together for a tick to mean anything. A folder with the files and a numbered
restore answers all of that without archaeology.

**Why not a patch file.** `git apply -R` was the obvious mechanism and was
rejected: the removal landed in the same uncommitted change as four unrelated
items of the office's twelfth list, several of them in the same files, so a
patch of those paths would carry the green availability figures and the
six-month booking window along with the notice. A patch also rots - it stops
applying the first time somebody edits a neighbouring line - whereas copied
files and written-out snippets degrade into something a reader can still
follow.

### The rule that makes "do not deploy it" true

The folder is **outside the application** and nothing imports it, so Turbopack
never compiles it and `next build` never routes it. Three config facts hold it
there, and `archive/README.md` states them because the next person to add an
archived feature has to keep them:

- **`tsconfig.json` excludes `archive`.** `include` is `**/*.ts` / `**/*.tsx`,
  so without it `tsc --noEmit` - and `next build`, which type-checks with the
  same config - would compile an archived component whose imports no longer
  exist and fail. This was not theoretical: the archived page imports
  `PRIVACY_NOTICE_VERSION`, which this round deleted.
- **`eslint.config.mjs` ignores `archive/**`**, exactly as it ignores
  `design_handoff/**` - the prototype that has sat in this repo unbuilt since
  September. Archived code records what was there; holding it to today's lint
  rules would make it rot on purpose.
- **`vitest.config.ts` collects only `tests/**/*.test.ts`** and Playwright only
  `e2e/`, so an archived test never runs.
- **Never `import` from it.** The moment application code does, the archive is
  in the bundle and all three are void. A restore is a **copy back**.

**Verified, not assumed.** The build's route list has no `/privacy`, no build
output contains the notice's text, and an e2e test asserts `/privacy` **404s**
and that no public page links the word - because a restored page nobody can
reach, and a link to a page that 404s, would each pass every other test in the
suite. Then the restore itself was run: steps 1-3 of the archive's README
applied to the working tree, `npm run lint`, `npm run typecheck` and
`npm run build` clean with `/privacy` back as a route, and the tree put back.
**An archive whose restore has never been run is a folder of hope.**

**Cost.** The portal now publishes no privacy notice while holding Aadhaar
numbers, ID scans, parents' names and phone numbers. That is a real exposure
and it is the institute's to decide: [04-production.md](04-production.md)
"DPDP Act, 2023" states it as a question to answer before go-live, and
[03-roadmap.md](03-roadmap.md) §2g carries it. If the institute publishes a
notice of its own that covers the portal, linking to that is a one-line change
in the footer and the archive can be dropped.
