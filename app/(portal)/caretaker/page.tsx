import Link from "next/link";
import { redirect } from "next/navigation";
import { CaretakerConsole } from "@/components/caretaker-console";
import { getCurrentUser } from "@/lib/auth";
import { homeForRole, SIGN_IN_PATH } from "@/lib/routes";
import { getStore } from "@/lib/store";
import { instituteDayBounds, toInstituteDateValue } from "@/lib/tz";
import { cn } from "@/lib/utils";
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
      <p className="rounded-lg border border-dashed p-10 text-center text-muted-foreground">
        No guest houses configured yet — ask a developer to add one in the admin console.
      </p>
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
    <div className="space-y-6">
      <PageHeader title="Guest House Reception">
        Who is in the building, who arrives next, and who leaves today. Room allocation and
        approvals are handled by the Guest House Manager.
      </PageHeader>

      {guestHouses.length > 1 && (
        <div className="flex gap-1 rounded-lg bg-muted p-1 w-fit">
          {guestHouses.map((g) => (
            <Link
              key={g.id}
              href={`/caretaker?gh=${g.name.toLowerCase()}`}
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
      )}

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
