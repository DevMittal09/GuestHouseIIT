import "server-only";

import { getStore } from "@/lib/store";
import { deskTariffCategories, type DeskTariffCategory } from "@/lib/tariff-categories";
import type { Tariff } from "@/lib/tariffs";
import { toInstituteDateValue } from "@/lib/tz";
import type { BookingWithDetails } from "@/lib/types";

/**
 * **The tariff categories the Guest House Manager may charge a booking
 * under**, read from the office's rate sheet (31 Oct 2026).
 *
 * The server reader for `deskTariffCategories`, in the shape every other rule
 * group in this codebase is read: a page or an action loads the rates once and
 * hands the same list to the screen that asks the question and to the action
 * that records the answer, so the two cannot be offering different things.
 *
 * The rates are quoted **as of the booking's own first day**, not today: the
 * manager approving a stay in March is choosing between the categories that
 * will price it, and a rate published to start in February is already the
 * live one for that stay.
 */
export async function deskCategoriesFor(
  booking: Pick<
    BookingWithDetails,
    "booking_type" | "user_role" | "service_type" | "guest_house" | "check_in"
  >,
  tariffs?: Tariff[]
): Promise<DeskTariffCategory[]> {
  const sheet = tariffs ?? (await getStore().listTariffs().catch(() => []));
  return deskTariffCategories(sheet, {
    guestHouse: booking.guest_house,
    booking: { booking_type: booking.booking_type, user_role: booking.user_role },
    service: booking.service_type,
    date: toInstituteDateValue(new Date(booking.check_in)),
  });
}

/**
 * The same, for a screenful of bookings: the rate sheet is fetched **once**.
 *
 * The desk's console lists every request waiting for it, and each row's
 * dialog needs its own categories - the list depends on the guest house, on
 * whether the booking is a stay or a dining order, and on the booking's own
 * facts, which are one of the categories. One query for the page; keyed by
 * booking id.
 */
export async function deskCategoriesByBooking(
  bookings: Pick<
    BookingWithDetails,
    "id" | "booking_type" | "user_role" | "service_type" | "guest_house" | "check_in"
  >[]
): Promise<Record<string, DeskTariffCategory[]>> {
  if (bookings.length === 0) return {};
  const sheet = await getStore()
    .listTariffs()
    .catch(() => []);
  const byBooking: Record<string, DeskTariffCategory[]> = {};
  for (const booking of bookings) {
    byBooking[booking.id] = await deskCategoriesFor(booking, sheet);
  }
  return byBooking;
}
