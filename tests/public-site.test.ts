import { describe, expect, it } from "vitest";
import { mealBookingDeadline } from "@/lib/meals";
import { DEFAULT_RULES, type Rules } from "@/lib/settings";
import {
  GALLERY_SECTIONS,
  GUEST_HOUSE_LOCATIONS,
  GUEST_HOUSE_PHOTOS,
  guestHouseMapPins,
  guestHousePhoto,
  HOME_PHOTOS,
  INSTITUTE_MAP,
  PHOTOS,
  SITE_LINKS,
} from "@/lib/site";
import { amenities, BOOKING_STEPS, guidelineSections, homeIntro, MEAL_NOTICE_RULE } from "@/lib/site-content";
import type { SiteGuestHouse } from "@/lib/site-data";
import { ROLE_LABELS, type Role } from "@/lib/types";

/**
 * The public site (26 Sep 2026): the two guest-house map pins, the footer's
 * links, the amenities, and the Guidelines - whose rules are computed from
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
  it("carries the institute website", () => {
    const hrefs = SITE_LINKS.map((l) => l.href);
    expect(hrefs).toContain("https://iitpkd.ac.in");
  });

  // The office asked for the Meeting Room Booking System to come off the site
  // entirely (7 Oct 2026) - the footer banner, the Contact page sentence and
  // the portal footer's link.
  it("no longer mentions the meeting room booking system", () => {
    for (const link of SITE_LINKS) {
      expect(link.href).not.toContain("mrbs");
      expect(link.label).not.toMatch(/MRBS/i);
    }
  });
});

describe("guest house photographs (15 Oct 2026)", () => {
  /**
   * The owner named the main photograph of each guest house. Nothing else on
   * the site says which house a photograph shows, and the point of these
   * tests is that it stays that way: an attribution is a statement of fact,
   * so a wrong one is worse than none.
   */
  it("gives each named guest house its own photograph", () => {
    expect(guestHousePhoto("Hamsanandi")).toBe(PHOTOS.hamsanandiCourtyard);
    expect(guestHousePhoto("Bageshri")).toBe(PHOTOS.bageshriFront);
  });

  it("matches on the slug, so casing does not matter but a different name is a different house", () => {
    expect(guestHousePhoto("HAMSANANDI")).toBe(PHOTOS.hamsanandiCourtyard);
    // Renaming a guest house in the console takes its photograph off the
    // card until the registry is taught the new name - the same way its map
    // pin goes, and deliberately: the office renamed it, we did not.
    expect(guestHousePhoto("Bageshri Guest House")).toBeNull();
  });

  it("returns nothing for a guest house it does not know, rather than another house's photograph", () => {
    // The card renders its placeholder instead. Borrowing would put the
    // wrong building under a name somebody reads as a fact.
    expect(guestHousePhoto("Kalyani")).toBeNull();
    expect(Object.values(GUEST_HOUSE_PHOTOS)).toHaveLength(2);
  });

  it("shows the two attributed photographs in the hero, and only those two", () => {
    // 27 Oct 2026: "Use only the first two of the six images currently used
    // in the landing-page slideshow." They are also the only two the site is
    // allowed to attribute, so the one photograph that fills the screen is
    // always of a guest house the page would name.
    expect(HOME_PHOTOS.slides).toEqual([PHOTOS.hamsanandiCourtyard, PHOTOS.bageshriFront]);
    expect(Object.values(GUEST_HOUSE_PHOTOS)).toEqual(HOME_PHOTOS.slides);
  });

  it("shows a different photograph beside the opening statement again", () => {
    // 28 Oct 2026: the page opens on a sentence with one photograph beside
    // it. Three blocks inside two screens, so all three sets are disjoint -
    // the hero, the opening statement and the mosaic must not show the
    // reader the same building three times.
    const slides = HOME_PHOTOS.slides.map((p) => p.src);
    const preview = HOME_PHOTOS.preview.map((p) => p.src);
    expect(slides).not.toContain(HOME_PHOTOS.intro.src);
    expect(preview).not.toContain(HOME_PHOTOS.intro.src);
    expect(HOME_PHOTOS.intro.alt).not.toMatch(/Hamsanandi|Bageshri/);
  });

  it("shows nothing in the gallery preview that the hero already showed", () => {
    // Scrolling past the hero has to find new photographs, or the page
    // repeats itself twice over within two screens. "Do not reuse either of
    // the two images used in the hero slideshow" (27 Oct 2026).
    const slides = new Set(HOME_PHOTOS.slides.map((p) => p.src));
    for (const photo of HOME_PHOTOS.preview) {
      expect(slides, `${photo.src} is in both the hero and the preview`).not.toContain(photo.src);
    }
    expect(new Set(HOME_PHOTOS.preview.map((p) => p.src)).size).toBe(HOME_PHOTOS.preview.length);
  });

  it("keeps the preview six, which is what the mosaic's spans tile exactly", () => {
    // The mosaic (28 Oct 2026) is 5+7 / 3+4 / 7+5 across twelve columns, in
    // that order, and two columns below `lg` with the first and last spanning
    // both. Six photographs fill it with no hole; a seventh needs the pattern
    // rethought rather than appended to - which is what this guards.
    expect(HOME_PHOTOS.preview).toHaveLength(6);
  });

  it("keeps every photograph the site holds in the Gallery", () => {
    const inGallery = new Set(GALLERY_SECTIONS.flatMap((s) => s.photos).map((p) => p.src));
    for (const photo of Object.values(PHOTOS)) {
      expect(inGallery, `${photo.src} is served but reachable from nowhere`).toContain(photo.src);
    }
  });

  it("describes what is visible, and never names a guest house in alt text the page does not attribute", () => {
    for (const photo of HOME_PHOTOS.preview) {
      expect(photo.alt).not.toMatch(/Hamsanandi|Bageshri/);
    }
  });
});

