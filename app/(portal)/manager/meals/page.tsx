import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { canIssueInvoices, canViewAllOccupancy } from "@/lib/access";
import { InvoiceDialog } from "@/components/invoice-dialog";
import { getCurrentUser } from "@/lib/auth";
import {
  isKitchenConfirmed,
  kitchenHeadCount,
  MEAL_KEYS,
  MEAL_LABELS,
  mealTimes,
  mealsOn,
} from "@/lib/meals";
import { getRules } from "@/lib/settings-server";
import { countBedGuests } from "@/lib/occupancy";
import { homeForRole, SIGN_IN_PATH } from "@/lib/routes";
import { getStore } from "@/lib/store";
import { formatDateValue, parseDateValue, toInstituteDateValue } from "@/lib/tz";
import { cn } from "@/lib/utils";
import {
  MEAL_PREFERENCE_LABELS,
  SERVICE_TYPE_LABELS,
  type BookingWithDetails,
} from "@/lib/types";

/**
 * What the kitchen is cooking on one day.
 *
 * The booking form asks for meals per day, but nobody cooks per booking — the
 * kitchen needs "how many vegetarian lunches on the 18th", which means
 * crossing every booking that touches that date. This is that view.
 *
 * Only bookings that are actually going ahead are counted. A request still
 * waiting on a warden may never happen, and cooking for it would be cooking
 * for nobody; it is listed separately so the manager can see it coming.
 */
