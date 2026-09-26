import { MEALS_ONLY_AUDIENCE } from "./booking-types";
import { MEAL_KEYS, MEAL_LABELS, mealTimes } from "./meals";
import {
  describeRoomParties,
  INFANT_AGE_LIMIT,
  roomOccupancyNotice,
  ROOM_TYPE_LABELS,
} from "./occupancy";
import { BOOKING_DURATION_EXEMPT_ROLES, CONTACT_FOR_LONGER_STAYS } from "./policy";
import { DEFAULT_RULES, type Rules } from "./settings";
import { describeBuffer } from "./turnover";
import type { BookingRoute, SiteGuestHouse, SitePolicies } from "./site-data";
import { ROLE_LABELS, type Role, type RoomType } from "./types";

/**
 * Copy for the public website, built from the same constants the portal
 * enforces: room capacity, meal serving windows, the advance-booking window,
 * the stay cap, approval routes and the cancellation rules. Change a rule in
 * `lib/` and the website follows. Only facts the backend does not model — the
 * building's amenities and the house rules — are written out here, and those
 * are marked TODO(site) until the guest house office confirms them.
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

function capacityLine(type: RoomType, rules: Rules): string {
  const { standard, withExtraBed } = rules.capacity.room_types[type];
  return `${ROOM_TYPE_LABELS[type]} rooms for ${plural(standard, "guest")}, or ${withExtraBed} with an extra bed`;
}

/** Room types some guest house actually has, in a fixed order. */
function roomTypesIn(houses: SiteGuestHouse[]): RoomType[] {
  return (["double_sharing", "single"] as const).filter((type) =>
    houses.some((h) => h.roomsByType[type] > 0)
  );
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

/** The serving times the office set in Settings (`getRules()`), one line per meal. */
export function mealTimeLines(rules: Rules = DEFAULT_RULES): string[] {
  const times = mealTimes(rules.meals.windows);
  return MEAL_KEYS.map((meal) => `${MEAL_LABELS[meal]}, ${times[meal]}`);
}

/** The same, as rows for a timetable. */
export function mealTimetable(rules: Rules = DEFAULT_RULES): { meal: string; time: string }[] {
  const times = mealTimes(rules.meals.windows);
  return MEAL_KEYS.map((meal) => ({ meal: MEAL_LABELS[meal], time: times[meal] }));
}

/**
 * The kitchen's notice period, as `isMealBookable` in `lib/meals.ts` applies
 * it: each meal closes when the one before it finishes being served.
 */
export const MEAL_NOTICE_RULE =
  "A meal must be booked before the previous one finishes being served: lunch before breakfast ends, dinner before lunch ends, and the next morning's breakfast before dinner ends.";

// ------------------------------------------------------------------ home page

export type HomeFact = { value: string; unit: string; label: string };

/**
 * The figures under the home page's hero — every one computed, so the page
 * cannot advertise a window or a cap the booking form does not apply. A figure
 * with nothing behind it (no meals served, no stay cap) is left out.
 */
export function homeFacts(houses: SiteGuestHouse[], rules: Rules = DEFAULT_RULES): HomeFact[] {
  const facts: HomeFact[] = [];
  const rooms = houses.reduce((sum, h) => sum + h.activeRooms, 0);
  if (rooms > 0) {
    facts.push({
      value: String(rooms),
      unit: rooms === 1 ? "room" : "rooms",
      label: `across ${joinNames(houses.map((h) => h.name))}`,
    });
  }
  const months = rules.booking.advance_booking_months;
  facts.push({
    value: String(months),
    unit: months === 1 ? "month" : "months",
    label: "the furthest ahead a check-in can be requested",
  });
  const nights = rules.booking.max_stay_nights;
  if (nights > 0) {
    facts.push({
      value: String(nights),
      unit: nights === 1 ? "night" : "nights",
      label: "the longest stay a single request can cover",
    });
  }
  const serving = servingHouses(houses);
  if (serving.length > 0) {
    facts.push({
      value: String(MEAL_KEYS.length),
      unit: "meals a day",
      label: `served at ${joinNames(serving.map((h) => h.name))}, booked day by day`,
    });
  }
  return facts;
}

/** Requester categories as a sentence names them: "students", "the IAR Office". */
const REQUESTERS_IN_PROSE: Partial<Record<Role, string>> = {
  student: "students",
  employee: "faculty and staff",
  official: "institute offices",
  club: "clubs and councils",
  iar_cell: "the IAR Office",
  iar_student_cell: "the IAR Student Cell",
};

function inProse(role: Role): string {
  return REQUESTERS_IN_PROSE[role] ?? ROLE_LABELS[role];
}

/**
 * Who may request a room at one guest house, from the routes the saved form
 * configs produce: "Everyone who can book", "Everyone except students", or
 * the list.
 */
export function openTo(house: SiteGuestHouse, routes: BookingRoute[]): string {
  if (routes.length === 0) return "";
  const allowed = routes.filter((r) => r.guestHouses.includes(house.name));
  if (allowed.length === routes.length) return "Everyone who can book";
  if (allowed.length === 0) return "The Guest House Office, on a guest's behalf";
  const excluded = routes.filter((r) => !allowed.includes(r));
  if (excluded.length <= 2) return `Everyone except ${joinNames(excluded.map((r) => inProse(r.role)))}`;
  const list = joinNames(allowed.map((r) => inProse(r.role)));
  return list.charAt(0).toUpperCase() + list.slice(1);
}

export type BookingStep = { title: string; body: string };

/** How a request moves, in five steps — the portal's actual pipeline. */
export function bookingSteps(rules: Rules = DEFAULT_RULES): BookingStep[] {
  return [
    {
      title: "Sign in",
      body: "With your institute LDAP account. Visitors without one are booked by the faculty member, office or student hosting them.",
    },
    {
      title: "Raise the request",
      body: `Dates, the guests in each room, and the budget head the stay is charged to. Check-in must fall within ${plural(
        rules.booking.advance_booking_months,
        "month"
      )}.`,
    },
    {
      title: "Approval",
      body: "The request goes to the approvers for your category, listed below. You get an email at every step, and a decline always carries its reason.",
    },
    {
      title: "Rooms allotted",
      body: "The Guest House Manager assigns the actual rooms and confirms the booking by email.",
    },
    {
      title: "Stay and settle",
      body: "Reception checks guests in on arrival. The invoice is issued at check-out.",
    },
  ];
}

export function facilityCards(houses: SiteGuestHouse[], rules: Rules = DEFAULT_RULES): ContentCard[] {
  const serving = servingHouses(houses);

  return [
    {
      kicker: "Rooms",
      title: "In the rooms",
      items: [
        ...roomTypesIn(houses).map((type) => capacityLine(type, rules)),
        `Children under ${INFANT_AGE_LIMIT} share a guardian's bed and need no room of their own`,
        // TODO(site): amenities from the guest house page on iitpkd.ac.in;
        // confirm they hold for every guest house.
        "Air-conditioned, with attached bathroom and geyser",
        "Wi-Fi, television and refrigerator",
      ],
    },
    {
      kicker: "Dining",
      title: "Dining",
      items:
        serving.length > 0
          ? [
              `Meals served at ${joinNames(serving.map((h) => h.name))}`,
              ...mealTimeLines(rules),
              "Chosen day by day when you request your room",
            ]
          : ["Meals are not being served at the guest houses at present"],
    },
    {
      kicker: "Premises",
      title: "On the premises",
      // TODO(site): from the guest house page on iitpkd.ac.in; confirm.
      items: ["Meeting room seating up to 50", "Exercise room", "Common water purifier"],
    },
    {
      kicker: "Services",
      title: "Service",
      items: [
        "Requests raised and approved online, with every step recorded",
        "Email updates at every step of your request",
        "Live room availability by day, week or month",
        "Reception desk for arrivals and departures",
      ],
    },
  ];
}

// ----------------------------------------------------------------- guidelines

/**
 * One numbered section of the Guidelines page. `routes` asks the page to draw
 * the approval-route table under the items; `provisional` marks a section
 * whose items are placeholders the office has not confirmed yet.
 */
export type GuidelineSection = {
  id: string;
  title: string;
  items: string[];
  routes?: BookingRoute[];
  provisional?: boolean;
};

/**
 * The Guidelines page, section by section. Sections 1–7 are the portal's own
 * rules, rendered from `lib/` and the office's Settings; 8 and 9 are house
 * rules the portal does not model.
 */
export function guidelineSections(houses: SiteGuestHouse[], policies: SitePolicies): GuidelineSection[] {
  const { rules, routes } = policies;
  const allHouses = houses.length;
  // The plain role name: how a club books is its own clause below.
  const who = routes.map((route) => {
    const limited = route.guestHouses.length > 0 && route.guestHouses.length < allHouses;
    return `${ROLE_LABELS[route.role]} — ${limited ? `${joinNames(route.guestHouses)} only` : "any guest house"}`;
  });
  const dependency = policies.studentDependency;
  const windowExempt = routes.filter((r) => r.advanceWindowExempt).map((r) => r.label);
  const stayExempt = routes
    .filter((r) => BOOKING_DURATION_EXEMPT_ROLES.includes(r.role))
    .map((r) => r.label);
  const serving = servingHouses(houses);
  const invoice = rules.invoice;
  const maxNights = rules.booking.max_stay_nights;

  return [
    {
      id: "eligibility",
      title: "Who may book",
      items: [
        ...who,
        "Visitors with no institute account are booked by the faculty member, office or student hosting them",
        "Alumni are booked by the IAR Student Cell or the IAR Office on their behalf",
        "A club or council's booking is raised by its Faculty Advisor",
        ...(dependency
          ? [
              `Students may book for ${joinNames(dependency.parents).toLowerCase()} freely, and for ${joinNames(
                dependency.dependents
              ).toLowerCase()} only when a parent is staying too`,
            ]
          : []),
      ],
    },
    {
      id: "requests",
      title: "Requests and approval",
      items: [
        `Check-in must fall within ${plural(rules.booking.advance_booking_months, "month")} of the day the request is made${
          windowExempt.length > 0 ? ` (${joinNames(windowExempt)} exempt)` : ""
        }`,
        ...(maxNights > 0
          ? [
              `A single request may cover at most ${plural(maxNights, "night")}${
                stayExempt.length > 0 ? ` (${joinNames(stayExempt)} exempt)` : ""
              }. ${CONTACT_FOR_LONGER_STAYS}`,
            ]
          : []),
        "Every request names the budget head the stay is charged to, and agrees to the privacy notice",
        "Other addresses may be copied on the request; they receive every email the requester does",
        "Each request goes through the approvals for the requester's category, in order, as in the table below",
        "Rooms are allotted by the Guest House Manager on approval; a particular room is not guaranteed",
        "A request that is declined always carries the reason",
      ],
      routes,
    },
    {
      id: "rooms",
      title: "Rooms and occupancy",
      items: [
        ...roomTypesIn(houses).map((type) => capacityLine(type, rules)),
        roomOccupancyNotice(rules.capacity),
        `A room is full at ${describeRoomParties(rules.capacity)}`,
        "An extra bed is rolled in by the staff and charged as its own line on the invoice",
      ],
    },
    {
      id: "arrival",
      title: "Check-in and check-out",
      items: [
        "Arrival and departure times are chosen on the request, and the room is held for exactly that period",
        rules.booking.buffer_minutes > 0
          ? `A room is held for ${describeBuffer(rules.booking.buffer_minutes)} after the booked check-out so it can be made ready for the next guest`
          : "A room becomes free again at the booked check-out time",
        "Reception marks guests in on arrival — never before the booked check-in",
        "Every adult guest carries a photo identity document, and the one named on the request where the form asked for it",
        "To arrive earlier or leave later, ask reception: the stay is moved only if the rooms are free for the new dates",
        // TODO(site): house practice, not modelled by the portal — confirm.
        "Room keys are collected from reception on arrival and returned there at check-out",
      ],
    },
    {
      id: "meals",
      title: "Meals",
      items:
        serving.length > 0
          ? [
              `Served at ${joinNames(serving.map((h) => h.name))}: ${mealTimeLines(rules)
                .map((line) => line.replace(", ", " "))
                .join("; ")}`,
              "Meals are chosen day by day on the room request, vegetarian or non-vegetarian; every meal the stay covers is ticked by default",
              MEAL_NOTICE_RULE,
              `Meals without a room can be booked by ${MEALS_ONLY_AUDIENCE}`,
            ]
          : ["Meals are not being served at the guest houses at present"],
    },
    {
      // Phase 10: the bill, from the same rules `lib/invoice.ts` prices it by.
      id: "charges",
      title: "Charges and payment",
      items: [
        invoice.day_basis === "night"
          ? "Rooms are charged by the night, counted between the actual check-in and check-out dates — never fewer than one"
          : `Rooms are charged in blocks of 24 hours from the actual check-in, with a permissible variation of ${plural(invoice.grace_hours, "hour")}`,
        invoice.prices_include_gst
          ? `The tariff includes GST — ${invoice.gst_room_percent}% on rooms and ${invoice.gst_meal_percent}% on meals, shown separately on the invoice`
          : `GST is added to the tariff on the invoice — ${invoice.gst_room_percent}% on rooms and ${invoice.gst_meal_percent}% on meals`,
        "An extra bed and meals served are charged in addition, each as its own line",
        "Damage or loss is recovered as an additional charge on the invoice",
        "The invoice is issued at check-out and can be settled in cash, by UPI or by transfer; an official stay is debited to the head named on the request",
        "A dining booking is invoiced from the day of its first meal",
      ],
    },
    {
      id: "cancellation",
      title: "Cancellation",
      items: [
        "A request can be cancelled from My Bookings at any time, with a reason; the Guest House Manager approves the cancellation",
        "The rooms stay held until that decision, and are released as soon as it is approved",
        "Once a guest has checked in, the stay is ended at reception instead",
      ],
    },
    {
      id: "conduct",
      title: "During your stay",
      provisional: true,
      // TODO(site): house rules usual at institute guest houses, written as
      // placeholders — the office to confirm or replace them.
      items: [
        "Only the guests named on the booking may occupy the room; rooms cannot be transferred or shared with others",
        "Smoking, alcohol and intoxicants are not permitted anywhere on the premises",
        "Quiet hours are 10:00 PM to 6:00 AM",
        "Visitors are received in the lounge between 8:00 AM and 9:00 PM, and may not stay overnight",
        "Cooking, heaters, induction stoves and other high-load appliances are not permitted in the rooms",
        "Pets are not allowed",
        "Furniture, linen and fittings stay in the room they belong to; nothing is to be fixed to the walls",
        "Switch off lights, fans and air-conditioning when leaving the room",
        "Keep valuables locked away; the guest house is not responsible for belongings left in rooms",
        "Rooms are cleaned daily between 9:00 AM and 12:00 noon; linen and towels are changed every third day and between guests",
        "The Guest House Manager may end a stay that breaks these rules",
      ],
    },
    {
      id: "safety",
      title: "Safety and help",
      provisional: true,
      // TODO(site): placeholders — the office to confirm.
      items: [
        "Note the fire exits and extinguishers on your floor when you arrive",
        "In a medical or other emergency, call reception at once; reception will reach the institute's medical centre and campus security",
        "Carry your booking confirmation and identity document when entering the campus; security may ask for them at the gate",
        "Lost property is kept at reception for 30 days",
        "Report a fault in the room to reception, and send feedback or a complaint to the Guest House Office by email",
      ],
    },
  ];
}
