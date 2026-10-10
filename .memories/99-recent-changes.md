# Recent changes — the last round, and only the last round

This file is **replaced** every round, not appended to. The round before this
one is written up where every round is: what was asked in
[01-background.md](01-background.md), why it was done that way in
[02-decisions.md](02-decisions.md).

---

## Round of 10 October 2026 — this folder reorganised

**No application code changed.** Nothing in `app/`, `components/` or `lib/`
behaves differently; the only non-documentation additions are
`scripts/check-memories.mjs` and the `check:memories` npm script.

### What was asked

The owner, on the state of `.memories/`:

> it's not organized properly and it is not consistent — when I make changes,
> only a few files are updated, not all context files containing context that
> is being affected. And also there are far too many context files. Can you
> limit it to 15 files, make sure these files all serve a purpose, don't make
> two files doing the same thing. Add files for production plan/requirements
> and for credentials and other stuff. One file for recent changes also. There
> are files holding unnecessary stuff as context — but make sure all the
> necessary stuff is there, keep it detailed if needed.

### What was done

**Twenty-five files became fifteen**, each owning one subject, with the owner
of every fact named in [README.md](README.md)'s file map.

| Now | Was |
| --- | --- |
| [01-background.md](01-background.md) | `01-background` + `02-timeline` + the office's `Guest House Meeting Notes.md` (now its appendix, verbatim) |
| [02-decisions.md](02-decisions.md) | `03-decisions` |
| [03-roadmap.md](03-roadmap.md) | `04-roadmap` + the open items that were also listed in the UI file |
| [04-production.md](04-production.md) | `06-production-requirements` + `24-deployment-runbook` + what was still live in `05-production-plan` + `offices-debitable-heads.csv` (now a verbatim block in §2) |
| [05-credentials-and-security.md](05-credentials-and-security.md) | `30-credentials-and-access` + `31-ldap-sign-in` + `26-security` |
| [10-roles-and-workflows.md](10-roles-and-workflows.md) | `10-roles-and-features` + `12-workflows` + `14-notifications` |
| [11-booking-forms.md](11-booking-forms.md) | `11-booking-forms` + `17-academic-records` |
| [12-settings-and-defaults.md](12-settings-and-defaults.md) | `13-settings-and-defaults`, renumbered |
| [13-billing-and-dining.md](13-billing-and-dining.md) | `15-billing-and-invoices`, renumbered |
| [14-public-site-and-ui.md](14-public-site-and-ui.md) | `16-public-site-and-ui`, renumbered |
| [20-architecture.md](20-architecture.md) | `20-architecture` + `21-implementation` |
| [21-database.md](21-database.md) | `22-database`, renumbered |
| [22-running-and-testing.md](22-running-and-testing.md) | `23-running-and-testing` + `25-troubleshooting` |
| [99-recent-changes.md](99-recent-changes.md) | this file |

**The merges were chosen where two files answered the same question**, because
that is what made the folder inconsistent - a change would be written into one
of them and the other left behind:

- **Roles, pipelines and mail are one story.** `10` listed what a role may do,
  `12` listed where its requests go and had its own role table, and `14` listed
  the mail each stage sends. Three files, one life of a request.
- **Architecture and implementation were the same features twice**, once as
  "why" and once as "where the files are". They are now Part 1 and Part 2 of
  one file.
- **Three production documents** - the 2 Sep plan, the 8 Oct requirements and
  the deployment runbook - each held a list of what the office must supply, and
  the three disagreed. There is one list now.
- **Secrets were tabulated in two files** with different columns. One table,
  with both files' columns.
- **Running and troubleshooting** were split between "how to verify" and "the
  error you just hit", which is one task.

**Four things were deliberately cut rather than merged**, as "unnecessary
stuff": the 2 Sep production plan's executed phases (the decisions are in
`02`), its "Suggested order" and "This week" sections (stale by a month), the
20-row Settings table in the runbook that restated
[12-settings-and-defaults.md](12-settings-and-defaults.md), and the
session-by-session timeline, which was a **third** narration of every round
after the requirement tables and the decision log - it is now a one-line-per-day
index at the top of [01-background.md](01-background.md).

