import { redirect } from "next/navigation";
import { BookingHistory } from "@/components/booking-history";
import {
  HISTORY_PAGE_SIZE,
  criteriaFromParams,
  parseHistoryParams,
  type RawSearchParams,
} from "@/lib/booking-search";
import { getCurrentUser } from "@/lib/auth";
import { homeForRole, SIGN_IN_PATH } from "@/lib/routes";
import { getStore } from "@/lib/store";
import { canExportPdf, canViewHistory, historyScope, isRequesterHistory } from "@/lib/workflow";
import { PageHeader } from "@/components/page-header";

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect(SIGN_IN_PATH);
  if (!canViewHistory(user.role)) redirect(homeForRole(user.role));

  const scope = historyScope(user, await getStore().listUnits().catch(() => []));

  if (!scope.ok) {
    return (
      <div className="space-y-6">
        <Heading scopeLabel={null} isRequester={false} />
        <p className="rounded-lg border border-dashed p-10 text-center text-muted-foreground">
          {scope.reason}
        </p>
      </div>
    );
  }

  const isRequester = isRequesterHistory(user.role);

  // Requesters always see "all" of their own bookings (no "Handled by me" toggle).
  // Developer defaults to "all"; reviewers default to "me" (their own decisions).
  const defaultActor = scope.isOwnBookings ? "all" : user.role === "developer" ? "all" : "me";
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
      <Heading scopeLabel={scope.label} isRequester={isRequester} />
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
        isOwnBookings={scope.isOwnBookings}
        canExportPdf={canExportPdf(user.role)}
      />
    </div>
  );
}

function Heading({ scopeLabel, isRequester }: { scopeLabel: string | null; isRequester: boolean }) {
  return (
    <PageHeader title={isRequester ? "Booking History" : "Approval Log"}>
      {isRequester
        ? "A complete record of all your guest house booking requests and their status."
        : "Every request you have approved or rejected, and a searchable archive of past bookings."}
      {scopeLabel && <span className="ml-1 font-medium text-foreground">{scopeLabel}.</span>}
    </PageHeader>
  );
}
