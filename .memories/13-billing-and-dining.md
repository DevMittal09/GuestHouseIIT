# Billing — tariffs, invoices, payments and dining

Phases 5 and 6 (22 Sep 2026), the 24 Sep corrections, the 25 Sep ones (GST per
section, additional charges, live repricing), the **7 Oct** ones (version 4,
cash retired, a personal stay settled at check-out, Awaiting payment), the
**9 Oct** one (a dining booking is quoted meal rates only) and the **16 Oct**
ones (**a new rate starts in the future**, the guest house named in every desk
list, and **version 5 — no dining section where there is no kitchen**) - and
the **31 Oct** one, which moved **who decides the tariff category** to the
Guest House Manager and made the invoice read their decision.
**Checked against the code on 31 Oct 2026** — `lib/invoice.ts`,
`lib/tariffs.ts`, `lib/tariff-categories.ts`, `lib/invoice-pdf.ts`,
`app/actions/invoices.ts`, `components/invoice-dialog.tsx`,
`components/tariff-category-choice.tsx`, `components/awaiting-payment.tsx`,
`components/stays-table.tsx`, `components/checkouts-today.tsx`,
`lib/access.ts`.

## Who does what

| Action | Manager | Caretaker | Developer | Requester |
| --- | --- | --- | --- | --- |
| **Choose the tariff category** the booking is charged under, at approval (31 Oct 2026) | ✓ | — | — | — |
| Preview, correct meal counts, **add additional charges**, issue & print | ✓ | ✓ | ✓ | — |
| **Mark paid** — **UPI + transaction id, or transfer + UTR** (cash withdrawn 7 Oct 2026; both now require a reference) | ✓ | ✓ | ✓ | — |
| **Check out a personal stay** — issue, pay, then Mark as Vacated, in one dialog (7 Oct 2026) | ✓ | ✓ | ✓ | — |
| **Close a personal stay off unpaid**, with a reason that goes in the log | ✓ | — | ✓ | — |
| **Cancel** an issued invoice (reason; a correction is cancel + reissue) | ✓ | — | ✓ | — |
| Tariffs & invoice settings (console) — **a new rate starts tomorrow at the earliest** | ✓ | — | ✓ | — |
| Monthly collections CSV (`/history`) | ✓ | ✓ | ✓ | — |
| Download own issued invoice (`/dashboard`) | — | — | — | ✓ |

## Where the desk finds a stay to bill

- The **Invoice** button on an occupied stay, and in **Checking out today**.
- **Checked out — to bill** on `/manager` and `/caretaker`: vacated in the
  last 30 days and not paid (`awaitingSettlement`) — the desk's **daily** list
  of stays nobody has invoiced yet.
- **Awaiting payment**, the last section of both consoles (7 Oct 2026,
  `awaitingPayment`): every booking whose invoice has been **issued and not
  paid**, newest first, **with no date window** — an official stay's bill can
  sit with a department for months, and a dining booking never checks out at
  all, so neither would ever reach the to-bill list. Its own table, since a
  meal booking has no check-in, check-out or rooms.
- The **Approval Log** (`/history`): an Invoice button on every checked-out
  stay and approved dining booking, however old (`invoiceableFromArchive`).
- Dining: "Dining to invoice" on the kitchen page (`/manager/meals`).

