import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { MyBookings } from "@/components/my-bookings";
import { PageHeader } from "@/components/page-header";
import { getCurrentUser } from "@/lib/auth";
import { serviceTypesFor } from "@/lib/booking-types";
import { getEffectiveFormConfig } from "@/lib/form-config-server";
import { MANAGER_HELP_LINE } from "@/lib/policy";
import { homeForRole, SIGN_IN_PATH } from "@/lib/routes";
import { getStore } from "@/lib/store";
import { REQUESTER_ROLES } from "@/lib/types";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect(SIGN_IN_PATH);
  if (!REQUESTER_ROLES.includes(user.role)) redirect(homeForRole(user.role));

  const store = getStore();
  const [bookings, config, guestHouses] = await Promise.all([
    store.listBookingsForUser(user.id),
    getEffectiveFormConfig(user.role),
    store.listGuestHouses(),
  ]);

  // Meals get their own door rather than living inside "New Booking": a
  // department booking lunch for a visiting examiner has no room to ask for,
  // and having to start a room booking to find the option was the complaint.
  const canBookMeals = serviceTypesFor(
    user.role,
    guestHouses.some((g) => g.serves_meals && config.allowed_guest_house_ids.includes(g.id))
  ).includes("meals_only");

  return (
    <div className="space-y-6">
      <PageHeader
        title="My Bookings"
        actions={
          <div className="flex flex-wrap gap-2">
            {canBookMeals && (
              <Button asChild variant="outline">
                <Link href="/book?service=meals_only">Meal / Dining Booking</Link>
              </Button>
            )}
            <Button asChild>
              <Link href="/book">New Booking (Room)</Link>
            </Button>
          </div>
        }
      >
        Track your guest house requests through the approval pipeline.
      </PageHeader>
      <MyBookings bookings={bookings} />
      {/* The way out when the form will not do what the requester needs — a
          stay over the 14-night cap, an exception, a booking taken at the
          desk. Values live in `lib/policy.ts`. */}
      <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
        {MANAGER_HELP_LINE}
      </p>
    </div>
  );
}
