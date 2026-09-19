import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { MyBookings } from "@/components/my-bookings";
import { PageHeader } from "@/components/page-header";
import { getCurrentUser } from "@/lib/auth";
import { homeForRole, SIGN_IN_PATH } from "@/lib/routes";
import { getStore } from "@/lib/store";
import { REQUESTER_ROLES } from "@/lib/types";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect(SIGN_IN_PATH);
  if (!REQUESTER_ROLES.includes(user.role)) redirect(homeForRole(user.role));

  const bookings = await getStore().listBookingsForUser(user.id);

  return (
    <div className="space-y-6">
      <PageHeader
        title="My Bookings"
        actions={
          <Button asChild>
            <Link href="/book">New Booking</Link>
          </Button>
        }
      >
        Track your guest house requests through the approval pipeline.
      </PageHeader>
      <MyBookings bookings={bookings} />
    </div>
  );
}
