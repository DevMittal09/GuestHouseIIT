import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLink, Container, Label, PageMasthead } from "@/components/site/site-ui";
import { GuestHouseMap } from "@/components/site/guest-house-map";
import { GUEST_HOUSE_CONTACT, guestHouseMapPins, HOW_TO_REACH_URL, MRBS_URL } from "@/lib/site";
import { getSiteGuestHouses } from "@/lib/site-data";

export const metadata: Metadata = { title: "Contact us" };

/**
 * The page itself is rendered per request — the header greets whoever is
 * signed in — but everything it *says* comes from `lib/site-data.ts`, which
 * holds its answers for half an hour under the `site` cache tag, so a visitor
 * does not wait for a database round trip to read the guidelines (Phase 9).
 * `revalidateEverything()` drops that tag the moment a setting or a guest
 * house changes, so it is never stale in practice.
 *
 * The map offers each guest house that has a pin in `GUEST_HOUSE_LOCATIONS`
 * (lib/site.ts), under the name the store gives it.
 */

const LINK = "font-semibold text-ink underline decoration-vermilion decoration-2 underline-offset-[5px] hover:text-vermilion-deep";

export default async function ContactPage() {
  const houses = await getSiteGuestHouses();
  const pins = guestHouseMapPins(houses.map((h) => h.name));

  return (
    <>
      <PageMasthead
        title="Contact us"
        intro="The Guest House Office answers questions about stays, meals and invoices by phone and email. Rooms and meals themselves are requested online."
      />

      <Container className="grid gap-x-14 gap-y-12 pt-12 pb-24 lg:grid-cols-12">
        <div className="flex min-w-0 flex-col lg:col-span-4">
          <div className="border-t border-ink pt-4">
            <Label>Front office</Label>
            <a
              href={GUEST_HOUSE_CONTACT.phoneHref}
              className="mt-2 block font-heading text-[clamp(26px,3vw,32px)] font-semibold text-ink tabular-nums hover:text-vermilion-deep"
            >
              {GUEST_HOUSE_CONTACT.phone}
            </a>
          </div>
          <div className="mt-8 border-t border-border pt-4">
            <Label>Email</Label>
            <a href={`mailto:${GUEST_HOUSE_CONTACT.email}`} className={`mt-2 inline-block text-[18px] ${LINK}`}>
              {GUEST_HOUSE_CONTACT.email}
            </a>
          </div>
          <div className="mt-8 border-t border-border pt-4">
            <Label>Address</Label>
            <address className="mt-2 text-[16.5px] leading-[1.6] text-ink not-italic">
              {GUEST_HOUSE_CONTACT.address.map((line) => (
                <span key={line} className="block">
                  {line}
                </span>
              ))}
            </address>
          </div>
          <div className="mt-8 border-t border-border pt-4">
            <Label>Bookings</Label>
            <p className="mt-2 text-[16px] leading-[1.6] text-body">
              Rooms and meals are requested through the{" "}
              <Link href="/book-room" className={LINK}>
                booking pages
              </Link>{" "}
              on this site; telephone bookings are not taken. Lecture halls and meeting rooms are
              booked on the institute&rsquo;s{" "}
              <a href={MRBS_URL} target="_blank" rel="noopener noreferrer" className={LINK}>
                Room Booking System (MRBS)
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
              .
            </p>
          </div>
        </div>

        <section aria-labelledby="map-heading" className="min-w-0 lg:col-span-8">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
            <h2 id="map-heading" className="text-[clamp(26px,3vw,34px)] leading-tight font-semibold text-ink">
              Finding the guest houses
            </h2>
            <ArrowLink href={HOW_TO_REACH_URL} external>
              How to reach the campus
            </ArrowLink>
          </div>
          <GuestHouseMap pins={pins} />
        </section>
      </Container>
    </>
  );
}
