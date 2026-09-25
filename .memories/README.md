# IIT Palakkad Guest House Portal — project memory (start here)

This folder is the project's memory: everything a new person — or a new AI
chat — needs to pick the work up as if they had been here all along. It was
**reorganised and audited line by line against the code on 24 Sep 2026**;
every statement about the product in files 10–17 was checked then.

`AGENTS.md` (repo root, loaded automatically into every agent session) is the
terse list of hard rules. This folder is the reasoning, the configuration and
the history.

---

## For a new chat: read in this order

1. **This file** — the project in one screen, the file map, the glossary.
2. **[99-recent-changes.md](99-recent-changes.md)** — what the last session did
   and left open.
3. **The product as configured:**
   [10-roles-and-features.md](10-roles-and-features.md) (who can do what),
   [11-booking-forms.md](11-booking-forms.md) (what each form asks, what is
   mandatory), [12-workflows.md](12-workflows.md) (where requests go).
4. **[04-roadmap.md](04-roadmap.md)** — what is left.
5. Anything else from the file map below, when the task touches it.

Before changing code, also read `AGENTS.md` (the Next.js 16 note at its top
matters: APIs differ from older versions; the docs are in
`node_modules/next/dist/docs/`).

---

## The project in one screen

**What it is.** A booking and multi-stage approval portal for IIT Palakkad's
two guest houses, **Bageshri** (10 rooms, no kitchen) and **Hamsanandi** (13
rooms, serves meals), plus the guest house's public website. Requesters —
students, faculty and staff, institute offices, the IAR offices, and (through
their Faculty Advisor) clubs and councils — submit bookings; each goes
through its own approval chain (Assistant Warden, HOD, IAR Office) and ends
with the **Guest House Manager**, who allocates real rooms on a visual grid. A
**caretaker** runs reception (check-in/out, invoices). A **developer** console
reconfigures almost everything without code.

**Who.** Built by students for the institute's Administration Section and the
guest house office, who send numbered lists of corrections that are worked
through one by one ([01-background.md](01-background.md)). Repository
`github.com/DevMittal09/GuestHouseIIT` (branch `main`); local git identity
`Rizzwan285`.

**Stack.** Next.js 16 (App Router, Turbopack) · React 19 · TypeScript ·
Tailwind v4 · shadcn/ui · zod 4 · react-hook-form · Supabase (optional — a
JSON mock store otherwise) · nodemailer · jsPDF · ldapts · Vitest ·
Playwright. **Node 20** via nvm (the machine default is 18).

**Status, 24 Sep 2026.** Feature-complete for every workflow specified; taken
through a ten-phase production-readiness programme (Settings, mail
addressing, turnaround buffer, HOD approval and debitable heads, invoices,
dining, operational states, security, performance and tests, documentation)
and four rounds of the office's corrections. **Not deployed for real use.**
Runs locally on the mock store, and against one hosted Supabase project with
demo data. Gates before real bookings: connect the institute LDAP, close Mock
Authentication (configure Google or `MOCK_LOGIN=false`), production secrets,
the office's Settings — [04-roadmap.md](04-roadmap.md) §1.

**Numbers.** 25 migrations · 12 roles (10 active) · 18 demo personas · 6 demo
bookings · 263 unit tests · 19 end-to-end journeys · 13 console sections.

---

## File map

**Context and history**

| File | Holds |
| --- | --- |
| [01-background.md](01-background.md) | The problem, the people, and **every requirement list** the institute sent, with the status of each item |
| [02-timeline.md](02-timeline.md) | **The whole build, session by session**, 19 Aug – 24 Sep 2026 |
| [03-decisions.md](03-decisions.md) | The decision log — what was decided, why, what was rejected; reversed decisions carry a dated *Superseded* note |
| [04-roadmap.md](04-roadmap.md) | **What is left**: deployment gates, loose ends, audit findings, asks of other people, next features |
| [05-production-plan.md](05-production-plan.md) | The 2 Sep production plan — history now, mostly executed; kept for its reasoning |
| [Guest House Meeting Notes.md](Guest%20House%20Meeting%20Notes.md) | The office's own notes from the 15 Sep meeting, verbatim |

**The product, as configured**

