import { describe, expect, it } from "vitest";
import { mealBookingDeadline } from "@/lib/meals";
import { DEFAULT_RULES, type Rules } from "@/lib/settings";
import { GUEST_HOUSE_LOCATIONS, guestHouseMapPins, INSTITUTE_MAP, MRBS_URL, SITE_LINKS } from "@/lib/site";
import { amenities, BOOKING_STEPS, guidelineSections, MEAL_NOTICE_RULE } from "@/lib/site-content";
import type { SiteGuestHouse } from "@/lib/site-data";
import { ROLE_LABELS, type Role } from "@/lib/types";

/**
 * The public site (26 Sep 2026): the two guest-house map pins, the footer's
 * links, the amenities, and the Guidelines — whose rules are computed from
 * Settings, and which must never show the portal's internals (the owner:
 * "do not display the backend logic like who are the users, who approves
 * who").
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

  it("matches a store name to its pin whatever its case", () => {
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

describe("amenities", () => {
  it("lists dining only where a guest house serves meals", () => {
    expect(amenities([BAGESHRI, HAMSANANDI]).map((a) => a.key)).toContain("dining");
    expect(amenities([BAGESHRI]).map((a) => a.key)).not.toContain("dining");
  });
});

describe("the public copy keeps the portal's internals to itself", () => {
  // Every role name the portal uses, bar the ones a guest would say anyway.
  const internal = (Object.entries(ROLE_LABELS) as [Role, string][])
    .filter(([role]) => !["student", "developer"].includes(role))
    .map(([, label]) => label);
  const words = ["Warden", "HOD", "IAR", "Faculty Advisor", "Caretaker", "Official / Dignitary", "whitelist"];

  const copy = [
    ...BOOKING_STEPS.flatMap((s) => [s.title, s.body]),
    ...guidelineSections([BAGESHRI, HAMSANANDI]).flatMap((s) => [s.title, ...s.items]),
  ].join("\n");

  it("names no role and no approval stage", () => {
    for (const term of [...internal, ...words]) {
      expect(copy, `the public copy mentions "${term}"`).not.toContain(term);
    }
  });

  it("describes booking in general terms, in five steps", () => {
    expect(BOOKING_STEPS.map((s) => s.title)).toEqual(["Sign in", "Request", "Approval", "Arrival", "Departure"]);
  });
});

describe("guidelines", () => {
  const sections = guidelineSections([BAGESHRI, HAMSANANDI]);
  const byId = Object.fromEntries(sections.map((s) => [s.id, s]));

  it("is a numbered document with unique anchors", () => {
    expect(new Set(sections.map((s) => s.id)).size).toBe(sections.length);
    expect(sections.map((s) => s.id)).toEqual([
      "booking",
      "rooms",
      "arrival",
      "meals",
      "charges",
      "cancellation",
      "conduct",
      "safety",
    ]);
  });

  it("marks only the house rules as provisional", () => {
    expect(sections.filter((s) => s.provisional).map((s) => s.id)).toEqual(["conduct", "safety"]);
  });

  it("states the portal's rules from Settings", () => {
    const booking = byId.booking.items.join(" ");
    expect(booking).toContain("within 1 month");
    expect(booking).toContain("up to 14 nights");

    const rules: Rules = {
      ...DEFAULT_RULES,
      booking: { ...DEFAULT_RULES.booking, advance_booking_months: 3, max_stay_nights: 0 },
      invoice: { ...DEFAULT_RULES.invoice, gst_room_percent: 12, gst_meal_percent: 5 },
    };
    const changed = Object.fromEntries(guidelineSections([BAGESHRI, HAMSANANDI], rules).map((s) => [s.id, s]));
    expect(changed.booking.items.join(" ")).toContain("within 3 months");
    expect(changed.booking.items.join(" ")).not.toContain("nights");
    expect(changed.charges.items.join(" ")).toContain("12% on rooms and 5% on meals");
  });

  it("states the room combination the booking form enforces", () => {
    const rooms = byId.rooms.items.join(" ");
    expect(rooms).toContain("Maximum 4 people per room");
    expect(rooms).toContain("3 guests + 1 infant");
  });

  it("gives the meal times from Settings where a guest house serves meals, and none where none does", () => {
    expect(byId.meals.items[0]).toMatch(/^Meals are served at Hamsanandi/);
    expect(byId.meals.timetable?.map((r) => r.meal)).toEqual(["Breakfast", "Lunch", "Dinner"]);
    expect(byId.meals.timetable?.[0].time).toBe("7:30 – 9:30 AM");

    const noKitchen = guidelineSections([BAGESHRI]).find((s) => s.id === "meals");
    expect(noKitchen?.items).toEqual(["Meals are not being served at the guest houses at present"]);
    expect(noKitchen?.timetable).toBeUndefined();
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
