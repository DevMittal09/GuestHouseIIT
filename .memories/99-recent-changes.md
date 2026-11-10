# Recent changes - the last round, and only the last round

This file is **replaced** every round, not appended to. The round before this
one is written up where every round is: what was asked in
[01-background.md](01-background.md), why it was done that way in
[02-decisions.md](02-decisions.md).

---

## Round of 10 November 2026 - seven corrections from the owner

Seven items, sent as one list the morning after the meeting round was
committed, and **committed one at a time** at the owner's request so a limit
mid-round leaves a checkpoint rather than a half-finished tree.

| # | Asked | Done |
| --- | --- | --- |
| 1 | "Try different colours for each guest house for guest house manager console" | Four tokens of their own, on the switcher chip and the console caption |
| 2 | "Make the Type of Booking to be more visible in the Review of GHM also" | Leads the queue cell, the allocate dialog's header and the record |
| 3 | "Issue & print as well as Mark Paid should come in green colour" | `variant="occupy"`, the desk's existing green |
| 4 | "Invoice number should be more noticeable in the invoice" | 14pt bold on the PDF, its own serif line in the dialog |
| 5 | "Category we dont need to show all categories for personal bookings and all" | `tariffCategoriesFor(bookingType)`, applied in three places from one rule |
| 6 | "Booking period should be 14 days max for everyone so limit it in the checkout calender selection" | Every exemption withdrawn; the cap is the calendar's `max` |
| 7 | "Calender-only input for dates no typing input" | `DateField` replaces every `<input type="date">` on the booking flow |

### The two that are reversals, and why they are taken

**Item 6 withdraws two exemptions, one of them a day old.** The meeting of
9 Nov said in its own list that "official bookings and GHM-created bookings"
have no maximum duration, and that was implemented. Underneath it was an older
exemption still: `BOOKING_DURATION_EXEMPT_ROLES` let the `official`,
`gh_manager` and `developer` **roles** book any length, and
`DIRECTOR_OFFICE_EMAILS` did it by address. All of it is **deleted**, and
`stayLengthError` / `latestCheckOutDate` now take no role, address or booking
type at all - a parameter nothing reads is an exemption waiting to be
reintroduced.

The reason this is not a loss: `latestCheckOutDate` returned **null** for
every exempt case, so the picker offered no limit at all - the opposite of
"limit it in the checkout calender selection". And the escape hatch is
unchanged and better: a stay that must run longer is **extended by the desk
after approval** (`extendStayAction`, from Manage), which has never consulted
this rule. The institute can still host a three-week visit; what it can no
longer do is book one on a form nobody reviewed for length.

**Item 5 narrows what the meeting had just widened**, and the office's own
words decide it: Category I is "parents of students **on a personal visit**",
II is "institute guests **on official duty**", III is "academic visitors". So
a personal stay has exactly one rate and the panel states it instead of
listing three, two of which could never be charged. **Alumni keep all three** -
the sheet says nothing about them, and hiding the one the desk turns out to
need would leave a stay that cannot be invoiced at all.

### The colours, and why they are new tokens

Every accent this service has already means something: vermilion is the brand
and Reject and Full, saffron marks an official request, green is check-in,
indigo check-out, violet an accepted overlap. **Hamsanandi in green would have
read as "occupied"** on every screen it appeared on. So `--gh-1`..`--gh-4` are
four hues clear of all six, each carrying white text above 7:1, and they are
**identity, never state**: the switcher chip and the console's caption only.

Assigned by the guest house's **position** in the store's ordered list, never
by name - guest houses are created and renamed from the console, so a colour
keyed on "Bageshri" would be lost the day somebody fixed a typo. Four because
that is a real cycle; a fifth guest house reuses the first, which is bounded
and honest.

### The date control, and the two seams it needed

`<input type="date">` was wrong three ways, and the third cost bookings: it can
be **typed into**, and a half-typed date looks valid; it renders in the
**browser's own locale**, so the one control in a portal that reads DD/MM/YYYY
everywhere read MM/DD/YYYY for anybody on en-US (`lib/tz.ts` had noted it
could do nothing about this); and **`min` / `max` bound only the picker**, so
a typed date outside them submitted and was refused afterwards.

`DateField` is a button that opens the calendar. With no text path, the
advance window and the stay cap are enforced **by the control**. It still
carries the same `"yyyy-MM-dd"` string, so every caller's state, validation
and submission are untouched - the control was swapped, not the data.

