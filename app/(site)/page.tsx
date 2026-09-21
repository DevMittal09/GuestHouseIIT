import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  BedDouble,
  BookOpenText,
  ConciergeBell,
  Images,
  KeyRound,
  LogIn,
  MapPinned,
  Moon,
  NotebookPen,
  Presentation,
  ShieldCheck,
  Sun,
  Sunrise,
  UtensilsCrossed,
} from "lucide-react";
import {
  Accent,
  BulletList,
  Container,
  Eyebrow,
  SectionHeading,
  SitePhotoFrame,
  siteButton,
} from "@/components/site/site-ui";
import { StaySearch } from "@/components/site/stay-search";
import { MEAL_KEYS, MEAL_LABELS, MEAL_TIMES } from "@/lib/meals";
import { HOME_PHOTOS, PHOTOS } from "@/lib/site";
import { describeRooms, facilityCards, joinNames, servingHouses } from "@/lib/site-content";
import { getSiteGuestHouses, getSitePolicies } from "@/lib/site-data";
import { stayQueryString } from "@/lib/stay-query";
import { ADVANCE_BOOKING_WINDOW_MONTHS } from "@/lib/workflow";
import { cn } from "@/lib/utils";

const FACILITY_ICONS: Record<string, typeof BedDouble> = {
  Rooms: BedDouble,
  Dining: UtensilsCrossed,
  Work: Presentation,
  Services: ConciergeBell,
};

const MEAL_ICONS = { breakfast: Sunrise, lunch: Sun, dinner: Moon } as const;

const STEPS = [
  {
    icon: LogIn,
    title: "Sign in",
    body: "With your institute LDAP account, or Google with your institute address.",
  },
  {
    icon: NotebookPen,
    title: "Raise a request",
    body: "Choose the guest house, dates and rooms, add your guests and tick the meals you need.",
  },
  {
    icon: ShieldCheck,
    title: "Approval",
    body: "It reaches the right approver for your role, then the Guest House Manager. You are emailed at every step.",
  },
  {
    icon: KeyRound,
    title: "Rooms allotted",
    body: "The manager allots your rooms and confirms. Reception checks you in when you arrive.",
  },
];

const LINK_CARDS = [
  {
    href: "/guidelines",
    icon: BookOpenText,
    title: "Guidelines",
    body: "Who can book, approvals, check-in and cancellation.",
  },
  {
    href: "/gallery",
    icon: Images,
    title: "Gallery",
    body: "Rooms, suites, grounds and common spaces.",
  },
  {
    href: "/contact",
    icon: MapPinned,
    title: "Contact & directions",
    body: "The front office, email and the campus map.",
  },
];

/** The bento of photographs under "Rooms and spaces". */
const BENTO = [
  { photo: PHOTOS.bedroom, cell: "col-span-2 row-span-2", sizes: "(min-width: 768px) 50vw, 100vw" },
  { photo: PHOTOS.livingDining, cell: "col-span-2 md:col-span-2", sizes: "(min-width: 768px) 50vw, 100vw" },
  { photo: PHOTOS.lounge, cell: "col-span-1", sizes: "(min-width: 768px) 25vw, 50vw" },
  { photo: PHOTOS.meetingHall, cell: "col-span-1", sizes: "(min-width: 768px) 25vw, 50vw" },
];

