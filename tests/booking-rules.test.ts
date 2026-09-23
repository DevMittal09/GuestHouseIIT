import { describe, expect, it } from "vitest";
import { bookingPayloadSchema } from "@/lib/booking-schema";
import {
  buildDefaultFormConfig,
  parentDependencyError,
  sanitizeFormConfig,
} from "@/lib/form-config";
import { addDaysToDateValue, toInstituteDateValue } from "@/lib/tz";
import { GH } from "./helpers";

/**
 * The booking form's rules as the office stated them in September 2026: who a
 * student may bring, what one room may hold, and which fields each role is
 * asked for. Every one of these is enforced twice — the form and the schema —
 * and it is the schema that these tests hold to account, because that is what
 * a crafted request meets.
 */

const HOUSES = [GH];
const studentConfig = sanitizeFormConfig(buildDefaultFormConfig("student", HOUSES), HOUSES);
const checkInDate = addDaysToDateValue(toInstituteDateValue(new Date()), 3);
const checkOutDate = addDaysToDateValue(checkInDate, 2);

type Person = { age: number; relationship: string };

function guestRow({ age, relationship }: Person, index: number) {
  return {
    name: `Guest ${index + 1}`,
    age,
    gender: "female" as const,
    relationship,
    // An infant is not asked for an ID, so none is sent for one.
    id_number: age < 5 ? undefined : "1234 5678 9012",
    citizenship: "indian" as const,
  };
}

/** A student's booking with the given room cards, otherwise complete and valid. */
function studentBooking(rooms: Person[][]) {
  return {
    guest_house_id: GH.id,
    service_type: "room",
    booking_type: "personal",
    debit_head: "personal_funds",
    privacy_consent: true,
    purpose_of_visit: "Family visiting the institute",
    check_in: `${checkInDate}T12:00`,
    check_out: `${checkOutDate}T10:00`,
    rooms: rooms.map((people) => ({
      room_type: null,
      guests: people.map(guestRow),
    })),
  };
}

function parseStudent(rooms: Person[][]) {
  return bookingPayloadSchema(studentConfig, {
    mealsAvailable: false,
    requesterEmail: "112201001@smail.iitpkd.ac.in",
  }).safeParse(studentBooking(rooms));
}

const messages = (result: ReturnType<typeof parseStudent>) =>
  result.success ? [] : result.error.issues.map((i) => i.message);

describe("what one room may hold", () => {
  const adult = (relationship = "Siblings"): Person => ({ age: 20, relationship });
  const infant = (relationship = "Daughter"): Person => ({ age: 2, relationship });
  const room = (adults: number, infants: number): Person[] => [
    ...Array.from({ length: adults }, () => adult(adults > 0 ? "Father" : "Siblings")),
    ...Array.from({ length: infants }, () => infant()),
  ];
  const fits = (adults: number, infants: number) => parseStudent([room(adults, infants)]).success;

  /**
   * The combinations the office gave, exactly. A room holds four people
   * however they are made up, of whom at most three may need a bed — which is
   * why neither cap alone is the rule.
   */
  it("follows the office's combinations", () => {
    expect(fits(3, 1)).toBe(true);
    expect(fits(3, 2)).toBe(false);
    expect(fits(2, 2)).toBe(true);
    expect(fits(2, 3)).toBe(false);
    expect(fits(1, 3)).toBe(true);
    expect(fits(1, 4)).toBe(false);
  });

  it("says which rule was broken, and on which room", () => {
    const result = parseStudent([room(1, 1), room(3, 2)]);
    expect(result.success).toBe(false);
    expect(messages(result)[0]).toMatch(/at most 4 people in total/);
    if (!result.success) {
      // On the second card, not the first — the first one is fine.
      expect(result.error.issues[0].path).toEqual(["rooms", 1, "guests"]);
    }
  });

  /**
   * The composition reported as failing in September 2026: parents and a
   * toddler in one room, older siblings and another infant in the next. Both
   * cards are within the combination, and the parent in Room 1 unlocks the
   * siblings in Room 2.
   */
  it("accepts parents with a toddler alongside a room of siblings and an infant", () => {
    const result = parseStudent([
      [
        { age: 52, relationship: "Father" },
        { age: 48, relationship: "Mother" },
        { age: 2, relationship: "Daughter" },
      ],
      [
        { age: 16, relationship: "Siblings" },
        { age: 13, relationship: "Siblings" },
        { age: 1, relationship: "Son" },
      ],
    ]);
    expect(messages(result)).toEqual([]);
    expect(result.success).toBe(true);
  });
});

