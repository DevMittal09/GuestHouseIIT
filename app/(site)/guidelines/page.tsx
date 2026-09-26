import type { Metadata } from "next";
import Link from "next/link";
import { ArrowDown } from "lucide-react";
import { Container, Label, PageMasthead, siteButton } from "@/components/site/site-ui";
import { GUEST_HOUSE_CONTACT, GUIDELINES_PDF_URL, GUIDELINES_PROVISIONAL, PAGE_PHOTOS } from "@/lib/site";
import { BOOKING_STEPS, guidelineSections, joinNames, type GuidelineSection } from "@/lib/site-content";
import { getSiteGuestHouses } from "@/lib/site-data";
import { getRules } from "@/lib/settings-server";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Guidelines" };

/**
 * The page itself is rendered per request — the header greets whoever is
 * signed in — but what it *says* comes from the store and the office's
 * Settings, both cached (Phase 9), so a visitor does not wait for a database
 * round trip.
 */

/**
 * The guest house's rules, as a numbered document a guest or an office can
 * cite ("see 3.4"), opened by **How booking works** in five general steps.
 *
 * In general terms on purpose (26 Sep 2026, the owner): no requester
 * categories, no approval chains, no role names — who reviews a request is
 * the portal's business. Where a rule is stated (the advance window, the stay
 * cap, capacity, meal times, the kitchen's notice, charges) it comes from
 * `lib/` and Settings via `guidelineSections()`, so it cannot promise what the
 * booking form does not apply. The house rules (the last two sections) are
 * placeholders until the office confirms them (`GUIDELINES_PROVISIONAL`).
 */
export default async function GuidelinesPage() {
  const [houses, rules] = await Promise.all([getSiteGuestHouses(), getRules()]);
  const sections = guidelineSections(houses, rules);
  const provisional = sections
    .map((section, i) => ({ section, number: i + 1 }))
    .filter(({ section }) => section.provisional);

  return (
    <>
      <PageMasthead
        title="Guidelines"
        photo={PAGE_PHOTOS.guidelines}
        intro="How booking works, and what to expect before and during your stay."
        note={
          GUIDELINES_PROVISIONAL && provisional.length > 0 ? (
            <>
              <span className="font-semibold">Provisional edition.</span> Sections{" "}
              {joinNames(provisional.map(({ number }) => String(number)))} are awaiting confirmation
              by the Guest House Office.
            </>
          ) : undefined
        }
        aside={
          GUIDELINES_PDF_URL && (
            <a href={GUIDELINES_PDF_URL} target="_blank" rel="noopener noreferrer" className={siteButton.light}>
              Download as PDF
              <ArrowDown aria-hidden className="size-4 text-vermilion-deep" />
              <span className="sr-only">(opens in a new tab)</span>
            </a>
          )
        }
      />

      {/* ------------------------------------------------ how booking works */}
      <section aria-labelledby="how-title" className="border-b border-border bg-band">
        <Container className="py-[clamp(64px,8vw,112px)]">
          <Label>In five steps</Label>
          <h2
            id="how-title"
            className="mt-4 text-[clamp(30px,3.6vw,46px)] leading-[1.05] font-semibold tracking-[-0.02em] text-ink"
          >
            How booking works
          </h2>
          <ol className="mt-12 grid grid-cols-[repeat(auto-fit,minmax(min(180px,100%),1fr))] gap-x-8 gap-y-10">
            {BOOKING_STEPS.map((step, i) => (
              <li key={step.title} className="border-t border-ink pt-5">
                <span className="font-heading text-[40px] leading-none font-semibold text-vermilion tabular-nums">
                  {i + 1}
                </span>
                <h3 className="mt-4 text-[20px] font-semibold text-ink">{step.title}</h3>
                <p className="mt-2 text-[15px] leading-[1.6] text-body">{step.body}</p>
              </li>
            ))}
          </ol>
        </Container>
      </section>

      <Container className="grid gap-x-16 gap-y-10 pt-[clamp(56px,7vw,96px)] pb-24 lg:grid-cols-12">
        <nav aria-label="On this page" className="lg:col-span-3">
          <div className="lg:sticky lg:top-8">
            <p className="mb-3 text-[11.5px] font-semibold tracking-[0.22em] text-muted-foreground uppercase">
              Contents
            </p>
            <ol className="grid grid-cols-[repeat(auto-fill,minmax(min(200px,100%),1fr))] gap-x-6 border-t border-ink lg:grid-cols-1">
              {sections.map((section, i) => (
                <li key={section.id} className="border-b border-border">
                  <a
                    href={`#${section.id}`}
                    className="flex gap-3 py-2.5 text-[15px] text-body transition-colors duration-200 hover:text-vermilion-deep"
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

          <p className="mt-16 border-t border-ink pt-5 text-[15.5px] leading-[1.6] text-body">
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
    <section id={section.id} aria-labelledby={headingId} className={cn("scroll-mt-6", number > 1 && "mt-16")}>
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

      {section.timetable && (
        <table className="mt-5 w-full max-w-[520px] border-y border-ink">
          <caption className="sr-only">Meal serving times</caption>
          <tbody>
            {section.timetable.map((row) => (
              <tr key={row.meal} className="border-t border-border first:border-t-0">
                <th scope="row" className="py-3.5 text-left font-heading text-[21px] font-semibold text-ink">
                  {row.meal}
                </th>
                <td className="py-3.5 text-right text-[16px] text-body tabular-nums">{row.time}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
