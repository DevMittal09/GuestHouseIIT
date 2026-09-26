import Link from "next/link";
import {
  Building2,
  ConciergeBell,
  Dumbbell,
  Phone,
  Presentation,
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
 * The page itself is rendered per request — the header greets whoever is
 * signed in — but what it *says* comes from `lib/site-data.ts`, which holds
 * its answers for half an hour under the `site` cache tag (Phase 9).
 * `revalidateEverything()` drops that tag the moment a guest house changes.
 *
 * Clean and institutional, the way peer guest houses (IIT Madras's Taramani
 * Guest House) and well-kept hotel sites present themselves (26 Sep 2026):
 * a headline beside one contained photograph, a card per guest house,
 * amenities, a row of photographs, and a closing box. Photographs stay inside
 * the layout — a full-screen photo read as "weird" to the owner. No figures,
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
  meeting: Presentation,
  gym: Dumbbell,
  reception: ConciergeBell,
};

const SECTION = "py-[clamp(64px,8vw,104px)]";

export default async function HomePage() {
  const houses = await getSiteGuestHouses();
  const where = joinNames(houses.map((h) => h.name));

  return (
    <>
      {/* ------------------------------------------------------------ hero */}
      <section aria-labelledby="hero-title" className="border-b border-border">
        <Container className="grid items-center gap-x-14 gap-y-10 py-[clamp(44px,6.5vw,88px)] lg:grid-cols-12">
          <div className="lg:col-span-6">
            <Label>IIT Palakkad</Label>
            <h1
              id="hero-title"
              className="mt-4 text-[clamp(38px,4.8vw,58px)] leading-[1.06] font-semibold tracking-[-0.02em] text-ink"
            >
              Guest houses of IIT&nbsp;Palakkad
            </h1>
            <p className="mt-5 max-w-[46ch] text-[18px] leading-[1.6] text-body">
              {where ? `Rooms at ${where}` : "Rooms on campus"} for the institute&rsquo;s guests —
              visiting faculty, collaborators, examiners and the families of our students and staff.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/book-room" className={siteButton.brand}>
                Book a room
              </Link>
              <Link href="/book-meal" className={siteButton.outline}>
                Book meals
              </Link>
            </div>
            <p className="mt-8 flex flex-wrap items-center gap-x-2 gap-y-1 text-[14.5px] text-muted-foreground">
              <Phone aria-hidden className="size-4 text-vermilion-deep" />
              Front office
              <a href={GUEST_HOUSE_CONTACT.phoneHref} className="font-semibold text-ink tabular-nums hover:text-vermilion-deep">
                {GUEST_HOUSE_CONTACT.phone}
              </a>
            </p>
          </div>
          <div className="lg:col-span-6">
            <SitePhotoFrame
              photo={HOME_PHOTOS.hero}
              aspect="4/3"
              sizes="(min-width: 1024px) 560px, 100vw"
              priority
            />
          </div>
        </Container>
      </section>

      {/* ------------------------------------------------ the guest houses */}
      {houses.length > 0 && (
        <section aria-labelledby="houses-title" className={`bg-band ${SECTION}`}>
          <Container>
            <SectionHead id="houses-title" label="Accommodation" title="Our guest houses" />
            <div className="mt-10 grid gap-5 md:grid-cols-2">
              {houses.map((house) => (
                <article
                  key={house.id}
                  className="flex flex-col rounded-[8px] border border-border bg-white p-[clamp(24px,3vw,36px)]"
                >
                  <div className="flex items-center justify-between gap-4">
                    <span className="flex size-11 items-center justify-center rounded-[8px] bg-vermilion-soft text-vermilion-deep">
                      <Building2 aria-hidden className="size-5" strokeWidth={1.75} />
                    </span>
                    <span className="rounded-full border border-border px-3 py-1 text-[12.5px] font-medium text-body">
                      {house.serves_meals ? "Rooms & dining" : "Rooms"}
                    </span>
                  </div>
                  <h3 className="mt-6 text-[clamp(26px,2.6vw,32px)] leading-tight font-semibold text-ink">
                    {house.name}
                  </h3>
                  <p className="mt-2 text-[15.5px] leading-[1.6] text-body">{houseSummary(house)}</p>
                  <div className="mt-auto pt-8">
                    <ArrowLink href="/book-room">Book a room</ArrowLink>
                  </div>
                </article>
              ))}
            </div>
          </Container>
        </section>
      )}

      {/* ------------------------------------------------------- amenities */}
      <section aria-labelledby="amenities-title" className={SECTION}>
        <Container>
          <SectionHead id="amenities-title" label="Facilities" title="Amenities" />
          <ul className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {amenities(houses).map((item) => {
              const Icon = AMENITY_ICONS[item.key] ?? ConciergeBell;
              return (
                <li
                  key={item.key}
                  className="flex items-center gap-4 rounded-[8px] border border-border bg-white px-5 py-4"
                >
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-[8px] bg-band text-vermilion-deep">
                    <Icon aria-hidden className="size-5" strokeWidth={1.6} />
                  </span>
                  <span className="text-[15px] font-medium text-ink">{item.label}</span>
                </li>
              );
            })}
          </ul>
        </Container>
      </section>

      {/* --------------------------------------------------------- gallery */}
      <section aria-labelledby="gallery-title" className={`bg-band ${SECTION}`}>
        <Container>
          <SectionHead
            id="gallery-title"
            label="Gallery"
            title="A look inside"
            link={{ href: "/gallery", label: "View all photographs" }}
          />
          <ul className="mt-10 grid grid-cols-2 gap-4 lg:grid-cols-4">
            {HOME_PHOTOS.preview.map((photo) => (
              <li key={photo.alt}>
                <SitePhotoFrame photo={photo} aspect="4/3" sizes="(min-width: 1024px) 280px, 50vw" />
              </li>
            ))}
          </ul>
        </Container>
      </section>

      {/* --------------------------------------------------------- closing */}
      <section aria-labelledby="visit-title" className={SECTION}>
        <Container>
          <div className="flex flex-wrap items-center justify-between gap-x-10 gap-y-8 rounded-[12px] bg-ink px-[clamp(24px,5vw,56px)] py-[clamp(32px,5vw,52px)]">
            <div className="min-w-0">
              <h2
                id="visit-title"
                className="text-[clamp(26px,3vw,36px)] leading-tight font-semibold tracking-[-0.015em] text-white"
              >
                Planning a visit?
              </h2>
              <p className="mt-2 max-w-[50ch] text-[16px] leading-[1.6] text-on-ink">
                Read the guidelines before you book, or get in touch with the guest house office.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link href="/guidelines" className={siteButton.light}>
                Guidelines
              </Link>
              <Link href="/contact" className={siteButton.outlineLight}>
                Contact us
              </Link>
            </div>
          </div>
        </Container>
      </section>
    </>
  );
}
