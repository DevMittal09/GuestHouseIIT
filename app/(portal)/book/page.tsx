import { redirect } from "next/navigation";
import { BookingForm } from "@/components/booking-form";
import { getCurrentUser } from "@/lib/auth";
import { getEffectiveFormConfig } from "@/lib/form-config-server";
import { homeForRole, OFFICIAL_EMAIL_WHITELIST, SIGN_IN_PATH } from "@/lib/routes";
import { getStore } from "@/lib/store";
import { canBookOnBehalf } from "@/lib/access";
import { REQUESTER_ROLES } from "@/lib/types";
import { PageHeader } from "@/components/page-header";

export default async function BookPage() {
  const user = await getCurrentUser();
  if (!user) redirect(SIGN_IN_PATH);
  // The Guest House Manager is not a requester, but they take bookings at the
  // desk for people who never open the portal — the form asks them who the
  // stay is for and records both parties.
  const onBehalf = canBookOnBehalf(user.role);
  if (!REQUESTER_ROLES.includes(user.role) && !onBehalf) redirect(homeForRole(user.role));
  if (user.role === "official" && !OFFICIAL_EMAIL_WHITELIST.includes(user.email)) {
    redirect("/dashboard");
  }

  const config = await getEffectiveFormConfig(user.role);
  const guestHouses = (await getStore().listGuestHouses()).filter((g) =>
    config.allowed_guest_house_ids.includes(g.id)
  );

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title={onBehalf ? "New Booking (on behalf of a guest)" : "New Booking Request"}
      >
        {onBehalf
          ? "Take a booking for someone who cannot use the portal themselves. It is recorded against your account and names them as the guest."
          : "Fill in the stay and guest details — the request enters the approval pipeline for your role automatically."}
      </PageHeader>
      <BookingForm user={user} guestHouses={guestHouses} config={config} />
    </div>
  );
}
