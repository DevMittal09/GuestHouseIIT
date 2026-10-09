import { describe, expect, it } from "vitest";
import { criteriaFromParams, parseHistoryParams } from "@/lib/booking-search";
import { buildDefaultFormConfig, sanitizeFormConfig } from "@/lib/form-config";
import { previewItemsFor, tariffPreviewLines, tariffPreviews } from "@/lib/tariffs";
import { canExportPdf } from "@/lib/workflow";
import { REQUESTER_ROLES, type Role } from "@/lib/types";
import { GH } from "./helpers";

/**
 * The round of 9 October 2026: **less text on screen, and the few things that
 * were missing from it**.
 *
 * Most of the round is copy coming off pages, which a unit test cannot see.
 * What is testable is the behaviour underneath it: the rates a dining booking
 * is quoted, the banner that comes off a form whether or not somebody had
 * pressed Save, and who may take the log away as a PDF.
 */

const TODAY = "2026-10-09";

// --------------------------------------------------- rates on a meal booking

describe("a dining booking is quoted meals and nothing else", () => {
  it("previewItemsFor drops the room and the extra bed", () => {
    expect(previewItemsFor(true, "meals_only")).toEqual(["breakfast", "lunch", "dinner"]);
    // A stay is unchanged, and so is the default.
    expect(previewItemsFor(true, "room")).toEqual([
      "room",
      "extra_bed",
      "breakfast",
      "lunch",
      "dinner",
    ]);
    expect(previewItemsFor(true)).toEqual(previewItemsFor(true, "room"));
    expect(previewItemsFor(false, "room")).toEqual(["room", "extra_bed"]);
  });

  it("a kitchen that serves no meals has nothing to quote for one", () => {
    // Unreachable from the form - a dining booking only offers kitchens - but
    // an empty list is the honest answer rather than a room rate.
    expect(previewItemsFor(false, "meals_only")).toEqual([]);
  });

  it("the preview lines follow the service type", () => {
    const lines = tariffPreviewLines([], {
      guestHouseId: GH.id,
      bookingType: "official",
      role: "employee",
      roomType: "double_sharing",
      servesMeals: true,
      date: TODAY,
      service: "meals_only",
    });
    expect(lines.map((l) => l.item)).toEqual(["breakfast", "lunch", "dinner"]);

    const previews = tariffPreviews(
      [],
      [{ id: GH.id, serves_meals: true }],
      ["official"],
      "employee" as Role,
      TODAY,
      "double_sharing",
      "meals_only"
    );
    expect(previews[0].lines.map((l) => l.item)).toEqual(["breakfast", "lunch", "dinner"]);
  });
});

// ------------------------------------------- the banner off the student form

describe("the double-sharing banner is withdrawn", () => {
  it("no role's spec defaults carry a banner", () => {
    for (const role of REQUESTER_ROLES) {
      expect(buildDefaultFormConfig(role, [GH]).banner_text).toBeNull();
    }
  });

  it("a saved row keeps its own banner but loses the retired one", () => {
    const saved = {
      ...buildDefaultFormConfig("student", [GH]),
      banner_text: "Double shared rooms will get first preference",
    };
    expect(sanitizeFormConfig(saved, [GH]).banner_text).toBeNull();

    const theirs = { ...saved, banner_text: "Arrivals after 10 pm need notice" };
    expect(sanitizeFormConfig(theirs, [GH]).banner_text).toBe("Arrivals after 10 pm need notice");
  });
});

// ------------------------------------------------- the PDF of one's own log

describe("exporting the log as a PDF", () => {
  it("is open to every role, as CSV already was", () => {
    const roles: Role[] = [
      ...REQUESTER_ROLES,
      "warden",
      "faculty_advisor",
      "iar_cell",
      "gh_manager",
      "gh_caretaker",
      "developer",
    ];
    for (const role of roles) expect(canExportPdf(role)).toBe(true);
  });

  /**
   * The export actions are handed a query string and re-derive everything
   * else, so the default they parse it against has to be the page's. A
   * requester has no "Handled by me" toggle - theirs is "all" - and
   * `exportHistoryPdf` was reading "me", which puts `actedBy` on the criteria
   * and would have filtered their own report to bookings they had *acted on*.
   */
  it("a requester's own report is not filtered by who acted on it", () => {
    const scope = { userId: "p-1" };
    const asPage = criteriaFromParams(parseHistoryParams({}, "all"), scope, "p-1");
    expect(asPage.actedBy).toBeUndefined();
    expect(asPage.userId).toBe("p-1");

    // The bug: the same empty query string read against the reviewers' default.
    const asBug = criteriaFromParams(parseHistoryParams({}, "me"), scope, "p-1");
    expect(asBug.actedBy).toBe("p-1");
  });
});
