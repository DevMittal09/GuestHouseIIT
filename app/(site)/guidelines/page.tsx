import type { Metadata } from "next";
import Link from "next/link";
import { ArrowDown } from "lucide-react";
import { Container, PageMasthead, siteButton } from "@/components/site/site-ui";
import { GUEST_HOUSE_CONTACT, GUIDELINES_PDF_URL, GUIDELINES_PROVISIONAL } from "@/lib/site";
import { guidelineSections, joinNames, type GuidelineSection } from "@/lib/site-content";
import { getSiteGuestHouses, getSitePolicies } from "@/lib/site-data";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Guidelines" };

/**
 * The page itself is rendered per request — the header greets whoever is
 * signed in — but everything it *says* comes from `lib/site-data.ts`, which
 * holds its answers for half an hour under the `site` cache tag, so a visitor
 * does not wait for a database round trip to read the guidelines (Phase 9).
 * `revalidateEverything()` drops that tag the moment a setting or a guest
 * house changes, so it is never stale in practice.
 */

/**
 * The rules as a numbered document, the way an institute publishes them:
 * sections and clauses a guest or an office can cite ("see 4.3"). Sections
 * 1–7 are the portal's own rules — who may book which guest house, who
 * approves, the advance window, the stay cap, capacity, meals, charges and
 * cancellation — rendered from `lib/` via `guidelineSections()`, so this page
 * cannot promise a rule the booking form does not apply. The house rules
 * (8, 9) are placeholders until the office confirms them
 * (`GUIDELINES_PROVISIONAL`).
 */
export default async function GuidelinesPage() {
  const [houses, policies] = await Promise.all([getSiteGuestHouses(), getSitePolicies()]);
  const sections = guidelineSections(houses, policies);
  const provisional = sections
    .map((section, i) => ({ section, number: i + 1 }))
    .filter(({ section }) => section.provisional);

  return (
    <>
      <PageMasthead
        title="Guest house guidelines"
        intro="The rules that apply to every stay: who may book, how a request is approved, occupancy, meals, charges, cancellation and conduct on the premises."
        aside={
          GUIDELINES_PDF_URL && (
            <a
              href={GUIDELINES_PDF_URL}
              target="_blank"
              rel="noopener noreferrer"
              className={siteButton.ink}
            >
              Download as PDF
              <ArrowDown aria-hidden className="size-4 text-saffron" />
              <span className="sr-only">(opens in a new tab)</span>
            </a>
          )
        }
      >
        {GUIDELINES_PROVISIONAL && provisional.length > 0 && (
          <p className="text-[14.5px] leading-[1.55] text-muted-foreground">
            <span className="font-semibold text-ink">Provisional edition.</span> Sections{" "}
            {joinNames(provisional.map(({ number }) => String(number)))} are awaiting confirmation
            by the Guest House Office; the rest are the rules the booking portal applies.
          </p>
        )}
      </PageMasthead>

      <Container className="grid gap-x-16 gap-y-10 pt-12 pb-24 lg:grid-cols-12">
        <nav aria-label="On this page" className="lg:col-span-3">
          <div className="lg:sticky lg:top-8">
            <p className="mb-3 text-[12px] font-bold tracking-[0.14em] text-muted-foreground uppercase">
              Contents
            </p>
            <ol className="grid grid-cols-[repeat(auto-fill,minmax(min(200px,100%),1fr))] gap-x-6 border-t border-ink lg:grid-cols-1">
              {sections.map((section, i) => (
                <li key={section.id} className="border-b border-border">
                  <a
                    href={`#${section.id}`}
                    className="flex gap-3 py-2.5 text-[15px] text-body hover:text-vermilion-deep"
                  >
                    <span className="w-5 shrink-0 text-muted-foreground tabular-nums">{i + 1}</span>
                    {section.title}
                  </a>
                </li>
              ))}
            </ol>
          </div>
        </nav>

        <div className="min-w-0 lg:col-span-9">
          {sections.map((section, i) => (
            <GuidelineBlock key={section.id} section={section} number={i + 1} />
          ))}

          <p className="mt-14 border-t border-ink pt-5 text-[15.5px] leading-[1.6] text-body">
            Questions about these guidelines go to the Guest House Office on{" "}
            <a href={GUEST_HOUSE_CONTACT.phoneHref} className="font-semibold text-ink tabular-nums">
              {GUEST_HOUSE_CONTACT.phone}
            </a>{" "}
            or{" "}
            <a
              href={`mailto:${GUEST_HOUSE_CONTACT.email}`}
              className="font-semibold text-ink underline decoration-vermilion decoration-2 underline-offset-[5px]"
            >
              {GUEST_HOUSE_CONTACT.email}
            </a>
            . How your details are handled is set out in the{" "}
            <Link
              href="/privacy"
              className="font-semibold text-ink underline decoration-vermilion decoration-2 underline-offset-[5px]"
            >
              privacy notice
            </Link>
            .
          </p>
        </div>
      </Container>
    </>
  );
}

function GuidelineBlock({ section, number }: { section: GuidelineSection; number: number }) {
  const headingId = `${section.id}-title`;
  return (
    <section
      id={section.id}
      aria-labelledby={headingId}
      className={cn("scroll-mt-6", number > 1 && "mt-14")}
    >
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2 border-t border-ink pt-5">
        <span className="font-heading text-[clamp(22px,2.4vw,28px)] font-semibold text-vermilion tabular-nums">
          {number}
        </span>
        <h2 id={headingId} className="text-[clamp(24px,2.6vw,30px)] leading-tight font-semibold text-ink">
          {section.title}
        </h2>
        {section.provisional && (
          <span className="rounded-[2px] border border-notice-border bg-notice px-2 py-0.5 text-[12px] font-semibold tracking-[0.04em] text-ink">
            To be confirmed
          </span>
        )}
      </div>

      <ol className="mt-3">
        {section.items.map((item, j) => (
          <li
            key={item}
            className="grid grid-cols-[2.75rem_1fr] gap-x-3 border-b border-border py-3.5 last:border-b-0"
          >
            <span className="pt-[3px] text-[13.5px] text-muted-foreground tabular-nums">
              {number}.{j + 1}
            </span>
            <span className="text-[16px] leading-[1.6] text-body">{item}</span>
          </li>
        ))}
      </ol>

      {section.routes && section.routes.length > 0 && (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full border-y border-ink text-left text-[15px]">
            <caption className="sr-only">Approval route for each category of requester</caption>
            <thead className="bg-band">
              <tr className="text-[12px] tracking-[0.12em] text-muted-foreground uppercase">
                <th scope="col" className="px-3 py-2.5 font-bold">
                  Requester
                </th>
                <th scope="col" className="px-3 py-2.5 font-bold">
                  Approved by, in order
                </th>
                <th scope="col" className="px-3 py-2.5 font-bold">
                  Guest houses
                </th>
              </tr>
            </thead>
            <tbody>
              {section.routes.map((route) => (
                <tr key={route.role} className="border-t border-border align-top">
                  <th scope="row" className="px-3 py-3 font-semibold text-ink">
                    {route.label}
                  </th>
                  <td className="px-3 py-3 text-body">
                    {route.approvers.map((name, i) => (
                      <span key={`${name}-${i}`}>
                        {i > 0 && (
                          <span aria-hidden className="px-1 text-vermilion">
                            →
                          </span>
                        )}
                        {i > 0 && <span className="sr-only">, then </span>}
                        {name}
                      </span>
                    ))}
                  </td>
                  <td className="px-3 py-3 text-body">{joinNames(route.guestHouses) || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
