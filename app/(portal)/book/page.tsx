import { redirect } from "next/navigation";
import { BookingForm } from "@/components/booking-form";
import { getCurrentUser } from "@/lib/auth";
import { getEffectiveFormConfig } from "@/lib/form-config-server";
import { homeForRole, SIGN_IN_PATH } from "@/lib/routes";
import { isWhitelistedOfficial } from "@/lib/settings";
import { getOfficialEmails } from "@/lib/settings-server";
import { bookingContextFor } from "@/lib/booking-context-server";
import { getStore } from "@/lib/store";
import { canBookOnBehalf } from "@/lib/access";
import { serviceTypesFor } from "@/lib/booking-types";
import { REQUESTER_ROLES, SERVICE_TYPE_LABELS, type ServiceType } from "@/lib/types";
import { firstBookableMealDate } from "@/lib/meals";
import { PageHeader } from "@/components/page-header";
import { AcademicDetailsCard } from "@/components/academic-details";

export default async function BookPage({
  searchParams,
}: {
  searchParams: Promise<{ service?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect(SIGN_IN_PATH);
  // The Guest House Manager is not a requester, but they take bookings at the
  // desk for people who never open the portal — the form asks them who the
  // stay is for and records both parties.
  const onBehalf = canBookOnBehalf(user.role);
  if (!REQUESTER_ROLES.includes(user.role) && !onBehalf) redirect(homeForRole(user.role));
  if (user.role === "official" && !isWhitelistedOfficial(user.email, await getOfficialEmails())) {
    redirect("/dashboard");
  }

  // The same context `createBooking` builds, so the form offers exactly what
  // the server accepts: Settings, debitable heads, projects, the HOD.
  const [config, context] = await Promise.all([
    getEffectiveFormConfig(user.role),
    bookingContextFor(user),
  ]);
  const guestHouses = (await getStore().listGuestHouses()).filter((g) =>
    config.allowed_guest_house_ids.includes(g.id)
  );

  // Meals and rooms are two doors onto the same form. `?service=meals_only`
  // is what the portal home's "Meal / Dining booking" button links to; an
  // unknown or ineligible value falls back to the ordinary room flow rather
  // than erroring, because a hand-edited URL is not worth a dead end.
  const { service } = await searchParams;
  const allowedServices = serviceTypesFor(
    user.role,
    guestHouses.some((g) => g.serves_meals)
  );
  const initialServiceType = allowedServices.includes(service as ServiceType)
    ? (service as ServiceType)
    : undefined;
  const mealsOnly = initialServiceType === "meals_only";

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title={
          mealsOnly
            ? SERVICE_TYPE_LABELS.meals_only
            : onBehalf
              ? "New Booking (on behalf of a guest)"
              : "New Booking Request"
        }
      >
        {mealsOnly
          ? "Meals at the guest house with no room booked. Tell the kitchen how many people, which days and whether it is vegetarian — it goes straight to the Guest House Manager. Each meal has to be booked before the previous one finishes being served."
          : onBehalf
            ? "Take a booking for someone who cannot use the portal themselves. It is recorded against your account and names them as the guest."
            : "Fill in the stay and guest details — the request enters the approval pipeline for your role automatically."}
      </PageHeader>
      {/* Who is asking, from the academic database. Outside the form because
          nothing in it is editable, and above it so the requester checks it
          first. */}
      <AcademicDetailsCard user={user} title="Requester details" />
      <BookingForm
        user={user}
        guestHouses={guestHouses}
        config={config}
        initialServiceType={initialServiceType}
        // Resolved here rather than in the form so the server-rendered page
        // and its hydration cannot land on different days — they would, for a
        // second either side of a meal's deadline.
        initialMealDate={firstBookableMealDate(new Date(), context.rules.meals.windows)}
        rules={context.rules}
        debitHeads={context.debitHeads}
        projects={context.projects}
        hodApprovers={context.hodApprovers}
      />
    </div>
  );
}
