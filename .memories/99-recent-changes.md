# Recent changes - the last round, and only the last round

This file is **replaced** every round, not appended to. The round before this
one is written up in [01-background.md](01-background.md) and
[02-decisions.md](02-decisions.md).

## Round of 25 November 2026 - Personal-only on-behalf booking for non-teaching staff

Configured non-teaching staff targets now have only the Personal booking type
when another employee books on their behalf. `onBehalfBookingTypes(target)` in
`lib/booking-types.ts` is the shared rule used by the booking page and
`createBooking`; its list flows through `BookingContext` to debit-head
resolution, the form, and server-side validation.

The target picker and Booking on Behalf settings now state the Personal-only
rule. Faculty targets remain Official-only, including when a non-teaching
employee is the booker. Non-teaching employees' own bookings remain
Personal-only. The role-level employee list, existing bookings, invoice logic,
database records, and database schema are unchanged.

### Verification

- `npm test -- tests/booking-rules.test.ts` - 14 tests passed.
- `npm test` - 727 tests passed.
- `npm run typecheck` - passed.
- `npm run lint` - passed with one existing unused `wordmarkJpg` warning in
  `lib/invoice-pdf.ts`.
- `npm run check:memories` - passed.
- `git diff --check` - passed; Git reported line-ending conversion warnings
  for existing working-copy files.
- `npm run build` was not run: an existing `next dev` was listening on port
  3000, and the project notes warn that a build overwrites `.next` and stops
  that server.
