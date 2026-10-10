@AGENTS.md

# Read `.memories/` before you start, and update it before you finish

`AGENTS.md` (imported above) is the terse list of hard rules. **`.memories/` is
the project's memory** — fifteen files, one subject each: the problem and every
requirement list the institute sent, why each decision was taken, what is open,
what production needs, every login, the product as configured, the engineering
notes, and the last round. Treat it as part of the codebase, not as
documentation about it.

## 1. At the start of a session

Read, in this order:

1. **`.memories/README.md`** — the project in one screen, the file map, the
   glossary, and the maintenance contract you will follow at the end.
2. **`.memories/99-recent-changes.md`** — what the last round did and left open.
3. **The files for the area you are about to touch**, from README's file map.

Do this before planning the work, not after. Most of what looks like a free
choice in this codebase has already been decided once, often reversed, and the
reason is in `02-decisions.md`. Re-deciding it silently is the expensive
mistake.

## 2. After every change

**A change is not finished until `.memories/` describes the code as it now
stands.** Work the contract in `README.md` → *"Keeping this folder true"*:

1. **Replace** `99-recent-changes.md` with this round. It is never appended to.
2. **Append** the reasoning to `02-decisions.md`, with a dated *Superseded*
   note under any older entry this round reverses.
3. **Add the round to `01-background.md`** — what was asked, the status of each
   item, and a row in *The build at a glance*.
4. **Update `03-roadmap.md`** — strike what is done, add what this opened.
5. **Then work README's *"if the round changed X, update Y as well"* table.**
   Read the table; do not update from memory. This is the step that used to be
   skipped, which is why the folder drifted: a round would touch roles, mail
   and the schema, and only one file would be brought up to date.
6. **Run `npm run check:memories`** — it fails on a missing file, a stray file,
   or a link pointing at a file or heading that does not exist.

Three standing rules:

- **One fact, one home.** If two files would both want a fact, the one named in
  README's file map owns it and the other links to it. Do not solve an
  ambiguity by writing it in both places.
- **Fifteen files.** A sixteenth is a deliberate decision, added to
  `EXPECTED` in `scripts/check-memories.mjs` — not a new file because nothing
  quite fitted.
- **Never write a real secret into `.memories/`.** The folder is pushed to
  GitHub. Secrets are recorded by *name and location only*, in
  `05-credentials-and-security.md`.

## 3. Finishing a change in the code

`npm run lint`, `npm run typecheck`, `npm test` and `npm run build` must all be
clean — `AGENTS.md` has the details, including that `npm run build` kills a
running `next dev`. Leave changes in the working tree; the owner commits.

<!--
This file holds the process: read the memory, then update it. Everything about
the product, the stack and the traps lives in AGENTS.md (imported above) — put
new guidance about *the code* there, and new guidance about *the notes* here.

`next dev` regenerates its managed block in AGENTS.md, which hosts it, so it
leaves this file alone (`writeAgentFiles` in
node_modules/next/dist/server/lib/generate-agent-files.js returns
`claudeMd: 'skipped'` whenever AGENTS.md carries the BEGIN:nextjs-agent-rules
marker). Keep that marker in AGENTS.md and this file survives.
-->
