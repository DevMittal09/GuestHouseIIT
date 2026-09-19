import Link from "next/link";
import { redirect } from "next/navigation";
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
import { canViewAllOccupancy } from "@/lib/access";
import { getCurrentUser } from "@/lib/auth";
import {
  MEAL_KEYS,
  MEAL_LABELS,
  MEAL_TIMES,
  mealsOn,
} from "@/lib/meals";
import { countBedGuests } from "@/lib/occupancy";
import { homeForRole } from "@/lib/routes";
import { getStore } from "@/lib/store";
import { formatDateValue, parseDateValue, toInstituteDateValue } from "@/lib/tz";
import { cn } from "@/lib/utils";
import {
  MEAL_PREFERENCE_LABELS,
  SERVICE_TYPE_LABELS,
  type BookingWithDetails,
  type MealKey,
  type MealPreference,
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
const CONFIRMED = new Set(["APPROVED", "OCCUPIED", "CANCELLATION_REQUESTED"]);

export default async function DailyMealsPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; gh?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  if (!canViewAllOccupancy(user.role)) redirect(homeForRole(user.role));

  const { date: rawDate, gh } = await searchParams;
  // An unparseable date in the URL falls back to today rather than showing an
  // empty table that looks like "no meals today".
  const day =
    rawDate && parseDateValue(rawDate) ? rawDate : toInstituteDateValue(new Date());

  const store = getStore();
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
  const confirmed = bookings.filter((b) => CONFIRMED.has(b.status));
  const provisional = bookings.filter((b) => !CONFIRMED.has(b.status));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Meals for {formatDateValue(day, { year: true })}</h1>
          <p className="text-muted-foreground">
            Head counts for the {current.name} kitchen, across every booking that asked for a meal
            on this day.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href={`/manager?gh=${encodeURIComponent(current.name)}`}>Back to the desk</Link>
        </Button>
      </div>

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
          const counts = headCount(confirmed, day, meal);
          const pending = headCount(provisional, day, meal);
          return (
            <Card key={meal}>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{MEAL_LABELS[meal]}</CardTitle>
                <CardDescription>{MEAL_TIMES[meal]}</CardDescription>
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
    </div>
  );
}

/** Guests eating one meal on one day, split by preference. */
function headCount(
  bookings: BookingWithDetails[],
  day: string,
  meal: MealKey
): Record<MealPreference | "unknown", number> {
  const counts = { veg: 0, non_veg: 0, unknown: 0 };
  for (const booking of bookings) {
    if (!mealsOn(booking.meals, day).includes(meal)) continue;
    // A meals-only booking has no guest rows, so its head count is the number
    // the requester gave. Everything else counts the guests needing a bed —
    // an infant shares a guardian's plate as well as their bed.
    const people =
      booking.service_type === "meals_only"
        ? (booking.meal_guest_count ?? 0)
        : countBedGuests(booking.guests);
    // A booking made before the preference existed is counted, not guessed at:
    // the kitchen would rather see "unspecified" than cook the wrong thing.
    counts[booking.meal_preference ?? "unknown"] += people;
  }
  return counts;
}

function MealBookingTable({
  title,
  description,
  bookings,
  day,
  muted = false,
}: {
  title: string;
  description: string;
  bookings: BookingWithDetails[];
  day: string;
  muted?: boolean;
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
