import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ArrowUpRight } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { getCurrentUser } from "@/lib/auth";
import { SIGN_IN_PATH } from "@/lib/routes";
import { GUEST_HOUSE_CONTACT } from "@/lib/site";
import { BOOKING_STEPS, guidelineSections, type GuidelineSection } from "@/lib/site-content";
import { getSiteGuestHouses } from "@/lib/site-data";
import { getRules } from "@/lib/settings-server";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Guidelines" };

export default async function PortalGuidelinesPage() {
  const user = await getCurrentUser();
  if (!user) redirect(SIGN_IN_PATH);

  const [houses, rules] = await Promise.all([getSiteGuestHouses(), getRules()]);
  const sections = guidelineSections(houses, rules);
  const guidelinesUrl = rules.portal.guidelines_url.trim();

  return (
    <>
      <PageHeader title="Guidelines">
        How booking works, and what to expect before and during your stay.
      </PageHeader>

      {guidelinesUrl && (
        <div className="mt-4">
          <a
            href={guidelinesUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-vermilion-deep hover:underline"
          >
            Read the full guidelines
            <ArrowUpRight aria-hidden className="size-4" />
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        </div>
      )}

      <section className="mt-8">
        <h2 className="text-section font-semibold">How booking works</h2>
        <ol className="mt-4 grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-border-strong bg-border-strong sm:grid-cols-3 lg:grid-cols-5">
          {BOOKING_STEPS.map((step, i) => (
            <li key={step.title} className="bg-white p-6">
              <span className="block font-heading text-[34px] leading-none font-semibold text-vermilion tabular-nums">
                {String(i + 1).padStart(2, "0")}
              </span>
              <h3 className="mt-5 text-[20px] font-semibold">{step.title}</h3>
              <p className="mt-1.5 text-[14.5px] leading-[1.6] text-muted-foreground">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <div className="mt-10 grid gap-x-12 gap-y-8 lg:grid-cols-12">
        <nav aria-label="On this page" className="lg:col-span-3">
          <div className="lg:sticky lg:top-20">
            <p className="mb-2 text-xs font-semibold tracking-widest text-muted-foreground uppercase">
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
            <PortalGuidelineBlock key={section.id} section={section} number={i + 1} />
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
            .
          </p>
        </div>
      </div>
    </>
  );
}

function RuleRow({ item, number, index }: { item: string; number: number; index: number }) {
  return (
    <li className="grid grid-cols-[2.75rem_1fr] gap-x-3 border-b border-border py-3.5 last:border-b-0">
      <span className="pt-[3px] text-[13.5px] text-muted-foreground tabular-nums">
        {number}.{index + 1}
      </span>
      <span className="text-[16px] leading-[1.6] text-body">{item}</span>
    </li>
  );
}

function PortalGuidelineBlock({ section, number }: { section: GuidelineSection; number: number }) {
  const headingId = `${section.id}-title`;
  return (
    <section id={section.id} aria-labelledby={headingId} className={cn("scroll-mt-24", number > 1 && "mt-16")}>
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2 border-t border-ink pt-5">
        <span className="font-heading text-[clamp(22px,2.4vw,28px)] font-semibold text-vermilion tabular-nums">
          {number}
        </span>
        <h2 id={headingId} className="text-[clamp(24px,2.6vw,30px)] leading-tight font-semibold text-ink">
          {section.title}
        </h2>
      </div>

      {section.groups ? (
        <div className="mt-3">
          {section.groups.map((group, g) => (
            <div key={group.label} className={cn(g > 0 && "mt-8")}>
              <h3 className="text-[11.5px] font-semibold tracking-[0.22em] text-muted-foreground uppercase">
                {group.label}
              </h3>
              <ol className="mt-2">
                {group.items.map((item) => (
                  <RuleRow
                    key={item}
                    item={item}
                    number={number}
                    index={section.items.indexOf(item)}
                  />
                ))}
              </ol>
            </div>
          ))}
        </div>
      ) : (
        <ol className="mt-3">
          {section.items.map((item, j) => (
            <RuleRow key={item} item={item} number={number} index={j} />
          ))}
        </ol>
      )}

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
