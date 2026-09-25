# Timeline — how the portal was built, session by session

The whole history on one page, oldest first. Dates are from the git log and
the notes of each session. The reasoning behind each step is in
[03-decisions.md](03-decisions.md); the requirement lists themselves in
[01-background.md](01-background.md). All dates are 2026.

| Date | What happened |
| --- | --- |
| **19 Aug** | First commit: the booking portal — five requester categories, their approval chains (warden, faculty advisor, IAR, manager), config-driven forms (Form Builder), the manager's cinema-style room grid, the developer console, two data stores (JSON mock / Supabase) behind one interface, a persona-picker "mock auth". `AGENTS.md` written for AI agents. |
| 21–22 Aug | Pushed to GitHub (`DevMittal09/GuestHouseIIT`). The **approval log / archive search** at `/history` with `historyScope`. |
| 30 Aug | **Booking lifecycle**: Occupied, Vacated, Cancellation Requested / Approved; cancellation flow; history PDF export. First PR merged. |
| 2 Sep | `.memories/` folder created; the **production plan** written ([05-production-plan.md](05-production-plan.md)). |
| 3–4 Sep | **`room_holds` with an exclusion constraint** (migration 3) — room clashes made impossible in the database; infants modelled (migrations 3–4); logo; security notes. |
| **10 Sep** | Everything pinned to **institute time** (`lib/tz.ts`) after bookings were stored 5h30m late on a UTC host; meal preferences; availability inside the booking form; manager console split into current / awaiting check-out / upcoming; Occupied refused before check-in; the AM/PM read-back. The office's **second requirement list** (parent rule, availability grid, day-wise log, one-month window, allocation mail). Push access fixed. |
| **15 Sep** | **Meeting with the guest house office** ([Guest House Meeting Notes.md](Guest%20House%20Meeting%20Notes.md)): week/month availability, "Booked" wording, formal capacity copy, one infant switch (migration 7), meals per day (migration 8), meals only at Hamsanandi. |
| **16 Sep** | Second pass over the meeting notes: **booking type** (official / personal / alumni, migration 9), alumni logins removed and the **IAR Student Cell** added, **GH Caretaker**, browsable availability in the form, today's checkouts, typed confirmations. **Email** built: `lib/mail/`, the outbox (migration 10), digests, the cron. Gmail sender. |
| 17 Sep | The booking schema must accept its own output (no role could submit — fixed); performance measured; caretaker persona. |
| **19 Sep** | **UI redesign** from the designer's handoff: the public website at `/` (home, book-room, book-meal, guidelines, gallery, contact with map), sign-in moved to `/sign-in`, navy/gold portal. **LDAP sign-in** with dummy accounts (migration 12). Photos. Also merged that day: **room-scoped guests**, citizenship and **service types** incl. meals only (migration 11), the manager's **book-on-behalf and overrides** (`lib/access.ts`), **editable mail templates** (migration 13), the **turnover override** (migration 14). |
| **21 Sep** | **Requester details** from the academic database (dummy source). **Units and debitable heads** laid down (migration 15). **Production-readiness programme** begins — Phase 1 **Settings** (every rule editable, audited; migration 16), Phase 2 **To = actioner, Copy to = CC**, Phase 3 **turnaround buffer** (migration 17). Vitest installed. |
| **22 Sep** | Phase 4 **HOD approval and debitable heads** (on migration 15's units; projects and `hod_unit_id`, migration 18), Phase 5 **invoices** in the office's template (tariffs, numbering, GST; migration 19), Phase 6 **dining**, Phase 7 **operational states** (extend, move rooms, no-shows, maintenance blocks; migration 20), Phase 8 **security** (session rows, real Google OIDC, TOTP, DB throttles, CSP, encrypted IDs, retention, DPDP; migration 21), Phase 9 begins (narrow revalidation, realtime instead of polling). |
| **23 Sep** | Phase 9 finished (keyword search in Postgres, migration 22; Playwright journeys; CI), Phase 10 **documentation**. The office's **second and third correction lists**: Mock Authentication gated on Google, all rooms double sharing, the 3+1 / 2+2 / 1+3 room rule (migration 23), infant relationship as text, Guardian counts as a parent, meals-only as a set of dates with the kitchen's notice period, no employee ID upload, one guest house is not a question, one Mother per request, overlap colour, the desk account is not a person, **mail threads per booking**, faculty never Institute Grant. The office's **real room numbers** and the Bageshri ₹1,000 rate. Vercel Hobby-plan fixes. |
| **24 Sep (morning)** | The office's **fourth list**: invoices after check-out (both consoles + archive), dining invoices without room details, project rows only with Project, a typed project sub-head, name + gender only for faculty/staff and gender only for official, **clubs booked by their faculty in-charge**, per-booking **Copy to** (migration 24), **Special Funds**. Committed as `fde5c20`. |
| **24 Sep (afternoon)** | **Faculty Advisors by appointment** (migration 25): each council's advisor and secretary's mailbox set in Departments & Clubs; any professor named there books "as Faculty Advisor", straight to the manager, with the secretary pre-filled in Copy to; `fa.petrichor` retired for a faculty account (Dr. Arun Prasad). Committed as `1b1f55e`. Then a **full audit of `.memories` against the code**, reorganised into the layout described in [README.md](README.md). |
| **24 Sep (evening)** | Three defects the audit found, fixed: the developer is no longer offered New Booking (book on behalf is the manager's alone), one source for the guest house's phone and email (`lib/site.ts`) so the help line stops showing a placeholder, and a **Meal counts** link from Reception to the kitchen page with a back link to Reception. |
| **25 Sep** | The office's **fifth list**: the student's academic record and a family check for the Assistant Warden; guests **filled in** from the record and from earlier bookings; **additional charges** on invoices (migration 26); typed meal counts repriced at once; **GST 18% rooms / 5% food** per section, to the office's revised template; **Special Funds for everyone but students**; the **infant card**; an **earlier check-in** at the desk. |

## Branches

- **`main`** — everything above.
- **`ui`** — only the 21 Sep "vermilion" redesign experiment (3 commits of its
  own), far behind `main`; a trial merge gave 30 conflicting files. Not merged.
- Dependabot branches on the remote (actions and npm updates), not merged.

## Numbers, 25 Sep 2026

26 migrations · 7 one-off repairs · 12 roles (10 active, 2 legacy) · 18 demo
personas · 6 demo bookings · 23 real rooms (Bageshri 10, Hamsanandi 13) ·
289 unit tests · 22 end-to-end journeys · 13 console sections.
