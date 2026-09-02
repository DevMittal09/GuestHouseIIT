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

## Booking Lifecycle Expansion

**Decision.** Added `OCCUPIED` and `VACATED` to the end of the approval pipeline, and shifted cancellation flow to `CANCELLATION_REQUESTED` → `CANCELLATION_APPROVED` for approved bookings.

**Why.** A booking doesn't end when it's approved; the Guest House Manager needs to track live occupancy and release rooms when guests depart or cancel. The `ROOM_HOLDING_STATUSES` grouping (`APPROVED`, `OCCUPIED`, `CANCELLATION_REQUESTED`) ensures room capacity logic dynamically respects real-world occupancy.
