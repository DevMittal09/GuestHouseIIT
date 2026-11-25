import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { canIssueInvoices } from "@/lib/access";
import { InvoiceDialog } from "@/components/invoice-dialog";
import { getCurrentUser } from "@/lib/auth";
import {
  describeDietCounts,
  MEAL_KEYS,
  MEAL_LABELS,
  mealDietCounts,
} from "@/lib/meals";
import type { MealKey } from "@/lib/types";
import { homeForRole, SIGN_IN_PATH } from "@/lib/routes";
import { getStore } from "@/lib/store";
import {
  addDaysToDateValue,
  formatDateValue,
  formatMonthOfDateValue,
  parseDateValue,
  toInstituteDateValue,
  weekdayOfDateValue,
} from "@/lib/tz";
import { EmptyState } from "@/components/section-heading";
import type { BookingWithDetails } from "@/lib/types";
import type { InvoiceRecord } from "@/lib/invoice";

type PeriodMode = "week" | "month";

function startOfWeek(value: string): string {
  const dow = weekdayOfDateValue(value);
  const diff = (dow - 1 + 7) % 7;
  return addDaysToDateValue(value, -diff);
}

function endOfWeek(weekStart: string): string {
  return addDaysToDateValue(weekStart, 6);
}

function startOfMonth(value: string): string {
  const p = parseDateValue(value);
  if (!p) return value;
  return `${p.year}-${String(p.month).padStart(2, "0")}-01`;
}

function endOfMonth(value: string): string {
  const p = parseDateValue(value);
  if (!p) return value;
  const last = new Date(Date.UTC(p.year, p.month, 0)).getUTCDate();
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
}

function resolvePeriod(
  anchor: string,
  mode: PeriodMode
): { from: string; to: string } {
  if (mode === "month") {
    return { from: startOfMonth(anchor), to: endOfMonth(anchor) };
  }
  const ws = startOfWeek(anchor);
  return { from: ws, to: endOfWeek(ws) };
}

