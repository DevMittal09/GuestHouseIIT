import { redirect } from "next/navigation";
import { BookingsManager } from "@/components/admin/bookings-manager";
import { canUseConsoleSection } from "@/lib/access";
import { getCurrentUser } from "@/lib/auth";
import { SIGN_IN_PATH } from "@/lib/routes";
import { getStore } from "@/lib/store";

export default async function AdminBookingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect(SIGN_IN_PATH);
  // Forcing a status and deleting bookings stay developer-only, and the
  // layout lets the manager into /admin now — so the page checks for itself
  // rather than relying on its tab being hidden.
  if (!canUseConsoleSection(user.role, "bookings")) redirect("/admin/users");

  const bookings = await getStore().listBookings({});
  return <BookingsManager bookings={bookings} />;
}
