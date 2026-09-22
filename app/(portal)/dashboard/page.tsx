import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
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
  const mealHouseNames = mealHouses.map((g) => g.name).join(" / ");

  // An erasure request already waiting on the office, if any.
  const openPrivacyRequest =
    (await store.listPrivacyRequests({ userId: user.id }).catch(() => [])).find((r) => r.status === "open") ?? null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="My Bookings"
        actions={
          <div className="flex flex-wrap gap-2">
            {canBookMeals && (
              <Button asChild variant="outline">
                <Link href="/book?service=meals_only">
                Meal Booking{mealHouseNames && ` (${mealHouseNames})`}
              </Link>
              </Button>
            )}
            <Button asChild>
              <Link href="/book">New Booking (Room)</Link>
            </Button>
          </div>
        }
      >
        Track your guest house requests through the approval pipeline.
      </PageHeader>
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
