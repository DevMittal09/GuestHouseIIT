import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { MyBookings } from "@/components/my-bookings";
import { getCurrentUser } from "@/lib/auth";
import { MANAGER_HELP_LINE } from "@/lib/policy";
import { homeForRole } from "@/lib/routes";
import { getStore } from "@/lib/store";
import { REQUESTER_ROLES } from "@/lib/types";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  if (!REQUESTER_ROLES.includes(user.role)) redirect(homeForRole(user.role));

  const bookings = await getStore().listBookingsForUser(user.id);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">My Bookings</h1>
          <p className="text-muted-foreground">
            Track your guest house requests through the approval pipeline.
          </p>
        </div>
        <Button asChild>
          <Link href="/book">New Booking</Link>
        </Button>
      </div>
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
