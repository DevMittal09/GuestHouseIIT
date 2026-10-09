import { redirect } from "next/navigation";
import { AvailabilityGrid } from "@/components/availability-grid";
import { getCurrentUser } from "@/lib/auth";
import { getStore } from "@/lib/store";
import { PageHeader } from "@/components/page-header";
import { SIGN_IN_PATH } from "@/lib/routes";

/** Open to every signed-in role - see `app/actions/availability.ts` for what each may see. */
export default async function AvailabilityPage() {
  const user = await getCurrentUser();
  if (!user) redirect(SIGN_IN_PATH);

  const guestHouses = await getStore().listGuestHouses();

  return (
    <div className="space-y-6">
      <PageHeader caption="All guest houses" title="Room Availability" />
      <AvailabilityGrid guestHouses={guestHouses} />
    </div>
  );
}
