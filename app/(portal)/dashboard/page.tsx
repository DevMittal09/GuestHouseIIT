import Link from "next/link";
import { redirect } from "next/navigation";
import {
  BadgeCheck,
  BedDouble,
  CalendarCheck2,
  CalendarPlus,
  Hourglass,
  Layers,
  LifeBuoy,
  UtensilsCrossed,
} from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { MyBookings } from "@/components/my-bookings";
import { PageHeader } from "@/components/page-header";
import { StatGrid, StatTile } from "@/components/portal/stat-tiles";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth";
import { isInReview } from "@/lib/booking-progress";
import { serviceTypesFor } from "@/lib/booking-types";
import { getEffectiveFormConfig } from "@/lib/form-config-server";
import { MANAGER_HELP_LINE } from "@/lib/policy";
import { homeForRole, SIGN_IN_PATH } from "@/lib/routes";
import { getStore } from "@/lib/store";
import { formatDateValue, formatInstituteTime, toInstituteDateValue } from "@/lib/tz";
import { REQUESTER_ROLES, type BookingWithDetails } from "@/lib/types";
import { stayPhase } from "@/lib/workflow";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect(SIGN_IN_PATH);
  if (!REQUESTER_ROLES.includes(user.role)) redirect(homeForRole(user.role));

  const store = getStore();
  const [bookings, config, guestHouses] = await Promise.all([
    store.listBookingsForUser(user.id),
    getEffectiveFormConfig(user.role),
    store.listGuestHouses(),
  ]);
  const now = new Date();

  // Meals get their own door rather than living inside "New Booking": a
  // department booking lunch for a visiting examiner has no room to ask for,
  // and having to start a room booking to find the option was the complaint.
  // Meals chosen *alongside* a room are not here — they belong to the room
  // booking, and appear once a guest house with a kitchen has been picked.
  const mealHouses = guestHouses.filter(
    (g) => g.serves_meals && config.allowed_guest_house_ids.includes(g.id)
  );
  const canBookMeals = serviceTypesFor(user.role, mealHouses.length > 0).includes("meals_only");
  // Named after the kitchen, because that is the question the requester is
  // actually answering — never hardcoded to "Hamsanandi", which is a flag the
  // developer console can move.
  const mealHouseNames = mealHouses.map((g) => g.name).join(" / ");

  const inReview = bookings.filter((b) => isInReview(b.status)).length;
  const confirmed = bookings.filter((b) =>
    ["APPROVED", "OCCUPIED", "CANCELLATION_REQUESTED"].includes(b.status)
  ).length;
  const completed = bookings.filter((b) => b.status === "VACATED").length;

  // The stay to put first: one under way, else the soonest confirmed one.
  const next = bookings
    .filter((b) => (b.status === "APPROVED" || b.status === "OCCUPIED") && stayPhase(b, now) !== "past")
    .sort((a, b) => a.check_in.localeCompare(b.check_in))[0];

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="My bookings"
        title="Your stays"
        actions={
          <>
            {canBookMeals && (
              <Button asChild variant="outline">
                <Link href="/book?service=meals_only">
                  <UtensilsCrossed data-icon="inline-start" />
                  Meal booking{mealHouseNames && ` (${mealHouseNames})`}
                </Link>
              </Button>
            )}
            <Button asChild variant="brand">
              <Link href="/book">
                <CalendarPlus data-icon="inline-start" />
                New booking (room)
              </Link>
            </Button>
          </>
        }
      >
        Track your guest house requests through the approval pipeline.
      </PageHeader>

      {bookings.length === 0 ? (
        <EmptyState
          icon={BedDouble}
          title="No bookings yet"
          action={
            <Button asChild variant="brand">
              <Link href="/book">Plan your first stay</Link>
            </Button>
          }
        >
          Raise a request with your dates and guests — it will appear here as it moves through
          approval.
        </EmptyState>
      ) : (
        <>
          <StatGrid>
            <StatTile icon={Hourglass} tone="sky" label="In review" value={inReview} hint="Waiting on an approver" />
            <StatTile icon={CalendarCheck2} tone="emerald" label="Confirmed" value={confirmed} hint="Rooms allotted" />
            <StatTile icon={BadgeCheck} tone="violet" label="Completed stays" value={completed} />
            <StatTile icon={Layers} tone="ink" label="All requests" value={bookings.length} />
          </StatGrid>

          {next && <NextStay booking={next} now={now} />}

          <MyBookings bookings={bookings} />
        </>
      )}

      {/* The way out when the form will not do what the requester needs — a
          stay over the 14-night cap, an exception, a booking taken at the
          desk. Values live in `lib/policy.ts`. */}
      <p className="flex items-start gap-3 rounded-2xl bg-card px-4 py-3.5 text-sm text-body shadow-soft ring-1 ring-border">
        <LifeBuoy aria-hidden className="mt-0.5 size-4 shrink-0 text-vermilion" />
        {MANAGER_HELP_LINE}
      </p>
    </div>
  );
}

