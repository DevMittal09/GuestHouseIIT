# Recent changes - the last round, and only the last round

This file is **replaced** every round, not appended to. The round before this
one is written up where every round is: what was asked in
[01-background.md](01-background.md), why it was done that way in
[02-decisions.md](02-decisions.md).

---

## Round of 31 October 2026 - the tariff category becomes the manager's

The owner's fifteenth list, three items and one documentation item:

1. The New Booking page keeps the tariff table on the right, **showing every
   category and its prices, with no selection at all** - "do not allow users
   to decide or assign the applicable tariff category while creating a booking
   request".
2. **The Guest House Manager chooses the category when the request reaches
   them**, from the categories and prices the office has published, "based on
   the actual nature of the booking".
3. **The invoice is priced at what the manager chose**, not at anything the
   requester picked; the choice is stored against the booking and traceable,
   and nothing is invoiced before approval.

### The idea the whole round turns on

A tariff row is scoped by **guest house, room type, booking type and
requester role** (`resolveTariff`). The first two are facts - where the guest
sleeps, which room the party was given. The other two are a **judgement about
the visit**, and until this round the requester was making it by filling the
form in: the office prices Hamsanandi's rooms at ₹2,000 generally and ₹4,000
"for government officers", and that second row was reachable only by an
office's *own* account, so a dignitary booked for by a department's faculty
was charged ₹2,000.

So **the category is that pair** - a `TariffScope` - and the desk decides it.
Nothing new was added to `resolveTariff`, no column was added to `tariffs`,
and no rupee figure is stored anywhere near a booking.

### What changed

| Where | What |
| --- | --- |
| `lib/tariffs.ts` | **`TariffScope`**, `tariffScopeKey`, `parseTariffScope` (two parts, both checked against the unions), **`pricingScopeFor`** (the manager's category, else the booking's own facts), `hasChosenTariffCategory`, `tariffCategoryItems`, `describeTariffCategory` / `describeTariffCategoryScope` |
| `lib/tariff-categories.ts` | **`deskTariffCategories`** - the desk's list, **enumerated from the office's rate sheet**: every row that could price the booking's defining charge contributes the scope that selects it, named by that row's own `note`. Plus `deskCategoryFor`. The requester's `tariffCategories` is unchanged |
| `lib/tariff-categories-server.ts` | **New.** `deskCategoriesFor` / `deskCategoriesByBooking` - the server readers, one query per page |
| `lib/invoice.ts` | `buildInvoiceDocument` resolves every charge at `pricingScopeFor(booking)` - **one substitution, in the one place the whole invoice is priced from**. `InvoiceDocument.tariff_category` snapshots the office's wording, and `invoiceFacts` prints it |
| `components/tariff-panel.tsx` | **Read-only, and a server component again**: every eligible category with its full charge table, and one line saying who confirms which applies |
| `components/tariff-category-choice.tsx` | **New.** The desk's question. One category is **stated, not asked** |
| `components/room-grid.tsx` | Asks it above the override notice; **Confirm & Allocate stays disabled until it is answered** |
| `components/manager-queue.tsx` | The same question in **Approve meals** - a dining booking has no rooms, so that approval is where its category is decided |
| `components/booking-details.tsx` | The chosen category, as a line of plain text |
| `app/actions/bookings.ts` | `allocateRooms(…, tariffCategory)` and `reviewBooking(…, tariffCategory)`: **re-derived from the rate sheet, never trusted**; refused where several categories exist and none was chosen; refused outright on any other stage's approval. The price it stood at goes in the log |
| `lib/store/*`, `lib/store/types.ts` | `StatusUpdate.tariff_scope`, written with the approval by both stores |
| **migration 35** | `bookings.tariff_booking_type` / `tariff_requester_role`, with the same checks `tariffs` uses and a **both-or-neither** constraint |

### Three decisions worth knowing

- **No stored rate.** A stay crossing a rate change is priced night by night,
  so one figure would be wrong for it, and a rupee amount beside `tariffs`
  would be a second source of truth. The price lives where it cannot be
  mistaken for the authority: the **booking's log**, which records what the
  category stood at the day it was chosen, and the **issued invoice**.
- **No new document version.** The category prints as a conditional fact, so
  every invoice issued before today reprints byte-identical. `version` governs
  the lettering of the money table, which this round did not touch - it is
  still **5**.
- **A booking approved before today has no category**, and is priced from its
  own facts exactly as it always was. Inventing one for it would be the
  "default tariff" the round exists to rule out, and its invoice prints no
  category line.

### What this reverses

The panel's radios are 17 Oct 2026's, and "a *named* category stored on the
booking is deliberately not built" was that round's reasoning. Both are
superseded in [02-decisions.md](02-decisions.md), and
[03-roadmap.md](03-roadmap.md) §2j's open question is **answered**: the office
did want the sheet's own wording, and it cost no new dimension in
`resolveTariff` because the category is a scope rather than a label.

### Verified

`npm run lint`, `npm run typecheck`, **`npm test` (627 in 37 files)**,
`npm run build`, **`npx playwright test` (51 journeys)** and
`npm run check:memories`. Migration 35 applied twice in a throwaway
`postgres:16-alpine`, and its three refusals checked: half a category either
way, and a value outside the enum.

New tests: `tests/fifteenth-round.test.ts` (17, the rules on plain data),
`tests/store-tariff-category.test.ts` (2, the seeded demo database through the
store and into an invoice) and `e2e/fifteenth-round.spec.ts` (the desk asked,
blocked until it answers, and the invoice charging ₹4,000 rather than ₹2,000).
Three existing specs were updated where the panel used to be the control.

### Left open

- **A category cannot be corrected after approval.** There is one writer and
  it is the approval; cancelling and reissuing an invoice reprices at the same
  category. [03-roadmap.md](03-roadmap.md) §2p.
- **Migration 35 is not applied to the hosted project** - that is a production
  change, in the order [04-production.md](04-production.md) §1a.1 sets out.
- **A guest house with several room rates makes the question compulsory.** At
  Bageshri there is one category and the desk is only told; at Hamsanandi
  there are two and nothing can be approved without an answer. If the office
  publishes a third rate there, the list grows on its own - which is the point
  - but so does what the desk has to read on every approval.
