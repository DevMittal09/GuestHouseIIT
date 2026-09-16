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
        <h1 className="text-2xl font-semibold tracking-tight">IAR Office Portal</h1>
        <p className="text-muted-foreground">
          Requests raised by the IAR Student Cell — for an alumnus or for their office — awaiting
          your verification. Open one to check the alumnus&rsquo;s details against the uploaded
          Alumni ID card. Bookings you raise yourself go straight to the Guest House Manager.
        </p>
      </div>
      <ReviewQueue
        bookings={bookings}
        emptyMessage="No requests awaiting IAR Office verification."
        showAlumniCard
      />
    </div>
  );
}
