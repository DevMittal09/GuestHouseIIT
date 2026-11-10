/**
 * **The office's named tariff categories, and the fact that the Guest House
 * Manager picks one** (9 Nov 2026, the meeting).
 *
 * The office prices a stay by the kind of guest, not by the kind of account
 * that raised the request:
 *
 * | Category | Guest | Hamsanandi | Bageshri |
 * | --- | --- | ---: | ---: |
 * | I | Guests and relatives of employees, parents of students on a personal visit | 1,500 | 1,000 |
 * | II | Institute guests on official duty - ministers, directors, BOG, selection committees, external examiners, official guests | 2,000 | 1,500 |
 * | III | Academic visitors | 2,500 | 2,000 |
 *
 * Until this round the category was **derived**: a `tariffs` row scoped by
 * guest house, booking type and requester role, so "Category II" was really
 * "an `official` booking at Hamsanandi" and the requester chose it by
 * choosing those two fields (17 Oct 2026, `lib/tariff-categories.ts`). The
 * meeting withdrew that: *"Users must not be allowed to select their tariff
 * category"*, and *"the tariff category must be decided exclusively by the
 * GHM during the approval and room allocation process"* - because only the
 * desk knows whether the person arriving is an external examiner or a
 * parent, and the account they were invited through does not say.
 *
 * So a category is now **a name stored on the booking** and **a column on the
 * rate sheet**, and the two meet in `resolveTariff`:
 *
 * - `bookings.tariff_category` is written by the manager at allocation, and
 *   by nobody else. It is null until then, which is exactly the state "not
 *   yet priced".
 * - `tariffs.tariff_category` scopes a rate to one category, and outranks
 *   every other qualifier in `resolveTariff` - a named category is the most
 *   specific thing anybody can say about a price.
 *
 * That was the objection to a stored category when it was first considered
 * and rejected (`.memories/03-roadmap.md` §2j): a name on the booking with
 * no matching column on `tariffs` would be a **second source of truth for
 * money**. It is not one now, because the rate sheet carries the same name
 * and the invoice resolves through it.
 *
 * **A booking with no category is priced exactly as it was before**, from the
 * guest house, booking type and role. That is what keeps every stay booked
 * before today - and every dining booking, which has no room and so no
 * category - printable.
 */

import type { Tariff } from "./tariffs";
import { resolveTariff } from "./tariffs";
import {
  TARIFF_CATEGORIES,
  type BookingType,
  type GuestHouse,
  type TariffCategoryName,
} from "./types";

export { TARIFF_CATEGORIES };
export type { TariffCategoryName };

export const TARIFF_CATEGORY_LABELS: Record<TariffCategoryName, string> = {
  I: "Category I",
  II: "Category II",
  III: "Category III",
};

/** The office's own description of who each category is for, kept verbatim. */
export const TARIFF_CATEGORY_GUESTS: Record<TariffCategoryName, string> = {
  I: "Guests and relatives of employees / parents of students on a personal visit",
  II: "Institute guests on official duty (Ministers, Directors, BOG, Selection Committee, External Examiners and Official Guests)",
  III: "Academic Visitors",
};

export function isTariffCategory(value: unknown): value is TariffCategoryName {
  return typeof value === "string" && (TARIFF_CATEGORIES as readonly string[]).includes(value);
}

/** The category a stored value names, or null for anything else. */
export function tariffCategoryOf(value: string | null | undefined): TariffCategoryName | null {
  return isTariffCategory(value) ? value : null;
}

export function describeTariffCategory(category: TariffCategoryName): string {
  return `${TARIFF_CATEGORY_LABELS[category]} - ${TARIFF_CATEGORY_GUESTS[category]}`;
}

/**
 * **Which categories can apply to this kind of booking** (10 Nov 2026, the
 * owner: "category we dont need to show all categories for personal bookings
 * and all").
 *
 * Read straight off the office's own descriptions, which already say who each
 * category is for:
 *
 * | Category | The office's words | So |
 * | --- | --- | --- |
 * | I | "parents of students **on a personal visit**" | personal |
 * | II | "institute guests **on official duty**" | official |
 * | III | "academic visitors" | official |
 *
 * So a personal stay has exactly one rate and the panel states it rather than
 * listing three, two of which could never be charged; an official one is a
 * real choice between II and III, which is the decision the manager is
 * actually making.
 *
 * **An alumni booking keeps all three.** The office's sheet says nothing
 * about alumni - they are neither an employee's relative, nor on official
 * duty, nor an academic visitor - and withholding a category the desk turns
 * out to need would leave a stay that cannot be invoiced at all. Narrowing it
 * is a question for the office (`.memories/03-roadmap.md`), and until they
 * answer, showing one more row costs nothing while hiding the right one costs
 * an invoice.
 */
export function tariffCategoriesFor(
  bookingType: BookingType
): readonly TariffCategoryName[] {
  if (bookingType === "personal") return ["I"];
  if (bookingType === "official") return ["II", "III"];
  return TARIFF_CATEGORIES;
}

// ------------------------------------------------------------ the rate sheet

export type TariffSheetRow = {
  category: TariffCategoryName;
  guests: string;
  /** The room rate per guest house id, null where the office has published none. */
  rateByGuestHouse: Record<string, number | null>;
};

/**
 * The tariff table the booking page prints beside the form (requirement 5.2),
 * **read from the rate sheet rather than written into the page**: the office
 * raises a rate from the console and the panel follows, which is the whole
 * reason the rates are rows.
 *
 * One row per category, one column per guest house, priced as of `date`.
 * The resolution is `resolveTariff`'s - the invoice's own - so a figure shown
 * here is the figure that will be charged.
 */
export function tariffCategorySheet(
  tariffs: Tariff[],
  guestHouses: Pick<GuestHouse, "id" | "name">[],
  date: string,
  /**
   * Narrow the sheet to the categories this kind of booking can be charged at
   * (10 Nov 2026). Omitted gives the whole published sheet, which is what the
   * Guidelines and a report want.
   */
  bookingType?: BookingType
): TariffSheetRow[] {
  const shown = bookingType ? tariffCategoriesFor(bookingType) : TARIFF_CATEGORIES;
  return shown.map((category) => ({
    category,
    guests: TARIFF_CATEGORY_GUESTS[category],
    rateByGuestHouse: Object.fromEntries(
      guestHouses.map((house) => [
        house.id,
        resolveTariff(tariffs, {
          guest_house_id: house.id,
          item: "room",
          room_type: "double_sharing",
          // A category outranks these, so what they are set to cannot change
          // the answer for a row that names one. They are here because the
          // query shape requires them.
          booking_type: "official",
          requester_role: "employee",
          tariff_category: category,
          date,
        })?.rate ?? null,
      ])
    ),
  }));
}

/**
 * Why this category may not be set on this booking, or null when it may.
 *
 * A dining booking holds no room, so it has no room rate and no category to
 * put it in; clearing the category is always allowed, because "not yet
 * priced" has to stay reachable.
 */
export function tariffCategoryError(
  category: string | null | undefined,
  booking: { service_type: string }
): string | null {
  if (category === null || category === undefined || category === "") return null;
  if (!isTariffCategory(category)) return "Choose a tariff category";
  if (booking.service_type === "meals_only") {
    return "A meals-only booking has no room, so it has no tariff category";
  }
  return null;
}
