/**
 * Binding values to `jsonb` columns.
 *
 * Its own module, with no imports, because the rule below is the kind that is
 * rediscovered the hard way: `lib/store/postgres.ts` pulls in `pg` and
 * `server-only`, so a test cannot reach into it, and a rule nothing can test
 * is a rule that comes back.
 */

/**
 * Serialise a value bound for a `jsonb` column.
 *
 * **`pg` renders a JS array as a PostgreSQL array literal, not as JSON.** An
 * empty array goes down the wire as `{}`, which a `jsonb` column stores as the
 * empty *object* - so `jsonb_typeof` answers `object`, and every check
 * constraint that asks for an array refuses the row. A room booking with no
 * meals failed on `bookings_meals_shape` exactly this way, and the error named
 * the constraint rather than the cause.
 *
 * Plain objects happen to survive `pg`'s own handling, but they go through
 * here as well, so that a statement names its jsonb columns in one place
 * rather than depending on which JavaScript type a field happens to hold
 * today.
 *
 * `null` and `undefined` pass through untouched: a nullable jsonb column must
 * store SQL NULL, not the JSON literal `null`, and the two are different rows
 * to every query that asks `is null`.
 */
export function jsonbParam(value: unknown): unknown {
  return value === null || value === undefined ? value : JSON.stringify(value);
}

/**
 * Apply {@link jsonbParam} to the named columns of a row being written.
 * Mutates and returns the row, which is how the callers use it.
 */
export function serializeJsonbColumns(
  row: Record<string, unknown>,
  columns: readonly string[]
): Record<string, unknown> {
  for (const col of columns) {
    if (col in row) row[col] = jsonbParam(row[col]);
  }
  return row;
}

/** The `jsonb` columns of `bookings` that an insert may carry. */
export const BOOKING_JSONB_COLUMNS = ["meals", "custom_fields", "meal_diet_counts"] as const;
