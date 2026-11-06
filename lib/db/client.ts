import "server-only";
import { Pool, types } from "pg";
import type { PoolConfig } from "pg";

/**
 * The database connection.
 *
 * The portal talks to **Supabase's PostgreSQL directly over `pg`**, not through
 * PostgREST and the Supabase JS client. What that bought:
 *
 *   * real SQL - joins, `for update skip locked`, CTEs, `ANY($1)` - instead of
 *     PostgREST's query language, which is why `searchBookings` used to fetch
 *     candidates and filter them in TypeScript under `SEARCH_SCAN_LIMIT`;
 *   * no silent 1000-row truncation. PostgREST caps a response and says
 *     nothing, which is `GOOGLE-SIGN-IN.md`'s first defect (the callback
 *     scanned every profile) and would have broken the institute's account
 *     import at 1000 people;
 *   * one round trip for a transaction, so delete-then-insert no longer has to
 *     be wrapped in plpgsql to be atomic.
 *
 * What it costs is **row-level security as a backstop**: this connection is the
 * database owner, and an owner bypasses RLS. Authorization is enforced in the
 * server actions (`requireUser`, `canReview`, `requireConsole`), which is where
 * it has always actually lived - RLS was defence in depth, and migration 31 had
 * already closed the `authenticated` surface it protected. **RLS stays enabled
 * on every table regardless**, because PostgREST is still listening on the
 * Supabase project and the anon key is public: see the note at the foot of
 * migration 37.
 *
 * Supabase Storage is still used for ID documents (`lib/storage/`). This module
 * is SQL only.
 *
 * ## Which connection string
 *
 * Supabase offers three and they are not interchangeable:
 *
 *   * **Session pooler** (port 5432, `...pooler.supabase.com`) - one server
 *     connection per client connection. This is the one for a long-running Node
 *     process on an institute server or in a container: `pg`'s own pool holds
 *     the connections and reuses them.
 *   * **Transaction pooler** (port 6543) - a server connection per
 *     *transaction*. Correct for a serverless host, where every invocation is a
 *     new process. `pg` does not use named prepared statements unless a query
 *     is given a `name`, and none here is, so it is compatible; but session
 *     state does not survive between statements, which is why `search_path` is
 *     sent as a connection option below rather than set once with `SET`.
 *   * **Direct connection** (`db.<ref>.supabase.co`) - unpooled, and IPv6 only
 *     on current projects. Use it for applying migrations and for
 *     `npm run check:migrations`, not for the application.
 *
 * `DATABASE_URL` must carry `sslmode=require`. Supabase terminates TLS with a
 * chain Node does not have in its default store, so
 * `DATABASE_SSL_REJECT_UNAUTHORIZED=false` is accepted - but prefer putting the
 * project's CA certificate in `DATABASE_SSL_CA` and leaving verification on.
 */

// Timestamps and dates come back as strings, which is the shape the rest of the
// codebase is written against: PostgREST returned strings, and `lib/tz.ts`
// works on ISO strings. A `Date` here would have been built in the *process*
// timezone - the bug the whole of `lib/tz.ts` exists to prevent.
// 1082 = date, 1114 = timestamp without time zone, 1184 = timestamptz.
types.setTypeParser(1082, (val: string) => val);
types.setTypeParser(1114, (val: string) => val);
types.setTypeParser(1184, (val: string) => new Date(val).toISOString());

// numeric/decimal as a number, not a string - invoice money is arithmetic.
types.setTypeParser(1700, (val: string) => Number(val));

let pool: Pool | null = null;

export function databaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

function sslOption(connectionString: string): PoolConfig["ssl"] {
  const wanted =
    process.env.DATABASE_SSL === "true" || /sslmode=require/.test(connectionString);
  if (!wanted) return undefined;
  const ca = process.env.DATABASE_SSL_CA;
  if (ca) return { ca, rejectUnauthorized: true };
  return { rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== "false" };
}

export function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL is not set");
    }
    pool = new Pool({
      connectionString,
      max: Number(process.env.DATABASE_POOL_MAX ?? 10),
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
      // A query that hangs must not hold a pooled connection for ever. The
      // longest thing the portal does is `set_booking_buffer`, which rebuilds
      // every room hold in one transaction.
      statement_timeout: Number(process.env.DATABASE_STATEMENT_TIMEOUT_MS ?? 30_000),
      // Every query in the store names its tables unqualified (`FROM bookings`),
      // so the search path is part of the contract, not a default to inherit.
      // Sent per connection because the transaction pooler keeps no session
      // state between statements.
      options: "-c search_path=public",
      ssl: sslOption(connectionString),
      application_name: "guesthouse-portal",
    });
    // An unhandled error on an idle client takes the process down. Log it and
    // let `pg` discard that client.
    pool.on("error", (err) => {
      console.error("[db] idle client error:", err.message);
    });
  }
  return pool;
}

/** Closes the pool. For scripts and tests; the server keeps it for its life. */
export async function closePool(): Promise<void> {
  if (pool) {
    const current = pool;
    pool = null;
    await current.end();
  }
}
