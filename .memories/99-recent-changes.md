# Recent changes - the last round, and only the last round

This file is **replaced** every round, not appended to. The round before this
one is written up where every round is: what was asked in
[01-background.md](01-background.md), why it was done that way in
[02-decisions.md](02-decisions.md).

---

## Round of 30 October 2026 - the deployment setup guide

The owner asked for a comprehensive setup document covering how the
application is implemented, its dependencies, the database migrations and
everything needed to deploy it.

### What was delivered

Created the repo-root [`setup.md`](../setup.md) with:

- The application architecture and boundaries between pages, server actions,
  authorization, store adapters, Supabase, uploads, mail and scheduled jobs.
- Runtime and package requirements, local development and validation commands.
- Production environment variables, OAuth/mock-login gates and secret-handling
  requirements.
- New and existing database setup, all **34 ordered migrations**, the
  read-only migration checker, and the manual verification required for
  migrations 17, 23, 31, 33 and 34.
- The controlled migration 31 rollout, Vercel deployment and cron schedules,
  operational safeguards, data notes and troubleshooting.

Updated the root README to make `setup.md` the deployment entry point and
remove outdated migration/sign-in guidance. The example frequent-dispatch
schedule is now explicitly distinguished from the daily Vercel schedule.

### Memory and validation

Updated the memory index, background timeline, decision log, roadmap and
production checklist to link to the guide and retain their distinct roles.
Aligned the root agent instructions and running/testing guide with the package's
Node 22+ requirement; corrected the memory index's runtime requirement and
migration count to 34. Made the memory-link checker CRLF-aware after its
Windows run misread existing headings as broken links.

Documentation-only change: no code, migration, configuration, permission or
runtime dependency changed. `npm run check:memories` is the required
validation; no build or test suite is needed unless the documentation check
reveals a code-related issue.
