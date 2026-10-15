import Link from "next/link";
import {
  ArrowRight,
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
import { GUEST_HOUSE_CONTACT, HOME_PHOTOS, guestHousePhoto } from "@/lib/site";
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
      {/* -------------------------------------------- hero: the guest houses */}
      {/* One contained block: the ink masthead across the top - the headline
          in seven columns, the lead and the two doors in five - and under it
          a panel per guest house, each led by its own photograph. Two
          photographs at half the page width are the largest thing on the
          page, which is what "showcase them" asks for, and neither is
          full-bleed. */}
      <section aria-labelledby="hero-title" className="pt-[clamp(16px,3vw,40px)]">
        <Container>
          <div className="overflow-hidden rounded-lg border border-ink">
            <div className="bg-ink px-[clamp(22px,4vw,56px)] pt-[clamp(32px,5vw,60px)] pb-[clamp(28px,4vw,48px)]">
              <div className="grid gap-x-10 gap-y-9 lg:grid-cols-12">
                <div className="min-w-0 lg:col-span-7">
                  <Label className="text-saffron">IIT Palakkad</Label>
                  <h1
                    id="hero-title"
                    className="mt-5 text-[clamp(2.375rem,1.5rem+2.6vw,3.5rem)] leading-[1.04] font-semibold tracking-[-0.024em] text-white"
                  >
                    Guest houses of IIT&nbsp;Palakkad
                  </h1>
                  <div aria-hidden className="mt-7 h-1 w-12 bg-vermilion" />
                </div>
                <div className="flex min-w-0 flex-col lg:col-span-5 lg:self-end">
                  <p className="max-w-[42ch] text-[17.5px] leading-[1.6] text-on-ink">{lead}</p>
                  <div className="mt-7 flex flex-wrap gap-3">
                    <Link href="/book-room" className={siteButton.brand}>
                      Book a room
                    </Link>
                    <Link href="/book-meal" className={siteButton.outlineLight}>
                      Book meals
                    </Link>
                  </div>
                </div>
              </div>
              <p className="mt-10 flex flex-wrap items-center gap-x-2.5 gap-y-1 border-t border-white/15 pt-5 text-[14.5px] text-on-ink-muted">
                <Phone aria-hidden className="size-4 text-saffron" />
                {GUEST_HOUSE_CONTACT.phoneLabel}
                <a href={GUEST_HOUSE_CONTACT.phoneHref} className="font-semibold text-white tabular-nums hover:text-saffron">
                  {GUEST_HOUSE_CONTACT.phone}
                </a>
              </p>
            </div>
            {houses.length > 0 && (
              // Hairlines are each panel's own borders, not a `gap-px` over a
              // coloured ground: with an odd number of guest houses the ground
              // would show through the empty cell. `odd:` clears the left
              // border at the start of every row.
              <div className={houses.length > 1 ? "grid md:grid-cols-2" : "grid"}>
                {houses.map((house, i) => (
                  <HousePanel key={house.id} house={house} wide={houses.length === 1} priority={i < 2} />
                ))}
              </div>
            )}
          </div>
        </Container>
      </section>

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
 * One guest house in the hero block: its photograph, then its name under it.
 *
 * **The photograph is the house's own** (`guestHousePhoto`), and a house the
 * registry does not name renders the frame's placeholder rather than
 * borrowing another house's photograph - the card says "this is Bageshri",
 * so the wrong picture there would be a false statement, not a dull one.
 *
 * The name sits **under** the photograph, never over it: that is how
 * iitpkd.ac.in prints the title of a card, it needs no wash over the
 * architecture to stay legible, and it keeps the site's rule that no
 * photograph carries a visible caption - this is a heading, and the thing it
 * heads is the guest house, not the picture.
 */
function HousePanel({
  house,
  wide,
  priority,
}: {
  house: SiteGuestHouse;
  /** The only guest house, so it has the full width and a shallower crop. */
  wide: boolean;
  priority: boolean;
}) {
  const photo = guestHousePhoto(house.name);
  return (
    <article className="flex min-w-0 flex-col border-t border-border-strong bg-white md:border-l md:odd:border-l-0">
      <SitePhotoFrame
        photo={photo ?? { src: null, alt: house.name }}
        sizes={wide ? "(min-width: 1280px) 1160px, 100vw" : "(min-width: 1280px) 580px, (min-width: 768px) 50vw, 100vw"}
        priority={priority}
        className={wide ? "aspect-[3/2] rounded-none md:aspect-[5/2]" : "aspect-[3/2] rounded-none"}
      />
      <div className="px-[clamp(20px,2.6vw,36px)] pt-7 pb-8">
        <p className="mb-3 text-[12px] font-semibold tracking-[0.18em] text-vermilion-deep uppercase">
          {house.serves_meals ? "Rooms & dining" : "Rooms"}
        </p>
        <h2 className="text-title font-semibold text-ink">{house.name}</h2>
        <p className="mt-3 text-[15.5px] leading-[1.65] text-body">{houseSummary(house)}</p>
      </div>
      <div className="mt-auto border-t border-border px-[clamp(20px,2.6vw,36px)] py-4">
        <ArrowLink href="/book-room">Book a room</ArrowLink>
      </div>
    </article>
  );
}
