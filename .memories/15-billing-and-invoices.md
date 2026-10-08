# Billing — tariffs, invoices, payments and dining

Phases 5 and 6 (22 Sep 2026), the 24 Sep corrections, the 25 Sep ones (GST per
section, additional charges, live repricing) and the **7 Oct** ones (version 4,
cash retired, a personal stay settled at check-out, Awaiting payment).
**Checked against the code on 7 Oct 2026** — `lib/invoice.ts`,
`lib/tariffs.ts`, `lib/invoice-pdf.ts`, `app/actions/invoices.ts`,
`components/invoice-dialog.tsx`, `components/awaiting-payment.tsx`,
`lib/access.ts`.

## Who does what

| Action | Manager | Caretaker | Developer | Requester |
| --- | --- | --- | --- | --- |
| Preview, correct meal counts, **add additional charges**, issue & print | ✓ | ✓ | ✓ | — |
| **Mark paid** — **UPI + transaction id, or transfer + UTR** (cash withdrawn 7 Oct 2026; both now require a reference) | ✓ | ✓ | ✓ | — |
| **Check out a personal stay** — issue, pay, then Mark as Vacated, in one dialog (7 Oct 2026) | ✓ | ✓ | ✓ | — |
| **Close a personal stay off unpaid**, with a reason that goes in the log | ✓ | — | ✓ | — |
| **Cancel** an issued invoice (reason; a correction is cancel + reissue) | ✓ | — | ✓ | — |
| Tariffs & invoice settings (console) | ✓ | — | ✓ | — |
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

Rates and invoice settings with their defaults are in
[13-settings-and-defaults.md](13-settings-and-defaults.md#console--tariffs--invoicing-manager-and-developer).

## How it works — invoices and tariffs (Phase 5)

The office's invoice template is `public/GHM_Invoice.docx` (revised by the
owner on 25 Sep and again on 30 Sep 2026); its header images are in
`public/invoice/`. **Nothing fills the .docx** — `lib/invoice-pdf.ts` redraws
it with jsPDF, so a change to the template is a change to `invoiceTable()`. The flow,
in the manager's and caretaker's consoles (the **Invoice** button on an
occupied or vacated stay, `components/invoice-dialog.tsx`): **preview →
correct the meal counts and add any additional charges (the figures reprice
as you type) → Save draft (optional) → Issue & print → Mark paid**.

### The layout as printed now (7 Oct 2026) — `version: 4`

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
the invoice. At most 20; the amount has at most two decimals; a dining invoice
has no room section to charge to (`parseExtraCharges`). They are kept as typed
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
  price is a new row. A charge no rate covers is a *problem* on the document
  and blocks issuing (`invoiceBlocker`) — nothing is ever priced at ₹0 by
  omission.
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
  Special Fund's name only with Special Funds. A **dining** invoice
  (`InvoiceDocument.kind`, read through `invoiceKind()` so older snapshots
  work) prints Meal Date(s) (`describeMealDates`) and No. of Guests instead of
  check-in/out, rooms, infants and primary guest, has no room table, and its
  totals read Total / Grand Total (including GST) rather than A+B
  (`invoiceTotalLabels`). The accounts mail follows the same rules.

## Dining (Phase 6)

Meals without a room (`service_type: "meals_only"`) for faculty, staff and
offices (`MEALS_ONLY_ROLES`) at guest houses that serve meals; `/book-meal`
and the **Meal booking** tile on My Bookings open `/book?service=meals_only`. `/manager/meals` is the kitchen's day
(manager and caretaker): plates per meal from `kitchenHeadCount`, confirmed and
pending bookings, and **Dining to invoice** — approved dining bookings whose
meals have begun and have no invoice. The daily desk report carries the same
plates and the day's dining bookings.

