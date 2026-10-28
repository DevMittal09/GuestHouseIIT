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
import { amenities, homeIntro } from "@/lib/site-content";
import { getSiteGuestHouses, type SiteGuestHouse } from "@/lib/site-data";
import { cn } from "@/lib/utils";

/**
 * The page is rendered per request - the header greets whoever is signed in -
 * but what it *says* comes from `lib/site-data.ts`, which holds its answers
 * for half an hour under the `site` cache tag (Phase 9).
 * `revalidateEverything()` drops that tag the moment a guest house changes.
 *
 * **28 Oct 2026 - six blocks**, after the owner named the Taramani Guest
 * House (IIT Madras) site a second time: the page "looks very basic... make
 * it look creative and aesthetic". The hero and the four sections under it
 * were the owner's own order of 27 Oct; what this round changes is the
 * hero's weight, an opening statement where the page used to drop straight
 * into icons, and the composition of everything below it.
 *
 * | Block | Where it stands now |
 * | --- | --- |
 * | Hero | The photograph **fills the first viewport** under the opaque charcoal masthead; two slides, no visible controls - the photograph is the pause control. Over it: the institute's name in tracked saffron capitals **between two saffron hairlines**, the `<h1>` **Guest House Portal** in bold, a vermilion stub, the lead, and two solid doors - vermilion and saffron. `components/site/hero-carousel.tsx` |
 * | Staying on campus | **New.** A computed sentence about the place (`homeIntro`), with one contained photograph beside it and a saffron corner mark offset from it |
 * | Amenities | The same six, from `amenities()`, in one ruled strip - now **on ink, with saffron icons**: the page's one dark band between the hero and the footer |
 * | A look inside | The six photographs as a **mosaic of four spans across twelve columns**, not a strip of equal thumbnails. **The one section left aligned**, because its heading carries the line to the Gallery |
 * | Our guest houses | **One ruled plate of two cells, centred**: the name at display size over a saffron stub, and the doors that apply to it. Still text only - no photograph, no label, no summary line |
 * | Contact us | **Centred**: the manager's line, the email and the address as one ruled band of three, then one map per guest house |
 *
 * **The device language is three deep, and nothing else.** A tracked label
 * over a serif heading over a short mark; a ruled plate whose cells are
 * divided by hairlines (the amenities, the guest houses, the contact
 * details); and photographs composed rather than listed. A page reads as
 * designed when it repeats a few devices deliberately, and as assembled when
 * every block invents one.
 *
 * **What was taken from Taramani and what was not.** Theirs: the serif
 * display face over tracked small capitals, a warm ground, a deep
 * institutional colour answered by a gold, and photographs composed rather
 * than listed. Not theirs: the drop shadows, the gradients, the pill corners
 * and the 16px radii - this project has banned all four since 30 Sep 2026,
 * and they are what a page looks like when it was assembled rather than
 * designed.
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

const SECTION = "py-[clamp(56px,7vw,104px)]";

/**
 * The gallery mosaic, in a twelve-column grid three rows deep (28 Oct 2026).
 *
 * The spans are written out rather than derived because the point of them is
 * that no two neighbouring frames are the same shape: 5x2 beside 7, then 3
 * and 4, then 7 and 5. They tile the twelve columns exactly, in this order,
 * so auto-placement leaves no hole - which is why the order matters and why a
 * seventh photograph would need the pattern rethought rather than appended
 * to. Below `lg` it is two columns, with the first and last spanning both so
 * the strip opens and closes on a picture rather than on a postage stamp.
 */
const MOSAIC = [
  "col-span-2 lg:col-span-5 lg:row-span-2",
  "lg:col-span-7",
  "lg:col-span-3",
  "lg:col-span-4",
  "lg:col-span-7",
  "col-span-2 lg:col-span-5",
];

/** The wide frames of the mosaic - the ones that get a landscape crop on a phone. */
const WIDE = new Set([0, 1, 4, 5]);

