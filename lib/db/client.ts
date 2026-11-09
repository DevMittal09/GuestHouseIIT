import "server-only";
import { Pool, types } from "pg";

// Return timestamps and dates as strings instead of Date objects, matching
// the shape the rest of the codebase expects (the original Supabase PostgREST
// layer returned strings).
// 1082 = date, 1114 = timestamp without time zone, 1184 = timestamp with time zone.
types.setTypeParser(1082, (val: string) => val);
types.setTypeParser(1114, (val: string) => val);
types.setTypeParser(1184, (val: string) => new Date(val).toISOString());

// Return numeric/decimal as a number, not a string.
types.setTypeParser(1700, (val: string) => Number(val));

// The pool is cached on globalThis, not in a module-level `let`.
//
// Turbopack re-evaluates this module on hot reload, which with a module-level
// binding built a *new* Pool each time and left the previous one holding its
// idle connections for ever. Against the shared Supabase database - whose
// session pooler admits 15 clients for the whole project - a morning's editing
// exhausted the limit and every page died with "max clients reached in session
// mode", on a database that was perfectly healthy. One pool per process.
const globalForPg = globalThis as unknown as { __ghPgPool?: Pool };

export function databaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

export function getPool(): Pool {
  if (!globalForPg.__ghPgPool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL is not set");
    }
    const ssl =
      process.env.DATABASE_SSL === "true" ||
      /sslmode=require/.test(connectionString)
        ? { rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== "false" }
        : undefined;
    // Every collaborator's dev server shares one database, so the ceiling is
    // the host's, not this process's. DATABASE_POOL_MAX lowers it where a host
    // counts clients rather than queries.
    const configured = Number(process.env.DATABASE_POOL_MAX);
    const max = Number.isFinite(configured) && configured > 0 ? Math.floor(configured) : 10;
    globalForPg.__ghPgPool = new Pool({
      connectionString,
      max,
      // Hand a connection back quickly: an idle dev server should not sit on
      // the shared host's quota while nobody is using it.
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 10_000,
      ssl,
    });
  }
  return globalForPg.__ghPgPool;
}
