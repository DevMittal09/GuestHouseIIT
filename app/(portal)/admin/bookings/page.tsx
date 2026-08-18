import { BookingsManager } from "@/components/admin/bookings-manager";
import { getStore } from "@/lib/store";

export default async function AdminBookingsPage() {
  const bookings = await getStore().listBookings({});
  return <BookingsManager bookings={bookings} />;
}