- **`CalendarDayButton` gains `data-date="yyyy-MM-dd"`.** `data-day` beside it
  is `toLocaleDateString`, which reads "13/11/2026" on one machine and
  "11/13/2026" on another: fine as a label, useless as a selector.
- **`pickDate()`** in `e2e/helpers.ts` opens the calendar and clicks the day,
  stepping months until it is rendered. It replaces `.fill()` on a date field
  across **nine** specs, because the field is controlled and carries no `name`.

### Changed

| Area | Files |
| --- | --- |
| Guest house colours | `app/globals.css` (`--gh-1`..`4`), **`lib/guest-house-accent.ts`** (new), `components/link-tabs.tsx` (`activeClass`), `components/page-header.tsx` (`captionClass`), `/manager` and `/caretaker` pages |
| Booking type | `components/manager-queue.tsx` (the cell, the dialog header, the column renamed from "Category"), `components/booking-details.tsx` |
| Invoices | `components/invoice-dialog.tsx` (both buttons green, the number its own line), `lib/invoice-pdf.ts` (14pt bold, per-row heights), `lib/invoice.ts` (`INVOICE_NUMBER_LABEL`) |
| Tariff categories | `lib/tariff-category.ts` (`tariffCategoriesFor`, the sheet narrows), `components/tariff-panel.tsx`, `components/room-grid.tsx`, `components/manage-stay-dialog.tsx` |
| The stay cap | `lib/policy.ts` (three deletions, two signatures), `lib/booking-schema.ts`, `components/booking-form.tsx`, `lib/site-content.ts`, `components/admin/settings-manager.tsx` |
| Dates | **`components/ui/date-field.tsx`** (new), `components/ui/calendar.tsx` (`data-date`), `components/booking-form.tsx`, `components/meal-dates-picker.tsx`, `components/manage-stay-dialog.tsx` |
| Tests | `tests/meeting-decisions.test.ts` (the narrowing rule; the cap test rewritten), `tests/settings.test.ts`, `e2e/helpers.ts` (`pickDate`) and nine specs |
| Rules | `AGENTS.md` - a 10 Nov override block, and the 9 Nov duration sentence struck through |

### Checks

`npm run lint`, `npm run typecheck`, **690 tests in 41 files** and
`npm run build` all clean after every one of the seven commits. The calendar
was proved in a real journey (`e2e/club-booking.spec.ts`, which picks both
dates) against a production build before the suite was run whole.

**Playwright: 16 / 37 before, 20 / 33 after the seven changes, 16 / 37 again
after fixing them.** The baseline was taken **before** the first commit for
exactly this reason, and it earned its keep: without it the four regressions
would have been indistinguishable from the sixteen pre-existing failures
([03-roadmap.md](03-roadmap.md) §2t).

The four, because each was a different kind of mistake:

| What broke | Why |
| --- | --- |
| `getByLabel("Move check-in").fill()`, `#meal-date-0.inputValue()` | the control is a button now - mechanical, and what `pickDate` / `dateFieldValue` are for |
| `getByRole("button", { name: "Move check-in" })` ambiguous | a date **trigger is a button**, so its `<Label>` became an accessible name and collided with the action button beside it. Genuinely ambiguous to a screen reader, not only to Playwright; the label is now "New check-in date" |
| `getByText(/Issued/)` matched twice | **my own copy**: the dialog description began "Issued …" and so matched the status badge too |
| the tariff sidebar expected all three categories | the spec was **right to fail** - a faculty form opens on Official, which is II or III only. It now asserts the narrowing in both directions, so it tests the rule rather than noticing its edge |

The lesson, in [22-running-and-testing.md](22-running-and-testing.md): a suite
with known failures is still worth running - what matters is the **delta**.

No migration, no schema change, nothing written to the shared database.

### What this opens

- **Whether a personal alumni stay has a category**, in
  [03-roadmap.md](03-roadmap.md): all three are offered because the office's
  sheet does not say, which is the safe reading and not an answer.
- **Four date inputs still use the native control** - the archive's filter
  bar, `/availability`, the kitchen's day view and two console pages. They
  browse or filter rather than book, so none of them carries a rule a typed
  date could evade; converting them is tidiness, not correctness.
