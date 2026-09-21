import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, Mail, MapPin, Phone } from "lucide-react";
import { Container, siteButton } from "@/components/site/site-ui";
import { MobileMenu, NavLinks, type NavItem } from "@/components/site/site-nav";
import {
  GUEST_HOUSE_CONTACT,
  GUEST_HOUSE_MAP,
  INSTITUTE_CONTACT,
  INSTITUTE_WEBSITE,
  SITE_LINKS,
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

/** Ink strip above the header — iitpkd.ac.in's own top bar colour. */
export function UtilityStrip() {
  return (
    <div className="bg-ink text-[13px] text-white/70">
      <Container className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1.5 py-2.5">
        <a
          href={GUEST_HOUSE_MAP.openUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 text-white/70 transition-colors hover:text-white"
        >
          <MapPin aria-hidden className="size-3.5 text-saffron" />
          {INSTITUTE_CONTACT.addressLine}
        </a>
        <span className="flex flex-wrap items-center gap-x-5 gap-y-1">
          <a
            href={`tel:${INSTITUTE_CONTACT.phone.replace(/\s+/g, "")}`}
            className="inline-flex items-center gap-2 text-white/70 transition-colors hover:text-white"
          >
            <Phone aria-hidden className="size-3.5 text-saffron" />
            {INSTITUTE_CONTACT.phone} <span className="text-white/45">(Office)</span>
          </a>
          <a
            href={`mailto:${INSTITUTE_CONTACT.email}`}
            className="hidden items-center gap-2 text-white/70 transition-colors hover:text-white sm:inline-flex"
          >
            <Mail aria-hidden className="size-3.5 text-saffron" />
            {INSTITUTE_CONTACT.email}
          </a>
          <a
            href={INSTITUTE_WEBSITE}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-semibold text-white transition-colors hover:text-saffron"
          >
            iitpkd.ac.in <ArrowUpRight aria-hidden className="size-3.5" />
            <span className="sr-only">(IIT Palakkad website, opens in a new tab)</span>
          </a>
        </span>
      </Container>
    </div>
  );
}

/**
 * The institute logo beside "Guest House" and a small-caps subtitle — the
 * guest house names, read from the store.
 */
export function BrandBlock({ subtitle, href = "/" }: { subtitle: string; href?: string }) {
  return (
    <Link href={href} className="flex min-w-0 items-center gap-[clamp(10px,2vw,18px)]">
      <Image
        src="/IITPKD_NEW_LOGO.png"
        alt="IIT Palakkad"
        width={1912}
        height={1456}
        loading="eager"
        // A stacked logo (emblem over the name), so it needs more height than
        // the old wide banner did for the name to stay legible.
        className="h-[clamp(46px,8vw,62px)] w-auto object-contain"
      />
      <span className="hidden border-l border-border pl-[clamp(10px,2vw,18px)] sm:block">
        <span className="block font-heading text-[22px] leading-[1.1] font-semibold text-foreground">
          Guest House
        </span>
        <span className="mt-1 block text-[10.5px] font-semibold tracking-[0.16em] whitespace-nowrap text-muted-foreground uppercase">
          {subtitle}
        </span>
      </span>
    </Link>
  );
}

/**
 * Sticky, frosted header: brand, the site's pages inline on wide screens (a
 * slide-over menu below that), sign-in or "My portal", and the booking CTA.
 */
export function SiteHeader({
  subtitle,
  portal,
}: {
  subtitle: string;
  /** Where the signed-in visitor's portal is, or null when signed out. */
  portal: { href: string; name: string } | null;
}) {
  const account = portal
    ? { href: portal.href, label: "My portal" }
    : { href: "/sign-in", label: "Sign in" };

  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-white/85 backdrop-blur-xl backdrop-saturate-150">
      <Container className="flex h-[clamp(68px,9vw,84px)] items-center gap-4">
        <BrandBlock subtitle={subtitle} />
        <NavLinks items={SITE_NAV} label="Main" className="ml-auto hidden xl:block" />
        <div className="ml-auto flex items-center gap-2.5 xl:ml-4">
          <Link
            href={account.href}
            className="hidden rounded-full px-4 py-2.5 text-[14px] font-semibold text-foreground transition-colors hover:bg-band md:inline-flex"
          >
            {account.label}
            {portal && <span className="sr-only">({portal.name})</span>}
          </Link>
          <Link href="/book-room" className={cn(siteButton.primary, "hidden min-h-11 px-5 text-[14px] sm:inline-flex")}>
            Book a stay
          </Link>
          <MobileMenu
            items={SITE_NAV}
            className="xl:hidden"
            actions={[
              { href: "/book-room", label: "Book a stay", primary: true },
              account,
            ]}
          />
        </div>
      </Container>
    </header>
  );
}

const FOOTER_LABEL = "mb-4 text-[11px] font-bold tracking-[0.18em] text-saffron uppercase";
const FOOTER_LINK = "text-white/70 transition-colors hover:text-white";

export function SiteFooter() {
  return (
    <footer className="relative isolate overflow-hidden bg-ink text-white/70">
      <div
        aria-hidden
        className="emblem-watermark absolute -right-24 -bottom-32 -z-10 size-[520px]"
      />
      <Container className="grid grid-cols-[repeat(auto-fit,minmax(min(210px,100%),1fr))] gap-x-10 gap-y-10 pt-16 pb-12">
        <div className="min-w-0">
          <div className="mb-5 flex items-center gap-3">
            <Image src="/iitpkd-logo.png" alt="" width={44} height={44} className="size-11" />
            <p className="font-heading text-[22px] leading-tight font-semibold text-white">
              IIT Palakkad
              <br />
              Guest House
            </p>
          </div>
          <address className="text-[14.5px] leading-[1.7] not-italic">
            {GUEST_HOUSE_CONTACT.address.map((line) => (
              <span key={line} className="block">
                {line}
              </span>
            ))}
          </address>
        </div>
        <div>
          <p className={FOOTER_LABEL}>Contact</p>
          <ul className="flex flex-col gap-3 text-[14.5px]">
            <li>
              <a href={GUEST_HOUSE_CONTACT.phoneHref} className={cn(FOOTER_LINK, "inline-flex items-center gap-2.5")}>
                <Phone aria-hidden className="size-4 text-saffron" />
                {GUEST_HOUSE_CONTACT.phone}
              </a>
            </li>
            <li>
              <a
                href={`mailto:${GUEST_HOUSE_CONTACT.email}`}
                className={cn(FOOTER_LINK, "inline-flex items-center gap-2.5")}
              >
                <Mail aria-hidden className="size-4 text-saffron" />
                {GUEST_HOUSE_CONTACT.email}
              </a>
            </li>
            <li>
              <a
                href={GUEST_HOUSE_MAP.openUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(FOOTER_LINK, "inline-flex items-center gap-2.5")}
              >
                <MapPin aria-hidden className="size-4 text-saffron" />
                Find us on Google Maps
              </a>
            </li>
          </ul>
        </div>
        <div>
          <p className={FOOTER_LABEL}>Explore</p>
          <ul className="flex flex-col gap-2.5 text-[14.5px]">
            {SITE_NAV.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className={FOOTER_LINK}>
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className={FOOTER_LABEL}>Institute</p>
          <ul className="flex flex-col gap-2.5 text-[14.5px]">
            {SITE_LINKS.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(FOOTER_LINK, "inline-flex items-center gap-1")}
                >
                  {link.label}
                  <ArrowUpRight aria-hidden className="size-3.5 opacity-60" />
                  <span className="sr-only">(opens in a new tab)</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      </Container>
      <div className="border-t border-ink-line">
        <Container className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 py-5 text-[13px] text-white/50">
          <span>
            &copy; {instituteParts(new Date()).year} Indian Institute of Technology Palakkad. All rights
            reserved.
          </span>
          <span className="inline-flex items-center gap-2">
            <span aria-hidden className="h-px w-6 bg-gradient-to-r from-vermilion to-saffron" />
            Nurturing Minds For a Better World
          </span>
        </Container>
      </div>
    </footer>
  );
}
