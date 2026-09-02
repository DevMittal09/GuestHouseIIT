import { redirect } from "next/navigation";
import { AvailabilityGrid } from "@/components/availability-grid";
import { getCurrentUser } from "@/lib/auth";
import { getStore } from "@/lib/store";

/** Open to every signed-in role — see `app/actions/availability.ts` for what each may see. */
export default async function AvailabilityPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");

  const guestHouses = await getStore().listGuestHouses();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Room Availability</h1>
        <p className="text-muted-foreground">
          Check which rooms are free before you request a booking. Pick a guest house and a date to
          see every room&rsquo;s occupancy across the day.
        </p>
      </div>
      <AvailabilityGrid guestHouses={guestHouses} />
    </div>
  );
}
