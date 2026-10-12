import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { ReviewQueue } from "@/components/review-queue";
import { getCurrentUser } from "@/lib/auth";
import { homeForRole, SIGN_IN_PATH } from "@/lib/routes";
import { getStore } from "@/lib/store";
import { approversOf, hodUnitIdFor } from "@/lib/units";
import { configuredStageName } from "@/lib/approval-routes";
import { forwardTargets, getReviewContext, stageQueuesFor } from "@/lib/approval-routes-server";
import { canReviewBooking } from "@/lib/workflow";

/**
 * The HOD's queue (Phase 4): official bookings from their department - its
 * faculty and staff, its office when the office asked for HOD approval, and
 * any club whose HOD it is - waiting on their approval.
 *
 * Worked out on every visit from `canReview`, the same predicate the Forward
 * button checks, so an HOD sees exactly what they may act on: their own
 * department's requests, never another's, and never their own. A new HOD sees
 * the waiting requests the moment the console names them.
 *
 * Since 12 Oct 2026 the way in is "a route points at you at this stage"
 * (`stageQueuesFor`), not "you head a unit": the office can hand this slot to
 * a named person or everyone holding a role, and they need the queue too.
 */
export default async function HodPage() {
  const user = await getCurrentUser();
  if (!user) redirect(SIGN_IN_PATH);

  const queues = await stageQueuesFor(user);
  if (!queues.includes("PENDING_HOD")) redirect(homeForRole(user.role));

  const review = await getReviewContext();
  const units = review.units;
  const waiting = await getStore().listBookings({ status: "PENDING_HOD" });
  const mine = waiting
    .filter((b) => canReviewBooking(user, b, units, review))
    .sort((a, b) => a.check_in.localeCompare(b.check_in));

  // The departments and offices whose HOD approval this person gives.
  const governed = units
    .filter((u) => approversOf(hodUnitIdFor(u.id, units), units).includes(user.id))
    .map((u) => u.name);

  return (
    <div className="space-y-6">
      <PageHeader
        caption="Approvals"
        title={configuredStageName("PENDING_HOD", review.rules) ?? "HOD Queue"}
      >
        {governed.length > 0 ? (
          <>
            HOD for <span className="font-medium">{governed.join(", ")}</span>.
          </>
        ) : null}
      </PageHeader>
      <ReviewQueue
        bookings={mine}
        emptyMessage="Nothing is waiting on your approval."
        forwardTargets={forwardTargets(mine, review)}
      />
    </div>
  );
}
