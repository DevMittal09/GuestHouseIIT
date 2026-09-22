import type { Metadata } from "next";
import Link from "next/link";
import { ArrowDown } from "lucide-react";
import { BulletList, Container, PageTitle, siteButton } from "@/components/site/site-ui";
import { GUIDELINES_PDF_URL } from "@/lib/site";
import { guidelineCards } from "@/lib/site-content";
import { getSiteGuestHouses, getSitePolicies } from "@/lib/site-data";

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
 * The rules, as the portal enforces them: who may book which guest house,
 * who approves, the advance window, meals and cancellation all come from
 * `lib/` via `guidelineCards()`, so this page cannot promise a rule the
 * booking form does not apply.
 */
export default async function GuidelinesPage() {
  const [houses, policies] = await Promise.all([getSiteGuestHouses(), getSitePolicies()]);

  return (
    <Container className="pt-11 pb-[88px]">
      <PageTitle
        intro={
          <>
            A summary of the rules that apply to all stays.
            {GUIDELINES_PDF_URL &&
              " The complete document, including tariffs and forms, is linked at the end of this page."}{" "}
            For tariffs and payment, please{" "}
            <Link href="/contact" className="font-semibold text-navy underline underline-offset-2 hover:text-gold-dark">
              contact the guest house office
            </Link>
            .
          </>
        }
      >
        Guest house guidelines
      </PageTitle>

      <div className="mt-8 grid grid-cols-[repeat(auto-fit,minmax(min(300px,100%),1fr))] gap-[18px]">
        {guidelineCards(houses, policies).map((card, i) => (
          <section
            key={card.title}
            aria-labelledby={`guideline-${i}`}
            className="rounded-[2px] border border-border bg-white px-[clamp(14px,4vw,24px)] pt-[26px] pb-[30px]"
          >
            <h2 id={`guideline-${i}`} className="mb-3.5 text-[21px] font-semibold text-navy">
              {card.title}
            </h2>
            <BulletList items={card.items} className="[&_li]:text-[15.5px]" />
          </section>
        ))}
      </div>

      {GUIDELINES_PDF_URL && (
        <a
          href={GUIDELINES_PDF_URL}
          target="_blank"
          rel="noopener noreferrer"
          className={`${siteButton.navy} mt-7 gap-3.5 px-[clamp(14px,4vw,24px)] py-[18px] text-[16.5px] font-semibold`}
        >
          Download the full guidelines (PDF)
          <ArrowDown aria-hidden className="size-4 text-gold" />
        </a>
      )}
    </Container>
  );
}
