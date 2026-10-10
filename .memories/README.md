# IIT Palakkad Guest House Portal — project memory (start here)

This folder is the project's memory: everything a new person, or a new AI
chat, needs to pick the work up as if they had been here all along.

**Fifteen files, each with exactly one job.** Reorganised on **10 Oct 2026**
from twenty-five, which had grown overlapping and inconsistent: a round would
be written up in three files and only one of them updated. The rule now is
**one fact, one home** — if two files would both want a fact, the one named in
the file map below owns it and the other links to it.

Two files at the repo root load automatically into every agent session and
point here. **`CLAUDE.md`** carries the *process* - read this folder before
planning, update it before finishing, run `npm run check:memories`.
**`AGENTS.md`** carries the terse list of hard rules about *the code*. This
folder is the reasoning, the configuration and the history.

---

## For a new chat: read in this order

1. **This file** — the project in one screen, the file map, the glossary.
2. **[99-recent-changes.md](99-recent-changes.md)** — what the last round did
   and left open.
3. **The product as configured:**
   [10-roles-and-workflows.md](10-roles-and-workflows.md) (who does what, where
   a request goes, what mail it sends) and
   [11-booking-forms.md](11-booking-forms.md) (what each form asks, what is
   mandatory, what the academic record locks).
4. **[03-roadmap.md](03-roadmap.md)** — what is left — and
   **[04-production.md](04-production.md)** — what a production build needs.
5. Anything else from the file map, when the task touches it.

Before changing code, also read `AGENTS.md`. The Next.js 16 note at its top
matters: the APIs differ from older versions, and the docs are in
`node_modules/next/dist/docs/`.

---

## The project in one screen

**What it is.** A booking and multi-stage approval portal for IIT Palakkad's
two guest houses, **Bageshri** (10 rooms, no kitchen) and **Hamsanandi**
(13 rooms, serves meals), plus the guest house's public website. Requesters —
students, faculty and staff, institute offices, the two IAR offices, and
(through their Faculty Advisor) clubs and councils — submit bookings; each goes
through its own approval chain and ends with the **Guest House Manager**, who
allocates real rooms on a visual grid. A **caretaker** runs reception. A
**developer** console reconfigures almost everything without code.

**Who.** Built by students for the institute's Administration Section and the
guest house office, who send numbered lists of corrections worked through one
by one ([01-background.md](01-background.md)). Repository
`github.com/DevMittal09/GuestHouseIIT`, branch `main`; local git identity
`Rizzwan285`.

**Stack.** Next.js 16 (App Router, Turbopack) · React 19 · TypeScript ·
Tailwind v4 · shadcn/ui · zod 4 · react-hook-form · Supabase (optional — a
JSON mock store otherwise) · nodemailer · jsPDF · ldapts · Vitest · Playwright.
**Node 20** via nvm; the machine default is 18.

**Status, 10 Oct 2026.** Feature-complete for every workflow specified; taken
through a ten-phase production-readiness programme and ten rounds of the
office's corrections. **Not deployed for real use** — everything that first
deployment needs is in [04-production.md](04-production.md), and the gates are
[03-roadmap.md](03-roadmap.md) §1.

**Numbers.** 30 migrations · 7 one-off repairs · 12 roles (10 active) ·
13 booking statuses · 9 debitable heads, mapped across **34 office mailboxes** ·
18 demo personas · 6 demo bookings · 23 real rooms · 451 unit tests ·
36 end-to-end journeys · 14 console sections.

---

## File map — and who owns what

**Numbers group the files; they are not a reading order.** `0x` is history and
plans, `1x` is the product as configured, `2x` is engineering, `99` is now.

