import { redirect } from "next/navigation";
import { ReviewQueue } from "@/components/review-queue";
import { getCurrentUser } from "@/lib/auth";
import { homeForRole } from "@/lib/routes";
import { getStore } from "@/lib/store";

export default async function WardenPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  if (user.role !== "warden") redirect(homeForRole(user.role));

  const bookings = await getStore().listBookings({
    status: "PENDING_WARDEN",
    hostelName: user.hostel_name ?? undefined,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Hostel Warden Portal</h1>
        <p className="text-muted-foreground">
          Student booking requests from <span className="font-medium">{user.hostel_name}</span>{" "}
          hostel awaiting your review.
        </p>
      </div>
      <ReviewQueue
        bookings={bookings}
        emptyMessage={`No pending requests from ${user.hostel_name} hostel.`}
      />
    </div>
  );
}
