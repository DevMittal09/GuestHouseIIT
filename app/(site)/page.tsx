import Link from "next/link";
import {
  ConciergeBell,
  Refrigerator,
  ShowerHead,
  Snowflake,
  Tv,
  UtensilsCrossed,
  Wifi,
  type LucideIcon,
} from "lucide-react";
import { HeroCarousel } from "@/components/site/hero-carousel";
import {
  ArrowLink,
  Container,
  MapEmbed,
  SectionHead,
  SitePhotoFrame,
  siteButton,
} from "@/components/site/site-ui";
import { GUEST_HOUSE_CONTACT, guestHouseMapPins, HOME_PHOTOS } from "@/lib/site";
import { amenities } from "@/lib/site-content";
import { getSiteGuestHouses, type SiteGuestHouse } from "@/lib/site-data";
import { cn } from "@/lib/utils";

/**
 * The page is rendered per request - the header greets whoever is signed in -
 * but what it *says* comes from `lib/site-data.ts`, which holds its answers
 * for half an hour under the `site` cache tag (Phase 9).
 * `revalidateEverything()` drops that tag the moment a guest house changes.
 *
 * **27 Oct 2026 - cinematic, in five blocks**, and refined the same evening
 * against the Taramani Guest House (IIT Madras) site the owner named as the
 * standard. The order is the owner's own: a full-screen hero, amenities, a
 * gallery preview, the two guest houses, contact details with a map each.
 *
 * | Block | Where it stands now |
 * | --- | --- |
 * | Hero | The photograph **fills the first viewport** with the opaque charcoal masthead laid over it; two slides, no visible controls - the photograph is the pause control. Over it: the institute's name in tracked saffron capitals, the `<h1>`, a vermilion stub, the lead, and **two solid doors** - vermilion and saffron. `components/site/hero-carousel.tsx` |
 * | Amenities | The same six, from `amenities()`, in one ruled strip - **centred**, label and all |
 * | A look inside | Six photographs in **two bands of unequal widths**, not a row of equal thumbnails. **The one section left aligned**, because its heading carries the line to the Gallery |
 * | Our guest houses | **Text only and centred**: the name, and the doors that apply to it. No photograph, no "Rooms & dining" label, no summary line |
 * | Contact us | **Centred**: the manager's line, the email and the address as one ruled band of three, then one map per guest house |
 *
 * **What was taken from Taramani and what was not.** Theirs: the serif
 * display face over tracked small capitals, a warm ground, photographs
 * composed rather than listed, and a deep institutional colour answered by a
 * gold. Not theirs: the drop shadows, the gradients, the pill corners and the
 * 16px radii - this project has banned all four since 30 Sep 2026, and they
 * are what a page looks like when it was assembled rather than designed.
 *
 * The content rules of 26-30 Sep all still hold: no figures, no requester
 * categories, no approval chains, no role names, no photograph captions, and
 * nothing promised that the office has not confirmed. The two guest house
 * names come from the store, and the only photographs tied to a named house
 * are the two the owner attributed on 15 Oct 2026 - which is what the hero
 * now shows.
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

const SECTION = "py-[clamp(48px,6vw,88px)]";

export default async function HomePage() {
  const houses = await getSiteGuestHouses();
  const pins = guestHouseMapPins(houses.map((h) => h.name));

  return (
    <>
      {/* ------------------------------------------------------------- hero */}
      {/* The title is the page's only `<h1>` and sits in the middle of the
          photograph, which is what makes a full-screen one work this time:
          in September it was a picture with the page beginning underneath
          it. The two doors are the same two the owner asked to make more
          prominent on 26 Sep 2026, and they point at the same public
          sign-in doors as the navigation. */}
      <HeroCarousel photos={HOME_PHOTOS.slides}>
        <div className="mx-auto max-w-[880px] text-center">
          {/* A tracked line of the institute's own name over the title: the
              hierarchy the owner asked for is three steps, not two, and this
              is the one fact the title abbreviates. Saffron is the emblem's
              colour and carries 8.4:1 on the wash. */}
          <p className="text-[clamp(11px,0.6rem+0.3vw,13px)] font-semibold tracking-[0.3em] text-saffron uppercase">
            Indian Institute of Technology Palakkad
          </p>
          {/* The separator is dropped below `sm` rather than left at the end
              of a line: wrapped, "IIT Palakkad -" over "Guest House" reads as
              a hyphenated word. Hidden, not removed, so the two halves still
              stack as one heading. */}
          <h1 className="mt-6 flex flex-wrap items-baseline justify-center gap-x-5 text-hero font-semibold text-white">
            <span>IIT Palakkad</span>
            <span aria-hidden className="hidden text-saffron sm:inline">-</span>
            <span>Guest House</span>
          </h1>
          <div aria-hidden className="mx-auto mt-8 h-[3px] w-14 bg-vermilion" />
          <p className="mx-auto mt-8 max-w-[58ch] text-[clamp(17.5px,0.95rem+0.55vw,21px)] leading-[1.55] font-light text-white">
            An integrated booking portal for comfortable guest accommodation and convenient meal
            reservations at IIT Palakkad.
          </p>
          <div className="mt-11 flex flex-wrap justify-center gap-4">
            <Link href="/book-room" className={`pointer-events-auto ${siteButton.brand}`}>
              Book a Room
            </Link>
            <Link href="/book-meal" className={`pointer-events-auto ${siteButton.saffron}`}>
              Book a Meal
            </Link>
          </div>
        </div>
      </HeroCarousel>

      {/* -------------------------------------------------------- amenities */}
      {/* A ruled strip rather than floating cards: one border, hairlines
          between the cells (the 1px gap over a border-coloured ground).
          `amenities()` always returns six, so 2, 3 and 6 columns leave no
          empty cell showing the ground through. The cells are centred - the
          icon over its label - which is what makes six of them fit one row
          at full width and keeps the section short. */}
      <section aria-labelledby="amenities-title" className={`bg-band ${SECTION}`}>
        <Container>
          <SectionHead id="amenities-title" label="Facilities" title="Amenities" align="center" />
          <ul className="mx-auto mt-10 grid max-w-[1040px] grid-cols-2 gap-px overflow-hidden rounded-lg border border-border-strong bg-border-strong sm:grid-cols-3 lg:grid-cols-6">
            {amenities(houses).map((item) => {
              const Icon = AMENITY_ICONS[item.key] ?? ConciergeBell;
              return (
                <li
                  key={item.key}
                  className="flex flex-col items-center gap-3.5 bg-white px-4 py-8 text-center"
                >
                  <Icon aria-hidden className="size-[26px] shrink-0 text-vermilion-deep" strokeWidth={1.25} />
                  <span className="text-[14.5px] leading-[1.35] font-medium text-ink">{item.label}</span>
                </li>
              );
            })}
          </ul>
        </Container>
      </section>

      {/* ---------------------------------------------------------- gallery */}
      {/* **Left, and composed rather than listed** (27 Oct 2026). Six equal
          thumbnails in a row was a contact sheet; the owner asked for
          something curated, after the way the Taramani Guest House site
          sets its photographs. So the row is broken into two bands of
          unequal widths - wide, narrow, narrow / narrow, narrow, wide - on
          one fixed height, which reads as a composition and still measures
          two rows deep. The heading keeps its line to the Gallery at the
          right, which is why this is the one section that is not centred. */}
      <section aria-labelledby="gallery-title" className={SECTION}>
        <Container>
          <SectionHead
            id="gallery-title"
            label="Gallery"
            title="A look inside"
            link={{ href: "/gallery", label: "See the full gallery" }}
          />
          <ul className="mt-10 grid grid-cols-2 gap-2.5 sm:grid-cols-4 sm:gap-3 lg:auto-rows-[clamp(170px,15.5vw,215px)]">
            {HOME_PHOTOS.preview.map((photo, i) => (
              <li
                key={photo.alt}
                className={cn(
                  "min-w-0",
                  // 0 and 5 are the wide ones; on a phone the first spans
                  // the width, so the strip opens on a picture and not on
                  // two postage stamps.
                  i === 0 && "col-span-2",
                  i === 5 && "sm:col-span-2"
                )}
              >
                <SitePhotoFrame
                  photo={photo}
                  sizes={
                    i === 0 || i === 5
                      ? "(min-width: 1024px) 580px, (min-width: 640px) 50vw, 100vw"
                      : "(min-width: 1024px) 290px, (min-width: 640px) 25vw, 50vw"
                  }
                  className={cn(
                    "h-full",
                    i === 0 ? "aspect-[16/9] sm:aspect-auto" : "aspect-[4/3] sm:aspect-auto"
                  )}
                />
              </li>
            ))}
          </ul>
        </Container>
      </section>

      {/* ---------------------------------------------- the guest houses */}
      {/* Text only (27 Oct 2026): "two elegant, text-based cards - one for
          each guest house. Do not include images", and no "Rooms & dining"
          label or summary line either. What is left is the name and the
          doors that apply to it - `serves_meals` decides whether the meal
          door is one of them, as it does everywhere else; never the guest
          house's name. The two photographs the owner attributed are in the
          hero now, which is where this section's picture went. */}
      {houses.length > 0 && (
        <section aria-labelledby="houses-title" className={`bg-band ${SECTION}`}>
          <Container>
            <SectionHead
              id="houses-title"
              label="Accommodation"
              title="Our guest houses"
              align="center"
            />
            <div className="mx-auto mt-10 grid max-w-[920px] gap-5 sm:grid-cols-2">
              {houses.map((house) => (
                <HouseCard key={house.id} house={house} />
              ))}
            </div>
          </Container>
        </section>
      )}

      {/* ---------------------------------------------------------- contact */}
      {/* **Centred, and the details read as one line of three** (27 Oct
          2026). It was a column of three labelled blocks beside the maps,
          which is a form, not a contact card. The numbers are
          `GUEST_HOUSE_CONTACT`, the one place either is written down, and
          the maps are `guestHouseMapPins` - the same registry `/contact`
          reads, so a guest house without a pin is simply not on the page
          rather than borrowing another's. Nothing is printed under a map:
          the embed carries its own directions, and the name is the heading
          over it. */}
      <section aria-labelledby="contact-title" className={`bg-band ${SECTION}`}>
        <Container>
          <SectionHead id="contact-title" label="Contact" title="Contact us" align="center" />

          <ul className="mx-auto mt-10 grid max-w-[1000px] grid-cols-1 gap-px overflow-hidden rounded-lg border border-border-strong bg-border-strong sm:grid-cols-3">
            <li className="flex flex-col justify-center bg-white px-6 py-8 text-center">
              <p className="text-[11.5px] font-semibold tracking-[0.2em] text-vermilion-deep uppercase">
                {GUEST_HOUSE_CONTACT.phoneLabel}
              </p>
              <a
                href={GUEST_HOUSE_CONTACT.phoneHref}
                className="mt-3 block font-heading text-[clamp(20px,1.5vw,24px)] font-semibold text-ink tabular-nums hover:text-vermilion-deep"
              >
                {GUEST_HOUSE_CONTACT.phone}
              </a>
            </li>
            <li className="flex flex-col justify-center bg-white px-6 py-8 text-center">
              <p className="text-[11.5px] font-semibold tracking-[0.2em] text-vermilion-deep uppercase">
                Email
              </p>
              <a
                href={`mailto:${GUEST_HOUSE_CONTACT.email}`}
                className="mt-3 block font-heading text-[clamp(18px,1.4vw,22px)] font-semibold break-words text-ink hover:text-vermilion-deep"
              >
                {GUEST_HOUSE_CONTACT.email}
              </a>
            </li>
            <li className="flex flex-col justify-center bg-white px-6 py-8 text-center">
              <p className="text-[11.5px] font-semibold tracking-[0.2em] text-vermilion-deep uppercase">
                Address
              </p>
              <address className="mt-3 text-[15px] leading-[1.6] text-body not-italic">
                {GUEST_HOUSE_CONTACT.address.map((line) => (
                  <span key={line} className="block">
                    {line}
                  </span>
                ))}
              </address>
            </li>
          </ul>

          <ul className="mx-auto mt-5 grid max-w-[1000px] gap-5 sm:grid-cols-2">
            {pins.map((pin) => (
              <li
                key={pin.slug}
                className="flex min-w-0 flex-col overflow-hidden rounded-lg border border-border-strong bg-white"
              >
                <h3 className="px-5 pt-5 pb-4 text-center font-heading text-[19px] leading-tight font-semibold text-ink">
                  {pin.name}
                </h3>
                <MapEmbed pin={pin} className="min-h-[clamp(220px,24vw,280px)] flex-1 border-t border-border" />
              </li>
            ))}
          </ul>

          <p className="mt-9 text-center">
            <ArrowLink href="/guidelines">Read the guidelines</ArrowLink>
          </p>
        </Container>
      </section>
    </>
  );
}

/**
 * One guest house: its name, and the doors that apply to it.
 *
 * The meal door appears only where the guest house serves meals
 * (`serves_meals`, a column the console toggles) - at Bageshri there is no
 * kitchen, so a *Book a Meal* button there would be a promise the booking
 * form itself refuses. Both doors are the public sign-in pages, which is
 * where every other booking link on this site points; neither carries the
 * guest house, because the form asks for it and a student or an alumni
 * booking is narrowed to one house whatever the link said.
 */
function HouseCard({ house }: { house: SiteGuestHouse }) {
  return (
    <article className="flex min-w-0 flex-col items-center rounded-lg border border-border-strong bg-white px-6 py-[clamp(28px,3.4vw,44px)] text-center">
      <h2 className="text-title font-semibold text-ink">{house.name}</h2>
      <div aria-hidden className="mt-5 h-[3px] w-10 bg-vermilion" />
      <div className="mt-7 flex flex-wrap justify-center gap-3">
        <Link href="/book-room" className={siteButton.brand}>
          Book a Room
        </Link>
        {house.serves_meals && (
          <Link href="/book-meal" className={siteButton.outline}>
            Book a Meal
          </Link>
        )}
      </div>
    </article>
  );
}
