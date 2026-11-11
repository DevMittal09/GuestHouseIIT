import { describe, expect, it } from "vitest";
import { schemaGapMessage } from "@/lib/db/schema-errors";

describe("schemaGapMessage", () => {
  it("names a missing column with its table", () => {
    const msg = schemaGapMessage({
      code: "42703",
      message: 'column "tariff_category" of relation "bookings" does not exist',
    });
    expect(msg).toContain("missing a column (bookings.tariff_category)");
    expect(msg).toContain("npm run check:migrations");
  });

  it("names a missing column written without its table", () => {
    expect(schemaGapMessage({ code: "42703", message: "column b.tariff_category does not exist" })).toContain(
      "(b.tariff_category)"
    );
  });

  it("names a missing table", () => {
    expect(schemaGapMessage({ code: "42P01", message: 'relation "room_holds" does not exist' })).toContain(
      "missing a table (room_holds)"
    );
  });

  it("leaves every other error to the caller", () => {
    expect(schemaGapMessage(new Error("boom"))).toBeNull();
    expect(schemaGapMessage({ code: "23P01", message: "conflicting key value" })).toBeNull();
    expect(schemaGapMessage(null)).toBeNull();
  });
});
