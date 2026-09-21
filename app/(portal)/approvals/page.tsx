import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { ReviewQueue } from "@/components/review-queue";
import { getCurrentUser } from "@/lib/auth";
import { homeForRole, SIGN_IN_PATH } from "@/lib/routes";
import { getStore } from "@/lib/store";
import { headsAnyUnit, UNIT_HEAD_TITLES } from "@/lib/units";
import { canReview } from "@/lib/workflow";

/**
 * One queue for everyone who approves by appointment rather than by role.
 *
 * An HOD, a club's faculty advisor and a council's student secretary are all
 * here — whoever heads a unit today. The list is worked out on every visit
 * from `canReview`, the same predicate the Forward button checks, so a new
 * HOD sees their department's waiting requests the moment the console names
 * them, and the old HOD stops seeing them at the same moment.
 */
export default async function ApprovalsPage() {
  const user = await getCurrentUser();
  if (!user) redirect(SIGN_IN_PATH);

  const store = getStore();
  const units = await store.listUnits().catch(() => []);
  // A faculty advisor keeps this page even with no unit set up yet: their
  // club requests still reach them by the old name match.
  const isApprover = headsAnyUnit(user.id, units) || user.role === "faculty_advisor";
  if (!isApprover) redirect(homeForRole(user.role));

  const [hod, club] = await Promise.all([
    store.listBookings({ status: "PENDING_HOD" }),
    store.listBookings({ status: "PENDING_FA" }),
  ]);
  const mine = [...hod, ...club]
    .filter((b) => canReview(user, b.status, b.requester, units))
    .sort((a, b) => a.check_in.localeCompare(b.check_in));

  const headed = units.filter((u) => u.head_id === user.id || u.acting_head_id === user.id);
  const roles = headed.map(
    (u) =>
      `${u.acting_head_id === user.id && u.head_id !== user.id ? "Acting " : ""}${UNIT_HEAD_TITLES[u.kind]}, ${u.name}`
  );

  return (
    <div className="space-y-6">
      <PageHeader title="Approvals">
        {roles.length > 0 ? (
          <>
            Requests waiting on you as <span className="font-medium">{roles.join("; ")}</span>.
            Forwarding sends them to the Guest House Manager.
          </>
        ) : (
          <>Club requests waiting on you as faculty advisor.</>
        )}
      </PageHeader>
      <ReviewQueue bookings={mine} emptyMessage="Nothing is waiting on you." />
    </div>
  );
}
