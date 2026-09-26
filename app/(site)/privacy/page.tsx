import type { Metadata } from "next";
import Link from "next/link";
import { Container, PageMasthead } from "@/components/site/site-ui";
import { GUEST_HOUSE_CONTACT } from "@/lib/site";
import { PRIVACY_NOTICE_VERSION } from "@/lib/security";
import { getRules } from "@/lib/settings-server";

export const metadata: Metadata = { title: "Privacy notice" };

/**
 * The page itself is rendered per request — the header greets whoever is
 * signed in — but everything it *says* comes from `lib/site-data.ts`, which
 * holds its answers for half an hour under the `site` cache tag, so a visitor
 * does not wait for a database round trip to read the guidelines (Phase 9).
 * `revalidateEverything()` drops that tag the moment a setting or a guest
 * house changes, so it is never stale in practice.
 */

/**
 * The privacy notice the booking form asks people to agree to (Phase 8,
 * Digital Personal Data Protection Act 2023).
 *
 * The retention period is read from Settings rather than written here, so the
 * notice cannot promise something the retention job does not do. Its version
 * is `PRIVACY_NOTICE_VERSION`, stored on every booking that consented to it —
 * bump that when this page changes materially.
 */
export default async function PrivacyPage() {
  const { privacy } = await getRules();
  const years = Math.round((privacy.id_retention_days / 365) * 10) / 10;

  const sections: { heading: string; body: React.ReactNode }[] = [
    {
      heading: "Who holds your details",
      body: (
        <>
          The Guest House Office, Indian Institute of Technology Palakkad, Kanjikode West, Palakkad,
          Kerala 678623. Questions about this notice go to{" "}
          <a className="font-semibold text-ink underline decoration-vermilion decoration-2 underline-offset-[5px]" href={`mailto:${GUEST_HOUSE_CONTACT.email}`}>
            {GUEST_HOUSE_CONTACT.email}
          </a>
          .
        </>
      ),
    },
    {
      heading: "What is collected, and why",
      body: (
        <>
          Your name, institute email address and department, so the request can be routed to whoever
          approves it. Each guest&apos;s name, age, gender, relationship to you and citizenship, so the
          right room can be allocated. An identity number and a photograph of an identity document
          for adult guests, because the guest house has to be able to say who stayed. Meal choices,
          so the kitchen can cook. Nothing is collected for advertising, and nothing is sold.
        </>
      ),
    },
    {
      heading: "Who can see it",
      body: (
        <>
          The approvers in your booking&apos;s own chain — your warden, faculty advisor, HOD or the IAR
          Office as the case may be — the Guest House Manager and the reception desk, and portal
          developers maintaining the system. Identity numbers are shown as their last four digits;
          the documents themselves open through a link that lasts five minutes and every view is
          recorded. Invoices for official bookings are sent to the accounts section.
        </>
      ),
    },
    {
      heading: "How long it is kept",
      body: (
        <>
          Identity numbers and uploaded identity documents are erased{" "}
          <strong>{privacy.id_retention_days} days</strong> ({years} years) after a stay ends, by an
          automatic job. The booking record itself — who stayed, when, in which room and what it cost
          — is kept as the guest house&apos;s own record and for audit. Security logs are kept for at
          least 180 days, as required for incident reporting.
        </>
      ),
    },
    {
      heading: "Your rights",
      body: (
        <>
          You can download everything the portal holds about you from{" "}
          <Link className="font-semibold text-ink underline decoration-vermilion decoration-2 underline-offset-[5px]" href="/dashboard">
            My Bookings
          </Link>
          , and ask from the same page for it to be erased. The office answers each request; where a
          record must be kept for audit, it will say so. You may also correct anything wrong by
          contacting the office.
        </>
      ),
    },
    {
      heading: "Security",
      body: (
        <>
          Identity numbers are encrypted where they are stored. Sign-in is through the institute
          directory or your institute Google account; sessions end after 30 minutes of inactivity and
          always within 12 hours. Uploads are checked and stripped of camera metadata such as the
          location a photograph was taken.
        </>
      ),
    },
  ];

  return (
    <>
      <PageMasthead
        title="Privacy notice"
        intro="How the guest house portal handles the personal details you enter, under the Digital Personal Data Protection Act 2023."
      >
        <p className="text-[14.5px] text-muted-foreground">Version {PRIVACY_NOTICE_VERSION}</p>
      </PageMasthead>
      <Container className="pt-12 pb-24">
        <div className="max-w-[72ch]">
          {sections.map((section, i) => (
            <section key={section.heading} className={i > 0 ? "mt-10" : undefined}>
              <h2 className="mb-3 border-t border-ink pt-4 text-[clamp(22px,2.4vw,26px)] font-semibold text-ink">
                {section.heading}
              </h2>
              <p className="text-[16.5px] leading-[1.65] text-body">{section.body}</p>
            </section>
          ))}
        </div>
      </Container>
    </>
  );
}
