import { describe, expect, it } from "vitest";
import { mealBookingDeadline } from "@/lib/meals";
import { DEFAULT_RULES, type Rules } from "@/lib/settings";
import { GUEST_HOUSE_LOCATIONS, guestHouseMapPins, INSTITUTE_MAP, MRBS_URL, SITE_LINKS } from "@/lib/site";
import {
  guidelineSections,
  homeFacts,
  MEAL_NOTICE_RULE,
  openTo,
} from "@/lib/site-content";
import type { BookingRoute, SiteGuestHouse, SitePolicies } from "@/lib/site-data";

/**
 * The public site's redesign (26 Sep 2026): the two guest-house map pins,
 * the figures on the home page, who may request each guest house, and the
 * numbered guidelines — all computed, so each is checked against the rules
 * it claims to state.
 */

function house(name: string, rooms: number, servesMeals: boolean): SiteGuestHouse {
  return {
    id: `gh-${name.toLowerCase()}`,
    name,
    total_rooms: rooms,
    serves_meals: servesMeals,
    roomsByType: { double_sharing: rooms, single: 0 },
    activeRooms: rooms,
  };
}

const BAGESHRI = house("Bageshri", 10, false);
const HAMSANANDI = house("Hamsanandi", 13, true);

const ROUTES: BookingRoute[] = [
  {
    role: "student",
    label: "Student",
    approvers: ["Assistant Warden", "Guest House Manager"],
    guestHouses: ["Bageshri"],
    advanceWindowExempt: false,
  },
  {
    role: "employee",
    label: "Employee (Faculty & Staff)",
    approvers: ["HOD", "Guest House Manager"],
    guestHouses: ["Bageshri", "Hamsanandi"],
    advanceWindowExempt: false,
  },
  {
    role: "official",
    label: "Official / Dignitary",
    approvers: ["HOD (if the office asks for it)", "Guest House Manager"],
    guestHouses: ["Bageshri", "Hamsanandi"],
    advanceWindowExempt: true,
  },
];

function policies(rules: Rules = DEFAULT_RULES): SitePolicies {
  return { routes: ROUTES, studentDependency: null, rules };
}

describe("guest house map pins", () => {
  it("offers a pin per guest house, in the registry's order, under the store's name", () => {
    const pins = guestHouseMapPins(["Bageshri", "Hamsanandi"]);
    expect(pins.map((p) => p.slug)).toEqual(Object.keys(GUEST_HOUSE_LOCATIONS));
    expect(pins.map((p) => p.name)).toEqual(["Hamsanandi", "Bageshri"]);
  });

  it("points each pin at that guest house, not at the institute", () => {
    const [hamsanandi, bageshri] = guestHouseMapPins(["Hamsanandi", "Bageshri"]);
    expect(hamsanandi.embedUrl).toContain("ll=10.7984359,76.7299972");
    expect(hamsanandi.embedUrl).toContain(encodeURIComponent("Hamsanandi Guest house IIT pkd"));
    expect(hamsanandi.embedUrl).toContain("output=embed");
    expect(hamsanandi.openUrl).toBe("https://maps.app.goo.gl/GbKrfiao8TuKxgNA6");
    expect(hamsanandi.directionsUrl).toContain("destination=10.7984359,76.7299972");
    expect(bageshri.embedUrl).toContain("ll=10.8063107,76.726681");
    expect(bageshri.openUrl).toBe("https://maps.app.goo.gl/AspNpPu7sTDLXxL2A");
    // The Content-Security-Policy allows exactly these frame sources (proxy.ts).
    for (const pin of [hamsanandi, bageshri]) {
      expect(new URL(pin.embedUrl).host).toBe("maps.google.com");
    }
  });

  it("matches a store name to its pin whatever its case or spacing", () => {
    const pins = guestHouseMapPins(["HAMSANANDI"]);
    expect(pins).toHaveLength(1);
    expect(pins[0].name).toBe("HAMSANANDI");
  });

  it("leaves out a guest house with no pin rather than guessing one", () => {
    expect(guestHouseMapPins(["Bageshri", "New Annexe"]).map((p) => p.name)).toEqual(["Bageshri"]);
  });

  it("still offers every pin when the store could not be read", () => {
    expect(guestHouseMapPins([]).map((p) => p.name)).toEqual(["Hamsanandi", "Bageshri"]);
    expect(guestHouseMapPins(["Only Unknown"]).length).toBe(Object.keys(GUEST_HOUSE_LOCATIONS).length);
    expect(INSTITUTE_MAP.embedUrl).toContain("IIT%20Palakkad");
  });
});

describe("footer links", () => {
  it("carries the institute website and MRBS", () => {
    const hrefs = SITE_LINKS.map((l) => l.href);
    expect(hrefs).toContain("https://iitpkd.ac.in");
    expect(hrefs).toContain(MRBS_URL);
    expect(MRBS_URL).toBe("https://mrbs.iitpkd.ac.in");
  });
});

