import { redirect } from "next/navigation";
import { BellRing, CalendarCheck2, ShieldCheck, UtensilsCrossed } from "lucide-react";
import { AcademicDetailsCard } from "@/components/academic-details";
import { BookingForm } from "@/components/booking-form";
import { PageHeader } from "@/components/page-header";
import { canBookOnBehalf } from "@/lib/access";
import { getCurrentUser } from "@/lib/auth";
import { serviceTypesFor } from "@/lib/booking-types";
import { getEffectiveFormConfig } from "@/lib/form-config-server";
import { homeForRole, OFFICIAL_EMAIL_WHITELIST, SIGN_IN_PATH } from "@/lib/routes";
import { parseStayQuery } from "@/lib/stay-query";
import { getStore } from "@/lib/store";
import { REQUESTER_ROLES, SERVICE_TYPE_LABELS, type ServiceType } from "@/lib/types";

export default async function BookPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
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
  const params = await searchParams;

  // Meals and rooms are two doors onto the same form. `?service=meals_only`
  // is what the portal home's "Meal / Dining booking" button links to; an
  // unknown or ineligible value falls back to the ordinary room flow rather
  // than erroring, because a hand-edited URL is not worth a dead end.
  const service = typeof params.service === "string" ? params.service : undefined;
  const allowedServices = serviceTypesFor(
    user.role,
    guestHouses.some((g) => g.serves_meals)
  );
  const initialServiceType = allowedServices.includes(service as ServiceType)
    ? (service as ServiceType)
    : undefined;
  const mealsOnly = initialServiceType === "meals_only";

  // A stay picked on the public booking bar, if the visitor came that way.
  // Only guest houses this role may book survive.
  const initial = parseStayQuery(params, guestHouses.map((g) => g.id));

  return (
    <div className="mx-auto max-w-[1120px] space-y-8">
      <PageHeader
        eyebrow="New booking"
        title={
          mealsOnly
            ? SERVICE_TYPE_LABELS.meals_only
            : onBehalf
              ? "Book on behalf of a guest"
              : "Request a stay"
        }
      >
        {mealsOnly
          ? "Meals at the guest house with no room booked. Tell the kitchen how many people, which days and whether it is vegetarian — it goes straight to the Guest House Manager."
          : onBehalf
            ? "Take a booking for someone who cannot use the portal themselves. It is recorded against your account and names them as the guest."
            : "Fill in the stay and guest details — the request enters the approval pipeline for your role automatically."}
      </PageHeader>
      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="min-w-0 space-y-6">
          {/* Who is asking, from the academic database. Outside the form
              because nothing in it is editable, and above it so the requester
              checks it first. */}
          <AcademicDetailsCard user={user} title="Requester details" />
          <div className="form-steps">
            <BookingForm
              user={user}
              guestHouses={guestHouses}
              config={config}
              initialServiceType={initialServiceType}
              initial={initial}
            />
          </div>
        </div>
        <aside className="lg:sticky lg:top-24">
          <div className="relative isolate overflow-hidden rounded-2xl bg-ink p-5 text-white shadow-lift">
            <div aria-hidden className="emblem-watermark absolute -right-10 -bottom-10 -z-10 size-40 opacity-[0.08]" />
            <p className="text-[10.5px] font-bold tracking-[0.18em] text-saffron uppercase">
              What happens next
            </p>
            <ol className="mt-4 space-y-4 text-[13.5px] leading-snug">
              <li className="flex gap-3">
                <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-saffron" />
                <span>
                  <span className="block font-semibold">Approval</span>
                  <span className="text-white/65">
                    {mealsOnly || onBehalf
                      ? "Straight to the Guest House Manager."
                      : "By the approver your request needs, if any — then the Guest House Manager."}
                  </span>
                </span>
              </li>
              <li className="flex gap-3">
                {mealsOnly ? (
                  <UtensilsCrossed aria-hidden className="mt-0.5 size-4 shrink-0 text-saffron" />
                ) : (
                  <CalendarCheck2 aria-hidden className="mt-0.5 size-4 shrink-0 text-saffron" />
                )}
                <span>
                  <span className="block font-semibold">{mealsOnly ? "Kitchen head counts" : "Room allotment"}</span>
                  <span className="text-white/65">
                    {mealsOnly
                      ? "Once approved, the kitchen has your numbers for each day."
                      : "The manager allots rooms and confirms the stay."}
                  </span>
                </span>
              </li>
              <li className="flex gap-3">
                <BellRing aria-hidden className="mt-0.5 size-4 shrink-0 text-saffron" />
                <span>
                  <span className="block font-semibold">Updates by email</span>
                  <span className="text-white/65">Every step is emailed, and tracked in My Bookings.</span>
                </span>
              </li>
            </ol>
          </div>
        </aside>
      </div>
    </div>
  );
}
