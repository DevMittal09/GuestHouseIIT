import { redirect } from "next/navigation";
import { BedDouble, CalendarClock, DoorOpen, LogOut, UsersRound } from "lucide-react";
import { CaretakerConsole } from "@/components/caretaker-console";
import { EmptyState } from "@/components/empty-state";
import { GuestHouseSwitcher } from "@/components/portal/guest-house-switcher";
import { StatGrid, StatTile } from "@/components/portal/stat-tiles";
import { getCurrentUser } from "@/lib/auth";
import { homeForRole, SIGN_IN_PATH } from "@/lib/routes";
import { getStore } from "@/lib/store";
import { instituteDayBounds, toInstituteDateValue } from "@/lib/tz";
import { checksOutOn, stayPhase } from "@/lib/workflow";
import { PageHeader } from "@/components/page-header";

export default async function CaretakerPage({
  searchParams,
}: {
  searchParams: Promise<{ gh?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect(SIGN_IN_PATH);
  if (user.role !== "gh_caretaker") redirect(homeForRole(user.role));

  const store = getStore();
  const guestHouses = await store.listGuestHouses();
  if (guestHouses.length === 0) {
    return (
      <EmptyState icon={BedDouble} title="No guest houses configured yet">
        Ask a developer to add one in the admin console.
      </EmptyState>
    );
  }
  const { gh } = await searchParams;
  const current =
    guestHouses.find((g) => g.name.toLowerCase() === (gh ?? "").toLowerCase()) ?? guestHouses[0];

  // Only the two statuses that put a guest in a room. Pending requests are the
  // manager's business, so the caretaker never loads them.
  const [allApproved, allOccupied] = await Promise.all([
    store.listBookings({ status: "APPROVED", guestHouseId: current.id }),
    store.listBookings({ status: "OCCUPIED", guestHouseId: current.id }),
  ]);

  const now = new Date();
  const stays = [...allApproved, ...allOccupied].sort((a, b) =>
    a.check_in.localeCompare(b.check_in)
  );
  const currentStays = stays.filter((b) => stayPhase(b, now) === "current");
  const upcomingStays = stays.filter((b) => stayPhase(b, now) === "upcoming");
  const overdueStays = stays.filter((b) => stayPhase(b, now) === "past");

  // "Today" is the guest house's day, not the server's — see lib/tz.ts.
  const { start: dayStart, end: dayEnd } = instituteDayBounds(toInstituteDateValue(now));
  const checkoutsToday = stays
    .filter((b) => checksOutOn(b, dayStart, dayEnd))
    .sort((a, b) => a.check_out.localeCompare(b.check_out));

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Reception desk"
        title="Guest house reception"
        actions={
          guestHouses.length > 1 && (
            <GuestHouseSwitcher basePath="/caretaker" guestHouses={guestHouses} currentId={current.id} />
          )
        }
      >
        Who is in the building, who arrives next, and who leaves today. Room allocation and
        approvals are handled by the Guest House Manager.
      </PageHeader>

      <StatGrid>
        <StatTile
          icon={LogOut}
          label="Checking out today"
          value={checkoutsToday.length}
          highlight={checkoutsToday.length > 0}
          tone="saffron"
        />
        <StatTile icon={UsersRound} tone="violet" label="In residence" value={currentStays.length} hint="Stays under way" />
        <StatTile icon={CalendarClock} tone="sky" label="Upcoming arrivals" value={upcomingStays.length} />
        <StatTile
          icon={DoorOpen}
          tone="vermilion"
          label="Awaiting check-out"
          value={overdueStays.length}
          hint={overdueStays.length > 0 ? "Past check-out, still holding rooms" : "None overdue"}
        />
      </StatGrid>

      <CaretakerConsole
        current={currentStays}
        upcoming={upcomingStays}
        overdue={overdueStays}
        checkoutsToday={checkoutsToday}
        nowIso={now.toISOString()}
      />
    </div>
  );
}
