import { describe, expect, it } from "vitest";
import { canBookOnBehalf, canViewAllOccupancy } from "@/lib/access";
import { bookingTypesFor } from "@/lib/booking-types";
import { DEFAULT_RULES } from "@/lib/settings";
import { GUEST_HOUSE_CONTACT } from "@/lib/site";
import type { Role } from "@/lib/types";

/**
 * Three small defects found when `.memories` was audited against the code
 * (24 Sep 2026): the developer was offered a New Booking form nobody could
 * submit, the portal's help line showed a placeholder phone that matched
 * neither the website nor the invoice, and reception had no way to the
 * kitchen's page it is allowed to open.
 *
 * The help line itself came off the portal on 9 Oct 2026 - the number lives
 * in the portal footer - so what is left to check is that there is still only
 * one phone number and one address for the guest house.
 */

describe("who books on someone's behalf", () => {
  it("is the manager's desk only - not the developer, who has no booking types", () => {
    expect(canBookOnBehalf("gh_manager")).toBe(true);
    expect(canBookOnBehalf("developer")).toBe(false);
    expect(bookingTypesFor("developer")).toEqual([]);
    for (const role of ["student", "employee", "official", "club", "gh_caretaker", "warden"] as Role[]) {
      expect(canBookOnBehalf(role)).toBe(false);
    }
  });

  it("everyone who may book on behalf has something to book", () => {
    const all: Role[] = [
      "student", "employee", "official", "club", "alumni", "warden", "faculty_advisor",
      "iar_cell", "iar_student_cell", "gh_manager", "gh_caretaker", "developer",
    ];
    for (const role of all.filter(canBookOnBehalf)) {
      expect(bookingTypesFor(role).length).toBeGreaterThan(0);
    }
  });
});

describe("one phone number for the guest house", () => {
  it("is the office's own, not the old placeholder", () => {
    expect(GUEST_HOUSE_CONTACT.phone).not.toContain("04923");
    expect(GUEST_HOUSE_CONTACT.email).toBe("ghm@iitpkd.ac.in");
  });

  it("the invoice's default contact starts out the same", () => {
    expect(DEFAULT_RULES.invoice.contact.phone).toBe(GUEST_HOUSE_CONTACT.phone);
    expect(DEFAULT_RULES.invoice.contact.email).toBe(GUEST_HOUSE_CONTACT.email);
  });
});

describe("the kitchen's page", () => {
  it("is open to reception, which now has a link to it", () => {
    expect(canViewAllOccupancy("gh_caretaker")).toBe(true);
  });
});
