import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, CalendarCheck2, Mail, MapPin, Navigation, Phone } from "lucide-react";
import { Container, PageHero, siteButton } from "@/components/site/site-ui";
import { GUEST_HOUSE_CONTACT, GUEST_HOUSE_MAP, PHOTOS } from "@/lib/site";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Contact us" };

const CARD = "rounded-3xl bg-white p-6 shadow-soft ring-1 ring-border";
const ICON_WRAP =
  "mb-5 inline-flex size-12 items-center justify-center rounded-2xl bg-vermilion-soft text-vermilion-deep";
const LABEL = "text-[11px] font-bold tracking-[0.16em] text-muted-foreground uppercase";
const LINK = "font-semibold text-foreground underline-offset-4 transition-colors hover:text-vermilion-deep hover:underline";

export default function ContactPage() {
  return (
    <>
      <PageHero
        eyebrow="Contact us"
        title="We're here to help"
        photo={PHOTOS.block}
        intro="Reach the guest house office for anything about your stay. Rooms and meals themselves are requested online."
      />

      <Container className="py-[clamp(48px,7vw,96px)]">
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(240px,100%),1fr))] gap-5">
          <div className={CARD}>
            <span className={ICON_WRAP}>
              <MapPin aria-hidden className="size-6" />
            </span>
            <p className={LABEL}>Address</p>
            <address className="mt-2 text-[15.5px] leading-[1.6] text-foreground not-italic">
              {GUEST_HOUSE_CONTACT.address.map((line) => (
                <span key={line} className="block">
                  {line}
                </span>
              ))}
            </address>
          </div>
          <div className={CARD}>
            <span className={ICON_WRAP}>
              <Phone aria-hidden className="size-6" />
            </span>
            <p className={LABEL}>Front office</p>
            <p className="mt-2 text-[17px]">
              <a href={GUEST_HOUSE_CONTACT.phoneHref} className={LINK}>
                {GUEST_HOUSE_CONTACT.phone}
              </a>
            </p>
          </div>
          <div className={CARD}>
            <span className={ICON_WRAP}>
              <Mail aria-hidden className="size-6" />
            </span>
            <p className={LABEL}>Email</p>
            <p className="mt-2 text-[17px] break-all">
              <a href={`mailto:${GUEST_HOUSE_CONTACT.email}`} className={LINK}>
                {GUEST_HOUSE_CONTACT.email}
              </a>
            </p>
          </div>
          <div className={cn(CARD, "bg-ink text-white ring-ink")}>
            <span className="mb-5 inline-flex size-12 items-center justify-center rounded-2xl bg-white/10 text-saffron">
              <CalendarCheck2 aria-hidden className="size-6" />
            </span>
            <p className="text-[11px] font-bold tracking-[0.16em] text-saffron uppercase">Bookings</p>
            <p className="mt-2 text-[15px] leading-[1.6] text-white/75">
              Rooms and meals are requested through the{" "}
              <Link href="/book-room" className="font-semibold text-white underline underline-offset-4 hover:text-saffron">
                booking pages
              </Link>
              . Telephone bookings are not taken.
            </p>
          </div>
        </div>

        <section
          aria-labelledby="map-heading"
          className="reveal mt-6 overflow-hidden rounded-[clamp(24px,3vw,36px)] bg-band shadow-soft ring-1 ring-border"
        >
          <h2 id="map-heading" className="sr-only">
            Location
          </h2>
          <iframe
            title={GUEST_HOUSE_MAP.title}
            src={GUEST_HOUSE_MAP.embedUrl}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            className="block h-[clamp(300px,55vw,500px)] w-full border-0"
          />
          <div className="flex flex-wrap items-center justify-between gap-4 bg-white px-[clamp(16px,3vw,28px)] py-5">
            <p className="flex items-center gap-2.5 text-[15px] font-semibold text-foreground">
              <MapPin aria-hidden className="size-5 text-vermilion" />
              IIT Palakkad, Kanjikode
            </p>
            <div className="flex flex-wrap gap-3">
              <a
                href={GUEST_HOUSE_MAP.openUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(siteButton.outline, "min-h-11 px-5 text-[14px]")}
              >
                Open in Google Maps <ArrowUpRight aria-hidden className="size-4" />
              </a>
              <a
                href={GUEST_HOUSE_MAP.directionsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(siteButton.primary, "min-h-11 px-5 text-[14px]")}
              >
                Get directions <Navigation aria-hidden className="size-4" />
              </a>
            </div>
          </div>
        </section>
      </Container>
    </>
  );
}
