import { guestHousesForBookingType, mealsAllowedFor } from "./policy";
import { tariffPreviewLines, type Tariff, type TariffPreview, type TariffPreviewLine } from "./tariffs";
import { BOOKING_TYPE_LABELS, type BookingType, type GuestHouse, type Role, type RoomType, type ServiceType } from "./types";

/**
 * **The tariff categories a requester may choose from, and what each costs**
 * (17 Oct 2026, the owner: keep the categories and their rates on the
 * right-hand side of the booking page, and let the requester select the one
 * that applies).
 *
 * ## What a "category" is here
 *
 * A tariff row (`lib/tariffs.ts`, migration 19) is not a category anybody
 * picks: it is a rate scoped by guest house, room type, booking type and
 * requester role, and `resolveTariff` takes the most specific row in force on
 * the night being charged. That is the authoritative source of a price and
 * nothing here second-guesses it.
 *
 * So a **category is the combination the requester actually decides** - the
 * guest house and the kind of booking - presented with the rate those two
 * resolve to. Selecting one writes `guest_house_id` and `booking_type`, the
 * fields the rest of the form, `createBooking` and the invoice already read.
 * The selection is therefore real: it changes what will be charged, and it
 * cannot drift from the invoice, because both ask `resolveTariff` the same
 * question.
 *
 * **What this deliberately is not.** A named category stored on the booking
 * ("parents", "government officer") would be a second source of truth for
 * pricing unless `tariffs` carried the same column - a migration on both
 * tables and a new dimension in `resolveTariff`. The office's own sheet
 * already expresses those categories as scope (its ₹4,000 Hamsanandi row is
 * `requester_role: official`), so they appear here as the rate a requester's
 * own role resolves to. See `.memories/02-decisions.md`.
 *
 * ## Eligibility
 *
 * Only combinations the requester may really book: `bookingTypesFor` decides
 * the kinds, `guestHousesForBookingType` narrows the houses (a student's and
 * an alumnus's stay are Bageshri's), the Form Builder's
 * `allowed_guest_house_ids` has already been applied to the list handed in,
 * and a dining booking is offered only kitchens and only where
 * `mealsAllowedFor` permits meals at all. Nobody is shown a rate they cannot
 * be charged.
 */

export type TariffCategory = {
  /** Stable within one form: what the radio's value is. */
  key: string;
  guest_house_id: string;
  guest_house_name: string;
  booking_type: BookingType;
  /** "Hamsanandi", or "Hamsanandi - Official booking" where the kind is a choice. */
  label: string;
  /** Every charge this category resolves to, as the invoice would price it today. */
  lines: TariffPreviewLine[];
  /**
   * The figure to set beside the label: the room rate for a stay. Null on a
   * dining booking, which has no one headline charge - its three meal rates
   * are the lines.
   */
  headline: TariffPreviewLine | null;
};

/**
 * The kind of booking, as a category's label says it. "Official booking" and
 * "Personal booking" read as categories; the alumni label is already a
 * phrase ("On behalf of an alumnus") and takes no noun after it.
 */
function describeKind(bookingType: BookingType): string {
  return bookingType === "alumni"
    ? BOOKING_TYPE_LABELS.alumni
    : `${BOOKING_TYPE_LABELS[bookingType]} booking`;
}

export function tariffCategoryKey(guestHouseId: string, bookingType: BookingType): string {
  return `${guestHouseId}:${bookingType}`;
}

/** The category a form in this state is on, or null before a guest house is chosen. */
export function selectedCategory(
  categories: TariffCategory[],
  guestHouseId: string,
  bookingType: BookingType
): TariffCategory | null {
  return (
    categories.find((c) => c.guest_house_id === guestHouseId && c.booking_type === bookingType) ??
    null
  );
}

/**
 * The eligible (guest house, booking type) pairs, with their rates.
 *
 * `previews` is what the server already resolved for the page
 * (`tariffPreviews`); a pair with no preview is priced here from `tariffs`
 * when they were handed in, and otherwise left with no lines - which the
 * panel reports as "no rates published", exactly as the table always has.
 */
export function tariffCategories(options: {
  guestHouses: GuestHouse[];
  bookingTypes: BookingType[];
  role: Role;
  /** Resolved on the server, one per guest house and booking type. */
  previews: TariffPreview[];
  /** What is being booked: a dining booking is quoted meals and nothing else. */
  service?: ServiceType;
  /** The desk may book outside the guest house and meals policies. */
  allowAnyGuestHouse?: boolean;
  /** Both guest houses are double sharing; only rooms and extra beds use it. */
  roomType?: RoomType;
}): TariffCategory[] {
  const {
    guestHouses,
    bookingTypes,
    role,
    previews,
    service = "room",
    allowAnyGuestHouse = false,
  } = options;
  const mealsOnly = service === "meals_only";
  const nameTheKind = bookingTypes.length > 1;

  return bookingTypes.flatMap((bookingType) => {
    // A dining booking a policy forbids is not a category at all.
    if (mealsOnly && !allowAnyGuestHouse && !mealsAllowedFor(bookingType, role)) return [];
    const houses = (
      allowAnyGuestHouse ? guestHouses : guestHousesForBookingType(guestHouses, bookingType, role)
    ).filter((house) => !mealsOnly || house.serves_meals);
    return houses.map((house) => {
      const preview = previews.find(
        (p) => p.guest_house_id === house.id && p.booking_type === bookingType
      );
      const lines = preview?.lines ?? [];
      return {
        key: tariffCategoryKey(house.id, bookingType),
        guest_house_id: house.id,
        guest_house_name: house.name,
        booking_type: bookingType,
        label: nameTheKind ? `${house.name} - ${describeKind(bookingType)}` : house.name,
        lines,
        headline: lines.find((l) => l.item === "room") ?? null,
      };
    });
  });
}

/**
 * The same thing from the rate sheet rather than from pre-resolved previews -
 * for a caller that holds `tariffs` and no previews (a test, a report). The
 * resolution is `tariffPreviewLines`, the invoice's own.
 */
export function tariffCategoriesFrom(
  tariffs: Tariff[],
  options: Omit<Parameters<typeof tariffCategories>[0], "previews"> & { date: string }
): TariffCategory[] {
  const { guestHouses, bookingTypes, role, service = "room", roomType = "double_sharing", date } =
    options;
  const previews: TariffPreview[] = guestHouses.flatMap((house) =>
    bookingTypes.map((bookingType) => ({
      guest_house_id: house.id,
      booking_type: bookingType,
      lines: tariffPreviewLines(tariffs, {
        guestHouseId: house.id,
        bookingType,
        role,
        roomType,
        servesMeals: house.serves_meals,
        date,
        service,
      }),
    }))
  );
  return tariffCategories({ ...options, previews });
}
