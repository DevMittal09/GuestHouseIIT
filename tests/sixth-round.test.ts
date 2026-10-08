import { describe, expect, it } from "vitest";
import { PAY_AT_CHECKOUT_NOTE } from "@/lib/debit-heads";
import {
  buildDefaultFormConfig,
  duplicateRelationshipError,
  parentDependencyError,
  sanitizeFormConfig,
} from "@/lib/form-config";
import { GH } from "./helpers";

/**
 * The office's corrections of 30 Sep 2026 that are rules rather than copy:
 * a requester could fill themselves in as a guest ("Yourself"), and the note
 * on a personal booking about paying. The invoice's new lettering is tested
 * with the rest of the invoice in `fifth-round.test.ts`.
 *
 * **"Yourself" was withdrawn on 7 Oct 2026**, with the whole "Fill in…" list,
 * for every role - the office asked for it. What is left of this round is the
 * Self *relationship* on the student form, which a student still chooses by
 * hand, and the payment note. `lib/known-guests.ts` is gone; what replaced it
 * for a student's parents is tested in eighth-round.test.ts.
 */

describe("Self, as a relationship on your own request", () => {
  it("gives the student form a Self relationship, once per request, that lets no sibling in", () => {
    const houses = [GH];
    const student = sanitizeFormConfig(buildDefaultFormConfig("student", houses), houses);
    expect(student.relationship_options).toContain("Self");
    expect(student.unique_relationships).toContain("Self");
    expect(student.parent_relationships).not.toContain("Self");
    expect(student.dependent_relationships).not.toContain("Self");
    expect(parentDependencyError(student, ["Self"])).toBeNull();
    expect(parentDependencyError(student, ["Self", "Siblings"])).toMatch(/only be accommodated/);
    expect(duplicateRelationshipError(student, ["Self", "Mother"])).toBeNull();
    expect(duplicateRelationshipError(student, ["Self", "Self"])).not.toBeNull();
  });
});

describe("paying for a personal booking", () => {
  it("uses the office's wording, which names no particular way to pay", () => {
    expect(PAY_AT_CHECKOUT_NOTE).toBe(
      "An invoice will be generated and can be settled at the time of checkout. Multiple payment options are available at the guest house."
    );
  });
});
