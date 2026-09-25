# Settings and defaults — every configurable value

Everything the office can change without a developer, what it is set to out
of the box, who may change it and where — and then the values that are fixed
in code, so nobody goes looking for a Setting that does not exist. **Checked
against the code on 24 Sep 2026** (`lib/settings.ts` `DEFAULT_RULES`,
`lib/debit-heads.ts`, `lib/access.ts`, `app/actions/settings.ts`).

What the office still has to fill in before go-live is at the end of
[24-deployment-runbook.md](24-deployment-runbook.md#settings-the-office-must-fill-in).

---

## How Settings work

- **Scalar groups are jsonb rows** in `app_settings` (`rules.capacity`,
  `rules.booking`, `rules.meals`, `rules.debit`, `rules.invoice`,
  `rules.privacy`), merged over `DEFAULT_RULES` on read — a row saved before a
  field existed still reads. **Lists are tables**: `hostels`,
  `official_email_whitelist`.
- Read with `getRules()` / `getOfficialEmails()` / `getHostels()`
  (`lib/settings-server.ts`, cached per request, **fall back to the defaults
  on any error**). Rule functions take the rules as a parameter.
- **Refuse, don't adjust** (`lib/settings-impact.ts`): a change that would
  break a live booking or lock out an account — a capacity below a pending
  party, meal times that strand a booked meal, removing a whitelisted address
  in use, a buffer that makes two stays clash — is refused, naming what it
  would break. Nothing is silently adjusted.
- **Every change is audited** (`security_audit`) after it succeeds; a
  developer proves their second factor again first.

---

## Console → Settings (developer only)

### Room capacity — `rules.capacity`

| Setting | Default | Checked |
| --- | --- | --- |
| Double sharing: own beds / with an extra bed | 2 / 3 | At allocation |
| Single: own beds / with an extra bed | 1 / 2 | At allocation |
| People per room card (`max_occupants_per_room`) | **4** | At submission, and by the `booking_guests` trigger |
| Guests needing a bed per room card (`max_guests_per_room`) | **3** | same |
| Infants per room card (`max_infants_per_room`) | **3** | same |

So a room card holds 3+1, 2+2 or 1+3 (guests + infants). Infants are guests
aged under 5 (code constant). Both guest houses are all double sharing.

### Booking rules — `rules.booking`

| Setting | Default | Notes |
| --- | --- | --- |
| Advance booking window (`advance_booking_months`) | **1 month** | Check-in only. Official, GH Manager, developer exempt |
| Longest stay (`max_stay_nights`) | **14 nights** | 0 = no limit. Official, GH Manager, developer, `director.office@` exempt |
| Turnaround buffer (`buffer_minutes`) | **240 (4 h)** | Least gap between one stay's check-out and the next check-in on a room; 0 = off. Changing it rebuilds every hold, refused if two stays would clash |
| No-show release (`no_show_release_hours`) | **0 (off)** | Hours after check-in at which an unclaimed approved stay is released by the daily cron (mail to the requester) |

### Meal serving windows — `rules.meals`

| Meal | Default window | Decides |
| --- | --- | --- |
| Breakfast | 07:30–09:30 | Which days offer it; lunch can be booked until it ends |
| Lunch | 12:30–14:00 | …; dinner can be booked until it ends |
| Dinner | 19:30–21:00 | …; tomorrow's breakfast can be booked until it ends |

Which guest houses serve meals at all is a guest-house switch (below), not a
Setting.

### Debitable heads — `rules.debit`

A grid: requester category × head, separately for **room** (and room + meals)
and **dining** (meals only). Defaults:

| Category | Room | Dining |
| --- | --- | --- |
| Faculty (official) | Department, Project, PDF, Special Funds | Department, PDF, Personal, Special Funds |
| Non-teaching staff (official) | Department, Special Funds | Department, Special Funds |
| Officer offices (Director, Registrar, Deans) | Institute Grant, Special Funds | Institute Grant, Special Funds |
| Department offices | Department, Special Funds | Department, Special Funds |
| Student clubs | Department, Special Funds | Department, Special Funds |
| Students | Personal Funds | Personal Funds |
| IAR Student Cell (official — no longer used) | Institute Grant, Special Funds | Institute Grant, Special Funds |
| On behalf of an alumnus | Institute Grant, Personal Funds, Special Funds | Personal Funds, Special Funds |
| Any personal booking (not a student's) | Personal Funds, Special Funds | Personal Funds, Special Funds |
| GH Manager at the desk | Department, Institute Grant, PDF, Personal, Project, Special Funds | the same less Project |

- **Dining can never be charged to a Project** (schema).
- **Floors** (`FORBIDDEN_DEBIT_HEADS`, greyed in the grid, stripped on read,
  refused on save): **faculty never Institute Grant**; **students never
  Special Funds** (since 25 Sep 2026 Special Funds is for everyone else,
  personal and alumni bookings included).
- The category: a **student** is always *student* (checked first, 25 Sep
  2026 — a student's booking is personal, and used to fall into *personal*);
  otherwise personal → *personal*, on behalf of an alumnus → *alumni*, else
  the account — faculty or staff by `profiles.staff_category` (none =
  faculty), an office by its unit's `office_class` (none = department office).
- Special Funds is stored as `special_budget`. A saved Settings row gains it
  once per revision (`upgradeDebitRules`): revision 2 (24 Sep) for the
  official categories, revision 3 (25 Sep) for personal, alumni and the IAR
  Student Cell. After that an untick sticks.
- Legacy heads (Alumni Fund, Student Fund, Hostel Funds) stay valid for stored
  rows and can be ticked on here, but no default offers them.

### Privacy — `rules.privacy`

| Setting | Default | Notes |
| --- | --- | --- |
| ID retention (`id_retention_days`) | **365** days after the stay ends | Identity numbers and ID documents erased nightly by `/api/mail/cron` |
| Audit retention (`audit_retention_days`) | **180** days | Cannot go below 180 (CERT-In); the database refuses too |

### Lists

| List | Default | Notes |
| --- | --- | --- |
| **Hostels** | Malhar, Saveri (demo) | `profiles.hostel_name` references it: a rename moves everyone, a hostel in use cannot be removed. Wardens are scoped by it |
| **Official email whitelist** | `admin@`, `director.office@`, `registrar@iitpkd.ac.in` (`DEFAULT_OFFICIAL_EMAILS`); both demo seeds also add `cse.office@` | Who may submit as the `official` role. Removing an address an official account uses is refused |

---

## Console → Tariffs & Invoicing (manager and developer)

### Rates — the `tariffs` table

Effective-dated; the most specific row in force wins (guest house > requester
role > booking type > room type, then the latest). A rate in force cannot be
edited or deleted — a new price is a new row. Seeded from the tariff sheet:

| Item | Rate | Scope |
| --- | --- | --- |
| Room, Bageshri | ₹1,000 / room / day | (₹750 before 23 Sep 2026) |
| Room, Hamsanandi | ₹2,000 / room / day | |
| Room, Hamsanandi, `official` role | ₹4,000 / room / day | "government officers" |
| Breakfast / Lunch / Dinner | ₹80 / ₹120 / ₹100 per head | |
| Meals for students | ₹0 | requester role `student` |
| Meals on alumni bookings | ₹0 | booking type `alumni` |
| **Extra bed** | **none seeded** | An invoice with an extra bed cannot be issued until one is added |

### Invoice settings — `rules.invoice`

| Setting | Default |
| --- | --- |
| Serial | `GH/<financial year>/0001` — prefix `GH`, 4 digits, restarts every 1 April |
| Day basis / grace | Calendar **nights**; grace 4 h (used by the 24-hour basis) |
| Rates include GST | **Yes** — the grand total is the rates; taxable value and CGST/SGST are backed out |
| GST | **Rooms and extra beds 18%, food 5%**, each on its own subtotal (25 Sep 2026; the ₹7,500 slab is gone — a saved row is upgraded once, `upgradeInvoiceRules`, revision 2). Additional charges take their section's rate; "other" none. SAC 996311 (rooms), 996331 (food). Intra-state: half CGST, half SGST |
| GSTIN | `32AAAAI9910J1ZR` (from the office's template — to confirm) |
| Accounts email | **empty** — nothing is mailed to Accounts until it is set |
| Bank | Guest house IIT PKD · SBI · A/c 39938270076 · IFSC SBIN0006640 · Kanjikode branch |
| Contact on the invoice | Kanjikode West, Palakkad, Kerala · +91 491 209 2016 · ghm@iitpkd.ac.in (phone and email default to `GUEST_HOUSE_CONTACT`) |

---

## Configured elsewhere in the console

| What | Where | Who |
| --- | --- | --- |
| Accounts: role, hostel, department/club, roll number, **LDAP username**, unit, faculty/staff; bulk "Import LDAP usernames" | Users & Roles | Manager (not developer accounts), developer |
| Departments, councils, clubs, offices: parent, **head**, acting head, office class, whose HOD approves (`hod_unit_id`), **Faculty Advisor**, **secretary's mailbox** | Departments & Clubs | Manager, developer |
| Projects (number, title, PI; paste import; deactivate) | Projects | Manager, developer |
| Guest houses, rooms (single or bulk "B-101 to B-120", max 200), active/inactive, **serves meals**, **maintenance blocks** | Guest Houses & Rooms | Manager, developer |
| Each requester role's form: guest houses, field modes, relationship options and rules, alumni card, banner, custom fields | Form Builder | Manager, developer |
| Each automatic mail: subject, intro, outro, extra CC, on/off | Email Templates | Manager, developer |
| The console password | Console Access | Developer |

---

## Fixed in code (not Settings)

| Value | Where | What it does |
| --- | --- | --- |
| Infant = age **< 5** | `INFANT_AGE_LIMIT`, `lib/occupancy.ts` (and the DB trigger) | No bed, no ID |
| Rooms per request **10**; meals-only guests **1–100**; purpose ≥ **5** chars | `lib/booking-schema.ts` | |
| Copy to ≤ **25** addresses | `MAX_COPY_TO_EMAILS` + migration 24 | |
| Project sub-head ≤ **120** chars; Special fund name ≤ 300 | `lib/debit-heads.ts`, schema | |
| Uploads ≤ **5 MB**, JPG/PNG/WEBP/PDF | `lib/uploads.ts` | Server action body limit 25 MB (`next.config.ts`) |
| Early check-in / accepted overlap **2 h** | `TURNOVER_GRACE_HOURS`, `lib/turnover.ts` | Occupied can be marked 2 h before check-in; a changeover the manager accepts may overlap ≤ 2 h |
| "Checked out — to bill" window **30 days** | `UNSETTLED_WINDOW_DAYS`, `lib/invoice.ts` | Older ones are invoiced from the Approval Log |
| Additional charges ≤ **20** per invoice; description 2–80, comment ≤ 200 chars; quantity 1–999; ≤ ₹10,00,000 each | `parseExtraCharges`, `lib/invoice.ts` (and migration 26's check) | |
| Extend or bring a check-in forward by at most **60 days** at a time | `extensionError`, `earlierCheckInError`, `lib/operations.ts` | |
| Filled in from earlier bookings: at most **15** people | `MAX_KNOWN_FROM_BOOKINGS`, `lib/known-guests.ts` | The record's family comes first |
| Escalation after **48 h** pending | `ESCALATION_HOURS`, `lib/mail/digest.ts` | |
| Availability window ≤ **62 days** | `MAX_AVAILABILITY_DAYS` | |
| Archive scan cap **1,000** (Supabase), CSV export cap **5,000** | `SEARCH_SCAN_LIMIT`, `HISTORY_EXPORT_LIMIT` | |
| Session **30 min idle / 12 h absolute**; step-up **10 min**; console unlock **8 h** | `lib/sessions.ts`, `lib/admin-lock.ts` | |
| Throttles: sign-in 8/15 min · console unlock 6/15 min · 2FA 10/10 min · documents 60/5 min · Google start 20/10 min | `RATE_LIMITS`, `lib/security.ts` | Rows in the database |
| Academic record cache **10 min** (1 min for an outage), 3 s timeout | `lib/academic/index.ts` | |
| Who may book meals only | `MEALS_ONLY_ROLES` (`lib/booking-types.ts`) | Employee, Official, IAR Office, GH Manager |
| Booking types per role | `ROLE_BOOKING_TYPES` (`lib/booking-types.ts`) | |
| Alumni stays at **Bageshri** | `ALUMNI_GUEST_HOUSE_NAME` (`lib/policy.ts`) | Matched on the name; the manager may override |
| **The guest house's phone and email** (+91 491 209 2016, ghm@iitpkd.ac.in) | `GUEST_HOUSE_CONTACT` (`lib/site.ts`) | The one source in code: the public site, the "Facing trouble booking?" line (`lib/policy.ts`) and the invoice's default contact all read it. The invoice's copy can then be changed in Tariffs & Invoicing |
| Public-site map, guidelines PDF, photos | `lib/site.ts` (`grep -rn "TODO(site)"`) | |
| Timezone **Asia/Kolkata** | `lib/tz.ts` | Never the server's zone |

## Switched by the environment

| Variable | Effect |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` (+ keys) | Supabase store instead of the JSON mock |
| `LDAP_URL` (+ `LDAP_BASE_DN`…) | Real directory instead of the dummy accounts |
| `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` + `APP_URL` | Real Google sign-in; closes Mock Authentication |
| `MOCK_LOGIN=false` | Closes Mock Authentication without Google |
| `MAIL_USER` + `MAIL_APP_PASSWORD` / `MAIL_DRY_RUN` / `MAIL_REDIRECT_ALL_TO` | SMTP / no mail / all mail to one test address |
| `ACADEMIC_DB_URL` | Real academic records instead of the dummy ones |

The full list, with what each is for, is in
[30-credentials-and-access.md](30-credentials-and-access.md#environment-variables).