describe("home page figures", () => {
  it("adds up the rooms and names the guest houses", () => {
    const facts = homeFacts([BAGESHRI, HAMSANANDI]);
    expect(facts[0]).toEqual({ value: "23", unit: "rooms", label: "across Bageshri and Hamsanandi" });
  });

  it("quotes the advance window and stay cap from Settings", () => {
    const rules: Rules = {
      ...DEFAULT_RULES,
      booking: { ...DEFAULT_RULES.booking, advance_booking_months: 2, max_stay_nights: 7 },
    };
    const facts = homeFacts([BAGESHRI], rules);
    expect(facts).toContainEqual(expect.objectContaining({ value: "2", unit: "months" }));
    expect(facts).toContainEqual(expect.objectContaining({ value: "7", unit: "nights" }));
  });

  it("drops a figure with nothing behind it", () => {
    const rules: Rules = { ...DEFAULT_RULES, booking: { ...DEFAULT_RULES.booking, max_stay_nights: 0 } };
    const facts = homeFacts([BAGESHRI], rules);
    expect(facts.map((f) => f.unit)).not.toContain("nights");
    // Bageshri has no kitchen, so no meals figure either.
    expect(facts.map((f) => f.unit)).not.toContain("meals a day");
    expect(homeFacts([HAMSANANDI]).map((f) => f.unit)).toContain("meals a day");
  });
});

describe("who may request each guest house", () => {
  it("reads the saved form configs through the routes", () => {
    expect(openTo(BAGESHRI, ROUTES)).toBe("Everyone who can book");
    expect(openTo(HAMSANANDI, ROUTES)).toBe("Everyone except students");
  });

  it("says nothing when the routes could not be read", () => {
    expect(openTo(BAGESHRI, [])).toBe("");
  });
});

describe("guidelines", () => {
  const sections = guidelineSections([BAGESHRI, HAMSANANDI], policies());
  const byId = Object.fromEntries(sections.map((s) => [s.id, s]));

  it("is a numbered document with unique anchors", () => {
    expect(new Set(sections.map((s) => s.id)).size).toBe(sections.length);
    expect(sections.map((s) => s.id)).toEqual([
      "eligibility",
      "requests",
      "rooms",
      "arrival",
      "meals",
      "charges",
      "cancellation",
      "conduct",
      "safety",
    ]);
  });

  it("says which guest houses each category may book", () => {
    expect(byId.eligibility.items).toContain("Student — Bageshri only");
    expect(byId.eligibility.items).toContain("Employee (Faculty & Staff) — any guest house");
  });

  it("marks only the house rules as provisional", () => {
    expect(sections.filter((s) => s.provisional).map((s) => s.id)).toEqual(["conduct", "safety"]);
  });

  it("states the portal's rules from Settings", () => {
    const requests = byId.requests.items.join(" ");
    expect(requests).toContain("within 1 month");
    expect(requests).toContain("at most 14 nights");
    expect(requests).toContain("Official / Dignitary exempt");
    expect(byId.requests.routes).toEqual(ROUTES);

    const rules: Rules = {
      ...DEFAULT_RULES,
      booking: { ...DEFAULT_RULES.booking, advance_booking_months: 3, max_stay_nights: 0 },
      invoice: { ...DEFAULT_RULES.invoice, gst_room_percent: 12, gst_meal_percent: 5 },
    };
    const changed = Object.fromEntries(
      guidelineSections([BAGESHRI, HAMSANANDI], policies(rules)).map((s) => [s.id, s])
    );
    expect(changed.requests.items.join(" ")).toContain("within 3 months");
    expect(changed.requests.items.join(" ")).not.toContain("nights");
    expect(changed.charges.items.join(" ")).toContain("12% on rooms and 5% on meals");
  });

  it("states the room combination the booking form enforces", () => {
    const rooms = byId.rooms.items.join(" ");
    expect(rooms).toContain("Maximum 4 people per room");
    expect(rooms).toContain("3 guests + 1 infant");
  });

  it("names the guest house that serves meals, and none when none does", () => {
    expect(byId.meals.items[0]).toMatch(/^Served at Hamsanandi/);
    const noKitchen = guidelineSections([BAGESHRI], policies());
    expect(noKitchen.find((s) => s.id === "meals")?.items).toEqual([
      "Meals are not being served at the guest houses at present",
    ]);
  });

  it("describes the kitchen's notice period the way the form applies it", () => {
    // Lunch closes when breakfast ends; tomorrow's breakfast when dinner ends.
    expect(MEAL_NOTICE_RULE).toContain("lunch before breakfast ends");
    const lunch = mealBookingDeadline("2026-10-01", "lunch");
    const breakfastEnds = DEFAULT_RULES.meals.windows.breakfast.end;
    expect(lunch.toISOString()).toBe(new Date(`2026-10-01T${breakfastEnds}:00+05:30`).toISOString());
    const breakfast = mealBookingDeadline("2026-10-02", "breakfast");
    const dinnerEnds = DEFAULT_RULES.meals.windows.dinner.end;
    expect(breakfast.toISOString()).toBe(new Date(`2026-10-01T${dinnerEnds}:00+05:30`).toISOString());
  });
});
