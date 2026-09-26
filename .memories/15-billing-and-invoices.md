# Billing — tariffs, invoices, payments and dining

Phases 5 and 6 (22 Sep 2026), the 24 Sep corrections and the 25 Sep ones
(GST per section, additional charges, live repricing). **Checked against the
code on 25 Sep 2026** — `lib/invoice.ts`, `lib/tariffs.ts`,
`lib/invoice-pdf.ts`, `app/actions/invoices.ts`, `components/invoice-dialog.tsx`,
`lib/access.ts`.

## Who does what

| Action | Manager | Caretaker | Developer | Requester |
| --- | --- | --- | --- | --- |
| Preview, correct meal counts, **add additional charges**, issue & print | ✓ | ✓ | ✓ | — |
| **Mark paid** (cash / UPI + transaction id / transfer + UTR) | ✓ | ✓ | ✓ | — |
| **Cancel** an issued invoice (reason; a correction is cancel + reissue) | ✓ | — | ✓ | — |
| Tariffs & invoice settings (console) | ✓ | — | ✓ | — |
| Monthly collections CSV (`/history`) | ✓ | ✓ | ✓ | — |
| Download own issued invoice (`/dashboard`) | — | — | — | ✓ |

## Where the desk finds a stay to bill

- The **Invoice** button on an occupied stay, and in **Checking out today**.
- **Checked out — to bill** on `/manager` and `/caretaker`: vacated in the
  last 30 days and not paid (`awaitingSettlement`).
- The **Approval Log** (`/history`): an Invoice button on every checked-out
  stay and approved dining booking, however old (`invoiceableFromArchive`).
- Dining: "Dining to invoice" on the kitchen page (`/manager/meals`).

Rates and invoice settings with their defaults are in
[13-settings-and-defaults.md](13-settings-and-defaults.md#console--tariffs--invoicing-manager-and-developer).

## How it works — invoices and tariffs (Phase 5)

The office's invoice template is `public/GHM_Invoice.docx` (revised by the
owner on 25 Sep 2026); its header images are in `public/invoice/`. The flow,
in the manager's and caretaker's consoles (the **Invoice** button on an
occupied or vacated stay, `components/invoice-dialog.tsx`): **preview →
correct the meal counts and add any additional charges (the figures reprice
as you type) → Save draft (optional) → Issue & print → Mark paid**.

### GST and the table as printed (25 Sep 2026)

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
was, **Charged under** (Room charges (A) at the room GST, Dining charges (B)
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
  (trigger `invoices_guard`): only the payment can be recorded (cash, UPI with
  its id, account transfer with its UTR) and the invoice cancelled with a
  reason. A correction is a cancellation plus a new invoice that records
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

