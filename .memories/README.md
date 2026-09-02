# Project memories

Long-form context for the IIT Palakkad Guest House Booking Portal. Written so
that a person (or agent) arriving cold can understand *why* the system looks the
way it does, not just what the code says.

| File | Read it when you need |
| --- | --- |
| [01-background.md](01-background.md) | Why this project exists, who uses it, what was asked for |
| [02-architecture.md](02-architecture.md) | How the system is put together and why |
| [03-implementation.md](03-implementation.md) | What is actually built, feature by feature, with file paths |
| [04-database.md](04-database.md) | Schema, enums, RLS, storage, migrations |
| [05-deployment.md](05-deployment.md) | Running it locally, Supabase setup, going to production |
| [06-decisions.md](06-decisions.md) | Decision log — options considered and why one won |
| [07-troubleshooting.md](07-troubleshooting.md) | Errors already hit and their fixes |
| [08-roadmap.md](08-roadmap.md) | Known gaps and what to build next |

**Related, in the repo root:** `AGENTS.md` is the short operational brief that
Claude Code and other agent tools load automatically. It is deliberately terse.
These files are the long version; keep `AGENTS.md` as the index of hard rules and
put the reasoning here.

Last substantive update: 2026-09-02 (booking lifecycle, universal history,
PDF reports, cancellation flow).