describe("amenities", () => {
  it("lists dining only where a guest house serves meals, and always six for an even grid", () => {
    expect(amenities([BAGESHRI, HAMSANANDI]).map((a) => a.key)).toContain("dining");
    expect(amenities([BAGESHRI]).map((a) => a.key)).not.toContain("dining");
    expect(amenities([BAGESHRI, HAMSANANDI])).toHaveLength(6);
    expect(amenities([BAGESHRI])).toHaveLength(6);
    // Shared facilities, not the guest houses' own (30 Sep 2026).
    const keys = amenities([BAGESHRI, HAMSANANDI]).map((a) => a.key);
    expect(keys).not.toContain("meeting");
    expect(keys).not.toContain("gym");
  });
});

describe("the home page's opening statement (28 Oct 2026)", () => {
  it("names the guest houses the store holds, and says so grammatically for one", () => {
    expect(homeIntro([HAMSANANDI, BAGESHRI]).body[0]).toBe(
      "Hamsanandi and Bageshri are the institute's guest houses on the campus at Palakkad."
    );
    expect(homeIntro([BAGESHRI]).body[0]).toBe(
      "Bageshri is the institute's guest house on the campus at Palakkad."
    );
  });

  it("falls back to a sentence that names none when the store could not be read", () => {
    // `getSiteGuestHouses` swallows a store error so the public site cannot
    // 500, which means this page has to read correctly with no guest houses
    // at all - the same reason `guestHouseMapPins([])` still offers both pins.
    expect(homeIntro([]).body[0]).toBe("The institute's guest houses stand on the campus at Palakkad.");
  });

  it("mentions meals only where a guest house has a kitchen, as the amenities do", () => {
    expect(homeIntro([BAGESHRI, HAMSANANDI]).body[1]).toContain("meals");
    expect(homeIntro([BAGESHRI]).body[1]).not.toContain("meals");
  });

  it("states no figure, so the page keeps the rule of 26 Sep 2026", () => {
    // "23 rooms... 1 month... 14 nights" came off the home page that day.
    const intro = homeIntro([BAGESHRI, HAMSANANDI]);
    expect([intro.title, ...intro.body].join(" ")).not.toMatch(/\d/);
  });
});

describe("the public copy keeps the portal's internals to itself", () => {
  // Every role name the portal uses, bar the ones a guest would say anyway.
  const internal = (Object.entries(ROLE_LABELS) as [Role, string][])
    .filter(([role]) => !["student", "developer"].includes(role))
    .map(([, label]) => label);
  const words = ["Warden", "HOD", "IAR", "Faculty Advisor", "Caretaker", "Official / Dignitary", "whitelist"];

  const intro = homeIntro([BAGESHRI, HAMSANANDI]);
  const copy = [
    ...BOOKING_STEPS.flatMap((s) => [s.title, s.body]),
    ...guidelineSections([BAGESHRI, HAMSANANDI]).flatMap((s) => [s.title, ...s.items]),
    intro.title,
    ...intro.body,
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
    expect(byId.meals.timetable?.[0].time).toBe("8:00 – 9:30 AM");

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
