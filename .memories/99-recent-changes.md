# Recent changes — the last round, and only the last round

**This file is deliberately short-lived.** It holds the most recent working
session so the next person (or agent) can pick up without reading everything.
When a new round lands, **delete what is here and write the new round in its
place**. Anything permanent belongs in [03-decisions.md](03-decisions.md) (the
log that accumulates), [02-timeline.md](02-timeline.md) (one row per session)
and `AGENTS.md` (the rules).

---

## Round of 1 October 2026 — the office's seventh list

Sixteen items, relayed by the owner, mostly about the **meal booking** and the
desk. Status item by item in [01-background.md](01-background.md) ("The
office's seventh list — 1 October 2026"); reasoning in
[03-decisions.md](03-decisions.md) ("1 Oct 2026").

| Asked for | Now |
| --- | --- |
| Meal booking: each person's own preference, not one for the group | `bookings.meal_diet_counts` (**migration 27**): `{veg, non_veg}`, adding up to the head count (`dietCountsError`, both sides). The form asks for both as dropdowns; `mealDietCounts()` is the one reader and spreads a pre-1-Oct booking's single `meal_preference` over its head count, so legacy rows read the same everywhere. `kitchenHeadCount` splits plates per kind and keeps `unknown` honest |
| Meal bookings in their own card on the desk while awaiting approval | `/manager`: **Incoming room requests** and **Incoming meal bookings** (days and sittings, people, preferences — no check-in, check-out or rooms). `ManagerRow` is now rooms-only; `MealRequestRow` is new. The caretaker has no approval queue |
| Availability console: only the grid, no details — for users, not the desk | The room-by-room list and the holds footnote render only when `detailed` (manager, caretaker, developer), the flag the simplified legend already used |
| Copy-to mail not reaching the addresses given | **The addressing was already right** and is now tested on submission, allocation, rejection and cancellation. The cause is **`MAIL_REDIRECT_ALL_TO`**, which drops CC at send time. `/admin/mail` now shows a red warning naming the mailbox and saying Copy-to receives nothing; `.env.example` says so too. **Action for the owner: unset it in the Vercel environment** |
| Remove "choose the project" — type it instead | The dropdown is gone. `debitDetailsPrompt("project_grant")` is "Project number and title" and `debitDetailsRequired` makes it mandatory; the invoice still splits "number — title". `project_id` is no longer asked for (still validated if a payload carries one) |
| Move "Fill in from saved details" somewhere less prominent | A compact `Fill in…` select on each guest card's header line (label `sr-only`), not a full-width labelled dropdown above every guest |
| Remove auto-fill even for parents | Choosing a relationship fills in nothing. `onRelationshipChosen` and `autoFillFor` are gone; `prefillFor` is unused by the form |
| DD/MM/YYYY everywhere | `formatInstituteDate` → `10/09/2026`, `formatInstituteDateTime` → `10/09/2026, 12:00 PM`, `formatDateValue` → `Tue 15/09` / `15/09/2026` (`month: false` still gives the bare day for a calendar cell). Native `<input type="date">` still follows the browser's locale — nothing can change that |
| Late entry check-in | Two fixes: the desk can move a check-in **later** as well as earlier (`moveCheckInError`, `moveCheckInAction`, the "Move check-in" control), and a new booking's check-in may be **any time today** instead of strictly in the future (`earliestBookableCheckIn`; yesterday still refused) |
| Special Funds off a personal **meal** booking | `DEFAULT_DEBIT_RULES.dining.personal = ["personal_funds"]`, `FORBIDDEN_DINING_HEADS` as a floor under Settings, `DEBIT_RULES_REVISION` **4** withdraws it from a stored row once |
| A limit of 30 for a meal booking, counting who is already booked | `rules.meals.max_diners_per_meal` (Settings, 30, 0 = off). The schema caps one booking at it; `createBooking` checks the **sitting** per day and per meal against every live booking (`mealPlatesBooked`, `mealCapacityError`). A pending request holds its places |
| Lunch checked by default instead of all | `DEFAULT_MEALS_ON` — **on a meal booking**. A stay still starts with nothing ticked (defaulting meals on there would bill dining charges nobody asked for). The form now holds a `Map<slot, boolean>` of decisions (`mealSlotsFromChoices` / `choicesFromMealSlots`) instead of opt-outs |
| No pet disclaimer on a meal booking | The notice card renders only for a stay |
| A confirmation message at the end of the meal booking | A live **Confirm your meal booking** card: kitchen, people, preferences, each day and its sittings, who pays, remarks |
| A scroll option for the number of people | A `1…30` dropdown, not `QuantityInput` |
| Purpose → **Remarks**, optional, on a meal booking | Optional for `meals_only` only; a stay still has to say what it is for (a new refinement, since the field itself is no longer `min(5)`) |

### Also

- **The guidelines** now state the kitchen's limit and the lunch default
  (`lib/site-content.ts`), rendered from the Setting as everything else there is.
- **Settings → Meal serving times** gained **People per sitting**.
- `updateBookingMeals` (no caller yet) takes `meal_diet_counts` and clears the
  legacy `meal_preference`, so the two cannot disagree.

### Verified

`npm run lint`, `npx tsc --noEmit`, **`npm test` — 338 passed** (new
`tests/seventh-round.test.ts`, 25 cases), a production build on the mock store
(`NEXT_PUBLIC_SUPABASE_URL=`), and **`npm run test:e2e` — 28 journeys**: the
dining journey rewritten for the split, the people dropdown, Remarks, the
absent pets notice and the new manager section; **two new journeys** (30
booked for one sitting and the 31st refused; a requester gets the availability
grid, the desk also gets the room list); and the fifth-round journey now
proving that a relationship fills in **nothing**, that the Fill-in list fills
the card, and that a check-in moves both ways.

**Migration 27 in a throwaway `postgres:16-alpine`**: 1–27 applied, 27 applied
again, a valid split stored, null accepted, and a negative count, a stray key
and an array each refused by the check. A check constraint may not contain a
subquery — the first draft counted keys with `jsonb_object_keys` and Postgres
refused the migration.

**HTTP smoke test** on a dev server over a freshly seeded throwaway mock
database (`MOCK_DB_PATH`, `DEV_LOGIN=true`): the dining form renders the
people dropdown, "Remarks (optional)", the kitchen's limit, the confirmation
card and **no pets notice**; the manager's console shows **Incoming room
requests** and **Incoming meal bookings** with "5 vegetarian, 3
non-vegetarian" from the seed; the student's form has the compact "Fill in…"
control; and every date reads `21/09/2026, 12:00 PM`. Not looked at in a
browser beyond the Playwright run — headless Chrome avoided, as asked.

### Still open

- **`MAIL_REDIRECT_ALL_TO` must be unset in the Vercel environment** or no
  Copy-to address will ever receive mail. `.env.local` on this machine still
  sets it (deliberately — `AGENTS.md` says to keep it on every non-production
  deployment).
- **Migration 27 has to be applied to the hosted project**, with 24–26 which
  were already outstanding. Until it is, a booking with meals is stored without
  its split and reads back through the legacy preference — the store leaves the
  column out when there is none.
- A **saved Form Builder row** still wins over changed defaults; nothing in
  this round touched `RoleFormConfig`, so no reset is needed.
- The office may want the **split per named guest** on a room booking one day;
  today it is counts there too.
- AM's photographs; the placeholder house rules (Guidelines §7–8); GST-inclusive
  tariffs; each council's Faculty Advisor and mailbox — [04-roadmap.md](04-roadmap.md).
