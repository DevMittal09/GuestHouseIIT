import { MEAL_KEYS, MEAL_LABELS, MEAL_TIMES } from "./meals";
import { INFANT_AGE_LIMIT, ROOM_CAPACITY, ROOM_TYPE_LABELS } from "./occupancy";
import type { SiteGuestHouse, SitePolicies } from "./site-data";
import type { RoomType } from "./types";
import { ADVANCE_BOOKING_WINDOW_MONTHS } from "./workflow";

/**
 * Copy for the public website, built from the same constants the portal
 * enforces: room capacity, meal serving windows, the advance-booking window,
 * approval routes and the cancellation rules. Change a rule in `lib/` and the
 * website follows. Only facts the backend does not model — the building's
 * amenities and house rules — are written out here, and those are marked
 * TODO(site) until the guest house office confirms them.
 */

export type ContentCard = { kicker?: string; title: string; items: string[] };

/** "Hamsanandi and Bageshri", "A, B and C". */
export function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function capacityLine(type: RoomType): string {
  const { standard, withExtraBed } = ROOM_CAPACITY[type];
  return `${ROOM_TYPE_LABELS[type]} rooms for ${plural(standard, "guest")}, or ${withExtraBed} with an extra bed`;
}

/** "20 rooms · 10 double sharing · 10 single". */
export function describeRooms(house: SiteGuestHouse): string {
  const parts = [plural(house.activeRooms, "room")];
  for (const type of ["double_sharing", "single"] as const) {
    const n = house.roomsByType[type];
    if (n > 0) parts.push(`${n} ${ROOM_TYPE_LABELS[type].toLowerCase()}`);
  }
  return parts.join(" · ");
}

export function servingHouses(houses: SiteGuestHouse[]): SiteGuestHouse[] {
  return houses.filter((h) => h.serves_meals);
}

export function mealTimeLines(): string[] {
  return MEAL_KEYS.map((meal) => `${MEAL_LABELS[meal]}, ${MEAL_TIMES[meal]}`);
}

export function facilityCards(houses: SiteGuestHouse[]): ContentCard[] {
  const roomTypes = (["double_sharing", "single"] as const).filter((type) =>
    houses.some((h) => h.roomsByType[type] > 0)
  );
  const serving = servingHouses(houses);

  return [
    {
      kicker: "Rooms",
      title: "Stay",
      items: [
        ...roomTypes.map(capacityLine),
        `Children under ${INFANT_AGE_LIMIT} share a guardian's bed and need no room of their own`,
        // TODO(site): amenities from the guest house page on iitpkd.ac.in;
        // confirm they hold for every guest house.
        "Air-conditioned rooms with attached bathroom and geyser",
        "Wi-Fi, television and refrigerator",
      ],
    },
    {
      kicker: "Dining",
      title: "Food",
      items:
        serving.length > 0
          ? [
              `Meals served at ${joinNames(serving.map((h) => h.name))}`,
              ...mealTimeLines(),
              "Chosen day by day when you request your room",
            ]
          : ["Meals are not being served at the guest houses at present"],
    },
    {
      kicker: "Work",
      title: "Meetings",
      // TODO(site): from the guest house page on iitpkd.ac.in; confirm.
      items: ["Meeting room seating up to 50", "Exercise room", "Common water purifier"],
    },
    {
      kicker: "Services",
      title: "Support",
      items: [
        "Requests raised and approved online, with every step recorded",
        "Email updates at every step of your request",
        "Live room availability by day, week or month",
        "Reception desk for arrivals and departures",
      ],
    },
  ];
}

export function guidelineCards(houses: SiteGuestHouse[], policies: SitePolicies): ContentCard[] {
  const allHouses = houses.length;
  const who = policies.routes.map((route) =>
    route.guestHouses.length > 0 && route.guestHouses.length < allHouses
      ? `${route.label} — ${joinNames(route.guestHouses)} only`
      : route.label
  );
  const dependency = policies.studentDependency;
  const exempt = policies.routes.filter((r) => r.advanceWindowExempt).map((r) => r.label);
  const serving = servingHouses(houses);

  return [
    {
      title: "Who can book",
      items: [
        ...who,
        "Alumni are booked by the IAR Student Cell or the IAR Office on their behalf",
        ...(dependency
          ? [
              `Students may book for ${joinNames(dependency.parents).toLowerCase()} freely; for ${joinNames(dependency.dependents).toLowerCase()} only when a parent is staying too`,
            ]
          : []),
      ],
    },
    {
      title: "Booking and approval",
      items: [
        ...policies.routes.map((r) => `${r.label}: ${r.approvers.join(" → ")}`),
        `Check-in must fall within ${plural(ADVANCE_BOOKING_WINDOW_MONTHS, "month")} of the request${
          exempt.length > 0 ? ` (${joinNames(exempt)} exempt)` : ""
        }`,
        "Rooms are allotted by the Guest House Manager on approval; a particular room is not guaranteed",
        "A request that is declined always carries the reason",
      ],
    },
    {
      title: "Check-in and check-out",
      items: [
        "Arrival and departure times are chosen on the request, and the room is held for exactly that period",
        "A room becomes free again at the booked check-out time",
        "Reception marks guests in on arrival — never before the booked check-in",
        "Carry the identity document named on the request",
      ],
    },
    {
      title: "Meals",
      items:
        serving.length > 0
          ? [
              `Served at ${joinNames(serving.map((h) => h.name))}`,
              ...mealTimeLines(),
              "Every meal your stay covers is ticked by default; untick the ones you will not need",
            ]
          : ["Meals are not being served at the guest houses at present"],
    },
    {
      title: "Cancellation",
      items: [
        "A request can be withdrawn from My Bookings at any time before approval, with a reason",
        "After approval, request cancellation with a reason; the Guest House Manager approves or declines it",
        "The rooms stay held until that decision, and are released as soon as it is approved",
      ],
    },
    {
      title: "During your stay",
      // TODO(site): house rules from the design handoff, not modelled by the
      // portal — confirm with the guest house office.
      items: [
        "Smoking, alcohol and loud music are not permitted",
        "Visitors are received in the lounge, not in rooms",
        "Pets are not allowed",
        "Guests are responsible for damage to fittings and furniture",
      ],
    },
  ];
}
