# Recent changes - the last round, and only the last round

This file is **replaced** every round, not appended to. The round before this
one is written up where every round is: what was asked in
[01-background.md](01-background.md), why it was done that way in
[02-decisions.md](02-decisions.md).

---

## Round of 12 October 2026 (second) - the workflow screen becomes a flow

The owner, on the screen the morning round had just built:

> Its all wrong and not at all what i wanted.

with the original brief repeated, and one clause in it doing all the work:

> The interface should be simple, intuitive, and visual, allowing the manager
> to understand exactly how requests will flow **without needing technical
> knowledge**.

**No migration, no change to the engine, no change to `rules.approval`.** The
stored shape, `routeFor`, `canReview`, the queues, mail, allocation and the
576-combination parity test are all untouched. What changed is the screen.

### What was wrong with it

The console built that morning was the rules engine with a form around it. To
move one approver the office had to:

- read an ordered list of **routes** and know that *the first active route
  that matches wins*, so a narrow route under a broad one never fires and
  nothing on the page says so;
- fill in up to **eight rows of match conditions** ("tick nothing in a row and
  it matches anything");
- choose an **approver kind** from six - `warden` / `hod` / `unit_head` /
  `role` / `unit` / `profile`, a taxonomy that only means anything if you know
  the data model;
- pick which of the **four waiting statuses** the stage occupies, and then
  rename it, because the slot's own name is somebody else's job;
- and read the chain back as a **sentence**, there being no picture anywhere.

Every one of those is a question about the implementation, not about the
institute. The brief asked for the opposite.

### What it is now

**One chain per kind of request, drawn left to right, ending at the desk.**

```
Student  a personal stay
[Student submits] -> + -> [Assistant Warden] -> + -> [Guest House Manager]
```

Eleven kinds, which are the ones the office already names: student, faculty
official, non-teaching staff official, faculty or staff personal, club via its
Faculty Advisor, an institute office direct and when it asks for HOD approval,
the IAR Office, the IAR Student Cell, any dining booking, and the desk's own.

- **Click a step** to open it: *who decides this step* as **one** select in
  plain language ("Their hostel's Assistant Warden", "Dr. Arun Prasad -
  arun.prasad@iitpkd.ac.in", "Head of Computer Science"), an optional name for
  the step, and Earlier / Later / Remove.
- **The `+` between two boxes inserts a step there.** It disappears at four,
  and a line says why.
- **Nothing on the screen mentions** routes, order, conditions, approver kinds
  or waiting statuses.

The ordered route list is still there, shut, under **Advanced: every route in
order**, for the condition a chain cannot express ("every request from Civil
also goes to the Dean"). An active route no card governs - the legacy
club-own route - is **named above it** rather than left to be found.

### The one real decision: a shared route forks

A card has to write back to a route, and a route can govern several kinds. The
defaults put **faculty and non-teaching staff on one official-stay route**, and
both classes of office on one direct route.

So `setCategoryStages` does one of two things:

- the governing route decides **only this kind** - edit it where it is;
- it decides **others too** - this kind gets **a route of its own, inserted
  immediately above** the one it is leaving. Above, because the engine takes
  the first match. Immediately, so no route that used to win for some other
  request stops winning.

The card says so before anything is saved ("Shares a route with Non-teaching
staff. A change here applies to Faculty alone."), and a second edit of the same
kind edits the forked route in place rather than forking again.

This is not a workaround for the list. It is the thing the list could only do
by hand-writing conditions: **giving faculty a different chain from staff**.

### Two details worth keeping

- **The slot a step waits in is chosen for it** (`slotForApprover`): the slot
  whose built-in meaning *is* that approver where one is free, so a warden
  step drives the warden's own queue page; otherwise the first free slot.
- **A step's slot never moves once it exists.** A waiting request is sitting
  in that status. So when the approver is changed to somebody the slot does
  not mean, the step is **named after them** instead
  (`setStageApprover`), which is what the Forward button and the queue page
  then read. A name the office typed is never overwritten.

### Files

New: `lib/approval-categories.ts` (the kinds, the chains, the fork, the step
operations - pure), `components/admin/workflow-flow.tsx` (the screen),
`tests/approval-categories.test.ts` (25 checks).

Changed: `components/admin/workflow-manager.tsx` (the flow view is the page;
the route list moved into Advanced; the intro cut to three lines),
`e2e/approval-workflow.spec.ts` (rewritten against the new screen, plus a
second journey for the fork), `AGENTS.md`.

Unchanged, deliberately: `lib/approval-routes.ts`, `lib/workflow.ts`,
`app/actions/workflow.ts`, `lib/settings-impact.ts` and every call site. The
new screen is a second way to write the same `rules.approval` row, through the
same server action, with the same impact check and the same audit wording.

### How it was checked

`npm run lint`, `npm run typecheck`, **`npm test` (519 checks, 29 files - 25
of them new)**, `NEXT_PUBLIC_SUPABASE_URL= npm run build`, and **`npm run
test:e2e` (40 journeys, all passing)** against a production build on the mock
store.

The rewritten journey is the feature end to end: the manager inserts a step
before the desk on the **Student** chain, hands it to **Dr Arun Prasad - a
professor who heads nothing and so had no approval queue at all** - calls it
"Dean of Students", and saves. A student's next request then shows the warden
a **"Forward to Dean of Students"** button, does **not** appear at the desk
when they press it, appears in Arun's new queue, and reaches the desk only
when he forwards it. The second journey takes the HOD off the **Faculty**
chain and proves **Non-teaching staff** still has one.

Checked by hand as well: the screen at **1280px** and at **320px**, where the
chain wraps onto a second line with no horizontal scroll
(`scrollWidth === clientWidth === 320`).

### A thing to know before touching the e2e

A step box and the `+` that inserts before it **share a word**: the box is
named "Assistant Warden step 1 of 1" and the button beside it "Insert a step
before Assistant Warden". `getByRole("button", { name: /Assistant Warden/ })`
matches both and fails Playwright's strict mode. The spec matches a box on its
caption - `^<name> step \d` - which is why the caption is in every box's
`aria-label` even though it is only *shown* on a chain with more than one
step.

### Left open

In [03-roadmap.md](03-roadmap.md) §2e, unchanged by this round: the office
still cannot name a new waiting status (a migration per status), the desk is
still not a configurable stage, and the four queue pages are still four pages.
New: the **Try it** panel still asks for a booking type, a service and an
office's choice as separate selects, which is the one place on the screen that
still reads like the engine; it could ask for a kind of request instead.
