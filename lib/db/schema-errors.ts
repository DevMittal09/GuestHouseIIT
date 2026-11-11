/**
 * A database that is behind the code, said in words.
 *
 * Migrations are applied by hand, so the commonest way for a working action
 * to fail on a shared database is a column or table the code writes and the
 * database does not have yet. PostgreSQL says so precisely (`42703` undefined
 * column, `42P01` undefined table) and a generic "Something went wrong"
 * threw that away: on 11 Nov 2026 allocation failed for every booking because
 * migration 36's `bookings.tariff_category` had not been applied, and the
 * desk saw only "Something went wrong while allocating rooms".
 *
 * Pure, so it can be tested without a database. Returns null for anything
 * that is not a schema gap, and the caller keeps its own message for those.
 */
export function schemaGapMessage(error: unknown): string | null {
  const code = (error as { code?: string } | null)?.code;
  if (code !== "42703" && code !== "42P01") return null;
  const message = (error as { message?: string } | null)?.message ?? "";
  // `column "tariff_category" of relation "bookings" does not exist`,
  // `column b.tariff_category does not exist`, `relation "x" does not exist`.
  const named = message.match(/(column|relation) (?:"([^"]+)"|(\S+))(?: of relation "([^"]+)")?/);
  const thing = named
    ? named[4]
      ? `${named[4]}.${named[2] ?? named[3]}`
      : (named[2] ?? named[3])
    : null;
  const what = code === "42703" ? "column" : "table";
  return (
    `The database is missing a ${what}${thing ? ` (${thing})` : ""} this version of the portal needs - ` +
    "a migration has not been applied. Run npm run check:migrations to see which."
  );
}
