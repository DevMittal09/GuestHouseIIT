# Roles and features — who can do what

The finished product, role by role: how each person signs in, where they land,
what their menu shows, what they can do and what they cannot. **Checked
against the code on 24 Sep 2026**, updated for the 25 Sep round —
`lib/access.ts`, `lib/routes.ts`,
`app/(portal)/layout.tsx`, every page's guard and every server action's gate.
If this page and the code disagree, the code is right and this page is a bug.

What each role is *asked* on New Booking, and what is mandatory, is in
[11-booking-forms.md](11-booking-forms.md). Where a request goes after it is
submitted is in [12-workflows.md](12-workflows.md). The demo account for each
role is in [30-credentials-and-access.md](30-credentials-and-access.md).

---

## At a glance

| Role (`profiles.role`) | Label in the portal | Lands on | Books? | Approves? | Desk | Console |
| --- | --- | --- | --- | --- | --- | --- |
| `student` | Student | `/dashboard` | Personal stays for family | — | — | — |
| `employee` | Employee (Faculty & Staff) | `/dashboard` | Official or personal; meals only; **as Faculty Advisor** when named on a council | As **HOD** / club head if appointed | — | — |
| `official` | Official / Dignitary | `/dashboard` | Official only, if whitelisted; meals only | — | — | — |
| `club` | Club / Fest Council | `/dashboard` | **No** — its Faculty Advisor books for it | — | — | — |
| `iar_student_cell` | IAR Student Cell | `/dashboard` | On behalf of an alumnus only | — | — | — |
| `iar_cell` | IAR Office | `/iar` | Official or for an alumnus; meals only | The Student Cell's requests | — | — |
| `warden` | Assistant Warden | `/warden` | — | Students of their hostel | — | — |
| `gh_manager` | Guest House Manager | `/manager` | At the desk, for a guest (official / alumni) | Final stage of everything | Everything | 9 of 13 sections |
| `gh_caretaker` | Guest House Caretaker | `/caretaker` | — | — | Check-in/out, extend, invoices | — |
| `developer` | Developer (Superadmin) | `/admin` → `/admin/users` | — | — | Invoices | All 13 sections |
| `faculty_advisor` | Faculty Advisor | `/approvals` | *Legacy account type* — only if named on a council | Legacy club stage | — | — |
| `alumni` | Alumni (via IAR, legacy) | `/availability` | **Retired** — kept only because stored bookings carry it | — | — | — |

