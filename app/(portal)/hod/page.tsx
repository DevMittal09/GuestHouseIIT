import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { ReviewQueue } from "@/components/review-queue";
import { getCurrentUser } from "@/lib/auth";
import { homeForRole, SIGN_IN_PATH } from "@/lib/routes";
import { getStore } from "@/lib/store";
import { approversOf, hodUnitIdFor, isHodForAny } from "@/lib/units";
import { canReviewBooking } from "@/lib/workflow";

/**
 * The HOD's queue (Phase 4): official bookings from their department — its
 * faculty and staff, its office when the office asked for HOD approval, and
 * any club whose HOD it is — waiting on their approval.
 *
 * Worked out on every visit from `canReview`, the same predicate the Forward
 * button checks, so an HOD sees exactly what they may act on: their own
 * department's requests, never another's, and never their own. A new HOD sees
 * the waiting requests the moment the console names them.
 */
export default async function HodPage() {
  const user = await getCurrentUser();
  if (!user) redirect(SIGN_IN_PATH);

  const store = getStore();
  const units = await store.listUnits().catch(() => []);
  if (!isHodForAny(user.id, units)) redirect(homeForRole(user.role));

  const waiting = await store.listBookings({ status: "PENDING_HOD" });
  const mine = waiting
    .filter((b) => canReviewBooking(user, b, units))
    .sort((a, b) => a.check_in.localeCompare(b.check_in));

  // The departments and offices whose HOD approval this person gives.
  const governed = units
    .filter((u) => approversOf(hodUnitIdFor(u.id, units), units).includes(user.id))
    .map((u) => u.name);

  return (
    <div className="space-y-6">
      <PageHeader title="HOD Queue">
        Official requests waiting on your approval as HOD for{" "}
        <span className="font-medium">{governed.join(", ")}</span>. Forwarding sends them to the
        Guest House Manager; a rejection needs a reason, which the requester sees.
      </PageHeader>
      <ReviewQueue bookings={mine} emptyMessage="Nothing is waiting on your approval." />
    </div>
  );
}
