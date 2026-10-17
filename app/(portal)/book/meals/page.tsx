import { BookingRequestPage } from "@/components/booking-request-page";
import { MEALS_ONLY_SERVICE } from "@/lib/routes";

/**
 * **The meal-booking door** (17 Oct 2026, the owner: Room Booking and Meal
 * Booking as two entries in the nav, so meals can be booked without starting
 * a room booking first).
 *
 * The same page as `/book`, opened on the dining flow - not a second
 * meal-booking system. A route of its own rather than a query string so the
 * nav can light the door that is actually open, and so the address is one a
 * requester can keep.
 *
 * `?for=` is carried through for a Faculty Advisor booking for a club. The
 * role is still checked: a requester who may not book meals without a room
 * gets the ordinary room form, as `/book?service=meals_only` has always
 * done.
 */
export default async function MealBookingPage({
  searchParams,
}: {
  searchParams: Promise<{ for?: string }>;
}) {
  const { for: forParam } = await searchParams;
  return <BookingRequestPage service={MEALS_ONLY_SERVICE} forId={forParam} />;
}
