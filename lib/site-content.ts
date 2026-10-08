import { MEAL_KEYS, MEAL_LABELS, mealTimes } from "./meals";
import { describeRoomParties, INFANT_AGE_LIMIT, roomOccupancyNotice, ROOM_TYPE_LABELS } from "./occupancy";
import { DEFAULT_RULES, type Rules } from "./settings";
import { describeBuffer } from "./turnover";
import type { SiteGuestHouse } from "./site-data";
import type { RoomType } from "./types";

/**
 * Copy for the public website.
 *
 * **What the public site says, and what it keeps to itself** (26 Sep 2026,
 * the owner): the site is for guests and the people who host them, so it
 * never shows the portal's internals - no requester categories, no approval
 * chains, no role names. The home page stays visual and light; rules and
 * instructions live on the Guidelines page, in general terms.
 *
 * **One statement per line** (8 Oct 2026). Every guideline was a sentence
 * with a second clause explaining the first - "contact the Guest House
 * Office", "a particular room cannot be promised", "which is what reception
 * checks". The supervisor asked for the content and not the commentary, so
 * each line now says one thing and stops. Nothing was dropped that a guest
 * has to know.
 *
 * Where a rule *is* stated (the advance window, the stay cap, capacity, meal
 * times, the kitchen's notice, charges), it is rendered from the same
 * constants and Settings the portal enforces, so it cannot drift. Only facts
 * the backend does not model - amenities and house rules - are written out,
 * marked TODO(site) until the guest house office confirms them.
 */

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

export function servingHouses(houses: SiteGuestHouse[]): SiteGuestHouse[] {
  return houses.filter((h) => h.serves_meals);
}

/** When each meal is served, from Settings, as rows for a timetable. */
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

/**
 * One line about a guest house for its card on the home page - what it
 * offers, from the store, with no counts: "Double-sharing rooms, with meals
 * served on site."
 */
export function houseSummary(house: SiteGuestHouse): string {
  const types = roomTypesIn([house]).map((type) => ROOM_TYPE_LABELS[type].toLowerCase().replace(" ", "-"));
  const rooms = types.length > 0 ? `${joinNames(types).replace(/^./, (c) => c.toUpperCase())} rooms` : "Rooms";
  return house.serves_meals ? `${rooms}, with meals served on site.` : `${rooms}.`;
}

/** An amenity on the home page: a short label, and which icon draws it. */
export type Amenity = { key: string; label: string };

/**
 * The home page's amenities - short labels only, and always six, so the grid
 * is two full rows of three: Dining where a guest house serves meals,
 * Reception otherwise.
 *
 * The meeting room and exercise room were taken off on 30 Sep 2026: they are
 * shared facilities, not something each guest house or room has, and the
 * office asked the site to promise less.
 * TODO(site): from the guest house page on iitpkd.ac.in; the office to
 * confirm they hold for every guest house.
 */
export function amenities(houses: SiteGuestHouse[]): Amenity[] {
  return [
    { key: "ac", label: "Air-conditioned rooms" },
    { key: "bath", label: "Attached bathrooms" },
    { key: "wifi", label: "Wi-Fi" },
    { key: "tv", label: "Television" },
    { key: "fridge", label: "Refrigerator" },
    servingHouses(houses).length > 0
      ? { key: "dining", label: "Dining" }
      : { key: "reception", label: "Reception" },
  ];
}

// ----------------------------------------------------------------- guidelines

export type BookingStep = { title: string; body: string };

/**
 * How booking works, for the Guidelines page - in general terms on purpose:
 * who reviews a request depends on who raised it, and that is the portal's
 * business, not the public page's.
 */
export const BOOKING_STEPS: BookingStep[] = [
  { title: "Sign in", body: "With your institute account." },
  { title: "Request", body: "The dates of the stay, and each guest." },
  { title: "Approval", body: "You hear by email at each step." },
  { title: "Arrival", body: "Reception checks you in." },
  { title: "Departure", body: "The invoice is settled at reception." },
];

/**
 * One numbered section of the Guidelines page. `timetable` asks the page to
 * draw the meal times under the items; `provisional` marks a section whose
 * items are placeholders the office has not confirmed yet.
 */
export type GuidelineSection = {
  id: string;
  title: string;
  items: string[];
  timetable?: { meal: string; time: string }[];
  provisional?: boolean;
};

/**
 * The Guidelines page, section by section. The first six are the portal's own
 * rules in general terms, rendered from `lib/` and the office's Settings; the
 * last two are house rules the portal does not model.
 */
