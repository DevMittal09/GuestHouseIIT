import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Container, siteButton } from "@/components/site/site-ui";
import { NavBar, type NavItem } from "@/components/site/site-nav";
import {
  GUEST_HOUSE_CONTACT,
  HOW_TO_REACH_URL,
  INSTITUTE_CONTACT,
  INSTITUTE_MAP,
  INSTITUTE_WEBSITE,
  MRBS_URL,
  SITE_LINKS,
  type MapPin,
} from "@/lib/site";
import { instituteParts } from "@/lib/tz";
import { cn } from "@/lib/utils";

export const SITE_NAV: NavItem[] = [
  { href: "/", label: "Home" },
  { href: "/book-room", label: "Book a Room" },
  { href: "/book-meal", label: "Book Meal" },
  { href: "/guidelines", label: "Guidelines" },
  { href: "/gallery", label: "Gallery" },
  { href: "/contact", label: "Contact Us" },
];

function External({
  href,
  children,
  className,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn("inline-flex items-center gap-1", className)}
    >
      {children}
      <ArrowUpRight aria-hidden className="size-3.5 shrink-0 opacity-70" />
      <span className="sr-only">(opens in a new tab)</span>
    </a>
  );
}

/** The charcoal strip above the header, as on iitpkd.ac.in: address, the front office, the institute. */
export function UtilityStrip() {
  return (
    <div className="bg-ink text-[13px] text-on-ink">
      <Container className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 py-2">
        <a
          href={INSTITUTE_MAP.openUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-on-ink no-underline hover:text-white"
        >
          <span className="hidden sm:inline">Indian Institute of Technology Palakkad · </span>
          {INSTITUTE_CONTACT.addressLine}
        </a>
        <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <a href={GUEST_HOUSE_CONTACT.phoneHref} className="text-on-ink hover:text-white">
            <span className="text-on-ink-muted">Front office </span>
            {GUEST_HOUSE_CONTACT.phone}
          </a>
          <a href={`mailto:${GUEST_HOUSE_CONTACT.email}`} className="text-saffron hover:text-white">
            {GUEST_HOUSE_CONTACT.email}
          </a>
          <External href={INSTITUTE_WEBSITE} className="hidden text-on-ink hover:text-white md:inline-flex">
            iitpkd.ac.in
          </External>
        </span>
      </Container>
    </div>
  );
}

/**
 * The institute logo beside "Guest House" and a small-caps subtitle — the
 * guest house names on the public site, the page's purpose in the portal.
 */
export function BrandBlock({
  subtitle,
  href = "/",
  compact = false,
}: {
  subtitle: string;
  href?: string;
  /** The portal's working header: a smaller logo and title. */
  compact?: boolean;
}) {
  return (
    <Link href={href} className="flex min-w-0 items-center gap-x-[clamp(10px,2vw,18px)] no-underline">
      <Image
        src="/IITPKD_NEW_LOGO.png"
        alt="IIT Palakkad"
        // The file is 1912×1456; it is drawn about 90px wide. Declaring the
        // drawn size makes next/image send a 256/384px copy, not a 1920px one.
        width={132}
        height={100}
        priority
        className={cn(
          // A stacked logo (emblem over the name), so it needs more height
          // than the old wide banner did for the name to stay legible.
          "w-auto shrink-0 object-contain",
          compact ? "h-[clamp(42px,10vw,52px)]" : "h-[clamp(48px,11vw,66px)]"
        )}
      />
      <span className="block min-w-0 border-l border-border pl-[clamp(10px,2vw,18px)]">
        <span
          className={cn(
            "block font-heading leading-[1.1] font-semibold text-ink",
            compact ? "text-[20px]" : "text-[clamp(20px,2.4vw,25px)]"
          )}
        >
          Guest House
        </span>
        <span className="mt-1 block text-[11.5px] tracking-[0.14em] text-muted-foreground uppercase">
          {subtitle}
        </span>
      </span>
    </Link>
  );
}

/**
 * White header with the six pages in it. Below `lg` the links move to a
 * second row that scrolls sideways inside itself, so a phone gets one line of
 * links rather than a block of them.
 */
export function SiteHeader({
  subtitle,
  portal,
}: {
  subtitle: string;
  /** Where the signed-in visitor's portal is, or null when signed out. */
  portal: { href: string; name: string } | null;
}) {
  const account = portal ? (
    <Link href={portal.href} className={cn(siteButton.ink, "px-4 py-2.5 text-[14.5px]")}>
      My portal
      <span className="sr-only">({portal.name})</span>
    </Link>
  ) : (
    <Link href="/sign-in" className={cn(siteButton.outline, "px-4 py-2.5 text-[14.5px]")}>
      Sign in
    </Link>
  );

  return (
    <header className="border-b border-border bg-white">
      <Container className="flex items-stretch gap-x-4">
        <div className="flex min-w-0 flex-1 items-center py-4 lg:flex-none">
          <BrandBlock subtitle={subtitle} />
        </div>
        <NavBar items={SITE_NAV} label="Main" tone="light" className="ml-auto hidden lg:block" />
        <div className="flex shrink-0 items-center lg:pl-3">{account}</div>
      </Container>
      <div className="border-t border-border lg:hidden">
        <Container className="px-[clamp(6px,3vw,24px)]">
          <NavBar items={SITE_NAV} label="Main" tone="light" scroll />
        </Container>
      </div>
    </header>
  );
}

const FOOTER_LABEL = "mb-4 text-[12px] font-bold tracking-[0.14em] text-saffron uppercase";
const FOOTER_LINK = "text-on-ink hover:text-white";

export function SiteFooter({ pins }: { pins: MapPin[] }) {
  return (
    <footer className="bg-ink text-on-ink">
      {/* Lecture halls and meeting rooms are not booked here. Said at the
          foot of every page, because it is the most common wrong door. */}
      <div className="border-b border-white/15">
        <Container className="flex flex-wrap items-center justify-between gap-x-10 gap-y-4 py-7">
          <p className="max-w-[62ch] text-[16px] leading-[1.55]">
            <span className="font-semibold text-white">Booking a lecture hall or meeting room?</span>{" "}
            Those are reserved on the institute&rsquo;s Meeting Room Booking System, not here.
          </p>
          <a
            href={MRBS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(siteButton.outlineLight, "px-5 py-3 text-[14.5px]")}
          >
            Open MRBS
            <ArrowUpRight aria-hidden className="size-4" />
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        </Container>
      </div>

      <Container className="grid grid-cols-[repeat(auto-fit,minmax(min(220px,100%),1fr))] gap-x-10 gap-y-10 pt-14 pb-12">
        <div>
          <p className="mb-4 font-heading text-[24px] leading-tight font-semibold text-white">
            IIT Palakkad
            <br />
            Guest House
          </p>
          <address className="text-[15px] leading-[1.65] not-italic">
            {GUEST_HOUSE_CONTACT.address.map((line) => (
              <span key={line} className="block">
                {line}
              </span>
            ))}
          </address>
        </div>

        <div>
          <p className={FOOTER_LABEL}>Front office</p>
          <p className="text-[15px] leading-[1.9]">
            <a
              href={GUEST_HOUSE_CONTACT.phoneHref}
              className="font-heading text-[21px] font-semibold text-white tabular-nums hover:text-saffron"
            >
              {GUEST_HOUSE_CONTACT.phone}
            </a>
            <br />
            <a href={`mailto:${GUEST_HOUSE_CONTACT.email}`} className={FOOTER_LINK}>
              {GUEST_HOUSE_CONTACT.email}
            </a>
            <br />
            <Link href="/contact" className={FOOTER_LINK}>
              All contact details
            </Link>
          </p>
        </div>

        <div>
          <p className={FOOTER_LABEL}>Find us</p>
          <ul className="flex flex-col gap-3 text-[15px]">
            {pins.map((pin) => (
              <li key={pin.slug}>
                <span className="block font-semibold text-white">{pin.name}</span>
                <span className="flex flex-wrap gap-x-4">
                  <External href={pin.openUrl} className={FOOTER_LINK}>
                    Map
                  </External>
                  <External href={pin.directionsUrl} className={FOOTER_LINK}>
                    Directions
                  </External>
                </span>
              </li>
            ))}
            <li>
              <External href={HOW_TO_REACH_URL} className={FOOTER_LINK}>
                How to reach the campus
              </External>
            </li>
          </ul>
        </div>

        <div>
          <p className={FOOTER_LABEL}>Institute</p>
          <ul className="flex flex-col gap-2.5 text-[15px]">
            {SITE_LINKS.map((link) => (
              <li key={link.href}>
                <External href={link.href} className={FOOTER_LINK}>
                  {link.label}
                </External>
              </li>
            ))}
          </ul>
        </div>
      </Container>

      <div className="border-t border-white/15">
        <Container className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 py-5 text-[13.5px] text-on-ink-muted">
          <span>
            &copy; {instituteParts(new Date()).year} Indian Institute of Technology Palakkad. All rights
            reserved.
          </span>
          <span className="flex flex-wrap gap-x-5 gap-y-1">
            <Link href="/guidelines" className="text-on-ink-muted hover:text-white">
              Guidelines
            </Link>
            <Link href="/privacy" className="text-on-ink-muted hover:text-white">
              Privacy notice
            </Link>
            <Link href="/sign-in" className="text-on-ink-muted hover:text-white">
              Portal sign-in
            </Link>
          </span>
        </Container>
      </div>
    </footer>
  );
}
