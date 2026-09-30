import Link from "next/link";
import { redirect } from "next/navigation";
import { CaretakerConsole } from "@/components/caretaker-console";
import { getCurrentUser } from "@/lib/auth";
import { homeForRole, SIGN_IN_PATH } from "@/lib/routes";
import { getStore } from "@/lib/store";
import { instituteDayBounds, toInstituteDateValue } from "@/lib/tz";
import { LinkTabs } from "@/components/link-tabs";
import { checksOutOn, stayPhase } from "@/lib/workflow";
import { awaitingSettlement, UNSETTLED_WINDOW_DAYS } from "@/lib/invoice";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";

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
      <p className="rounded-lg border border-dashed border-border-strong bg-band/40 px-6 py-8 text-center text-sm text-muted-foreground">
        No guest houses configured yet — ask a developer to add one in the admin console.
      </p>
    );
  }
  const { gh } = await searchParams;
  const current =
    guestHouses.find((g) => g.name.toLowerCase() === (gh ?? "").toLowerCase()) ?? guestHouses[0];

  // Only the two statuses that put a guest in a room. Pending requests are the
  // manager's business, so the caretaker never loads them.
  // And the stays that have left without settling, because reception issues
  // the invoice (24 Sep 2026) — the same list the manager has.
  const [allApproved, allOccupied, allVacated] = await Promise.all([
    store.listBookings({ status: "APPROVED", guestHouseId: current.id }),
    store.listBookings({ status: "OCCUPIED", guestHouseId: current.id }),
    store.listBookings({ status: "VACATED", guestHouseId: current.id }),
  ]);

  const now = new Date();
  const recentlyVacated = allVacated.filter(
    (b) => Date.parse(b.check_out) >= now.getTime() - UNSETTLED_WINDOW_DAYS * 86_400_000
  );
  const toBill = awaitingSettlement(
    recentlyVacated,
    recentlyVacated.length > 0
      ? await store.listInvoices({ bookingIds: recentlyVacated.map((b) => b.id) }).catch(() => [])
      : [],
    now
  );
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
      <PageHeader
        caption={`${current.name} · Front desk`}
        title="Guest House Reception"
        actions={
          // The kitchen's head count for the day, and the dining bookings to
          // bill — open to reception, and until now reachable only by URL.
          current.serves_meals ? (
            <Button asChild variant="outline">
              <Link href={`/manager/meals?gh=${encodeURIComponent(current.name)}`}>Meal counts</Link>
            </Button>
          ) : undefined
        }
      >
        Who is in the building, who arrives next, and who leaves today. Room allocation and
        approvals are handled by the Guest House Manager.
      </PageHeader>

      {guestHouses.length > 1 && (
        <LinkTabs
          label="Guest houses"
          items={guestHouses.map((g) => ({
            href: `/caretaker?gh=${g.name.toLowerCase()}`,
            label: g.name,
            detail: `${g.total_rooms} rooms`,
            active: g.id === current.id,
          }))}
        />
      )}

      <CaretakerConsole
        current={currentStays}
        upcoming={upcomingStays}
        overdue={overdueStays}
        checkoutsToday={checkoutsToday}
        toBill={toBill}
        nowIso={now.toISOString()}
      />
    </div>
  );
}
