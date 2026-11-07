import { describe, expect, it } from "vitest";
import { collectProblems, problemSelectors, problemToast } from "@/lib/form-problems";

/**
 * The booking form's error summary (7 Nov 2026): every problem is listed,
 * linked where its question is on screen - "no case where an error belongs to
 * a question that isn't on screen".
 */
describe("collectProblems", () => {
  it("keeps every distinct problem, in order, and drops exact repeats and blanks", () => {
    const out = collectProblems([
      { message: "Guest name is required", path: "rooms.0.guests.0.name" },
      { message: "Guest name is required", path: "rooms.0.guests.1.name" },
      { message: "Guest name is required", path: "rooms.0.guests.0.name" },
      { message: "  ", path: "x" },
      { message: "Your role cannot submit booking requests", path: "booking_type" },
      { message: "Refused by the server", path: null },
    ]);
    expect(out).toEqual([
      { message: "Guest name is required", path: "rooms.0.guests.0.name" },
      { message: "Guest name is required", path: "rooms.0.guests.1.name" },
      { message: "Your role cannot submit booking requests", path: "booking_type" },
      { message: "Refused by the server", path: null },
    ]);
  });
});

describe("problemSelectors", () => {
  it("tries the field by name, then by id", () => {
    expect(problemSelectors("purpose_of_visit").slice(0, 2)).toEqual([
      '[name="purpose_of_visit"]',
      "#purpose_of_visit",
    ]);
  });

  it("finds an input for paths that have none of their own", () => {
    expect(problemSelectors("check_in")).toContain("#check_in_date");
    expect(problemSelectors("rooms.1.guests")).toContain('[name="rooms.1.guests.0.name"]');
    expect(problemSelectors("rooms.0.guests.2.infant")).toContain('[name="rooms.0.guests.2.name"]');
    expect(problemSelectors("rooms")).toContain("#rooms_requested");
    expect(problemSelectors("service_type")).toContain("#meals-section");
    expect(problemSelectors("copy_to_emails")).toContain('[name="copy_to.0.email"]');
    expect(problemSelectors("custom.cf_1")).toContain("#cf_1");
  });

  it("has nothing to look for when the problem has no path - it is still listed", () => {
    expect(problemSelectors(null)).toEqual([]);
  });

  it("escapes a custom field id a selector would choke on", () => {
    expect(problemSelectors("custom.a b")).toContain("#a\\ b");
  });
});

describe("problemToast", () => {
  it("says the message itself when there is one, and never 'the highlighted fields'", () => {
    expect(problemToast([{ message: "Select a guest house", path: "guest_house_id" }])).toBe("Select a guest house");
    const many = problemToast([
      { message: "a", path: null },
      { message: "b", path: null },
    ]);
    expect(many).toContain("2 things");
    expect(many).not.toMatch(/highlighted/i);
  });
});
