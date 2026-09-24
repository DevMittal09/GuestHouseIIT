# Recent changes — the last round, and only the last round

**This file is deliberately short-lived.** It holds the changes from the most
recent working session so the next person (or agent) can pick up without
reading the whole decision log. When a new round of changes lands, **delete
what is here and write the new round in its place** — the old entries do not
accumulate. Anything worth keeping permanently belongs in
[06-decisions.md](06-decisions.md), which is the log that *does* accumulate,
and in [AGENTS.md](../AGENTS.md), which is the rules.

So: if you are reading this to find out what happened six weeks ago, it is the
wrong file. Try [06-decisions.md](06-decisions.md).

---

## Round of 24 September 2026 (afternoon) — Faculty Advisors by appointment

The owner's follow-up to the morning's "clubs are booked by their faculty
in-charge" (the fourth correction list, committed as `fde5c20`; recorded in
[06-decisions.md](06-decisions.md) "24 Sep 2026" and
[01-background.md](01-background.md)). Built on `main`. Verified with
`npm run lint`, `npm run typecheck`, `npm test` (258, 13 new in
`tests/faculty-advisor.test.ts`), a production build on the mock store,
`npm run test:e2e` (16: `e2e/club-booking.spec.ts` rewritten, one new —
`e2e/faculty-advisor-console.spec.ts`), and migration 25 applied twice over
1–24 in a throwaway `postgres:16-alpine` with legacy fixtures for its backfill,
its four refusals, `on delete set null`, and `supabase/seed.sql` run twice.

What the owner asked, in their words: *the hierarchy is Faculty Advisor →
Student Secretary (Tech Affairs, Cult Affairs) → clubs; the FA books for each
secretary/club; Copy to defaults to the secretary (sec_arts@, sec_acad@) with
room for more; Petrichor has an FA too — make them a faculty (employee)
account; for all professors, a way to book as FA, with each council mapped to
its FA in the backend because the post is a 1–2 year contract, changeable by
the developer; an FA's booking needs no forwarding — straight to the GH
Manager; and is Copy to on every new booking?*

### 1. The Faculty Advisor is a field on the council, not an account

`units.faculty_advisor_id` (migration 25), set in **Departments & Clubs →
Faculty Advisors** (developer and manager; audited like every unit change). A
club with none of its own takes its council's (`facultyAdvisorOf`, walking
`parent_id`). Anyone `canBeFacultyAdvisor` may be named — an `employee` who is
not non-teaching staff, or a legacy `faculty_advisor` account — and the console
lists every such professor. `updateUnitAction` refuses anyone else, and
refuses an advisor or mailbox on a department or office (so does the
database).

This is now the **only** rule for who books for a club. The morning's two
heuristics (a non-student club head; a `faculty_advisor` account matched by
Department/Club) are gone from `lib/club-booking.ts`; migration 25 copied each
into the field once, so nobody on the hosted project loses the right.

### 2. "Booking as" on New Booking

Any professor named Faculty Advisor sees a **Booking as** card on `/book`:
*Yourself — Dr. X* / *Faculty Advisor — Cultural Affairs Council* /
*Faculty Advisor — Petrichor Fest Council*. The advisor option is
`/book?for=<club profile id>`, as in the morning; the booking is still the
club's (`user_id`), `created_by` the professor. The old "Book for …" buttons
on My Bookings stay.

> **Bug the journey caught:** switching Booking as is a client-side navigation
> within `/book`, so React kept the mounted `BookingForm`, and `useForm`'s
> defaults — booking type, guest house, Copy to — stayed the previous
> requester's. The form is now keyed by `requester.id` and service.

### 3. Straight to the Guest House Manager

`routeFor("club", …, { raisedByFacultyInCharge: true })` is `[]` — no Faculty
Advisor stage (the morning already skipped it) **and no HOD stage** (the
morning kept one where the club had an HOD unit). A club request stored
before today keeps `PENDING_FA` → HOD.

### 4. Copy to starts with the secretary's mailbox

`units.secretary_email` (migration 25), the club's own else its council's
(`secretaryEmailOf`); `defaultCopyToFor(club, units)` fills it into the first
Copy-to row, with a line saying it can be cleared. Left out when the booking
is for the council's own account, which *is* that mailbox. **Copy to was
already on every new booking** — every role, room and meals-only — since the
morning; this only pre-fills it.

### 5. Demo data

- **Dr. Arun Prasad** (`faculty-arun`, `arun.prasad@iitpkd.ac.in`, LDAP
  `arun.prasad` / `Arun@2026`) — an ordinary CSE **faculty employee**, named
  Faculty Advisor of the Cultural Affairs Council and of Petrichor.
- **Cultural Affairs Council** (`council-cultural`, `sec_arts@iitpkd.ac.in`,
  LDAP `sec_arts` / `SecArts@2026`) — the council's own account, which is its
  secretary's mailbox; role `club`, unit `unit-cultural`.
- `unit-cultural` renamed **Cultural Affairs Council** (fresh databases only),
  with `secretary_email = sec_arts@iitpkd.ac.in`; Petrichor has its own advisor
  and no mailbox, so its bookings copy sec_arts@.
- **`fa.petrichor` is retired** from both seeds, the LDAP directory and the
  academic records. An existing database keeps the row (seeds never delete);
  on the hosted project migration 25 will map Petrichor to it — name a
  faculty member in the console instead.

## Loose ends

- **Apply migration 25 to the hosted project** (after 24). Until then nobody
  can book for a club there.
- **Name each council's Faculty Advisor and secretary's mailbox** in the
  console. Only sec_arts@ is seeded; the owner gave sec_acad@ as the other
  example and Technical Affairs' address is not known.
- The mock `.local-db.json` of anyone who ran the morning's build keeps the
  old `fa-petrichor` account; the self-heal adds Arun, the council account and
  the unit fields. Delete the file for a clean demo.
