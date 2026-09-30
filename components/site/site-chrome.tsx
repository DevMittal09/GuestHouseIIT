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
    <footer className="border-t-[5px] border-vermilion bg-ink text-on-ink">
      {/* The most common wrong door, answered before anything else: lecture
          halls and meeting rooms are not booked here. */}
      <Container className="pt-12">
        <div className="grid items-center gap-x-10 gap-y-6 rounded-lg border border-white/15 bg-ink-soft px-[clamp(20px,3.5vw,40px)] py-[clamp(22px,3vw,32px)] lg:grid-cols-12">
          <div className="min-w-0 border-l-4 border-saffron pl-5 lg:col-span-8">
            <p className="text-[11px] font-semibold tracking-[0.22em] text-saffron uppercase">
              Lecture halls and meeting rooms
            </p>
            <p className="mt-2 font-heading text-[clamp(20px,2.3vw,27px)] leading-snug font-semibold text-white">
              Booking a lecture hall or meeting room?
            </p>
            <p className="mt-1.5 max-w-[60ch] text-[15px] leading-[1.55] text-on-ink">
              Those are reserved on the institute&rsquo;s Meeting Room Booking System, not here.
            </p>
          </div>
          <div className="lg:col-span-4 lg:text-right">
            <a href={MRBS_URL} target="_blank" rel="noopener noreferrer" className={siteButton.light}>
              Open MRBS
              <ArrowUpRight aria-hidden className="size-4" />
              <span className="sr-only">(opens in a new tab)</span>
            </a>
          </div>
        </div>
      </Container>

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
