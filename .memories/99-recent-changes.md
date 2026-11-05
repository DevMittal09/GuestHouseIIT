# Recent changes - the last round, and only the last round

This file is **replaced** every round, not appended to. The round before this
one is written up where every round is: what was asked in
[01-background.md](01-background.md), why it was done that way in
[02-decisions.md](02-decisions.md).

---

## Round of 5 November 2026 - user groups, and blocking rather than deleting

The owner asked for this in their own words and invited questions. **Four were
asked and answered:**

| Question | Answer |
| --- | --- |
| What is a group? | **Programme + batch** ("B.Tech 2023 batch"), or a named group for anyone else. The year is worked out, turning over in July |
| "What emails are allowed"? | **All three lists:** members, addresses filled in on Copy to, addresses they may type |
| How does a copy list behave? | **Pre-filled, and the requester may remove it** |
| A blocked person's bookings? | **They stay, and the manager is warned** |

### What was built

**Console -> User Groups** (`/admin/groups`), for the manager and the developer: groups
on the left; on the right a group's details, members, Copy to lists and approval path;
and **Who may sign in** underneath.

| Part | What | Where |
| --- | --- | --- |
| Groups | Table `user_groups`, `profiles.group_id`, one per person | migration 36, `lib/user-groups.ts` |
| CSV | Template download, file upload, preview, all or nothing, the existing undo | `importUsersAction(text, groupId)`, `lib/users-import.ts` |
| Block | By roll number or email, from a paste, a file or a whole group. Preview, reason, reversible | `planAccessChange`, `app/actions/groups.ts` |
| Enforcement | Refused on every request, and at all three sign-in doors; gone from the account picker | `lib/auth.ts`, `app/actions/auth.ts`, the Google callback |
| Copy to | Filled in on the form; limited to the group's list or the institute's domain | `copyToRuleFor`, `lib/booking-schema.ts`, `components/booking-form.tsx` |
| Routes | A **Requester's group** condition on any approval route | `lib/approval-routes.ts`, `lib/workflow.ts`, `components/admin/workflow-manager.tsx` |

### The owner's answers the same day

- **The Assistant Warden stays** the approver for students. No change.
- **Only IIT Palakkad addresses may sign in, nobody else.** `signInRefusal` in
  `lib/user-groups.ts` is the one rule, at all three doors and on every request. New
  accounts and every import refuse any other address, and Users & Roles flags one that
  already exists. This reverses nothing for Copy to, which is still open.
- **MS and PhD join in January and August**, so each intake is its own batch ("PhD Jan
  2024 batch") and counts its years from the month it joined. Other programmes turn over
  in July. Migration 36 was edited in place, not having been applied anywhere.

### The institute's two kinds of address (the owner, the same day)

A student is `<roll number>@smail.iitpkd.ac.in`; everyone else `<position or
name>@iitpkd.ac.in`. Those are now **the only two domains that may sign in**, no other
subdomain, and `emailFormatError` holds each kind of account to its own: forms and every
import refuse a student elsewhere, a roll number disagreeing with the address, or staff
on `smail`. A sheet may leave a student's roll number empty, and a block by roll number
finds an account that has none.

Checking that turned up two defects the notes already carried, both fixed:

- **Google's `hd` hint** could have kept every `smail` student out of the chooser. It is
  `*` now, which works whichever way the Workspace is set up.
- **`listProfiles` read at most 1000 accounts** ([03-roadmap.md](03-roadmap.md) gate 12).
  It pages now. Tested against a fake client that truncates at 500, 1000 and 5000, **not
  against a real Supabase**: nothing here can.

### Worth knowing

- **Someone in no group is unchanged**, including Copy to accepting outside addresses,
  which tests pin as deliberate. To be confirmed: [03-roadmap.md](03-roadmap.md) §2r.
- **The default student route is still the Assistant Warden.** The owner mentioned "the
  associate dean or someone"; that is a route the manager sets, and was not assumed.
- **A security hole was closed before shipping:** a group's role would have skipped the
  role check an import's column gets, handing out `developer` by CSV.
- **Delete still exists** in Users & Roles, refusing anyone with bookings, because the
  import's undo relies on it. The block is the answer for people who leave.

### Verified

Lint, typecheck, **692 unit tests in 39 files**, a production build, and **all 55
Playwright journeys**, including `e2e/user-groups.spec.ts` (a real CSV file through to the
form, a block and a restore). Migration 36 applied twice in PGlite against stubs, its five refusals
checked. **Not tested on the hosted project**, and LDAP and Google refusals for a blocked
account have no test of their own: neither door can run here.

### Left open

[03-roadmap.md](03-roadmap.md) §2r, and the sixteenth list's unanswered assumptions in §2q.
