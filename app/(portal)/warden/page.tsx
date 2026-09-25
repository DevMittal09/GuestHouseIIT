import { redirect } from "next/navigation";
import { ReviewQueue } from "@/components/review-queue";
import { getCurrentUser } from "@/lib/auth";
import { homeForRole, SIGN_IN_PATH } from "@/lib/routes";
import { getStore } from "@/lib/store";
import { PageHeader } from "@/components/page-header";
import { AcademicDetailsCard } from "@/components/academic-details";
import { studentRecordPanels } from "@/lib/academic/family-server";

export default async function WardenPage() {
  const user = await getCurrentUser();
  if (!user) redirect(SIGN_IN_PATH);
  if (user.role !== "warden") redirect(homeForRole(user.role));

  const bookings = await getStore().listBookings({
    status: "PENDING_WARDEN",
    hostelName: user.hostel_name ?? undefined,
  });
  // Each student's academic record beside their request, so the family on it
  // can be checked against the names on file before it is forwarded.
  const studentRecords = await studentRecordPanels(bookings);

  return (
    <div className="space-y-6">
      <PageHeader title="Assistant Warden Portal">
        Student booking requests from <span className="font-medium">{user.hostel_name}</span>{" "}
        hostel awaiting your review.
      </PageHeader>
      <ReviewQueue
        bookings={bookings}
        emptyMessage={`No pending requests from ${user.hostel_name} hostel.`}
        studentRecords={studentRecords}
      />
      {/* Wardens never open New Booking, so their academic record is shown
          here — below the queue, which is what they came for. */}
      <AcademicDetailsCard user={user} title="Your details" />
    </div>
  );
}
