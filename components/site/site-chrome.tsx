import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { BrandBlock } from "@/components/site/brand";
import { Container, siteButton } from "@/components/site/site-ui";
import { GUEST_HOUSE_CONTACT, HOW_TO_REACH_URL, MRBS_URL, SITE_LINKS, type MapPin } from "@/lib/site";
import { instituteParts } from "@/lib/tz";
import { cn } from "@/lib/utils";

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

const FOOTER_LABEL = "mb-4 text-[11px] font-semibold tracking-[0.22em] text-saffron uppercase";
const FOOTER_LINK = "text-on-ink transition-colors duration-200 hover:text-white";

/**
 * The charcoal footer: first a line for the most common wrong door — lecture
 * halls and meeting rooms are booked on MRBS — then the lockup and address,
 * the front office, each guest house's map and directions, and the
 * institute's links.
 */
export function SiteFooter({ pins }: { pins: MapPin[] }) {
  return (
    <footer className="bg-ink text-on-ink">
      <div className="border-b border-white/10">
        <Container className="flex flex-wrap items-center justify-between gap-x-10 gap-y-4 py-7">
          <p className="max-w-[62ch] text-[15.5px] leading-[1.55]">
            <span className="font-semibold text-white">Booking a lecture hall or meeting room?</span>{" "}
            Those are reserved on the institute&rsquo;s Meeting Room Booking System.
          </p>
          <a
            href={MRBS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(siteButton.outlineLight, "px-5 py-2.5 text-[14px]")}
          >
            Open MRBS
            <ArrowUpRight aria-hidden className="size-4" />
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        </Container>
      </div>

      <Container className="grid grid-cols-[repeat(auto-fit,minmax(min(210px,100%),1fr))] gap-x-10 gap-y-12 pt-16 pb-14">
        <div>
          <BrandBlock tone="light" />
          <address className="mt-6 text-[14.5px] leading-[1.7] not-italic">
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
              className="font-heading text-[20px] font-semibold text-white tabular-nums hover:text-saffron"
            >
              {GUEST_HOUSE_CONTACT.phone}
            </a>
            <br />
            <a href={`mailto:${GUEST_HOUSE_CONTACT.email}`} className={FOOTER_LINK}>
              {GUEST_HOUSE_CONTACT.email}
            </a>
          </p>
        </div>

        <div>
          <p className={FOOTER_LABEL}>Find us</p>
          <ul className="flex flex-col gap-3 text-[15px]">
            {pins.map((pin) => (
              <li key={pin.slug}>
                <span className="block text-white">{pin.name}</span>
                <span className="flex flex-wrap gap-x-4 text-[14px]">
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

      <div className="border-t border-white/10">
        <Container className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 py-5 text-[13px] text-on-ink-muted">
          <span>
            &copy; {instituteParts(new Date()).year} Indian Institute of Technology Palakkad
          </span>
          <span className="flex flex-wrap gap-x-5 gap-y-1">
            <Link href="/guidelines" className="text-on-ink-muted hover:text-white">
              Guidelines
            </Link>
            <Link href="/contact" className="text-on-ink-muted hover:text-white">
              Contact
            </Link>
            <Link href="/privacy" className="text-on-ink-muted hover:text-white">
              Privacy notice
            </Link>
          </span>
        </Container>
      </div>
    </footer>
  );
}
