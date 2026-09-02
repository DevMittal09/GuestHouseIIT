# Background

## The problem

IIT Palakkad runs two guest houses, **Bageshri** and **Hamsanandi**, used by very
different groups: parents visiting students, collaborators visiting faculty,
artists and speakers invited by student clubs, returning alumni, and official
dignitaries such as inspection committees.

Before this system, requests arrived through email and paper forms. That created
four recurring problems:

1. **No consistent approval trail.** A student's request needed their hostel
   warden's sign-off, a club's request needed its faculty advisor's — but there
   was no single place showing who had approved what, or when.
2. **Room clashes.** Allocation was tracked manually, so two guests could be
   promised the same room for overlapping dates.
3. **Different rules per requester, enforced by memory.** Students may only use
   Bageshri; alumni must present an alumni ID card; officials need to bypass
   intermediate review entirely. These rules lived in people's heads.
4. **No verification record.** ID documents arrived as email attachments with no
   structured link to the booking they belonged to.

## Who uses it

**Requesters** (submit bookings):

| Role | Notes |
| --- | --- |
| Student | Bageshri only; request routes to their own hostel warden |
| Employee (faculty/staff) | Both guest houses; goes straight to the manager |
| Club / fest council | Both; routes to the club's faculty advisor |
| Alumni | Both; routes to the IAR (International & Alumni Relations) cell |
| Official / dignitary | Both; highest priority, bypasses intermediate review |

**Reviewers and administrators:**

| Role | Sees |
| --- | --- |
| Hostel warden | Only students of *their* hostel |
| Faculty advisor | Only *their* club or council |
| IAR cell | All alumni requests, with the uploaded alumni ID card |
| Guest house manager | Every pre-approved request; assigns actual rooms |
| Developer (superadmin) | Everything, plus configuration of the system itself |

## Where the requirements came from

The functional spec was supplied by the Administration Section: the five
requester categories, the approval chain for each, the field lists per category,
and the "cinema-style" seat-picker metaphor for room allocation. Two details were
called out explicitly and are easy to lose in a refactor:

- students see the banner **"Double shared rooms will get first preference"**;
- official visits are **restricted to whitelisted institute email addresses** and
  should surface at the top of the manager's queue.

## Scope decisions made during the build

- **The developer console was added beyond the original spec.** The spec fixed
  the forms and the two guest houses in code. In practice the Administration
  Section will need to add a guest house, change who is a warden, or make a field
  optional without a developer. That drove the configurable form system and the
  admin console, which are now the most distinctive parts of the project.
- **Authentication was deliberately deferred.** See
  [06-decisions.md](06-decisions.md) — the app uses a mock persona picker with a
  single, well-marked swap point so institute SSO can be dropped in later.
- **Notifications are not built.** Email/SMS on status change is the most
  obvious next feature; see [08-roadmap.md](08-roadmap.md).

## Status

Feature-complete for the specified workflows and running against a hosted
Supabase project. **Not yet deployed** and **not yet using real authentication** —
those are the two gates before production use.