**Every one of those lists names the guest house** (16 Oct 2026, the owner:
"add the guest house name while differentiating the invoices in the dashboard
where we are showing the previous bookings for GHM/GHC"). `StaysTable` and
`CheckoutsToday` print it under the room numbers, in a column now headed
**Guest house & rooms**; `AwaitingPaymentTable` leads its second line with it
(`Bageshri · 201, 202`, or `Hamsanandi · Meals only · 4 people`, since a
dining booking has no room number to tell the houses apart by). The invoice
dialog opens on **the heading the PDF draws**, `INVOICE_TITLE` - "INVOICE -
IIT Palakkad Bageshri Guest House". A line under the rooms rather than a
column of its own: these tables already carry eight columns and three
buttons, and width is what pushed the Status column off the approver queues
on 11 Oct 2026.

Rates and invoice settings with their defaults are in
[12-settings-and-defaults.md](12-settings-and-defaults.md#console--tariffs--invoicing-manager-and-developer).

## How it works — invoices and tariffs (Phase 5)

The office's invoice template is `public/GHM_Invoice.docx` (revised by the
owner on 25 Sep and again on 30 Sep 2026); its header images are in
`public/invoice/`. **Nothing fills the .docx** — `lib/invoice-pdf.ts` redraws
it with jsPDF, so a change to the template is a change to `invoiceTable()`. The flow,
in the manager's and caretaker's consoles (the **Invoice** button on an
occupied or vacated stay, `components/invoice-dialog.tsx`): **preview →
correct the meal counts and add any additional charges (the figures reprice
as you type) → Save draft (optional) → Issue & print → Mark paid**.

### The layout as printed now (16 Oct 2026) — `version: 5`

**A guest house with no kitchen prints no Dining Charges section at all** (the
owner: "for bageshri meals should not come in invoice"). Everything else is
version 4.

- `InvoiceDocument.serves_meals` records `guest_houses.serves_meals` as it was
  when the invoice was priced, and **`invoicePrintsDining(doc)`**
  (`doc.serves_meals !== false`) is the one reader. A snapshot issued before
  the flag existed has no `serves_meals`, so it reads as printing the section
  and **reprints exactly as it was issued**.
- At Bageshri that means: no Breakfast / Lunch / Dinner rows, no Dining
  Charges Subtotal, no GST row on it, **no meal-count boxes** in the desk's
  dialog, no "Dining charges" option under *Charged under*, and no "Dining
  charges" row in the mail to Accounts. The letters are **A, B, Grand Total
  (A+B)**.
- `buildInvoiceDocument` **zeroes the meal counts** where there is no kitchen,
  whatever arrived, and drops any charge filed under dining - overwritten,
  not refused, like a personal booking's debitable head. A charge the desk
  *types* is named instead: `parseExtraCharges` refuses it, because that is a
  typed input. **`extraChargeSectionsFor(shape)`** is the one list of
  sections, read by the dialog and by the parser.
- **A guest house that serves meals is untouched**, a stay there that ordered
  none included: those meals were offered and declined, which is a fact about
  the stay. Only *no kitchen* removes the section - the same reasoning that
  took the Meals column off `StaysTable` and the per-day table off
  `BookingDetails` on 7 Oct 2026.

### The layout as printed before that (7 Oct 2026) — `version: 4`

Three changes on top of version 3's lettering, which is unchanged:

- **No blank ruled rows**, the room section included (`minRows` 0). The
  template kept two room rows, so a one-room stay printed an empty second one
  that read as a charge nobody had filled in.
- **No lines under the GSTIN** (`printsTaxLines` false): the per-SAC
  taxable / CGST / SGST breakdown, and the "the tariff rates include GST"
  note, are not printed. The breakdown is **still computed and kept in every
  snapshot**, so restoring it is one line.
- **The CGST / SGST split is in each GST row's own label**:
  "GST @ 18% on A (B) - CGST 9% + SGST 9%", next to the figure it describes
  rather than in a footnote under it. That is where the removed information
  went.

Labels are computed at print time, so a `version: 3` snapshot reprints
**exactly** as it was issued — blank rows, tax lines and all.

### The labels as printed from 30 Sep 2026 — `version: 3`

The supervisor's list: every figure the grand total adds is lettered in
turn. A stay: **Room Charges Subtotal (A)**, **GST @ 18% on A (B)**, **Dining
Charges Subtotal (C)**, **GST @ 5% on C (D)**, **Other Charges Subtotal (E)**
only when the desk added one, **Grand Total (A+B+C+D)** (or A+B+C+D+E). A
dining invoice has no room section and starts at its own subtotal: (A),
GST @ 5% on A (B), Grand Total (A+B). Where GST is added on top (the Setting
off) and the rupee rounding makes the letters not sum to the grand total, a
**Round off** row stands above it. `totalLabels()` in `lib/invoice.ts` picks
the labels by the snapshot's version, so **a version 2 invoice (25–30 Sep)
reprints with the labels below**, and a version 1 as before that. The
dialog's Charged under reads Room charges (A) / Dining charges (C) (a dining
invoice: (A)). The monthly CSV and the accounts mail are unlettered (Rooms
(taxable), Dining (taxable), Taxable total), since a month holds both
versions. The .docx says "GST @ 5% on B (D)" — a typo for "on C (D)".

### GST and the table as printed (25 Sep 2026)

