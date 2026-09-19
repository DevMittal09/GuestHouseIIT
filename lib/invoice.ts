import { describeMeals, mealDayCounts, MEAL_KEYS, MEAL_LABELS } from "./meals";
import { countBedGuests, countInfants, ROOM_TYPE_LABELS } from "./occupancy";
import { stayNights } from "./policy";
import { formatDateTime } from "./format";
import type { BookingType, BookingWithDetails, MealKey } from "./types";

/**
 * What a stay costs, worked out from the booking.
 *
 * The room rate depends on the **guest house** and on **why the stay was
 * booked** — and not on the room type. That is the institute's schedule, not
 * a modelling choice: Hamsanandi costs more than Bageshri, and an official
 * visitor costs more than a personal guest, whatever room they are put in.
 *
 * The invoice is a **statement of what was used**, not a payment record: the
 * portal takes no money and knows nothing about what was actually settled.
 * That is why it prints "not a receipt".
 */

/**
 * Room tariff, per room per night, by guest house and then by booking type.
 *
 * Keyed by **name** because guest houses are created and renamed from the
 * console and have no stable id — the same reason `ALUMNI_GUEST_HOUSE_NAME`
 * is. A guest house with no entry here has no tariff, and the invoice says so
 * rather than quietly charging nothing.
 */
export const ROOM_TARIFF: Record<string, Partial<Record<BookingType, number>>> = {
  Bageshri: { personal: 750, official: 3000 },
  Hamsanandi: { personal: 1500, official: 4000 },
};

/**
 * Rates the institute has not supplied yet, kept apart from the ones it has
 * so that nobody mistakes an estimate for the schedule. Any invoice using one
 * says so, on screen and in the PDF.
 */
export const PROVISIONAL_RATES = {
  /** Per person, per sitting. */
  mealPerHead: { breakfast: 80, lunch: 150, dinner: 150 } as Record<MealKey, number>,
  /** Per extra bed, per night. */
  extraBedPerNight: 300,
};

export const TARIFF = {
  currency: "INR",
  currencySymbol: "₹",
} as const;

/**
 * The nightly room rate for this booking, or null when the guest house has no
 * tariff on record.
 *
 * A stay booked **on behalf of an alumnus** is charged as a personal guest: an
 * alumnus visiting campus is not institute business, whoever raised the
 * request for them. Stated here rather than left for the reader to infer.
 */
export function roomRateFor(guestHouseName: string, bookingType: BookingType): number | null {
  const house = ROOM_TARIFF[guestHouseName];
  if (!house) return null;
  return house[chargeCategory(bookingType)] ?? null;
}

function chargeCategory(bookingType: BookingType): Exclude<BookingType, "alumni"> {
  return bookingType === "alumni" ? "personal" : bookingType;
}

/** How the rate is described on the invoice line. */
export function rateBasis(guestHouseName: string, bookingType: BookingType): string {
  const category = chargeCategory(bookingType);
  return `${guestHouseName} ${category === "official" ? "official" : "personal guest"} rate`;
}

export const TARIFF_NOTE =
  "Room rates are the guest house's standard tariff for this category of booking. This statement lists what was used during the stay; it is not a receipt and records no payment.";

export const PROVISIONAL_NOTE =
  "Meal and extra-bed rates are provisional, pending the institute's schedule — confirm them before settling.";

export interface InvoiceLine {
  description: string;
  /** Nights, head-meals, or bed-nights — whatever the rate is per. */
  quantity: number;
  unit: string;
  rate: number;
  amount: number;
}

export interface Invoice {
  reference: string;
  guestName: string;
  guestHouse: string;
  /** "Official" or "Personal guest" — what decided the room rate. */
  category: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  lines: InvoiceLine[];
  total: number;
  currency: string;
  /** True when any line is priced from a guess rather than the schedule. */
  provisional: boolean;
  /** The guest house with no tariff on record, or null when all is priced. */
  unpriced: string | null;
  note: string;
}

export function formatMoney(amount: number): string {
  return `${TARIFF.currencySymbol}${amount.toLocaleString("en-IN")}`;
}

