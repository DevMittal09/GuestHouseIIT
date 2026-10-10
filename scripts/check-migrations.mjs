/**
 * Which migrations does the configured Supabase project actually have?
 *
 * This exists because the answer used to be a sentence in the notes that
 * nobody could check. The notes said migrations 24-30 were outstanding on the
 * hosted project for weeks after they had been applied, because the check
 * recipe in `.memories/22-running-and-testing.md` listed markers only up to
 * migration 25 - so 26 onwards could not be verified, and the claim was
 * carried forward by hand instead. A missing migration fails writes quietly,
 * and a migration wrongly believed missing sends somebody to the SQL editor to
 * re-apply files that were already there. Both are cheap to end: ask the
 * database.
 *
 *     node scripts/check-migrations.mjs          # the project in .env.local
 *     npm run check:migrations
 *
 * **Read-only.** Every request is a `GET` of at most one row, and the only
 * thing read is whether the column, table or enum value the migration added
 * exists at all - never anybody's data. Nothing is written, and the service
 * role key is sent only to the project it belongs to.
 *
 * Each migration is identified by a **marker**: something it created that
 * nothing else did. Two cannot be seen this way at all - 17 and 23 only add or
 * replace a plpgsql function, and PostgREST cannot read `pg_proc` - so they
 * are reported as such with the one-line SQL to run in the editor instead.
 * Calling them would be a write, which this script will not do.
 *
 * Exit code 1 when a marker is missing, so CI or a deploy step can gate on it.
 */

import { readFileSync } from "node:fs";

/**
 * One per migration whose effect is visible to PostgREST: a table, a column,
 * or an enum value. `kind` says how to probe it.
 *
 * `column` and `table` are both "select this and see whether it errors"; the
 * difference is only which error a missing one gives. `enum` filters on the
 * value, which PostgREST refuses outright when the label is not on the type.
 */
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
  { n: 12, kind: "column", table: "profiles", column: "ldap_uid", what: "LDAP usernames on profiles" },
  { n: 13, kind: "column", table: "mail_templates", column: "event_key", what: "editable mail wording" },
  { n: 14, kind: "column", table: "room_holds", column: "guard", what: "the turnover guard range" },
  { n: 15, kind: "column", table: "units", column: "head_id", what: "units and debitable heads" },
  { n: 16, kind: "column", table: "hostels", column: "name", what: "settings, hostels and the audit table" },
  { n: 17, kind: "function", fn: "set_booking_buffer", what: "the turnaround buffer" },
  { n: 18, kind: "column", table: "units", column: "hod_unit_id", what: "HOD approval and projects" },
  { n: 19, kind: "column", table: "invoices", column: "document", what: "tariffs and invoices" },
  { n: 20, kind: "column", table: "room_blocks", column: "reason", what: "operational states" },
  { n: 21, kind: "column", table: "sessions", column: "token_hash", what: "sessions and security" },
  { n: 22, kind: "column", table: "bookings", column: "search_text", what: "search and indexes" },
  { n: 23, kind: "function", fn: "check_room_occupancy", what: "the room-occupancy combination" },
  { n: 24, kind: "column", table: "bookings", column: "copy_to_emails", what: "Copy to and the project sub-head" },
  { n: 25, kind: "column", table: "units", column: "faculty_advisor_id", what: "Faculty Advisors" },
  { n: 26, kind: "column", table: "invoices", column: "extra_charges", what: "additional charges on invoices" },
  { n: 27, kind: "column", table: "bookings", column: "meal_diet_counts", what: "each person's meal preference" },
  { n: 28, kind: "table", table: "academic_records", what: "the institute's academic records" },
  { n: 29, kind: "enum", table: "bookings", column: "status", value: "MISSED", what: "the MISSED status" },
  { n: 30, kind: "column", table: "bookings", column: "fund_declaration_at", what: "the funds declaration" },
];

/** The SQL to paste in the editor for the two this cannot see. */
const FUNCTION_SQL =
  "select proname from pg_proc where proname in ('set_booking_buffer','check_room_occupancy');";

function env() {
  // Read `.env.local` rather than `process.env`, so the script reports on the
  // project the dev server would use and needs no exports. Keys are trimmed:
  // `.env.local` has been written with a space before the `=` before now, and
  // dotenv accepts it, so this has to as well.
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

/** The query string that asks the smallest possible question about a marker. */
function path(marker) {
  if (marker.kind === "enum") {
    return `${marker.table}?select=${encodeURIComponent(marker.column)}&${marker.column}=eq.${marker.value}&limit=1`;
  }
  const column = marker.kind === "column" ? marker.column : "*";
  return `${marker.table}?select=${encodeURIComponent(column)}&limit=1`;
}

async function main() {
  const vars = env();
  const url = (vars.NEXT_PUBLIC_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/+$/, "");
  const key =
    vars.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    vars.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    "";
  if (!url || !key) {
    console.log(
      "No Supabase project is configured (NEXT_PUBLIC_SUPABASE_URL and a key in .env.local),\n" +
        "so there is nothing to check - the app would use the mock store, which self-heals."
    );
    return 0;
  }
  // Enough of the host to tell two projects apart, and no more: the ref is the
  // project's public name but there is no reason to print all of it.
  const ref = url.replace(/^https?:\/\//, "").split(".")[0];
  console.log(`Project ${ref.slice(0, 4)}… (${url.replace(ref, `${ref.slice(0, 4)}…`)})\n`);

  const missing = [];
  const unknown = [];
  for (const marker of MARKERS) {
    if (marker.kind === "function") {
      unknown.push(marker);
      console.log(`  ?  ${String(marker.n).padStart(2)}  ${marker.what} - a function; see below`);
      continue;
    }
    let line;
    try {
      const response = await fetch(`${url}/rest/v1/${path(marker)}`, {
        headers: { apikey: key, Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(20_000),
      });
      if (response.ok) {
        line = `  ok ${String(marker.n).padStart(2)}  ${marker.what}`;
      } else {
        const body = await response.text();
        const detail = (() => {
          try {
            return JSON.parse(body).message ?? body;
          } catch {
            return body;
          }
        })();
        missing.push(marker);
        line = `  NO ${String(marker.n).padStart(2)}  ${marker.what}\n         ${String(detail).slice(0, 160)}`;
      }
    } catch (error) {
      // A timeout or a DNS failure is not a missing migration, and must not be
      // reported as one - that is the mistake this script exists to stop.
      unknown.push(marker);
      line = `  ?  ${String(marker.n).padStart(2)}  ${marker.what} - could not reach the project (${
        error instanceof Error ? error.message : error
      })`;
    }
    console.log(line);
  }

  console.log("");
  if (missing.length > 0) {
    console.log(`${missing.length} migration(s) appear to be missing. Apply them in order:`);
    for (const m of missing) {
      console.log(`  supabase/migrations/${String(m.n).padStart(14, "0")}_*.sql`);
    }
    console.log("Every migration from 6 onwards is safe to re-run.");
  } else {
    console.log("Every migration this script can see has been applied.");
  }
  if (unknown.length > 0) {
    console.log(
      `\n${unknown.length} could not be checked from here. Migrations 17 and 23 only add or\n` +
        "replace a function, which PostgREST cannot see; run this in the SQL editor:\n" +
        `  ${FUNCTION_SQL}\n` +
        "Both names present means both are applied; either is safe to re-run if in doubt."
    );
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
