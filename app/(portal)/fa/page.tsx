import { redirect } from "next/navigation";
import { ReviewQueue } from "@/components/review-queue";
import { getCurrentUser } from "@/lib/auth";
import { homeForRole, SIGN_IN_PATH } from "@/lib/routes";
import { getStore } from "@/lib/store";
import { PageHeader } from "@/components/page-header";

export default async function FaPage() {
  const user = await getCurrentUser();
  if (!user) redirect(SIGN_IN_PATH);
  if (user.role !== "faculty_advisor") redirect(homeForRole(user.role));

  const bookings = await getStore().listBookings({
    status: "PENDING_FA",
    club: user.department_or_club ?? undefined,
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Faculty Advisor Portal">
        Requests from <span className="font-medium">{user.department_or_club}</span> awaiting
        your review.
      </PageHeader>
      <ReviewQueue
        bookings={bookings}
        emptyMessage={`No pending requests from ${user.department_or_club}.`}
      />
    </div>
  );
}