| File | Owns — and nothing else does |
| --- | --- |
| [README.md](README.md) | This index: the project in one screen, the file map, the glossary, the maintenance contract, the headline numbers |
| [01-background.md](01-background.md) | The problem, the people, the build timeline, and **every requirement list the institute sent, with the status of each item** |
| [02-decisions.md](02-decisions.md) | **Why** anything is the way it is: every decision, what it cost, what was rejected, and what later reversed it. Append-only, with dated *Superseded* notes |
| [03-roadmap.md](03-roadmap.md) | **What is open**: the gates before real bookings, loose ends per round, thin tests, accessibility, features likely to be asked for next |
| [04-production.md](04-production.md) | **The production build**: the checklist of what it needs, the office's debitable-heads spreadsheet verbatim, how to deploy and operate it, and what must still be settled with the institute |
| [05-credentials-and-security.md](05-credentials-and-security.md) | **Every login** (dummy LDAP accounts, console password, 2FA), how sign-in works and how to switch to the real directory, **every secret by name and place — never a value**, every environment variable, and what protects the portal |
| [10-roles-and-workflows.md](10-roles-and-workflows.md) | **Every role** — sign-in, landing page, menu, what they can and cannot do, who opens which console section — **every approval pipeline**, the statuses, the desk's lifecycle, and **every automatic mail** with its To and CC |
| [11-booking-forms.md](11-booking-forms.md) | **Every booking form**: fields per role (required / optional / hidden), booking and service types, debitable heads, every rule checked on submission, and the **academic record** that fills and locks part of it |
| [12-settings-and-defaults.md](12-settings-and-defaults.md) | Every configurable value, its default, who may change it; the values fixed in code; what the environment switches |
| [13-billing-and-dining.md](13-billing-and-dining.md) | Tariffs, invoices, GST per section, payments, additional charges, dining |
| [14-public-site-and-ui.md](14-public-site-and-ui.md) | The public website, the design tokens and primitives, the copy rules, sign-in pages, photographs, the map |
| [20-architecture.md](20-architecture.md) | **How it is put together and why** (two stores, one auth seam, config-driven forms, institute time, holds in the database) and **where the code for each feature lives** |
| [21-database.md](21-database.md) | Tables, enums, RLS, storage, **all 30 migrations**, the one-off repairs, resetting data |
| [22-running-and-testing.md](22-running-and-testing.md) | Running locally, mock vs hosted database, the test suites, every way of verifying a change — and **every error already hit, with its cause and fix** |
| [99-recent-changes.md](99-recent-changes.md) | **Only the most recent round** — replaced, never appended |

### Boundaries that are easy to get wrong

- **Open work goes in [03-roadmap.md](03-roadmap.md); production prerequisites
  go in [04-production.md](04-production.md).** The roadmap names a gate and
  links; it does not restate the checklist.
- **[02-decisions.md](02-decisions.md) holds the reasoning;
  [01-background.md](01-background.md) holds the ask and its status.** Both
  cover the same rounds, from different sides. Neither narrates the round a
  third time — that is what [99-recent-changes.md](99-recent-changes.md) is
  for, and it is replaced each round.
- **Secrets and environment variables live once**, in
  [05-credentials-and-security.md](05-credentials-and-security.md).
  [04-production.md](04-production.md) says only *which* of them production
  must set.
- **"Deliberately not built" stays with its feature** (its file, or
  [02-decisions.md](02-decisions.md)); **"still to do" goes to the roadmap.**

---

## Keeping this folder true

This is the part that failed before. A round would touch the forms, the mail
and the database, and only `99-recent-changes.md` and one product file would be
updated. **Work the table, not your memory.**

### After every round, always

0. Re-read the five steps here. `CLAUDE.md` at the repo root says to, and
   says why: working from memory is what let the folder drift.
1. **Replace** [99-recent-changes.md](99-recent-changes.md) with the new round.
   It is never appended to.
2. **Append** the reasoning to [02-decisions.md](02-decisions.md), and add a
   dated *Superseded* note under any older entry this round reverses.
3. **Add the round to [01-background.md](01-background.md)** — a section with
   what was asked and the status of each item, plus a row in *The build at a
   glance*.
4. **Update [03-roadmap.md](03-roadmap.md)**: strike what is done, add what the
   round opened.
5. **Run `npm run check:memories`** — it fails if a file is missing, a stray
   file appears, or a link in this folder points at nothing.

### And then, whatever the round touched

| If the round changed… | Update these as well |
| --- | --- |
| What a role may do, or an approval route | [10-roles-and-workflows.md](10-roles-and-workflows.md), `AGENTS.md` |
| A booking-form field, or a submission rule | [11-booking-forms.md](11-booking-forms.md), [12-settings-and-defaults.md](12-settings-and-defaults.md) if it is configurable, `AGENTS.md` |
| An automatic mail, its recipients or its thread | [10-roles-and-workflows.md](10-roles-and-workflows.md) Part 3 |
| A tariff, an invoice or a payment rule | [13-billing-and-dining.md](13-billing-and-dining.md) |
| A Setting, a default, or a floor under a Setting | [12-settings-and-defaults.md](12-settings-and-defaults.md), [04-production.md](04-production.md) §3 if the office must fill it in |
| A migration | [21-database.md](21-database.md), [04-production.md](04-production.md) §5, **and `scripts/check-migrations.mjs`'s `MARKERS` table** |
| A new persona, password or secret | [05-credentials-and-security.md](05-credentials-and-security.md) **and `lib/ldap/mock-directory.ts`** |
| An academic-record field or dummy record | [11-booking-forms.md](11-booking-forms.md) Part 2 **and `lib/academic/mock-source.ts`** |
| Anything on the public site, or a design token | [14-public-site-and-ui.md](14-public-site-and-ui.md) |
| Where a feature's code lives, or a new module | [20-architecture.md](20-architecture.md) Part 2 |
| A new error you had to diagnose | [22-running-and-testing.md](22-running-and-testing.md) Part 2 |
| A file the office sent (a spreadsheet, a CSV) | Keep it **verbatim** in the file that uses it, and say where the transcription in code is |
| How a round should be *worked* (not what the code does) | `CLAUDE.md` at the repo root, and this contract |