> **Superseded in part (30 Sep 2026):** the labels, for new invoices — see
> above. What follows is still exactly how a `version: 2` invoice prints.

- **18% on rooms and extra beds, 5% on food**, each charged on its own
  subtotal: Room Charges Subtotal (A), **GST @ 18% on Subtotal (A)**; Dining
  Charges Subtotal (B), **GST @ 5% on Subtotal (B)**; Other Charges Subtotal
  (C) with no GST when the desk added any; **Grand Total (Including GST)**. The
  column is **Rate**. The old ₹7,500 slab (5% below, 18% above) is gone; a
  saved Settings row is upgraded once (`upgradeInvoiceRules`, revision 2).
- **Rates include GST** is still a Setting and still on: the grand total is
  the prices, and the taxable value (the Rate and Amount columns, the
  subtotals) is backed out at 18% / 5%. **Office to confirm** the tariffs are
  inclusive at 18%; if not, untick it and GST is added on each subtotal
  (rounded half-up to the rupee).
- **`invoiceTable(doc)`** (`lib/invoice.ts`) is the one description of the
  table — sections, rows, totals, closing row — drawn by both the PDF and the
  dialog's preview. Invoices are `InvoiceDocument.version: 2`; a `version: 1`
  snapshot (issued before 25 Sep) prints exactly as it was issued: Tariff,
  Sub Total (A), Sub Total (B), Total (A+B), GST on Total.
- A table too long for the page (many additional charges) **continues on the
  next page**, with the bank details at the foot of every page and "Page n of
  m".

### Additional charges (25 Sep 2026)

Extra beds arranged at the desk, a broken vase — anything the tariff does not
cover. In the Invoice dialog, **Additional charges → Add a charge**: what it
was, **Charged under** (Room charges (A) at the room GST, Dining charges (C) — (B) before 30 Sep —
at the food GST, or Other — no GST, for damage or loss), quantity, **₹ each**
(including GST when the tariffs are), and a **comment** printed under it on
the invoice. At most 20; the amount has at most two decimals; and the sections
offered are the ones the invoice prints (`extraChargeSectionsFor`) — a dining
invoice has no room section to charge to, and a stay at a guest house with no
kitchen has no dining section (16 Oct 2026). They are kept as typed
on the draft (`invoices.extra_charges`, **migration 26**) and frozen priced in
the snapshot (`extra_lines`). A stay with only an additional charge can be
invoiced. Until migration 26 is applied on Supabase, invoices without charges
still work and one with a charge is refused naming the migration.

### Meal counts reprice as they are typed (25 Sep 2026)

The desk's meal-count box used to change the amounts only after **Save
counts**, and the Issue dialog quoted the old grand total — which read as
added meals not being charged. `priceInvoiceDraft` now reprices the unsaved
counts and charges a moment after typing stops; the Issue dialog quotes that
total, and issuing uses exactly those figures. **Preview PDF** prints the
*saved* draft, so it asks for **Save draft** first.

### Paying, and how a stay is closed off (7 Oct 2026)

- **Cash is retired.** `PAYMENT_MODES` is **UPI** and **account transfer**,
  each of which leaves a reference the accounts section can match the invoice
  against, and the reference is now required for both. `cash` stays in the
  `PaymentMode` union and in `PAYMENT_MODE_LABELS`, because invoices paid in
  cash before 7 Oct say so and an invoice is a snapshot; what is gone is the
  *offer*, and `paymentModeError` refuses it on a new payment on both sides.
- **A personal stay is settled before the guest leaves.** Nobody chases a
  private guest for a guest-house bill once they have driven home. So its
  check-out **is** the invoice: the row shows one button, **Check out &
  settle**, and the dialog runs issue → record the payment → **Mark as
  Vacated**. Enforced on the server (`vacateBlocker`,
  `updateBookingLifecycle(…, "VACATED", reason?)`), not merely arranged in the
  UI — `settlesAtCheckOut()` is the test.
- **The manager may close one off unpaid, with a reason**
  (`canOverrideVacatePayment`), behind a typed confirmation; the reason goes
  into the booking's log and the stay stays in Awaiting payment. Reception
  cannot: an invoice that cannot be issued at all must not trap a guest in the
  building on paper, but setting a payment rule aside is a decision about
  money.
- **An official stay is unchanged**: the invoice is issued at check-out and
  marked paid later, by the manager or the caretaker, from Awaiting payment.