| File | Holds |
| --- | --- |
| [10-roles-and-features.md](10-roles-and-features.md) | **Every role**: sign-in, landing page, menu, what they can and cannot do; who opens which console section |
| [11-booking-forms.md](11-booking-forms.md) | **Every booking form**: fields per role (required / optional / hidden), booking and service types, debitable heads, every rule checked on submission |
| [12-workflows.md](12-workflows.md) | Every approval pipeline drawn out, the statuses, the desk's lifecycle, what runs automatically |
| [13-settings-and-defaults.md](13-settings-and-defaults.md) | Every configurable value, its default, who changes it; the values fixed in code |
| [14-notifications.md](14-notifications.md) | Every automatic mail — To, CC, threads, digests, the cron |
| [15-billing-and-invoices.md](15-billing-and-invoices.md) | Tariffs, invoices, payments, dining, who may do what |
| [16-public-site-and-ui.md](16-public-site-and-ui.md) | The public website, design tokens, sign-in pages, photos, map |
| [17-academic-records.md](17-academic-records.md) | The Requester details card, its dummy records, and how to connect the real academic database |

**Engineering**

| File | Holds |
| --- | --- |
| [20-architecture.md](20-architecture.md) | How it is put together and why: two stores, one auth seam, config-driven forms, institute time, holds in the database |
| [21-implementation.md](21-implementation.md) | Feature → file map |
| [22-database.md](22-database.md) | Tables, enums, RLS, storage, **all 25 migrations**, the one-off repairs |
| [23-running-and-testing.md](23-running-and-testing.md) | Running locally, the mock vs hosted database, the test suites, every way of verifying a change |
| [24-deployment-runbook.md](24-deployment-runbook.md) | Deploying, environment variables, the office's Settings, rotation, backups, incidents |
| [25-troubleshooting.md](25-troubleshooting.md) | Every error already hit, with cause and fix |
| [26-security.md](26-security.md) | What protects the portal, where each control lives, what is not done yet |

**Credentials and access**

| File | Holds |
| --- | --- |
| [30-credentials-and-access.md](30-credentials-and-access.md) | **Every demo login** (LDAP usernames and passwords, profile ids), the console password, 2FA, and **every real secret by name and location** (never the value) |
| [31-ldap-sign-in.md](31-ldap-sign-in.md) | How LDAP sign-in works and how to switch to the institute's real directory |

**Now**

| File | Holds |
| --- | --- |
| [99-recent-changes.md](99-recent-changes.md) | **Only the most recent round** — replaced, not appended, each time |

---

## The product in brief

| Role | Does |
| --- | --- |
| Student | Books family (personal), Bageshri only → **Assistant Warden** of their hostel → manager |
| Faculty / staff (`employee`) | Official → **HOD** → manager; personal → manager; meals only; **as Faculty Advisor** of a council or club when named in the console → straight to the manager |
| Official (whitelisted office) | Direct → manager, or **Requires HOD approval**; exempt from the booking window and stay cap |
| Club / fest / council account | **Cannot book** — its Faculty Advisor books for it; it sees the bookings and gets the mail |
| IAR Student Cell | Books **for an alumnus** only → **IAR Office** → manager |
| IAR Office | Books (official / alumni) **and** approves the Student Cell |
| Assistant Warden, HOD, council secretary | Approve by queue; an HOD or secretary is **an appointment in the console, not a role** |
| **Guest House Manager** | Final approval by **allocating rooms**; the whole desk; books for guests; invoices; 9 console sections |
| Guest House Caretaker | Reception: check-in/out, extend, invoices |
| Developer | The whole console (13 sections), behind a password and TOTP |

Every booking: a **debitable head** is mandatory; **Copy to** is optional
(≤ 25, CC on every mail to the requester); **privacy consent** is mandatory;
check-in within **1 month**, at most **14 nights**; a room card holds **4
people, at most 3 needing a bed, at most 3 infants** (under 5); meals only at a
guest house that serves them, booked **before the previous meal finishes being
served**. A **turnaround buffer** of 4 h separates stays. All times are
**Asia/Kolkata**. Details: files 10–13.

## Where the rules live in code

