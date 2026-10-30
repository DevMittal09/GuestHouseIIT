import "server-only";
import { Pool, types } from "pg";

// Return timestamps as ISO strings instead of Date objects, matching the
// shape the rest of the codebase expects (Supabase PostgREST returned strings).
// 1114 = timestamp without time zone, 1184 = timestamp with time zone.
types.setTypeParser(1114, (val: string) => val);
types.setTypeParser(1184, (val: string) => new Date(val).toISOString());

// Return numeric/decimal as a number, not a string.
types.setTypeParser(1700, (val: string) => Number(val));

let pool: Pool | null = null;

export function databaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

export function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL is not set");
    }
    pool = new Pool({
      connectionString,
      max: 20,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    });
  }
  return pool;
}
