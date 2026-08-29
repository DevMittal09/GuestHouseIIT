import Link from "next/link";
import { redirect } from "next/navigation";
import { ManagerQueue } from "@/components/manager-queue";
import { getCurrentUser } from "@/lib/auth";
import { homeForRole } from "@/lib/routes";
import { getStore } from "@/lib/store";
import { cn } from "@/lib/utils";

export default async function ManagerPage({
  searchParams,
}: {
  searchParams: Promise<{ gh?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/");
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
  const nowIso = new Date().toISOString();

  // Merge approved + occupied bookings for the stays table, filter to current/future.
  const stays = [...allApproved, ...allOccupied]
    .filter((b) => b.check_out >= nowIso)
    .sort((a, b) => a.check_in.localeCompare(b.check_in));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Guest House Manager Console</h1>
        <p className="text-muted-foreground">
          Review pre-approved and direct requests, then allocate rooms per guest house.
        </p>
      </div>

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
        approved={stays}
        cancellationRequests={cancellationRequests}
        rooms={rooms}
      />
    </div>
  );
}
