import Link from "next/link";
import { redirect } from "next/navigation";
import { ManagerQueue } from "@/components/manager-queue";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth";
import { homeForRole, SIGN_IN_PATH } from "@/lib/routes";
import { getStore } from "@/lib/store";
import { instituteDayBounds, toInstituteDateValue } from "@/lib/tz";
import { cn } from "@/lib/utils";
import { checksOutOn, stayPhase } from "@/lib/workflow";
import { PageHeader } from "@/components/page-header";

export default async function ManagerPage({
  searchParams,
}: {
  searchParams: Promise<{ gh?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect(SIGN_IN_PATH);
  if (user.role !== "gh_manager") redirect(homeForRole(user.role));

  const store = getStore();
  const guestHouses = await store.listGuestHouses();
  if (guestHouses.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-10 text-center text-muted-foreground">
        No guest houses configured yet — ask a developer to add one in the admin console.
      </p>
    );
  }
  const { gh } = await searchParams;
  const current =
    guestHouses.find((g) => g.name.toLowerCase() === (gh ?? "").toLowerCase()) ?? guestHouses[0];

  const [pending, allApproved, allOccupied, cancellationRequests, rooms] = await Promise.all([
    store.listBookings({ status: "PENDING_GH_MANAGER", guestHouseId: current.id }),
    store.listBookings({ status: "APPROVED", guestHouseId: current.id }),
    store.listBookings({ status: "OCCUPIED", guestHouseId: current.id }),
    store.listBookings({ status: "CANCELLATION_REQUESTED", guestHouseId: current.id }),
    store.listRooms(current.id),
  ]);
  const now = new Date();

  // Split the stays by where they actually are in time, not by status. An
  // approved booking for next week and a guest currently in the building are
  // two different jobs for the manager, and lumping them together was reading
  // as "this future booking is occupied".
  // A meals-only booking is not a stay: nobody arrives, nobody is checked in
  // or out, and no room comes back. Listing one under "Upcoming stays" would
  // put a room-less row in a table whose whole job is rooms — those belong on
  // the kitchen's day view instead (`/manager/meals`).
  const stays = [...allApproved, ...allOccupied]
    .filter((b) => b.service_type !== "meals_only")
    .sort((a, b) => a.check_in.localeCompare(b.check_in));
  const currentStays = stays.filter((b) => stayPhase(b, now) === "current");
  const upcomingStays = stays.filter((b) => stayPhase(b, now) === "upcoming");
  // A stay past its check-out that was never marked Vacated still needs
  // closing off, so it stays visible with the current occupants.
  const overdueStays = stays.filter((b) => stayPhase(b, now) === "past");

  // "Today" is the guest house's day, not the server's — see lib/tz.ts.
  const { start: dayStart, end: dayEnd } = instituteDayBounds(toInstituteDateValue(now));
  const checkoutsToday = stays
    .filter((b) => checksOutOn(b, dayStart, dayEnd))
    .sort((a, b) => a.check_out.localeCompare(b.check_out));

  /**
   * A fingerprint of every room hold on this guest house.
   *
   * The allocation grid loads occupancy once, when its dialog opens. If another
   * manager allocated a room in the meantime the grid went on showing it green
   * until someone pressed Refresh — the write was still refused by the
   * exclusion constraint, but the grid was offering rooms that were already
   * gone. This page re-renders every few seconds, so any change to the holds
   * changes this string and the open grid re-fetches; when nothing has changed
   * the string is stable and it does not.
   */
  const occupancyVersion = [...stays, ...cancellationRequests]
    .map((b) => `${b.id}:${b.status}:${[...b.assigned_room_ids].sort().join("+")}`)
    .sort()
    .join("|");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Guest House Manager Console"
        actions={
          <div className="flex flex-wrap gap-2">
            {/* Taking a booking at the desk for someone who cannot use the
                portal, and the kitchen's head count for a given day. */}
            <Button asChild variant="outline">
              <Link href="/book">New booking for a guest</Link>
            </Button>
            {current.serves_meals && (
              <Button asChild variant="outline">
                <Link href={`/manager/meals?gh=${encodeURIComponent(current.name)}`}>
                  Meal counts
                </Link>
              </Button>
            )}
          </div>
        }
      >
        Review pre-approved and direct requests, then allocate rooms per guest house.
      </PageHeader>

      {/* Separate queue per guest house */}
      <div className="flex gap-1 rounded-lg bg-muted p-1 w-fit">
        {guestHouses.map((g) => (
          <Link
            key={g.id}
            href={`/manager?gh=${g.name.toLowerCase()}`}
            className={cn(
              "rounded-md px-4 py-1.5 text-sm font-medium transition-colors",
              g.id === current.id
                ? "bg-background shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {g.name}
            <span className="ml-1.5 text-xs text-muted-foreground">({g.total_rooms} rooms)</span>
          </Link>
        ))}
      </div>

      <ManagerQueue
        pending={pending}
        current={currentStays}
        upcoming={upcomingStays}
        overdue={overdueStays}
        checkoutsToday={checkoutsToday}
        cancellationRequests={cancellationRequests}
        rooms={rooms}
        occupancyVersion={occupancyVersion}
        nowIso={now.toISOString()}
      />
    </div>
  );
}
