import { mealDayCounts, MEAL_KEYS, MEAL_LABELS } from "./meals";
import { countBedGuests, countInfants, ROOM_TYPE_LABELS } from "./occupancy";
import { formatDateTime } from "./format";
import { describeDebit } from "./debit-heads";
import type { BookingWithDetails, MealKey, Role } from "./types";

/**
 * The institute's guest house tariff, and what a given stay costs under it.
 *
 * Transcribed from the office's TARIFF DETAILS sheet. Two guest houses charge
 * on different principles, which is why this is not one table:
 *
 * - **Bageshri** is a flat rate per room per day, whoever the guest is.
 * - **Hamsanandi** is per room per day too, but the rate depends on the
 *   *category of guest* — and the only distinction that moves the price is
 *   whether they are a government officer from outside the institute.
 *
 * The invoice is a **statement of what was used**, not a payment record: the
 * portal takes no money and knows nothing about what was actually settled.
 * That is why it prints "not a receipt".
 */

/** Bageshri: one room, one rate, everybody. */
export const BAGESHRI_DAY_RATE = 750;

/**
 * Hamsanandi, by the sheet's three categories.
 *
 * Types 1 and 2 are both ₹2,000, so the academic/personal distinction does
 * not change what is charged — it is kept only because the invoice should say
 * which basis was applied, and because the office may price them apart later.
 */
export const HAMSANANDI_DAY_RATES = {
  /** Type 1 — official visitors of the Office / HOD / Faculty. */
  academic: 2000,
  /** Type 2 — staff and faculty, staying personally. */
  personal: 2000,
  /** Type 3 — government officers other than the above. */
  government: 4000,
} as const;

export type TariffCategory = keyof typeof HAMSANANDI_DAY_RATES | "flat";

/** Dining at Hamsanandi, per head per sitting. */
export const MEAL_RATES: Record<MealKey, number> = {
  breakfast: 80,
  lunch: 120,
  dinner: 100,
};

/**
 * Extra non-vegetarian items at lunch carry a further charge — but the sheet
 * gives a *range*, "approximately ₹70–₹90 … depending on the prevailing
 * market rate". A range is not a price, so nothing is added to the total; the
 * invoice says it may be levied and the desk fills in the figure.
 */
export const NON_VEG_LUNCH_SURCHARGE = { min: 70, max: 90 };

/**
 * A charged day is 24 hours, with a permissible variation of ±4 hours.
 *
 * So a stay may run up to 28 hours before a second day is charged, and a
 * short stay is still one day. The sheet states this under Bageshri; it is
 * applied to both guest houses because "per day" has to mean something
 * definite at each, and there is no competing rule for Hamsanandi.
 */
export const CHARGED_DAY_HOURS = 24;
export const DAY_GRACE_HOURS = 4;

/**
 * Who eats free.
 *
 * "Applicable to all guests except Students and Alumni" — so a student's
 * family and an alumnus are fed without charge, and everyone else pays per
 * sitting.
 */
export function mealsAreChargeable(userRole: Role, bookingType: string): boolean {
  return userRole !== "student" && bookingType !== "alumni";
}

export const TARIFF = { currency: "INR", currencySymbol: "₹" } as const;

export function formatMoney(amount: number): string {
  return `${TARIFF.currencySymbol}${amount.toLocaleString("en-IN")}`;
}

/**
 * Days charged for a stay: 24-hour blocks, with the ±4 hour variation applied
 * before the next one starts. Never less than one — a guest who used a room
 * for an afternoon still used it for a day.
 */
export function chargedDays(checkIn: string, checkOut: string): number {
  const hours = (Date.parse(checkOut) - Date.parse(checkIn)) / 3_600_000;
  if (!Number.isFinite(hours) || hours <= 0) return 1;
  return Math.max(1, Math.ceil((hours - DAY_GRACE_HOURS) / CHARGED_DAY_HOURS));
}

export interface RoomTariff {
  rate: number;
  category: TariffCategory;
  /** How the basis reads on the invoice line. */
  label: string;
}

/**
 * The nightly room rate for this booking, or null when the guest house is not
 * on the tariff sheet.
 *
 * Hamsanandi's Type 3 is "government officers other than the above" — someone
 * from outside the institute, which in this portal is the `official` role
 * (the whitelisted dignitary and Director's Office accounts). Everyone else
 * staying there is institute staff or their guest, which is Types 1 and 2 at
 * the same ₹2,000. **That mapping is an inference from the sheet's wording,
 * not something the sheet states in portal terms** — it is the one line to
 * revisit if the office prices a case differently.
 */
export function roomTariffFor(booking: {
  guest_house?: { name?: string } | null;
  user_role: Role;
  booking_type: string;
}): RoomTariff | null {
  const house = booking.guest_house?.name ?? "";
  if (house === "Bageshri") {
    return { rate: BAGESHRI_DAY_RATE, category: "flat", label: "Bageshri room rate" };
  }
  if (house === "Hamsanandi") {
    if (booking.user_role === "official") {
      return {
        rate: HAMSANANDI_DAY_RATES.government,
        category: "government",
        label: "Hamsanandi — Type 3, government officer",
      };
    }
    if (booking.booking_type === "personal") {
      return {
        rate: HAMSANANDI_DAY_RATES.personal,
        category: "personal",
        label: "Hamsanandi — Type 2, personal (staff / faculty)",
      };
    }
    return {
      rate: HAMSANANDI_DAY_RATES.academic,
      category: "academic",
      label: "Hamsanandi — Type 1, academic visitor",
    };
  }
  return null;
}

