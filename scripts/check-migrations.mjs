/**
 * Which migrations does the configured PostgreSQL database actually have?
 *
 *     node scripts/check-migrations.mjs          # uses DATABASE_URL from .env.local
 *     npm run check:migrations
 *
 * **Read-only.** Every query checks only whether a table, column, function,
 * trigger, index or enum value the migration added exists at all - never
 * anybody's data. Nothing is written.
 *
 * Exit code 1 when a marker is missing, so CI or a deploy step can gate on it.
 */

import { readFileSync } from "node:fs";

const MARKERS = [
  { n: 1, kind: "table", table: "bookings", what: "the initial schema" },
  { n: 2, kind: "enum", table: "bookings", column: "status", value: "OCCUPIED", what: "the lifecycle statuses" },
  { n: 3, kind: "table", table: "room_holds", what: "room_holds + the exclusion constraint" },
  { n: 4, kind: "column", table: "booking_guests", column: "is_infant", what: "infant guest rows" },
  { n: 5, kind: "table", table: "app_settings", what: "app_settings (the console password)" },
  { n: 6, kind: "column", table: "bookings", column: "meals", what: "bookings.meals" },
  { n: 7, kind: "column", table: "bookings", column: "has_infant", what: "bookings.has_infant" },
  { n: 8, kind: "column", table: "guest_houses", column: "serves_meals", what: "per-day meal plans" },
  { n: 9, kind: "column", table: "bookings", column: "booking_type", what: "booking types and two roles" },
  { n: 10, kind: "column", table: "email_outbox", column: "idempotency_key", what: "the email outbox" },
  { n: 11, kind: "column", table: "booking_rooms", column: "booking_id", what: "room-scoped guests" },
  { n: 13, kind: "column", table: "mail_templates", column: "event_key", what: "editable mail wording" },
  { n: 14, kind: "column", table: "room_holds", column: "guard", what: "the turnover guard range" },
  { n: 15, kind: "column", table: "units", column: "head_id", what: "units and debitable heads" },
  { n: 16, kind: "column", table: "hostels", column: "name", what: "settings, hostels and the audit table" },
  {
    n: 17, kind: "function", fn: "set_booking_buffer",
    what: "the turnaround buffer",
    sql: "SELECT count(*)::int AS c FROM pg_proc WHERE proname = 'set_booking_buffer' AND pronamespace = 'public'::regnamespace",
  },
  {
    n: 18,
    kind: "sql",
    what: "HOD approval and projects",
    // Migration 18 added `units.hod_unit_id`; migration 37 renames it to
    // `hod_approval_from_id`. Either name means 18 is applied.
    sql:
      "SELECT count(*)::int AS c FROM information_schema.columns " +
      "WHERE table_schema = 'public' AND table_name = 'units' " +
      "AND column_name IN ('hod_unit_id', 'hod_approval_from_id')",
    check: (row) => row.c >= 1,
  },
  { n: 19, kind: "column", table: "invoices", column: "document", what: "tariffs and invoices" },
  { n: 20, kind: "column", table: "room_blocks", column: "reason", what: "operational states" },
  { n: 21, kind: "column", table: "sessions", column: "token_hash", what: "sessions and security" },
  { n: 22, kind: "column", table: "bookings", column: "search_text", what: "search and indexes" },
  {
    n: 23, kind: "function", fn: "check_room_occupancy",
    what: "the room-occupancy combination",
    sql: "SELECT count(*)::int AS c FROM pg_proc WHERE proname = 'check_room_occupancy' AND pronamespace = 'public'::regnamespace",
  },
  { n: 24, kind: "column", table: "bookings", column: "copy_to_emails", what: "Copy to and the project sub-head" },
  { n: 25, kind: "column", table: "units", column: "faculty_advisor_id", what: "Faculty Advisors" },
  { n: 26, kind: "column", table: "invoices", column: "extra_charges", what: "additional charges on invoices" },
  { n: 27, kind: "column", table: "bookings", column: "meal_diet_counts", what: "each person's meal preference" },
  { n: 29, kind: "enum", table: "bookings", column: "status", value: "MISSED", what: "the MISSED status" },
  { n: 30, kind: "column", table: "bookings", column: "fund_declaration_at", what: "the funds declaration" },
  {
    n: 31, kind: "sql",
    what: "profiles decoupled from auth.users, and the authenticated RLS surface closed",
    sql:
      "SELECT (SELECT count(*)::int FROM pg_constraint WHERE conrelid = 'public.profiles'::regclass " +
      "AND contype = 'f' AND confrelid = 'auth.users'::regclass) AS auth_fk, " +
      "(SELECT count(*)::int FROM pg_policies WHERE 'authenticated' = ANY(roles) " +
      "AND schemaname IN ('public','storage')) AS authenticated_policies",
    check: (row) => row.auth_fk === 0 && row.authenticated_policies === 0,
  },
  { n: 32, kind: "table", table: "user_import_batches", what: "the undo record for a user import" },
  {
    n: 33, kind: "sql",
    what: "guest_houses.total_rooms maintained by a trigger",
    sql: "SELECT count(*)::int AS c FROM pg_trigger WHERE tgname = 'rooms_recount_total' AND NOT tgisinternal",
    check: (row) => row.c >= 1,
  },
  {
    n: 34, kind: "sql",
    what: "indexes on the foreign keys a delete has to check",
    sql:
      "SELECT count(*)::int AS c FROM pg_indexes WHERE schemaname = 'public' AND indexname IN (" +
      "'booking_logs_action_by_idx','bookings_created_by_idx','invoices_created_by_idx'," +
      "'invoices_issued_by_idx','invoices_paid_by_idx','invoices_cancelled_by_idx'," +
      "'privacy_requests_user_idx','privacy_requests_handled_by_idx','room_blocks_created_by_idx'," +
      "'room_holds_override_by_idx','tariffs_created_by_idx','units_head_idx'," +
      "'units_acting_head_idx'," +
      "'user_import_batches_actor_idx','user_import_batches_reverted_by_idx'," +
      "'units_parent_idx','units_hod_unit_idx','tariffs_guest_house_idx'," +
      "'sessions_rotated_from_idx')",
    check: (row) => row.c >= 19,
  },
  {
    n: 35,
    kind: "column",
    table: "bookings",
    column: "tariff_booking_type",
    what: "the manager's tariff category on a booking",
  },
  {
    n: 36,
    kind: "column",
    table: "profiles",
    column: "login_disabled_at",
    what: "user groups, and accounts that may no longer sign in",
  },
  {
    n: 37,
    kind: "table",
    table: "institute_students",
    what: "the institute's own tables (students, employees, offices, councils, hostels, wardens) and profiles_v",
  },
];