/**
 * Build the invoice for a booking.
 *
 * Rooms are charged per room per night at the guest house's rate for this
 * category. A meals-only booking has no rooms and no nights, so it is meals
 * alone.
 */
export function buildInvoice(booking: BookingWithDetails): Invoice {
  const nights = Math.max(
    booking.service_type === "meals_only" ? 0 : 1,
    stayNights(new Date(booking.check_in), new Date(booking.check_out))
  );
  const lines: InvoiceLine[] = [];

  const house = booking.guest_house?.name ?? "";
  const rate = roomRateFor(house, booking.booking_type);
  const basis = rateBasis(house, booking.booking_type);

  for (const room of booking.assigned_rooms) {
    lines.push({
      // The room type is still named: it is what the guest slept in, even
      // though it does not change the price.
      description: `Room ${room.room_number} (${ROOM_TYPE_LABELS[room.room_type]}) — ${basis}`,
      quantity: nights,
      unit: nights === 1 ? "night" : "nights",
      rate: rate ?? 0,
      amount: (rate ?? 0) * nights,
    });
  }

  // Extra beds are charged where the party exceeds what the allocated rooms
  // sleep on their own beds. Infants share a guardian's bed and are never
  // counted — the same rule the booking form applies.
  const beds = countBedGuests(booking.guests);
  const standard = booking.assigned_rooms.reduce(
    (n, r) => n + (r.room_type === "single" ? 1 : 2),
    0
  );
  const extraBeds = Math.max(0, beds - standard);
  if (extraBeds > 0 && booking.assigned_rooms.length > 0) {
    lines.push({
      description: "Extra bed (provisional rate)",
      quantity: extraBeds * nights,
      unit: "bed-nights",
      rate: PROVISIONAL_RATES.extraBedPerNight,
      amount: PROVISIONAL_RATES.extraBedPerNight * extraBeds * nights,
    });
  }

  // Meals are per head per sitting. A meals-only booking carries its own head
  // count; everything else feeds the guests who needed a bed.
  const heads =
    booking.service_type === "meals_only" ? (booking.meal_guest_count ?? 0) : beds;
  const mealDays = mealDayCounts(booking.meals);
  for (const meal of MEAL_KEYS) {
    const days = mealDays[meal];
    if (days === 0 || heads === 0) continue;
    const mealRate = PROVISIONAL_RATES.mealPerHead[meal];
    lines.push({
      description: `${MEAL_LABELS[meal]} — ${heads} guest${heads === 1 ? "" : "s"} x ${days} day${days === 1 ? "" : "s"} (provisional rate)`,
      quantity: heads * days,
      unit: "meals",
      rate: mealRate,
      amount: mealRate * heads * days,
    });
  }

  const unpriced = booking.assigned_rooms.length > 0 && rate === null ? house : null;
  const provisional = lines.some((l) => l.description.includes("provisional"));
  const infants = countInfants(booking.guests);

  return {
    reference: booking.booking_reference_id,
    guestName: booking.on_behalf_of_name ?? booking.requester?.full_name ?? "Guest",
    guestHouse: house,
    category: chargeCategory(booking.booking_type) === "official" ? "Official" : "Personal guest",
    checkIn: formatDateTime(booking.check_in),
    checkOut: formatDateTime(booking.check_out),
    nights,
    lines,
    total: lines.reduce((sum, l) => sum + l.amount, 0),
    currency: TARIFF.currency,
    provisional,
    unpriced,
    note: [
      TARIFF_NOTE,
      unpriced
        ? `No room tariff is on record for ${unpriced || "this guest house"} — the room lines above show zero and must be priced by hand.`
        : "",
      provisional ? PROVISIONAL_NOTE : "",
      infants > 0
        ? `${infants} infant${infants === 1 ? "" : "s"} shared a guardian's bed and ${infants === 1 ? "is" : "are"} not charged.`
        : "",
      booking.meals.length > 0 ? `Meals taken: ${describeMeals(booking.meals)}.` : "",
    ]
      .filter(Boolean)
      .join(" "),
  };
}
