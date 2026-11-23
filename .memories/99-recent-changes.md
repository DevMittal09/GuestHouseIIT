# Recent changes - the last round, and only the last round

This file is **replaced** every round, not appended to. The round before this
one is written up where every round is: what was asked in
[01-background.md](01-background.md), why it was done that way in
[02-decisions.md](02-decisions.md).

---

## Round of 23 November 2026 - chain meal booking and staff-for-faculty booking

Two new features requested by the office.

### 1. Chain booking for meals

Meal-only bookings can now add dates as a **date range** instead of one at a
time. A collapsible "Chain booking (recurring dates)" fieldset at the top of
the meal dates picker lets the requester pick From and To dates, with two
checkboxes: **Include Saturdays** and **Include Sundays** (both excluded by
default). Clicking "Add dates" generates all matching weekdays and adds them
to the existing date list with default meal slots ticked.

**Files changed:**

| File | What |
| --- | --- |
| `lib/meals.ts` | Added `chainMealDates(from, to, includeSaturdays, includeSundays)` |
| `components/meal-dates-picker.tsx` | Added chain booking UI (fieldset, DateField controls, weekend checkboxes) |
| `tests/dining.test.ts` | 9 tests for `chainMealDates` |

No schema, database or migration changes - the chain picker is purely a UI
convenience that produces the same `dates[]` array the existing per-day picker
produces.

### 2. Non-teaching staff booking on behalf of faculty

Non-teaching staff (`employee` with `staff_category === "staff"`) can now book
on behalf of any teaching staff (faculty) member. The pattern mirrors
`lib/club-booking.ts`: the booking hangs off the **faculty member's** account
(`user_id`, `user_role: "employee"`), so it is routed, debited and scoped
exactly as a faculty booking; `created_by` names the staff member.

Any non-teaching staff may book for any faculty member - there is no
appointment like `faculty_advisor_id`. The staff member picks a faculty member
from a **searchable dropdown** on the booking page, the form switches to that
faculty member's options (booking types, debitable heads, service types), and
the faculty member receives requester mail while the staff member is CC'd as
the creator (through the existing `requesterCopyTo` in
`lib/mail/recipients.ts`).

**Files changed:**

| File | What |
| --- | --- |
| `lib/staff-booking.ts` | **New.** `isNonTeachingStaff`, `isFacultyMember`, `facultyBookableBy`, `raisedByStaffForFaculty` |
| `lib/staff-booking-server.ts` | **New.** `facultyBookableByUser` (cached, like `clubsBookableByUser`) |
| `components/faculty-search.tsx` | **New.** Client component: searchable faculty dropdown |
| `components/booking-request-page.tsx` | Added `forFacultyId` prop, faculty resolution, `FacultyBookingAs` component |
| `components/booking-form.tsx` | Added `forFaculty` prop, `for_faculty` in FormData, banner |
| `app/actions/bookings.ts` | `for_faculty` handling in `createBooking` (validation, requester switch, `created_by`) |
| `app/(portal)/book/page.tsx` | Passes `for_faculty` search param through |
| `app/(portal)/book/meals/page.tsx` | Passes `for_faculty` search param through |
| `tests/staff-booking.test.ts` | **New.** 17 tests for all staff-booking functions |

No migration needed - detection via `created_by !== user_id` on an employee
booking mirrors how `raisedByFacultyInCharge` works for clubs. The existing
`requesterCopyTo`, `actsAsRequester` and `listBookingsForUser` all handle the
`created_by` pattern generically.

### Verification

- `npm run lint` - clean
- `npm run typecheck` - clean
- `npm run build` - clean
- `npm test` - 726 tests in 44 files, all passing
- `npm run check:memories` - clean