function shiftPeriod(
  anchor: string,
  mode: PeriodMode,
  direction: -1 | 1
): string {
  if (mode === "month") {
    const p = parseDateValue(anchor)!;
    const d = new Date(Date.UTC(p.year, p.month - 1 + direction, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
  }
  return addDaysToDateValue(startOfWeek(anchor), direction * 7);
}

function periodLabel(from: string, to: string, mode: PeriodMode): string {
  if (mode === "month") return formatMonthOfDateValue(from);
  return `${formatDateValue(from, { year: true })} - ${formatDateValue(to, { year: true })}`;
}

function lastMealDate(booking: BookingWithDetails): string | null {
  if (booking.meals.length === 0) return null;
  return [...booking.meals].sort((a, b) => b.date.localeCompare(a.date))[0].date;
}

function mealSummary(booking: BookingWithDetails): string {
  const counts = Object.fromEntries(MEAL_KEYS.map((k) => [k, 0])) as Record<MealKey, number>;
  for (const day of booking.meals) {
    for (const key of MEAL_KEYS) {
      if (day[key]) counts[key]++;
    }
  }
  return MEAL_KEYS
    .filter((k) => counts[k] > 0)
    .map((k) => `${MEAL_LABELS[k]} (${counts[k]}d)`)
    .join(", ");
}

export default async function MealLogsPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string; anchor?: string; gh?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect(SIGN_IN_PATH);
  if (!canIssueInvoices(user.role)) redirect(homeForRole(user.role));

  const { mode: rawMode, anchor: rawAnchor, gh } = await searchParams;
  const mode: PeriodMode = rawMode === "month" ? "month" : "week";
  const today = toInstituteDateValue(new Date());
  const anchor =
    rawAnchor && parseDateValue(rawAnchor) ? rawAnchor : today;

  const { from, to } = resolvePeriod(anchor, mode);

  const store = getStore();
  const guestHouses = (await store.listGuestHouses()).filter(
    (g) => g.serves_meals
  );
  if (guestHouses.length === 0) {
    return (
      <EmptyState>
        No guest house serves meals yet. A developer can turn meals on for one
        in Guest Houses &amp; Rooms.
      </EmptyState>
    );
  }
  const current =
    guestHouses.find(
      (g) => g.name.toLowerCase() === (gh ?? "").toLowerCase()
    ) ?? guestHouses[0];

  const [approved, vacated] = await Promise.all([
    store.listBookings({ status: "APPROVED", guestHouseId: current.id }),
    store.listBookings({ status: "VACATED", guestHouseId: current.id }),
  ]);
  const allDining = [...approved, ...vacated].filter(
    (b) => b.service_type === "meals_only"
  );

  const inRange = allDining.filter((b) => {
    const last = lastMealDate(b);
    return last !== null && last >= from && last <= to;
  });
  inRange.sort((a, b) => {
    const aLast = lastMealDate(a) ?? "";
    const bLast = lastMealDate(b) ?? "";
    return aLast.localeCompare(bLast);
  });

  const invoices: InvoiceRecord[] = inRange.length
    ? await store
        .listInvoices({ bookingIds: inRange.map((b) => b.id) })
        .catch(() => [])
    : [];
  const invoiceByBooking = new Map<string, InvoiceRecord>();
  for (const inv of invoices) {
    if (inv.status === "cancelled") continue;
    const existing = invoiceByBooking.get(inv.booking_id);
    if (
      !existing ||
      (inv.issued_at ?? "") > (existing.issued_at ?? "")
    ) {
      invoiceByBooking.set(inv.booking_id, inv);
    }
  }

  const prevAnchor = shiftPeriod(anchor, mode, -1);
  const nextAnchor = shiftPeriod(anchor, mode, 1);

  function navUrl(overrides: Record<string, string>): string {
    const params = new URLSearchParams({
      mode,
      anchor,
      gh: current.name,
      ...overrides,
    });
    return `/manager/meal-logs?${params.toString()}`;
  }

  const back =
    user.role === "gh_caretaker"
      ? {
          href: `/caretaker?gh=${encodeURIComponent(current.name)}`,
          label: "Back to reception",
        }
      : user.role === "gh_manager"
        ? {
            href: `/manager?gh=${encodeURIComponent(current.name)}`,
            label: "Back to the desk",
          }
        : { href: homeForRole(user.role), label: "Back" };

  return (
    <div className="space-y-6">
      <PageHeader
        caption={`${current.name} · Meal booking logs`}
        title="Meal Booking Logs"
        actions={
          <Button asChild variant="outline">
            <Link href={back.href}>{back.label}</Link>
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-3 rounded-lg border p-4">
        {guestHouses.length > 1 && (
          <form className="flex items-end gap-2" method="get">
            <input type="hidden" name="mode" value={mode} />
            <input type="hidden" name="anchor" value={anchor} />
            <select
              id="gh"
              name="gh"
              defaultValue={current.name}
              className="h-9 rounded-md border bg-transparent px-3 text-sm"
            >
              {guestHouses.map((g) => (
                <option key={g.id} value={g.name}>
                  {g.name}
                </option>
              ))}
            </select>
            <Button type="submit" size="sm">
              Show
            </Button>
          </form>
        )}

        <div className="flex items-center gap-2 ml-auto">
          <Button asChild variant="outline" size="sm">
            <Link href={navUrl({ mode: "week" })}>Week</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href={navUrl({ mode: "month" })}>Month</Link>
          </Button>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <Button asChild variant="ghost" size="sm">
          <Link href={navUrl({ anchor: prevAnchor })}>
            &larr; Previous
          </Link>
        </Button>
        <span className="font-semibold text-sm">
          {periodLabel(from, to, mode)}
        </span>
        <Button asChild variant="ghost" size="sm">
          <Link href={navUrl({ anchor: nextAnchor })}>
            Next &rarr;
          </Link>
        </Button>
      </div>

      {inRange.length === 0 ? (
        <EmptyState>No meal bookings in this period.</EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Reference</TableHead>
                <TableHead>Requester</TableHead>
                <TableHead>People</TableHead>
                <TableHead>Preference</TableHead>
                <TableHead>Meal dates</TableHead>
                <TableHead>Meals</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Invoice</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {inRange.map((b) => {
                const people = b.meal_guest_count ?? 0;
                const inv = invoiceByBooking.get(b.id);
                const invStatus = inv
                  ? inv.status === "paid"
                    ? "Paid"
                    : inv.status === "issued"
                      ? "Issued"
                      : "Draft"
                  : "-";
                return (
                  <TableRow key={b.id}>
                    <TableCell className="font-mono text-xs">
                      {b.booking_reference_id}
                    </TableCell>
                    <TableCell>
                      <span className="font-medium">
                        {b.on_behalf_of_name ?? b.requester.full_name}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {b.requester.email}
                      </span>
                    </TableCell>
                    <TableCell>{people}</TableCell>
                    <TableCell className="text-xs">
                      {(() => {
                        const split = mealDietCounts(b, people);
                        return split ? describeDietCounts(split) : "-";
                      })()}
                    </TableCell>
                    <TableCell className="text-xs">
                      {b.meals
                        .map((d) => formatDateValue(d.date))
                        .join(", ")}
                    </TableCell>
                    <TableCell className="text-xs">
                      {mealSummary(b)}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={b.status} />
                    </TableCell>
                    <TableCell className="text-xs">{invStatus}</TableCell>
                    <TableCell className="text-right">
                      {!inv || inv.status === "draft" ? (
                        <InvoiceDialog booking={b} />
                      ) : null}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Showing {inRange.length} meal booking{inRange.length !== 1 ? "s" : ""}{" "}
        at {current.name} whose last meal date falls between{" "}
        {formatDateValue(from, { year: true })} and{" "}
        {formatDateValue(to, { year: true })}.
      </p>
    </div>
  );
}
