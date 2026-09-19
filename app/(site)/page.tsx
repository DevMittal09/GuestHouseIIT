import Link from "next/link";
import {
  BulletList,
  Container,
  Eyebrow,
  GoldRule,
  SectionTitle,
  SitePhotoFrame,
  siteButton,
} from "@/components/site/site-ui";
import { GUEST_HOUSE_PHOTOS, guestHouseSlug, HOME_PHOTOS } from "@/lib/site";
import { describeRooms, facilityCards, joinNames } from "@/lib/site-content";
import { getSiteGuestHouses } from "@/lib/site-data";

const LINK_CARDS = [
  {
    href: "/guidelines",
    title: "Guest house guidelines",
    body: "Who can book, approvals, check-in and cancellation.",
  },
  { href: "/gallery", title: "Gallery", body: "Rooms and common spaces in each guest house." },
  { href: "/contact", title: "Contact us", body: "Front office number, email and campus map." },
];

const COUNT_WORDS = ["no", "one", "two", "three", "four", "five", "six"];

export default async function HomePage() {
  const houses = await getSiteGuestHouses();

  return (
    <>
      <section className="border-b border-border bg-band">
        <Container className="grid grid-cols-[repeat(auto-fit,minmax(min(300px,100%),1fr))] items-center gap-10 pt-12 pb-[52px]">
          <div className="min-w-0">
            <GoldRule className="mb-5 h-1" />
            <h1 className="mb-[18px] text-[clamp(32px,4.4vw,48px)] leading-[1.15] font-semibold text-navy">
              Stay at the IIT Palakkad Guest House
            </h1>
            <p className="mb-7 max-w-[56ch] text-[17.5px] leading-[1.65] text-body">
              Rooms for visiting faculty, project collaborators, candidates and family of the
              institute community, with dining available on request.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link href="/book-room" className={siteButton.gold}>
                Book a room
              </Link>
              <Link href="/book-meal" className={siteButton.outline}>
                Book a meal
              </Link>
            </div>
          </div>
          <SitePhotoFrame photo={HOME_PHOTOS.hero} aspect="16/10" sizes="(min-width: 700px) 50vw, 100vw" priority />
        </Container>
      </section>

      <Container className="pt-9">
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(200px,100%),1fr))] gap-3.5">
          {HOME_PHOTOS.strip.map((photo) => (
            <SitePhotoFrame key={photo.alt} photo={photo} aspect="4/3" sizes="(min-width: 900px) 25vw, 50vw" />
          ))}
        </div>
      </Container>

      {houses.length > 0 && (
        <section aria-labelledby="guest-houses">
          <Container className="pt-16">
            <SectionTitle id="guest-houses">{joinNames(houses.map((h) => h.name))}</SectionTitle>
            <p className="mt-3.5 mb-[26px] text-[16.5px] text-muted-foreground">
              The institute&rsquo;s {COUNT_WORDS[houses.length] ?? houses.length} guest house
              {houses.length === 1 ? "" : "s"}.
            </p>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(min(280px,100%),1fr))] gap-6">
              {houses.map((house) => {
                const cover = GUEST_HOUSE_PHOTOS[guestHouseSlug(house.name)];
                return (
                  <figure
                    key={house.id}
                    className={
                      cover
                        ? "m-0 overflow-hidden rounded-[3px] border border-border"
                        : "m-0 rounded-[2px] border border-t-[3px] border-border border-t-gold"
                    }
                  >
                    {cover && (
                      <SitePhotoFrame
                        photo={cover}
                        aspect="4/3"
                        sizes="(min-width: 700px) 50vw, 100vw"
                        className="rounded-none"
                      />
                    )}
                    <figcaption className="px-[18px] py-4">
                      <span className="block font-heading text-[23px] font-semibold text-navy">
                        {house.name}
                      </span>
                      <span className="mt-1 block text-[15px] text-body">{describeRooms(house)}</span>
                      <span className="mt-1 block text-[15px] text-muted-foreground">
                        {house.serves_meals ? "Meals served on request" : "Rooms only — no meals served"}
                      </span>
                    </figcaption>
                  </figure>
                );
              })}
            </div>
          </Container>
        </section>
      )}

      <section aria-labelledby="facilities" className="mt-[72px] border-y border-border bg-band">
        <Container className="pt-14 pb-16">
          <SectionTitle id="facilities">Facilities available</SectionTitle>
          <div className="mt-8 grid grid-cols-[repeat(auto-fit,minmax(min(240px,100%),1fr))] gap-[18px]">
            {facilityCards(houses).map((card) => (
              <div
                key={card.title}
                className="rounded-[2px] border border-t-[3px] border-border border-t-gold bg-white px-[22px] pt-6 pb-7"
              >
                <Eyebrow>{card.kicker}</Eyebrow>
                <h3 className="mt-2.5 mb-4 text-[22px] font-semibold text-navy">{card.title}</h3>
                <BulletList items={card.items} />
              </div>
            ))}
          </div>
        </Container>
      </section>

      <Container className="grid grid-cols-[repeat(auto-fit,minmax(min(260px,100%),1fr))] gap-[18px] pt-14 pb-[72px]">
        {LINK_CARDS.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className="block rounded-[2px] border border-border bg-white p-[26px] no-underline transition-colors duration-150 hover:border-gold"
          >
            <span className="block font-heading text-[21px] font-semibold text-navy">{card.title}</span>
            <span className="mt-2 block text-[15px] text-muted-foreground">{card.body}</span>
          </Link>
        ))}
      </Container>
    </>
  );
}
