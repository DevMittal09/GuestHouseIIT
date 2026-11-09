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
  { n: 16, kind: "column", table: "institute_hostels", column: "hostel_name", what: "settings, hostels and the audit table" },
  {
    n: 17, kind: "function", fn: "set_booking_buffer",
    what: "the turnaround buffer",
    sql: "SELECT count(*)::int AS c FROM pg_proc WHERE proname = 'set_booking_buffer' AND pronamespace = 'public'::regnamespace",
  },
  { n: 18, kind: "column", table: "units", column: "hod_approval_from_id", what: "HOD approval and projects" },
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
      "AND contype = 'f' AND confrelid = to_regclass('auth.users')) AS auth_fk, " +
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
  { n: 35, kind: "table", table: "institute_students", what: "institute data tables (students, employees, offices, fcc, hostels, wardens)" },
  { n: 36, kind: "column", table: "rooms", column: "room_class", what: "room classes (VIP and reserved) and named tariff categories" },
  ...["reservation_note", "reserved_until"].map((column) => ({ n: 36, kind: "column", table: "rooms", column, what: "room reservation metadata" })),
  ...["tariff_category", "original_check_in", "original_check_out"].map((column) => ({ n: 36, kind: "column", table: "bookings", column, what: "booking category and requested dates" })),
  { n: 36, kind: "sql", what: "director-only room restriction", sql: "SELECT count(*)::int AS c FROM pg_constraint WHERE conrelid = 'public.rooms'::regclass AND pg_get_constraintdef(oid) LIKE '%director_only%'", check: (row) => row.c > 0 },
  {
    // The other half of 36: a category is part of a rate's scope, so the
    // uniqueness index has to include it or the office cannot publish a
    // Category I and a Category II rate for one guest house on one day.
    n: 36, kind: "sql",
    what: "the tariff uniqueness index widened to include the category",
    sql:
      "SELECT count(*)::int AS c FROM pg_indexes WHERE schemaname = 'public' " +
      "AND indexname = 'tariffs_one_per_scope_and_date' AND indexdef LIKE '%tariff_category%'",
    check: (row) => row.c === 1,
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
    process.env.DATABASE_URL ?? vars.DATABASE_URL ?? "";
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

  const host = new URL(connectionString).host;
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
    // An **existing** database is brought up to date with the numbered file
    // in `scripts/migrations/`, not with the schema file: `init-postgres.sql`
    // builds a database from nothing and would fail, or worse half-succeed,
    // against one that already has tables. The schema file is only for a
    // fresh install, which is why it is named second (9 Nov 2026 - the
    // advice said `init-postgres.sql` outright, and `scripts/migrations/`
    // did not exist until this round).
    console.log(`${missing.length} schema element(s) appear to be missing.`);
    console.log("On an existing database, apply the numbered file in scripts/migrations/ for each one below.");
    console.log("On a database being created from nothing, scripts/init-postgres.sql already has them all.");
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
