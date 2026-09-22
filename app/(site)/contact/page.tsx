import type { Metadata } from "next";
import Link from "next/link";
import { Container, Eyebrow, PageTitle } from "@/components/site/site-ui";
import { GUEST_HOUSE_CONTACT, GUEST_HOUSE_MAP } from "@/lib/site";

export const metadata: Metadata = { title: "Contact us" };

/**
 * The page itself is rendered per request — the header greets whoever is
 * signed in — but everything it *says* comes from `lib/site-data.ts`, which
 * holds its answers for half an hour under the `site` cache tag, so a visitor
 * does not wait for a database round trip to read the guidelines (Phase 9).
 * `revalidateEverything()` drops that tag the moment a setting or a guest
 * house changes, so it is never stale in practice.
 */

const LINK = "font-semibold text-navy underline underline-offset-2 hover:text-gold-dark";

export default function ContactPage() {
  return (
    <Container className="pt-11 pb-[88px]">
      <PageTitle className="mb-4">Contact us</PageTitle>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(300px,100%),1fr))] items-start gap-9">
        <div className="flex min-w-0 flex-col gap-6">
          <div>
            <Eyebrow className="mb-2">Address</Eyebrow>
            <address className="text-[16.5px] leading-[1.6] text-navy not-italic">
              {GUEST_HOUSE_CONTACT.address.map((line) => (
                <span key={line} className="block">
                  {line}
                </span>
              ))}
            </address>
          </div>
          <div>
            <Eyebrow className="mb-2">Front office</Eyebrow>
            <p className="text-[16.5px] leading-[1.6]">
              <a href={GUEST_HOUSE_CONTACT.phoneHref} className={LINK}>
                {GUEST_HOUSE_CONTACT.phone}
              </a>
            </p>
          </div>
          <div>
            <Eyebrow className="mb-2">Email</Eyebrow>
            <p className="text-[16.5px] leading-[1.6]">
              <a href={`mailto:${GUEST_HOUSE_CONTACT.email}`} className={LINK}>
                {GUEST_HOUSE_CONTACT.email}
              </a>
            </p>
          </div>
          <div>
            <Eyebrow className="mb-2">Bookings</Eyebrow>
            <p className="text-[16.5px] leading-[1.6] text-body">
              Rooms and meals are requested through the{" "}
              <Link href="/book-room" className={LINK}>
                booking pages
              </Link>{" "}
              on this site. Telephone bookings are not taken.
            </p>
          </div>
        </div>

        <section
          aria-labelledby="map-heading"
          className="min-w-0 overflow-hidden rounded-[2px] border border-border bg-band"
        >
          <h2 id="map-heading" className="sr-only">
            Location
          </h2>
          <iframe
            title={GUEST_HOUSE_MAP.title}
            src={GUEST_HOUSE_MAP.embedUrl}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            className="block h-[clamp(280px,60vw,420px)] w-full border-0"
          />
          <div className="flex flex-wrap gap-x-6 gap-y-2 border-t border-border bg-white px-4 py-[13px] text-[14.5px]">
            <a href={GUEST_HOUSE_MAP.openUrl} target="_blank" rel="noopener noreferrer" className={LINK}>
              Open in Google Maps
            </a>
            <a href={GUEST_HOUSE_MAP.directionsUrl} target="_blank" rel="noopener noreferrer" className={LINK}>
              Get directions
            </a>
          </div>
        </section>
      </div>
    </Container>
  );
}
