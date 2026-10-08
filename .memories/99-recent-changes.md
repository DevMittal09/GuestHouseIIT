# Recent changes — the last round, and only the last round

**This file is deliberately short-lived.** It holds the most recent working
session so the next person (or agent) can pick up without reading everything.
When a new round lands, **delete what is here and write the new round in its
place**. Anything permanent belongs in [03-decisions.md](03-decisions.md) (the
log that accumulates), [02-timeline.md](02-timeline.md) (one row per session)
and `AGENTS.md` (the rules).

---

## Round of 7 October 2026 — the office's eighth list, in four phases

Relayed by the owner as a four-phase plan, each phase gated on `npm run lint`,
`npm run typecheck`, `npm test`, a production build on the mock store and
`npm run test:e2e` before the next began. Status item by item in
[01-background.md](01-background.md) ("The office's eighth list — 7 October
2026"); reasoning in [03-decisions.md](03-decisions.md) ("7 Oct 2026").

**Two migrations, 28 and 29**, both outstanding on the hosted project.

### Phase 1 — text, the booking form, availability

| Asked for | Now |
| --- | --- |
| Every em dash becomes a hyphen | 1,559 of them across 214 source files (`.ts`, `.tsx`, `.css` in `app/ components/ lib/ tests/ e2e/ scripts/`). Markdown and SQL comments left alone. **`projectFromDetails` accepts both** `" — "` and `" - "`, em dash first, so a project stored before today still prints its title on the invoice |
| Kerala → Keralam | `lib/site.ts`, the privacy page, the default invoice address, the console's GST note. `INVOICE_RULES_REVISION` **3** + `renameState()` rewrites a saved Settings row's address **once**, whole-word (so "Keralam" is never made "Keralamm") and only where the row carries its own contact. Already-issued invoices and the Hindi artwork are untouched |
| MRBS off the site | `MRBS_URL` deleted; the footer banner, the `SITE_LINKS` row, the Contact page sentence and the portal footer's link all gone. Both test suites now assert its absence |
| A personal booking asks no debitable head | `asksForDebitHead(bookingType)` is the rule, not "the list has one entry": the card is **not rendered** for a personal booking, and the schema's closing `.transform()` writes `personal_funds` whatever arrived. `DEBIT_RULES_REVISION` **5** withdraws Special Funds from `room.personal` once; `FORBIDDEN_DEBIT_HEADS.personal` is the floor under Settings (`FORBIDDEN_DINING_HEADS` is now empty). What is left on screen is a **Payment** card with the pay-at-checkout note |
| Students and alumni: Bageshri only, no meals, server-checked | `restrictedToOneGuestHouse(bookingType, role)` in `lib/policy.ts`; `guestHousesForBookingType` and `guestHousePolicyError` take a role; `mealsAllowedFor` / `mealsPolicyError` are new. `createBooking` refuses both and the **manager overrides**, with the exception in the booking's log |
| The meal split fills itself in | Either count box sets the other to the rest (`fillOtherDietCount`). A split that does not add up is no longer reachable from the form; `dietCountsError` still enforces it for a crafted payload |
| The tariff table on the booking form | `tariffPreviews` / `tariffPreviewLines` resolve through the **same `resolveTariff` the invoice prices from**, on the server, one set per guest house and booking type. New `components/tariff-table.tsx`; an unpriced charge reads "Not published", never a zero |
| A Change rate button for the GHM | Tariffs & Invoicing: a rate in force cannot be edited, so **Change rate** copies its scope into the Add-a-rate form dated today |
| Everyone but the desk sees only a count | `SEES_ROOMS` (manager, caretaker, developer) in `app/actions/availability.ts`. Everyone else is sent `rooms: []`, `segments: []` and `counts` — rooms free per day, and per hour on a one-day window. New `lib/availability.ts` `AvailabilityCounts` / `rangeBetween` / `availabilityCounts` and `components/availability-counts.tsx`. The charts' `simple` mode and the legend's `detailed` flag are **retired**: the charts are the desk's now |

### Phase 2 — the institute's records, in the portal (migration 28)

| Asked for | Now |
| --- | --- |
| A table for the records, and a console to paste them in | **Migration 28** `academic_records`: one flat table for all six kinds, unique on `(kind, lower(email))`, RLS on with **no `authenticated` policy** (it holds parents' names and phone numbers — service-role only, like `app_settings`). New console section **Academic records** (manager + developer): paste → **Check the paste** (a plan: "412 added, 3 updated, 9 unchanged") → Import, all or nothing, audited |
| The card, the warden's check and the guest form read it | A third `AcademicSource`: `StoreAcademicSource` is what `getAcademicSource()` returns when `ACADEMIC_DB_URL` is unset — imported rows first, the published dummies **behind** them, so a fresh install and the demo personas still work. `AcademicSource.find` now returns `{record, origin}` (`database` / `imported` / `sample`), and `isMockAcademicSource()` is **gone**: the card's "sample" caption is per lookup, not per deployment |
| Fill-in and "Yourself" removed for every role | `lib/known-guests.ts` and `lib/known-guests-server.ts` **deleted**; the compact `Fill in…` select and the "filled in from…" note are gone. `Self` stays on the student relationship list — it is a relationship, typed by hand |
| Students: parents locked from the record | `lib/academic/guest-names.ts`. Father and Mother are offered **and locked** where the record has them; a parent it does not name is **not offered at all**; Guardian only where neither parent is on record; no record → nothing locked or withheld. `BookingSchemaContext.guestNames` carries the rule to both sides |
| The server takes the parent names from the record | `createBooking` rebuilds the rule from the record and writes **the record's name** whatever arrived |
| Aadhaar and the ID upload optional only for recorded guests | In the schema, in the form's own file check, and in the labels. A sibling or grandparent, typed by hand, is still asked |

A bug found by the journey and fixed: the 10-minute lookup cache served the
**old** record for ten minutes after an import, so the form went on locking a
parent to a name the office had just corrected. `forgetAcademicRecords()` now
runs on every import, delete and clear.

### Phase 3 — invoices and payments (no migration)

| Asked for | Now |
| --- | --- |
| No empty rows, room charges included | `minRows` is 0 from **version 4**; a one-room stay no longer prints a blank second room line |
| The lines under the GSTIN removed | `printsTaxLines(doc)` is false from version 4, in the PDF and the preview. The breakdown is still computed and kept in the snapshot, so nothing is lost if the office wants it back |
| The CGST/SGST split in the GST row's label | "GST @ 18% on A (B) - CGST 9% + SGST 9%" |
| New invoices are version 4; old ones reprint as they were | Labels are computed at print time, so a `version: 3` snapshot is byte-for-byte what it was issued as |
| Cash removed | `PAYMENT_MODES` is UPI and account transfer; `cash` stays in the union and the labels so a stored cash payment still reads, and `paymentModeError` refuses it on a new payment. Both offered modes now require a reference |
| A personal stay: issue, pay, vacate, in one dialog | The row shows one button, **Check out & settle**, which opens the invoice; the dialog gained a third step. `vacateBlocker` + `updateBookingLifecycle(id, "VACATED", reason?)` refuse an unpaid personal stay on the server |
| The manager can override with a reason | `canOverrideVacatePayment` — the manager's, not reception's — behind a typed confirmation, and the reason goes into the log |
| Official stays are billed on | Unchanged: issued at check-out, marked paid later by either desk |
| **Awaiting payment**, no 30-day limit | The last section of both consoles. `awaitingPayment(bookings, invoices)` returns every issued-and-unpaid invoice, newest first, **dining bookings included**. Its own table (`components/awaiting-payment.tsx`), because a meal booking has no check-in, check-out or rooms. New `InvoiceFilter.statuses` and `BookingFilter.ids` let it have no window without loading every booking ever made |

### Phase 4 — lapsed requests become Missed (migration 29)

| Asked for | Now |
| --- | --- |
| A Missed status, in a file of its own | **Migration 29** is `alter type booking_status add value if not exists 'MISSED'` and nothing else: Postgres refuses to *use* a new enum value in the transaction that adds it. Nothing is backfilled |
| A nightly job that marks, logs and mails | `lib/missed-server.ts` `runMissedSweep(now)`, wired into `/api/mail/cron` **before** the digest, so a lapsed request is out of the queues before the day's digest is built. The mail is `booking.missed.requester` |
| A meal booking's cutoff is its last meal day | `lapseDeadline` already said so; the sweep reads it |
| Running it twice changes nothing | A marked request is no longer active, and the mail is keyed on `updated_at` |
| The manager can reinstate | `reinstateMissedBooking` sends it back to **the stage it was waiting at** (`statusBeforeMissed`), not to the manager's queue — nobody decided it. A reinstated request is never marked again: `missedSweepable` reads the reinstatement structurally off the log (a row whose `previous_status` is MISSED), so it needed no column and no string matching |
| The queue shows Missed | A **Missed requests** section on `/manager` (21 days; older ones are in the Approval Log, which gained a **Missed** tile of its own — a cancellation is something somebody asked for, and this is the opposite) |

### Verified

`npm run lint`, `npm run typecheck`, **`npm test` — 405 passed** (23 files; new
`tests/eighth-round.test.ts` 21, `tests/academic-records.test.ts` 24,
`tests/invoices-and-payments.test.ts` 14, `tests/missed-requests.test.ts` 13),
a production build on the mock store (`NEXT_PUBLIC_SUPABASE_URL=`), and
**`npm run test:e2e` — 33 journeys**, including a new `e2e/eighth-round.spec.ts`
(the student's form and its rates, the faculty rates and the head question,
Change rate, a pasted record locking a student's parents, and the whole Missed
journey through the real cron route).

**Migrations 28 and 29 in a throwaway `postgres:16-alpine`**: 1–29 applied,
each re-applied cleanly. 28 — the enum, the 22 columns, RLS on, the
case-insensitive unique index, the same email allowed for another kind, an
unknown kind refused, `updated_at` moving on update, and the record surviving
the deletion of whoever imported it. 29 — MISSED on the enum, a booking moved
into it and back out with both log rows, and no room held.

Tests that now assert the opposite of what they did a week earlier, as the plan
predicted: `e2e/fifth-round.spec.ts` (a parent's name is locked, not filled in
from a list) and the known-guests blocks of `tests/fifth-round.test.ts` and
`tests/sixth-round.test.ts`, which were deleted with the feature.

### Still open

- **Apply migrations 28 and 29 to the hosted project**, with 24–27 which were
  already outstanding. Until 28 the records console reports the missing table
  by name and every lookup falls through to the published dummies; until 29
  the nightly job cannot mark anything there (it logs the enum error per
  booking and the rest of the run carries on).
- **Then import the real records** — Academic records → Students first, since
  that is the list the booking form locks parents' names against. A student
  who is not in the import simply types their parents' names, as before.
- **`MAIL_REDIRECT_ALL_TO` must be unset in the Vercel environment** or no
  Copy-to address will ever receive mail (carried over from 1 Oct).
- The office may want the **tax breakdown** back under the GSTIN; it is still
  in every snapshot, so that is a one-line change to `printsTaxLines`.
- `GST_INCLUDED_NOTE` ("the tariff rates include GST") came off the invoice
  with the other lines under the GSTIN. Worth confirming the office meant
  that one too.
- AM's photographs; the placeholder house rules (Guidelines §7–8); each
  council's Faculty Advisor and mailbox — [04-roadmap.md](04-roadmap.md).