export const TARIFF_NOTE =
  "Charged per room per day, a day being 24 hours with a permissible variation of ±4 hours. This statement lists what was used during the stay; it is not a receipt and records no payment.";

export interface InvoiceLine {
  description: string;
  quantity: number;
  unit: string;
  rate: number;
  amount: number;
}

export interface Invoice {
  reference: string;
  guestName: string;
  guestHouse: string;
  /** The tariff basis applied, in the sheet's own words. */
  category: string;
  /** The budget debited: personal funds, a project, a department. */
  paidFrom: string;
  checkIn: string;
  checkOut: string;
  /** Days charged, after the ±4 hour rule. */
  days: number;
  lines: InvoiceLine[];
  total: number;
  currency: string;
  /** The guest house is not on the tariff sheet — the desk must price it. */
  unpriced: string | null;
  /** Charges the sheet leaves open, which the desk adds by hand. */
  openCharges: string[];
  note: string;
}

/**
 * Build the invoice for a booking.
 *
 * Rooms are charged per allocated room per day. A meals-only booking has no
 * rooms, so it is dining alone.
 */
export function buildInvoice(booking: BookingWithDetails): Invoice {
  const lines: InvoiceLine[] = [];
  const openCharges: string[] = [];

  const house = booking.guest_house?.name ?? "";
  const tariff = roomTariffFor(booking);
  const days = chargedDays(booking.check_in, booking.check_out);

  for (const room of booking.assigned_rooms) {
    lines.push({
      // The room type is named because it is what the guest slept in, even
      // though the tariff is per room and does not depend on it.
      description: `Room ${room.room_number} (${ROOM_TYPE_LABELS[room.room_type]}) — ${tariff?.label ?? "rate not on the tariff sheet"}`,
      quantity: days,
      unit: days === 1 ? "day" : "days",
      rate: tariff?.rate ?? 0,
      amount: (tariff?.rate ?? 0) * days,
    });
  }

  // Dining is Hamsanandi's, and the sheet exempts students and alumni. An
  // infant sharing a guardian's plate is not a head, the same way they are
  // not a bed.
  const beds = countBedGuests(booking.guests);
  const heads =
    booking.service_type === "meals_only" ? (booking.meal_guest_count ?? 0) : beds;
  const charged = mealsAreChargeable(booking.user_role, booking.booking_type);
  const mealDays = mealDayCounts(booking.meals);
  const mealsTaken = MEAL_KEYS.filter((meal) => mealDays[meal] > 0);

  if (mealsTaken.length > 0 && heads > 0) {
    if (!charged) {
      openCharges.push(
        booking.user_role === "student"
          ? "Meals are not charged to students under the tariff sheet."
          : "Meals are not charged to alumni under the tariff sheet."
      );
    } else {
      for (const meal of mealsTaken) {
        const sittings = mealDays[meal];
        const rate = MEAL_RATES[meal];
        lines.push({
          description: `${MEAL_LABELS[meal]} — ${heads} guest${heads === 1 ? "" : "s"} x ${sittings} day${sittings === 1 ? "" : "s"}`,
          quantity: heads * sittings,
          unit: "servings",
          rate,
          amount: rate * heads * sittings,
        });
      }
      // A range is not a price, so it is flagged rather than totalled.
      if (booking.meal_preference === "non_veg" && mealDays.lunch > 0) {
        openCharges.push(
          `Additional non-vegetarian items at lunch may carry a further ${formatMoney(
            NON_VEG_LUNCH_SURCHARGE.min
          )}–${formatMoney(NON_VEG_LUNCH_SURCHARGE.max)} per head, at the prevailing market rate — add it by hand if it applies.`
        );
      }
    }
  }

  const unpriced = booking.assigned_rooms.length > 0 && tariff === null ? house : null;
  if (unpriced) {
    openCharges.push(
      `${unpriced} is not on the tariff sheet — the room lines above show zero and must be priced by hand.`
    );
  }

  const infants = countInfants(booking.guests);
  if (infants > 0) {
    openCharges.push(
      `${infants} infant${infants === 1 ? "" : "s"} shared a guardian's bed and ${infants === 1 ? "is" : "are"} not charged.`
    );
  }

  return {
    reference: booking.booking_reference_id,
    guestName: booking.on_behalf_of_name ?? booking.requester?.full_name ?? "Guest",
    guestHouse: house,
    category: tariff?.label ?? "Not on the tariff sheet",
    paidFrom: describeDebit(booking),
    checkIn: formatDateTime(booking.check_in),
    checkOut: formatDateTime(booking.check_out),
    days,
    lines,
    total: lines.reduce((sum, l) => sum + l.amount, 0),
    currency: TARIFF.currency,
    unpriced,
    openCharges,
    note: TARIFF_NOTE,
  };
}
