# Database design note — why one `profiles` table

**Prepared for:** project supervisor review
**Portal:** IIT Palakkad Guest House Booking Portal
**Date:** 15 October 2026
**Scope:** the question "why is there not a separate table for students,
faculty, staff and the rest?", and the schema that answer sits in.

---

## 1. The short answer

> There is one `profiles` table because **a role in this portal is an
> authorisation level, not a category of person** — and because splitting it
> would break 21 foreign keys that the database currently enforces for us.
>
> The per-category split the question is really after **does exist**: it is
> `academic_records`. The useful boundary in this system is not
> student-vs-faculty, it is **identity and authorisation** (one table, small,
> referenced everywhere) **versus per-category reference data** (a separate,
> locked-down table holding each category's own fields).
>
> We split on that axis deliberately. It was reviewed formally on
> 13 October 2026, before importing the institute's user list, and the review
> is recorded in the repository.

This is not a default that was never examined. It is a decision with a written
record, four pieces of evidence behind it, and a documented condition that
would reverse it (§6).

---

## 2. The schema in one page

27 tables, built over 34 sequential migrations. They group into eight areas.

| Area | Tables | What it holds |
| --- | --- | --- |
| **Identity & access** | `profiles`, `sessions`, `user_mfa`, `rate_limits`, `security_audit` | Who a person is, their role, their live sessions, 2FA, throttling, an append-only security log |
| **Organisation** | `units`, `hostels`, `official_email_whitelist` | Departments, clubs, councils and offices; the hostel list; which accounts may book as an office |
| **Inventory** | `guest_houses`, `rooms`, `room_holds`, `room_blocks` | The two guest houses, their rooms, who holds which room and when, maintenance closures |
| **The booking** | `bookings`, `booking_rooms`, `booking_guests`, `booking_logs` | The request, its room cards, the guests in each card, and the audit trail of every status change |
| **Reference data** | `academic_records` | The institute's own records, per category — see §4 |
| **Money** | `tariffs`, `invoices`, `invoice_counters`, `projects` | Rates, issued invoices as snapshots, invoice numbering, project grants |
| **Configuration** | `app_settings`, `form_configs`, `mail_templates` | Rules the console can change without a deployment |
| **Operations** | `email_outbox`, `user_import_batches`, `privacy_requests` | The mail queue, the undo record for a bulk user import, data-subject requests |

The core relationship is straightforward:

```
profiles ──< bookings ──< booking_rooms ──< booking_guests
                │
                ├──< booking_logs        (append-only audit trail)
                ├──< room_holds >── rooms >── guest_houses
                └──< invoices
```

Three design choices are worth naming to a reviewer, because they are the
parts that carry the most weight:

1. **Occupancy is enforced by the database, not by application code.**
   `room_holds` carries a `tstzrange` and a **GiST exclusion constraint**, so
   two overlapping holds on the same room are *rejected by Postgres*. This
   replaced a check-then-act race in the allocation code: previously two
   managers, or one double-click, could both read "free" and both write. The
   invariant is now "a hold row exists exactly while the booking holds the
   room", which also means occupancy queries need no status filter at all.

2. **Configuration lives in rows, not in code.** Capacity limits, the booking
   window, meal caps and even **the entire approval workflow** (`rules.approval`)
   are jsonb rows in `app_settings`. The Guest House Manager reconfigures who
   approves what from the console, with no migration.

3. **Row-level security is enabled on every table, with sensitive tables given
   no `authenticated` policy at all** — so the browser-facing role is denied by
   default. `academic_records` (parents' names and phone numbers),
   `app_settings` (the console password hash) and `email_outbox` (rendered mail
   bodies) are all service-role-only.

---

## 3. Why one `profiles` table — the four arguments

### 3.1 Referential integrity: 21 foreign keys point at `profiles.id`

Verified against the migration files, this is the current count:

| Table | Columns referencing `profiles.id` |
| --- | --- |
| `invoices` | `paid_by`, `issued_by`, `cancelled_by`, `created_by` |
| `units` | `head_id`, `acting_head_id`, `faculty_advisor_id` |
| `bookings` | `user_id`, `created_by` |
| `privacy_requests` | `user_id`, `handled_by` |
| `user_import_batches` | `actor_id`, `reverted_by` |
| `booking_logs` | `action_by` |
| `room_holds` | `override_by` |
| `room_blocks` | `created_by` |
| `tariffs` | `created_by` |
| `academic_records` | `imported_by` |
| `security_audit` | `actor_id` |
| `sessions` | `user_id` |
| `user_mfa` | `user_id` |

**21 foreign keys across 13 tables.** Splitting `profiles` into
students / faculty / staff / offices leaves exactly two options:

- **Four foreign keys wherever there is one now** — `bookings` would need
  `student_id`, `faculty_id`, `staff_id`, `office_id`, three of them null on
  every row, plus a check constraint to enforce that exactly one is set. That
  is 21 × 4 columns, and the join for "who submitted this?" becomes a
  four-way `coalesce` in every query.
- **A polymorphic `(table_name, id)` pair** — which Postgres **cannot enforce
  as a foreign key at all.** Integrity moves from the database back into
  application code.

The second option is the one that matters. This project's single most
important architectural decision was to move an invariant *into* the database
(the `room_holds` exclusion constraint, migration 3), after application-level
checking proved unsafe. Giving up database-enforced integrity on *identity* —
the thing every other table hangs off — would be that same decision made in
reverse, and at a far larger blast radius.

### 3.2 A role is an authorisation level, not a category of person

The developer console lets an administrator change anyone's role. Under one
table that is a single `UPDATE`.

Under separate tables, a student who graduates and joins as staff is a
`DELETE` plus an `INSERT` — **a new primary key** — and all 21 foreign keys
above either break or silently re-point. Their booking history, the approvals
they made, the invoices they issued and the audit rows naming them would all
have to be migrated by hand, per person, for ever.

Worth noting: `booking_logs.action_by_name` is deliberately denormalised so
the audit trail survives an account being deleted. That is designed as the
*exception*. Separate tables would make it the normal path.

### 3.3 Half the roles are posts, not categories of person

Of the twelve roles, these describe **a job someone holds**, not what kind of
person they are:

`warden` · `gh_manager` · `gh_caretaker` · `iar_cell` · `developer`

An Assistant Warden **is a faculty member**. A students / faculty / staff
split has nowhere to put them without storing the same human being twice — in
which case the database no longer knows those two rows are one person, and the
rule "a reviewer may not approve their own booking" (currently enforced by
`reviewer.id === requester.id`) becomes unenforceable.

The portal already models appointments the correct way, and it is instructive:
**HODs and Faculty Advisors are not roles at all.** They are a column on the
unit they head — `units.head_id`, `units.acting_head_id`,
`units.faculty_advisor_id`. Appointments change every year or two; the person
does not. A separate table per category would be modelling the appointment as
though it were the person.

### 3.4 The per-category split already exists, on the better axis

This is the strongest point, because it shows the question *was* asked and
answered — just not where the supervisor is looking.

Migration 28 faced precisely this choice for the institute's academic records,
which come in six kinds (student, employee, office, student representative,
alumni office, warden). It chose **one table with a `kind` discriminant**, and
wrote the reasoning into the migration file itself:

> "The kinds share more than they differ by (an email, a phone, a name, a
> department) and the alternative — six tables, six importers, six console
> sections — would be six times the surface for the same six CSV pastes."

So the system does separate per-category data. The boundary it separates on is:

| | Table | Who can read it | Why |
| --- | --- | --- | --- |
| **Identity & authorisation** | `profiles` | The application | Small, stable, referenced by 21 foreign keys. Must be one table. |
| **Per-category reference data** | `academic_records` | **Service-role only** | Holds parents' names and phone numbers. Varies by category. Must *not* be readable just because someone is signed in. |

That division buys something a student/faculty/staff split does not: a
student's parents' names and phone numbers are in a table **no browser session
can read at all**, while their role and email — which the portal needs on
every page — are in a table it can. Splitting `profiles` by category would not
have improved that one bit; it would have left the sensitive fields in exactly
the same access tier as the email address.

---

## 4. What the single table actually costs

Honesty matters more than advocacy here, so: the cost is **six nullable
columns** on `profiles`.

| Column | Applies to | Constrained? |
| --- | --- | --- |
| `hostel_name` | students | Yes — FK to `hostels(name)`, `on update cascade`, `on delete restrict` |
| `unit_id` | employees, offices, clubs | Yes — FK to `units(id)`, `on delete restrict` |
| `staff_category` | employees only | Yes — check constraint (`faculty` / `staff`) |
| `ldap_uid` | anyone with a directory login | Yes — unique on `lower(ldap_uid)` |
| `roll_number` | students | No — free text |
| `department_or_club` | legacy | No — free text, **and a known issue (§5)** |

Three of the six are already enforced by the database. Only two are loose, and
one of those is scheduled for removal.

That is the whole cost. No migration was needed to hold the institute's user
file, which was the practical test the design was put to.

---

## 5. The formal normalization review (13–14 October 2026)

The schema was reviewed against 3NF before the institute's user import. Nine
findings; the honest summary is **the schema was in good shape, and the review
is recorded so a later session does not redo it.**

| # | Finding | Outcome |
| --- | --- | --- |
| 1 | `profiles.department_or_club` duplicates `unit_id` — a department held twice, as free text and as a foreign key. **A real 3NF violation** | **Open, deliberately.** Five modules still read it. Dropping it today is a feature removal dressed as normalization. Retire it once every account has a `unit_id` |
| 2 | `guest_houses.total_rooms` was a stored derived value, recounted by application code — a textbook update anomaly if a room is inserted by SQL | **Fixed** (migration 33): a trigger on `rooms`, handling both `OLD` and `NEW` so a room *moved* between houses recounts both ends |
| 3 | `academic_records` has every kind's fields as nullable columns | **Correct as designed** — see §3.4 |
| 4 | `academic_records.hostel` is free text while `profiles.hostel_name` is a foreign key | **Correct as designed.** That table records *what the office pasted in*. A foreign key would reject a valid import because the institute spells a hostel differently from our list. Verified display-only — nothing scopes or authorises on it |
| 5 | `profiles` had almost no indexes | **Fixed** (migration 31). Invisible at 18 accounts, not at several thousand |
| 6 | No case-insensitive index behind the import's `lower(email)` match key | **Fixed** (migration 31) |
| 7 | `profiles` had no check constraints at all | **Fixed** (migration 31), both `not valid` so the migration cannot refuse to apply |
| 8 | `profiles` has no `is_active` — someone who leaves can only be deleted, and deletion is correctly refused for anyone with a booking | **Open.** Not urgent until the first graduation after go-live |
| 9 | 22 foreign keys had no index on the *referencing* column. Postgres indexes the key being referenced, never the one referencing it | **Fixed** (migration 34) for the 20 that matter. **Measured**: deleting 300 profiles went from **2,580 ms to 64 ms** against 200,000 `booking_logs` rows |

### Denormalisation that is deliberate and should not be "fixed"

Four values in the schema could be derived but are stored on purpose. A
reviewer should know these are intentional:

- **`bookings.user_role`** — the requester's role *as it was when they booked*.
  Reading it live from `profiles` would rewrite history the moment anyone's
  role changed.
- **`booking_logs.action_by_name`** — so the audit trail survives account
  deletion. The whole point is that it does *not* follow the profile.
- **Issued invoices** — stored as snapshots, never recomputed. A tariff change
  must not alter a bill already sent.
- **`bookings.search_text`** — on inspection, not a denormalisation at all:
  it is `generated always as (...) stored`, so Postgres maintains it and it
  cannot drift.

---

## 6. What would change the answer

The design is conditional, not dogmatic. It should be revisited if:

> **A category acquires a dozen fields of its own that no other category has,
> or its own lifecycle.**

Students are the obvious candidate — programme, semester, CGPA, graduation
date, fee status.

Note what the answer would be even then: **not** a separate `students` table
replacing `profiles`, but a **satellite table keyed one-to-one on
`profiles.id`**. Additive, no foreign-key churn, no new primary key when
someone's role changes, and the 21 existing foreign keys untouched.

`academic_records` is already exactly that pattern. So the architecture for
"students need their own fields" is **already built and in production use** —
which is the real reason the question does not force a redesign.

---

## 7. Suggested wording for the conversation

If asked directly, this is the sequence that covers it in about a minute:

1. **"A role here is a permission level, not a type of person."** Half our
   roles — warden, manager, caretaker — are *posts*. An Assistant Warden is a
   faculty member. There is nowhere to file them in a student/faculty/staff
   split without storing one human being twice.
2. **"Twenty-one foreign keys point at `profiles.id`."** Splitting means either
   four nullable keys where there is one, or a polymorphic reference the
   database cannot enforce. We spent migration 3 moving an invariant *into*
   the database; this would move the most important one back out.
3. **"Role changes would become primary-key changes."** A student graduating
   into staff would be a delete plus an insert, orphaning their entire
   booking and approval history.
4. **"We did split by category — on the axis that pays."** `academic_records`
   holds the per-category fields, keyed one-to-one, and is service-role-only
   because it has parents' names and phone numbers in it. Splitting `profiles`
   would not have protected a single one of those fields.
5. **"And it was reviewed formally."** Nine findings against 3NF, six fixed in
   migrations 31, 33 and 34, two open and documented, one measured at a 40×
   speed-up. The one real violation we found is `department_or_club`, it is
   known, and it is scheduled.

The honest closing line: *the single real normalization defect in the schema
is a legacy free-text column we have not yet been able to drop because five
modules still read it — not the one-table design.*

---

## Sources

Everything above is traceable in the repository:

- `.memories/02-decisions.md` — 13 Oct 2026, *"one `profiles` table, and the
  second door that the import would have opened"*, and the follow-up round
- `.memories/21-database.md` — the table list, `room_holds`, the enums, RLS,
  and *"Normalization — the review of 13 Oct 2026"*
- `supabase/migrations/00000000000028_academic_records.sql` — the one-table /
  `kind`-discriminant reasoning, in the file header
- `supabase/migrations/00000000000031_decouple_auth_and_tighten_rls.sql` —
  indexes, check constraints, and the RLS tightening
- `supabase/migrations/00000000000033_guest_house_room_count.sql` — finding 2
- `supabase/migrations/00000000000034_foreign_key_indexes.sql` — finding 9,
  with the measurement
