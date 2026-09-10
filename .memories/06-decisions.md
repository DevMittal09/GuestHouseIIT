# Decision log

Each entry: what was decided, why, and what it costs.

## Mock authentication with one swap point

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
`AGENTS.md` and [02-architecture.md](02-architecture.md).

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
correct — see [07-troubleshooting.md](07-troubleshooting.md).

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

## Branding copied from the official dashboard

**Decision.** Take the palette and logo from https://dashboard.iitpkd.ac.in/
verbatim, including white-on-amber buttons.

**Why.** The portal should look like it belongs to the institute.

**Cost.** White on `#f7a600` is low contrast by WCAG. Accepted deliberately for
visual consistency; the fix (dark `--primary-foreground`) is documented in
[03-implementation.md](03-implementation.md).

## Print-Optimized HTML for PDF Reports

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

## Infants are guest rows, not a count (superseded an earlier decision)

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

## Room capacity is expressed as "with an extra bed"

**Decision.** `ROOM_CAPACITY[type]` is `{ standard, withExtraBed }`, and the UI
says "sleeps 2, 3 with an extra bed" rather than "3 max".

**Why.** The third occupant of a double is not a property of the room, it is a
bed somebody has to physically roll in. Naming the field `max` hid that: the
manager saw a capacity number and no indication that anything had to be
arranged. `extraBedsNeeded()` now tells them how many, on the allocation screen.

**Cost.** A rename that touched every capacity call site, done while the feature
was days old rather than after the vocabulary had set.

## Room capacity varies by room type

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
the real work in [09-production-plan.md](09-production-plan.md) Phase 1. The
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

**What we got wrong the first time round.** [09-production-plan.md](09-production-plan.md)
Phase 3 predicted this bug and prescribed "add it to `lib/format.ts` and test
with `TZ=UTC npm run build`". Both halves were insufficient: fixing only
formatting leaves the *parse* wrong, which is the half that corrupts stored
data, and a build renders no user-entered times so it catches nothing. The test
that works is running the domain logic under a non-IST `TZ`.

## Meals are one jsonb column, not three booleans

**Decision.** `bookings.meals` is a single jsonb object
`{breakfast, lunch, dinner}` (migration 6), read only through
`normalizeMeals()`.

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
([09-production-plan.md](09-production-plan.md) Phase 3) from invisible into
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
([09-production-plan.md](09-production-plan.md) Phase 1). Until then the honest
answer is a private window or a second browser profile.

**So: do not rebuild this.** If tab bleed is raised again, the options are
per-tab sessions as part of real auth, or documenting the private-window
workaround — not another client-side guard.