function NextStay({ booking, now }: { booking: BookingWithDetails; now: Date }) {
  const current = stayPhase(booking, now) === "current";
  const day = toInstituteDateValue(booking.check_in);
  const today = toInstituteDateValue(now);
  const daysAway = Math.round(
    (Date.parse(`${day}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000
  );
  const when = current
    ? "Your stay is under way"
    : daysAway === 0
      ? "Arriving today"
      : daysAway === 1
        ? "Arriving tomorrow"
        : `Arriving in ${daysAway} days`;

  return (
    <section
      aria-label="Your next stay"
      className="relative isolate overflow-hidden rounded-3xl bg-ink p-[clamp(22px,3.5vw,36px)] text-white shadow-lift"
    >
      <div aria-hidden className="emblem-watermark absolute -top-16 -right-16 -z-10 size-72 opacity-[0.08]" />
      <div aria-hidden className="absolute -bottom-32 -left-20 -z-10 size-80 rounded-full bg-vermilion/30 blur-[100px]" />
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div className="min-w-0">
          <p className="inline-flex items-center gap-2 text-[11px] font-bold tracking-[0.18em] text-saffron uppercase">
            <span aria-hidden className="size-1.5 rounded-full bg-saffron" />
            {when}
          </p>
          <h2 className="mt-3 text-[clamp(30px,4vw,44px)] leading-none font-semibold">
            {booking.guest_house.name}
          </h2>
          <p className="mt-2 font-mono text-[12.5px] text-white/50">{booking.booking_reference_id}</p>
        </div>
        <dl className="grid grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-3">
          <div>
            <dt className="text-[10.5px] font-bold tracking-[0.14em] text-white/50 uppercase">Check-in</dt>
            <dd className="mt-1 font-heading text-[19px] font-semibold">
              {formatDateValue(toInstituteDateValue(booking.check_in))}
            </dd>
            <dd className="text-[13px] text-white/60">{formatInstituteTime(booking.check_in)}</dd>
          </div>
          <div>
            <dt className="text-[10.5px] font-bold tracking-[0.14em] text-white/50 uppercase">Check-out</dt>
            <dd className="mt-1 font-heading text-[19px] font-semibold">
              {formatDateValue(toInstituteDateValue(booking.check_out))}
            </dd>
            <dd className="text-[13px] text-white/60">{formatInstituteTime(booking.check_out)}</dd>
          </div>
          <div>
            <dt className="text-[10.5px] font-bold tracking-[0.14em] text-white/50 uppercase">Rooms</dt>
            <dd className="mt-1 font-heading text-[19px] font-semibold">
              {booking.assigned_rooms.map((r) => r.room_number).join(", ") || booking.rooms_requested}
            </dd>
          </div>
        </dl>
      </div>
    </section>
  );
}
