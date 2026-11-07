import { describe, expect, it } from "vitest";
import { bookingPayloadSchema } from "@/lib/booking-schema";
import { buildDefaultFormConfig, isStoredFormConfig, sanitizeFormConfig } from "@/lib/form-config";
import type { GuestHouse } from "@/lib/types";

/**
 * A `form_configs` row that is not a form configuration must not be trusted
 * (7 Nov 2026). The two rows below are verbatim from the owner's database,
 * where they made every student, employee and office booking fail with
 * "Your role cannot submit booking requests" on a field nobody could see.
 */
const houses = [
  { id: "gh-b", name: "Bageshri", serves_meals: false },
  { id: "gh-h", name: "Hamsanandi", serves_meals: true },
] as GuestHouse[];

const FOREIGN_ROWS = {
  student: { max_rooms: 1, allowed_guest_houses: ["Bageshri"], require_relationship: true },
  employee: { max_rooms: 5, allowed_guest_houses: ["Bageshri", "Hamsanandi"], require_relationship: false },
};

describe("isStoredFormConfig", () => {
  it("refuses the foreign rows found on the owner's database", () => {
    expect(isStoredFormConfig(FOREIGN_ROWS.student, "student")).toBe(false);
    expect(isStoredFormConfig(FOREIGN_ROWS.employee, "employee")).toBe(false);
  });

  it("refuses a real config saved under another role", () => {
    const studentConfig = buildDefaultFormConfig("student", houses);
    expect(isStoredFormConfig(studentConfig, "employee")).toBe(false);
  });

  it("refuses nothing-shaped values", () => {
    for (const v of [null, undefined, "x", 3, [], {}]) {
      expect(isStoredFormConfig(v, "student")).toBe(false);
    }
  });

  it("accepts what the Form Builder saves, including a row predating later fields", () => {
    const saved = buildDefaultFormConfig("employee", houses);
    expect(isStoredFormConfig(saved, "employee")).toBe(true);
    const older: Partial<typeof saved> = { ...saved };
    delete older.unique_relationships;
    delete older.parent_relationships;
    expect(isStoredFormConfig(older, "employee")).toBe(true);
  });

  it("shows why it matters: trusting the foreign row refuses a correct student booking", () => {
    const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
    const payload = {
      service_type: "room",
      booking_type: "personal",
      debit_head: "personal_funds",
      guest_house_id: "gh-b",
      purpose_of_visit: "Visiting",
      check_in: `${day(3)}T12:00`,
      check_out: `${day(4)}T10:00`,
      meals: [],
      rooms: [
        {
          guests: [
            { name: "A Parent", age: "50", gender: "male", relationship: "Father", id_number: "123412341234", citizenship: "indian" },
          ],
        },
      ],
    };
    const issues = (config: Parameters<typeof bookingPayloadSchema>[0]) => {
      const r = bookingPayloadSchema(config, { mealsAvailable: true }).safeParse(payload);
      return r.success ? [] : r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
    };

    const trusted = sanitizeFormConfig(FOREIGN_ROWS.student as never, houses);
    expect(trusted.role).toBeUndefined();
    expect(issues(trusted)).toContain("booking_type: Your role cannot submit booking requests");

    const ignored = sanitizeFormConfig(buildDefaultFormConfig("student", houses), houses);
    expect(issues(ignored)).toEqual([]);
  });
});
