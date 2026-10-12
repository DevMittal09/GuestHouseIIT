import { redirect } from "next/navigation";
import { ReviewQueue } from "@/components/review-queue";
import { getCurrentUser } from "@/lib/auth";
import { homeForRole, SIGN_IN_PATH } from "@/lib/routes";
import { getStore } from "@/lib/store";
import { PageHeader } from "@/components/page-header";
import { AcademicDetailsCard } from "@/components/academic-details";
import { studentRecordPanels } from "@/lib/academic/family-server";
import { configuredStageName } from "@/lib/approval-routes";
import { forwardTargets, getReviewContext, stageQueuesFor } from "@/lib/approval-routes-server";
import { canReviewBooking } from "@/lib/workflow";

/**
 * The first stage of a student's request - and, since 12 Oct 2026, of
 * whatever else the office routes through this slot.
 *
 * The queue is **not** a store query scoped to the warden's own hostel any
 * more. It is every request waiting at this stage that `canReviewBooking`
 * lets this person act on, which is the same predicate the Forward button
 * checks: the hostel scoping still happens, inside the approver rule, and a
 * route that puts somebody else on this stage is honoured rather than
 * silently filtered out by a hostel the requester does not have.
 */
export default async function WardenPage() {
  const user = await getCurrentUser();
  if (!user) redirect(SIGN_IN_PATH);
  // The warden role always keeps this page - it is `homeForRole("warden")`,
  // so turning them away here would be a redirect loop - and anyone a route
  // points at this stage is let in beside them.
  const queues = await stageQueuesFor(user);
  if (user.role !== "warden" && !queues.includes("PENDING_WARDEN")) {
    redirect(homeForRole(user.role));
  }

  const review = await getReviewContext();
  const waiting = await getStore().listBookings({ status: "PENDING_WARDEN" });
  const bookings = waiting
    .filter((b) => canReviewBooking(user, b, review.units, review))
    .sort((a, b) => a.check_in.localeCompare(b.check_in));
  // Each student's academic record beside their request, so the family on it
  // can be checked against the names on file before it is forwarded.
  const studentRecords = await studentRecordPanels(bookings);

  const title = configuredStageName("PENDING_WARDEN", review.rules) ?? "Assistant Warden Portal";
  const scope = user.role === "warden" ? (user.hostel_name ?? "Hostel") : null;

  return (
    <div className="space-y-6">
      <PageHeader
        caption={scope ? `Approvals · ${scope}` : "Approvals"}
        title={title}
      />
      <ReviewQueue
        bookings={bookings}
        emptyMessage={
          scope ? `No pending requests from ${scope} hostel.` : "Nothing is waiting on you."
        }
        studentRecords={studentRecords}
        forwardTargets={forwardTargets(bookings, review)}
      />
      {/* Wardens never open New Booking, so their academic record is shown
          here - below the queue, which is what they came for. */}
      <AcademicDetailsCard user={user} title="Your details" />
    </div>
  );
}
