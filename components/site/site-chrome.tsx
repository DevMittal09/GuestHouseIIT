import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Container, siteButton } from "@/components/site/site-ui";
import { NavBar, type NavItem } from "@/components/site/site-nav";
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

/** Dark strip above the header: the institute's address and switchboard. */
export function UtilityStrip() {
  return (
    <div className="bg-navy-dark text-[13.5px] text-[#d8dee9]">
      <Container className="flex flex-wrap items-center justify-between gap-x-[18px] gap-y-1 py-2">
        <a
          href={GUEST_HOUSE_MAP.openUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[#d8dee9] no-underline hover:text-white"
        >
          {INSTITUTE_CONTACT.addressLine}
        </a>
        <span>
          {INSTITUTE_CONTACT.phone} (Office) |{" "}
          <a href={`mailto:${INSTITUTE_CONTACT.email}`} className="text-gold hover:text-gold-hover">
            {INSTITUTE_CONTACT.email}
          </a>
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
    <Link href={href} className="flex min-w-0 flex-wrap items-center gap-x-5 gap-y-3 no-underline">
      <Image
        src="/IITPKD_NEW_LOGO.png"
        alt="IIT Palakkad"
        width={1912}
        height={1456}
        priority
        className={cn(
          // A stacked logo (emblem over the name), so it needs more height
          // than the old wide banner did for the name to stay legible.
          "w-auto max-w-full object-contain",
          compact ? "h-[clamp(44px,11vw,56px)]" : "h-[clamp(56px,14vw,76px)]"
        )}
      />
      <span className="block border-l border-[#dde1e8] pl-[clamp(12px,3vw,20px)]">
        <span
          className={cn(
            "block font-heading leading-[1.15] font-semibold text-navy",
            compact ? "text-[21px]" : "text-[25px]"
          )}
        >
          Guest House
        </span>
        <span className="mt-1 block text-xs tracking-[0.14em] text-[#5a6880] uppercase">
          {subtitle}
        </span>
      </span>
    </Link>
  );
}

export function ExternalSiteLink({ className }: { className?: string }) {
  return (
    <a
      href={INSTITUTE_WEBSITE}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "inline-flex items-center gap-2 rounded-[3px] border border-border-strong px-4 py-2.5 text-sm font-semibold text-navy no-underline transition-colors duration-150 hover:border-gold hover:text-gold-dark",
        className
      )}
    >
      IIT Palakkad Website <ArrowUpRight aria-hidden className="size-3.5" />
      <span className="sr-only">(opens in a new tab)</span>
    </a>
  );
}

export function SiteHeader({
  subtitle,
  portal,
}: {
  subtitle: string;
  /** Where the signed-in visitor's portal is, or null when signed out. */
  portal: { href: string; name: string } | null;
}) {
  return (
    <header className="border-b border-border bg-white">
      <Container className="flex flex-wrap items-center gap-5 py-[18px]">
        <BrandBlock subtitle={subtitle} />
        <div className="ml-auto flex flex-wrap items-center gap-3">
          {portal ? (
            <Link href={portal.href} className={cn(siteButton.navy, "px-4 py-2.5 text-sm")}>
              My portal
              <span className="sr-only">({portal.name})</span>
            </Link>
          ) : (
            <Link href="/sign-in" className={cn(siteButton.outline, "px-4 py-2.5 text-sm font-semibold")}>
              Sign in
            </Link>
          )}
          <ExternalSiteLink />
        </div>
      </Container>
    </header>
  );
}

export function SiteNav() {
  return <NavBar items={SITE_NAV} label="Main" />;
}

const FOOTER_LABEL = "mb-3 text-[11.5px] font-bold tracking-[0.16em] text-gold uppercase";

export function SiteFooter() {
  return (
    <footer className="bg-navy-dark text-footer-text">
      <Container className="grid grid-cols-[repeat(auto-fit,minmax(min(230px,100%),1fr))] gap-8 pt-10 pb-7">
        <div>
          <p className="mb-3 font-heading text-xl font-semibold text-white">IIT Palakkad Guest House</p>
          <p className="text-[15px] leading-[1.6]">
            Indian Institute of Technology Palakkad
            <br />
            Kanjikode | Palakkad
            <br />
            Kerala | Pin: 678623
          </p>
        </div>
        <div>
          <p className={FOOTER_LABEL}>Contact</p>
          <p className="text-[15px] leading-[1.7]">
            <a href={GUEST_HOUSE_CONTACT.phoneHref} className="text-footer-text hover:text-white">
              {GUEST_HOUSE_CONTACT.phone}
            </a>
            <br />
            <a href={`mailto:${GUEST_HOUSE_CONTACT.email}`} className="text-footer-text hover:text-white">
              {GUEST_HOUSE_CONTACT.email}
            </a>
            <br />
            <a
              href={GUEST_HOUSE_MAP.openUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-footer-text hover:text-white"
            >
              Find us on Google Maps
            </a>
          </p>
        </div>
        <div>
          <p className={FOOTER_LABEL}>Links</p>
          <ul className="flex flex-col gap-2 text-[15px]">
            {SITE_LINKS.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-footer-text hover:text-white"
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </Container>
      <div className="border-t border-white/15">
        <Container className="py-4 text-[13.5px] text-footer-muted">
          Copyright &copy;{instituteParts(new Date()).year} Indian Institute of Technology Palakkad. All
          Rights Reserved.
        </Container>
      </div>
    </footer>
  );
}