export default async function HomePage() {
  const [houses, policies] = await Promise.all([getSiteGuestHouses(), getSitePolicies()]);
  const serving = servingHouses(houses);
  const totalRooms = houses.reduce((sum, h) => sum + h.activeRooms, 0);

  const stats = [
    houses.length > 0 && { value: String(houses.length), label: houses.length === 1 ? "Guest house" : "Guest houses" },
    totalRooms > 0 && { value: String(totalRooms), label: "Rooms on campus" },
    serving.length > 0 && { value: String(MEAL_KEYS.length), label: "Meals served daily" },
    {
      value: `${ADVANCE_BOOKING_WINDOW_MONTHS} ${ADVANCE_BOOKING_WINDOW_MONTHS === 1 ? "month" : "months"}`,
      label: "Advance booking window",
    },
  ].filter((s): s is { value: string; label: string } => Boolean(s));

  return (
    <>
      {/* ─── Hero ───────────────────────────────────────────── */}
      <section aria-labelledby="hero-title" className="px-[clamp(8px,1.6vw,20px)] pt-[clamp(8px,1.6vw,20px)]">
        <div className="relative isolate flex min-h-[clamp(560px,80svh,780px)] items-end overflow-hidden rounded-[clamp(20px,3vw,36px)] bg-ink">
          {HOME_PHOTOS.hero.src && (
            <Image
              src={HOME_PHOTOS.hero.src}
              alt={HOME_PHOTOS.hero.alt}
              fill
              preload
              sizes="100vw"
              className="-z-10 animate-drift object-cover"
            />
          )}
          <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-t from-ink via-ink/55 to-ink/10" />
          <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-r from-ink/70 via-ink/20 to-transparent" />
          <div aria-hidden className="grain absolute inset-0 -z-10" />

          <Container className="relative pt-28 pb-[clamp(96px,12vw,140px)]">
            <div className="max-w-[820px] animate-rise">
              <span className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-4 py-1.5 text-[13px] font-semibold text-white backdrop-blur-md">
                <span aria-hidden className="size-1.5 rounded-full bg-saffron" />
                IIT Palakkad · Kanjikode campus
              </span>
              <h1
                id="hero-title"
                className="text-[clamp(44px,7.4vw,92px)] leading-[0.98] font-semibold tracking-[-0.025em] text-white"
              >
                A calm place to stay, <Accent>right on campus.</Accent>
              </h1>
              <p className="mt-6 max-w-[56ch] text-[clamp(16.5px,1.7vw,19px)] leading-[1.65] text-white/80">
                Rooms for visiting faculty, project collaborators, candidates and family of the
                institute community{serving.length > 0 ? ", with dining available on request" : ""}.
              </p>
              <div className="mt-9 flex flex-wrap gap-3">
                <Link href="/book-room" className={siteButton.primary}>
                  Book a room <ArrowRight aria-hidden className="size-4" />
                </Link>
                <Link href="#rooms" className={siteButton.glass}>
                  Explore the rooms
                </Link>
              </div>
            </div>
          </Container>
        </div>
      </section>

      {/* ─── Booking bar + numbers ─────────────────────────── */}
      <Container className="relative z-10 -mt-[clamp(52px,6vw,64px)]">
        <StaySearch houses={houses} className="mx-auto max-w-[1040px] animate-rise [animation-delay:150ms]" />
        <p className="mx-auto mt-4 max-w-[1040px] px-2 text-center text-[13.5px] text-muted-foreground">
          You will sign in with your institute account next — your dates come with you.
        </p>

        {stats.length > 0 && (
          <dl className="mx-auto mt-14 grid max-w-[1040px] grid-cols-2 gap-y-8 md:grid-cols-4">
            {stats.map((stat, i) => (
              <div
                key={stat.label}
                className={cn("flex flex-col-reverse px-4 text-center", i > 0 && "md:border-l md:border-border")}
              >
                <dt className="mt-2 text-[13.5px] font-medium text-muted-foreground">{stat.label}</dt>
                <dd className="font-heading text-[clamp(38px,5vw,56px)] leading-none font-semibold text-foreground">
                  {stat.value}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </Container>

      {/* ─── The guest houses ─────────────────────────────── */}
      {houses.length > 0 && (
        <section aria-labelledby="guest-houses" className="reveal">
          <Container className="pt-[clamp(72px,10vw,120px)]">
            <SectionHeading
              id="guest-houses"
              eyebrow={houses.length === 1 ? "The guest house" : `${houses.length} guest houses`}
              title={
                houses.length === 1 ? (
                  houses[0].name
                ) : (
                  <>
                    {joinNames(houses.map((h) => h.name))}, <Accent>one welcome.</Accent>
                  </>
                )
              }
              intro="Run by the institute's guest house office. Pick the one your request is for; the Guest House Manager allots the rooms on approval."
            />
            <div className="mt-12 grid grid-cols-[repeat(auto-fit,minmax(min(340px,100%),1fr))] gap-6">
              {houses.map((house, i) => {
                const openTo = policies.routes
                  .filter((r) => r.guestHouses.includes(house.name))
                  .map((r) => r.label);
                const bookHref = `/book-room?${stayQueryString({ guestHouseId: house.id })}`;
                return (
                  <article
                    key={house.id}
                    className="group relative flex flex-col overflow-hidden rounded-3xl bg-white p-[clamp(24px,3vw,36px)] shadow-soft ring-1 ring-border transition-all duration-300 hover:-translate-y-1 hover:shadow-lift"
                  >
                    <div aria-hidden className="emblem-watermark absolute -top-10 -right-10 size-56 opacity-[0.06] transition-transform duration-700 group-hover:rotate-12" />
                    <div aria-hidden className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-vermilion to-saffron" />
                    <div className="flex items-start justify-between gap-4">
                      <span className="font-heading text-[15px] font-semibold text-vermilion-deep">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <span
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-semibold ring-1 ring-inset",
                          house.serves_meals
                            ? "bg-saffron-soft text-[#7a4a00] ring-saffron/30"
                            : "bg-band text-muted-foreground ring-border"
                        )}
                      >
                        {house.serves_meals ? (
                          <>
                            <UtensilsCrossed aria-hidden className="size-3.5" /> Meals served
                          </>
                        ) : (
                          "Rooms only"
                        )}
                      </span>
                    </div>
                    <h3 className="mt-6 text-[clamp(34px,4vw,46px)] leading-none font-semibold text-foreground">
                      {house.name}
                    </h3>
                    <p className="mt-3 text-[15px] text-body">{describeRooms(house)}</p>

                    <dl className="mt-7 grid grid-cols-3 divide-x divide-border rounded-2xl bg-band/70 py-4 text-center">
                      <div>
                        <dt className="text-[11px] font-bold tracking-[0.12em] text-muted-foreground uppercase">Rooms</dt>
                        <dd className="mt-1 font-heading text-[26px] font-semibold text-foreground">{house.activeRooms}</dd>
                      </div>
                      <div>
                        <dt className="text-[11px] font-bold tracking-[0.12em] text-muted-foreground uppercase">Double</dt>
                        <dd className="mt-1 font-heading text-[26px] font-semibold text-foreground">
                          {house.roomsByType.double_sharing}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[11px] font-bold tracking-[0.12em] text-muted-foreground uppercase">Single</dt>
                        <dd className="mt-1 font-heading text-[26px] font-semibold text-foreground">
                          {house.roomsByType.single}
                        </dd>
                      </div>
                    </dl>

                    {openTo.length > 0 && (
                      <div className="mt-6">
                        <p className="text-[11px] font-bold tracking-[0.14em] text-muted-foreground uppercase">
                          Can be requested by
                        </p>
                        <ul className="mt-2.5 flex flex-wrap gap-1.5">
                          {openTo.map((label) => (
                            <li
                              key={label}
                              className="rounded-full bg-white px-3 py-1 text-[12.5px] font-medium text-body ring-1 ring-border"
                            >
                              {label}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <Link
                      href={bookHref}
                      className="mt-auto inline-flex items-center gap-2 pt-8 text-[15px] font-semibold text-vermilion-deep transition-colors hover:text-vermilion-hover"
                    >
                      Request a room at {house.name}
                      <ArrowRight aria-hidden className="size-4 transition-transform duration-200 group-hover:translate-x-1" />
                    </Link>
                  </article>
                );
              })}
            </div>
          </Container>
        </section>
      )}

      {/* ─── Rooms and spaces (bento) ─────────────────────── */}
      <section id="rooms" aria-labelledby="rooms-title" className="reveal scroll-mt-28">
        <Container className="pt-[clamp(72px,10vw,120px)]">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <SectionHeading
              id="rooms-title"
              eyebrow="Rooms and spaces"
              title={
                <>
                  Rooms that feel <Accent>like home.</Accent>
                </>
              }
              // TODO(site): amenity copy, from the photographs and the guest
              // house page on iitpkd.ac.in — confirm with the office.
              intro="Air-conditioned rooms with attached bathrooms, suites with a living room and kitchenette, and a meeting hall for the work that brought you here."
            />
            <Link href="/gallery" className={siteButton.outline}>
              View the gallery <ArrowUpRight aria-hidden className="size-4" />
            </Link>
          </div>
          <div className="mt-12 grid auto-rows-[clamp(150px,20vw,250px)] grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
            {BENTO.map(({ photo, cell, sizes }) => (
              <figure key={photo.alt} className={cn("group relative m-0 min-w-0 overflow-hidden rounded-3xl", cell)}>
                <SitePhotoFrame
                  photo={photo}
                  sizes={sizes}
                  className="absolute inset-0 rounded-none"
                  imageClassName="transition-transform duration-700 ease-out group-hover:scale-105"
                />
                <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-ink/60 via-transparent to-transparent" />
                <figcaption className="absolute bottom-3 left-3 max-w-[calc(100%-24px)] truncate rounded-full bg-white/90 px-3.5 py-1.5 text-[12.5px] font-semibold text-foreground backdrop-blur-md">
                  {photo.alt}
                </figcaption>
              </figure>
            ))}
          </div>
        </Container>
      </section>

      {/* ─── Facilities ───────────────────────────────────── */}
      <section aria-labelledby="facilities" className="mt-[clamp(72px,10vw,120px)] bg-band">
        <Container className="reveal py-[clamp(64px,9vw,112px)]">
          <SectionHeading
            id="facilities"
            eyebrow="Facilities"
            align="center"
            title={
              <>
                Everything for a <Accent>comfortable stay.</Accent>
              </>
            }
          />
          <div className="mt-12 grid grid-cols-[repeat(auto-fit,minmax(min(250px,100%),1fr))] gap-5">
            {facilityCards(houses).map((card) => {
              const Icon = FACILITY_ICONS[card.kicker ?? ""] ?? ConciergeBell;
              return (
                <div
                  key={card.title}
                  className="rounded-3xl bg-white p-7 shadow-soft ring-1 ring-border transition-shadow duration-300 hover:shadow-lift"
                >
                  <span className="inline-flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br from-vermilion to-saffron text-white shadow-glow">
                    <Icon aria-hidden className="size-6" />
                  </span>
                  <Eyebrow rule={false} className="mt-6 flex">
                    {card.kicker}
                  </Eyebrow>
                  <h3 className="mt-1.5 mb-4 text-[24px] font-semibold text-foreground">{card.title}</h3>
                  <BulletList items={card.items} />
                </div>
              );
            })}
          </div>
        </Container>
      </section>

      {/* ─── How booking works (ink) ──────────────────────── */}
      <section aria-labelledby="how-it-works" className="relative isolate overflow-hidden bg-ink">
        <div aria-hidden className="emblem-watermark absolute -top-40 -left-40 -z-10 size-[620px] opacity-[0.05]" />
        <div aria-hidden className="absolute -right-40 -bottom-40 -z-10 size-[520px] rounded-full bg-vermilion/25 blur-[120px]" />
        <Container className="reveal py-[clamp(72px,10vw,120px)]">
          <SectionHeading
            id="how-it-works"
            tone="dark"
            eyebrow="How booking works"
            title={
              <>
                From request <Accent>to room key.</Accent>
              </>
            }
            intro="Requests are raised and approved online, with every step recorded and emailed to you."
          />
          <ol className="mt-14 grid grid-cols-[repeat(auto-fit,minmax(min(230px,100%),1fr))] gap-5">
            {STEPS.map((step, i) => (
              <li
                key={step.title}
                className="relative rounded-3xl border border-ink-line bg-white/[0.04] p-7 backdrop-blur-sm"
              >
                <div className="flex items-center justify-between">
                  <span className="inline-flex size-12 items-center justify-center rounded-2xl bg-white/10 text-saffron">
                    <step.icon aria-hidden className="size-6" />
                  </span>
                  <span className="font-heading text-[44px] leading-none font-semibold text-white/10">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                </div>
                <h3 className="mt-6 text-[22px] font-semibold text-white">{step.title}</h3>
                <p className="mt-2 text-[15px] leading-[1.65] text-white/65">{step.body}</p>
              </li>
            ))}
          </ol>

          {policies.routes.length > 0 && (
            <div className="mt-8 rounded-3xl border border-ink-line bg-white/[0.03] p-[clamp(20px,3vw,32px)]">
              <p className="text-[11px] font-bold tracking-[0.18em] text-saffron uppercase">
                Who approves your request
              </p>
              <ul className="mt-5 grid grid-cols-[repeat(auto-fit,minmax(min(330px,100%),1fr))] gap-x-8 gap-y-4">
                {policies.routes.map((route) => (
                  <li key={route.role} className="flex flex-wrap items-center gap-2 text-[14px]">
                    <span className="font-semibold text-white">{route.label}</span>
                    {route.approvers.map((approver) => (
                      <span key={approver} className="inline-flex items-center gap-2 text-white/65">
                        <ArrowRight aria-hidden className="size-3.5 text-vermilion" />
                        {approver}
                      </span>
                    ))}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Container>
      </section>

      {/* ─── Dining ───────────────────────────────────────── */}
      {serving.length > 0 && (
        <section aria-labelledby="dining" className="reveal">
          <Container className="grid items-center gap-[clamp(32px,6vw,80px)] pt-[clamp(72px,10vw,120px)] md:grid-cols-2">
            <SitePhotoFrame
              photo={PHOTOS.hall}
              aspect="5/4"
              sizes="(min-width: 768px) 50vw, 100vw"
              className="rounded-[32px] shadow-lift"
            />
            <div className="min-w-0">
              <SectionHeading
                id="dining"
                eyebrow="Dining"
                title={
                  <>
                    Meals at {joinNames(serving.map((h) => h.name))}, <Accent>planned ahead.</Accent>
                  </>
                }
                intro="Pick meals day by day when you request your room, so the kitchen has your numbers before you arrive. Every meal your stay covers starts ticked — untick what you will not need."
              />
              <ul className="mt-8 divide-y divide-border rounded-3xl bg-white shadow-soft ring-1 ring-border">
                {MEAL_KEYS.map((meal) => {
                  const Icon = MEAL_ICONS[meal];
                  return (
                    <li key={meal} className="flex items-center gap-4 px-6 py-4">
                      <span className="inline-flex size-10 items-center justify-center rounded-xl bg-saffron-soft text-[#8a5300]">
                        <Icon aria-hidden className="size-5" />
                      </span>
                      <span className="font-heading text-[20px] font-semibold text-foreground">
                        {MEAL_LABELS[meal]}
                      </span>
                      <span className="ml-auto text-[15px] font-semibold text-body tabular-nums">
                        {MEAL_TIMES[meal]}
                      </span>
                    </li>
                  );
                })}
              </ul>
              <Link href="/book-meal" className={cn(siteButton.dark, "mt-8")}>
                How meal booking works <ArrowRight aria-hidden className="size-4" />
              </Link>
            </div>
          </Container>
        </section>
      )}

      {/* ─── Closing call to action ───────────────────────── */}
      <section aria-labelledby="closing" className="reveal">
        <Container className="pt-[clamp(72px,10vw,120px)] pb-[clamp(64px,8vw,104px)]">
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(280px,100%),1fr))] gap-4">
            {LINK_CARDS.map((card) => (
              <Link
                key={card.href}
                href={card.href}
                className="group flex items-start gap-4 rounded-3xl bg-white p-6 shadow-soft ring-1 ring-border transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lift hover:ring-vermilion/40"
              >
                <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-2xl bg-vermilion-soft text-vermilion-deep transition-colors group-hover:bg-vermilion-deep group-hover:text-white">
                  <card.icon aria-hidden className="size-5" />
                </span>
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5 font-heading text-[21px] font-semibold text-foreground">
                    {card.title}
                    <ArrowUpRight aria-hidden className="size-4 opacity-0 transition-opacity group-hover:opacity-100" />
                  </span>
                  <span className="mt-1 block text-[14.5px] text-muted-foreground">{card.body}</span>
                </span>
              </Link>
            ))}
          </div>

          <div className="relative isolate mt-6 overflow-hidden rounded-[clamp(24px,3vw,36px)] bg-ink px-[clamp(24px,5vw,72px)] py-[clamp(48px,7vw,88px)]">
            {PHOTOS.gazebo.src && (
              <Image src={PHOTOS.gazebo.src} alt="" fill sizes="100vw" className="-z-10 object-cover opacity-40" />
            )}
            <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-r from-ink via-ink/80 to-ink/20" />
            <div className="max-w-[640px]">
              <h2 id="closing" className="text-[clamp(32px,4.4vw,52px)] leading-[1.05] font-semibold text-white">
                Your stay at IIT Palakkad <Accent>starts here.</Accent>
              </h2>
              <p className="mt-4 max-w-[52ch] text-[17px] leading-[1.65] text-white/75">
                Raise a request in a few minutes and follow it through approval to your room.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/book-room" className={siteButton.primary}>
                  Book a room <ArrowRight aria-hidden className="size-4" />
                </Link>
                <Link href="/contact" className={siteButton.glass}>
                  Contact the office
                </Link>
              </div>
            </div>
          </div>
        </Container>
      </section>
    </>
  );
}