**Approvers by appointment are not roles.** An HOD is whoever heads a
department (or an office's HOD unit) in Departments & Clubs; a council
secretary is the student who heads a council; a **Faculty Advisor** is the
professor named on a council or club. All three are ordinary accounts
(`employee`, `student`) that gain a queue or a booking option because the
console names them — change the name there and the queue or option moves.

---

## Signing in — every role

- **LDAP username + password** on `/sign-in` (also embedded in the public
  `/book-room` and `/book-meal`). Until `LDAP_URL` is set, the dummy directory
  in `lib/ldap/mock-directory.ts` answers. The username is matched to a
  portal account through `profiles.ldap_uid`; a valid LDAP login with no
  portal account gets "not registered". Unknown user and wrong password get
  one message. **8 attempts per username per 15 minutes** (a row in the
  database, `RATE_LIMITS.signIn`).
- **Mock Authentication** (the second button) — the one-click persona picker
  at `/mock-login`, open while Google sign-in is not configured
  (`mockLoginEnabled()`), closed by `MOCK_LOGIN=false`. When
  `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` + `APP_URL` are set, the same
  button is **Sign in with Google** (real OpenID Connect; institute domains
  only; must match an existing portal account) and the picker 404s.
- **Session**: a row in `sessions`, opaque cookie (`__Host-gh_session` in
  production), **30 minutes idle, 12 hours absolute**. "Switch user" signs out
  to `/sign-in`. One browser = one session: signing in as someone else in one
  tab changes every tab (use a private window for two people at once).
- **Developer only:** a TOTP second factor, and proving it again within 10
  minutes before role changes, Settings changes and any delete.
- **Console password** (default `0000`) guards `/admin` for the manager and the
  developer; an unlock lasts 8 hours; 6 attempts per 15 minutes.

---

## Every signed-in role

| Feature | Where | Notes |
| --- | --- | --- |
| **Room Availability** | `/availability` (nav, every role) | Day / Week / Month chart per guest house. Everyone sees booking periods, reference ids and statuses; **only the manager and developer** see who and why (`CAN_SEE_OCCUPANT`). Max 62 days per request. |
| **Booking History / Approval Log** | `/history` (nav, every role) | Requesters: their own bookings ("Booking History"). Staff: their jurisdiction ("Approval Log"), with "Handled by me / Everything in scope". Keyword search with `ref:`, `guest:`, `room:`, `by:`, `purpose:`, `gh:`, `status:` prefixes; date presets; **CSV export for everyone**; **PDF export for the manager and developer only**. |
| Public website | `/`, `/guidelines`, `/gallery`, `/contact`, `/privacy` | Open to anyone, signed in or not. |

---

## Requesters

Everything a requester can do with a booking they own (or raised for a club):

- **See it** on My Bookings (`/dashboard`) — status, rooms once allocated, the
  rejection reason, the full log, and the invoice once issued (download).
- **Ask to cancel** — any booking not yet closed and not already Occupied, with
  a reason. It always becomes **Cancellation Requested** and the manager
  decides (approve → Cancellation Approved, rooms freed; decline → back to the
  status it had). A guest already in the building is ended at the desk.
- **Ask to extend** a stay (new check-out + reason); the manager decides.
- **Download my data** / **Ask for erasure** (DPDP) on the dashboard.
- **"Facing trouble booking?"** line with the guest house office's contact
  (+91 491 209 2016, ghm@iitpkd.ac.in — the same as the website and invoice).

### Student

- **Books:** personal stays for family (not asked — the type is recorded
  silently). **Bageshri only** by default (stated on the form, no dropdown), so
  no meals (Bageshri serves none). Debited to **Personal Funds** (shown, not
  asked) — never Special Funds.
- **Father / Mother / Guardian filled in** from their academic record when
  chosen on a guest (25 Sep 2026), and **Fill in from saved details** on every
  guest card (the record's family and people from their earlier bookings).
- **Route:** Assistant Warden of the hostel on their profile → GH Manager.
- **Special rules:** relationship dropdown with the parent rule (siblings and
  grandparents only alongside Mother / Father / Guardian) and one-of-each
  (one Mother, one Father…); the banner "Double shared rooms will get first
  preference"; booking window 1 month; at most 14 nights.
- **Menu:** My Bookings · New Booking · Room Availability · Booking History.

### Employee — faculty

- **Books:** **Official** (default) or **Personal**; Room, Room + Meals, or
  **Meals only** where a guest house serves meals (Hamsanandi). Both guest
  houses.
- **Route:** official → **HOD** of their department → GH Manager (the HOD
  stage is skipped, and logged, when nobody other than the requester heads the
  department); personal → straight to the GH Manager.
- **Debitable heads (official, room):** Department / Project / PDF / Special
  Funds — **never the Institute Grant**. Dining: Department / PDF / Personal /
  Special Funds. Personal: Personal Funds / Special Funds (since 25 Sep 2026).
- **Guest details:** only **name and gender** are mandatory; no ID upload.
- **Also, when appointed:** HOD Queue (`/hod`) if they head a department;
  Club Approvals if they head a club/council; **Booking as: Faculty Advisor —
  X** on New Booking if named Faculty Advisor of a council or club (next
  section).
- **Menu:** My Bookings · New Booking · (HOD Queue) · (Club Approvals) ·
  Room Availability · Booking History.

### Employee — non-teaching staff

As faculty, except the debitable heads: **Department / Special Funds** only
(room and dining). The category comes from `profiles.staff_category`; an
employee with none set is treated as faculty.

### Faculty Advisor (a professor, by appointment)

The student bodies are a hierarchy — **Faculty Advisor → student secretary
(Technical Affairs, Cultural Affairs…) → clubs**; a fest (Petrichor) has an
advisor of its own. The advisor is **a field on the council or club**
(`units.faculty_advisor_id`, migration 25), set by the developer or manager in
Departments & Clubs → Faculty Advisors, because the post is a 1–2 year
contract. A club with none of its own takes its council's.

- **Books:** from their own faculty login, New Booking shows **Booking as:
  Yourself / Faculty Advisor — <council or club>**. Choosing the advisor
  option opens the **club's** form (`/book?for=<club profile id>`).
- **The booking is the club's:** its account (`user_id`), official, the club's
  debitable heads (**Department / Special Funds**), the club's guest form.
  `created_by` is the professor.
- **Route: straight to the GH Manager** — nobody forwards it, HOD included.
- **Copy to** starts with the council secretary's mailbox
  (`units.secretary_email`, e.g. `sec_arts@iitpkd.ac.in`); removable, and
  more can be added.
- The professor sees it on their own My Bookings ("For Petrichor"), may cancel
  or ask to extend it, is CC'd on every mail to the club about it, and can
  **never approve it**.
- Who may be named: any `employee` not in non-teaching staff, or a legacy
  `faculty_advisor` account. Nobody named → nobody can book for the club.

### Official / office (Director's Office, Registrar, a department's office)

- **Must be on the official whitelist** (Settings; default `admin@`,
  `director.office@`, `registrar@iitpkd.ac.in`, plus the demo `cse.office@`) — otherwise New Booking
  redirects to My Bookings and the server refuses.
- **Books:** official only (not asked); Room, Room + Meals, Meals only; both
  guest houses. **Exempt from the 1-month window and the 14-night cap.**
- **Chooses per booking:** **Direct** (straight to the GH Manager) or
  **Requires HOD approval** (its own head for an officer office; the parent
  department's HOD for a department office). Stored on the booking.
- **Debitable heads:** officer office → **Institute Grant / Special Funds**;
  department office (or unclassified) → **Department / Special Funds**.
- **Guest details:** only **gender** is mandatory.
- Highlighted and sorted to the top of the manager's queue; Hamsanandi rate
  ₹4,000 (the "government officers" tariff).

### Club / fest / council account

The shared mailbox of a club, a fest or a council (a council's account *is* its
secretary's mailbox, e.g. `sec_arts@`).

- **Cannot book.** New Booking is not in its menu; `/book` explains who its
  Faculty Advisor is ("Ask your Faculty Advisor to book"); the server refuses a
  submission.
- **Sees** every booking raised for it on My Bookings, **gets every requester
  mail** about them, and may ask to cancel or extend them.
- **Menu:** My Bookings · Room Availability · Booking History.

### IAR Student Cell

- **Books only on behalf of an alumnus** (its "Official" option was withdrawn;
  office bookings are the IAR Office's). Must give the alumnus's **name**,
  **roll number** and **Alumni ID card** (JPG/PNG/WEBP/PDF, 5 MB). Alumni
  stays are at **Bageshri** (stated, no dropdown), which serves no meals, so in
  practice a room booking; meals-only is not open to it.
- **Route:** IAR Office → GH Manager.
- **Debitable heads:** Institute Grant / Personal Funds (the alumni category).
- **Menu:** My Bookings · New Booking · Room Availability · Booking History.

### IAR Office (books *and* approves)

- **Books:** Official or On behalf of an alumnus; meals only too; Direct or
  Requires HOD approval (it is an office). Its own requests never go to
  `PENDING_IAR` — that would be approving itself.
- **Approves:** the IAR Student Cell's requests at **IAR Queue** (`/iar`),
  with the alumni ID card shown.
- **Debitable heads:** official → the office's class (the seeded IAR unit is
  an officer office: Institute Grant / Special Funds); alumni → Institute Grant
  / Personal Funds.
- **Approval Log:** alumni requests, the Student Cell's, and its own.
- **Menu:** My Bookings · New Booking · IAR Queue · Room Availability ·
  Approval Log.

---

## Approvers

Every approver: **Forward** (to the next stage of the booking's route) or
**Reject with a reason** (mandatory, shown to the requester verbatim). A
request whose check-in passed while it waited has **lapsed** and can only be
rejected. Nobody can ever act on a request they submitted or raised. Approvers
get **one daily digest**, not a mail per request, and a nudge (CC the
manager) when something has waited over **48 hours**.

### Assistant Warden

- **Queue:** `/warden` — **Pending Assistant Warden Review** for students
  whose profile hostel matches theirs (exact text). Their own academic record
  card sits below the queue.
- **The student's record beside each request** (25 Sep 2026): the Review
  dialog shows the student's academic record — roll number, programme,
  phone, **father's, mother's (or guardian's) name**, hostel — and each Father
  / Mother / Guardian on the request against the name on record (matches /
  partly matches / differs / not on record). The queue row says **✓ Matches
  record** or **⚠ Check names**. Only the requests in their own queue; the
  record is shown, never stored or mailed.
- **Approval Log:** student requests from their hostel. No hostel on their
  profile → an explanation instead of a log.
- **Cannot book.** Menu: Assistant Warden Queue · Room Availability ·
  Approval Log.

### HOD (by appointment)

- Whoever is the **head or acting head** of a department in Departments &
  Clubs (or of the unit an office or club answers to — `hod_unit_id`).
- **Queue:** **HOD Queue** (`/hod`) — **Pending HOD Approval** for requesters
  in units whose HOD unit they head. Never their own request (an HOD's own
  official booking skips the stage unless an acting HOD is set).
- **Approval Log:** their own bookings plus requests from the units they
  govern.

### Council secretary / club head (a student, by appointment) — legacy stage

Heads a council or club in the console. **Club Approvals** (`/approvals`)
lists **Pending Club Approval** requests — which today only exist for club
requests stored before 24 Sep 2026, since clubs no longer submit. A
`faculty_advisor` account keeps the same page (name-matched to the club as a
fallback). Their mailbox (`units.secretary_email`) is copied on bookings the
Faculty Advisor raises.

---

## The desk

### Guest House Manager (`gh_manager`)

**Manager Console** (`/manager`), one tab per guest house:

- **Pending queue** — Pending GH Manager, official (whitelisted) requests
  first. **Review & Allocate** opens the room grid for the booking's own dates
  only: green free, red taken (disabled), hatched turnaround (a gap shorter than
  the buffer), amber soft overlap (≤ 2 h); the manager may accept the last two.
  Capacity, extra beds needed and a formal occupancy line are shown.
  **Confirm & Allocate** holds the rooms and approves in one step. **Reject**
  needs a reason. A **meals-only** booking is approved without rooms.
- **Checking out today**, **Current occupants**, **Awaiting check-out**,
  **Checked out — to bill** (vacated in the last 30 days, unpaid),
  **Upcoming stays**.
- **Mark Occupied** (from 2 hours before check-in, never earlier) / **Mark
  Vacated**.
- **Manage** a stay: extend — a **later check-out** or, since 25 Sep 2026, an
  **earlier check-in**; approve / decline a requester's extension; move
  rooms (reason, audited); release a no-show; change dates or meals; cancel;
  reinstate a cancelled or rejected booking.
- **Cancellation requests:** approve (rooms freed) or decline (reason).
- **New booking for a guest** (`/book`): books on someone's behalf — official
  or on behalf of an alumnus, never personal — with the guest's name required;
  may override the alumni-at-Bageshri rule (logged). Exempt from the booking
  window and the stay cap.
- **Invoices:** preview, correct meal counts, **add additional charges with
  comments** (extra bed, broken vase — 25 Sep 2026), issue & print, mark paid,
  **cancel** (the manager and developer only).
- **Kitchen** (`/manager/meals`): plates per meal per day, confirmed and
  pending dining, "Dining to invoice".
- **Console** ("Settings" in the menu → `/admin/users`), behind the console
  password: Users & Roles (cannot create or edit a developer), Departments &
  Clubs (incl. Faculty Advisors), Projects, Tariffs & Invoicing (incl. invoice
  settings), Guest Houses & Rooms (maintenance blocks, bulk rooms, serves
  meals), Form Builder, Email Templates, Mail Outbox, Security (own sessions +
  the office's DPDP data requests).
- Sees names on Room Availability; PDF and collections CSV on the Approval Log.
- **Menu:** Manager Console · Settings · Room Availability · Approval Log.

### Guest House Caretaker (`gh_caretaker`)

A deliberate **subset** of the manager's console — reception.

- **Reception** (`/caretaker`): Checking out today, Current occupants,
  Awaiting check-out, **Checked out — to bill**, Upcoming stays.
- **Mark Occupied / Vacated**; **extend a stay** — later check-out or
  **earlier check-in** (25 Sep 2026).
- **Invoices:** preview, correct meal counts, **add additional charges**,
  issue & print, mark paid — **not cancel**.
- **Kitchen** (`/manager/meals`): a **Meal counts** button on Reception for a
  guest house that serves meals; the kitchen page's back link returns to
  Reception.
- Approval Log over everything; collections CSV.
- **No** allocation, approvals, cancellations, bookings or console.
- **Menu:** Reception · Room Availability · Approval Log.

---

## Developer (`developer`)

- **Developer Console** (`/admin`), behind the console password **and** a TOTP
  second factor; step-up within 10 minutes for role changes, Settings and
  deletes.
- **All 13 sections** — the manager's nine plus four that are developer-only:
  **All Bookings** (force a status — audit-logged, refuses Occupied before
  check-in — and hard delete), **Settings** (the rules, hostels, official
  whitelist), **Audit Log**, **Console Access** (the console password).
- Can assign any role, including developer; cannot delete themselves or drop
  their own developer role.
- Issues and marks invoices paid, may cancel them; sees names on
  availability; PDF export.
- **Does not book.** Booking on someone's behalf is the manager's desk alone
  (`canBookOnBehalf`), so `/book` sends the developer back to the console and
  the public "Book a room" pages offer "Go to your portal" (fixed 24 Sep 2026 —
  it used to open a form with no booking types that could never be submitted).
- **Menu:** Developer Console · Room Availability · Approval Log.

---

## Who can open which console section

| Section | Path | Manager | Developer |
| --- | --- | --- | --- |
| Users & Roles | `/admin/users` | ✓ (not developer accounts) | ✓ |
| Departments & Clubs (+ Faculty Advisors) | `/admin/units` | ✓ | ✓ |
| Projects | `/admin/projects` | ✓ | ✓ |
| Tariffs & Invoicing | `/admin/billing` | ✓ | ✓ |
| Guest Houses & Rooms | `/admin/guest-houses` | ✓ | ✓ |
| Form Builder | `/admin/forms` | ✓ | ✓ |
| Email Templates | `/admin/mail-templates` | ✓ | ✓ |
| Mail Outbox | `/admin/mail` | ✓ | ✓ |
| Security (sessions, 2FA, data requests) | `/admin/security` | ✓ | ✓ |
| All Bookings | `/admin/bookings` | — | ✓ |
| Settings | `/admin/settings` | — | ✓ |
| Audit Log | `/admin/audit` | — | ✓ |
| Console Access | `/admin/access` | — | ✓ |

Every section's actions re-check the role and the unlock on the server
(`requireConsole(section)`), not just the page.
