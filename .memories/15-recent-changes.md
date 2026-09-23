# Recent changes — the last round, and only the last round

**This file is deliberately short-lived.** It holds the changes from the most
recent working session so the next person (or agent) can pick up without
reading the whole decision log. When a new round of changes lands, **delete
what is here and write the new round in its place** — the old entries do not
accumulate. Anything worth keeping permanently belongs in
[06-decisions.md](06-decisions.md), which is the log that *does* accumulate,
and in [AGENTS.md](../AGENTS.md), which is the rules.

So: if you are reading this to find out what happened six weeks ago, it is the
wrong file. Try [06-decisions.md](06-decisions.md).

---

## Round of 23 September 2026 — the office's third correction list

Seven items, reported after the office worked through the portal. One turned
out to be already built; the other six are below. Everything was verified with
`npm run lint`, `npm test` (219), `npm run build` and `npm run test:e2e` (14).

### 1. The IAR Student Cell was asked to pick a guest house it was never offered

**Symptom.** The Student Cell books only for alumni, and alumni are
accommodated at Bageshri — so the form has exactly one guest house to offer.
It rendered that as a **disabled `<select>`** with one option, and the
requester was told "Select a guest house".

**Fix.** One guest house is not a choice, so it is no longer a dropdown at all.
`components/booking-form.tsx` renders the name as a statement and puts the id
in a **hidden registered input**, and the value is computed *before* `useForm`
(`initialGuestHouseId`) so it is in the server-rendered HTML rather than
arriving with an effect. A disabled control that the browser may or may not
submit is no longer anywhere in the path.

This applies to every role with one guest house, so **students** (Bageshri
only) get it too.

> Verified end to end: `e2e/alumni-and-relationships.spec.ts` signs in as the
> Student Cell, asserts there is no `select[name="guest_house_id"]`, and
> submits the booking through to the IAR Office's queue.

### 2. A student could enter two mothers

**Symptom.** Nothing stopped "Mother" being picked for two different guests —
two names, both described as the requester's mother, and no way at the desk to
tell which was right.

**Fix.** A new `unique_relationships` list on `RoleFormConfig`, defaulted for
students to Mother, Father, Guardian, Grandmother, Grandfather. **Siblings is
deliberately not on it** — a student may bring two.

- `duplicateRelationshipError()` / `duplicateRelationships()` in
  `lib/form-config.ts` are the matcher, called by the form *and*
  `bookingPayloadSchema`, like `parentDependencyError` beside it.
- The rule spans the whole request: a mother in Room 1 and another in Room 2
  is still two mothers.
- The form greys the option out on every *other* guest
  (`usedUniqueRelationships`), with "— already on this request" on the option,
  so it cannot be picked rather than being rejected at the end. A guest never
  has its own current answer taken away.
- The schema flags the **repeat**, not the original: the first one is almost
  always the one meant.
- Free-text roles are exempt — there is no option list to be unique within,
  and "Mother " and "mother" would be two different answers.
- Editable in the Form Builder as **"One of each"**.

### 3. Removing a room — already built

The office asked for a way to remove a room card. It was already there: each
`RoomCard` above the first carries a **Remove room** button on its border,
with a confirm dialog that says how many guests go with it and that the rooms
after it move up. No change needed.

### 4. An overlap in room availability read as an ordinary booking

**Symptom.** Where the manager had accepted a changeover (`isOverridable` — up
to two hours of genuine overlap), the availability grid drew plain red, which
is what a single stay looks like. The overlap was invisible.

**Fix.** Overlaps are now their own band, in their own colour.

- `bucketOccupancyByHour` returns `overlaps` — the segments holding each hour,
  when there is more than one.
- `bucketOccupancyByDay` returns `overlaps` — the intersecting stretches,
  computed by `overlapSpans()` over the room's segments and clipped to the
  range.
- `bg-overlap` in `app/globals.css`: violet with a **vertical** stripe, so it
  differs from red, from the turnaround's 135° diagonal and from
  maintenance's cross-hatch by pattern as well as colour. Range bars carry a
  `◆`, as stays carry `●`.
- Legend swatch added on `/availability` and in the booking form's panel.

### 5. The Guest House Manager can no longer book "personal"

`bookingTypesFor("gh_manager")` is `["official", "alumni"]`. The desk account
is the guest house, not a person; staff in that post hold an ordinary
institute account for their own family's stays. A private booking can no
longer be raised, invoiced or approved from the console that also approves it.

### 6. Mail threads on the booking, not on the day

**Was.** Staff booking mail joined one "approvals" thread per person per
institute day. A club's request, an unrelated cancellation and a dignitary's
allocation landed in one conversation because they happened on the same
morning — and two messages about the *same* booking a day apart were split.

**Now.** `MailThreadKind` is `"booking" | "daily_log"`.

- `bookingThreadRoot(referenceId, address)` keys the thread on the reference
  id and the mailbox, so everything about `IITPKD-GH-2026-AB12C` to one person
  is one conversation, however many days it spans.
- The thread's subject is `[IITPKD-GH-2026-AB12C] Guest house booking`,
  identical on every message (Gmail splits a thread when the subject changes);
  what each message is about leads its heading and its inbox preview.
- **Scheduled mail keeps a daily thread** — the digest, the escalation nudge
  and the day-wise desk log are about a queue, not a booking, so there is
  nothing else to hang them on.
- **Requester mail is unchanged**: still standalone, still
  `[reference] Rooms allocated`. Each step is news to them, and a standalone
  subject can say what happened. Say so if that should change too.

### 7. Faculty can no longer debit the Institute Grant

It was not in `DEFAULT_DEBIT_RULES` already, but Settings → Debitable heads
could tick it back on. It is now a floor under Settings, not just a default:
`FORBIDDEN_DEBIT_HEADS` in `lib/debit-heads.ts`, applied three ways —
`allowedHeads()` strips it on read (so a stored row that still lists it is
ignored rather than breaking the page), `debitRulesSchema` refuses to save it,
and the console's grid renders that cell greyed with the reason in its
tooltip. The offices that actually hold the grant keep it.

---

## Also changed while in there

**`e2e/global-setup.ts` wipes `.e2e-db.json` before every run.** The mock
store keeps the sign-in throttle in the database it writes (8 attempts per uid
per 15 minutes), so running the suite twice inside that window locked the
dummy accounts out and the journeys failed on a sign-in that had nothing wrong
with it. Seeded data is rebuilt on load, so there is nothing to preserve.

**`tests/booking-rules.test.ts`'s capacity fixture** built a room of three
guests all related as "Father", which the new one-of-each rule correctly
refuses. It is one Father and then siblings now — the only shape that isolates
the capacity rules from the relationship rules.
