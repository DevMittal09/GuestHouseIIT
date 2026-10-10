# IIT Palakkad Guest House Portal — complete context for a UI revamp

> **What this document is.** The whole product as built on **29 Sep 2026**: the
> background, who uses it, every page and what it shows, every workflow, the
> data behind the screens, the rules the UI must express, the current look,
> and the technical constraints a new front end has to respect. It describes
> the product. **It says nothing about what the new UI should look like.**
> Those requirements come separately.
>
> **What is being revamped:** the **presentation layer only**: pages, layouts,
> components and styling. The domain logic (`lib/`), the server actions
> (`app/actions/`), the database and the workflows stay as they are. Anything
> that looks like a behaviour change in a redesign has to be checked against
> §10 and §13.

---

## 1. The product in one paragraph

A web app for **IIT Palakkad** (Indian Institute of Technology Palakkad, Kerala,
India). It has two parts:

- A **public website** for the institute's two guest houses, **Bageshri** and
  **Hamsanandi**: home, guidelines, gallery, contact, and entry points to book.
- A **signed-in booking portal**. Students, faculty and staff, institute
  offices, the alumni-relations offices, and (through their Faculty Advisor)
  student clubs submit room and meal bookings. Each request goes through its
  own approval chain (Assistant Warden, HOD or IAR Office) and ends with the
  **Guest House Manager**, who approves it by allocating real rooms on a
  cinema-style seat grid. A **caretaker** runs reception: check-in, check-out
  and invoices. A **developer** console can reconfigure almost everything
  without code.

The portal is feature-complete for every workflow the institute has specified.
It is **not yet deployed for real use** and runs on demo data.

---

## 2. Background

### 2.1 The institute and the guest houses

| Guest house | Rooms | Meals | Notes |
| --- | --- | --- | --- |
| **Bageshri** | 10: 201, 202, 203, 204, 206, 302, 303, 305, 306, 307 | **No kitchen** | Students may book only here. Alumni stays go here by default. ₹1,000 / room / day |
| **Hamsanandi** | 13: A4, B1–B4, C1–C4, D1–D4 | **Serves meals** (breakfast, lunch, dinner) | ₹2,000 / room / day; ₹4,000 for government officers (the `official` role) |

- **Every room is double sharing.** Two beds, and a third guest on a rolled-in
  extra bed. The data model still supports "single" rooms, but none exist.
- Guest houses and rooms are **data**. Admins can add, rename or deactivate
  them, so the UI must never hardcode "two guest houses" or their names.
- Whether a guest house serves meals is a flag (`serves_meals`), never
  inferred from its name.
- Front office: **+91 491 209 2016**, **ghm@iitpkd.ac.in**, Kanjikode West,
  Palakkad, Kerala. Stored in one place in code (`GUEST_HOUSE_CONTACT`).
- Seminar halls and meeting rooms are booked on a **different** system, the
  institute's **MRBS** (`https://mrbs.iitpkd.ac.in`). The site points people
  there.

### 2.2 The problem it solves

Before the portal, requests came by email and paper. That caused four
problems:

1. **No approval trail.** Nobody could see who had approved what, or when.
2. **Room clashes.** Allocation was tracked by hand, so two guests could be
   promised the same room.
3. **Rules enforced by memory.** Students only at Bageshri, alumni need an ID
   card, dignitaries skip review, and so on.
4. **ID documents** arrived as loose email attachments with no link to a
   booking.

### 2.3 Who guests are

Parents and family visiting students; collaborators, examiners and speakers
visiting faculty; artists and guests of student clubs and fests (e.g. the
Petrichor fest); returning alumni; official dignitaries and inspection
committees; and meal-only guests (for example, lunch for a visiting examiner).

### 2.4 Who built it and how requirements arrive

Students built it for the institute's **Administration Section** and the
**guest house office**. The office sends numbered lists of corrections, which
are worked through one at a time. There have been five rounds so far, plus a
meeting on 15 Sep 2026. The office has asked for three things in particular:

- **Reception must be simple.** "For users sitting in GH reception, there
  should not be too complex features in the UI."
- **Dangerous actions need warnings,** for example deleting a guest house.
- **The developer account should be able to edit everything,** so nothing is
  left for an IT person to fix in the backend.

### 2.5 Status

- Runs locally on a JSON mock database, and against one hosted Supabase
  project holding demo data.
- 12 roles (10 active), 18 demo personas, 6 demo bookings, 26 database
  migrations, 305 unit tests, 26 end-to-end journeys, 13 console sections.
- Before real use: connect the institute LDAP, close "Mock Authentication",
  set production secrets, and have the office fill in its Settings.

---

## 3. Glossary (terms the UI uses)

| Term | Meaning |
| --- | --- |
| **Booking / request** | One submission. It has a **reference id** such as `IITPKD-GH-2026-AB12C` (demo ones look like `DM001`). |
| **Booking type** | *Why* the stay is booked: **Official**, **Personal**, or **On behalf of an alumnus**. |
| **Service type** | *What* is booked: **Room booking**, **Room + Meals**, or **Meals only**. |
| **Debitable head** | Which budget pays: Department Budget, Institute Grant, Professional Development Fund (PDF), Personal Funds, Project Grant, Special Funds. |
| **Room card** | "Room 1", "Room 2"… on the form: one requested room and the guests who will share it. The manager later maps each card to a physical room. |
| **Infant** | A guest under 5. Shares a guardian's bed and needs no ID. |
| **Hold** | A room reserved for a booking over a period. The database refuses overlapping holds. |
| **Turnaround buffer** | A 4-hour minimum gap between one stay's check-out and the next check-in in the same room (housekeeping). |
| **Accepted overlap / changeover** | The manager may knowingly let two stays overlap by up to 2 hours. |
| **The desk** | The manager and the caretaker together. |
| **Lapsed** | A pending request whose check-in date passed while it waited. It can only be rejected. |
| **HOD** | Head of Department: whoever currently heads the requester's unit. This is an appointment, not a role. |
| **Faculty Advisor** | The professor named on a student council or club. Books on the club's behalf. An appointment, not a role. |
| **Council secretary** | The student heading a council. Their shared mailbox (e.g. `sec_arts@iitpkd.ac.in`) is copied on club bookings. |
| **Copy to (booking)** | Email addresses the requester types on New Booking, CC'd on every mail sent to the requester. |
| **Copy to (card)** | The approval chain shown on the Requester details card, CC'd on staff mail. A different list. |
| **Whitelist** | The official email whitelist: office accounts allowed to book as "Official / Dignitary". |
| **Institute time** | Asia/Kolkata (IST). Every time in the app is shown and entered in IST, whatever the server or browser zone. |
| **MRBS** | The institute's separate Meeting Room Booking System. |

---

## 4. Tech stack and how the front end is wired

| Layer | Choice |
| --- | --- |
| Framework | **Next.js 16** (App Router, Turbopack). APIs differ from older Next. Docs are in `node_modules/next/dist/docs/`. Middleware is called `proxy.ts` in this version. |
| UI runtime | **React 19**, with the **React Compiler** lint rules on (strict) |
| Language | TypeScript |
| Styling | **Tailwind CSS v4** (CSS-first config; tokens in `app/globals.css` under `@theme inline`) |
| Components | **shadcn/ui** (radix base, "nova" preset) in `components/ui/`. This registry has **no `form` component**. |
| Icons | `lucide-react` |
| Toasts | `sonner` |
| Forms | `react-hook-form` + `zod` 4 (`@hookform/resolvers`) |
| Dates | `date-fns`, always through the IST helpers in `lib/tz.ts` / `lib/format.ts` |
| Fonts | `next/font/google`, self-hosted: **Source Serif 4** (headings, optical-size axis) and **Source Sans 3** (body/UI) |
| Images | `next/image`, from `public/` |
| PDFs | jsPDF, dynamically imported for the history report (client side); drawn on the server for invoices |
| Data | Supabase (Postgres + Storage) **or** a JSON mock store, chosen from the environment behind one interface |
| Tests | Vitest (`tests/`), Playwright (`e2e/`) against a production build |
| Node | ≥ 20.9 (Next 16); this machine uses Node 20 via nvm |

**How a page works:**

- **Pages are server components.** They read the session (`getCurrentUser()`)
  and data (`getStore()`), check the role, and pass plain data to **client
  components** for anything interactive.
- **Every write is a server action** in `app/actions/*.ts`, for example
  `createBooking`, `reviewBooking`, `allocateRooms`, `updateBookingLifecycle`
  and `issueInvoice`. Actions return `{ ok, error }`-style results. The UI shows
  success or failure with sonner toasts and calls `router.refresh()` or
  `router.push()`.
- **Every action re-checks authorization on the server.** Hiding a button in
  the UI is never the security boundary.
- **Route handlers** (`app/api/`) exist only for the Google sign-in redirect and
  callback, file downloads (ID documents, invoice PDFs, invoice preview), and
  the two cron endpoints.
- **Live updates:** `components/live-updates.tsx`, mounted in the portal
  layout, re-fetches open desk and queue pages when bookings, holds, room blocks
  or invoices change. It uses Supabase realtime, or a 30-second poll on the mock
  store. It is switched off on `/history` and `/availability`, which fetch their
  own data.
- **The public site is dynamic.** It reads the session to show "Sign in" or
  "My portal", and reads guest houses from the store (cached for 30 minutes,
  expired when an admin changes them).

---

## 5. Site map — every route

### 5.1 Public website — `app/(site)/`, open to everyone

