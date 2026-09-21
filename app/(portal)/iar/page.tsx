import { redirect } from "next/navigation";
import { ReviewQueue } from "@/components/review-queue";
import { getCurrentUser } from "@/lib/auth";
import { homeForRole, SIGN_IN_PATH } from "@/lib/routes";
import { getStore } from "@/lib/store";
import { PageHeader } from "@/components/page-header";

export default async function IarPage() {
  const user = await getCurrentUser();
  if (!user) redirect(SIGN_IN_PATH);
  if (user.role !== "iar_cell") redirect(homeForRole(user.role));

  const bookings = await getStore().listBookings({ status: "PENDING_IAR" });

  return (
    <div className="space-y-7">
      <PageHeader eyebrow="IAR Office" title="Requests to verify">
        Requests raised by the IAR Student Cell — for an alumnus or for their office — awaiting
        your verification. Open one to check the alumnus&rsquo;s details against the uploaded
        Alumni ID card. Bookings you raise yourself go straight to the Guest House Manager.
      </PageHeader>
      <ReviewQueue
        bookings={bookings}
        emptyMessage="No requests awaiting IAR Office verification."
        showAlumniCard
      />
    </div>
  );
}
