# `archive/` - features that were withdrawn, kept so they can come back

Each folder here is one feature the owner or the guest house office asked to
**remove from the portal** but not to lose. A folder holds the files that were
deleted, verbatim, and a `README.md` that is the **restore**: every edit to
re-apply, in order, with the exact text, and how to verify it afterwards.

| Folder | Feature | Withdrawn | Why |
| --- | --- | --- | --- |
| [`privacy-notice/`](privacy-notice/README.md) | The privacy notice: the `/privacy` page, its version and every link to it | 14 Oct 2026 | The owner asked for the privacy policy feature to be removed completely, but kept so it can be reverted |

## The one rule: nothing in here is built, and nothing here is deployed

This folder is **outside the application**. Nothing imports it, so Turbopack
never compiles it, `next build` never routes it, and no page can reach it.
Three places make that true, and a fourth would break it:

- **`tsconfig.json` excludes `archive`.** `include` is `**/*.ts` / `**/*.tsx`,
  so without the exclusion `tsc --noEmit` (and `next build`, which type-checks
  with the same config) would try to compile an archived component whose
  imports no longer exist, and fail.
- **`eslint.config.mjs` ignores `archive/**`**, the same way it ignores
  `design_handoff/**`. Archived code is a record of what was there; it is not
  held to the current lint rules.
- **`vitest.config.ts` only collects `tests/**/*.test.ts`** and Playwright
  only `e2e/`, so an archived test never runs.
- **Never `import` anything from here.** The moment application code does, the
  archive is in the bundle and all three exclusions above are void. Restoring
  a feature means **copying the files back** into `app/`, `components/` or
  `lib/`, not pointing at them here.

## When you restore something

Work its `README.md` top to bottom, then run `npm run lint`,
`npm run typecheck`, `npm test` and `NEXT_PUBLIC_SUPABASE_URL= npm run build`,
and delete the folder in the same change - a feature that is live and also
"archived" is the version that gets edited in the wrong place. Update
`.memories/` as [`CLAUDE.md`](../CLAUDE.md) requires: a restore is a round like
any other.
