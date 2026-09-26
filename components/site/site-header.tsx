"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BrandBlock } from "@/components/site/brand";
import { NavBar, type NavItem } from "@/components/site/site-nav";
import { cn } from "@/lib/utils";

export const SITE_NAV: NavItem[] = [
  { href: "/", label: "Home" },
  { href: "/book-room", label: "Book a Room" },
  { href: "/book-meal", label: "Book Meal" },
  { href: "/guidelines", label: "Guidelines" },
  { href: "/gallery", label: "Gallery" },
  { href: "/contact", label: "Contact Us" },
];

const GUTTER = "px-[clamp(16px,4vw,40px)]";

/**
 * The public site's header: the lockup, the six pages and Sign in / My portal.
 *
 * On the home page it lies **over the photograph**, transparent, in white —
 * the page opens on the picture rather than on a white bar. Everywhere else it
 * is a white bar with a hairline. A client component only to read the path.
 * Below `lg` the links move to a second row that scrolls sideways inside
 * itself, so a phone gets one line of links rather than a block of them.
 */
export function SiteHeader({
  portal,
}: {
  /** Where the signed-in visitor's portal is, or null when signed out. */
  portal: { href: string; name: string } | null;
}) {
  const overlay = usePathname() === "/";
  const tone = overlay ? "overlay" : "light";
  const button = cn(
    "inline-flex items-center rounded-[3px] border px-4 py-2 text-[14px] font-semibold transition-colors duration-200",
    overlay
      ? "border-white/70 text-white hover:border-white hover:bg-white hover:text-ink"
      : "border-ink text-ink hover:bg-ink hover:text-white"
  );

  return (
    <header
      className={cn(
        "z-30",
        overlay ? "absolute inset-x-0 top-0" : "relative border-b border-border bg-white"
      )}
    >
      <div className={cn("mx-auto flex w-full max-w-[1240px] items-center gap-x-6 py-4 lg:py-5", GUTTER)}>
        <div className="min-w-0 flex-1 lg:flex-none">
          <BrandBlock tone={overlay ? "light" : "dark"} />
        </div>
        <NavBar items={SITE_NAV} label="Main" tone={tone} className="ml-auto hidden lg:block" />
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
      <div className={cn("border-t lg:hidden", overlay ? "border-white/20" : "border-border")}>
        <div className={cn("mx-auto w-full max-w-[1240px]", "px-[clamp(6px,3vw,32px)]")}>
          <NavBar items={SITE_NAV} label="Main" tone={tone} scroll />
        </div>
      </div>
    </header>
  );
}
