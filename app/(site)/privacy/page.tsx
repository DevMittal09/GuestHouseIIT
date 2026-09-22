import type { Metadata } from "next";
import Link from "next/link";
import { Container, PageTitle } from "@/components/site/site-ui";
import { GUEST_HOUSE_CONTACT } from "@/lib/site";
import { PRIVACY_NOTICE_VERSION } from "@/lib/security";
import { getRules } from "@/lib/settings-server";

export const metadata: Metadata = { title: "Privacy notice" };

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
          <a className="font-semibold text-navy underline underline-offset-2" href={`mailto:${GUEST_HOUSE_CONTACT.email}`}>
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
          <Link className="font-semibold text-navy underline underline-offset-2" href="/dashboard">
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
    <Container className="pt-11 pb-[88px]">
      <PageTitle intro="How the guest house portal handles the personal details you enter, under the Digital Personal Data Protection Act 2023.">
        Privacy notice
      </PageTitle>
      <p className="mt-4 text-[15px] text-muted-foreground">Version {PRIVACY_NOTICE_VERSION}</p>
      <div className="mt-8 space-y-7">
        {sections.map((section) => (
          <section key={section.heading}>
            <h2 className="mb-2 text-[21px] font-semibold text-navy">{section.heading}</h2>
            <p className="text-[16px] leading-[1.6] text-body">{section.body}</p>
          </section>
        ))}
      </div>
    </Container>
  );
}
