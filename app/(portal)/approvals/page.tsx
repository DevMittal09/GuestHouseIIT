import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { clubsBookableByUser } from "@/lib/club-booking-server";
import { PageHeader } from "@/components/page-header";
import { ReviewQueue } from "@/components/review-queue";
import { getCurrentUser } from "@/lib/auth";
import { homeForRole, SIGN_IN_PATH } from "@/lib/routes";
import { getStore } from "@/lib/store";
import { approvesClubsFor, UNIT_HEAD_TITLES } from "@/lib/units";
import { canReviewBooking } from "@/lib/workflow";

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
  const isApprover = approvesClubsFor(user.id, units) || user.role === "faculty_advisor";
  if (!isApprover) redirect(homeForRole(user.role));

  // The club stage only; HOD approvals have their own queue at /hod.
  const club = await store.listBookings({ status: "PENDING_FA" });
  const mine = club
    .filter((b) => canReviewBooking(user, b, units))
    .sort((a, b) => a.check_in.localeCompare(b.check_in));

  const headed = units.filter(
    (u) =>
      (u.kind === "club" || u.kind === "council") &&
      (u.head_id === user.id || u.acting_head_id === user.id)
  );
  const roles = headed.map(
    (u) =>
      `${u.acting_head_id === user.id && u.head_id !== user.id ? "Acting " : ""}${UNIT_HEAD_TITLES[u.kind]}, ${u.name}`
  );

  // A faculty in-charge raises the club's bookings themselves (24 Sep 2026),
  // so the way in is here, on the page they land on.
  const clubs = await clubsBookableByUser(user);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Club Approvals"
        actions={
          clubs.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {clubs.map((c) => (
                <Button key={c.id} asChild>
                  <Link href={`/book?for=${encodeURIComponent(c.id)}`}>Book for {c.full_name}</Link>
                </Button>
              ))}
            </div>
          ) : undefined
        }
      >
        {roles.length > 0 ? (
          <>
            Requests waiting on you as <span className="font-medium">{roles.join("; ")}</span>.
            Forwarding sends them on — to the HOD where the club has one, otherwise to the
            Guest House Manager.
          </>
        ) : (
          <>Club requests waiting on you as faculty advisor.</>
        )}
      </PageHeader>
      <ReviewQueue bookings={mine} emptyMessage="Nothing is waiting on you." />
    </div>
  );
}
