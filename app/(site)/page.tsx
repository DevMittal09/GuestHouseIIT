import Image from "next/image";
import Link from "next/link";
import { BedDouble, Building2, ConciergeBell, UtensilsCrossed, type LucideIcon } from "lucide-react";
import {
  ArrowLink,
  BulletList,
  Container,
  Label,
  SectionHead,
  SitePhotoFrame,
  siteButton,
} from "@/components/site/site-ui";
import { MEALS_ONLY_AUDIENCE } from "@/lib/booking-types";
import {
  GUEST_HOUSE_CONTACT,
  guestHouseMapPins,
  HOME_PHOTOS,
  type SitePhoto,
} from "@/lib/site";
import {
  bookingSteps,
  describeRooms,
  facilityCards,
  homeFacts,
  joinNames,
  MEAL_NOTICE_RULE,
  mealTimetable,
  openTo,
  servingHouses,
} from "@/lib/site-content";
import { getSiteGuestHouses, getSitePolicies } from "@/lib/site-data";
import { cn } from "@/lib/utils";

/**
 * The page itself is rendered per request — the header greets whoever is
 * signed in — but everything it *says* comes from `lib/site-data.ts`, which
 * holds its answers for half an hour under the `site` cache tag, so a visitor
 * does not wait for a database round trip to read the guidelines (Phase 9).
 * `revalidateEverything()` drops that tag the moment a setting or a guest
 * house changes, so it is never stale in practice.
 *
 * Every figure, route and time on this page is computed from the store and
 * the office's Settings: the room count, the advance window, the stay cap,
 * who may request each guest house, who approves each category, and when
 * meals are served. Only the amenities are written out (`facilityCards`).
 */

const FACILITY_ICONS: Record<string, LucideIcon> = {
  Rooms: BedDouble,
  Dining: UtensilsCrossed,
  Premises: Building2,
  Services: ConciergeBell,
};