- **A dining booking** is invoiced from the day of its first meal and keeps
  **one** invoice. A personal one is settled at the guest house through
  reception; an official one waits in Awaiting payment like any other bill.

- **Pure rules — `lib/invoice.ts`, `lib/tariffs.ts`.** Money is integer paise.
  `chargeableDays()` (calendar nights by default, or 24-hour blocks with a
  grace — Setting `day_basis` / `grace_hours`), `splitByRate()` (a mid-stay
  rate change prints two rows), `extraBedsByRoom()` (guests in a room card
  beyond the room type's beds), `mealCovers()` (meals ticked × bed-occupying
  guests, or a dining booking's head count), `gstPaise()` (basis points,
  half-up to the rupee), `formatINR()` (₹1,23,456.00, written out, not `Intl`),
  `financialYear()` (1 April rollover, institute time) and
  `splitGst()` (the rates are **GST-inclusive** by default: the grand total is
  the rates, taxable value and CGST/SGST are backed out),
  `buildInvoiceDocument()`, which assembles every printed field into an
  `InvoiceDocument`. `actualStayTimes()` reads the desk's OCCUPIED / VACATED
  log entries; an occupied stay is billed to its booked check-out.
- **Tariffs** are effective-dated rows (`tariffs`, migration 19), each
  optionally narrowed by guest house, room type, booking type and requester
  role. `resolveTariff()` takes the most specific row in force (guest house >
  requester > booking type > room type), then the latest. A rate in force is
  never edited or deleted (trigger `tariffs_guard`, `tariffLockedError`); a new
  price is a new row, **and it must start later than today**
  (`tariffStartError`, 16 Oct 2026) - so the office prices the bookings still
  to come and never a night it has already quoted on the form. The two rules
  meet at tomorrow: the earliest a rate may start is the earliest one that can
  still be removed. The start rule is in `createTariffAction` and the console
  form, **not** in the stores, which still take any date - that is what
  `supabase/repairs/` needs. What it does *not* do: a stay booked last week is
  still priced night by night, so a rate starting tomorrow does reach its later
  nights ([03-roadmap.md](03-roadmap.md) §2). A charge no rate covers is a *problem* on the document
  and blocks issuing (`invoiceBlocker`) — nothing is ever priced at ₹0 by
  omission.
- **The rates on the booking form** are the same resolution
  (`tariffPreviews` → `tariffPreviewLines` → `resolveTariff`, 7 Oct 2026), so
  the figure quoted and the figure charged cannot drift.
  `previewItemsFor(servesMeals, service)` decides the rows: a stay gets the
  room and the extra bed plus the meals where the kitchen serves them, and a
  **dining booking gets the three meals and nothing else** (9 Oct 2026 — there
  is no room on one to charge a room rate or an extra bed for). The table
  stands on its own now: the paragraph under it about rates in force, GST
  percentages and night-by-night pricing came off the same day, and those facts
  are on the Guidelines page.
