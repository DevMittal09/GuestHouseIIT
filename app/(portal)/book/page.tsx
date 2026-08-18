import { redirect } from "next/navigation";
import { BookingForm } from "@/components/booking-form";
import { getCurrentUser } from "@/lib/auth";
import { getEffectiveFormConfig } from "@/lib/form-config-server";
import { homeForRole, OFFICIAL_EMAIL_WHITELIST } from "@/lib/routes";
import { getStore } from "@/lib/store";
import { REQUESTER_ROLES } from "@/lib/types";

export default async function BookPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  if (!REQUESTER_ROLES.includes(user.role)) redirect(homeForRole(user.role));
  if (user.role === "official" && !OFFICIAL_EMAIL_WHITELIST.includes(user.email)) {
    redirect("/dashboard");
  }

  const config = await getEffectiveFormConfig(user.role);
  const guestHouses = (await getStore().listGuestHouses()).filter((g) =>
    config.allowed_guest_house_ids.includes(g.id)
  );

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">New Booking Request</h1>
        <p className="text-muted-foreground">
          Fill in the stay and guest details — the request enters the approval pipeline for your
          role automatically.
        </p>
      </div>
      <BookingForm user={user} guestHouses={guestHouses} config={config} />
    </div>
  );
}
