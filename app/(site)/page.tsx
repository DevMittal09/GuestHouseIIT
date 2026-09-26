import Image from "next/image";
import Link from "next/link";
import {
  ConciergeBell,
  Dumbbell,
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
import { HOME_PHOTOS } from "@/lib/site";
import { amenities, joinNames } from "@/lib/site-content";
import { getSiteGuestHouses } from "@/lib/site-data";
import { cn } from "@/lib/utils";

/**
 * The page itself is rendered per request — the header greets whoever is
 * signed in — but what it *says* comes from `lib/site-data.ts`, which holds
 * its answers for half an hour under the `site` cache tag (Phase 9).
 * `revalidateEverything()` drops that tag the moment a guest house changes.
 *
 * The home page is the guest house's front door, not its rulebook (the
 * owner, 26 Sep 2026): photographs, the two names, a sentence, the
 * amenities. No figures, no meal times, no approval routes, no requester
 * categories — rules live on /guidelines, in general terms, and the portal's
 * internals stay in the portal. The guest-house names still come from the
 * store, so a renamed or added guest house shows up here by itself.
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

/** Grid placement of the four mosaic photographs: one large, two small, one wide. */
const MOSAIC = [
  "col-span-2 aspect-[4/3] md:row-span-2 md:aspect-auto",
  "aspect-square md:aspect-auto",
  "aspect-square md:aspect-auto",
  "col-span-2 aspect-[16/9] md:aspect-auto",
];

export default async function HomePage() {
  const houses = await getSiteGuestHouses();
  const names = houses.map((h) => h.name);
  const title =
    names.length === 0 ? "Guest House" : names.length === 2 ? `${names[0]} & ${names[1]}` : joinNames(names);

  return (
    <>
      {/* ------------------------------------------------------------ hero */}
      <section
        aria-labelledby="hero-title"
        className="relative isolate flex min-h-[clamp(600px,100svh,980px)] items-end overflow-hidden bg-ink"
      >
        {HOME_PHOTOS.hero.src && (
          <Image
            src={HOME_PHOTOS.hero.src}
            alt={HOME_PHOTOS.hero.alt}
            fill
            priority
            sizes="100vw"
            className="-z-10 object-cover"
          />
        )}
        {/* Washes for legible type over the photograph: darker at the top for
            the header, at the foot and on the left for the title. */}
        <div
          aria-hidden
          className="absolute inset-0 -z-10 bg-linear-to-b from-ink/65 via-ink/15 to-ink/90"
        />
        <div
          aria-hidden
          className="absolute inset-0 -z-10 bg-linear-to-r from-ink/55 via-ink/10 to-transparent"
        />
        <Container className="pt-48 pb-14 sm:pb-20 lg:pb-24">
          <p className="text-[11.5px] font-semibold tracking-[0.28em] text-white/80 uppercase">
            The guest houses of IIT Palakkad
          </p>
          <h1
            id="hero-title"
            className="mt-5 max-w-[12ch] text-[clamp(50px,8.6vw,118px)] leading-[0.94] font-semibold tracking-[-0.03em] text-white"
          >
            {title}
          </h1>
          <div className="mt-10 flex flex-wrap items-end justify-between gap-x-10 gap-y-8">
            <div className="flex flex-wrap gap-3">
              <Link href="/book-room" className={siteButton.brand}>
                Book a room
              </Link>
              <Link href="/book-meal" className={siteButton.outlineLight}>
                Book meals
              </Link>
            </div>
            <p className="text-[13px] tracking-[0.12em] text-white/70 uppercase">
              Kanjikode · Palakkad · Kerala
            </p>
          </div>
        </Container>
      </section>

      {/* ----------------------------------------------------------- intro */}
      <section aria-label="About the guest houses" className="py-[clamp(88px,12vw,168px)]">
        <Container className="grid gap-x-16 gap-y-10 lg:grid-cols-12">
          <div className="lg:col-span-2">
            <Image
              src="/iitpkd-logo.png"
              alt=""
              width={56}
              height={56}
              className="size-12 lg:size-14"
            />
          </div>
          <div className="lg:col-span-9">
            <p className="text-[clamp(26px,3.3vw,42px)] leading-[1.24] font-normal tracking-[-0.012em] text-ink font-heading">
              The institute&rsquo;s guest houses welcome visiting faculty, collaborators and
              examiners, and the families of our students and staff.
            </p>
            <div className="mt-10">
              <ArrowLink href="/guidelines">Before you book, read the guidelines</ArrowLink>
            </div>
          </div>
        </Container>
      </section>

      {/* ----------------------------------------------- the guest houses */}
      {houses.length > 0 && (
        <section aria-labelledby="houses-title" className="grid bg-ink lg:grid-cols-2">
          <div className="relative min-h-[320px] sm:min-h-[460px] lg:min-h-[700px]">
            {HOME_PHOTOS.houses.src && (
              <Image
                src={HOME_PHOTOS.houses.src}
                alt={HOME_PHOTOS.houses.alt}
                fill
                sizes="(min-width: 1024px) 50vw, 100vw"
                className="object-cover"
              />
            )}
          </div>
          <div className="flex flex-col justify-center px-[clamp(20px,6vw,104px)] py-[clamp(64px,9vw,128px)] text-white">
            <Label className="text-saffron">Where you stay</Label>
            <h2
              id="houses-title"
              className="mt-4 text-[clamp(32px,3.8vw,50px)] leading-[1.04] font-semibold tracking-[-0.02em] text-white"
            >
              The guest houses
            </h2>
            <ul className="mt-12 border-t border-white/15">
              {houses.map((house) => (
                <li
                  key={house.id}
                  className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 border-b border-white/15 py-7"
                >
                  <span className="font-heading text-[clamp(30px,3.4vw,44px)] leading-none font-semibold tracking-[-0.015em]">
                    {house.name}
                  </span>
                  <span className="text-[11px] font-semibold tracking-[0.24em] text-on-ink uppercase">
                    {house.serves_meals ? "Rooms · Dining" : "Rooms"}
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-12">
              <Link href="/book-room" className={siteButton.light}>
                Book a room
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* ---------------------------------------------------------- mosaic */}
      <section aria-labelledby="spaces-title" className="py-[clamp(88px,12vw,168px)]">
        <Container>
          <SectionHead
            id="spaces-title"
            label="Rooms & spaces"
            title="Inside the guest houses"
            link={{ href: "/gallery", label: "View the gallery" }}
          />
          <div className="mt-12 grid grid-cols-2 gap-3 sm:gap-4 md:h-[clamp(480px,54vw,720px)] md:grid-cols-4 md:grid-rows-2">
            {HOME_PHOTOS.mosaic.map((photo, i) => (
              <SitePhotoFrame
                key={photo.alt}
                photo={photo}
                sizes={i === 0 || i === 3 ? "(min-width: 768px) 50vw, 100vw" : "(min-width: 768px) 25vw, 50vw"}
                className={cn("h-full", MOSAIC[i])}
              />
            ))}
          </div>
        </Container>
      </section>

      {/* ------------------------------------------------------- amenities */}
      <section aria-labelledby="amenities-title" className="bg-band py-[clamp(80px,10vw,144px)]">
        <Container className="grid gap-x-16 gap-y-12 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <SectionHead id="amenities-title" label="Amenities" title="For a comfortable stay" />
          </div>
          <ul className="grid grid-cols-2 border-t border-l border-border-strong/60 sm:grid-cols-3 lg:col-span-8">
            {amenities(houses).map((item) => {
              const Icon = AMENITY_ICONS[item.key] ?? ConciergeBell;
              return (
                <li
                  key={item.key}
                  className="flex flex-col gap-5 border-r border-b border-border-strong/60 px-[clamp(14px,2vw,24px)] py-8"
                >
                  <Icon aria-hidden className="size-7 text-vermilion" strokeWidth={1.35} />
                  <span className="text-[15px] font-medium text-ink">{item.label}</span>
                </li>
              );
            })}
          </ul>
        </Container>
      </section>

      {/* --------------------------------------------------------- closing */}
      <section aria-labelledby="visit-title" className="relative isolate overflow-hidden bg-ink">
        {HOME_PHOTOS.closing.src && (
          <Image
            src={HOME_PHOTOS.closing.src}
            alt=""
            fill
            sizes="100vw"
            className="-z-10 object-cover"
          />
        )}
        <div aria-hidden className="absolute inset-0 -z-10 bg-linear-to-r from-ink/85 via-ink/65 to-ink/40" />
        <Container className="flex flex-wrap items-end justify-between gap-x-12 gap-y-10 py-[clamp(96px,13vw,184px)] text-white">
          <div className="min-w-0">
            <h2
              id="visit-title"
              className="text-[clamp(38px,5.4vw,70px)] leading-[1] font-semibold tracking-[-0.025em] text-white"
            >
              Planning a visit?
            </h2>
            <p className="mt-5 max-w-[44ch] text-[17px] leading-[1.6] text-white/85">
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
        </Container>
      </section>
    </>
  );
}