export function guidelineSections(houses: SiteGuestHouse[], rules: Rules = DEFAULT_RULES): GuidelineSection[] {
  const serving = servingHouses(houses);
  const invoice = rules.invoice;
  const maxNights = rules.booking.max_stay_nights;

  return [
    {
      id: "booking",
      title: "Booking a stay",
      items: [
        "Rooms are requested online by members of the institute, for themselves or for their guests",
        "Visitors from outside the institute are booked by the person hosting them",
        `Check-in must fall within ${plural(rules.booking.advance_booking_months, "month")} of the day the request is made`,
        ...(maxNights > 0 ? [`A single request may cover up to ${plural(maxNights, "night")}`] : []),
        "Every request is reviewed before it is confirmed, and you are told by email at each step",
        "Rooms are allotted by the Guest House Office once a request is approved",
      ],
    },
    {
      id: "rooms",
      title: "Rooms and occupancy",
      items: [
        ...roomTypesIn(houses).map((type) => capacityLine(type, rules)),
        roomOccupancyNotice(rules.capacity),
        `A room is full at ${describeRoomParties(rules.capacity)}`,
        `Children under ${INFANT_AGE_LIMIT} share a guardian's bed`,
        "An extra bed is charged as its own line on the invoice",
      ],
    },
    {
      id: "arrival",
      title: "Check-in and check-out",
      items: [
        "Arrival and departure times are chosen on the request, and the room is held for that period",
        rules.booking.buffer_minutes > 0
          ? `A room stays held for ${describeBuffer(rules.booking.buffer_minutes)} after the booked check-out, to be made ready`
          : "A room becomes free again at the booked check-out time",
        "Guests are checked in at reception on arrival",
        "Every adult guest carries a photo identity document",
        "To arrive earlier or stay longer, ask reception",
        // TODO(site): house practice, not modelled by the portal - confirm.
        "Room keys are collected from reception and returned there at check-out",
      ],
    },
    {
      id: "meals",
      title: "Meals",
      items:
        serving.length > 0
          ? [
              `Meals are served at ${joinNames(serving.map((h) => h.name))}, at the times below`,
              "Meals are chosen day by day on the request, with the number of vegetarian and non-vegetarian meals",
              MEAL_NOTICE_RULE,
              ...(rules.meals.max_diners_per_meal > 0
                ? [`The kitchen serves up to ${rules.meals.max_diners_per_meal} people at one meal`]
                : []),
            ]
          : ["Meals are not being served at the guest houses at present"],
      timetable: serving.length > 0 ? mealTimetable(rules) : undefined,
    },
    {
      // Phase 10: the bill, from the same rules `lib/invoice.ts` prices it by.
      id: "charges",
      title: "Charges and payment",
      items: [
        invoice.day_basis === "night"
          ? "Rooms are charged by the night, and never fewer than one"
          : `Rooms are charged in blocks of 24 hours from the actual check-in, with a permissible variation of ${plural(invoice.grace_hours, "hour")}`,
        invoice.prices_include_gst
          ? `The tariff includes GST - ${invoice.gst_room_percent}% on rooms and ${invoice.gst_meal_percent}% on meals, shown separately on the invoice`
          : `GST is added to the tariff on the invoice - ${invoice.gst_room_percent}% on rooms and ${invoice.gst_meal_percent}% on meals`,
        "An extra bed and meals served are charged in addition",
        "Damage or loss is recovered as an additional charge",
        // Cash came off the invoice on 7 Oct 2026: UPI or an account
        // transfer, each of which leaves a reference. A personal stay is
        // settled before the guest leaves; an official one is billed on.
        "The invoice is settled by UPI or account transfer - a personal stay at check-out, an official stay charged to the account named on the request",
      ],
    },
    {
      id: "cancellation",
      title: "Cancellation",
      items: [
        "A request can be cancelled from My Bookings at any time, with a reason",
        "The Guest House Office confirms the cancellation, and the rooms are released then",
        "Once a guest has checked in, the stay is ended at reception instead",
      ],
    },
    {
      id: "conduct",
      title: "During your stay",
      provisional: true,
      // TODO(site): house rules usual at institute guest houses, written as
      // placeholders - the office to confirm or replace them.
      items: [
        "Only the guests named on the booking may occupy the room",
        "Smoking, alcohol and intoxicants are not permitted anywhere on the premises",
        "Quiet hours are 10:00 PM to 6:00 AM",
        "Visitors are received in the lounge between 8:00 AM and 9:00 PM, and may not stay overnight",
        "Cooking, heaters, induction stoves and other high-load appliances are not permitted in the rooms",
        "Pets are not allowed",
        "Furniture, linen and fittings stay in the room they belong to; nothing is to be fixed to the walls",
        "Switch off lights, fans and air-conditioning when leaving the room",
        "The guest house is not responsible for belongings left in rooms",
        "Rooms are cleaned daily between 9:00 AM and 12:00 noon",
        "The Guest House Office may end a stay that breaks these rules",
      ],
    },
    {
      id: "safety",
      title: "Safety and help",
      provisional: true,
      // TODO(site): placeholders - the office to confirm.
      items: [
        "Note the fire exits and extinguishers on your floor when you arrive",
        "In an emergency, call reception; they will reach the medical centre and campus security",
        "Carry your booking confirmation and identity document when entering the campus",
        "Lost property is kept at reception for 30 days",
        "Report a fault in the room to reception",
      ],
    },
  ];
}
