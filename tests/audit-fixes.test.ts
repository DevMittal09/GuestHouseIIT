import { describe, expect, it } from "vitest";
import { canBookOnBehalf, canViewAllOccupancy } from "@/lib/access";
import { bookingTypesFor } from "@/lib/booking-types";
import { GUEST_HOUSE_MANAGER_CONTACT, MANAGER_HELP_LINE } from "@/lib/policy";
import { DEFAULT_RULES } from "@/lib/settings";
import { GUEST_HOUSE_CONTACT } from "@/lib/site";
import type { Role } from "@/lib/types";

/**
 * Three small defects found when `.memories` was audited against the code
 * (24 Sep 2026): the developer was offered a New Booking form nobody could
 * submit, the portal's help line showed a placeholder phone that matched
 * neither the website nor the invoice, and reception had no way to the
 * kitchen's page it is allowed to open.
 */

describe("who books on someone's behalf", () => {
  it("is the manager's desk only — not the developer, who has no booking types", () => {
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
  it("the help line uses the office's own phone and email", () => {
    expect(GUEST_HOUSE_MANAGER_CONTACT.phone).toBe(GUEST_HOUSE_CONTACT.phone);
    expect(GUEST_HOUSE_MANAGER_CONTACT.email).toBe(GUEST_HOUSE_CONTACT.email);
    expect(MANAGER_HELP_LINE).toContain(GUEST_HOUSE_CONTACT.phone);
    expect(MANAGER_HELP_LINE).toContain(GUEST_HOUSE_CONTACT.email);
    expect(MANAGER_HELP_LINE).not.toContain("04923");
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
