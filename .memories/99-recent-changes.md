# Recent changes — the last round, and only the last round

This file is **replaced** every round, not appended to. The round before this
one is written up where every round is: what was asked in
[01-background.md](01-background.md), why it was done that way in
[02-decisions.md](02-decisions.md).

---

## Round of 11 October 2026 — the office's eleventh list

Three items, relayed by the owner. **No migration**, no Setting, no change to
any stored shape. One is a rule; two are copy.

### What was asked

> ~ For director, its showing "Requires HOD Approval" but since his office
> doesnt have a HOD it shouldn't show that right [It is showing "Nobody is set
> as HOD for your office yet - it would go straight to the manager." though but
> i would prefer that it shouldn't show that button itself]
>
> ~ "Pets are not allowed in the guest house premises." is only required in the
> guidelines no need to show it here.
>
> ~ Mention "These field are mandatory for those shown with *" Whenever we are
> using it [*].

---

### 1. An office with no HOD is not asked how its booking is approved

**`asksOfficeApproval(role, service, hasHodApprover)`** in `lib/workflow.ts` is
the one rule, read by all three places that used to decide it separately:

| Place | Before | Now |
| --- | --- | --- |
| `components/booking-form.tsx` | The **Approval** card for every office, the HOD option hinted "Nobody is set as HOD for your office yet - it would go straight to the manager." | The card only where somebody gives that approval; the hint is **deleted**, because the option it explained is never rendered |
| `lib/booking-schema.ts` | "Choose Direct or Requires HOD approval" demanded of every office room booking | Demanded only where the question was put (`BookingSchemaContext.hasHodApprover`, **defaulting to true** so every older caller is unchanged) |
| `app/actions/bookings.ts` | `isOfficeRole && wantsRooms ? payload.office_approval : null` | The same, but **`"direct"`** where the question was not put - whatever the payload carried. Overwritten, not refused, exactly as a personal booking's debitable head is |

`hodApproversFor(requester, units)` (minus whoever is submitting) is now read
**once** in `createBooking` and handed to both the schema and the route; it
used to be computed only for the route.

Nothing about routing changed: `routeFor` has always dropped the HOD stage when
`hasHodApprover` is false, which is *why* the question had one answer. The
Director's Office (`unit-director-office`, `head_id: null`) is the case the
office reported; the CSE Department Office still chooses, and its HOD option
now reads "Prof. R. Venkatesh (HOD, CSE) approves it first." Appointing a head
in Departments & Clubs brings the card back - it is computed per request, never
stored.

### 2. The pets notice comes off every booking form

The amber card with `PETS_POLICY_NOTICE` is gone from
`components/booking-form.tsx` (and `TriangleAlertIcon` with it - it had no
other use). The constant is **unchanged**, and the rule keeps both its other
homes:

- the Guidelines page, "During your stay" → "Pets are not allowed";
- the **"Pets" line in every booking mail** (`lib/mail/templates.ts`), on every
  message about a booking rather than the confirmation alone.

It had been a room-bookings-only card since 1 Oct 2026 and a notice without a
tick box before that. A house rule is not a rule the form enforces, so the
form is not where it is briefed.

### 3. Every form that stars a field says what the star means

**`components/required-fields-note.tsx`** (new) holds
`MANDATORY_FIELDS_NOTE` - **"Fields marked with * are mandatory."** - and the
`RequiredFieldsNote` that draws it, above the first starred label:

| Form | Where |
| --- | --- |
| The booking form | Under the "Booking as" line, above the first card (it is not a `Card`, so `.numbered-sections` does not number it) |
| Users & Roles → Add / Edit user | Under the dialog's description |
| Reject a request (`components/review-queue.tsx`) | Under the dialog's description, which **lost** "A reason is mandatory." - with the note above it, that said it twice |

No star moved, and no field changed whether it is required.

---

### Files changed

| File | Change |
| --- | --- |
| `lib/workflow.ts` | **`asksOfficeApproval`** added beside `isOfficeRole` |
| `lib/booking-schema.ts` | `BookingSchemaContext.hasHodApprover`; the `office_approval` refinement reads `asksOfficeApproval` |
| `app/actions/bookings.ts` | `hasHodApprover` read once, passed to the schema and the route; `officeApproval` records `"direct"` when the question was not put |
| `components/booking-form.tsx` | The Approval card is conditional (`asksApproval`); the "Nobody is set as HOD" hint, the pets card and the `PETS_POLICY_NOTICE` / `TriangleAlertIcon` imports are gone; `RequiredFieldsNote` at the top; the client's schema pass is given `hasHodApprover` |
| `components/required-fields-note.tsx` | **New.** `MANDATORY_FIELDS_NOTE` + `RequiredFieldsNote` |
| `components/admin/users-manager.tsx`, `components/review-queue.tsx` | Render `RequiredFieldsNote`; the reject dialog's description loses its mandatory sentence |
| `tests/eleventh-round.test.ts` | **New**, 11 checks |
| `e2e/eleventh-round.spec.ts`, `e2e/helpers.ts` | **New** spec, 2 journeys; `ACCOUNTS.directorOffice` and `ACCOUNTS.departmentOffice` (existing dummy LDAP logins, not new accounts) |
| `e2e/official-and-dining.spec.ts` | The pets assertion's comment - it is off every form now, not just a dining one |
| `AGENTS.md` | The house-style list gains the two copy rules (and is retitled "7, 8, 9 and 11 Oct"); the pipeline section gains "An office with no HOD is not asked" |

### How it was checked

`npm run lint`, `npm run typecheck`, **`npm test` (462 checks, 27 files)**,
`npm run build`, and **`npm run test:e2e` (38 journeys, all passing)** against
a production build on the mock store. The two new journeys sign in as the
Director's Office (no Approval card, no pets notice, the star note visible) and
as the CSE Department Office (both radios, the HOD named).

The unit tests cover the new rule from both sides: `asksOfficeApproval` for
every role and service, the seeded units behind it (`unit-director-office` has
no approver, `unit-cse-office` resolves to `hod-cse` through its parent), the
schema demanding a choice only where the question was put, the round trip, a
payload carrying `"hod"` being accepted rather than refused, and the default
(absent means "somebody does") keeping older callers honest. Plus a guard that
the Guidelines still state the pets rule, so removing the card did not lose it.

### Left open

Two small things, in [03-roadmap.md](03-roadmap.md) §2c: nothing warns the
person naming or clearing a unit's head that an office's form will start or
stop asking the approval question, and nothing but the written rule makes a
*new* starred form render `RequiredFieldsNote`.
