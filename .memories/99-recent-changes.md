# Recent changes — the last round, and only the last round

**This file is deliberately short-lived.** It holds the most recent working
session so the next person (or agent) can pick up without reading everything.
When a new round lands, **delete what is here and write the new round in its
place**. Anything permanent belongs in [03-decisions.md](03-decisions.md) (the
log that accumulates), [02-timeline.md](02-timeline.md) (one row per session)
and `AGENTS.md` (the rules).

---

## Round of 30 September 2026 (afternoon) — the supervisor's review of the live site

**Left uncommitted in the working tree**, as usual — **together with the
morning's UI revamp second pass**, which the owner has not committed either
(the first pass is `cef57f6`). The supervisor went through
https://guest-house-iit.vercel.app/ and sent a short list; the owner relayed
it and answered three questions about what it meant. Status in
[01-background.md](01-background.md) ("The supervisor's review — 30 Sep
2026"); reasoning in [03-decisions.md](03-decisions.md) ("30 Sep 2026
(afternoon)").

| Asked for | Now |
| --- | --- |
| Landing page: "First sentence ?" | The owner: **promise less, keep it vague**. The hero line is now "Bageshri and Hamsanandi provide accommodation on campus for guests of the institute." (names from the store) — it used to list who stays ("visiting faculty, collaborators, examiners and the families…") and was a fragment. `app/(site)/page.tsx` |
| "Meeting room and exercise room (common) ?" | The owner: **remove both**. `amenities()` returns **six** (AC, bathrooms, Wi-Fi, TV, fridge, Dining / Reception); the grid is 1 / 2 / **3** columns. `lib/site-content.ts` |
| "Take couple of photos — AM" | Not code: AM is to photograph the guest houses. On the roadmap |
| Booking page: remove "From the institute's academic database (Student)." | Gone. `describeSource()` returns null for a record found; the fallbacks ("no record… from your portal profile", "could not be reached") still say so. `components/academic-details.tsx` — the same card on `/warden` |
| Personal Funds note → "Invoice will be generated and can be settled at the time of checkout. Multiple payment options are available at the guest house." | `PAY_AT_CHECKOUT_NOTE` is now "**An** invoice will be generated…" (article added). On a fixed head it prints as its own line under the head's name, and only when that head is Personal Funds. `lib/debit-heads.ts`, `components/booking-form.tsx` |
| Availability legend: "Let's not show all these to users — overlap need not be shown" | Requesters see **Booked / Free / Today** only: no turnaround, no overlap, maintenance drawn as booked ("not available" on hover). The **desk and developer** keep the full legend (`getRoomAvailability` returns `detailed` for `gh_manager`, `gh_caretaker`, `developer`). Both charts take `simple`; one shared `AvailabilityLegend`. Applies to the booking form's panel **and** `/availability` |
| "Times are institute local time…" → "Times are IST. …" | Both panels' notes say "Times are IST." |
| "Fill in from saved details — let the student write their name as well" | The owner's reading: **a student can book for themselves**, and should be able to fill in their own details. **"Yourself — <name>"** is now the first entry in Fill in from saved details for a **student or employee** (the record's name, else the profile's; relationship **Self**). **Self** is a new option on the student relationship list and one-of-each; it is neither a parent nor a dependent. `lib/known-guests.ts` (`knownGuestSelf`, `SELF_RELATIONSHIP`), `lib/types.ts`, `lib/form-config.ts` |
| Invoice: Room Charges Subtotal (A), GST @ 18% on A (B), Dining Charges Subtotal (C), GST @ 5% on C (D), Grand total (A+B+C+D) — "I've already updated the .docx, fix the code that fills it" | Nothing *fills* the .docx — `lib/invoice-pdf.ts` redraws it. New invoices are **`version: 3`**: every figure lettered in turn, **Other Charges Subtotal (E)** when the desk added any, **Grand Total (A+B+C+D[+E])**; a dining invoice letters from its own subtotal (A, GST on A (B)). A **Round off** row appears only where GST is added on top and the rupee rounding makes the letters not add up. **Version 2 and 1 snapshots reprint exactly as issued.** The dialog's "Charged under" says Dining charges (C); the collections CSV and the accounts mail went unlettered |

### Verified

`npm run lint`, `npm run typecheck`, `npm test` (**312**: new
`tests/sixth-round.test.ts`, the invoice cases in `fifth-round.test.ts`, the
amenities in `public-site.test.ts`), a production build on the mock store,
`npm run test:e2e` (**26**, its invoice check now reads "GST @ 18% on A (B)").
HTTP smoke test on a dev server over a **copy** of the mock database
(`MOCK_DB_PATH`): the home page's new line and no meeting / exercise room;
`/book` as Anjali shows "Yourself — Anjali Menon", the Self option and the new
payment note, and the academic card rendered with no caption; Dr. Priya Sharma
gets "Yourself"; the official admin account does not. The simplified legend is
drawn client-side after the fetch and was **not** looked at in a browser
(headless Chrome avoided at the owner's request) — typecheck and build only.

### Still open

- **The .docx has a typo**: its dining GST row reads "GST @ 5% on **B** (D)";
  the supervisor's list and the generated PDF say "on **C** (D)". Fix the
  template if it is going to anyone.
- **A saved Form Builder row for students wins over the new default** — if the
  hosted project has one, add **Self** to its relationship options (and One of
  each), or press Reset to spec defaults; until then "Yourself" fills the name
  but not the relationship. The local mock database has none.
- **Office to confirm** a student may be a guest on their own request (the
  owner's reading of the supervisor's note), and whether employees should get
  "Yourself" too (they do now).
- AM's photographs; the placeholder house rules (Guidelines §7–8) and the
  remaining amenities; apply migrations 24–26 to the hosted project;
  GST-inclusive tariffs; each council's Faculty Advisor and mailbox —
  [04-roadmap.md](04-roadmap.md).
- The `.next/` on this machine is a mock-store build (from the e2e run);
  rebuild before `next start` against Supabase. `npm run dev` is unaffected.
- Mail still has the old amber header.