| Route | Page |
| --- | --- |
| `/` | **Home** |
| `/book-room` | Book a Room: sign-in form, then goes to `/book` |
| `/book-meal` | Book Meal: sign-in form, then goes to `/book?service=meals_only` |
| `/guidelines` | Guidelines: how booking works, then numbered rules |
| `/gallery` | Photo gallery |
| `/contact` | Contact details and a map tab per guest house |
| `/privacy` | The versioned privacy notice (India's DPDP Act) |
| `/sign-in` | General sign-in. **Every signed-out portal guard redirects here** (never to `/`). |
| `/mock-login` | "Mock Authentication": a one-click persona picker, open while Google sign-in is not configured |

The public header nav, in order: **Home · Book a Room · Book Meal · Guidelines ·
Gallery · Contact Us**, then **Sign in** or **My portal**.

### 5.2 Signed-in portal — `app/(portal)/`

| Route | Who | Page |
| --- | --- | --- |
| `/dashboard` | Requesters, and Faculty Advisors | **My Bookings** |
| `/book` | Requesters; the manager (booking for a guest) | **New Booking** form. `?service=meals_only` for a meal booking; `?for=<club id>` for a Faculty Advisor booking for a club |
| `/warden` | Assistant Warden | Warden queue, plus their own record card |
| `/hod` | Anyone who heads a department (appointment) | HOD queue |
| `/approvals` | Council secretary / legacy Faculty Advisor account | "Club Approvals" queue (legacy stage) |
| `/fa` | — | Redirects to `/approvals` |
| `/iar` | IAR Office | IAR queue |
| `/manager` | Guest House Manager | **Manager Console**, one tab per guest house (`?gh=<name>`) |
| `/manager/meals` | Manager, caretaker | The kitchen's day: meal counts |
| `/caretaker` | Caretaker | **Reception** |
| `/availability` | **Every signed-in role** | Room Availability chart |
| `/history` | Every signed-in role | "Booking History" (requesters) or "Approval Log" (staff) |
| `/admin` → `/admin/users` | Manager (9 sections), developer (all 13) | The console, behind a password |
| `/admin/users` · `/units` · `/projects` · `/billing` · `/guest-houses` · `/forms` · `/mail-templates` · `/mail` · `/security` · `/bookings` · `/settings` · `/audit` · `/access` | See §9.12 | Console sections |

### 5.3 Files and PDFs

- `/api/documents/[...path]`: uploaded ID documents, alumni cards and
  sanction letters. Authorised, audited, served as short-lived links.
- `/api/invoices/[id]/pdf`: an issued invoice (desk: any; a requester: only
  their own).
- `/api/invoices/preview/[bookingId]`: a draft invoice with a DRAFT
  watermark (desk only).

---

## 6. Roles — who signs in, where they land, what their menu shows

| Role (`profiles.role`) | Label in the UI | Lands on | Menu (portal nav, in order) |
| --- | --- | --- | --- |
| `student` | Student | `/dashboard` | My Bookings · New Booking · Room Availability · Booking History |
| `employee` | Employee (Faculty & Staff) | `/dashboard` | My Bookings · New Booking · (HOD Queue, if they head a unit) · (Club Approvals, if appointed) · Room Availability · Booking History |
| `official` | Official / Dignitary | `/dashboard` | My Bookings · New Booking · Room Availability · Booking History |
| `club` | Club / Fest Council | `/dashboard` | My Bookings · Room Availability · Booking History (**cannot book**) |
| `iar_student_cell` | IAR Student Cell | `/dashboard` | My Bookings · New Booking · Room Availability · Booking History |
| `iar_cell` | IAR Office | `/iar` | My Bookings · New Booking · IAR Queue · Room Availability · Approval Log |
| `warden` | Assistant Warden | `/warden` | Assistant Warden Queue · Room Availability · Approval Log |
| `gh_manager` | Guest House Manager | `/manager` | Manager Console · Settings (→ console) · Room Availability · Approval Log |
| `gh_caretaker` | Guest House Caretaker | `/caretaker` | Reception · Room Availability · Approval Log |
| `developer` | Developer (Superadmin) | `/admin` | Developer Console · Room Availability · Approval Log |
| `faculty_advisor` | Faculty Advisor | `/approvals` | Legacy account type |
| `alumni` | Alumni (via IAR, legacy) | — | Retired. Kept only because old bookings carry it |

**The menu is computed per user, not just per role** (`app/(portal)/layout.tsx`):

- **HOD Queue** appears for anyone who heads a department.
- **Club Approvals** appears for a council head.
- **My Bookings** and **New Booking** appear for a professor who is a Faculty
  Advisor.

**What each kind of user does, in short:**

- **Student:** books family members (personal), **Bageshri only** →
  their hostel's **Assistant Warden** → Manager.
- **Employee (faculty or non-teaching staff):**
  - Official booking → their **HOD** → Manager.
  - Personal booking → straight to the Manager.
  - Meals-only booking → straight to the Manager.
  - When named Faculty Advisor of a council or club, can also book **for the
    club**, which goes straight to the Manager.
- **Official (whitelisted office — Director's Office, Registrar, a department
  office):**
  - Chooses per booking between **Direct** (straight to the Manager) and
    **Requires HOD approval**.
  - Exempt from the 1-month window and the 14-night cap.
  - Highlighted and sorted first in the manager's queue.
- **Club / council account:** **cannot book.** Its Faculty Advisor books for it.
  It sees those bookings and gets every mail about them.
- **IAR Student Cell:** books **only on behalf of an alumnus**. It must give the
  alumnus's name, roll number and ID card. The request goes → **IAR Office** →
  Manager.
- **IAR Office:** books (official, or for an alumnus) **and** approves the
  Student Cell's requests.
- **Assistant Warden:** approves students of their own hostel. Sees each
  student's academic record and a check of the parents named on the request
  against that record.
- **HOD (appointment):** approves official requests from their department,
  its staff and its office.
- **Guest House Manager:**
  - Gives final approval by **allocating rooms**.
  - Runs the whole desk.
  - Books for guests who cannot use the portal.
  - Issues invoices.
  - Can open 9 console sections.
- **Caretaker:** reception. Check-in and check-out, moving a stay's dates
  (earlier check-in, later check-out), and invoices. No approvals, no
  allocation, no console.
- **Developer:** all 13 console sections, behind a password **and** a TOTP
  second factor. Does **not** book.

**Nobody can ever approve a request they submitted or raised.**

**Session behaviour the UI must live with:** a session expires after
**30 minutes idle** or **12 hours** in total. One browser holds one session:
signing in as someone else in one tab changes every tab. A client-side
"this tab switched user" guard was built and **reverted as intrusive**. Don't
rebuild it.

---

## 7. The data behind the screens

### 7.1 A booking (`BookingWithDetails`)

| Field | Shown as |
| --- | --- |
| `booking_reference_id` | The id everyone quotes |
| `status` | Status badge (§8.3) |
| `requester` (profile), `user_role` | Who asked, and their category |
| `created_by` | Whoever actually submitted it, when that isn't the requester: the manager at the desk, or a Faculty Advisor for a club |
| `on_behalf_of_name/email/phone` | The guest the manager booked for |
| `guest_house` | Bageshri / Hamsanandi |
| `booking_type` | Official / Personal / On behalf of an alumnus |
| `service_type` | Room booking / Room + Meals / Meals only |
| `office_approval` | Direct / HOD, offices only |
| `check_in`, `check_out` | ISO instants, **always displayed in IST** |
| `purpose_of_visit` | Free text |
| `rooms[]` | Room cards, each with its `guests[]` and, once allocated, its `assigned_room` |
| `guests[]` | name, age, gender, relationship, citizenship, nationality, passport, **ID number (shown as the last 4 digits only)**, ID document link, `is_infant` |
| `assigned_rooms[]` | The physical rooms held, e.g. "B2, C1" |
| `meals` | A per-day plan: `[{date, breakfast, lunch, dinner}]` |
| `meal_preference` | Vegetarian / Non-vegetarian |
| `meal_guest_count` | Head count, on meals-only bookings |
| `debit_head`, `debit_details`, `debit_subhead`, `project_id`, `debit_document_url` | Who pays; the project; the special-fund sanction |
| `alumni_name`, `alumni_roll_number`, `alumni_id_url` | For alumni bookings |
| `custom_fields[]` | Answers to admin-defined form questions, with their labels frozen at submission |
| `copy_to_emails[]` | Up to 25 addresses |
| `has_infant`, `has_foreign_national` | Flags for lists |
| `extension_requested_until/reason` | A requester's pending ask to stay longer |
| `rejection_reason` | Shown to the requester word for word |
| `logs[]` | The audit trail: who moved it from which status to which, when, and why |
| `created_at`, `updated_at` | |

### 7.2 Other entities the UI shows

- **Guest house:** name, number of active rooms, `serves_meals`.
- **Room:** number, type (double sharing), active or inactive.
- **Room block:** a maintenance period on a room. It can't be allocated and is
  drawn differently in charts.
- **Occupancy segment:** one room held by one booking over a period, plus its
  turnaround band. This drives the availability charts. **Names and purpose
  are stripped for everyone except the manager and developer.**
- **Profile (account):** email, full name, role, hostel, department or club,
  roll number, LDAP username, unit, faculty/staff category.
- **Unit:** a department, council, club or office. It has a parent, a
  head, an acting head, an office class (officer or department), whose HOD
  approves, a **Faculty Advisor**, and a **secretary's mailbox**.
- **Project:** number, title, principal investigator, active flag. Offered
  under the Project debitable head.
- **Tariff:** an effective-dated rate, optionally narrowed by guest house, room
  type, booking type and requester role.
- **Invoice:** a draft (no number), then issued (numbered `GH/2026-27/0001`,
  frozen), then paid (cash, UPI with its id, or bank transfer with its UTR),
  or cancelled (with a reason). Every issued invoice keeps a full snapshot of
  what it printed.
- **Academic record** (read-only, from the institute's academic database, dummy
  data for now), by kind:
  - **Student:** roll number, name, programme, department, email, phone,
    father's, mother's and guardian's names, hostel.
  - **Employee:** employee id, name, department, type, phone, email, office
    number.
  - **Office:** department, email, phone.
  - **Student representative:** type, email, phone, faculty-in-charge email.
  - **Alumni office:** department, email, phone.
  - **Warden:** name, phone, email, hostel.

  **Never stored, logged or emailed.**
- **Email outbox row:** event, To/CC, subject, status (queued / sent / failed),
  attempts, error.
- **Audit entries:** security events (setting changes, role changes, invoice
  actions, document views).

---

## 8. Workflows and statuses

### 8.1 Approval routes

```
Student (personal) ────────────────► Assistant Warden ─► GH Manager (allocates rooms) ─► Approved
Employee, official ────────────────► HOD ──────────────► GH Manager ─► Approved
   (HOD stage skipped and logged when nobody but the requester heads the department)
Employee, personal ────────────────────────────────────► GH Manager ─► Approved
Office ── "Direct" ────────────────────────────────────► GH Manager ─► Approved
Office ── "Requires HOD approval" ─► its head / HOD ───► GH Manager ─► Approved
Club (raised by its Faculty Advisor) ──────────────────► GH Manager ─► Approved
IAR Student Cell (for an alumnus) ─► IAR Office ───────► GH Manager ─► Approved
IAR Office (own) ── Direct or via its head ────────────► GH Manager ─► Approved
Anyone, Meals only ────────────────────────────────────► GH Manager (approve, no rooms) ─► Approved
Any stage ── Reject + reason (mandatory) ─► Rejected
```

- Intermediate approvers have exactly two actions: **Forward** and **Reject**
  (a reason is required and shown to the requester word for word).
- The manager approves **only by allocating rooms**. There is no separate
  "Approve" for room bookings. A meals-only booking is approved without rooms.

### 8.2 After approval — the desk lifecycle

```
APPROVED ─(guest arrives; allowed from 2 h before check-in)─► OCCUPIED ─(guest leaves)─► VACATED ─► invoice ─► paid
APPROVED ─(desk brings the check-in forward, e.g. guest arriving a day early)─► APPROVED
OCCUPIED ─(extension granted / desk extends the check-out)─► OCCUPIED
APPROVED ─(no-show; optional automatic release)─► CANCELLED
Any open status ─(requester: Cancel + reason)─► CANCELLATION_REQUESTED ─► approved: CANCELLATION_APPROVED (rooms freed)
                                                                     └─► declined: back to the previous status
Manager can cancel directly ─► CANCELLED.  Manager can reinstate a cancelled or rejected booking.
```

- **Requesters never cancel outright.** Every cancel is a request the manager
  decides. An Occupied stay can't be cancelled from the portal; the desk ends
  it.
- **"Occupied" is a fact recorded at the desk, not something a date implies.**
  Marking Occupied before check-in (minus a 2-hour grace) is refused. A stay
  that hasn't started is never *displayed* as Occupied.
- Rooms are held exactly while the status is `APPROVED`, `OCCUPIED` or
  `CANCELLATION_REQUESTED`. Any other status frees them automatically.

### 8.3 Statuses, their labels and current badge colours

| Status | Label | Current badge |
| --- | --- | --- |
| `PENDING_WARDEN` | Pending Assistant Warden Review | amber |
| `PENDING_FA` | Pending Club Approval (legacy) | amber |
| `PENDING_HOD` | Pending HOD Approval | amber |
| `PENDING_IAR` | Pending IAR Cell Review | amber |
| `PENDING_GH_MANAGER` | Pending GH Manager | sky blue |
| `APPROVED` | Approved | emerald |
| `REJECTED` | Rejected | red |
| `CANCELLED` | Cancelled | muted grey |
| `OCCUPIED` | Occupied | indigo |
| `VACATED` | Vacated | slate |
| `CANCELLATION_REQUESTED` | Cancellation Requested | orange |
| `CANCELLATION_APPROVED` | Cancellation Approved | rose |

The "Lapsed" marker is a red badge on a pending request whose check-in has
passed.

### 8.4 What happens automatically

- **Email is queued, never sent inline.** Every submission and decision mails
  the next person who has to act (**To**), with the approval chain in **CC**.
  Every mail to the requester is CC'd to the booking's Copy-to list.
- Staff mail about a booking **threads on that booking**. Requester mail
  stands alone, with a `[reference]`-led subject.
- **Approvers get one daily digest**, not a mail per request. A request waiting
  over **48 hours** triggers an escalation with the manager copied.
- A **day-wise report per guest house** (arrivals, departures, in house,
  awaiting check-out, pending allocation, kitchen plates) goes to the manager
  and caretaker every morning. A reminder goes to the requester the day before
  check-in.
- Every night: the optional no-show release, and erasure of ID data past the
  retention period.
- Email templates are HTML tables with inline styles. They currently carry an
  **old amber header**, not the site palette. They are rendered in code
  (`lib/mail/render.ts`) and their wording is editable in the console.

---

## 9. Screen-by-screen inventory

Each screen below lists what it shows, what the user can do, and the
conditional states. This is the functional surface a new UI must cover.

### 9.1 Public website

**Header** (`components/site/site-header.tsx`):

- The lockup, then the six links, then Sign in / My portal.
- Sticky on wide screens. On narrow screens the links move to a second row
  that scrolls sideways.
- The lockup (`BrandBlock`) is the institute emblem image beside "Guest House"
  set in the serif, with a tracked "IIT PALAKKAD" tagline. The same lockup,
  compact, is used in the portal header and the footer.

**Footer** (`components/site/site-chrome.tsx`):

- Opens with an MRBS line: "Booking a lecture hall or meeting room? …" with an
  **Open MRBS** button.
- Then: the lockup and address; front office (phone, email); **Find us**
  (each guest house's Map and Directions links, and How to reach the campus);
  **Institute** links (IIT Palakkad website, MRBS, the guest house page on
  iitpkd.ac.in, How to reach, Telephone directory).
- A bottom line: Guidelines · Contact · Privacy notice.

**Home (`/`)** today:

- A split hero: a small label, the `<h1>` "Guest houses of IIT Palakkad", one
  sentence naming the houses, **Book a room** / **Book meals** buttons, the
  front-office number, and one 4:3 photograph.
- A card per guest house: its name and a one-line summary such as
  "Double-sharing rooms, with meals served on site." No counts.
- Eight amenity cards: Air-conditioned rooms, Attached bathrooms, Wi-Fi,
  Television, Refrigerator, Meeting room, Exercise room, and Dining (or
  Reception if no house serves meals).
- "A look inside": four photo thumbnails and a "View all photographs" link.
- A boxed "Planning a visit?" with Guidelines / Contact us.

**Book a Room / Book Meal / Sign in:** a page title and one line of lead, the
sign-in form, and a contained photo beside it on wide screens.

- A signed-in visitor on `/book-room` or `/book-meal` sees "You are signed in —
  Continue" instead of the form.
- Book Meal says meals are booked inside the portal and points to the
  guidelines for meal times.
- A developer is told "Go to your portal", because developers don't book.

**Guidelines (`/guidelines`):**

- A light masthead with a **"Provisional edition"** note while the house rules
  are unconfirmed.
- **How booking works** as five numbered steps: Sign in, Request, Approval,
  Arrival, Departure.
- A sticky **Contents** list.
- Eight numbered sections, 1–6 **generated from the live rules and
  Settings**: Booking a stay, Rooms and occupancy, Check-in and check-out,
  Meals (with the **meal timetable** and the kitchen's notice rule), Charges
  and payment, Cancellation. Sections **7 During your stay** and **8 Safety
  and help** are placeholders marked "To be confirmed".
- An optional PDF download (hidden while no URL is set).

**Gallery:** a light masthead, then photos grouped by subject (Exterior and
grounds, Rooms and suites, Common spaces). A section with four or more photos
leads with one at double size. **No visible captions** (alt text only). Each
photo opens full size.

**Contact:** a light masthead; front office, email, address; a Bookings note
(online only; lecture halls are on MRBS); **"Finding the guest houses"** with
one **map tab per guest house**. The tabs are WAI-ARIA tabs with a Google Maps
iframe embed (no API key), and "Open in Google Maps" / "Get directions".

**Privacy:** the versioned DPDP privacy notice. It has a "Your rights"
heading and a "Version yyyy-mm-dd" line.

### 9.2 Sign-in

The sign-in form (`components/login-form.tsx`) is shared by `/sign-in`,
`/book-room` and `/book-meal`.

- Fields are labelled **"LDAP username"** and **"LDAP password"**; the button
  is **"Sign in"**. The username placeholder uses the real student format,
  e.g. `142301026`.
- A second door below it:
  - **"Mock Authentication"**, a link to the persona picker, while Google
    isn't configured. It must **not** carry Google's "G" mark.
  - **"Sign in with Google"** (real OpenID Connect, institute domains only)
    once Google is configured.
- A dashed demo note shows one dummy login while the dummy directory is in use.
- Errors:
  - Unknown user and wrong password share **one message**: "Incorrect
    username or password".
  - A valid directory login with no portal account gets "not registered".
  - After 8 attempts per username in 15 minutes the account is throttled.
- `?next=` carries the destination, e.g. from Book a Room to `/book`.
- `/mock-login` is titled "Mock Authentication". It lists every persona as a
  one-click sign-in.

### 9.3 Portal shell (every signed-in page)

- **Header:** the compact lockup (tagline "IIT Palakkad · Booking portal",
  linking to the role's home); the user's name and email; a role badge; and a
  **Switch user** button (signs out to `/sign-in`).
- **Nav bar:** a charcoal bar, sticky, with a vermilion bar under the current
  item. Items are per user (§6).
- **Main:** max width 1200px.
- **Footer:** a slim ink bar with © Indian Institute of Technology Palakkad,
  and links to the Guest house website, Guidelines, Contact, Room Booking
  System (MRBS) and iitpkd.ac.in.
- **Page header** (`components/page-header.tsx`): a serif `<h1>`, a short
  vermilion rule, a description, and optional action buttons on the right.

### 9.4 My Bookings (`/dashboard`)

- Title "My Bookings" and a one-line description.
- **Large booking tiles ("doors")** under the title:
  - **New room booking** (vermilion): "Rooms at Bageshri and Hamsanandi —
    dates, guests and meals in one request". It names only the houses this
    role may book.
  - **Meal booking** (ink): "Meals only at Hamsanandi — no room needed". Only
    for roles that may book meals only, and only where a guest house serves
    meals.
  - For a Faculty Advisor, one **Book for &lt;club&gt;** tile per club: "As its
    Faculty Advisor — goes straight to the Guest House Manager".
- A club account sees a notice naming its Faculty Advisor ("Ask your Faculty
  Advisor to book") instead of the tiles.
- **Bookings table:** Reference · Guest House · Check-in · Check-out · Rooms ·
  Status · Details. Bookings a Faculty Advisor raised for a club show
  "For &lt;club&gt;".
  - The **Invoice** download appears once an invoice is issued, marked paid
    or awaiting payment.
  - The **Details** dialog shows the full booking (§9.14), with:
    - **Request cancellation** (a required reason; files a cancellation
      request the manager decides);
    - **Request extension** (a new check-out and a reason of at least 3
      characters; the manager decides);
    - the rejection reason, the rooms once allocated, and the full log.
- **My data** panel (DPDP): **Download my data** and **Ask for erasure**,
  showing an open request if there is one.
- The help line: "Facing trouble booking? Contact the Guest House Office —
  +91 491 209 2016, ghm@iitpkd.ac.in".

### 9.5 New Booking (`/book`): the largest and most complex screen

`components/booking-form.tsx` is about 2,400 lines. **The form is data-driven:**
which fields appear, and whether each is required, optional or hidden, comes
from the role's form configuration, which admins edit in the Form Builder.
The same configuration builds the validation schema on the client **and** the
server.

**Page title varies:** "New Booking Request"; "New Booking for &lt;Club&gt;";
"Meals only"; or "New Booking (on behalf of a guest)" for the manager. Each
has its own lead sentence.

**Above the form (outside it):**

1. **Booking as** (only for a professor who is a Faculty Advisor): a
   navigation labelled "Booking as" with links **Yourself** and **Faculty
   Advisor — &lt;council or club&gt;**. Choosing one switches whose form it is
   (`/book?for=<id>`). The whole form remounts, keyed by requester.
2. **Requester details card** (or "Club details"): the person's record from
   the academic database, loaded after the page behind Suspense, so the form
   never waits for it.
   - A **Copy to** line names the approvers this request will reach.
   - It falls back to the portal profile if there is no record or the
     database is down.
   - A dashed "Demo build" note appears while dummy records are in use.

**The form, top to bottom:**

| # | Card | When | Content and rules |
| --- | --- | --- | --- |
| 1 | **Type of booking** | Only roles with a real choice: employee (Official by default, or Personal); IAR Office and manager (Official, or On behalf of an alumnus) | Radio. A role with one option is **never asked**; the value is recorded silently |
| 2 | **Approval** | Offices (`official`, `iar_cell`), room bookings | Radio: **Direct** or **Requires HOD approval**. Required |
| 3 | **Debitable head** | Everyone | A radio of the heads allowed for this person and booking type. **Shown, not asked**, when there is only one (a student always gets Personal Funds). **Project:** choose from the Projects list (required), plus an optional **sub-head** text box (≤120 chars). **Special Funds:** optional fund name / sanction reference (≤300) and an optional sanction-letter upload |
| 4 | **Booking on behalf of** | The manager only | Guest's name (required), email, phone |
| 5a | **Meal booking** | Meals-only door (`?service=meals_only`) | "Meals from the Hamsanandi kitchen…". A Kitchen dropdown only if more than one guest house serves meals. A **guest count (1–100)** |
| 5b | **Stay details** | Room bookings | **Guest house.** Stated as text, with the id in a hidden input, when only one is possible. A dropdown only when there is a real choice. **Check-in** date + time and **Check-out** date + time: a native date input plus a custom **hour / minute / AM-PM** picker, defaults 12:00 PM in and 10:00 AM out. A read-back under each time. A live **"Your stay"** summary of both instants. **Purpose of visit** (required, ≥5 chars). The check-in `max` is set to the last date the booking window allows, and that date is printed |
| 6 | **Room availability** | Room bookings | The same chart as `/availability` for the chosen guest house, opening on the check-in date. **Browsable** by day, week or month, and a day either side. A banner says browsing does not change the booking. Snaps back when the check-in changes. Shows **when** rooms are taken, never by whom |
| 7 | **Meals (optional)** / **Days and meals** | Only where the guest house serves meals | **Room bookings:** a grid of days × Breakfast / Lunch / Dinner. **Every meal the stay covers is ticked by default.** A dash where a meal isn't served during the stay (with a tooltip). An **"Every day"** box heads each column. **Vegetarian / Non-vegetarian** is required if any meal is ticked. A summary line such as "Breakfast (2 days), Dinner (1 day), for 3 guests". Clearing everything submits no meals. **Meals-only:** a list of dates, each with its three meals, and "Add another date". A meal can only be booked **before the previous meal finishes being served** (§10) |
| 8 | **Guests, room by room** | Room bookings | Room cards. See below |
| 9 | **Additional information** | If the Form Builder added custom fields for this role | text, textarea, number, date, select or checkbox fields |
| 10 | **Alumni verification** | Booking type = alumni | Alumnus full name, roll number, **Alumni ID card** upload. All required |
| 11 | **Copy to (optional)** | Everyone | Email rows, "Add another email", at most 25. Pre-filled with the council secretary's mailbox when a Faculty Advisor books for a club (removable). Errors show on the bad row |
| 12 | Footer | Everyone | The **pets notice** (display only). The "Facing trouble booking?" help line. The **privacy consent** tick, linking to `/privacy` (required). **Cancel** (back to My Bookings) and **Submit booking request** (brand colour; reads "Submitting…" while pending) |

**Room cards (card 8):**

- Each room card is a `<fieldset>` with the legend **"Room N"**. Buttons: **Add
  room** (at most 10 rooms), **Remove room**, **Add guest**, **Add infant**.
- **Room capacity per card:** at most **4 people**, of whom at most **3 need a
  bed** and at most **3 are infants**. So 3+1, 2+2 and 1+3 fit; 3+2 does not.
  The Add buttons disable at the limit and say why.
- The card shows a party summary such as "2 guests + 2 infants".
- **Guest card** fields, each shown per the role's configuration:
  - **Fill in from saved details** (a dropdown of people the portal already
    knows: the student's parents on record, and people from the requester's
    earlier bookings; never ID numbers or ages).
  - **Name**. **Age** (may be optional, never hidden; blank means adult; an
    age under 5 makes the guest an infant). **Gender**.
  - **Relationship**: a strict dropdown for students, free text for employees,
    hidden for clubs and offices.
  - **Citizenship**: Indian (default) or Other. **Other** makes
    **Nationality** (a country list) and **Passport number** required and
    waives Aadhaar.
  - **Aadhaar / ID number** (12 digits if typed).
  - **ID document** upload: JPG, PNG, WEBP or PDF, up to 5 MB.
  - Choosing Father, Mother, Guardian, Grandmother or Grandfather auto-fills
    the name (from the student's academic record, then earlier bookings) and
    the gender, but only into an empty box. A line under the name says where
    it came from, e.g. "As on your academic record (Father)".
- **Infant card:** titled **"Infant N"**. Age is chosen from a list ("below 1
  year" … "4 years") and is required. Name and gender follow the role's
  configuration. Relationship is **always free text**. Citizenship as for
  anyone. No Aadhaar, no ID upload.
- **Student relationship rules:**
  - **Grandmother, Grandfather and Siblings** are greyed out in the dropdown
    ("— needs a parent on this request") until a Mother, Father or Guardian
    is on the request.
  - **Mother, Father, Guardian, Grandmother and Grandfather at most once per
    request**: greyed "— already on this request" on other guests. Siblings
    may repeat.
  - An amber hint above the guest list explains the parent rule.
- Students also see the banner **"Double shared rooms will get first
  preference"**.

**Submission:**

- The client validates first. On failure: the toast "Please fix the
  highlighted fields" and inline errors under each field.
- On success: the toast "Booking submitted — reference XXX" and a redirect to
  My Bookings.
- Server errors come back as a toast.

**Default guest fields by role** (R required, O optional, — hidden):

| Field | Student | Employee | Official | Club (by its advisor) | IAR Office | IAR Student Cell | Manager at desk |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Name | R | R | O | R | R | R | R |
| Age | R | O | O | R | R | R | R |
| Gender | R | R | R | R | R | R | R |
| Relationship | R (dropdown) | O (text) | — | — | — | — | R (dropdown) |
| Aadhaar / ID number | R | O | O | O | O | O | R |
| ID document | R | — | O | O | O | O | R |
| Guest houses | Bageshri only | all | all | all | all | all (alumni → Bageshri) | all |

### 9.6 Approver queues (`/warden`, `/hod`, `/approvals`, `/iar`)

- **One shared component** (`components/review-queue.tsx`) serves all four.
- **Table:** Reference · Requester · Guest House · Check-in · Guests · Rooms ·
  Actions.
- Actions: **Review** opens a dialog titled "Review &lt;ref&gt;" with the full
  booking details, plus **Forward** and **Reject** (a dialog asking for a
  mandatory reason). A quick **Forward** also sits in the row.
- A **lapsed** request shows a red badge, and Forward is disabled.
- **Warden only:**
  - The dialog shows **"Student's record — academic database"**: roll number,
    programme, phone, parents' or guardian's names, hostel.
  - A **Father / Mother / Guardian check table**: the name on record, the
    guests on the request with that relationship, and a verdict: matches,
    partly matches, differs, or not on record.
  - The queue row shows **"✓ Matches record"** or **"⚠ Check names"**.
  - The warden's own record card sits below the queue.
  - A warden with no hostel set gets an explanation instead of a queue.
- **IAR queue:** the dialog shows the alumni ID card.
- ID documents open through authorised, short-lived links.
- Empty queues need an empty state.

### 9.7 Manager Console (`/manager`)

**Page header:** "Guest House Manager Console" with actions:

- **New booking for a guest** (brand), which opens `/book` in on-behalf mode;
- **Meal counts** (only for a guest house that serves meals), which opens
  `/manager/meals`;
- **Settings**, which opens the console.

**Guest-house tabs:** one per guest house, showing "(N rooms)", driven by
`?gh=`. A zero-guest-house state is handled.

**Sections, in order, for the chosen guest house:**

1. **Checking out today** (shared component, also on Reception): Check-out ·
   Reference · Guest · Rooms · Status · Actions. Earliest first, overdue rows
   flagged. Actions: **Mark as Vacated**, **Invoice**.
2. **Cancellation requests:** Reference · Requester · Check-in · Check-out ·
   Rooms · Reason · Actions. **Details** opens a dialog ("Cancellation request
   — &lt;ref&gt;") with **Approve** (rooms freed) and **Decline** (reason).
3. **Incoming requests** (pending the manager): Reference · Requester ·
   Category · Check-in · Check-out · Rooms · Actions. **Official
   (whitelisted) requests are highlighted and sorted first.** Lapsed ones are
   badged. Actions:
   - **Review & Allocate**, or **Review & Approve** for meals-only;
   - **Reject** (reason).
4. **Current occupants** (count badge).
5. **Awaiting check-out** (count badge, destructive colour): past check-out,
   never marked Vacated, still holding rooms.
6. **Checked out — to bill** (count badge): vacated in the last 30 days and
   not paid.
7. **Upcoming stays** (count badge): allocated, not started.

Stays tables 4–7 share one component (`components/stays-table.tsx`):
Reference · Requester · Check-in · Check-out · Assigned rooms · Meals (only
where the house serves meals, e.g. "Breakfast (3 days), Dinner (1 day)" with
the per-day list in a tooltip) · Status · Actions. The actions are:

- **Mark as Occupied** (green). Disabled and labelled "Available from
  check-in" until 2 h before check-in; an **Early check-in** variant exists.
- **Mark as Vacated** (indigo). The two lifecycle buttons deliberately have
  distinct colours because the desk clicks them all day.
- **Manage**, which opens the Manage stay dialog.
- **Invoice**.

**Review & Allocate dialog** (heading "Allocate rooms", or "Approve meals" for
meals-only):

- The full booking details.
- The **room grid** (`components/room-grid.tsx`), a "cinema-style" seat map of
  the guest house's rooms **for this booking's own dates only**. There is no
  date picker; browsing other dates happens on `/availability`.
  - **Green:** free. **Red:** taken, disabled, can't be picked. **Blue:**
    selected.
  - **Hatched:** turnaround (a gap shorter than the 4-hour buffer).
    **Amber:** a soft overlap (≤2 h). The manager may accept either of these.
  - Rooms split into "Double sharing rooms" and "Single rooms" only if both
    types exist (today they don't).
  - A formal occupancy line: "Occupancy: 2 guests (maximum 3 with an extra
    bed)".
- An allocation summary of **four labelled figures:** **Rooms selected** (with
  room numbers), **Guests**, **Capacity of selection** (standard / maximum
  with extra beds), and **Extra beds required** (amber when non-zero).
- A **Refresh** button and a "Loading occupancy…" state.
- **Confirm & Allocate** holds the rooms and approves in one step. It is
  refused while the selection is too small. If someone else took a room
  meanwhile: "Those rooms were just taken for these dates — refresh the grid".
- Copy in this dialog must stay **formal**. The office found "sleeps 2, 3 with
  an extra bed" too informal.

**Manage stay dialog** ("Manage &lt;ref&gt;", manager and caretaker):

- **Extend:** a later check-out, or bring the **check-in forward**. Date box
  plus the time picker; at most 60 days. Refused, with a message, on a clash.
- Approve or decline a requester's **extension request**.
- **Move rooms** (reason, audited). **Release a no-show.** **Cancel**
  (destructive). Change dates or meals. **Reinstate** a cancelled or rejected
  booking.
- The caretaker gets only the extend actions.
- Success toasts such as "Check-in brought forward".

**Invoice dialog** (`components/invoice-dialog.tsx`, manager, caretaker,
developer):

- A title with the invoice state (Not issued / Issued / Paid).
- A **preview of the invoice table**, which is the same layout the PDF prints:
  - Room Charges Subtotal (A), then GST @ 18% on Subtotal (A);
  - Dining Charges Subtotal (B), then GST @ 5% on Subtotal (B);
  - Other Charges (no GST) (C);
  - Grand Total (Including GST).
  - A dining-only invoice has no room section.
- **Edit meal counts** per day.
- **Additional charges** (at most 20): description, **Charged under** (Room
  charges (A) / Dining charges (B) / Other — no GST), quantity, ₹ each, and a
  comment printed under the line. Figures **reprice about 350 ms after typing
  stops**.
- Buttons:
  - **Save draft**. **Preview PDF** (prints the *saved* draft, so it asks
    for Save draft first).
  - **Issue & print**, with a confirm dialog quoting the grand total.
    Disabled while there is a "problem", e.g. no tariff covers a charge.
  - After issue: **Open PDF**, **Mark paid** (cash / UPI with a transaction
    id / bank transfer with a UTR), and **Cancel invoice** (reason; manager
    and developer only).

### 9.8 Kitchen (`/manager/meals`), for the manager and caretaker

- A heading like "Meals for &lt;date&gt;" for a guest house that serves meals.
- **Plates per meal per day**, from confirmed and pending bookings.
- The day's dining bookings.
- **Dining to invoice:** approved meals-only bookings whose meals have begun
  and that have no invoice.
- A **Back to reception** link for the caretaker.

### 9.9 Reception (`/caretaker`)

A deliberately simpler subset of the Manager Console, with the heading "Guest
House Reception":

- Checking out today, Current occupants, Awaiting check-out, Checked out — to
  bill, and Upcoming stays, using the same shared tables.
- **Mark as Occupied** / **Mark as Vacated**, **Manage** (extend only),
  **Invoice**, and a **Meal counts** link.
- No approvals, no allocation, no cancellations, no console.
- The office asked explicitly that reception be kept simple.

### 9.10 Room Availability (`/availability`), every signed-in role

**Controls:** guest-house tabs; a **Day / Week / Month** switch; a date input
with previous / next buttons (stepping one day, week or month); **Today**; and
**Refresh**.

**Charts** (`components/occupancy-chart.tsx`). **Room numbers run across and
time runs down**, in every view:

- **Day view:** a row per hour. The hour column and the room header are
  sticky. The current hour is marked when viewing today.
- **Week and month views:** a row per day. Time also runs down *inside* each
  day's row, so a stay is **one continuous bar** from check-in to check-out.
  Beside each date: "N free" rooms. Today's row is tinted, with a line at the
  current time.
- This orientation was chosen deliberately so that switching views zooms
  rather than rotates the picture.

**Legend:**

- **Booked:** solid red. It is labelled "Booked", **not** "Occupied".
- **Overlap:** solid violet. Two bookings holding one room during an accepted
  changeover.
- **Turnaround:** a light diagonal hatch.
- **Maintenance:** a dark cross-hatch.

Charts can't rely on colour alone. The hatches, labelled bars and a text list
carry the same information.

**Below the chart:**

- A summary line: rooms booked in the period, rooms free for the whole period,
  and rooms booked right now when today is in view.
- A **per-room list**: room number, type, a **Vacant / Partly booked /
  Booked** badge for the period, and each booking period in check-in order.

**Privacy:** only the manager and developer see who booked and why. Everyone
else sees periods, reference ids and statuses. The window is capped at
62 days per request. The previous chart stays on screen, dimmed, while a new
period loads.

### 9.11 Booking History / Approval Log (`/history`), every role

- **Scope follows the role:**
  - Requesters see their own bookings ("Booking History").
  - Approvers see their jurisdiction ("Approval Log"), with a **Handled by me
    / Everything in scope** toggle and a **My decision** column.
  - The desk and the developer see everything.
- **Search box:** bare keywords, or prefixes `ref:` / `id:`, `guest:`, `room:`,
  `by:` / `requester:` / `email:`, `purpose:`, `gh:` / `house:`, `status:`,
  and `"quoted phrases"`. Terms are ANDed and case-insensitive.
- **Status tiles:** Total / Approved / Rejected / In progress / Cancelled.
  Each is a clickable filter. The counts ignore the status filter, so the
  tiles never collapse to zero.
- **Filters:** guest house, requester category (where the scope allows), a
  check-in date range with **two rows of preset chips**, and sort.
  - **Rolling:** Today · Next 7 days · Next 30 days · Last 7 days · Last 30
    days · Last 90 days.
  - **Calendar:** This week · Last week · This month · Last month · This
    quarter · Last quarter · This year · Last year.
  - The lit chip clears on a second click. Each chip's tooltip shows its
    dates.
- **All state lives in the URL** (bookmarkable).
- **Table:** Reference · (Requester) · Guest House · Stay · Status · (My
  decision) · Details. Paged.
- A "truncated" notice appears when the scan cap is hit.
- **Export as CSV** is for everyone. **PDF** is for the manager and developer
  only: a real A4-landscape report. The desk also gets a **monthly collections
  CSV**.
- The desk gets an **Invoice** button on any checked-out stay or approved
  dining booking, however old.

### 9.12 The console (`/admin`)

**Console lock:**

- A password screen (`components/admin/admin-lock.tsx`) shows before any
  section. The default password is `0000`, with a warning while it is still
  the default.
- An unlock lasts 8 hours. There are 6 attempts per 15 minutes.
- **The developer also needs a TOTP second factor.** They must re-prove it
  within 10 minutes before role changes, Settings changes and deletes.

**Layout:** title "Developer Console" or "Guest House Console", a blurb, then
a row of section tabs.

| Section | Path | Who | What it contains |
| --- | --- | --- | --- |
| Users & Roles | `/admin/users` | M, D | A table of accounts. Create, edit and delete. Role (any of 12; a manager can't create or edit a developer), hostel, department or club, roll number, **LDAP username**, unit, faculty/staff. **Import LDAP usernames** (paste `email, username` lines; all or nothing). You can't delete yourself or drop your own developer role |
| Departments & Clubs | `/admin/units` | M, D | A units tree: departments, councils, clubs, offices. Parent, head, acting head, office class, whose HOD approves. A **Faculty Advisors** table: each council or club's advisor (e.g. "Faculty Advisor of Cultural Affairs Council") and **secretary's mailbox** ("Secretary's mailbox for Petrichor", with Save and Clear) |
| Projects | `/admin/projects` | M, D | Project number, title, PI, active. **Paste import** |
| Tariffs & Invoicing | `/admin/billing` | M, D | An effective-dated rates table with an add form. Rates in force can't be edited or deleted. **Invoice settings:** numbering prefix and width, day basis and grace, "Rates include GST", GST % on rooms and on food, SAC codes, GSTIN, Accounts email, bank details, footer contact |
| Guest Houses & Rooms | `/admin/guest-houses` | M, D | Create, rename and delete guest houses (typed confirmation). **Serves meals** switch. Rooms: add one, or **bulk** ("B-101 to B-120", ≤200); activate or deactivate; delete (blocked if ever allocated). **Maintenance blocks** |
| Form Builder | `/admin/forms` | M, D | Per requester role: allowed guest houses; each guest field's mode (required / optional / hidden; age can't be hidden); relationship style (dropdown with editable options, or free text); the **parent rule** (which options unlock, which are restricted); **One of each**; alumni-card mode; banner text; **custom fields** (text, textarea, number, date, select, checkbox). **Reset to spec defaults** |
| Email Templates | `/admin/mail-templates` | M, D | Per mail event: subject, intro, outro, extra CC, on/off |
| Mail Outbox | `/admin/mail` | M, D | Queued, sent and failed mail with the errors; requeue; send a test message |
| Security | `/admin/security` | M, D | Own sessions (revoke); developer 2FA setup and recovery codes; the office's **DPDP data requests** |
| All Bookings | `/admin/bookings` | D | Every booking with status filters. An audit-logged **force status** (remark required). **Hard delete** (typed confirmation) |
| Settings | `/admin/settings` | D | The rules (§10): capacity, booking window, stay cap, turnaround buffer, no-show release, meal windows, the **debitable-heads grid** (category × head, for room and for dining; forbidden cells greyed), privacy retention, **Hostels** list, **Official email whitelist** |
| Audit Log | `/admin/audit` | D | The security audit trail |
| Console Access | `/admin/access` | D | Change the console password |

**Settings refuse changes that would break live data, and name what would
break**, for example a capacity below a waiting party, or a buffer that makes
two stays clash. Nothing is silently adjusted. The UI has to show that list.

**Destructive actions** use `components/ui/confirm-dialog.tsx`. It lists what
will be lost and, for guest houses, users and bookings, makes the operator
**type the name, email or reference id**. There is no `window.confirm`
anywhere.

### 9.13 Documents, PDFs, email

- **Invoice PDF:** drawn on the server to the office's template, with the
  institute logo and wordmark and a Hindi address line (as an image). Bank
  details on every page, "Page n of m". This is a print document, not part of
  the web UI.
- **History PDF:** A4 landscape, drawn on the client with jsPDF: a branded
  header, a summary band, a 12-column table, colour-coded statuses.
- **Emails:** HTML tables with inline styles, no external images, never a link
  to an ID document (they point at the portal). They still carry the old
  amber header.

### 9.14 The shared booking-details view

`components/booking-details.tsx` is used by the requester, every approver and
the manager. It shows:

- the requester and category, booking type, service type, debitable head (and
  project, sub-head or special fund), office approval, and on-behalf-of;
- the guest house, stay dates and times, and purpose;
- the **party** ("3 guests, with infant(s)"), room by room with each guest;
- ID documents (links), alumni details and card, custom-field answers, Copy to;
- **Meals by day** (a table with head counts), only where the guest house
  serves meals;
- assigned rooms, the rejection reason, a pending extension request;
- the **status log** (who, when, from which status to which, remarks).

---

## 10. Rules and numbers the UI shows or enforces

The server enforces every one of these. The UI should *express* them: limits
on inputs, disabled states with reasons, and clear messages.

| Rule | Value | Notes |
| --- | --- | --- |
| Advance booking window | Check-in ≤ **1 month** ahead | Setting. Official, manager and developer exempt |
| Longest stay | **14 nights** | Setting (0 = no cap). Official, manager, developer and the Director's office exempt |
| Check-in in the future | Yes | Not for meals-only |
| Check-out after check-in | Yes | The error names both times as read and points at the AM/PM dropdowns if they are on the same day |
| Rooms per request | 1–10 | |
| Per room card | ≤ 4 people, ≤ 3 needing a bed, ≤ 3 infants | Settings |
| At allocation | Double: 2 beds (3 with an extra bed); single: 1 (2) | Settings |
| Infant | Age < 5 | No bed, no ID |
| Turnaround buffer | 4 h | Setting (0 = off) |
| Accepted overlap / early check-in | ≤ 2 h | |
| Meal windows | Breakfast 07:30–09:30 · Lunch 12:30–14:00 · Dinner 19:30–21:00 | Settings. A day offers only meals served during the stay |
| Meal notice | A meal must be booked **before the previous meal finishes being served** | Lunch before breakfast ends; dinner before lunch ends; tomorrow's breakfast before tonight's dinner ends |
| Meals-only guests | 1–100 | |
| Purpose | ≥ 5 characters | |
| Copy to | ≤ 25 addresses | |
| Uploads | JPG / PNG / WEBP / PDF, ≤ 5 MB | |
| Aadhaar | 12 digits if typed | Shown as the last 4 digits afterwards |
| Passport | 5–20 letters and digits | Required with nationality for non-Indian citizens |
| Rejection | A reason is always required | |
| Extend / earlier check-in | ≤ 60 days at a time | |
| "Checked out — to bill" | Vacated in the last 30 days, unpaid | Older ones are billed from the Approval Log |
| Availability window | ≤ 62 days per request | |
| Invoice GST | 18% on rooms and extra beds, 5% on food, each on its own subtotal. "Other" charges carry no GST | Rates are GST-inclusive by default |
| Money | Indian format, **₹1,23,456.00** | |
| Time | **Always IST (Asia/Kolkata)** | Never the browser's zone |
| Sessions | 30 min idle / 12 h absolute | |

**Debitable heads offered (defaults, all editable in Settings):**

| Who | Room | Dining |
| --- | --- | --- |
| Faculty, official | Department, Project, PDF, Special Funds (**never Institute Grant**) | Department, PDF, Personal, Special Funds |
| Non-teaching staff, official | Department, Special Funds | same |
| Officer office (Director, Registrar) | Institute Grant, Special Funds | same |
| Department office | Department, Special Funds | same |
| Club (via its advisor) | Department, Special Funds | — |
| Student | Personal Funds (**never Special Funds**) | — |
| Any personal booking | Personal Funds, Special Funds | same |
| On behalf of an alumnus | Institute Grant, Personal Funds, Special Funds | Personal Funds, Special Funds |
| Manager at the desk | Everything | Everything but Project |

**Who may book meals only:** employee, official, IAR Office, manager.

---

## 11. The current visual design (as of 26 Sep 2026) and how it got there

This is the state being replaced. It is recorded here so the new design can be
a deliberate change rather than an accidental one.

### 11.1 Design tokens (`app/globals.css`)

| Token | Hex | Use |
| --- | --- | --- |
| `--ink` | `#1A1A1A` | Primary; the portal nav bar, footers, headings |
| `--ink-soft` | `#2B2926` | Hover on ink |
| `--vermilion` | `#E94C26` | Rules, icons, the active-nav bar, focus ring. **Never behind white text** (3.8:1) |
| `--vermilion-deep` | `#C43C1C` | **Buttons with white text** (5.2:1), the `brand` button |
| `--vermilion-hover` | `#A8331A` | Hover |
| `--vermilion-soft` | `#FDF0EB` | Tint |
| `--saffron` | `#F5A300` | The emblem's colour: labels on ink. Carries ink text, never white |
| `--body-text` | `#4A4541` | Paragraphs |
| `--band` | `#F3F1EB` | Mastheads, fills, muted/secondary/accent |
| `--notice` / `--notice-border` | `#FFF7E6` / `#EFD7A3` | Notice boxes |
| `--border` / `--border-strong` | `#E5E1DA` / `#CEC8BF` | Hairlines / inputs |
| `--muted-foreground` | `#6B655F` | Secondary text |
| `--destructive` | `#DC2626` | Reject, delete |
| `--radius` | 4px (cards and photos 8px on the public site; buttons 6px) | |

- These colours come from **iitpkd.ac.in's own theme CSS**: vermilion links
  and buttons, a charcoal bar, Source Serif headings. The emblem is saffron.
- `--primary` is **ink**, not vermilion. A vermilion primary read as a second
  red beside the Reject button.
- There is one `brand` button variant (vermilion-deep) for the page's single
  call to action.
- A `.dark` theme is defined but switched on nowhere.
- **Chart utilities:** `bg-turnaround` (light grey with a 135° hatch),
  `bg-maintenance` (dark cross-hatch), `bg-overlap` (violet `#7C3AED`).
  Booked is red; the "now" marker is ink.
- **Fonts:** Source Serif 4 for `h1`–`h4`; Source Sans 3 for everything else.
- **No shadows, no gradients** anywhere today.
- **The whole portal is restyled through the shadcn tokens**, not page by
  page. Changing a token restyles every component consistently.

### 11.2 Design history: the owner's feedback, in order

| Date | Look | Owner's reaction / reason for change |
| --- | --- | --- |
| Aug–19 Sep | Amber on off-white, copied from dashboard.iitpkd.ac.in | White-on-amber failed contrast |
| 19 Sep | A designer's handoff: navy `#12284C` / gold `#E8A317`, 3px corners | Colours appear nowhere on the institute's site |
| 21 Sep (`ui` branch, never merged) | Vermilion with pills, shadows, gradients, frosted glass, bento grid | Abandoned: the "AI look" |
| 26 Sep, morning | Institute palette; editorial page full of computed facts and figures, hairline rules | "Looks ass", "too dull and dead"; wanted clean, professional, impressive, **not AI-generated-looking**, in the IITPKD palette |
| 26 Sep, afternoon | Photo-led: full-screen hero, photo banners on every page | "Too plain / too mehh" before this; after: **no figures on the landing page, no photo captions, no "see them on the map", no instructions or meal times on home, and never show backend logic (who the users are, who approves whom) publicly** |
| 26 Sep, evening (current) | Clean and institutional, modelled on IIT Madras's Taramani Guest House site: split hero, contained photos, bordered cards | Full-screen photos were "so weird"; photos must be **contained in the layout** |

On the portal side: the **large New room booking / Meal booking tiles** on My
Bookings exist because small header buttons were being missed.

### 11.3 Public-site content rules (owner's standing instructions; tests enforce the first)

1. **Never expose the portal's internals publicly.** No requester categories,
   no approval chains, no role names (Assistant Warden, HOD, IAR…). The public
   copy speaks of "members of the institute", "the person hosting them" and
   "the Guest House Office". **`tests/public-site.test.ts` fails if any role
   label appears in the public copy.**
2. **The home page is visual and light.** No figures (room counts, "1 month",
   "14 nights"), no meal times, no instructions, no photo captions.
3. **Rules live on `/guidelines`.** Any sentence stating a rule the portal
   enforces is **rendered from `lib/` and Settings** (`lib/site-content.ts`),
   never typed as literal copy, so it can't drift from the real rule.
4. **Never place a photograph so it reads as one particular guest house.**
   Nobody has confirmed which house each photo shows.
5. **No guest-house name is hardcoded in a component.** They come from the
   store.

---

## 12. Assets available

- **Photos:** `public/site/photos/`, 14 files, 2000px, metadata stripped:
  `bathroom`, `bedroom`, `bedroom-wardrobe`, `common-hall`, `dressing-table`,
  `exterior-block`, `exterior-courtyard`, `exterior-gazebo`,
  `exterior-walkway`, `meeting-hall`, `suite-kitchenette`,
  `suite-living-dining`, `suite-living-room`, `suite-lounge` (all `.jpg`).
  - Originals (6000×4000, ~180 MB) are in `Images/`, gitignored. Resize them
    **one per process** with PIL's `draft()`, or the process is OOM-killed.
  - The photo registry is `PHOTOS`, `HOME_PHOTOS`, `SIGN_IN_PHOTOS` and
    `GALLERY_SECTIONS` in `lib/site.ts`.
- **Logos:**
  - `public/iitpkd-logo.png`: the emblem only. Used in the lockup and as the
    favicon (`app/icon.png`).
  - `public/IITPKD_NEW_LOGO.png`: the stacked logo. Unused now; its own text
    renders about 8px tall at header size.
  - `public/iitpkd-web-logo.jpg`: a wide banner on white. Unused.
  - `public/invoice/*`: the invoice artwork.
- **Map pins:** `GUEST_HOUSE_LOCATIONS` in `lib/site.ts`.
  - Hamsanandi: 10.7984359, 76.7299972.
  - Bageshri: 10.8063107, 76.726681.
  - The embed URL is `https://maps.google.com/maps?q=<name>&ll=<lat,lng>&z=17&output=embed`.
- **Editable site values** (`lib/site.ts`): `GUEST_HOUSE_CONTACT`, `MRBS_URL`,
  `INSTITUTE_WEBSITE`, `HOW_TO_REACH_URL`, `SITE_LINKS`, `GUIDELINES_PDF_URL`,
  `GUIDELINES_PROVISIONAL`. Run `grep -rn "TODO(site)"` to list what the
  office still has to confirm: the house rules, amenities, photo attribution,
  front-office hours and the guidelines PDF.

---

## 13. Constraints any new UI must respect

### 13.1 Must keep: behaviour, data and security

- **Don't move logic into components.** Rules live in `lib/`. Components call
  the pure helpers (`addGuestBlockedReason`, `occupancyNotStartedError`,
  `describeCapacity`, `stayPhase`, `displayStatus`, `invoiceTable`,
  `bucketOccupancyByDay` and so on) and render what they return. Server
  actions stay the only writers.
- **Every page keeps its server-side guard** (`getCurrentUser()` / role check /
  `redirect(SIGN_IN_PATH)`). Signed-out users go to **`/sign-in`**, never
  `/`.
- **Institute time everywhere:**
  - Format through `lib/format.ts` / `lib/tz.ts` (`formatDateTime`,
    `formatDate`, `formatInstitute*`).
  - **Never** use `toLocaleString()`, date-fns `format` on an instant,
    `getHours()`, or `new Date("yyyy-MM-ddTHH:mm")`.
  - Never use `toISOString().slice(0,10)` for "today". That is UTC, which is
    the previous day in IST before 05:30.
- **No `datetime-local` or `type="time"` inputs.** Firefox renders them as
  type-only fields that users read as broken. Use `components/ui/time-select.tsx`
  (hour / minute / AM-PM dropdowns) with its read-back line. Keep the **"Your
  stay"** summary: the two time fields default to opposite AM/PM, and people
  changing only the hour submitted 9 PM → 10 AM by mistake.
- **No number input bound to a coerced value.** Use
  `components/ui/quantity-input.tsx` (keeps the raw string, so the box can be
  cleared and retyped; −/+ buttons; `inputMode="numeric"`).
- **Dropdowns inside react-hook-form are native `<select>`**
  (`components/ui/native-select.tsx`). Radix Select doesn't work with
  `register()` without a Controller per field. The registry has no `form`
  component, so field errors are rendered by hand (`FieldError`).
- **One option is not a dropdown.** Where a role has exactly one guest house,
  **state it as text and carry the id in a hidden registered input**, computed
  before `useForm`. A disabled one-option `<select>` once broke alumni
  bookings.
- **Never grey out a guest's own current relationship.** That silently clears
  the box.
- **The booking form sends `parsed.data`**, which the server re-parses with the
  same schema. Don't change what is sent.
- **The form is keyed by the requester** (`/book?for=`), so switching "Booking
  as" remounts it.
- **The room grid reads occupancy for the booking's own dates only.** No date
  picker in the allocation dialog. Occupied rooms are disabled, not merely red.
  The grid refetches when `occupancyVersion` changes.
- **The availability charts keep rooms across and time down** in every view.
  Red means "Booked", not "Occupied". Overlap is plain violet. Turnaround and
  maintenance are hatched, so the chart doesn't rely on colour alone.
- **Guest identity on availability** is shown only to the manager and developer.
  The action strips it; the UI must not re-derive it.
- **ID numbers show as the last 4 digits only.** Documents open through
  `/api/documents` links only. The academic record is never persisted
  client-side.
- **Destructive actions keep typed confirmation** (`confirm-dialog.tsx`).
- **Rejection always requires a reason.** Cancellation requests require one
  too.
- **Shared components stay shared**, so the manager's and caretaker's consoles
  can't drift: `stays-table.tsx`, `checkouts-today.tsx`, `occupancy-chart.tsx`,
  `booking-details.tsx`, `review-queue.tsx`, `status-badge.tsx`.
- **Reception stays a subset of the manager's console,** and simple.
- **Public site:** the content rules in §11.3.

### 13.2 Must keep: technical

- **Content Security Policy** (`proxy.ts`):
  - Scripts need the per-request nonce (`strict-dynamic`). **No third-party
    script CDNs.**
  - Styles: `'self' 'unsafe-inline'`.
  - Fonts: `'self'`. Self-host with `next/font`; no Google Fonts `<link>`.
  - Images: `'self' data: blob:`. **No remote images.**
  - Frames: only Google Maps.
  - `connect-src`: self and Supabase.

  Any new library must run inside this, or the CSP must be widened
  deliberately.
- **React Compiler lint is strict:**
  - no reading refs or calling `setState` during render;
  - no `watch()` from react-hook-form in render (use `useWatch`);
  - no synchronous `setState` in an effect body.

  `npm run lint` must stay clean.
- **Tailwind v4** (CSS-first). **shadcn** with this registry:
  `init -b radix -p nova --no-monorepo`.
- **Responsive to 320px:**
  - no page-level horizontal scroll (wide tables and charts scroll inside
    their own `overflow-x-auto`);
  - exactly **one `<h1>` per page**;
  - grids as `repeat(auto-fit|auto-fill, minmax(min(Npx,100%),1fr))`;
  - never size anything with `100vw` (it overflows by the scrollbar width).

  The e2e suite checks every public page at 320px.
- **Accessibility:**
  - the active nav item carries `aria-current="page"`;
  - the map tabs are WAI-ARIA tabs;
  - charts aren't colour-only;
  - focus rings are visible;
  - white text only where contrast is at least 4.5:1.
- **Next.js 16 specifics:** read `node_modules/next/dist/docs/` before using an
  API. Moving a route can leave stale `.next/dev/types`
  (`rm -rf .next/dev/types`).

### 13.3 End-to-end tests depend on these names

A redesign must keep these accessible names, or update `e2e/` in the same
change. The Playwright suite drives the real UI with them:

- **Sign-in:** labels "LDAP username" and "LDAP password"; button "Sign in";
  link "Mock Authentication" / "Sign in with Google"; heading "Mock
  Authentication" (h1).
- **Booking form:**
  - heading matching /New Booking/;
  - navigation "Booking as" with links "Yourself" and "Faculty Advisor — …";
  - button "Submit booking request"; button "Add infant";
  - text "Room 1", /^Infant 1/, "2 guests + 2 infants";
  - text "As on your academic record (Father)";
  - text /Meals from the .* kitchen/;
  - text /Facing trouble booking\?/;
  - text "Ask your Faculty Advisor to book".
- **Booking form inputs by `name`:** `guest_house_id`, `booking_type`,
  `office_approval`, `debit_head`, `check_in_date`, `check_out_date`,
  `purpose_of_visit`, `privacy_consent`, `rooms.N.guests.N.<field>`, plus file
  inputs.
- **Time pickers:** labels "&lt;label&gt; hour", "&lt;label&gt; minute" and
  "&lt;label&gt; AM or PM".
- **My Bookings:** links /New room booking/ and /Meal booking/.
- **Queues:** buttons /Review/ and "Forward"; text "✓ Matches record",
  "Matches the record", "Student's record — academic database"; heading "HOD
  Queue".
- **Manager:**
  - tablist "Guest house" with tabs "Hamsanandi" and "Bageshri";
  - buttons /Review & Allocate/ and /Confirm & Allocate/;
  - headings /Allocate rooms/ and /Approve meals/;
  - text "Loading occupancy…";
  - buttons /Mark as Occupied|Early check-in/ and /Manage/;
  - text "Check-in brought forward";
  - heading /Checked out — to bill/;
  - link "Meal counts".
- **Invoice:**
  - button "Invoice" (exact) and "Issue & print";
  - text "Not issued", /Issued/, /Paid/;
  - text "GST @ 18% on Subtotal (A)" and "Other Charges (no GST)";
  - text matching `₹\s?[\d,]+\.\d{2}`;
  - `getByRole("dialog")`.
- **Reception:** heading "Guest House Reception"; link "Back to reception";
  heading /^Meals for /.
- **Console:** heading "Faculty Advisors"; labels "Faculty Advisor of
  &lt;unit&gt;" and "Secretary's mailbox for &lt;unit&gt;"; button "Save
  secretary's mailbox for &lt;unit&gt;"; the related toasts.
- **Public:** links /Open MRBS/, /Open in Google Maps/ and /IIT Palakkad
  website/; heading "Your rights"; text /Version \d{4}-\d{2}-\d{2}/;
  `getByRole("heading", { level: 1 })` (one per page).

### 13.4 Free to change

- Layout, navigation pattern (top bar, sidebar, tabs), page composition,
  typography, colour, spacing, radius, iconography and motion.
- Any component's markup and styling, as long as §13.1–13.3 hold.
- The console's section navigation, and how dialogs are presented (dialog,
  sheet, drawer, page).
- The empty, loading and error states. Most are minimal today.
- The email visual template (the old amber header is a known loose end).
- Dark mode (tokens exist; nothing switches it on).

---

## 14. Code map for the UI layer

| Area | Files |
| --- | --- |
| Root layout, fonts, metadata | `app/layout.tsx`, `app/globals.css` |
| Public site pages | `app/(site)/{page,book-room,book-meal,guidelines,gallery,contact,privacy,sign-in,mock-login}/page.tsx`, `app/(site)/layout.tsx` |
| Public site components | `components/site/brand.tsx` (lockup), `site-header.tsx`, `site-chrome.tsx` (footer), `site-nav.tsx` (`NavBar`, `tone="dark"` in the portal, `"light"` on the site), `site-ui.tsx` (`Container`, `Label`, `PageTitle`, `PageMasthead`, `SectionHead`, `ArrowLink`, `BulletList`, `siteButton.*`, `SitePhotoFrame`), `guest-house-map.tsx`, `sign-in-panel.tsx` |
| Public content | `lib/site.ts` (editable values, photos, pins), `lib/site-content.ts` (amenities, booking steps, guideline sections, meal timetable), `lib/site-data.ts` (guest houses for the site) |
| Sign-in | `components/login-form.tsx`, `app/actions/auth.ts` |
| Portal shell | `app/(portal)/layout.tsx`, `components/page-header.tsx`, `components/live-updates.tsx` |
| My Bookings | `app/(portal)/dashboard/page.tsx` (`BookingDoor` tiles), `components/my-bookings.tsx`, `components/my-data.tsx` |
| New Booking | `app/(portal)/book/page.tsx`, `components/booking-form.tsx` (~2,400 lines), `components/academic-details.tsx`, `components/booking-availability.tsx`, `components/meal-plan-grid.tsx`, `components/meal-dates-picker.tsx` |
| Shared booking view | `components/booking-details.tsx`, `components/status-badge.tsx` |
| Approver queues | `app/(portal)/{warden,hod,approvals,iar}/page.tsx`, `components/review-queue.tsx`, `components/student-record-check.tsx` |
| Manager | `app/(portal)/manager/page.tsx`, `components/manager-queue.tsx`, `components/room-grid.tsx`, `components/manage-stay-dialog.tsx`, `components/invoice-dialog.tsx`, `app/(portal)/manager/meals/page.tsx` |
| Reception | `app/(portal)/caretaker/page.tsx`, `components/caretaker-console.tsx`, `components/stays-table.tsx`, `components/checkouts-today.tsx` |
| Availability | `app/(portal)/availability/page.tsx`, `components/availability-grid.tsx`, `components/occupancy-chart.tsx` |
| History | `app/(portal)/history/page.tsx`, `components/booking-history.tsx`, `components/collections-export.tsx`, `lib/report-pdf.ts` |
| Console | `app/(portal)/admin/layout.tsx` (lock + section tabs), `app/(portal)/admin/*/page.tsx`, `components/admin/*` (`users-manager`, `units-manager`, `projects-manager`, `billing-manager`, `guest-houses-manager`, `form-config-editor`, `mail-template-editor`, `mail-outbox`, `security-manager`, `bookings-manager`, `settings-manager`, `audit-log`, `console-access`, `admin-lock`) |
| UI primitives | `components/ui/`: shadcn `alert`, `badge`, `button` (with `brand`), `calendar`, `card`, `dialog`, `input`, `label`, `popover`, `scroll-area`, `select`, `separator`, `sonner`, `table`, `tabs`, `textarea`; local `native-select`, `switch` (native checkbox), `time-select`, `quantity-input`, `confirm-dialog` |
| Labels and enums | `lib/types.ts` (`STATUS_LABELS`, `ROLE_LABELS`, `BOOKING_TYPE_LABELS`, `SERVICE_TYPE_LABELS`, `DEBIT_HEAD_LABELS`, `MEAL_PREFERENCE_LABELS`, `CITIZENSHIP_LABELS`) |
| Who sees what | `lib/access.ts` (`CONSOLE_SECTIONS`, desk and invoice powers), `lib/routes.ts` (`homeForRole`, `SIGN_IN_PATH`), `lib/workflow.ts` (`canReview`, `historyScope`, `stayPhase`, `displayStatus`) |

---

## 15. Running it and looking at every role

```bash
export NVM_DIR="$HOME/.nvm" && . "$NVM_DIR/nvm.sh" && nvm use 20   # Next 16 needs ≥ 20.9; the system default is 18
npm install
NEXT_PUBLIC_SUPABASE_URL= npm run dev     # mock store (.local-db.json); safe to write
# http://localhost:3000 → Sign in → "Mock Authentication" → click any persona
```

- `.env.local` points at a **hosted** Supabase project. Starting with an empty
  `NEXT_PUBLIC_SUPABASE_URL` selects the local mock store instead. Delete
  `.local-db.json` to reset the demo data.
- **Personas** on the Mock Authentication page:
  - two students (Malhar and Saveri hostels);
  - an employee (Priya);
  - Dr. Arun Prasad (faculty, Faculty Advisor of the Cultural Affairs Council
    and Petrichor);
  - a whitelisted official (`admin@`);
  - the Petrichor club; the Cultural Affairs Council (`sec_arts@`);
  - the IAR Student Cell; the IAR Office;
  - two Assistant Wardens;
  - the GH Manager (`guesthouse@`); the caretaker (`gh.reception@`);
  - the developer.

  Six demo bookings put something in every queue: DM001 at the warden, DM002
  at the legacy club stage, DM003 at the IAR Office, DM004 and DM006 (meals
  only) at the manager, DM005 approved. Dummy LDAP logins are in
  `.memories/05-credentials-and-security.md`.
- The console password is `0000`. The developer also needs TOTP (see the
  same file).
- **Checks before finishing any change:** `npm run lint`, `npm run typecheck`,
  `npm test`, and `npm run build`. **Building kills a running `next dev`**,
  because both use `.next/`. Then `npm run test:e2e`, which runs against a
  production build on the mock store: build with `NEXT_PUBLIC_SUPABASE_URL=`
  empty first.

---

## 16. Open and unconfirmed items that touch the UI

- **House rules** (Guidelines §7–8) and the **amenities** list are
  placeholders. The Guidelines page shows "Provisional edition" until the
  office confirms them.
- **Photo attribution** is unknown (see §11.3 rule 4). The front-office hours
  and the guidelines PDF are not supplied.
- **Emails** still use the old amber header.
- **The `ui` branch** holds the abandoned 21 Sep redesign. It has diverged
  (about 30 conflicting files) and is **not** to be merged. All work happens
  on `main`.
- **The accessibility audit** isn't done: there's been no screen-reader pass
  on the room grids, and focus order through the long booking form hasn't
  been checked.
- Features likely to be asked for next: requester-side editing of a booking
  (today they cancel and resubmit), per-guest-house managers, attachments on
  rejection.
