import { BookingRequestPage } from "@/components/booking-request-page";

/**
 * The room-booking door. `?service=meals_only` still reaches the dining form
 * from here (the public `/book-meal` card and the My Bookings tile link to
 * it); `/book/meals` is the door the portal nav offers.
 */
export default async function BookPage({
  searchParams,
}: {
  searchParams: Promise<{ service?: string; for?: string }>;
}) {
  const { service, for: forParam } = await searchParams;
  return <BookingRequestPage service={service} forId={forParam} />;
}
