# Recent changes - the last round, and only the last round

This file is **replaced** every round, not appended to. The round before this
one is written up where every round is: what was asked in
[01-background.md](01-background.md), why it was done that way in
[02-decisions.md](02-decisions.md).

---

## Round of 12 October 2026 - the approval workflow becomes the manager's

The owner:

> We have users like student, faculty, offices and faculty advisors, wardens
> and all right, I want to make a feature such that the guest house manager
> can change, insert and delete connections, basically who forwards whose
> request, who approves whose and all. Like the entire approval workflow
> should be in the control of the guest house manager such that they can
> change and update it, like make the feature robust.

**No migration.** The routes are a jsonb row in `app_settings`
(`rules.approval`), which both stores already read and write through
`getJsonSetting` / `setJsonSetting`.

### What it is

`routeFor` was a `switch` in `lib/workflow.ts`. Every case in it was the
institute's instruction at some point, and every case has changed at least
once - which meant a deploy. It is now **an ordered list of routes the
manager edits** at Console -> **Approval Workflow** (`/admin/workflow`,
manager and developer).

A request takes the **first active route whose conditions match it**. A route
holds the stages it passes through before the desk, each with **who decides
it** and, optionally, **what it is called**.

| Part | Where |
| --- | --- |
| The model, the defaults, matching, the approvers, validation | `lib/approval-routes.ts` |
| Reading them on the server, the review context, the queue list | `lib/approval-routes-server.ts` |
| Applying them - `routeFor`, `canReview`, `asksOfficeApproval` | `lib/workflow.ts` |
| The console section | `app/actions/workflow.ts`, `components/admin/workflow-manager.tsx`, `app/(portal)/admin/workflow/page.tsx` |
| Refusing a change that would strand a request | `approvalRouteBlockers` in `lib/settings-impact.ts` |

### The five decisions inside it

1. **The defaults are the old `switch`, case for case.**
   `DEFAULT_APPROVAL_RULES` has ten routes, in the order the `switch` tested,
   and `tests/approval-routes.test.ts` compares `routeFor` against a
   hand-written copy of the old `switch` over **576** combinations of role,
   service, booking type, office choice, HOD and advisor. An install where
   nobody opens the new section behaves exactly as it did.
2. **Four stages, not unlimited.** `booking_status` is a Postgres enum, and
   migration 29 is the standing lesson that a new value cannot even be *used*
   in the transaction that adds it. So a route is built from the four
   intermediate slots that exist (`PENDING_WARDEN`, `PENDING_FA`,
   `PENDING_HOD`, `PENDING_IAR`), each at most once per route, and a stage
   carries a `label` for where the slot's own name is wrong for its new job.
   The deepest chain the institute has ever asked for is two.
3. **Six kinds of approver.** `warden`, `hod` and `unit_head` are relative to
   the requester, so they still follow a change of appointment with nobody
   editing a route; `role`, `unit` and `profile` name somebody outright,
   which is what "every request from Civil also goes to the Dean of Students"
   needs and what the old code could not express at all.
4. **A reconfiguration cannot strand a waiting request.** Three defences:
   `canReview` falls back to the slot's built-in meaning for a request whose
   route no longer describes it; a stage nobody can decide is **skipped** at
   submission and the log names it; and a save is **refused** when a request
   already waiting would be left with nobody to decide it, or a stage points
   at a unit with no head, a deleted account or a role nobody holds.
5. **A queue is "a route points at you"**, not "you hold a reviewer role".
   `stagesDecidedBy` builds the navigation and guards the four queue pages,
   so a professor who heads nothing gets a queue the moment a route names
   them - and loses it the moment it does not. `warden` and `iar_cell` keep
   their link whatever the routes say, because their landing page *is* that
   queue and turning them away would be a redirect loop.

### What changed in the code that was already there

- **`/warden` and `/iar` filter through `canReviewBooking`** instead of
  listing a status outright. `/warden` used to be a store query scoped by
  `hostelName`, which would silently drop anyone the office routed through
  that slot who has no hostel.
- **The Forward button names the next stage of the request's own route**
  (`forwardTargets`). It said "Forward to GH Manager" on every row, which was
  already not true for a club request with an HOD after it.
- **`asksOfficeApproval` is derived, not asserted**: the office is asked
  Direct vs HOD only where the two answers produce different routes. The
  11 Oct rule ("an office with no HOD is not asked") falls out of that, and
  so does taking the HOD stage off an office's route entirely.
- **`saveRuleGroup` refuses the `approval` group** and names the right
  section. Two doors to one `app_settings` row means one of them skipping the
  impact check and the audit wording.
- **`describeRouteChanges`**, not `describeRuleChanges`, for the confirmation
  and the audit log. The JSON diff of inserting one stage is a dozen lines of
  `rules.1.stages.1.approver.kind`, and it made the dialog taller than the
  screen. `ConfirmDialog`'s consequence list now scrolls as well, which every
  long list benefits from.
- **`routeFor` throws for a role that cannot book** off an explicit
  `BOOKABLE_ROLES` list now that there is no `default:` branch to throw from.

### Files

New: `lib/approval-routes.ts`, `lib/approval-routes-server.ts`,
`app/actions/workflow.ts`, `components/admin/workflow-manager.tsx`,
`app/(portal)/admin/workflow/page.tsx`, `tests/approval-routes.test.ts`,
`e2e/approval-workflow.spec.ts`.

Changed: `lib/workflow.ts`, `lib/settings.ts`, `lib/settings-impact.ts`,
`lib/access.ts`, `lib/booking-context-server.ts`, `lib/booking-schema.ts`,
`lib/mail/recipients.ts`, `lib/mail/digest.ts`, `lib/academic/copy-to.ts`,
`app/actions/bookings.ts`, `app/actions/settings.ts`,
`app/api/documents/[...path]/route.ts`, `app/(portal)/layout.tsx`,
`app/(portal)/{warden,iar,hod,approvals}/page.tsx`,
`components/booking-form.tsx`, `components/review-queue.tsx`,
`components/ui/confirm-dialog.tsx`, `e2e/helpers.ts` and the four console
specs, `AGENTS.md`.

### How it was checked

`npm run lint`, `npm run typecheck`, **`npm test` (494 checks, 28 files -
32 of them new)**, `NEXT_PUBLIC_SUPABASE_URL= npm run build`, and
**`npm run test:e2e` (39 journeys, all passing)** against a production build
on the mock store.

The new journey is the whole feature in one pass: the manager inserts a stage
after the Assistant Warden, decided by **Dr Arun Prasad - a professor who
heads nothing and so had no approval queue at all** - names it "Dean of
Students", and saves. A student's next request then shows the warden a
**"Forward to Dean of Students"** button, does **not** appear at the desk when
they press it, appears in Arun's new **HOD Queue** link, and reaches the desk
only when he forwards it. Then the routes are restored.

### An error worth remembering

The suite hit **"Too many attempts - try again in 831s"** on the console
password. Unlocking is throttled 6 per 15 minutes
(`RATE_LIMITS.consoleUnlock`, a row in the database), `signIn()` clears every
cookie, and the httpOnly unlock cookie was therefore retyped on every persona
switch - seven console openings in one run. `unlockConsole()` in
`e2e/helpers.ts` now caches that cookie for the run, exactly as `signIn`
caches sessions, and the four specs that open the console share it.

### Left open

In [03-roadmap.md](03-roadmap.md) §2e: `PENDING_GH_MANAGER` is deliberately
not configurable, so a chain cannot end anywhere but the desk; the four queue
pages keep their own extras rather than being one generated page; and nothing
yet lets the office *name* a new waiting status, which would need a migration
per status.
