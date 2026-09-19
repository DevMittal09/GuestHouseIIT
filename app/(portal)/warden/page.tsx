import { redirect } from "next/navigation";
import { ReviewQueue } from "@/components/review-queue";
import { getCurrentUser } from "@/lib/auth";
import { homeForRole, SIGN_IN_PATH } from "@/lib/routes";
import { getStore } from "@/lib/store";
import { PageHeader } from "@/components/page-header";

export default async function WardenPage() {
  const user = await getCurrentUser();
  if (!user) redirect(SIGN_IN_PATH);
  if (user.role !== "warden") redirect(homeForRole(user.role));

  const bookings = await getStore().listBookings({
    status: "PENDING_WARDEN",
    hostelName: user.hostel_name ?? undefined,
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Assistant Warden Portal">
        Student booking requests from <span className="font-medium">{user.hostel_name}</span>{" "}
        hostel awaiting your review.
      </PageHeader>
      <ReviewQueue
        bookings={bookings}
        emptyMessage={`No pending requests from ${user.hostel_name} hostel.`}
      />
    </div>
  );
}
