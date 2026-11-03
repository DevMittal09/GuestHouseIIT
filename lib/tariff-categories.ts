import { guestHousesForBookingType, mealsAllowedFor } from "./policy";
import {
  describeTariffCategory,
  parseTariffScope,
  tariffCategoryItems,
  tariffPreviewLines,
  tariffScopeKey,
  type Tariff,
  type TariffPreview,
  type TariffPreviewLine,
  type TariffScope,
} from "./tariffs";
import {
  BOOKING_TYPE_LABELS,
  type BookingType,
  type GuestHouse,
  type Role,
  type RoomType,
  type ServiceType,
} from "./types";

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

// ------------------------------------------- the desk's categories (31 Oct 2026)

/**
 * **The categories the Guest House Manager picks from, and what each costs**
 * (31 Oct 2026, the owner: the requester only reads the tariff table, and
 * "the final authority for determining the applicable tariff category must
 * rest with the GHM", whose choice prices the invoice).
 *
 * ## Why these are not the requester's categories above
 *
 * A requester's category is one (guest house, booking type) pair, because
 * those are the two things *they* answer. The manager's is one
 * **`TariffScope`** - (booking type, requester role) - because the guest
 * house is settled by then (the rooms are in it) and what is left to decide
 * is which published rate the visit falls under. The office's own sheet is
 * written that way: "Hamsanandi types 1 and 2" at one rate and "Hamsanandi
 * type 3, government officers" at another, the second being a row scoped by
 * `requester_role`. Until this round nobody could pick it - it was only ever
 * what an office's own account happened to resolve to.
 *
 * ## The list is the rate sheet, not a list beside it
 *
 * The categories are **enumerated from `tariffs`**: every row that could
 * price this booking's defining charge contributes the scope that selects it.
 * So the office publishes a new rate "for visiting faculty" and it is on the
 * desk's list that afternoon, with no code, no migration and no second table
 * of category names to keep in step. A scope that prices identically to one
 * already listed is dropped - two scopes resolving to one row are one
 * category to the eye.
 *
 * The **defining charge** is the room for a stay and the meals for a dining
 * booking: the thing the category is about. Were every item's rows
 * enumerated, a faculty stay at Hamsanandi would offer "meals free to
 * students" as a category, because that row exists and is scoped by a role.
 *
 * Nothing here is filtered by eligibility, unlike the requester's list: the
 * manager may already book outside the guest house and meals policies, and
 * this is a question about money rather than about who may stay.
 */
export type DeskTariffCategory = {
  /** `tariffScopeKey(scope)` - what the radio's value is, and what is stored. */
  key: string;
  scope: TariffScope;
  /** The office's own words for it: the note on the row that prices it. */
  label: string;
  /** The scope in plain words, for where the note does not say it. */
  scope_label: string;
  /** Every charge this category resolves to, as the invoice would price it today. */
  lines: TariffPreviewLine[];
  /** The room rate, which is the figure beside the label. Null on a dining booking. */
  headline: TariffPreviewLine | null;
  /**
   * The scope the booking's own facts resolve to - what it would be priced at
   * if nobody chose. Offered first, and marked, because it is the answer in
   * most cases and the one a reviewer can check against the request.
   */
  requesters: boolean;
};

/**
 * The charge a category is **about**: the room on a stay, the meals on a
 * dining booking. A guest house with no kitchen has no dining charge at all,
 * so a dining booking there has no categories - and no invoice section for
 * them either (`invoicePrintsDining`).
 */
/** Sums what is published, so the list reads as a price list. Null-only last. */
function rateTotal(lines: TariffPreviewLine[]): number {
  const known = lines.filter((l) => l.rate !== null);
  return known.length === 0
    ? Number.POSITIVE_INFINITY
    : known.reduce((sum, l) => sum + (l.rate ?? 0), 0);
}

export function deskTariffCategories(
  tariffs: Tariff[],
  options: {
    guestHouse: { id: string; serves_meals: boolean };
    /** The booking's own facts: one of the categories, and the default. */
    booking: { booking_type: BookingType; user_role: Role };
    /** What is being booked: a dining booking's categories are its meal rates. */
    service?: ServiceType;
    /** Both guest houses are double sharing; only the room rate reads it. */
    roomType?: RoomType;
    /** Institute calendar date the rates are quoted for - today, at the desk. */
    date: string;
  }
): DeskTariffCategory[] {
  const { guestHouse, booking, service = "room", roomType = "double_sharing", date } = options;
  const own: TariffScope = {
    booking_type: booking.booking_type,
    requester_role: booking.user_role,
  };
  const items = tariffCategoryItems(service, guestHouse.serves_meals);
  if (items.length === 0) return [];

  // The booking's own scope first, then one per rate row that could price it.
  // A row leaves a dimension blank to mean "any", so the scope that selects
  // it keeps the booking's own answer there.
  const scopes: TariffScope[] = [own];
  for (const row of tariffs) {
    if (!items.includes(row.item)) continue;
    if (row.guest_house_id !== null && row.guest_house_id !== guestHouse.id) continue;
    const scope: TariffScope = {
      booking_type: row.booking_type ?? own.booking_type,
      requester_role: row.requester_role ?? own.requester_role,
    };
    const key = tariffScopeKey(scope);
    if (!scopes.some((s) => tariffScopeKey(s) === key)) scopes.push(scope);
  }

  const seen = new Set<string>();
  const categories: DeskTariffCategory[] = [];
  for (const scope of scopes) {
    const lines = tariffPreviewLines(tariffs, {
      guestHouseId: guestHouse.id,
      bookingType: scope.booking_type,
      role: scope.requester_role,
      roomType,
      servesMeals: guestHouse.serves_meals,
      date,
      service,
    });
    // Two scopes that resolve to the same figures are one category: the sheet
    // does not distinguish them, so neither should the screen.
    const signature = lines.map((l) => `${l.item}=${l.rate ?? "-"}`).join("|");
    if (seen.has(signature)) continue;
    seen.add(signature);
    const { label, scope_label } = describeTariffCategory(tariffs, {
      guestHouseId: guestHouse.id,
      scope,
      service,
      servesMeals: guestHouse.serves_meals,
      roomType,
      date,
    });
    categories.push({
      key: tariffScopeKey(scope),
      scope,
      label,
      scope_label,
      lines,
      headline: lines.find((l) => l.item === "room") ?? null,
      requesters: tariffScopeKey(scope) === tariffScopeKey(own),
    });
  }

  return categories.sort((a, b) => {
    if (a.requesters !== b.requesters) return a.requesters ? -1 : 1;
    const byRate = rateTotal(a.lines) - rateTotal(b.lines);
    return byRate !== 0 ? byRate : a.label.localeCompare(b.label);
  });
}

/** The desk's category a key names, or null when the key is not on the list. */
export function deskCategoryFor(
  categories: DeskTariffCategory[],
  key: string | null | undefined
): DeskTariffCategory | null {
  const scope = parseTariffScope(key);
  return scope ? (categories.find((c) => c.key === tariffScopeKey(scope)) ?? null) : null;
}