**Never put a real secret in this folder** — it is pushed to GitHub.

---

## Where to look for a rule

By topic, not by module. The detailed rule → code table is in
[10-roles-and-workflows.md](10-roles-and-workflows.md) ("Where each rule
actually lives").

| Question | File |
| --- | --- |
| Who approves this, and in what order? | [10-roles-and-workflows.md](10-roles-and-workflows.md) |
| Why is a field mandatory for one role and not another? | [11-booking-forms.md](11-booking-forms.md) |
| Which budget may this requester charge? | [11-booking-forms.md](11-booking-forms.md), and [04-production.md](04-production.md) §2 for the per-office table |
| What is this limit, and who can change it? | [12-settings-and-defaults.md](12-settings-and-defaults.md) |
| How is a room kept from being double-booked? | [20-architecture.md](20-architecture.md), [21-database.md](21-database.md) |
| Which module implements this rule? | [20-architecture.md](20-architecture.md) Part 2 — the feature → file map, which absorbed the rule → module table this index used to carry |
| Why was it done this way? | [02-decisions.md](02-decisions.md) |
| It is broken and the error looks familiar | [22-running-and-testing.md](22-running-and-testing.md) Part 2 |

---

## The product in brief

| Role | Does |
| --- | --- |
| Student | Books family (personal), **Bageshri only and no meals**, parents taken from their academic record → **Assistant Warden** of their hostel → manager |
| Faculty / staff (`employee`) | Official → **HOD** → manager; personal → manager; meals only; **as Faculty Advisor** of a council or club when named in the console → straight to the manager |
| Official (whitelisted office) | Direct → manager, or **Requires HOD approval**; exempt from the booking window and the stay cap |
| Club / fest / council account | **Cannot book** — its Faculty Advisor books for it; it sees the bookings and gets the mail |
| IAR Student Cell | Books **for an alumnus** only → **IAR Office** → manager |
| IAR Office | Books (official / alumni) **and** approves the Student Cell |
| Assistant Warden, HOD, council secretary | Approve by queue; an HOD or secretary is **an appointment in the console, not a role**. The warden sees each student's academic record and a check of the parents on the request against it |
| **Guest House Manager** | Final approval by **allocating rooms**; the whole desk, including an earlier or later check-in; books for guests; invoices with additional charges; reinstates a **Missed** request; 10 console sections |
| Guest House Caretaker | Reception: check-in and check-out, moving a stay's dates, invoices |
| Developer | The whole console (14 sections), behind a password and TOTP |

Every booking: a **debitable head** is mandatory **except on a personal
booking, which is never asked** (the server records Personal Funds) — nine
heads, mapped per requester by the office's list of 8 Oct 2026 and, for an
**office**, narrowed again to that office's own row on the spreadsheet of
9 Oct 2026; **any head but Personal Funds asks the requester to declare that
the funds are approved and available**. **Copy to** is optional (≤ 25, CC on
every mail to the requester); **privacy consent** is mandatory; check-in within
**1 month**, at most **14 nights**; a room card holds **4 people, at most 3
needing a bed, at most 3 infants** (under 5); meals only at a guest house that
serves them and **never for a student or an alumni booking**, booked **before
the previous meal finishes being served**, with **each person's own veg /
non-veg preference** and at most **30 people at one sitting** counting who is
already booked. A **turnaround buffer** of 4 h separates stays. A student's
**father and mother come from their academic record and are locked**, and need
no ID. The form shows **the rates** and **how many rooms are free** — the
room-by-room chart is the desk's. **The form does not state the rules it
enforces** (9 Oct 2026): those belong on the Guidelines page, in the error when
it fires, or in the control itself. Invoices charge **GST 18% on rooms, 5% on
food**, each on its own subtotal, lettered up to **Grand Total (A+B+C+D)**,
settled by **UPI or account transfer**; a **personal stay is paid before the
guest leaves**. A request nobody decides before its check-in is marked
**Missed** overnight and the requester told. All times are **Asia/Kolkata** and
every date reads **DD/MM/YYYY**.

---

## The traps that cost the most time

1. **Two backends, one interface** — every new data operation goes into
   `DataStore` **and** both stores.
2. **A saved Form Builder row beats a changed default** — press Reset to spec
   defaults.
3. **`.env.local` points at the hosted database** — use
   `NEXT_PUBLIC_SUPABASE_URL= npm run dev` for anything that writes;
   `NEXT_PUBLIC_*` is baked in at build time.
4. **`npm run build` kills a running `next dev`.**
5. **Never parse a naked datetime string or format without a zone** — use
   `lib/tz.ts`.
6. **The booking schema must accept its own output** (the form sends
   `parsed.data`, the server re-parses it).
7. **Migrations are applied by hand**; a missing one fails writes quietly.
   Ask the database with `npm run check:migrations` — never write the answer
   down.
8. **A form rendered from search params needs a `key`**, or switching keeps the
   old state.
9. `pkill -f "next start"` kills its own shell — use `"[n]ext start"`.

The full list is in `AGENTS.md` and
[22-running-and-testing.md](22-running-and-testing.md) Part 2.

---

## Working with the owner

- **Build on `main`.** The `ui` branch holds only a redesign experiment,
  superseded by the 26 Sep redesign on `main`, and has diverged.
- **Verify cheaply.** Lint, typecheck, `npm test`, a build, the Playwright
  suite, `curl`, a throwaway Postgres for migrations — **not** ad-hoc
  headless-Chrome sessions, which the owner asked to avoid because they eat
  credits.
- **Migrations are tested in a throwaway `postgres:16-alpine`**, never against
  the hosted project.
- The owner relays the office's numbered correction lists; each item is done,
  verified, and recorded as the maintenance contract above says.
- The owner commits; changes are left in the working tree unless asked.

---

## Glossary

| Term | Meaning |
| --- | --- |
| **Booking type** | *Why* the stay is booked: official, personal, or on behalf of an alumnus (`bookings.booking_type`). A property of the request, not the person |
| **Service type** | *What* is booked: room, room + meals, meals only |
| **Debitable head** | Which budget pays. Nine since the office's list of 8 Oct 2026: Institute Grant, Professional Development Fund, Project Grant, Department Budget, Special Budget (`special_budget`), Personal Funds, Alumni Fund, Student Fund, Hostel Funds. Any but Personal Funds asks the requester to declare the funds are approved and available |
| **Unit** | A department, council, club or office in Departments & Clubs; has a head, an acting head, a parent, and (councils and clubs) a Faculty Advisor and a secretary's mailbox |
| **HOD** | Whoever heads the unit a requester's HOD approval comes from — found when someone looks, never stored on the booking |
| **Faculty Advisor** | The professor named on a council or club (`units.faculty_advisor_id`); books for it. Not a role — the `faculty_advisor` role is a legacy account type |
| **Council secretary** | The student heading a council; approved club requests at the old club stage. Their **mailbox** (`sec_arts@…`) is copied on the advisor's bookings |
| **Copy to (booking)** | Addresses typed on New Booking, CC on every mail to the requester |
| **Copy to (card)** | The approval chain shown on the Requester details card, CC on staff mail. A different list |
| **Academic record** | What the institute holds about a person. Since 7 Oct 2026 the office keeps these itself (Console → Academic records, migration 28); a student's father and mother on the booking form come from theirs |
| **Hold** | A `room_holds` row: a booking holds a room exactly while one exists. The database refuses overlapping holds |
| **Guard / turnaround** | The hold range the constraint compares — the stay plus the turnaround buffer (4 h); an accepted changeover may overlap ≤ 2 h |
| **The desk** | The manager and caretaker together |
| **Mock store / mock auth** | The JSON database (`.local-db.json`) used when Supabase is not configured; the one-click persona picker used when Google is not configured |
| **Lapsed** | A request whose check-in passed while it waited (a meal booking: its last day of meals). It cannot be forwarded |
| **Missed** | The status a lapsed request is given overnight (migration 29): the requester is told, it leaves every queue, and only the manager can **reinstate** it — back to the stage it was waiting at |
| **Whitelist** | The official email whitelist — accounts allowed to book as the `official` role |
