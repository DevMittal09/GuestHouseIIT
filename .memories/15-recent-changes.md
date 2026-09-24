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

## Round of 24 September 2026 — the office's fourth correction list

Nine items, built on `main` (the `ui` branch holds only the 21 Sep vermilion
redesign and is 24 commits behind; it was deliberately not merged in this
round). Verified with `npm run lint`, `npm run typecheck`, `npm test` (245,
26 new in `tests/fourth-round.test.ts`), a production build on the mock store,
`npm run test:e2e` (15, one new: `e2e/club-booking.spec.ts`), and migration 24
applied twice over 1–23 in a throwaway `postgres:16-alpine`, with row-level
checks of its three constraints.

### 1. Invoice after checking out

The manager had "Checked out — to bill"; **reception, which issues the
invoice, had nothing** — a stay marked Vacated vanished from `/caretaker` with
its bill open. Now:

- `awaitingSettlement()` in `lib/invoice.ts` is the one rule for the list
  (vacated in the last `UNSETTLED_WINDOW_DAYS` = 30, not paid, no dining),
  used by `/manager` **and** `/caretaker` (new "Checked out — to bill" section
  in `components/caretaker-console.tsx`).
- **Checking out today** (`components/checkouts-today.tsx`) has an Invoice
  button beside Mark as Vacated, and the toast after vacating says where the
  invoice went.
- **The Approval Log** (`/history`) has an Invoice button for the desk
  (`canIssueInvoices`) on every checked-out stay — however old — and on a
  dining booking once approved (`invoiceableFromArchive`). This is how a paid
  or month-old invoice is reprinted.

### 2. A dining invoice has no room details

`InvoiceDocument.kind` (`"stay" | "dining"`, read through `invoiceKind()` so
snapshots issued before it still work) and `meal_dates`. For dining, the PDF
and the desk's preview print **Meal Date(s)** and **No. of Guests** instead of
check-in/out, rooms, infants and primary guest, and drop the room table and
"Sub Total (A)": totals read **Total** and **Grand Total (including GST)**. The
accounts mail does the same. One list of facts, `invoiceFacts()`, feeds the PDF
and the preview so they cannot disagree.

### 3. Project details only with the Project head

The PDF printed "Project Detail:" and "Project Number:" on **every** invoice,
blank. `invoiceFacts()` prints them only when the head is Project, followed by
the new **Project Sub-head**; with Special Funds it prints the fund's name if
one was given. The accounts mail and the history PDF export follow.

### 4. A project's sub-head, typed

`bookings.debit_subhead` (migration 24). On New Booking, choosing Project shows
an optional **Project sub-head** text box under the project list. The schema
refuses a sub-head with any other head; the database checks the same.
`describeDebit()` appends "· Sub-head: …", so screens, mail and CSV all show it.

### 5. Faculty/staff: only name and gender are mandatory

`buildDefaultFormConfig("employee")`: name and gender **required**; age,
relationship, Aadhaar **optional**; ID upload still hidden. Age can now be
optional at all: `sanitizeFormConfig` keeps "optional" (a stored "hidden" still
reads as required) and the schema's new `ageField` treats a blank box as
**null — an adult**. That fixed a real bug: `z.coerce.number()` turned "" into
**0, an infant**, so "Age is required" never fired anywhere.

### 6. Official bookings: only gender

`buildDefaultFormConfig("official")`: gender required; name, age, Aadhaar, ID
optional; relationship hidden, as before.

> **Saved forms win over defaults.** If either role was ever saved from the
> Form Builder, press **Reset to spec defaults** for it, or set the fields by
> hand. The local mock database has no saved forms; the hosted project was not
> checked.

### 7. Clubs are booked only by their faculty in-charge

`lib/club-booking.ts`. A club's own account gets an explanation naming its
faculty in-charge instead of the form; `createBooking` refuses it too. The
**faculty in-charge** — the club unit's own head (not a student, not inherited
from a council) or a `faculty_advisor` account whose Department/Club matches —
books from `/book?for=<club profile id>` (a "Book for …" button on Club
Approvals, My Bookings, and `/book`). The booking **is the club's**
(`user_id` = club, `user_role: "club"`, `created_by` = the faculty member), so
routing, debit heads, scoping and reports are unchanged, except:

- **the Faculty Advisor stage is skipped** (`routeFor` with
  `raisedByFacultyInCharge`); an HOD stage, where the club has one, stays;
- the creator can never approve it (`canReviewBooking`), cancel/extend it like
  the requester (`actsAsRequester`), sees it on their dashboard
  (`listBookingsForUser` includes `created_by`), and is **CC** on every mail to
  the club about it;
- the submission log names the faculty member (both stores log `created_by`).

Demo booking 2 (Petrichor, `PENDING_FA`) is left as a request from before the
rule.

### 8. Copy to, per booking

`bookings.copy_to_emails` (migration 24, at most 25 — `MAX_COPY_TO_EMAILS`).
A "Copy to (optional)" card on New Booking with "Add another email"; blank
rows and repeats dropped, bad addresses flagged on their row. **Every mail to
the requester about the booking** — acknowledgement, approvals, rejection,
allocation, cancellation, extension, no-show, the check-in reminder, and the
official invoice to Accounts — is CC'd to the list (`requesterCopyTo()` in
`lib/mail/recipients.ts`). Staff mail keeps its own CC (the approval chain).
Shown on the booking details as "Copy to".

### 9. Special Funds on every official booking

`special_budget` (migration 15's value) is now labelled **Special Funds**, in
`STANDARD_DEBIT_HEADS`, and on by default for faculty, staff, both kinds of
office, clubs and the desk — room and dining. **Never students or personal
bookings**: `FORBIDDEN_DEBIT_HEADS` now includes it for `student` and
`personal`. The fund's name and a sanction letter are both **optional** (the
old Special Budget demanded both). A Settings row saved before this gains it
once (`upgradeDebitRules`, `DebitRules.revision` = 2); an untick saved after
that stands.

## Also changed while in there

- **Migration 24 relaxes `booking_guests.age`** from `between 1 and 120` to
  `age is null or between 0 and 120`. On Supabase a baby typed as 0 was
  refused although the portal has always accepted 0.
- Until migration 24 is applied the Supabase store leaves both new columns out
  of the insert when they are empty, so only bookings that use them fail.
- `e2e/booking-journey.spec.ts` expected the stay to vanish from reception
  after check-out; it now expects it under "Checked out — to bill".
