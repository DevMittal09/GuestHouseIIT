import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, BedDouble, UsersRound, UtensilsCrossed, type LucideIcon } from "lucide-react";
import { MyBookings, type MyInvoice } from "@/components/my-bookings";
import { MyData } from "@/components/my-data";
import { PageHeader } from "@/components/page-header";
import { getCurrentUser } from "@/lib/auth";
import { serviceTypesFor } from "@/lib/booking-types";
import { getEffectiveFormConfig } from "@/lib/form-config-server";
import { MANAGER_HELP_LINE } from "@/lib/policy";
import { homeForRole, SIGN_IN_PATH } from "@/lib/routes";
import { getStore } from "@/lib/store";
import { REQUESTER_ROLES } from "@/lib/types";
import { clubBookingNotice, mustBookThroughFacultyInCharge } from "@/lib/club-booking";
import { clubsBookableByUser, facultyInChargeForClub } from "@/lib/club-booking-server";
import { joinNames } from "@/lib/site-content";
import { cn } from "@/lib/utils";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect(SIGN_IN_PATH);
  // Requesters, and a club's faculty in-charge, whose list is the bookings
  // they raised for their clubs (`listBookingsForUser` includes those).
  const clubs = await clubsBookableByUser(user);
  if (!REQUESTER_ROLES.includes(user.role) && clubs.length === 0) redirect(homeForRole(user.role));
  const clubAccount = mustBookThroughFacultyInCharge(user.role);
  const booksForSelf = REQUESTER_ROLES.includes(user.role) && !clubAccount;

  const store = getStore();
  const [bookings, config, guestHouses] = await Promise.all([
    store.listBookingsForUser(user.id),
    getEffectiveFormConfig(user.role),
    store.listGuestHouses(),
  ]);
  // Issued invoices, to download (Phase 5). Before migration 19 there are none.
  const invoices: Record<string, MyInvoice> = {};
  if (bookings.length > 0) {
    const rows = await store.listInvoices({ bookingIds: bookings.map((b) => b.id) }).catch(() => []);
    for (const i of rows) {
      if ((i.status === "issued" || i.status === "paid") && i.invoice_number) {
        invoices[i.booking_id] = { id: i.id, number: i.invoice_number, paid: i.status === "paid" };
      }
    }
  }

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
  const mealHouseNames = joinNames(mealHouses.map((g) => g.name));

  // An erasure request already waiting on the office, if any.
  const openPrivacyRequest =
    (await store.listPrivacyRequests({ userId: user.id }).catch(() => [])).find((r) => r.status === "open") ?? null;

  const roomHouseNames = joinNames(
    guestHouses.filter((g) => config.allowed_guest_house_ids.includes(g.id)).map((g) => g.name)
  );

  return (
    <div className="space-y-6">
      <PageHeader title="My Bookings">
        Track your guest house requests through the approval pipeline.
      </PageHeader>
      {/* The two ways in, as large tiles rather than header buttons: people
          came to this page to book, and small outlined buttons at the far
          end of the title were being missed. */}
      {(booksForSelf || clubs.length > 0) && (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(280px,100%),1fr))] gap-3">
          {booksForSelf && (
            <BookingDoor
              href="/book"
              icon={BedDouble}
              tone="brand"
              title="New room booking"
              detail={
                roomHouseNames
                  ? `Rooms at ${roomHouseNames} — dates, guests and meals in one request`
                  : "Dates, guests and meals in one request"
              }
            />
          )}
          {booksForSelf && canBookMeals && (
            <BookingDoor
              href="/book?service=meals_only"
              icon={UtensilsCrossed}
              tone="ink"
              title="Meal booking"
              detail={`Meals only${mealHouseNames ? ` at ${mealHouseNames}` : ""} — no room needed`}
            />
          )}
          {/* A faculty in-charge books for each of their clubs. */}
          {clubs.map((c) => (
            <BookingDoor
              key={c.id}
              href={`/book?for=${encodeURIComponent(c.id)}`}
              icon={UsersRound}
              tone={booksForSelf ? "outline" : "brand"}
              title={`Book for ${c.full_name}`}
              detail="As its Faculty Advisor — goes straight to the Guest House Manager"
            />
          ))}
        </div>
      )}
      {/* A club's account follows its bookings but does not raise them. */}
      {clubAccount && (
        <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          {clubBookingNotice(await facultyInChargeForClub(user))}
        </p>
      )}
      <MyBookings bookings={bookings} invoices={invoices} />
      {/* DPDP (Phase 8): take a copy, or ask the office to erase it. */}
      <MyData openRequest={openPrivacyRequest} />
      {/* The way out when the form will not do what the requester needs — a
          stay over the 14-night cap, an exception, a booking taken at the
          desk. Values live in `lib/policy.ts`. */}
      <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
        {MANAGER_HELP_LINE}
      </p>
    </div>
  );
}

const DOOR_TONES = {
  brand: "bg-vermilion-deep text-white hover:bg-vermilion-hover",
  ink: "bg-ink text-white hover:bg-ink-soft",
  outline: "border border-ink bg-white text-ink hover:bg-ink hover:text-white",
} as const;

/** A large, unmissable way into the booking form. */
function BookingDoor({
  href,
  icon: Icon,
  tone,
  title,
  detail,
}: {
  href: string;
  icon: LucideIcon;
  tone: keyof typeof DOOR_TONES;
  title: string;
  detail: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "group flex items-center gap-4 rounded-[4px] px-5 py-[18px] no-underline transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-vermilion",
        DOOR_TONES[tone]
      )}
    >
      <span
        aria-hidden
        className={cn(
          "flex size-12 shrink-0 items-center justify-center rounded-[3px]",
          tone === "outline" ? "bg-band text-ink group-hover:bg-white/10 group-hover:text-white" : "bg-white/15"
        )}
      >
        <Icon className="size-6" strokeWidth={1.75} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-heading text-[21px] leading-tight font-semibold">{title}</span>
        <span className="mt-1 block text-[14px] leading-snug">{detail}</span>
      </span>
      <ArrowRight
        aria-hidden
        className="size-5 shrink-0 transition-transform duration-200 motion-safe:group-hover:translate-x-1"
      />
    </Link>
  );
}
