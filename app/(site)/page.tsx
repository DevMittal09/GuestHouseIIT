import Link from "next/link";
import {
  ArrowRight,
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
import { ArrowLink, Container, Label, SectionHead, SitePhotoFrame, siteButton } from "@/components/site/site-ui";
import { HOME_PHOTOS, guestHousePhoto } from "@/lib/site";
import { amenities, houseSummary, joinNames } from "@/lib/site-content";
import { getSiteGuestHouses, type SiteGuestHouse } from "@/lib/site-data";

/**
 * The page itself is rendered per request - the header greets whoever is
 * signed in - but what it *says* comes from `lib/site-data.ts`, which holds
 * its answers for half an hour under the `site` cache tag (Phase 9).
 * `revalidateEverything()` drops that tag the moment a guest house changes.
 *
 * Clean and institutional, the way peer guest houses (IIT Madras's Taramani
 * Guest House) and well-kept hotel sites present themselves (26 Sep 2026;
 * refined 30 Sep 2026 on a 12-column grid). Sections open on a hairline ink
 * rule with the label above it, the editorial habit of hotel sites, rather
 * than on floating boxes. Photographs stay inside the layout - a full-screen
 * photo read as "weird" to the owner. No figures, meal times, rules,
 * approval routes or requester categories: rules live on /guidelines, in
 * general terms, and the portal's internals stay in the portal. The
 * guest-house names come from the store.
 *
 * **15 Oct 2026, third pass - no ink panel, and the masthead centred.** The
 * owner: "Remove the black box of guest house of IIT Palakkad as it looks
 * unnecessary", then "remove the guest house manager number and all and also
 * center align everything. Left aligned looks kinda off." So the headline,
 * the lead and the two doors are centred plain type on the page's own
 * ground, and the office's number is **off this page** - nothing is lost,
 * because the site footer carries it on every page, and /contact, the
 * Guidelines and the portal footer each read the same
 * `GUEST_HOUSE_CONTACT`. The home page is simply no longer one of its
 * readers.
 *
 * **15 Oct 2026 - the guest houses are the hero.** The office sent a set of
 * photographs and the owner named two of them as the main photograph of each
 * guest house, asking for a layout that showcases them. So the page no longer
 * opens on a headline beside one decorative photograph and then repeats
 * itself in a section headed "Our guest houses": the masthead and the two
 * houses are **one block**, the ink panel across the top and a house under
 * each half of it, photograph first and the name under it. That is
 * iitpkd.ac.in's own card idiom - the image above, its title printed
 * underneath, never laid over it - and it is why the separate "Our guest
 * houses" heading went: the `<h1>` already reads "Guest houses of IIT
 * Palakkad".
 *
 * These are the first photographs on the site tied to a named guest house.
 * The attribution is the owner's, held in `GUEST_HOUSE_PHOTOS`, and it does
 * not extend past these two cards - the mosaic below and the Gallery stay
 * unattributed, and no photograph anywhere carries a visible caption.
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
      {/* --------------------------------------------------- hero slideshow */}
      {/* The owner asked for iitpkd.ac.in's hero: photographs that change by
          themselves, with arrows to move between them, and the details
          further down the page. So the page opens on the slideshow and the
          masthead follows it - photographs first, then who we are and the
          two doors. Contained in the grid like every other photograph on
          this site; a full-bleed one read as "so weird" to the owner. */}
      <section aria-label="Guest house photographs" className="pt-[clamp(16px,3vw,40px)]">
        <Container>
          <HeroCarousel photos={HOME_PHOTOS.slides} />
        </Container>
      </section>

      {/* ----------------------------------------------------------- masthead */}
      {/* **No ink panel** (15 Oct 2026, the owner: "Remove the black box of
          guest house of IIT Palakkad as it looks unnecessary"). The box is
          gone; what it carried is not, because it is the page's only `<h1>`,
          the two doors into the portal and the office's number. It is set as
          plain type on the page's own ground, in `PageMasthead`'s idiom -
          the title in seven columns, the lead under a vermilion rule in five
          - so the home page opens the way every inner page does. A second
          black slab directly under a photograph was carrying nothing the
          type could not. */}
      <section aria-labelledby="hero-title" className="pt-[clamp(40px,5vw,72px)]">
        <Container>
          {/* Centred, and the only centred block on the site (the owner:
              "center align everything. Left aligned looks kinda off"). It
              reads as a title page under the slideshow rather than as the
              first of the left-ruled sections below it, which all keep
              their alignment. */}
          <div className="mx-auto max-w-[780px] text-center">
            <Label>IIT Palakkad</Label>
            <h1
              id="hero-title"
              className="mt-4 text-[clamp(2.25rem,1.4rem+2.6vw,3.25rem)] leading-[1.04] font-semibold tracking-[-0.024em] text-ink"
            >
              Guest houses of IIT&nbsp;Palakkad
            </h1>
            <div aria-hidden className="mx-auto mt-7 h-1 w-12 bg-vermilion" />
            <p className="mx-auto mt-7 max-w-[54ch] text-[17px] leading-[1.6] text-body">{lead}</p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link href="/book-room" className={siteButton.brand}>
                Book a room
              </Link>
              <Link href="/book-meal" className={siteButton.outline}>
                Book meals
              </Link>
            </div>
          </div>
        </Container>
      </section>

      {/* ------------------------------------------------ the guest houses */}
      {/* Back to a section of its own now that the slideshow holds the top of
          the page. The two photographs lead the slideshow *and* their cards:
          the slideshow is a reel, and these are where each house is named -
          which is the only place on the site that says which guest house a
          photograph shows. */}
      {houses.length > 0 && (
        <section aria-labelledby="houses-title" className={SECTION}>
          <Container>
            <SectionHead id="houses-title" label="Accommodation" title="Our guest houses" />
            <div className="mt-9 grid gap-6 md:grid-cols-2">
              {houses.map((house) => (
                <HousePanel key={house.id} house={house} wide={houses.length === 1} />
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
          <ul className="mt-9 grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-border-strong bg-border-strong sm:grid-cols-2 lg:grid-cols-3">
            {amenities(houses).map((item) => {
              const Icon = AMENITY_ICONS[item.key] ?? ConciergeBell;
              return (
                <li key={item.key} className="flex items-center gap-4 bg-white px-6 py-6">
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
              two rows, the rest beside it - no captions (the owner), and
              nothing here is attributed to a guest house. The four are
              `HOME_PHOTOS.preview`, the set the owner asked to follow the two
              house photographs above. */}
          <ul className="mt-9 grid grid-cols-2 gap-3 sm:gap-4 lg:h-[clamp(420px,40vw,540px)] lg:grid-cols-12 lg:grid-rows-2">
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
              className="text-title font-semibold text-ink"
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
              { href: "/contact", label: "Contact us", detail: "The guest house office, and each guest house on the map" },
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

/**
 * One guest house: its photograph, then its name under it.
 *
 * **The photograph is the house's own** (`guestHousePhoto`), and a house the
 * registry does not name renders the frame's placeholder rather than
 * borrowing another house's - the card says "this is Bageshri", so the wrong
 * picture there would be a false statement, not a dull one.
 *
 * The name sits **under** the photograph, never over it: that is how
 * iitpkd.ac.in prints the title of a card, it needs no wash over the
 * architecture to stay legible, and it keeps the site's rule that no
 * photograph carries a visible caption - this is a heading, and the thing it
 * heads is the guest house, not the picture. These two cards are the only
 * place on the site that says which guest house a photograph shows; the
 * slideshow above and the Gallery say nothing.
 */
function HousePanel({
  house,
  wide,
}: {
  house: SiteGuestHouse;
  /** The only guest house, so it has the full width and a shallower crop. */
  wide: boolean;
}) {
  const photo = guestHousePhoto(house.name);
  return (
    <article className="flex min-w-0 flex-col overflow-hidden rounded-lg border border-border-strong bg-white">
      <SitePhotoFrame
        photo={photo ?? { src: null, alt: house.name }}
        sizes={wide ? "(min-width: 1280px) 1160px, 100vw" : "(min-width: 1280px) 580px, (min-width: 768px) 50vw, 100vw"}
        className={wide ? "aspect-[3/2] rounded-none md:aspect-[5/2]" : "aspect-[3/2] rounded-none"}
      />
      <div className="px-[clamp(20px,2.6vw,32px)] pt-7 pb-8">
        <p className="mb-3 text-[12px] font-semibold tracking-[0.18em] text-vermilion-deep uppercase">
          {house.serves_meals ? "Rooms & dining" : "Rooms"}
        </p>
        <h2 className="text-title font-semibold text-ink">{house.name}</h2>
        <p className="mt-3 text-[15.5px] leading-[1.65] text-body">{houseSummary(house)}</p>
      </div>
      <div className="mt-auto border-t border-border px-[clamp(20px,2.6vw,32px)] py-4">
        <ArrowLink href="/book-room">Book a room</ArrowLink>
      </div>
    </article>
  );
}
