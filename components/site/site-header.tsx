import Link from "next/link";
import { BrandBlock } from "@/components/site/brand";
import { NavBar, type NavItem } from "@/components/site/site-nav";

export const SITE_NAV: NavItem[] = [
  { href: "/", label: "Home" },
  { href: "/book-room", label: "Book a Room" },
  { href: "/book-meal", label: "Book Meal" },
  { href: "/guidelines", label: "Guidelines" },
  { href: "/gallery", label: "Gallery" },
  { href: "/contact", label: "Contact Us" },
];

/**
 * The public site's header: a white bar with the lockup, the six pages and
 * Sign in / My portal — sticky on wide screens, so the links stay in reach.
 * Below `lg` the links move to a second row that scrolls sideways inside
 * itself, so a phone gets one line of links rather than a block of them.
 * (For an afternoon on 26 Sep 2026 it lay transparent over a full-screen
 * photograph on `/`; the owner found that weird, and it is a plain bar again.)
 */
export function SiteHeader({
  portal,
}: {
  /** Where the signed-in visitor's portal is, or null when signed out. */
  portal: { href: string; name: string } | null;
}) {
  const button =
    "inline-flex items-center rounded-[6px] border border-ink px-4 py-2 text-[14px] font-semibold text-ink transition-colors duration-200 hover:bg-ink hover:text-white";

  return (
    <header className="z-40 border-b border-border bg-white lg:sticky lg:top-0">
      <div className="mx-auto flex w-full max-w-[1240px] items-center gap-x-6 px-[clamp(16px,4vw,40px)] py-3.5">
        <div className="min-w-0 flex-1 lg:flex-none">
          <BrandBlock />
        </div>
        <NavBar items={SITE_NAV} label="Main" tone="light" className="ml-auto hidden lg:block" />
        <div className="shrink-0 lg:pl-2">
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
      <div className="border-t border-border lg:hidden">
        <div className="mx-auto w-full max-w-[1240px] px-[clamp(6px,3vw,32px)]">
          <NavBar items={SITE_NAV} label="Main" tone="light" scroll />
        </div>
      </div>
    </header>
  );
}