| Rule | Module |
| --- | --- |
| Routes, approval stages, who reviews what, history scope | `lib/workflow.ts` (`routeFor`, `canReview`, `canReviewBooking`, `historyScope`) |
| Heads of units, HODs, **Faculty Advisors**, secretaries' mailboxes | `lib/units.ts`, `lib/club-booking.ts` |
| Console sections, desk powers, invoice powers | `lib/access.ts` |
| Booking types, service types | `lib/booking-types.ts` |
| Form fields per role | `lib/form-config.ts` (+ saved rows) |
| Everything a submission is checked against | `lib/booking-schema.ts` (client and server) + `createBooking` |
| Debitable heads | `lib/debit-heads.ts` |
| Settings and their defaults | `lib/settings.ts` |
| Stay cap, alumni guest house, contact line | `lib/policy.ts` |
| Capacity and infants | `lib/occupancy.ts` |
| Meals, serving windows, notice period | `lib/meals.ts` |
| Invoices and tariffs | `lib/invoice.ts`, `lib/tariffs.ts` |
| Mail | `lib/mail/` |
| Institute time | `lib/tz.ts` |
| Data access | `lib/store/` (`types.ts` interface; `mock.ts`, `supabase.ts`) |

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
8. **A form rendered from search params needs a `key`**, or switching keeps
   the old state (24 Sep).
9. `pkill -f "next start"` kills its own shell — use `"[n]ext start"`.

The full list is in `AGENTS.md` and [25-troubleshooting.md](25-troubleshooting.md).

## Working with the owner

- **Build on `main`.** The `ui` branch holds only a redesign experiment and has
  diverged.
- **Verify cheaply.** Lint, typecheck, `npm test`, a build, the Playwright
  suite, `curl`, a throwaway Postgres for migrations — **not** ad-hoc
  headless-Chrome sessions, which the owner asked to avoid because they eat
  credits.
- **Migrations are tested in a throwaway `postgres:16-alpine`** (Docker is on
  this machine), never against the hosted project.
- The owner relays the office's numbered correction lists; each item is done,
  verified, recorded in [01-background.md](01-background.md), reasoned in
  [03-decisions.md](03-decisions.md) and summarised in
  [99-recent-changes.md](99-recent-changes.md).
- The owner commits; changes are left in the working tree unless asked.
- Never put a real secret in this folder — it is pushed to GitHub.

## Keeping this folder true

After every working round:

1. **Replace** [99-recent-changes.md](99-recent-changes.md) with the new round.
2. **Append** the reasoning to [03-decisions.md](03-decisions.md); add a
   *Superseded* note under any older entry the round reverses.
3. Add the round to [01-background.md](01-background.md) (what was asked, its
   status) and a row to [02-timeline.md](02-timeline.md).
4. Update the product files (10–15) wherever behaviour changed — they must stay
   true to the code.
5. New migration → [22-database.md](22-database.md); new persona or password →
   [30-credentials-and-access.md](30-credentials-and-access.md) **and**
   `lib/ldap/mock-directory.ts`; new academic record →
   [17-academic-records.md](17-academic-records.md) **and**
   `lib/academic/mock-source.ts`.
6. Update [04-roadmap.md](04-roadmap.md) and `AGENTS.md`.

---

## Glossary

| Term | Meaning |
| --- | --- |
| **Booking type** | *Why* the stay is booked: official, personal, or on behalf of an alumnus (`bookings.booking_type`). A property of the request, not the person |
| **Service type** | *What* is booked: room, room + meals, meals only |
| **Debitable head** | Which budget pays: Department, Institute Grant, PDF (Professional Development Fund), Personal, Project, Special Funds (`special_budget`) |
| **Unit** | A department, council, club or office in Departments & Clubs; has a head, an acting head, a parent, and (councils/clubs) a Faculty Advisor and secretary's mailbox |
| **HOD** | Whoever heads the unit a requester's HOD approval comes from — found when someone looks, never stored on the booking |
| **Faculty Advisor** | The professor named on a council or club (`units.faculty_advisor_id`); books for it. Not a role — the `faculty_advisor` role is a legacy account type |
| **Council secretary** | The student heading a council; approved club requests at the old club stage. Their **mailbox** (`sec_arts@…`) is copied on the advisor's bookings |
| **Copy to (booking)** | Addresses typed on New Booking, CC on every mail to the requester |
| **Copy to (card)** | The approval chain shown on the Requester details card, CC on staff mail. Different list |
| **Hold** | A `room_holds` row: a booking holds a room exactly while one exists. The database refuses overlapping holds |
| **Guard / turnaround** | The hold range the constraint compares — the stay plus the turnaround buffer (4 h); an accepted changeover may overlap ≤ 2 h |
| **The desk** | The manager and caretaker together |
| **Mock store / mock auth** | The JSON database (`.local-db.json`) used when Supabase is not configured; the one-click persona picker used when Google is not configured |
| **Lapsed** | A request whose check-in passed while it waited; it can only be rejected |
| **Whitelist** | The official email whitelist — accounts allowed to book as the `official` role |