export default async function HomePage() {
  const houses = await getSiteGuestHouses();
  const pins = guestHouseMapPins(houses.map((h) => h.name));
  const intro = homeIntro(houses);

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
        <div className="mx-auto max-w-[920px] text-center">
          {/* A tracked line of the institute's own name over the title: the
              hierarchy the owner asked for is three steps, not two, and this
              is the one fact the title no longer carries. Saffron is the
              emblem's colour and holds 8.4:1 on the wash. The two hairlines
              are the device the institute's own headings use, and they are
              dropped below `sm` where the line itself has to wrap. */}
          <p className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-[clamp(11px,0.6rem+0.3vw,13px)] font-semibold tracking-[0.3em] text-saffron uppercase">
            <span aria-hidden className="hidden h-px w-10 shrink-0 bg-saffron/60 sm:block" />
            <span>Indian Institute of Technology Palakkad</span>
            <span aria-hidden className="hidden h-px w-10 shrink-0 bg-saffron/60 sm:block" />
          </p>
          {/* **"Guest House Portal"** (28 Oct 2026, the owner). It was "IIT
              Palakkad - Guest House", which said the institute's name twice -
              the line above it says it in full - and spent the page's largest
              type on an abbreviation. What is left names the thing the reader
              has arrived at, in one line at every width, and carries the
              weight the owner asked for: **bold**, where every other heading
              on the site is semibold. The separator that had to be hidden on
              a phone goes with the words it separated. */}
          <h1 className="mt-7 text-hero font-bold text-white">Guest House Portal</h1>
          <div aria-hidden className="mx-auto mt-8 h-[3px] w-14 bg-vermilion" />
          <p className="mx-auto mt-8 max-w-[56ch] text-[clamp(17.5px,0.95rem+0.55vw,21px)] leading-[1.55] text-white">
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

      {/* ----------------------------------------------- staying on campus */}
      {/* **The page's opening statement** (28 Oct 2026). Under the hero there
          was nothing to read: the next thing a reader met was six icons, and
          a page whose first words are "Air-conditioned rooms" reads as a
          template whatever is drawn around it. The sentence is computed from
          the store (`homeIntro`) so it cannot claim a guest house the office
          has closed, and the photograph beside it is in neither the hero nor
          the mosaic below. The corner mark is the one piece of decoration on
          the page: two saffron rules offset from the frame, which is how an
          editorial page says "this picture was placed" without a shadow. */}
      <section aria-labelledby="welcome-title" className={SECTION}>
        <Container>
          <div className="grid items-center gap-x-[clamp(32px,5vw,72px)] gap-y-10 lg:grid-cols-12">
            {/* Five columns against seven: the text measures about 45
                characters at the width the column gives it, so it needs no cap
                of its own once the grid is doing the measuring - the cap is
                for the single-column layout below `lg`, where it would
                otherwise run the width of a tablet. */}
            <div className="min-w-0 lg:col-span-5">
              <SectionHead id="welcome-title" label="Welcome" title={intro.title} />
              <div className="mt-8 max-w-[46ch] space-y-5 lg:max-w-none">
                {intro.body.map((line) => (
                  <p key={line} className="text-[17.5px] leading-[1.7] text-body">
                    {line}
                  </p>
                ))}
              </div>
            </div>
            <div className="relative min-w-0 lg:col-span-7">
              <SitePhotoFrame
                photo={HOME_PHOTOS.intro}
                aspect="3/2"
                sizes="(min-width: 1024px) 660px, 100vw"
              />
              <div
                aria-hidden
                className="pointer-events-none absolute -bottom-3.5 -left-3.5 hidden size-24 border-b-[3px] border-l-[3px] border-saffron lg:block"
              />
            </div>
          </div>
        </Container>
      </section>

      {/* -------------------------------------------------------- amenities */}
      {/* A ruled strip rather than floating cards: one border, hairlines
          between the cells (the 1px gap over a ground the cells sit on).
          `amenities()` always returns six, so 2, 3 and 6 columns leave no
          empty cell showing the ground through. The cells are centred - the
          icon over its label - which is what makes six of them fit one row
          at full width and keeps the section short.

          **On ink since 28 Oct 2026**, with the icons in the emblem's
          saffron. It is the page's one dark band between the hero and the
          footer, and it is what the page was missing: six light sections in a
          row have no spine, and a deep institutional colour answered by a
          gold is the one device worth taking from the site the owner named. */}
      <section aria-labelledby="amenities-title" className={`bg-ink ${SECTION}`}>
        <Container>
          <SectionHead
            id="amenities-title"
            label="Facilities"
            title="Amenities"
            align="center"
            tone="dark"
          />
          <ul className="mx-auto mt-12 grid max-w-[1040px] grid-cols-2 gap-px overflow-hidden rounded-lg border border-white/15 bg-white/15 sm:grid-cols-3 lg:grid-cols-6">
            {amenities(houses).map((item) => {
              const Icon = AMENITY_ICONS[item.key] ?? ConciergeBell;
              return (
                <li
                  key={item.key}
                  className="flex flex-col items-center gap-4 bg-ink px-4 py-10 text-center"
                >
                  <Icon aria-hidden className="size-[30px] shrink-0 text-saffron" strokeWidth={1.25} />
                  <span className="text-[14.5px] leading-[1.35] font-medium text-white">
                    {item.label}
                  </span>
                </li>
              );
            })}
          </ul>
        </Container>
      </section>

      {/* ---------------------------------------------------------- gallery */}
      {/* **Left, and composed rather than listed.** Six equal thumbnails in a
          row was a contact sheet; two bands of unequal widths on one height
          was better and still a strip. It is a mosaic now - `MOSAIC` above
          holds the spans and says why they are written out - on the warm
          band, so the photographs sit on a ground rather than on white. The
          heading keeps its line to the Gallery at the right, which is why
          this is the one section that is not centred. */}
      <section aria-labelledby="gallery-title" className={`bg-band ${SECTION}`}>
        <Container>
          <SectionHead
            id="gallery-title"
            label="Gallery"
            title="A look inside"
            link={{ href: "/gallery", label: "See the full gallery" }}
          />
          <ul className="mt-12 grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-12 lg:auto-rows-[clamp(132px,10.5vw,170px)]">
            {HOME_PHOTOS.preview.map((photo, i) => (
              <li key={photo.alt} className={cn("min-w-0", MOSAIC[i])}>
                <SitePhotoFrame
                  photo={photo}
                  sizes={
                    WIDE.has(i)
                      ? "(min-width: 1024px) 620px, (min-width: 640px) 50vw, 100vw"
                      : "(min-width: 1024px) 320px, (min-width: 640px) 50vw, 50vw"
                  }
                  className={cn(
                    WIDE.has(i) ? "aspect-[16/9]" : "aspect-[4/3]",
                    "lg:aspect-auto lg:h-full"
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
          house's name.

          **One plate of two cells** since 28 Oct 2026, the same device as the
          amenities above and the contact details below, with the name at
          display size over a saffron stub. Two near-empty bordered boxes with
          a hairline of space between them was the most basic block on the
          page; one plate divided by a hairline is a composition, and it sets
          the names two steps larger than they were. */}
      {houses.length > 0 && (
        <section aria-labelledby="houses-title" className={SECTION}>
          <Container>
            <SectionHead
              id="houses-title"
              label="Accommodation"
              title="Our guest houses"
              align="center"
            />
            <ul className="mx-auto mt-12 grid max-w-[960px] gap-px overflow-hidden rounded-lg border border-border-strong bg-border-strong sm:grid-cols-2">
              {houses.map((house) => (
                <HouseCell key={house.id} house={house} />
              ))}
            </ul>
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

          <ul className="mx-auto mt-12 grid max-w-[1000px] grid-cols-1 gap-px overflow-hidden rounded-lg border border-border-strong bg-border-strong sm:grid-cols-3">
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
 * One guest house: its name, and the doors that apply to it. One cell of the
 * plate the section draws, so it carries its own ground and no border - the
 * hairline between the two is the plate's.
 *
 * The meal door appears only where the guest house serves meals
 * (`serves_meals`, a column the console toggles) - at Bageshri there is no
 * kitchen, so a *Book a Meal* button there would be a promise the booking
 * form itself refuses. Both doors are the public sign-in pages, which is
 * where every other booking link on this site points; neither carries the
 * guest house, because the form asks for it and a student or an alumni
 * booking is narrowed to one house whatever the link said.
 */
function HouseCell({ house }: { house: SiteGuestHouse }) {
  return (
    <li className="flex min-w-0 flex-col items-center bg-white px-6 py-[clamp(36px,4.2vw,56px)] text-center">
      <h2 className="text-display font-semibold text-ink">{house.name}</h2>
      <div aria-hidden className="mt-6 h-[3px] w-10 bg-saffron" />
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link href="/book-room" className={siteButton.brand}>
          Book a Room
        </Link>
        {house.serves_meals && (
          <Link href="/book-meal" className={siteButton.outline}>
            Book a Meal
          </Link>
        )}
      </div>
    </li>
  );
}
