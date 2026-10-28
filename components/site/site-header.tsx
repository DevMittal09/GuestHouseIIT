"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BrandBlock } from "@/components/site/brand";
import { NavBar, type NavItem } from "@/components/site/site-nav";
import { cn } from "@/lib/utils";

export const SITE_NAV: NavItem[] = [
  { href: "/", label: "Home" },
  { href: "/book-room", label: "Book a Room" },
  { href: "/book-meal", label: "Book a Meal" },
  { href: "/guidelines", label: "Guidelines" },
  { href: "/gallery", label: "Gallery" },
  { href: "/contact", label: "Contact Us" },
];

/**
 * The public site's masthead: the lockup, the six pages **centred**, and
 * Sign in / My portal.
 *
 * **One opaque charcoal bar, on every page** (27 Oct 2026, the owner: the
 * translucent one over the hero "looks too juvenile and translucent... make
 * it fully opaque, more refined, and professionally styled", and centre the
 * links). Three decisions follow from it:
 *
 * - **Charcoal, not white.** `#1A1A1A` is iitpkd.ac.in's own top-bar colour
 *   and the portal's masthead, so the public site and the signed-in service
 *   now open the same way, closed by the same vermilion rule and answered by
 *   the ink footer at the other end of the page. It is also the only opaque
 *   colour that can sit on a photograph without the page below it having to
 *   change: white over the hero would be a white slab across the top of a
 *   photograph, which is what the overlay was avoiding.
 * - **No scroll listener.** The translucent version had to turn solid once
 *   the reader left the photograph. An opaque bar is already legible over
 *   anything, so the colour never changes and the component keeps only
 *   `usePathname` - which `NavBar` needs regardless.
 * - **Still laid over the hero on `/`**, so the photograph fills the first
 *   viewport: `absolute` on a phone (it scrolls away with the hero) and
 *   `fixed` from `lg`, where it stays in reach. Everywhere else it is in the
 *   flow and sticky from `lg`, as it has been since 30 Sep 2026.
 */
export function SiteHeader({
  portal,
}: {
  /** Where the signed-in visitor's portal is, or null when signed out. */
  portal: { href: string; name: string } | null;
}) {
  const overHero = usePathname() === "/";

  const button =
    "inline-flex items-center rounded-md border border-white/45 px-4 py-2 text-[14px] font-semibold text-white transition-colors duration-200 hover:border-white hover:bg-white hover:text-ink";

  return (
    <header
      className={cn(
        "z-40 border-t-[3px] border-b-[3px] border-t-vermilion border-b-vermilion bg-ink",
        overHero ? "absolute inset-x-0 top-0 lg:fixed" : "lg:sticky lg:top-0"
      )}
    >
      {/* Three columns from `lg`, so the links sit in the middle of the bar
          and stay there whatever the lockup or the button beside them
          measure. Below `lg` the links move to their own scrolling row. */}
      <div className="mx-auto flex w-full max-w-[1240px] items-center gap-x-6 px-[clamp(16px,4vw,40px)] py-3 lg:grid lg:grid-cols-[1fr_auto_1fr]">
        <div className="min-w-0 flex-1 lg:flex-none">
          <BrandBlock tone="light" />
        </div>
        <NavBar items={SITE_NAV} label="Main" tone="ink" className="hidden lg:flex lg:justify-center" />
        <div className="shrink-0 lg:justify-self-end">
          {portal ? (
            <Link href={portal.href} className={button}>
              My portal
              <span className="sr-only">({portal.name})</span>
            </Link>
          ) : (
            <Link href="/sign-in" className={button}>
              Sign in
            </Link>
          )}
        </div>
      </div>
      <div className="border-t border-white/15 lg:hidden">
        <div className="mx-auto w-full max-w-[1240px] px-[clamp(6px,3vw,32px)] py-1.5">
          <NavBar items={SITE_NAV} label="Main" tone="ink" scroll />
        </div>
      </div>
    </header>
  );
}
