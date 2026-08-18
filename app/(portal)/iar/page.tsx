import { redirect } from "next/navigation";
import { ReviewQueue } from "@/components/review-queue";
import { getCurrentUser } from "@/lib/auth";
import { homeForRole } from "@/lib/routes";
import { getStore } from "@/lib/store";

export default async function IarPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  if (user.role !== "iar_cell") redirect(homeForRole(user.role));

  const bookings = await getStore().listBookings({ status: "PENDING_IAR" });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">IAR Cell Portal</h1>
        <p className="text-muted-foreground">
          Alumni booking requests awaiting verification — open a request to preview the uploaded
          Alumni ID card.
        </p>
      </div>
      <ReviewQueue bookings={bookings} emptyMessage="No pending alumni requests." showAlumniCard />
    </div>
  );
}
