# Recent changes — the last round, and only the last round

**This file is deliberately short-lived.** It holds the most recent working
session so the next person (or agent) can pick up without reading everything.
When a new round lands, **delete what is here and write the new round in its
place**. Anything permanent belongs in [03-decisions.md](03-decisions.md) (the
log that accumulates), [02-timeline.md](02-timeline.md) (one row per session)
and `AGENTS.md` (the rules).

---

## Round of 25 September 2026 — the office's fifth list

Nine items relayed by the owner, all done. The list with its status is in
[01-background.md](01-background.md) ("fifth list"); the reasoning is in
[03-decisions.md](03-decisions.md) ("25 Sep 2026"). **Left uncommitted in the
working tree**, as usual.

| Asked for | What was built | Where |
| --- | --- | --- |
| The Assistant Warden sees the student's parents while approving | The Review dialog on `/warden` shows the student's academic record and a Father / Mother / Guardian table checked against it; the queue row says **✓ Matches record** or **⚠ Check names** | `lib/academic/family.ts`, `family-server.ts`, `components/student-record-check.tsx`, `review-queue.tsx`, `app/(portal)/warden/page.tsx` |
| Father / Mother filled in, not typed; the same for every user | Choosing a one-of-each relationship fills the name (and gender) from the student's record, then from the requester's earlier bookings; **Fill in from saved details** on every guest card, every role but the desk. Never ID numbers or ages | `lib/known-guests.ts`, `known-guests-server.ts`, `GuestRow` in `components/booking-form.tsx`, `/book` |
| Additional charges with comments at invoicing | **Additional charges** in the Invoice dialog: description, charged under rooms (18%) / dining (5%) / other (no GST), quantity, ₹ each, comment printed under it | `parseExtraCharges`, `extra_lines` in `lib/invoice.ts`; `components/invoice-dialog.tsx`; **migration 26** |
| Meals added while invoicing not reflected in the price | The preview and the Issue dialog's total only moved after "Save counts". Now repriced as the desk types (`priceInvoiceDraft`) | `app/actions/invoices.ts`, `components/invoice-dialog.tsx` |
| GST 18% rooms, 5% food (the owner edited `public/GHM_Invoice.docx`) | Defaults 18 / 5, the ₹7,500 slab removed, a saved row upgraded once; invoices are `version: 2` in the revised layout — Rate, GST @ 18% on Subtotal (A), GST @ 5% on Subtotal (B), Grand Total (Including GST); `version: 1` snapshots print as issued; long tables continue on a second page | `lib/settings.ts`, `invoiceTable()` in `lib/invoice.ts`, `lib/invoice-pdf.ts`, Tariffs & Invoicing console |
| Special Funds for everyone except students | Added to personal, alumni and IAR Student Cell defaults (debit rules revision 3); **`debitCategoryFor` now files a student as *student* first** — their personal bookings used to count as *personal* and would have got it | `lib/debit-heads.ts` |
| "Add infant" should open an infant card | "Infant N" card: age from a 0–4 list, no Aadhaar / ID upload; the schema requires the age on it | `components/booking-form.tsx`, `lib/booking-schema.ts` |
| Earlier check-in, beside the later check-out | Manage → Extend the stay → **Earlier check-in**, manager and caretaker; the dialog's dates are now a date box + `TimeSelect` (it used `datetime-local`, which the traps list forbids) | `earlierCheckInError` (`lib/operations.ts`), `advanceCheckInAction`, `components/manage-stay-dialog.tsx` |

Also: the e2e `signIn()` now **reuses each account's session** within a run
(the suite had come to need the manager nine times, one over the sign-in
throttle), which also brought the suite from 3.4 min to under a minute.

### Verified

`npm run lint`, `npm run typecheck`, `npm test` (**289**, new
`tests/fifth-round.test.ts`), a production build on the mock store,
`npm run test:e2e` (**22**, new `e2e/fifth-round.spec.ts`: the student's
Father filled in and the warden's badge, the infant card, reception bringing
DM005's check-in forward, an invoice whose total follows typed breakfasts and
a Broken vase charge) — all clean. **Migration 26** in a throwaway
`postgres:16-alpine`: 1–26, 26 again, the shape check, `issue_invoice()`
promoting a draft with a charge, and `invoices_guard` freezing it.

### Still open

- **Apply migration 26 to the hosted project** (and 24, 25 if missing) —
  [04-roadmap.md](04-roadmap.md) §2.
- **The office to confirm** that the tariffs *include* GST at 18% / 5% (the
  "Rates include GST" Setting is still on), and that damage recovered as an
  "Other" charge carries no GST.
- The `.next/` on this machine is a mock-store build (from the e2e run);
  rebuild before `next start` against Supabase. `npm run dev` is unaffected.
- From earlier rounds, unchanged: the alumni guest house matched by name, the
  unused Student Cell debit category, the amber mail header; name each
  council's Faculty Advisor and mailbox — [04-roadmap.md](04-roadmap.md).
