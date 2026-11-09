# Recent changes - the last round, and only the last round

This file is **replaced** every round, not appended to. The round before this
one is written up where every round is: what was asked in
[01-background.md](01-background.md), why it was done that way in
[02-decisions.md](02-decisions.md).

---

## Round of 9 November 2026 - the shared database, made usable

Two runtime errors from the owner, one after the other, both from the move to
the shared database the day before. Neither was a fault in the database.

### 1. `password authentication failed for user "postgres"`

Thrown by `PostgresStore.listProfiles` on `/mock-login`, so the persona picker
- the only door into the portal - was dead.

`.env.local` held the literal string `:<password>@`. The previous round's
closing message gave the owner a line to **send a collaborator**, with
`<password>` as a placeholder; it looked like a configuration line, so it went
into their own `.env.local` and overwrote the working password. **An agent's
own output caused this**, which is why the fix is a wording rule and not a
code change: a placeholder inside a copy-pasteable connection string must read
`PASTE_PASSWORD_HERE`, never `<password>`.

- The database was never involved: `psql` with the real password returned 35
  profiles.
- The password was restored, `.env.local` backed up first
  (`.env.local.bak-20261109-0933`).
- Two things the owner's own rewrite had dropped came back: the **commented
  local `DATABASE_URL`** they had asked for on 8 Nov, and a stray
  `# LEAVE UNSET IN PRODUCTION - it drops CC entirely.` that had ended up
  above `DATABASE_URL` (it belongs to `MAIL_REDIRECT_ALL_TO`).
- `next dev` watches env files, so no restart was needed; `/mock-login`
  returned 200 and rendered its groups.

### 2. `(EMAXCONNSESSION) max clients reached in session mode`

Thrown by `listGuestHouses` through `getEffectiveFormConfig` on `/book`. **Two
independent causes**, and fixing either alone would not have held.

| | Cause | Fix |
| --- | --- | --- |
| a | Supabase's **session pooler admits 15 clients for the whole project**, not per developer, and the pool asked for `max: 20`. One dev server could lock out every collaborator | `DATABASE_URL` moved to the **transaction pooler, port 6543**, which multiplexes; the session pooler stays in `.env.local`, commented, for `pg_dump` / `psql` / DDL |
| b | **Turbopack re-evaluates a module on hot reload** and `lib/db/client.ts` cached its pool in a module-level `let`, so each reload built a new `Pool` and the old one kept its idle connections for ever | The pool is cached on **`globalThis`**, `max` defaults to **10** with **`DATABASE_POOL_MAX`** to lower it, `idleTimeoutMillis` 30 s -> **10 s** |

`pg_stat_activity` is no help here and misled the first reading: it shows
*Supavisor's* connections to Postgres (12 idle, steady, by design), not the
pooler's client count, so the database reads as healthy while clients are
being refused.

**Transaction mode was verified, not assumed** - it is the riskier half of the
fix, because a transaction pooler holds no session:

- 25 concurrent queries through one pool: all 25 fine.
- `pool.connect()` + `BEGIN` / `COMMIT` / `ROLLBACK` - the `allocateRooms`
  pattern - fine: the server connection is pinned for the transaction.
- `room_holds_no_overlap_guard` **still refuses an overlap**, with SQLSTATE
  **`23P01`**, which is what `RoomClashError` is built on. Checked with two
  different bookings on one room, inside a transaction that was rolled back;
  `room_holds` was 3 rows before and 3 after.
- `set_room_holds()` and the other plpgsql functions resolve.
- Nothing in `lib/` or `app/` uses `LISTEN`, `NOTIFY`, advisory locks,
  session `SET` or runtime DDL (grepped), and node-postgres uses **unnamed**
  prepared statements - which is what makes transaction mode safe here.

> The first exclusion-constraint test was **invalid** and said so: it ran
> `SET CONSTRAINTS ALL DEFERRED`, which postpones a `DEFERRABLE` constraint to
> commit time, and then rolled back - so nothing was ever checked. It was
> redone without it. A test that cannot fail is worse than no test.

### Changed

| File | Change |
| --- | --- |
| `lib/db/client.ts` | The pool on `globalThis`; `max` 20 -> **10** and configurable by `DATABASE_POOL_MAX`; `idleTimeoutMillis` 30 s -> 10 s. The only code change of the round |
| `.env.local` | Real password restored; `DATABASE_URL` on **6543**; the session-pooler and local strings kept commented; the misplaced mail comment removed |
| `AGENTS.md` | The two ports and the `globalThis` pool, under *Two backends, one interface* |
| [20-architecture.md](20-architecture.md) | The pool's rule, beside the store it serves |
| [21-database.md](21-database.md) | *Where the database actually is* now names the transaction pooler |
| [22-running-and-testing.md](22-running-and-testing.md) | Both errors in Part 2; the connection table's transaction-pooler row rewritten (it had said to avoid 6543) |
| [05-credentials-and-security.md](05-credentials-and-security.md) | `DATABASE_POOL_MAX`; which pooler the app uses |
| [04-production.md](04-production.md) | The three install steps need a **session**; the running service wants the transaction pooler and a pool ceiling |

### Checks

`npm run lint`, `npm run typecheck`, **661 tests** (39 files) and
`npm run build` all clean. 40 concurrent requests to `/mock-login` - the page
that had been failing - returned **40 x 200**. The dev server was restarted
once, after the build, because a build pulls `.next/` out from under it.

**No migration. No schema change. Nothing was written to the shared database**
beyond a transaction that was rolled back.

### What this opens

In [03-roadmap.md](03-roadmap.md) §2r, which this round amends rather than
closes: the pool ceiling is now a figure somebody has to own per deployment,
and the 15-client limit is a property of the Supabase plan - it is the first
thing that will bite when a third and fourth collaborator join, or when the
e2e suite is pointed at the shared database (it must not be; it builds its
own throwaway database for this reason).
