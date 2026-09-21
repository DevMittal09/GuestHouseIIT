import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowDown,
  ArrowRight,
  CalendarClock,
  CalendarX2,
  HeartHandshake,
  Mail,
  Phone,
  ShieldCheck,
  UsersRound,
  UtensilsCrossed,
} from "lucide-react";
import { BulletList, Container, PageHero, siteButton } from "@/components/site/site-ui";
import { GUEST_HOUSE_CONTACT, GUIDELINES_PDF_URL, PHOTOS } from "@/lib/site";
import { guidelineCards } from "@/lib/site-content";
import { getSiteGuestHouses, getSitePolicies } from "@/lib/site-data";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Guidelines" };

/** Icons by card title; a card added to `guidelineCards()` later falls back to the shield. */
const ICONS: Record<string, typeof ShieldCheck> = {
  "Who can book": UsersRound,
  "Booking and approval": ShieldCheck,
  "Check-in and check-out": CalendarClock,
  Meals: UtensilsCrossed,
  Cancellation: CalendarX2,
  "During your stay": HeartHandshake,
};

/**
 * The rules, as the portal enforces them: who may book which guest house,
 * who approves, the advance window, meals and cancellation all come from
 * `lib/` via `guidelineCards()`, so this page cannot promise a rule the
 * booking form does not apply.
 */
export default async function GuidelinesPage() {
  const [houses, policies] = await Promise.all([getSiteGuestHouses(), getSitePolicies()]);
  const cards = guidelineCards(houses, policies);

  return (
    <>
      <PageHero
        eyebrow="Before you book"
        title="Guest house guidelines"
        photo={PHOTOS.walkway}
        intro={
          <>
            A summary of the rules that apply to all stays.
            {GUIDELINES_PDF_URL &&
              " The complete document, including tariffs and forms, is available to download."}
          </>
        }
      >
        {GUIDELINES_PDF_URL && (
          <a
            href={GUIDELINES_PDF_URL}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(siteButton.primary, "mt-8")}
          >
            Download the full guidelines (PDF)
            <ArrowDown aria-hidden className="size-4" />
          </a>
        )}
      </PageHero>

      <Container className="grid gap-8 py-[clamp(48px,7vw,96px)] lg:grid-cols-[1fr_320px]">
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(320px,100%),1fr))] gap-5">
          {cards.map((card, i) => {
            const Icon = ICONS[card.title] ?? ShieldCheck;
            return (
              <section
                key={card.title}
                aria-labelledby={`guideline-${i}`}
                className="reveal rounded-3xl bg-white p-[clamp(22px,3vw,32px)] shadow-soft ring-1 ring-border"
              >
                <div className="mb-5 flex items-center justify-between">
                  <span className="inline-flex size-12 items-center justify-center rounded-2xl bg-vermilion-soft text-vermilion-deep">
                    <Icon aria-hidden className="size-6" />
                  </span>
                  <span className="font-heading text-[34px] leading-none font-semibold text-border-strong">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                </div>
                <h2 id={`guideline-${i}`} className="mb-4 text-[24px] font-semibold text-foreground">
                  {card.title}
                </h2>
                <BulletList items={card.items} className="[&_li]:text-[15.5px]" />
              </section>
            );
          })}
        </div>

        <aside className="lg:sticky lg:top-28 lg:self-start">
          <div className="relative isolate overflow-hidden rounded-3xl bg-ink p-7 text-white">
            <div aria-hidden className="emblem-watermark absolute -right-16 -bottom-16 -z-10 size-56" />
            <p className="text-[11px] font-bold tracking-[0.18em] text-saffron uppercase">Tariffs and payment</p>
            <h2 className="mt-3 text-[26px] leading-tight font-semibold">Questions before you book?</h2>
            <p className="mt-3 text-[15px] leading-[1.6] text-white/70">
              For tariffs, payment and anything these guidelines do not cover, the guest house
              office will help.
            </p>
            <ul className="mt-6 space-y-3 text-[15px]">
              <li>
                <a href={GUEST_HOUSE_CONTACT.phoneHref} className="inline-flex items-center gap-2.5 text-white hover:text-saffron">
                  <Phone aria-hidden className="size-4 text-saffron" />
                  {GUEST_HOUSE_CONTACT.phone}
                </a>
              </li>
              <li>
                <a
                  href={`mailto:${GUEST_HOUSE_CONTACT.email}`}
                  className="inline-flex items-center gap-2.5 text-white hover:text-saffron"
                >
                  <Mail aria-hidden className="size-4 text-saffron" />
                  {GUEST_HOUSE_CONTACT.email}
                </a>
              </li>
            </ul>
            <Link href="/book-room" className={cn(siteButton.primary, "mt-7 w-full")}>
              Book a room <ArrowRight aria-hidden className="size-4" />
            </Link>
          </div>
        </aside>
      </Container>
    </>
  );
}