**Nothing the office sent was dropped.** The debitable-heads CSV and the 15 Sep
meeting notes are both kept word for word, inside the files that use them.
(The meeting notes had in fact been **missing from the working tree** for some
time - `README.md` linked to a file that was not there, which is how this round
found them, in git.)

### The fix for the drift, not just the count

[README.md](README.md) now carries a **maintenance contract**: five steps to do
after every round, then a table of *if the round changed X, update Y as well* -
covering roles and routes, form fields, mail, tariffs, Settings, migrations
(including `scripts/check-migrations.mjs`'s `MARKERS`), personas and secrets
(including `lib/ldap/mock-directory.ts`), academic records, the public site,
where code lives, and a newly diagnosed error. The old README said "update the
product files wherever behaviour changed", which left the judgement to whoever
was in a hurry.

And **`npm run check:memories`** (`scripts/check-memories.mjs`, read-only)
fails if a file on the list is missing, if a file appears that is not on the
list, or if any link in the folder points at a file or heading that does not
exist. It found eight rotten links on its first run, all now fixed. A
sixteenth file is now a decision rather than an accident.

### `CLAUDE.md` now carries the process

Asked for in the same round: *"make a claude file stating it to go through as
well as update .memories folder after every change."*

`CLAUDE.md` at the repo root was a one-line `@AGENTS.md` import. It now says,
in three short sections:

1. **At the start of a session** - read `.memories/README.md`, then
   `99-recent-changes.md`, then the files for the area being touched, *before
   planning the work*. Most apparent free choices here have been decided once
   already, often reversed, and the reason is in `02-decisions.md`.
2. **After every change** - the five contract steps, ending with README's
   *"if the round changed X, update Y as well"* table, which it says to **read**
   rather than work from memory. Plus `npm run check:memories`.
3. **Finishing a change in the code** - lint, typecheck, test, build; leave the
   work in the tree.

And three standing rules: one fact one home, fifteen files (a sixteenth is a
deliberate edit to `scripts/check-memories.mjs`), never a real secret in the
folder.

It is a separate file from `AGENTS.md` on purpose. `AGENTS.md` is 1,700 lines
about the code, and "update the notes when you are done" was a section near its
end - read last, skipped first, which is the reported failure. Reasoning in
[02-decisions.md](02-decisions.md) ("10 Oct 2026 - the process lives in
`CLAUDE.md`").

> **`next dev` will overwrite `CLAUDE.md`** with `@AGENTS.md` - but only when
> `CLAUDE.md` is the file hosting Next's managed agent-rules block.
> `AGENTS.md` hosts it, so `writeAgentFiles` returns `claudeMd: "skipped"`.
> Verified by running that function against a copy of both files:
> `{"agentsMd":"unchanged","claudeMd":"skipped"}`, and `CLAUDE.md` came back
> byte-identical. **Keep `<!-- BEGIN:nextjs-agent-rules -->` at the top of
> `AGENTS.md`** or the next `next dev` deletes the new file's contents.

### Also updated

- `AGENTS.md` - the memory pointer at the top describes the fifteen files and
  names the maintenance contract; three stale cross-references fixed.
- `.memories/README.md` - names `CLAUDE.md` and `AGENTS.md` as the two root
  files that load unprompted, and what each one carries.
- Every path reference in the repo: `lib/` and `components/` comments,
  `README.md`, `supabase/seed.sql`, `scripts/check-migrations.mjs`.
- `package.json` - the `check:memories` script.

### Left alone, on purpose

- **`UI-REVAMP-CONTEXT.md`** at the repo root (1,389 lines) is a one-off brief
  written for the 26 Sep revamp. It duplicates roles, workflows, the glossary
  and the rules, and is stale: it predates the 30 Sep revamp, the 7 Oct list
  and the 9 Oct lists. It is outside `.memories/` so this round did not touch
  it, but it is a stale second copy of this folder's context and is a
  **candidate for deletion** - its only unique content is the screen-by-screen
  inventory in its §9.
