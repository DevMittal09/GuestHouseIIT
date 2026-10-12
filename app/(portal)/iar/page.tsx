import { redirect } from "next/navigation";
import { ReviewQueue } from "@/components/review-queue";
import { getCurrentUser } from "@/lib/auth";
import { homeForRole, SIGN_IN_PATH } from "@/lib/routes";
import { getStore } from "@/lib/store";
import { PageHeader } from "@/components/page-header";
import { configuredStageName } from "@/lib/approval-routes";
import { forwardTargets, getReviewContext, stageQueuesFor } from "@/lib/approval-routes-server";
import { canReviewBooking } from "@/lib/workflow";

/**
 * The IAR Office's queue, and whatever else the office routes through this
 * slot.
 *
 * Filtered through `canReviewBooking` rather than listed outright: the slot
 * is the IAR Office's by default, but a route may hand it to somebody else,
 * and an office that is no longer on it should not still be reading it.
 */
export default async function IarPage() {
  const user = await getCurrentUser();
  if (!user) redirect(SIGN_IN_PATH);
  // `homeForRole("iar_cell")` is this page, so the role always keeps it.
  const queues = await stageQueuesFor(user);
  if (user.role !== "iar_cell" && !queues.includes("PENDING_IAR")) {
    redirect(homeForRole(user.role));
  }

  const review = await getReviewContext();
  const waiting = await getStore().listBookings({ status: "PENDING_IAR" });
  const bookings = waiting
    .filter((b) => canReviewBooking(user, b, review.units, review))
    .sort((a, b) => a.check_in.localeCompare(b.check_in));

  return (
    <div className="space-y-6">
      <PageHeader
        caption="Approvals"
        title={configuredStageName("PENDING_IAR", review.rules) ?? "IAR Office Portal"}
      >
        Requests raised by the IAR Student Cell.
      </PageHeader>
      <ReviewQueue
        bookings={bookings}
        emptyMessage="No requests awaiting IAR Office verification."
        showAlumniCard
        forwardTargets={forwardTargets(bookings, review)}
      />
    </div>
  );
}
