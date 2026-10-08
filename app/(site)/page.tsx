import Link from "next/link";
import {
  ArrowRight,
  Building2,
  ConciergeBell,
  Phone,
  Refrigerator,
  ShowerHead,
  Snowflake,
  Tv,
  UtensilsCrossed,
  Wifi,
  type LucideIcon,
} from "lucide-react";
import { ArrowLink, Container, Label, SectionHead, SitePhotoFrame, siteButton } from "@/components/site/site-ui";
import { GUEST_HOUSE_CONTACT, HOME_PHOTOS } from "@/lib/site";
import { amenities, houseSummary, joinNames } from "@/lib/site-content";
import { getSiteGuestHouses } from "@/lib/site-data";

/**
 * The page itself is rendered per request - the header greets whoever is
 * signed in - but what it *says* comes from `lib/site-data.ts`, which holds
 * its answers for half an hour under the `site` cache tag (Phase 9).
 * `revalidateEverything()` drops that tag the moment a guest house changes.
 *
 * Clean and institutional, the way peer guest houses (IIT Madras's Taramani
 * Guest House) and well-kept hotel sites present themselves (26 Sep 2026;
 * refined 30 Sep 2026 on a 12-column grid): a headline in five columns beside
 * one contained 4:3 photograph in seven, a card per guest house, a ruled grid
 * of amenities, a mosaic of photographs, and a closing row of links.
 * Sections open on a hairline ink rule with the label in the left quarter,
 * the editorial habit of hotel sites, rather than on floating boxes.
 * Photographs stay inside the layout - a full-screen photo read as "weird"
 * to the owner. No figures,
 * meal times, rules, approval routes or requester categories: rules live on
 * /guidelines, in general terms, and the portal's internals stay in the
 * portal. The guest-house names come from the store.
 */

const AMENITY_ICONS: Record<string, LucideIcon> = {
  ac: Snowflake,
  bath: ShowerHead,
  wifi: Wifi,
  tv: Tv,
  fridge: Refrigerator,
  dining: UtensilsCrossed,
  reception: ConciergeBell,
};

const SECTION = "py-[clamp(64px,8vw,112px)]";