export default async function HomePage() {
  const [houses, policies] = await Promise.all([getSiteGuestHouses(), getSitePolicies()]);
  const { rules, routes } = policies;
  const facts = homeFacts(houses, rules);
  const pins = guestHouseMapPins(houses.map((h) => h.name));
  const pinFor = (name: string) => pins.find((p) => p.name === name) ?? null;
  const serving = servingHouses(houses);
  const names = joinNames(houses.map((h) => h.name));
  // Dining has its own section when a guest house serves meals, so its card
  // would only repeat it.
  const facilities = facilityCards(houses, rules).filter(
    (card) => card.kicker !== "Dining" || serving.length === 0
  );

  return (
    <>
      {/* ------------------------------------------------------------ hero */}
      <section aria-labelledby="hero-title">
        <div className="relative h-[clamp(260px,52vw,620px)] overflow-hidden bg-band">
          {HOME_PHOTOS.hero.src && (
            <Image
              src={HOME_PHOTOS.hero.src}
              alt={HOME_PHOTOS.hero.alt}
              fill
              priority
              sizes="100vw"
              className="object-cover"
            />
          )}
        </div>
        <Container>
          <div className="grid gap-x-14 gap-y-12 lg:grid-cols-12">
            {/* A white panel over the photograph's lower edge. It reaches
                back into the gutter so its text lines up with the page. */}
            <div className="relative -mx-[clamp(16px,4vw,32px)] bg-white px-[clamp(16px,4vw,32px)] pt-9 sm:-mt-28 sm:mr-0 sm:pr-10 lg:col-span-7 lg:-mt-44 lg:pt-12 lg:pr-14">
              <Label>Indian Institute of Technology Palakkad</Label>
              <h1
                id="hero-title"
                className="mt-4 text-[clamp(40px,6.2vw,74px)] leading-[0.98] font-semibold tracking-[-0.025em] text-ink"
              >
                Guest houses on the campus
              </h1>
              <p className="mt-6 max-w-[54ch] text-[18px] leading-[1.6] text-body">
                {names ? `${names} host` : "The guest houses host"} visiting faculty, examiners,
                collaborators and the families of students and staff. Rooms are requested online by
                a member of the institute and confirmed once the request is approved.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/book-room" className={siteButton.brand}>
                  Book a room
                </Link>
                <Link href="/book-meal" className={siteButton.outline}>
                  Book meals
                </Link>
              </div>
              <p className="mt-4 text-[14px] text-muted-foreground">
                Sign in with your institute LDAP account to make a request.
              </p>
            </div>

            {facts.length > 0 && (
              <ul className="grid grid-cols-2 self-end border-t border-ink lg:col-span-5 lg:mb-1">
                {facts.map((fact, i) => (
                  <li
                    key={fact.unit}
                    className={cn(
                      "border-b border-border py-5",
                      i % 2 === 0 ? "pr-4" : "border-l pl-5"
                    )}
                  >
                    <span className="block font-heading text-[clamp(34px,4vw,46px)] leading-none font-semibold text-ink tabular-nums">
                      {fact.value}
                    </span>
                    <span className="mt-1.5 block text-[14.5px] font-semibold text-ink">{fact.unit}</span>
                    <span className="mt-1 block text-[13.5px] leading-snug text-muted-foreground">
                      {fact.label}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Container>
      </section>

      {/* ------------------------------------------------- the guest houses */}
      {houses.length > 0 && (
        <section aria-labelledby="houses" className="pt-20 lg:pt-28">
          <Container>
            <SectionHead
              id="houses"
              label="The guest houses"
              title={names}
              link={{ href: "/contact", label: "See them on the map" }}
            />
            <div className="mt-10 grid gap-px bg-border md:grid-cols-2">
              {houses.map((house) => {
                const pin = pinFor(house.name);
                const who = openTo(house, routes);
                return (
                  <article key={house.id} className="bg-white py-8 md:px-10 md:first:pl-0 md:last:pr-0">
                    <p className="text-[13px] font-semibold tracking-[0.1em] text-muted-foreground uppercase">
                      {house.serves_meals ? "Rooms and dining" : "Rooms only"}
                    </p>
                    <h3 className="mt-2 text-[clamp(32px,3.6vw,44px)] leading-none font-semibold tracking-[-0.02em] text-ink">
                      {house.name}
                    </h3>
                    <dl className="mt-7 divide-y divide-border border-y border-border text-[15px]">
                      <div className="grid grid-cols-[7.5rem_1fr] gap-4 py-3">
                        <dt className="font-semibold text-ink">Rooms</dt>
                        <dd className="text-body">{describeRooms(house)}</dd>
                      </div>
                      <div className="grid grid-cols-[7.5rem_1fr] gap-4 py-3">
                        <dt className="font-semibold text-ink">Meals</dt>
                        <dd className="text-body">
                          {house.serves_meals ? "Breakfast, lunch and dinner" : "Not served"}
                        </dd>
                      </div>
                      {who && (
                        <div className="grid grid-cols-[7.5rem_1fr] gap-4 py-3">
                          <dt className="font-semibold text-ink">Requested by</dt>
                          <dd className="text-body">{who}</dd>
                        </div>
                      )}
                    </dl>
                    <div className="mt-6 flex flex-wrap gap-x-7 gap-y-3">
                      <ArrowLink href="/book-room">Request a room</ArrowLink>
                      {pin && (
                        <ArrowLink href={pin.directionsUrl} external>
                          Directions
                        </ArrowLink>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          </Container>
        </section>
      )}

      {/* ---------------------------------------------------- photo spread */}
      <section aria-labelledby="inside" className="pt-20 lg:pt-28">
        <Container>
          <SectionHead
            id="inside"
            label="Rooms and spaces"
            title="Bedrooms, suites and common spaces"
            link={{ href: "/gallery", label: "All photographs" }}
          />
          <div className="mt-10 grid gap-3 md:h-[clamp(440px,50vw,620px)] md:grid-cols-12 md:grid-rows-2">
            {HOME_PHOTOS.spread.map((photo, i) => (
              <SpreadPhoto
                key={photo.alt}
                photo={photo}
                className={i === 0 ? "md:col-span-7 md:row-span-2" : "md:col-span-5"}
                sizes={i === 0 ? "(min-width: 768px) 58vw, 100vw" : "(min-width: 768px) 42vw, 100vw"}
              />
            ))}
          </div>
        </Container>
      </section>

      {/* ------------------------------------------------ how booking works */}
      <section aria-labelledby="how" className="mt-20 bg-ink text-on-ink lg:mt-28">
        <Container className="py-20 lg:py-24">
          <SectionHead
            id="how"
            tone="dark"
            label="How booking works"
            title="How a request becomes a booking"
            link={{ href: "/guidelines", label: "Read the guidelines" }}
          />
          <ol className="mt-12 grid grid-cols-[repeat(auto-fit,minmax(min(190px,100%),1fr))] gap-x-8 gap-y-10">
            {bookingSteps(rules).map((step, i) => (
              <li key={step.title} className="border-t border-white/20 pt-5">
                <span className="font-heading text-[15px] font-semibold text-saffron tabular-nums">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h3 className="mt-3 text-[21px] font-semibold text-white">{step.title}</h3>
                <p className="mt-2 text-[15px] leading-[1.6]">{step.body}</p>
              </li>
            ))}
          </ol>

          {routes.length > 0 && (
            <div className="mt-20 grid gap-x-14 gap-y-8 lg:grid-cols-12">
              <div className="lg:col-span-4">
                <h3 className="text-[clamp(24px,2.6vw,30px)] leading-tight font-semibold text-white">
                  Who approves your request
                </h3>
                <p className="mt-4 text-[15.5px] leading-[1.6]">
                  Each category of requester has its own route, read from the portal itself. The
                  Guest House Manager is the last step for everyone, and allots the rooms.
                </p>
              </div>
              <div className="min-w-0 lg:col-span-8">
                <table className="w-full border-b border-white/15 text-left text-[15px]">
                  <caption className="sr-only">Approval route for each category of requester</caption>
                  <thead>
                    <tr className="text-[12px] tracking-[0.14em] text-on-ink-muted uppercase">
                      <th scope="col" className="pb-3 pr-6 font-bold">
                        Requester
                      </th>
                      <th scope="col" className="pb-3 font-bold">
                        Approved by, in order
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {routes.map((route) => (
                      <tr key={route.role} className="border-t border-white/15 align-top">
                        <th scope="row" className="w-[42%] py-4 pr-6 font-semibold text-white">
                          {route.label}
                        </th>
                        <td className="py-4">
                          {route.approvers.map((name, i) => (
                            <span key={`${name}-${i}`}>
                              {i > 0 && (
                                <span aria-hidden className="px-1.5 text-saffron">
                                  →
                                </span>
                              )}
                              {i > 0 && <span className="sr-only">, then </span>}
                              {name}
                            </span>
                          ))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </Container>
      </section>

      {/* ----------------------------------------------------------- dining */}
      {serving.length > 0 && (
        <section aria-labelledby="dining" className="pt-20 lg:pt-28">
          <Container className="grid gap-x-14 gap-y-12 lg:grid-cols-12">
            <div className="lg:col-span-6">
              <SectionHead
                id="dining"
                label="Dining"
                title={`Meals at ${joinNames(serving.map((h) => h.name))}`}
              />
              <p className="mt-6 max-w-[56ch] text-[17px] leading-[1.65] text-body">
                The kitchen works from the head counts on each booking, so meals are chosen day by
                day when you request your room — every meal your stay covers is ticked for you, and
                you untick the ones you will not need. {capitalise(MEALS_ONLY_AUDIENCE)} can also
                book meals without a room.
              </p>
              <p className="mt-5 max-w-[56ch] border-l-[3px] border-saffron pl-4 text-[15px] leading-[1.6] text-body">
                {MEAL_NOTICE_RULE}
              </p>
              <Link href="/book-meal" className={cn(siteButton.outline, "mt-8")}>
                Book meals
              </Link>
            </div>
            <div className="self-end lg:col-span-5 lg:col-start-8">
              <table className="w-full border-y border-ink">
                <caption className="sr-only">Meal serving times</caption>
                <tbody>
                  {mealTimetable(rules).map((row) => (
                    <tr key={row.meal} className="border-t border-border first:border-t-0">
                      <th
                        scope="row"
                        className="py-5 text-left font-heading text-[clamp(24px,2.6vw,30px)] font-semibold text-ink"
                      >
                        {row.meal}
                      </th>
                      <td className="py-5 text-right text-[17px] text-body tabular-nums">{row.time}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Container>
        </section>
      )}

      {/* ------------------------------------------------------- facilities */}
      <section aria-labelledby="facilities" className="pt-20 pb-20 lg:pt-28 lg:pb-28">
        <Container>
          <SectionHead id="facilities" label="Facilities" title="What the guest houses provide" />
          <div className="mt-10 grid grid-cols-[repeat(auto-fit,minmax(min(230px,100%),1fr))] gap-x-10 gap-y-12">
            {facilities.map((card) => {
              const Icon = (card.kicker && FACILITY_ICONS[card.kicker]) || Building2;
              return (
                <div key={card.title}>
                  <Icon aria-hidden className="size-7 text-vermilion" strokeWidth={1.5} />
                  <h3 className="mt-4 mb-4 text-[22px] font-semibold text-ink">{card.title}</h3>
                  <BulletList items={card.items} />
                </div>
              );
            })}
          </div>
        </Container>
      </section>

      {/* --------------------------------------------------------- contact */}
      <section aria-labelledby="visit" className="border-t border-border bg-band">
        <Container className="grid gap-x-14 gap-y-10 py-16 lg:grid-cols-12 lg:py-20">
          <div className="lg:col-span-5">
            <h2
              id="visit"
              className="text-[clamp(28px,3.4vw,40px)] leading-[1.08] font-semibold tracking-[-0.015em] text-ink"
            >
              Questions before you book?
            </h2>
            <p className="mt-4 max-w-[46ch] text-[16.5px] leading-[1.6] text-body">
              The Guest House Office answers by phone and email. Bookings themselves are made
              online; telephone bookings are not taken.
            </p>
          </div>
          <div className="grid gap-8 sm:grid-cols-2 lg:col-span-7">
            <div>
              <Label>Call the front office</Label>
              <a
                href={GUEST_HOUSE_CONTACT.phoneHref}
                className="mt-2 block font-heading text-[clamp(24px,2.8vw,32px)] font-semibold text-ink tabular-nums hover:text-vermilion-deep"
              >
                {GUEST_HOUSE_CONTACT.phone}
              </a>
            </div>
            <div className="min-w-0">
              <Label>Write to us</Label>
              <a
                href={`mailto:${GUEST_HOUSE_CONTACT.email}`}
                className="mt-2 block font-heading text-[clamp(24px,2.8vw,32px)] font-semibold break-words text-ink hover:text-vermilion-deep"
              >
                {GUEST_HOUSE_CONTACT.email}
              </a>
            </div>
            <div className="flex flex-wrap gap-x-8 gap-y-3 sm:col-span-2">
              <ArrowLink href="/contact">Maps and directions</ArrowLink>
              <ArrowLink href="/guidelines">Guest house guidelines</ArrowLink>
            </div>
          </div>
        </Container>
      </section>
    </>
  );
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** A photograph in the home page's spread, captioned on a white label. */
function SpreadPhoto({
  photo,
  sizes,
  className,
}: {
  photo: SitePhoto;
  sizes: string;
  className?: string;
}) {
  return (
    <figure className={cn("group relative m-0 aspect-[4/3] min-h-0 md:aspect-auto", className)}>
      <SitePhotoFrame photo={photo} sizes={sizes} zoom className="absolute inset-0" />
      <figcaption className="absolute bottom-0 left-0 max-w-[85%] bg-white px-3.5 py-2 text-[13.5px] leading-snug text-ink">
        {photo.alt}
      </figcaption>
    </figure>
  );
}