describe("who a student may bring", () => {
  /**
   * A student with no parents on record, or with parents abroad, is
   * accompanied by the guardian the institute already holds
   * (`lib/academic/fields.ts`). Without Guardian among the qualifying
   * relationships that student could never bring a sibling at all, because the
   * rule would be waiting for a parent who cannot come.
   */
  it("counts a guardian as a parent for the dependency rule", () => {
    expect(studentConfig.relationship_options).toContain("Guardian");
    expect(studentConfig.parent_relationships).toContain("Guardian");
    expect(parentDependencyError(studentConfig, ["Guardian", "Siblings"])).toBeNull();
    expect(parentDependencyError(studentConfig, ["Siblings"])).toMatch(/only be accommodated/);
    expect(
      parseStudent([
        [
          { age: 60, relationship: "Guardian" },
          { age: 15, relationship: "Siblings" },
        ],
      ]).success
    ).toBe(true);
  });

  it("still refuses siblings with nobody standing in for a parent", () => {
    const result = parseStudent([
      [
        { age: 15, relationship: "Siblings" },
        { age: 70, relationship: "Grandmother" },
      ],
    ]);
    expect(result.success).toBe(false);
    expect(messages(result)[0]).toMatch(/Mother, Father or Guardian is also staying/);
  });
});

describe("an infant's relationship is free text", () => {
  /**
   * The dropdown lists the relationships an adult guest can have to the
   * requester. It has no "Nephew" or "Cousin's daughter" on it, and a small
   * child typed as "Siblings" just to get past the form tells the desk
   * something untrue — so an infant's row is a text box whatever the role's
   * style is, and the schema accepts anything there.
   */
  it("accepts a relationship that is not on the dropdown, for an infant only", () => {
    expect(
      parseStudent([
        [
          { age: 40, relationship: "Mother" },
          { age: 3, relationship: "Niece" },
        ],
      ]).success
    ).toBe(true);

    const adultOffList = parseStudent([
      [
        { age: 40, relationship: "Mother" },
        { age: 30, relationship: "Niece" },
      ],
    ]);
    expect(adultOffList.success).toBe(false);
    expect(messages(adultOffList)).toContain("Select a relationship");
  });
});

describe("what each role is asked for", () => {
  it("takes no ID document from an employee's guests", () => {
    const employee = sanitizeFormConfig(buildDefaultFormConfig("employee", HOUSES), HOUSES);
    expect(employee.guest_fields.id_document).toBe("hidden");
    // The Aadhaar number is still taken for the register, and still checked if
    // typed — just not demanded.
    expect(employee.guest_fields.id_number).toBe("optional");
    const schema = bookingPayloadSchema(employee, { mealsAvailable: false });
    const payload = {
      ...studentBooking([[{ age: 40, relationship: "Colleague" }]]),
      booking_type: "official",
      debit_head: "department_budget",
    };
    payload.rooms[0].guests[0].id_number = undefined;
    expect(schema.safeParse(payload).success).toBe(true);
    // A number that *is* typed still has to be a real one.
    payload.rooms[0].guests[0].id_number = "12345";
    expect(schema.safeParse(payload).success).toBe(false);
  });

  it("still demands an ID document from a student's guests", () => {
    expect(studentConfig.guest_fields.id_document).toBe("required");
    expect(studentConfig.guest_fields.id_number).toBe("required");
  });
});