export default async function HomePage() {
  const houses = await getSiteGuestHouses();
  const where = joinNames(houses.map((h) => h.name));
  // Plain and factual (30 Sep 2026): the office asked the site to promise
  // less, so no list of who stays and no adjectives about the rooms.
  const lead = where
    ? `${where} ${houses.length === 1 ? "provides" : "provide"} accommodation on campus for guests of the institute.`
    : "Accommodation on campus for guests of the institute.";
  const [feature, ...rest] = HOME_PHOTOS.preview;

  return (
    <>
      {/* ------------------------------------------------------------ hero */}
      {/* One contained block on the 12-column grid: an ink panel in five
          columns carrying the headline, joined to a 4:3 photograph in the
          other seven. Authoritative without going full-bleed. */}
      <section aria-labelledby="hero-title" className="pt-[clamp(16px,3vw,40px)]">
        <Container>
          <div className="grid overflow-hidden rounded-lg border border-ink lg:grid-cols-12">
            <div className="flex min-w-0 flex-col justify-between bg-ink px-[clamp(22px,4vw,56px)] py-[clamp(32px,5vw,64px)] lg:col-span-5">
              <div>
                <Label className="text-saffron">IIT Palakkad</Label>
                <h1
                  id="hero-title"
                  className="mt-5 text-[clamp(38px,4.7vw,64px)] leading-[1.02] font-semibold tracking-[-0.025em] text-white"
                >
                  Guest houses of IIT&nbsp;Palakkad
                </h1>
                <div aria-hidden className="mt-7 h-1 w-12 bg-vermilion" />
                <p className="mt-7 max-w-[40ch] text-[17.5px] leading-[1.6] text-on-ink">{lead}</p>
                <div className="mt-9 flex flex-wrap gap-3">
                  <Link href="/book-room" className={siteButton.brand}>
                    Book a room
                  </Link>
                  <Link href="/book-meal" className={siteButton.outlineLight}>
                    Book meals
                  </Link>
                </div>
              </div>
              <p className="mt-12 flex flex-wrap items-center gap-x-2.5 gap-y-1 border-t border-white/15 pt-5 text-[14.5px] text-on-ink-muted">
                <Phone aria-hidden className="size-4 text-saffron" />
                Front office
                <a href={GUEST_HOUSE_CONTACT.phoneHref} className="font-semibold text-white tabular-nums hover:text-saffron">
                  {GUEST_HOUSE_CONTACT.phone}
                </a>
              </p>
            </div>
            <div className="min-w-0 lg:col-span-7">
              <SitePhotoFrame
                photo={HOME_PHOTOS.hero}
                sizes="(min-width: 1024px) 700px, 100vw"
                priority
                className="aspect-[4/3] rounded-none lg:aspect-auto lg:h-full lg:min-h-[500px]"
              />
            </div>
          </div>
        </Container>
      </section>

      {/* ------------------------------------------------ the guest houses */}
      {houses.length > 0 && (
        <section aria-labelledby="houses-title" className={SECTION}>
          <Container>
            <SectionHead id="houses-title" label="Accommodation" title="Our guest houses" />
            <div className="mt-10 grid gap-5 md:grid-cols-2 lg:ml-[calc(25%+10px)]">
              {houses.map((house) => (
                <article
                  key={house.id}
                  className="flex flex-col overflow-hidden rounded-lg border border-border-strong bg-white"
                >
                  <div className="flex items-center justify-between gap-4 border-b border-border bg-band px-[clamp(20px,2.6vw,32px)] py-3">
                    <span className="flex items-center gap-2 text-[12px] font-semibold tracking-[0.18em] text-vermilion-deep uppercase">
                      <Building2 aria-hidden className="size-4" strokeWidth={1.8} />
                      Guest house
                    </span>
                    <span className="rounded-xs border border-border-strong bg-white px-2 py-0.5 text-[12.5px] font-semibold text-ink">
                      {house.serves_meals ? "Rooms & dining" : "Rooms"}
                    </span>
                  </div>
                  <div className="px-[clamp(20px,2.6vw,32px)] pt-7 pb-8">
                    <h3 className="text-[clamp(30px,3vw,40px)] leading-[1.05] font-semibold tracking-[-0.018em] text-ink">
                      {house.name}
                    </h3>
                    <p className="mt-3 text-[15.5px] leading-[1.65] text-body">{houseSummary(house)}</p>
                  </div>
                  <div className="mt-auto border-t border-border px-[clamp(20px,2.6vw,32px)] py-4">
                    <ArrowLink href="/book-room">Book a room</ArrowLink>
                  </div>
                </article>
              ))}
            </div>
          </Container>
        </section>
      )}

      {/* ------------------------------------------------------- amenities */}
      <section aria-labelledby="amenities-title" className={`bg-band ${SECTION}`}>
        <Container>
          <SectionHead id="amenities-title" label="Facilities" title="Amenities" />
          {/* A ruled grid rather than floating cards: one border, hairlines
              between the cells (the 1px gap over a border-coloured ground).
              `amenities()` always returns six, so 1, 2 and 3 columns leave
              no empty cell showing the ground. */}
          <ul className="mt-10 grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-border-strong bg-border-strong sm:grid-cols-2 lg:ml-[calc(25%+10px)] lg:grid-cols-3">
            {amenities(houses).map((item) => {
              const Icon = AMENITY_ICONS[item.key] ?? ConciergeBell;
              return (
                <li key={item.key} className="flex items-center gap-3.5 bg-white px-4 py-5">
                  <Icon aria-hidden className="size-[22px] shrink-0 text-vermilion-deep" strokeWidth={1.5} />
                  <span className="text-[15.5px] font-medium text-ink">{item.label}</span>
                </li>
              );
            })}
          </ul>
        </Container>
      </section>

      {/* --------------------------------------------------------- gallery */}
      <section aria-labelledby="gallery-title" className={SECTION}>
        <Container>
          <SectionHead
            id="gallery-title"
            label="Gallery"
            title="A look inside"
            link={{ href: "/gallery", label: "View all photographs" }}
          />
          {/* Contained in the grid: one photograph across half the width and
              two rows, the rest beside it - no captions (the owner). */}
          <ul className="mt-10 grid grid-cols-2 gap-3 sm:gap-4 lg:h-[clamp(420px,40vw,540px)] lg:grid-cols-12 lg:grid-rows-2">
            {feature && (
              <li className="col-span-2 lg:col-span-6 lg:row-span-2">
                <SitePhotoFrame
                  photo={feature}
                  sizes="(min-width: 1024px) 600px, 100vw"
                  className="aspect-[4/3] lg:aspect-auto lg:h-full"
                />
              </li>
            )}
            {rest.map((photo, i) => (
              <li key={photo.alt} className={i === 2 ? "col-span-2 lg:col-span-6" : "lg:col-span-3"}>
                <SitePhotoFrame
                  photo={photo}
                  sizes={i === 2 ? "(min-width: 1024px) 600px, 100vw" : "(min-width: 1024px) 300px, 50vw"}
                  className={i === 2 ? "aspect-[16/9] lg:aspect-auto lg:h-full" : "aspect-[4/3] lg:aspect-auto lg:h-full"}
                />
              </li>
            ))}
          </ul>
        </Container>
      </section>

      {/* --------------------------------------------------------- closing */}
      <section aria-labelledby="visit-title" className="border-t border-border bg-band">
        <Container className="grid gap-x-10 gap-y-8 py-[clamp(56px,7vw,96px)] lg:grid-cols-12">
          <div className="min-w-0 lg:col-span-5">
            <h2
              id="visit-title"
              className="text-[clamp(28px,3.2vw,40px)] leading-tight font-semibold tracking-[-0.018em] text-ink"
            >
              Planning a visit?
            </h2>
            <p className="mt-3 max-w-[44ch] text-[16.5px] leading-[1.6] text-body">
              Read the guidelines before you book, or get in touch with the guest house office.
            </p>
          </div>
          <ul className="min-w-0 border-t border-ink lg:col-span-6 lg:col-start-7">
            {[
              { href: "/guidelines", label: "Guidelines", detail: "How booking works, and the house rules" },
              { href: "/contact", label: "Contact us", detail: "The front office, and each guest house on the map" },
            ].map((item) => (
              <li key={item.href} className="border-b border-border-strong">
                <Link
                  href={item.href}
                  className="group flex items-center justify-between gap-6 py-5 text-ink no-underline transition-colors duration-200 hover:text-vermilion-deep"
                >
                  <span className="min-w-0">
                    <span className="block font-heading text-[clamp(22px,2.2vw,26px)] leading-tight font-semibold">
                      {item.label}
                    </span>
                    <span className="mt-1 block text-[14.5px] text-body">{item.detail}</span>
                  </span>
                  <ArrowRight
                    aria-hidden
                    className="size-5 shrink-0 transition-transform duration-200 motion-safe:group-hover:translate-x-1"
                  />
                </Link>
              </li>
            ))}
          </ul>
        </Container>
      </section>
    </>
  );
}
