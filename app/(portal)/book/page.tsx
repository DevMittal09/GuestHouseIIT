import Link from "next/link";
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

import { REQUESTER_ROLES, SERVICE_TYPE_LABELS, type ServiceType } from "@/lib/types";
import { firstBookableMealDate } from "@/lib/meals";
import { bookingTypesFor, serviceTypesFor } from "@/lib/booking-types";
import { tariffPreviews } from "@/lib/tariffs";
import { academicRecordFor } from "@/lib/academic";
import { guestNameRule } from "@/lib/academic/guest-names";
import { toInstituteDateValue } from "@/lib/tz";
import { PageHeader } from "@/components/page-header";
import { AcademicDetailsCard } from "@/components/academic-details";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { clubBookingNotice, defaultCopyToFor, mustBookThroughFacultyInCharge } from "@/lib/club-booking";
import { clubsBookableByUser, facultyInChargeForClub } from "@/lib/club-booking-server";

export default async function BookPage({
  searchParams,
}: {
  searchParams: Promise<{ service?: string; for?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect(SIGN_IN_PATH);
  const { service, for: forParam } = await searchParams;

  // A club's bookings are raised by its Faculty Advisor (24 Sep 2026). The
  // club's own account is told who that is instead of being given a form the
  // server would refuse.
  if (mustBookThroughFacultyInCharge(user.role)) {
    const inCharge = await facultyInChargeForClub(user);
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <PageHeader title="New Booking Request">
          Council, fest and club bookings are made by the Faculty Advisor.
        </PageHeader>
        <Card>
          <CardHeader>
            <CardTitle>Ask your Faculty Advisor to book</CardTitle>
            <CardDescription>{clubBookingNotice(inCharge)}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline">
              <Link href="/dashboard">See the club&apos;s bookings</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // The councils, fests and clubs this person is Faculty Advisor of -
  // usually none. Any professor named in Departments & Clubs gets them.
  const clubs = await clubsBookableByUser(user);
  const club = forParam ? (clubs.find((c) => c.id === forParam) ?? null) : null;
  if (forParam && !club) redirect("/book");

  // The Guest House Manager is not a requester, but they take bookings at the
  // desk for people who never open the portal - the form asks them who the
  // stay is for and records both parties.
  const onBehalf = canBookOnBehalf(user.role) && !club;
  const requestsForSelf = REQUESTER_ROLES.includes(user.role) || canBookOnBehalf(user.role);
  if (!club && !requestsForSelf) {
    // An old Faculty Advisor account books only for its clubs: straight to
    // the one, a choice between several, home when there is none.
    if (clubs.length === 1) redirect(`/book?for=${encodeURIComponent(clubs[0].id)}`);
    if (clubs.length === 0) redirect(homeForRole(user.role));
    return <ClubChooser clubs={clubs} />;
  }
  if (!club && user.role === "official" && !isWhitelistedOfficial(user.email, await getOfficialEmails())) {
    redirect("/dashboard");
  }
  // Whose form this is: the club's, when its faculty in-charge is booking for
  // it - `createBooking` builds the same from `for_club`.
  const requester = club ?? user;

  // The same context `createBooking` builds, so the form offers exactly what
  // the server accepts: Settings, debitable heads, projects, the HOD.
  // …and the requester's academic record, which fixes a student's parents'
  // names (7 Oct 2026) - the form shows them read-only and does not offer a
  // relationship the record rules out.
  const [config, context, lookup] = await Promise.all([
    getEffectiveFormConfig(requester.role),
    bookingContextFor(requester),
    academicRecordFor(requester),
  ]);
  const guestNames = guestNameRule(
    lookup.status === "found" ? lookup.record : null,
    config.relationship_options
  );
  const guestHouses = (await getStore().listGuestHouses()).filter((g) =>
    config.allowed_guest_house_ids.includes(g.id)
  );
  // Booking as Faculty Advisor, Copy to starts with the council secretary's
  // mailbox; the advisor may remove it or add more.
  const defaultCopyTo = club ? defaultCopyToFor(club, context.units) : [];

  // Meals and rooms are two doors onto the same form. `?service=meals_only`
  // is what the portal home's "Meal / Dining booking" button links to; an
  // unknown or ineligible value falls back to the ordinary room flow rather
  // than erroring, because a hand-edited URL is not worth a dead end.
  const allowedServices = serviceTypesFor(
    requester.role,
    guestHouses.some((g) => g.serves_meals)
  );
  const initialServiceType = allowedServices.includes(service as ServiceType)
    ? (service as ServiceType)
    : undefined;
  const mealsOnly = initialServiceType === "meals_only";

  /**
   * The rates to show on the form, one set per guest house and booking type
   * this requester may pick. Resolved here, on the server, with the same
   * function the invoice prices from - so the form quotes what the desk
   * charges, and the browser never has to ask.
   */
  const rates = tariffPreviews(
    context.tariffs,
    guestHouses,
    bookingTypesFor(requester.role),
    requester.role,
    toInstituteDateValue(new Date()),
    "double_sharing",
    // A dining booking is quoted the meals and nothing else: there is no room
    // on it to charge a room rate or an extra bed for (9 Oct 2026).
    mealsOnly ? "meals_only" : "room"
  );

  return (
    <div className="space-y-8">
      <PageHeader
        caption={club ? "Faculty Advisor booking" : onBehalf ? "Guest house desk" : "New request"}
        title={
          club
            ? `New Booking for ${club.full_name}`
            : mealsOnly
              ? SERVICE_TYPE_LABELS.meals_only
              : onBehalf
                ? "New Booking (on behalf of a guest)"
                : "New Booking Request"
        }
      >
        {/* One line, or none (8 Oct 2026): the office asked the portal to
            stop explaining itself. */}
        {club
          ? "Booking as its Faculty Advisor. The request is the club's."
          : mealsOnly
            ? "Meals with no room booked."
            : onBehalf
              ? "For a guest who cannot use the portal themselves."
              : null}
      </PageHeader>
      {/* Two columns from `lg` (30 Sep 2026): the form in eight, and in the
          other four the requester's record and what happens after Submit.
          On a phone the record comes first, as before - it is what the
          requester checks before filling anything in. */}
      <div className="grid gap-x-10 gap-y-6 lg:grid-cols-12 lg:items-stretch">
        <aside className="min-w-0 space-y-6 lg:col-span-4 lg:col-start-9 lg:row-start-1">
          {/* Who is asking, from the academic database. Outside the form
              because nothing in it is editable. For a club's booking, that
              is the club.

              It used to have a numbered "What happens next" panel under it.
              That came off on 9 Oct 2026: the steps are the Guidelines' own,
              the requester hears by email at each step anyway, and the office
              asked for the portal to stop narrating itself. */}
          <AcademicDetailsCard
            user={requester}
            title={club ? "Club details" : "Requester details"}
            raisedBy={club ? user : null}
          />
        </aside>
        <div className="min-w-0 space-y-6 lg:col-span-8 lg:row-start-1">
          {/* A professor who is a Faculty Advisor books as themselves or as
              the advisor of a council, fest or club - the same page, a
              different requester. */}
          {clubs.length > 0 && (
            <BookingAs
              self={requestsForSelf ? user : null}
              clubs={clubs}
              current={club?.id ?? null}
              service={initialServiceType}
            />
          )}
          <BookingForm
            // A fresh form for each "Booking as": switching is a client-side
            // navigation within this page, and without a new key React keeps
            // the mounted form - whose defaults (booking type, guest house,
            // Copy to) were the previous requester's.
            key={`${requester.id}:${initialServiceType ?? "room"}`}
            forClub={club ? { id: club.id, name: club.full_name } : null}
            user={requester}
            guestHouses={guestHouses}
            config={config}
            initialServiceType={initialServiceType}
            // Resolved here rather than in the form so the server-rendered
            // page and its hydration cannot land on different days - they
            // would, for a second either side of a meal's deadline.
            initialMealDate={firstBookableMealDate(new Date(), context.rules.meals.windows)}
            rules={context.rules}
            debitHeads={context.debitHeads}
            hodApprovers={context.hodApprovers}
            defaultCopyTo={defaultCopyTo}
            tariffPreviews={rates}
            guestNames={guestNames}
          />
        </div>
      </div>
    </div>
  );
}

/**
 * "Booking as": yourself, or Faculty Advisor of each council, fest or club
 * the console names you for (24 Sep 2026). Links rather than a toggle inside
 * the form, because the choice changes whose form it is - the requester's
 * details, booking types and debitable heads all follow.
 */
function BookingAs({
  self,
  clubs,
  current,
  service,
}: {
  self: { full_name: string } | null;
  clubs: { id: string; full_name: string }[];
  current: string | null;
  service?: ServiceType;
}) {
  const href = (clubId: string | null) => {
    const params = new URLSearchParams();
    if (clubId) params.set("for", clubId);
    if (service) params.set("service", service);
    const query = params.toString();
    return query ? `/book?${query}` : "/book";
  };
  const options = [
    ...(self ? [{ id: null, label: `Yourself - ${self.full_name}` }] : []),
    ...clubs.map((c) => ({ id: c.id, label: `Faculty Advisor - ${c.full_name}` })),
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle>Booking as</CardTitle>
        <CardDescription>
          Faculty Advisor of {clubs.map((c) => c.full_name).join(", ")}.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <nav aria-label="Booking as" className="flex flex-wrap gap-2">
          {options.map((o) => {
            const active = o.id === current;
            return (
              <Button key={o.id ?? "self"} asChild variant={active ? "default" : "outline"} size="sm">
                <Link href={href(o.id)} aria-current={active ? "page" : undefined}>
                  {o.label}
                </Link>
              </Button>
            );
          })}
        </nav>
      </CardContent>
    </Card>
  );
}

/** A Faculty Advisor account of several clubs picks which one they are booking for. */
function ClubChooser({ clubs }: { clubs: { id: string; full_name: string; email: string }[] }) {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="New Booking for a Club">Choose the one this booking is for.</PageHeader>
      <div className="grid gap-3 sm:grid-cols-2">
        {clubs.map((c) => (
          <Card key={c.id}>
            <CardHeader>
              <CardTitle>{c.full_name}</CardTitle>
              <CardDescription>{c.email}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild>
                <Link href={`/book?for=${encodeURIComponent(c.id)}`}>Book for {c.full_name}</Link>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
