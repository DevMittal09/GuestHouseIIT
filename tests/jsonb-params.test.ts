import { describe, expect, it } from "vitest";
import {
  BOOKING_JSONB_COLUMNS,
  jsonbParam,
  serializeJsonbColumns,
} from "@/lib/store/jsonb";

/**
 * Binding a value to a `jsonb` column (6 Nov 2026).
 *
 * `pg` renders a JS array as a PostgreSQL array literal, so an array handed
 * straight to a jsonb column is stored as whatever that literal parses to -
 * and `[]` becomes the empty **object**. Every room booking failed on
 * `bookings_meals_shape` because of it, with an error that named the
 * constraint and not the cause. These assertions are the guard, since the
 * suite runs on the mock store and cannot see a PostgreSQL insert.
 */
describe("jsonbParam", () => {
  it("serialises an array, so it never reaches pg as a JS array", () => {
    // The actual regression: `meals: []`.
    expect(jsonbParam([])).toBe("[]");
    expect(jsonbParam([{ date: "2026-11-11", breakfast: false, lunch: true, dinner: true }])).toBe(
      '[{"date":"2026-11-11","breakfast":false,"lunch":true,"dinner":true}]'
    );
    expect(typeof jsonbParam([])).toBe("string");
  });

  it("serialises objects too, so the rule does not depend on the runtime type", () => {
    expect(jsonbParam({ veg: 1, non_veg: 0 })).toBe('{"veg":1,"non_veg":0}');
    expect(jsonbParam({})).toBe("{}");
  });

  it("leaves null and undefined alone, so a nullable column stores SQL NULL", () => {
    // JSON.stringify(null) is the string "null", which jsonb stores as the
    // JSON literal null - a different row from SQL NULL to every `is null`.
    expect(jsonbParam(null)).toBeNull();
    expect(jsonbParam(undefined)).toBeUndefined();
  });
});

describe("serializeJsonbColumns", () => {
  it("touches only the named columns, and only those present", () => {
    const row: Record<string, unknown> = {
      meals: [],
      custom_fields: null,
      purpose_of_visit: "A visit",
      copy_to_emails: ["a@iitpkd.ac.in"],
    };
    serializeJsonbColumns(row, BOOKING_JSONB_COLUMNS);

    expect(row.meals).toBe("[]");
    expect(row.custom_fields).toBeNull();
    // Untouched: plain text, and `copy_to_emails`, which is a real text[] and
    // whose array handling in pg is correct.
    expect(row.purpose_of_visit).toBe("A visit");
    expect(row.copy_to_emails).toEqual(["a@iitpkd.ac.in"]);
    expect("meal_diet_counts" in row).toBe(false);
  });

  it("names the three jsonb columns a booking insert may carry", () => {
    expect([...BOOKING_JSONB_COLUMNS].sort()).toEqual([
      "custom_fields",
      "meal_diet_counts",
      "meals",
    ]);
  });
});
