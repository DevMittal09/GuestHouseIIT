import { redirect } from "next/navigation";
import { ReviewQueue } from "@/components/review-queue";
import { getCurrentUser } from "@/lib/auth";
import { homeForRole } from "@/lib/routes";
import { getStore } from "@/lib/store";

export default async function FaPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  if (user.role !== "faculty_advisor") redirect(homeForRole(user.role));

  const bookings = await getStore().listBookings({
    status: "PENDING_FA",
    club: user.department_or_club ?? undefined,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Faculty Advisor Portal</h1>
        <p className="text-muted-foreground">
          Requests from <span className="font-medium">{user.department_or_club}</span> awaiting
          your review.
        </p>
      </div>
      <ReviewQueue
        bookings={bookings}
        emptyMessage={`No pending requests from ${user.department_or_club}.`}
      />
    </div>
  );
}
