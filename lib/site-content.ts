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
 * **`houseSummary` is gone** (27 Oct 2026). It wrote one line about a guest
 * house for its card on the home page - "Double-sharing rooms, with meals
 * served on site." - and the owner asked for the cards to carry the name and
 * the booking doors and nothing else: "Do not include descriptions such as
 * 'Double-sharing rooms, with meals served on site.'" Nothing else called it,
 * so it went rather than sitting here with a test pinning wording no page
 * prints. What a guest house offers is still said where a reader is deciding:
 * the Guidelines' room capacities and meal section, both computed from the
 * same store and Settings.
 */

/**
 * The opening statement on the home page, under the hero (28 Oct 2026).
 *
 * The owner asked for a landing page that is not "very basic", after the
 * Taramani Guest House site again. A page that goes straight from a
 * photograph to six icons has nothing to read, so this is the sentence it was
 * missing - and it is **computed, not written**: the guest houses are named
 * from the store, and the second line mentions meals only where some guest
 * house has a kitchen, exactly as `amenities()` decides whether Dining is one
 * of them.
 *
 * It keeps every content rule of 26-30 Sep 2026: no figures, no requester
 * categories, no approval chain, no role name, and nothing about the rooms
 * that the office has not confirmed. What is left is where the guest houses
 * are and what this portal is for.
 */
export function homeIntro(houses: SiteGuestHouse[]): { title: string; body: string[] } {
  const names = houses.map((h) => h.name);
  return {
    title: "Staying on campus",
    body: [
      names.length === 0
        ? "The institute's guest houses stand on the campus at Palakkad."
        : names.length === 1
          ? `${names[0]} is the institute's guest house on the campus at Palakkad.`
          : `${joinNames(names)} are the institute's guest houses on the campus at Palakkad.`,
      servingHouses(houses).length > 0
        ? "Rooms are requested through this portal, and meals where the guest house has a kitchen."
        : "Rooms are requested through this portal.",
    ],
  };
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
  /**
   * The section's items split under their own headings - **Dos** and
   * **Don'ts** (9 Nov 2026, the meeting: "general guest house rules and Dos
   * and Don'ts should be hardcoded into the website interface so that users
   * can see them without needing to open an external document").
   *
   * A section with groups renders them in place of `items`, which stays the
   * flat list of the same rules in the same order - so the numbering a guest
   * or an office cites ("see 7.4") is unchanged by the grouping, and anything
   * that reads a section's rules without drawing them (the unit test that
   * keeps role names off the public site) needs no special case.
   */
  groups?: { label: string; items: string[] }[];
  timetable?: { meal: string; time: string }[];
  provisional?: boolean;
};

/**
 * The house rules, as two lists.
 *
 * Grouped rather than rewritten: these are the same placeholder rules that
 * have stood in section 7 since 26 Sep 2026, still **awaiting the office's
 * confirmation** (`provisional`), now under the headings the meeting asked
 * for. Nothing was added and nothing was taken away - inventing a house rule
 * because a heading looked thin would put words in the office's mouth.
 *
 * A **do** is phrased as something to do; a **don't** as something not
 * permitted. Each rule sits under whichever of those it already was.
 */
const CONDUCT_DOS = [
  "Only the guests named on the booking may occupy the room",
  "Visitors are received in the lounge between 8:00 AM and 9:00 PM, and may not stay overnight",
  "Switch off lights, fans and air-conditioning when leaving the room",
  "Report a fault in the room to reception",
  "Note the fire exits and extinguishers on your floor when you arrive",
  "Carry your booking confirmation and identity document when entering the campus",
];

const CONDUCT_DONTS = [
  "Smoking, alcohol and intoxicants are not permitted anywhere on the premises",
  "Cooking, heaters, induction stoves and other high-load appliances are not permitted in the rooms",
  "Pets are not allowed",
  "Furniture, linen and fittings stay in the room they belong to; nothing is to be fixed to the walls",
  "Quiet hours are 10:00 PM to 6:00 AM",
];

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
        ...(maxNights > 0 ? [`A personal stay may cover up to ${plural(maxNights, "night")}`] : []),
        "Official stays have no maximum duration",
        "MS and PhD research scholars may book for a spouse without an accompanying parent",
        "B.Tech and M.Tech students cannot book for a spouse",
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
      // The notice period (9 Nov 2026, the meeting). Stated here because this
      // is one of a rule's three homes; the other two are the error when it
      // fires, with the reader's own figure in it
      // (`cancellationNoticeError`), and the Cancel control itself.
      items: [
        ...(rules.booking.cancellation_notice_hours > 0
          ? [
              `A booking is cancelled from My Bookings, with a reason, at least ${plural(rules.booking.cancellation_notice_hours, "hour")} before check-in`,
              "Closer to the check-in than that, ask the Guest House Office",
            ]
          : ["A request can be cancelled from My Bookings at any time, with a reason"]),
        "Cancellations are made through the portal, so the room is released and the record is kept",
        "The Guest House Office confirms the cancellation, and the rooms are released then",
        "Once a guest has checked in, the stay is ended at reception instead",
      ],
    },
    {
      id: "conduct",
      title: "Dos and Don'ts during your stay",
      provisional: true,
      // TODO(site): house rules usual at institute guest houses, written as
      // placeholders - the office to confirm or replace them. Grouped into
      // Dos and Don'ts on 9 Nov 2026 at the meeting's request; the wording is
      // unchanged, and the flat `items` below keeps the numbering stable.
      groups: [
        { label: "Please do", items: CONDUCT_DOS },
        { label: "Please do not", items: CONDUCT_DONTS },
        {
          label: "Good to know",
          items: [
            "The guest house is not responsible for belongings left in rooms",
            "Rooms are cleaned daily between 9:00 AM and 12:00 noon",
            "Lost property is kept at reception for 30 days",
            "The Guest House Office may end a stay that breaks these rules",
          ],
        },
      ],
      items: [
        ...CONDUCT_DOS,
        ...CONDUCT_DONTS,
        "The guest house is not responsible for belongings left in rooms",
        "Rooms are cleaned daily between 9:00 AM and 12:00 noon",
        "Lost property is kept at reception for 30 days",
        "The Guest House Office may end a stay that breaks these rules",
      ],
    },
    {
      id: "safety",
      title: "Safety and help",
      provisional: true,
      // TODO(site): placeholders - the office to confirm.
      // Three of the five moved into "Dos and Don'ts" on 9 Nov 2026, where a
      // reader looking for what to do will find them. What is left is what
      // this section is actually for: who to call, and what the guest house
      // will do.
      items: [
        "In an emergency, call reception; they will reach the medical centre and campus security",
        "Reception can reach the institute's medical centre and campus security at any hour",
      ],
    },
  ];
}