function env() {
  let text = "";
  try {
    text = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  } catch {
    return {};
  }
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const at = line.indexOf("=");
    if (at === -1 || line.trimStart().startsWith("#")) continue;
    const key = line.slice(0, at).trim();
    let value = line.slice(at + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key) out[key] = value;
  }
  return out;
}

async function main() {
  const vars = env();
  const connectionString =
    vars.DATABASE_URL ?? process.env.DATABASE_URL ?? "";
  if (!connectionString) {
    console.log(
      "No database is configured (DATABASE_URL in .env.local),\n" +
        "so there is nothing to check - the app would use the mock store, which self-heals."
    );
    return 0;
  }

  // Dynamic import so the script fails with a clear message if pg is missing.
  const { default: pg } = await import("pg");
  const client = new pg.Client({ connectionString });
  try {
    await client.connect();
  } catch (err) {
    console.error("Cannot connect to the database:", err.message);
    return 1;
  }

  const host = connectionString.replace(/^postgresql:\/\/[^@]*@/, "").split(/[/?]/)[0];
  console.log(`Database: ${host}\n`);

  const missing = [];
  for (const marker of MARKERS) {
    let ok = false;
    let detail = "";
    try {
      if (marker.kind === "table") {
        const res = await client.query(
          `SELECT count(*)::int AS c FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1`,
          [marker.table]
        );
        ok = res.rows[0].c > 0;
        if (!ok) detail = `table "${marker.table}" does not exist`;
      } else if (marker.kind === "column") {
        const res = await client.query(
          `SELECT count(*)::int AS c FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2`,
          [marker.table, marker.column]
        );
        ok = res.rows[0].c > 0;
        if (!ok) detail = `column "${marker.table}.${marker.column}" does not exist`;
      } else if (marker.kind === "enum") {
        const res = await client.query(
          `SELECT count(*)::int AS c FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE e.enumlabel = $1`,
          [marker.value]
        );
        ok = res.rows[0].c > 0;
        if (!ok) detail = `enum value "${marker.value}" does not exist`;
      } else if (marker.kind === "function") {
        const res = await client.query(marker.sql);
        ok = res.rows[0].c > 0;
        if (!ok) detail = `function "${marker.fn}" does not exist`;
      } else if (marker.kind === "sql") {
        const res = await client.query(marker.sql);
        ok = marker.check(res.rows[0]);
        if (!ok) detail = `check failed: ${JSON.stringify(res.rows[0])}`;
      }
    } catch (err) {
      detail = err.message;
    }

    const label = ok ? "ok" : "NO";
    const line = `  ${label.padEnd(3)} ${String(marker.n).padStart(2)}  ${marker.what}`;
    console.log(detail && !ok ? `${line}\n         ${detail.slice(0, 160)}` : line);
    if (!ok) missing.push(marker);
  }

  await client.end();

  console.log("");
  if (missing.length > 0) {
    console.log(`${missing.length} schema element(s) appear to be missing. Apply the matching files from supabase/migrations/ in order:`);
    for (const m of missing) {
      console.log(`  ${String(m.n).padStart(2)}  ${m.what}`);
    }
  } else {
    console.log("Every migration has been applied.");
  }
  return missing.length > 0 ? 1 : 0;
}

main().then(
  (code) => process.exit(code),
  (error) => {
    console.error("check-migrations failed:", error);
    process.exit(1);
  }
);
