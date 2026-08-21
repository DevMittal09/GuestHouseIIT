import { redirect } from "next/navigation";
import { BookingHistory } from "@/components/booking-history";
import {
  HISTORY_PAGE_SIZE,
  criteriaFromParams,
  parseHistoryParams,
  type RawSearchParams,
} from "@/lib/booking-search";
import { getCurrentUser } from "@/lib/auth";
import { homeForRole } from "@/lib/routes";
import { getStore } from "@/lib/store";
import { canViewHistory, historyScope } from "@/lib/workflow";

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  if (!canViewHistory(user.role)) redirect(homeForRole(user.role));

  const scope = historyScope(user);

  if (!scope.ok) {
    return (
      <div className="space-y-6">
        <Heading scopeLabel={null} />
        <p className="rounded-lg border border-dashed p-10 text-center text-muted-foreground">
          {scope.reason}
        </p>
      </div>
    );
  }

  // The developer has acted on almost nothing, so their default view is the
  // whole archive; a reviewer's default is their own approval log.
  const defaultActor = user.role === "developer" ? "all" : "me";
  const params = parseHistoryParams(await searchParams, defaultActor);

  const store = getStore();
  const [guestHouses, result] = await Promise.all([
    store.listGuestHouses(),
    store.searchBookings(
      criteriaFromParams(params, scope.criteria, user.id, {
        offset: (params.page - 1) * HISTORY_PAGE_SIZE,
        limit: HISTORY_PAGE_SIZE,
      })
    ),
  ]);

  return (
    <div className="space-y-6">
      <Heading scopeLabel={scope.label} />
      <BookingHistory
        rows={result.rows}
        total={result.total}
        statusCounts={result.statusCounts}
        truncated={result.truncated}
        params={params}
        defaultActor={defaultActor}
        canFilterByRole={scope.canFilterByRole}
        guestHouses={guestHouses.map((g) => ({ id: g.id, name: g.name }))}
        currentUserId={user.id}
        currentUserName={user.full_name}
        showAlumniCard={user.role === "iar_cell" || user.role === "developer"}
        pageSize={HISTORY_PAGE_SIZE}
      />
    </div>
  );
}

function Heading({ scopeLabel }: { scopeLabel: string | null }) {
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Approval Log</h1>
      <p className="text-muted-foreground">
        Every request you have approved or rejected, and a searchable archive of past bookings.
        {scopeLabel && <span className="ml-1 font-medium text-foreground">{scopeLabel}.</span>}
      </p>
    </div>
  );
}
