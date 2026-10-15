import { describe, expect, it } from "vitest";
import { bookingPayloadSchema } from "@/lib/booking-schema";
import { buildDefaultFormConfig, sanitizeFormConfig } from "@/lib/form-config";
import { PETS_POLICY_NOTICE } from "@/lib/policy";
import { DEFAULT_RULES } from "@/lib/settings";
import { guidelineSections } from "@/lib/site-content";
import type { SiteGuestHouse } from "@/lib/site-data";
import { seedUnits } from "@/lib/store/seed";
import { addDaysToDateValue, toInstituteDateValue } from "@/lib/tz";
import type { Role } from "@/lib/types";
import { hodApproversFor } from "@/lib/units";
import { asksOfficeApproval, initialStatusFor } from "@/lib/workflow";
import { GH } from "./helpers";

/**
 * The round of 11 October 2026: three things the office asked to come off the
 * screen, or onto it.
 *
 * 1. An office with no HOD is no longer offered "Requires HOD approval".
 * 2. The pets notice is the Guidelines' and the mail's, not the form's.
 * 3. Every form that stars a field says what the star means - copy, which a
 *    unit test cannot see.
 */

// ------------------------------------------------- an office with no HOD

describe("Requires HOD approval is only offered where there is an HOD", () => {
  it("is asked of an office whose HOD unit has a head", () => {
    expect(asksOfficeApproval("official", "room", true)).toBe(true);
    expect(asksOfficeApproval("iar_cell", "room_meals", true)).toBe(true);
  });

  it("is not asked when nobody gives that approval", () => {
    expect(asksOfficeApproval("official", "room", false)).toBe(false);
    expect(asksOfficeApproval("iar_cell", "room", false)).toBe(false);
  });

  it("is never asked of a dining booking or of anyone but an office", () => {
    expect(asksOfficeApproval("official", "meals_only", true)).toBe(false);
    for (const role of ["student", "employee", "club", "iar_student_cell", "gh_manager"] as Role[]) {
      expect(asksOfficeApproval(role, "room", true)).toBe(false);
    }
  });

  /**
   * Why the question was pointless rather than merely unanswerable: with
   * nobody to forward to, both answers enter the pipeline at the manager.
   */
  it("would route both answers to the manager anyway", () => {
    for (const officeApproval of ["direct", "hod"] as const) {
      expect(
        initialStatusFor("official", "room", { officeApproval, hasHodApprover: false })
      ).toBe("PENDING_GH_MANAGER");
    }
    // With an HOD set, the choice is real again.
    expect(initialStatusFor("official", "room", { officeApproval: "hod", hasHodApprover: true })).toBe(
      "PENDING_HOD"
    );
  });

  it("is the Director's Office in the demo data, and not the CSE office", () => {
    const director = { id: "official-admin", unit_id: "unit-director-office" };
    const cseOffice = { id: "office-cse", unit_id: "unit-cse-office" };
    expect(hodApproversFor(director, seedUnits)).toEqual([]);
    expect(hodApproversFor(cseOffice, seedUnits)).toEqual(["hod-cse"]);
    expect(asksOfficeApproval("official", "room", hodApproversFor(director, seedUnits).length > 0)).toBe(
      false
    );
    expect(asksOfficeApproval("official", "room", hodApproversFor(cseOffice, seedUnits).length > 0)).toBe(
      true
    );
  });

  // The schema must not demand an answer the form did not offer - the form
  // sends `parsed.data` and `createBooking` re-parses it with the same rule.
  const houses = [GH];
  const config = sanitizeFormConfig(buildDefaultFormConfig("official", houses), houses);
  const today = toInstituteDateValue(new Date());
  const payload = (patch: Record<string, unknown> = {}) => ({
    guest_house_id: GH.id,
    service_type: "room",
    booking_type: "official",
    debit_head: "institute_grant",
    fund_declaration: true,
    purpose_of_visit: "A visiting delegation",
    check_in: `${addDaysToDateValue(today, 1)}T12:00`,
    check_out: `${addDaysToDateValue(today, 2)}T10:00`,
    rooms: [{ room_type: null, guests: [{ name: "Guest", gender: "male", citizenship: "indian" }] }],
    meals: [],
    ...patch,
  });
  const schema = (hasHodApprover: boolean) =>
    bookingPayloadSchema(config, {
      mealsAvailable: false,
      debitHeads: { room: { official: ["institute_grant"] }, dining: {} },
      rules: DEFAULT_RULES,
      hasHodApprover,
    });

  it("is still demanded of an office that was offered the choice", () => {
    const result = schema(true).safeParse(payload());
    expect(result.success).toBe(false);
    expect(!result.success && JSON.stringify(result.error.issues)).toContain("office_approval");
  });

  it("is not demanded of an office that was not", () => {
    const result = schema(false).safeParse(payload());
    if (!result.success) throw new Error(JSON.stringify(result.error.issues));
    expect(result.data.office_approval).toBeNull();
    // Round trip: the schema takes its own output.
    expect(schema(false).safeParse(result.data).success).toBe(true);
  });

  /**
   * And a payload that names the HOD route anyway is not refused - it is
   * overwritten with Direct by `createBooking`, the same way a personal
   * booking's debitable head is. Refusing it would mean a crafted field
   * failing a form that asked nothing.
   */
  it("accepts either value without complaint when it was not asked", () => {
    for (const office_approval of ["direct", "hod"] as const) {
      expect(schema(false).safeParse(payload({ office_approval })).success).toBe(true);
    }
  });

  // Absent means "somebody does", so every caller written before this round
  // behaves as it did.
  it("defaults to asking, for callers that do not say", () => {
    expect(asksOfficeApproval("official")).toBe(true);
    expect(bookingPayloadSchema(config, { mealsAvailable: false }).safeParse(payload()).success).toBe(
      false
    );
  });
});

// ---------------------------------------------------------- the pets notice

describe("the pets rule lives in the Guidelines, not on the form", () => {
  function house(name: string, servesMeals: boolean): SiteGuestHouse {
    return {
      id: `gh-${name.toLowerCase()}`,
      name,
      total_rooms: 10,
      serves_meals: servesMeals,
      roomsByType: { double_sharing: 10, single: 0 },
      activeRooms: 10,
    };
  }

  it("is still stated where the house rules are", () => {
    const items = guidelineSections([house("Bageshri", false), house("Hamsanandi", true)]).flatMap(
      (section) => section.items
    );
    expect(items.some((item) => /pets are not allowed/i.test(item))).toBe(true);
  });

  it("is still the line every booking mail carries", () => {
    expect(PETS_POLICY_NOTICE).toMatch(/pets are not allowed/i);
  });
});