export default async function DailyMealsPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; gh?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect(SIGN_IN_PATH);
  if (!canViewAllOccupancy(user.role)) redirect(homeForRole(user.role));

  const { date: rawDate, gh } = await searchParams;
  // An unparseable date in the URL falls back to today rather than showing an
  // empty table that looks like "no meals today".
  const day =
    rawDate && parseDateValue(rawDate) ? rawDate : toInstituteDateValue(new Date());

  const store = getStore();
  // The kitchen's serving times as the office set them in Settings.
  const times = mealTimes((await getRules()).meals.windows);
  const guestHouses = (await store.listGuestHouses()).filter((g) => g.serves_meals);
  if (guestHouses.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-10 text-center text-muted-foreground">
        No guest house serves meals yet. A developer can turn meals on for one in Guest Houses &amp;
        Rooms.
      </p>
    );
  }
  const current =
    guestHouses.find((g) => g.name.toLowerCase() === (gh ?? "").toLowerCase()) ?? guestHouses[0];

  const bookings = await store.listBookingsWithMealsOn(day, current.id);
  const confirmed = bookings.filter((b) => isKitchenConfirmed(b.status));
  const provisional = bookings.filter((b) => !isKitchenConfirmed(b.status));
  const canInvoice = canIssueInvoices(user.role);

  // Dining bookings whose meals have started and that have no live invoice
  // yet: the desk bills them here, as it bills stays from the reception list.
  const today = toInstituteDateValue(new Date());
  let toInvoice: BookingWithDetails[] = [];
  if (canInvoice) {
    const dining = (await store.listBookings({ status: "APPROVED", guestHouseId: current.id })).filter(
      (b) => b.service_type === "meals_only" && [...b.meals].map((d) => d.date).sort()[0] <= today
    );
    const invoices = dining.length
      ? await store.listInvoices({ bookingIds: dining.map((b) => b.id) }).catch(() => [])
      : [];
    const invoiced = new Set(invoices.filter((i) => i.status === "issued" || i.status === "paid").map((i) => i.booking_id));
    toInvoice = dining.filter((b) => !invoiced.has(b.id));
  }

  // Back to wherever this person works: reception reaches this page too, and
  // the manager's console would only bounce the caretaker to their home page.
  const back =
    user.role === "gh_caretaker"
      ? { href: `/caretaker?gh=${encodeURIComponent(current.name)}`, label: "Back to reception" }
      : user.role === "gh_manager"
        ? { href: `/manager?gh=${encodeURIComponent(current.name)}`, label: "Back to the desk" }
        : { href: homeForRole(user.role), label: "Back" };

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Meals for ${formatDateValue(day, { year: true })}`}
        actions={
          <Button asChild variant="outline">
            <Link href={back.href}>{back.label}</Link>
          </Button>
        }
      >
        Head counts for the {current.name} kitchen, across every booking that asked for a meal on
        this day.
      </PageHeader>

      {/* A plain GET form: the date and guest house live in the URL, so a
          particular day can be bookmarked or sent to the kitchen. */}
      <form className="flex flex-wrap items-end gap-3 rounded-lg border p-4" method="get">
        <div className="space-y-2">
          <Label htmlFor="date">Date</Label>
          <Input id="date" name="date" type="date" defaultValue={day} />
        </div>
        {guestHouses.length > 1 && (
          <div className="space-y-2">
            <Label htmlFor="gh">Guest house</Label>
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
          </div>
        )}
        <Button type="submit">Show</Button>
      </form>

      <div className="grid gap-4 sm:grid-cols-3">
        {MEAL_KEYS.map((meal) => {
          const counts = kitchenHeadCount(confirmed, day, meal);
          const pending = kitchenHeadCount(provisional, day, meal);
          return (
            <Card key={meal}>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{MEAL_LABELS[meal]}</CardTitle>
                <CardDescription>{times[meal]}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-1">
                <p className="text-3xl font-semibold">{counts.veg + counts.non_veg + counts.unknown}</p>
                <p className="text-sm text-muted-foreground">
                  {counts.veg} vegetarian · {counts.non_veg} non-vegetarian
                  {counts.unknown > 0 && ` · ${counts.unknown} unspecified`}
                </p>
                {pending.veg + pending.non_veg + pending.unknown > 0 && (
                  <p className="text-xs text-amber-700 dark:text-amber-400">
                    + {pending.veg + pending.non_veg + pending.unknown} not yet approved
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <MealBookingTable
        title="Confirmed"
        description="Approved or already in the building. These are the ones to cook for."
        bookings={confirmed}
        day={day}
        canInvoice={canInvoice}
      />

      {provisional.length > 0 && (
        <MealBookingTable
          title="Not yet approved"
          description="Still in the approval chain. Not counted in the totals above — they may not happen."
          bookings={provisional}
          day={day}
          muted
        />
      )}

      {canInvoice && (
        <section>
          <h2 className="text-lg font-semibold">
            Dining to invoice{" "}
            <Badge variant="secondary" className="align-middle">
              {toInvoice.length}
            </Badge>
          </h2>
          <p className="mb-3 text-sm text-muted-foreground">
            Meals-only bookings at {current.name} whose meals have begun and that have no invoice yet. Correct
            the counts to what the kitchen served, then issue.
          </p>
          {toInvoice.length === 0 ? (
            <p className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">Nothing waiting.</p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {toInvoice.map((b) => (
                <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                  <span>
                    <span className="font-mono text-xs">{b.booking_reference_id}</span>{" "}
                    <span className="font-medium">{b.on_behalf_of_name ?? b.requester.full_name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {b.meal_guest_count ?? 0} people · {b.meals.map((d) => formatDateValue(d.date)).join(", ")}
                    </span>
                  </span>
                  <InvoiceDialog booking={b} />
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

function MealBookingTable({
  title,
  description,
  bookings,
  day,
  muted = false,
  canInvoice = false,
}: {
  title: string;
  description: string;
  bookings: BookingWithDetails[];
  day: string;
  muted?: boolean;
  canInvoice?: boolean;
}) {
  return (
    <section>
      <h2 className="text-lg font-semibold">
        {title}{" "}
        <Badge variant={muted ? "outline" : "secondary"} className="align-middle">
          {bookings.length}
        </Badge>
      </h2>
      <p className="mb-3 text-sm text-muted-foreground">{description}</p>
      {bookings.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
          Nothing to serve.
        </p>
      ) : (
        <div className={cn("overflow-x-auto rounded-lg border", muted && "opacity-80")}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Reference</TableHead>
                <TableHead>Requester</TableHead>
                <TableHead>Kind</TableHead>
                <TableHead>Guests</TableHead>
                <TableHead>Preference</TableHead>
                <TableHead>Meals</TableHead>
                <TableHead>Status</TableHead>
                {canInvoice && <TableHead />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {bookings.map((b) => {
                const people =
                  b.service_type === "meals_only"
                    ? (b.meal_guest_count ?? 0)
                    : countBedGuests(b.guests);
                return (
                  <TableRow key={b.id}>
                    <TableCell className="font-mono text-xs">{b.booking_reference_id}</TableCell>
                    <TableCell>
                      <span className="font-medium">
                        {b.on_behalf_of_name ?? b.requester.full_name}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {b.requester.email}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs">{SERVICE_TYPE_LABELS[b.service_type]}</TableCell>
                    <TableCell>{people}</TableCell>
                    <TableCell>
                      {b.meal_preference ? MEAL_PREFERENCE_LABELS[b.meal_preference] : "—"}
                    </TableCell>
                    <TableCell>
                      {mealsOn(b.meals, day)
                        .map((meal) => MEAL_LABELS[meal])
                        .join(", ")}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={b.status} />
                    </TableCell>
                    {canInvoice && (
                      <TableCell className="text-right">
                        {b.service_type === "meals_only" && <InvoiceDialog booking={b} />}
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}