- **And since 17 Oct 2026 they are a panel beside the form** (the owner: keep
  the categories and their rates on the right-hand side). **A category there
  is one (guest house, booking type) pair** the requester is eligible for,
  labelled ("Hamsanandi - Official booking") and carrying the room rate those
  two resolve to, with its full charge table under it.
  `lib/tariff-categories.ts` builds the list (eligibility from
  `bookingTypesFor`, `guestHousesForBookingType`, the Form Builder's allowed
  houses, kitchens only on a dining booking and `mealsAllowedFor`);
  `components/tariff-panel.tsx` draws it with `TariffTable`, unchanged, once
  per category. The rates card is **gone from the form**.
  > **The panel asks nothing** (31 Oct 2026, the owner: "remove all
  > interactive selection functionality from this table ... users should only
  > be able to view the different tariff categories and their corresponding
  > prices"). It had a radio per category from 17 Oct, and picking one wrote
  > `guest_house_id` and `booking_type` - which made the requester the person
  > who decided which published rate they would be charged at. **The decision
  > is the Guest House Manager's**, taken at approval, and the panel carries
  > one line saying so. The guest house and the kind of booking are still
  > questions on the form itself.

### The tariff category is the manager's (31 Oct 2026, migration 35)

**What the desk chooses.** A tariff row is scoped by guest house, room type,
booking type and requester role. The first two are facts - where the guest
sleeps, which room the party was given - so what is left to decide is the
pair **(booking type, requester role)**, a `TariffScope` (`lib/tariffs.ts`).
That pair *is* the tariff category, and the Guest House Manager answers it as
they approve.

- **Asked where approval happens**: in the allocation dialog
  (`components/room-grid.tsx`, above the override notice) and in **Approve
  meals** (`components/manager-queue.tsx`) - a dining booking has no rooms, so
  that approval is the whole decision. **Confirm & Allocate and Approve meals
  stay disabled until it is answered**, and the server refuses the approval
  too. Nobody else is ever asked: an intermediate approver forwards a request,
  they do not price it, and `reviewBooking` refuses the parameter on any other
  stage.
- **The list is the office's rate sheet**, enumerated (`deskTariffCategories`):
  every row that could price the booking's **defining charge** - the room on a
  stay, the meals on a dining booking - contributes the scope that selects it,
  named by that row's own `note` ("Tariff sheet: Hamsanandi type 3, government
  officers") and falling back to the scope in plain words. So a rate published
  this afternoon is a category on the desk's screen this afternoon, with no
  second list to maintain. Two scopes that price identically are collapsed.
  **One category is stated, not asked** - Bageshri has one room rate;
  Hamsanandi has two, so there the question is compulsory.
- **Stored as the pair**, `bookings.tariff_booking_type` /
  `tariff_requester_role`, both or neither (the database checks it).
  **They are not facts about the requester**: who asked is still `user_role`
  and what kind of stay it is is still `booking_type`, and routing, debitable
  heads and every scoping rule read those two.
- **The invoice is priced at it.** `buildInvoiceDocument` resolves every
  charge at `pricingScopeFor(booking)` - the manager's category, else the
  booking's own facts - which is **one substitution in the single `base`
  object** the rooms, the extra beds and the meals are all resolved from.
  `InvoiceDocument.tariff_category` snapshots the office's wording and
  `invoiceFacts` prints it, so a later renaming of the rate cannot rewrite an
  issued invoice.
- **No rate is stored on the booking**, although the ask said "the selected
  tariff category and price". A stay crossing a rate change is priced night by
  night (`splitByRate`), so one figure would be wrong for it, and a rupee
  amount beside `tariffs` would be a second source of truth for money. The
  price is recorded where it cannot be mistaken for the authority: the
  **booking's log**, which carries what the category stood at the day it was
  chosen, and the **issued invoice**.
- **A booking approved before 31 Oct 2026 has no category** and is priced from
  its own facts exactly as it always was; its invoice prints no category line.
  That absence is how a reader tells the two apart, which is why **no document
  version changed** - `version` governs the lettering of the money table, and
  this round touched no figure in it.
- Open: **a category cannot be corrected after approval**
  ([03-roadmap.md](03-roadmap.md) §2p).
- **Issuing** (`app/actions/invoices.ts` → `store.issueInvoice` →
  `issue_invoice()`) takes the financial year's next serial
  (`GH/2026-27/0001`, prefix and width are Settings) and stores the whole
  document as the snapshot in one transaction. Issued invoices are immutable
  (trigger `invoices_guard`): only the payment can be recorded (**UPI with its
  transaction id, or an account transfer with its UTR** — cash was withdrawn
  on 7 Oct 2026 and both remaining modes require a reference) and the invoice
  cancelled with a reason. A correction is a cancellation plus a new invoice that records
  `replaces_invoice_id`. A draft row only carries the desk's meal-count
  correction and additional charges; it has no number and is priced afresh
  when shown.
- **The PDF** (`lib/invoice-pdf.ts`, server only) is drawn with jsPDF to the
  template's measurements, from the snapshot, never recomputed. Fonts and
  artwork are embedded from `lib/invoice-assets.generated.ts` (regenerate with
  `node scripts/build-invoice-assets.mjs`): Arimo (Arial-metric, has ₹) and
  the **Hindi half of the footer address as an image** rendered from the
  template's Palanquin Dark — jsPDF cannot shape Devanagari. Routes:
  `/api/invoices/[id]/pdf` (desk: any; requester: their own issued invoices;
  others 404) and `/api/invoices/preview/[bookingId]` (desk only, DRAFT
  watermark). The requester's issued invoices show as **Invoice** on
  `/dashboard`.
- **Official invoices go to Accounts.** On issue, `notifyInvoiceIssued()`
  queues `invoice.issued.accounts` To the Setting `accounts_email`, CC the
  requester's HOD (`hodApproversFor`) and the requester, with an attachment
  *reference* on the outbox row (`email_outbox.attachments`); the dispatcher
  renders the PDF at send time. Personal bookings are not mailed. Nothing is
  mailed until the office sets the address.
- **Tariffs & Invoicing console** (`/admin/billing`, manager and developer):
  the rates table with an add form (future rates removable), and the invoice
  Settings group `rules.invoice` — numbering, day basis, GST on rooms and on
  food, SACs, GSTIN, Accounts email, bank details and the footer contact line.
- **Collections** (`lib/collections.ts`): the monthly CSV on `/history` for the
  desk — every invoice issued or paid in the month, then totals by payment
  mode and by debitable head.
- **Who:** manager, caretaker and developer preview, issue and mark paid
  (`canIssueInvoices`); only the manager and developer cancel
  (`canCancelInvoices`). Each action re-checks and writes `invoice.issued`,
  `invoice.paid` or `invoice.cancelled` to the security audit log.
- **After check-out (24 Sep 2026).** Where the desk reaches an invoice:
  the Invoice button on an occupied stay and in **Checking out today**
  (`components/checkouts-today.tsx`); **Checked out — to bill** on both
  `/manager` and `/caretaker` — vacated in the last `UNSETTLED_WINDOW_DAYS`
  (30) and not yet paid, one rule, `awaitingSettlement()`; and the **Approval
  Log** (`/history`), which gives the desk an Invoice button on every
  checked-out stay and approved dining booking, however old
  (`invoiceableFromArchive`), for reprints and late bills.
- **What the page prints (24 Sep 2026).** `invoiceFacts()` builds the two
  columns of facts for the PDF *and* the desk's preview. Project Detail,
  Project Number and Project Sub-head appear **only with the Project head**; a
  the fund's name only with Special Budget - whose **label is snapshotted**
  (`debit_head_label`), so an invoice issued before 8 Oct 2026 still prints
  "Special Funds" while a new one prints "Special Budget". A **dining** invoice
  (`InvoiceDocument.kind`, read through `invoiceKind()` so older snapshots
  work) prints Meal Date(s) (`describeMealDates`) and No. of Guests instead of
  check-in/out, rooms, infants and primary guest, has no room table, and its
  totals read Total / Grand Total (including GST) rather than A+B
  (`invoiceTotalLabels`). The accounts mail follows the same rules.

### Categories I, II and III (4 Nov 2026)

| Category | Who | Hamsanandi | Bageshri | Row's scope |
| --- | --- | --- | --- | --- |
| I | Guests and relatives of employees, parents of students on a personal visit | ₹1,500 | ₹1,000 | The house's general row |
| II | Institute guests on official duty | ₹2,000 | ₹1,500 | `official`, any role, and `official` + role `official` |
| III | Academic visitors | ₹2,500 | ₹2,000 | `official` + role `employee` |

These are the demo seed; the hosted rows are in the repair. A row's `note` names
its category, and the text before the colon is what the sidebar's Table 1 groups
by. **The desk's list stays within the booking's type**, so a personal stay is
Category I and is told rather than asked. **The caretaker invoices personal
bookings only**; `invoiceRoleError` refuses the draft and the issue, and the
invoice dialog shows it as the blocker.

## Dining (Phase 6)

Meals without a room (`service_type: "meals_only"`) for faculty, staff and
offices (`MEALS_ONLY_ROLES`) at guest houses that serve meals. Three doors,
all onto the same form: the portal nav's **Meal Booking**, the **Meal
booking** tile on My Bookings and the public `/book-meal` card, all pointing
at **`/book/meals`** (`MEAL_BOOKING_PATH`, 17 Oct 2026; `?service=meals_only`
still works). **Meals on a stay** are a separate thing and are asked for with
a **Yes / No** on the room form, No by default, with the caretaker line
(`MEAL_CHANGE_NOTICE`) at the foot of the section. `/manager/meals` is the kitchen's day
(manager and caretaker): plates per meal from `kitchenHeadCount`, confirmed and
pending bookings, and **Dining to invoice** — approved dining bookings whose
meals have begun and have no invoice. The daily desk report carries the same
plates and the day's dining bookings.

